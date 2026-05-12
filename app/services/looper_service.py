"""T2512 — Multi-track looper service (Python facade).

Thin Python wrapper around the engine's looper bindings. The engine
owns the audio storage + the RT-safe state machine; this service
just exposes operator-friendly verbs over HTTP + WebSocket.

The looper sits AFTER the plugin graph in the audio callback. Each
track captures the engine's post-FX output when recording or
overdubbing; on playback it sums its loop content back into the
buffer before the output stage.

v1 ship scope (operator-locked 2026-05-11):
  - 4 parallel tracks.
  - Up to 60 s per track loop length.
  - Overdub.
  - 4-deep undo/redo per track.
  - Per-track volume / mute / solo / reverse / half-speed.
  - Master volume.
  - WebSocket status broadcast on the `looper:status` topic.

Out-of-scope features that surface as gated-with-reason in the UI
and are filed as separate worklist tasks: time-stretching,
loop slicing, per-track EQ/reverb, MIDI clock in/out sync,
USB/DAW integration, auto-record threshold start, preset/loop
storage browser UI, true-bypass switching (operator decides during
follow-on review of the signal-path placement).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


logger = logging.getLogger(__name__)

LOOPER_STATUS_TOPIC = "looper:status"


class TrackState(int, Enum):
    """Matches the C++ enum class TrackState in LooperTrack.h."""

    EMPTY       = 0
    RECORDING   = 1
    PLAYING     = 2
    OVERDUBBING = 3
    STOPPED     = 4

    @property
    def label(self) -> str:
        return {
            TrackState.EMPTY:       "empty",
            TrackState.RECORDING:   "recording",
            TrackState.PLAYING:     "playing",
            TrackState.OVERDUBBING: "overdubbing",
            TrackState.STOPPED:     "stopped",
        }[self]


@dataclass(frozen=True)
class TrackStatus:
    track:               int
    state:               TrackState
    state_label:         str
    loop_length_frames:  int
    playhead_frames:     int
    layer_count:         int
    level_db:            float
    muted:               bool
    soloed:              bool
    reverse:             bool
    half_speed:          bool
    locked:              bool = False  # T2512-LOCK — write-lock toggle

    def to_payload(self) -> dict[str, Any]:
        return {
            "track":              self.track,
            "state":              int(self.state),
            "state_label":        self.state_label,
            "loop_length_frames": self.loop_length_frames,
            "playhead_frames":    self.playhead_frames,
            "layer_count":        self.layer_count,
            "level_db":           self.level_db,
            "muted":              self.muted,
            "soloed":             self.soloed,
            "reverse":            self.reverse,
            "half_speed":         self.half_speed,
            "locked":             self.locked,
        }


@dataclass(frozen=True)
class LooperStatus:
    tracks:             list[TrackStatus]
    active_track_count: int
    sync_master:        bool
    master_level_db:    float

    def to_payload(self) -> dict[str, Any]:
        return {
            "tracks":             [t.to_payload() for t in self.tracks],
            "active_track_count": self.active_track_count,
            "sync_master":        self.sync_master,
            "master_level_db":    self.master_level_db,
        }


class LooperServiceError(RuntimeError):
    def __init__(self, *, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _validate_track(track: int) -> None:
    if not isinstance(track, int) or track < 0 or track > 3:
        raise LooperServiceError(
            code="invalid_track",
            message=f"track must be int 0..3 (got {track!r})",
        )


def _status_from_engine_dict(payload: dict[str, Any]) -> LooperStatus:
    tracks: list[TrackStatus] = []
    for entry in payload.get("tracks", []):
        state_val = TrackState(int(entry.get("state", 0)))
        tracks.append(
            TrackStatus(
                track=int(entry.get("track", -1)),
                state=state_val,
                state_label=state_val.label,
                loop_length_frames=int(entry.get("loop_length_frames", 0)),
                playhead_frames=int(entry.get("playhead_frames", 0)),
                layer_count=int(entry.get("layer_count", 0)),
                level_db=float(entry.get("level_db", 0.0)),
                muted=bool(entry.get("muted", False)),
                soloed=bool(entry.get("soloed", False)),
                reverse=bool(entry.get("reverse", False)),
                half_speed=bool(entry.get("half_speed", False)),
            )
        )
    return LooperStatus(
        tracks=tracks,
        active_track_count=int(payload.get("active_track_count", 0)),
        sync_master=bool(payload.get("sync_master", False)),
        master_level_db=float(payload.get("master_level_db", 0.0)),
    )


class LooperService:
    """Operator-facing looper. Wraps engine bindings."""

    # T2512-LOCK — verbs that *mutate* the captured loop content. While
    # a track is locked, these verbs raise ``LooperServiceError(locked)``
    # without touching the engine. Verbs that only change *playback*
    # parameters (level/mute/solo/reverse/half_speed) stay live; the
    # lock protects the loop *content*, not the operator's ability to
    # adjust how it sounds in the mix.
    _LOCKED_VERBS = frozenset({"record", "clear", "undo", "redo"})

    def __init__(
        self,
        *,
        engine: Optional[Any] = None,
        broadcaster: Optional[Callable[["LooperStatus"], None]] = None,
    ) -> None:
        self._engine = engine
        # T2512-LOCK — per-track write-lock state. Python-side flag,
        # not propagated into the C++ engine: the engine's record path
        # is unconditional, and we enforce the lock at the service
        # boundary before any binding call. Indexed 0..3.
        self._locked: list[bool] = [False, False, False, False]
        # T2512-WS — fan-out hook for status changes. Set by
        # ``init_looper_ws_bridge`` at lifespan startup; remains None
        # in tests where WS isn't wired. The broadcaster is sync —
        # the bridge stashes a closure that schedules its own async
        # WS push onto the FastAPI loop.
        self._broadcaster = broadcaster
        # Defensive: probe the binding once at construction so we
        # log a clear warning if the engine SO predates T2512.
        if engine is not None:
            missing = [
                name for name in ("looper_record", "looper_get_status")
                if not hasattr(engine, name)
            ]
            if missing:
                logger.warning(
                    "LooperService: engine SO missing bindings %s; looper "
                    "verbs will degrade to logs.",
                    ", ".join(missing),
                )

    def replace_broadcaster(
        self,
        broadcaster: Optional[Callable[["LooperStatus"], None]],
    ) -> None:
        """T2512-WS — wire the WebSocket fan-out. Idempotent."""
        self._broadcaster = broadcaster

    def _broadcast(self, status: "LooperStatus") -> "LooperStatus":
        """Fire-and-forget broadcast on every mutating verb's return
        path. Exceptions are swallowed + logged so a flaky WS layer
        cannot break audio control flow."""
        if self._broadcaster is None:
            return status
        try:
            self._broadcaster(status)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "LooperService: broadcaster failed (swallowed): %s", exc
            )
        return status

    def _enforce_lock(self, track: int, verb: str) -> None:
        if verb in self._LOCKED_VERBS and self._locked[track]:
            raise LooperServiceError(
                code="track_locked",
                message=(
                    f"track {track} is write-locked; unlock before "
                    f"{verb!r} (set_locked(track, False))"
                ),
            )

    # -------- Stomp verbs --------

    def record(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "record")
        if self._engine and hasattr(self._engine, "looper_record"):
            self._engine.looper_record(track)
        else:
            logger.info("looper.record (no engine binding): track=%d", track)
        return self._broadcast(self.get_status())

    def stop_track(self, track: int) -> LooperStatus:
        _validate_track(track)
        # stop_track is intentionally NOT lock-guarded: stopping a
        # locked track is part of how an operator "freezes" the loop —
        # take a playing track, lock it, then stop it later; the lock
        # remains intact through the stop.
        if self._engine and hasattr(self._engine, "looper_stop"):
            self._engine.looper_stop(track)
        return self._broadcast(self.get_status())

    def clear(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "clear")
        if self._engine and hasattr(self._engine, "looper_clear"):
            self._engine.looper_clear(track)
        return self._broadcast(self.get_status())

    def undo(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "undo")
        if self._engine and hasattr(self._engine, "looper_undo"):
            self._engine.looper_undo(track)
        return self._broadcast(self.get_status())

    def redo(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "redo")
        if self._engine and hasattr(self._engine, "looper_redo"):
            self._engine.looper_redo(track)
        return self._broadcast(self.get_status())

    # -------- Settings --------

    def set_level_db(self, track: int, db: float) -> LooperStatus:
        _validate_track(track)
        db = float(max(-60.0, min(6.0, db)))
        if self._engine and hasattr(self._engine, "looper_set_level_db"):
            self._engine.looper_set_level_db(track, db)
        return self._broadcast(self.get_status())

    def set_muted(self, track: int, muted: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_muted"):
            self._engine.looper_set_muted(track, bool(muted))
        return self._broadcast(self.get_status())

    def set_soloed(self, track: int, soloed: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_soloed"):
            self._engine.looper_set_soloed(track, bool(soloed))
        return self._broadcast(self.get_status())

    def set_reverse(self, track: int, reverse: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_reverse"):
            self._engine.looper_set_reverse(track, bool(reverse))
        return self._broadcast(self.get_status())

    def set_half_speed(self, track: int, half: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_half_speed"):
            self._engine.looper_set_half_speed(track, bool(half))
        return self._broadcast(self.get_status())

    def set_master_level_db(self, db: float) -> LooperStatus:
        db = float(max(-60.0, min(6.0, db)))
        if self._engine and hasattr(self._engine, "looper_set_master_level_db"):
            self._engine.looper_set_master_level_db(db)
        return self._broadcast(self.get_status())

    def set_locked(self, track: int, locked: bool) -> LooperStatus:
        """T2512-LOCK — toggle the write-lock flag for a track.

        Locking is non-destructive: the captured loop content stays
        intact, but ``record``, ``clear``, ``undo``, ``redo`` will
        raise ``track_locked`` until the lock is released. Playback,
        per-track volume / mute / solo / reverse / half-speed, and
        ``stop_track`` remain live so the operator can still mix and
        stop the loop.
        """
        _validate_track(track)
        self._locked[track] = bool(locked)
        return self._broadcast(self.get_status())

    # -------- Inspection --------

    def get_status(self) -> LooperStatus:
        if self._engine and hasattr(self._engine, "looper_get_status"):
            status = _status_from_engine_dict(self._engine.looper_get_status())
        else:
            # No engine — return an empty 4-track snapshot.
            empty_tracks = [
                TrackStatus(
                    track=i, state=TrackState.EMPTY,
                    state_label=TrackState.EMPTY.label,
                    loop_length_frames=0, playhead_frames=0, layer_count=0,
                    level_db=0.0, muted=False, soloed=False,
                    reverse=False, half_speed=False,
                )
                for i in range(4)
            ]
            status = LooperStatus(
                tracks=empty_tracks,
                active_track_count=0,
                sync_master=False,
                master_level_db=0.0,
            )
        # T2512-LOCK — overlay the Python-side lock flags onto each
        # track. The engine doesn't know about locks; the service is
        # authoritative.
        decorated = [
            TrackStatus(
                track=t.track,
                state=t.state,
                state_label=t.state_label,
                loop_length_frames=t.loop_length_frames,
                playhead_frames=t.playhead_frames,
                layer_count=t.layer_count,
                level_db=t.level_db,
                muted=t.muted,
                soloed=t.soloed,
                reverse=t.reverse,
                half_speed=t.half_speed,
                locked=self._locked[t.track] if 0 <= t.track < 4 else False,
            )
            for t in status.tracks
        ]
        return LooperStatus(
            tracks=decorated,
            active_track_count=status.active_track_count,
            sync_master=status.sync_master,
            master_level_db=status.master_level_db,
        )


# Singleton accessor — set up at startup so the looper engine
# reference is bound once.

_service: Optional[LooperService] = None
_lock = asyncio.Lock()


def get_looper_service() -> LooperService:
    global _service
    if _service is None:
        _service = LooperService()
    return _service


def set_looper_service(service: Optional[LooperService]) -> None:
    """Test seam — override the singleton (or clear with None)."""
    global _service
    _service = service
