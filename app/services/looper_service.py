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
from typing import Any, Optional


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

    def __init__(self, *, engine: Optional[Any] = None) -> None:
        self._engine = engine
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

    # -------- Stomp verbs --------

    def record(self, track: int) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_record"):
            self._engine.looper_record(track)
        else:
            logger.info("looper.record (no engine binding): track=%d", track)
        return self.get_status()

    def stop_track(self, track: int) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_stop"):
            self._engine.looper_stop(track)
        return self.get_status()

    def clear(self, track: int) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_clear"):
            self._engine.looper_clear(track)
        return self.get_status()

    def undo(self, track: int) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_undo"):
            self._engine.looper_undo(track)
        return self.get_status()

    def redo(self, track: int) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_redo"):
            self._engine.looper_redo(track)
        return self.get_status()

    # -------- Settings --------

    def set_level_db(self, track: int, db: float) -> LooperStatus:
        _validate_track(track)
        db = float(max(-60.0, min(6.0, db)))
        if self._engine and hasattr(self._engine, "looper_set_level_db"):
            self._engine.looper_set_level_db(track, db)
        return self.get_status()

    def set_muted(self, track: int, muted: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_muted"):
            self._engine.looper_set_muted(track, bool(muted))
        return self.get_status()

    def set_soloed(self, track: int, soloed: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_soloed"):
            self._engine.looper_set_soloed(track, bool(soloed))
        return self.get_status()

    def set_reverse(self, track: int, reverse: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_reverse"):
            self._engine.looper_set_reverse(track, bool(reverse))
        return self.get_status()

    def set_half_speed(self, track: int, half: bool) -> LooperStatus:
        _validate_track(track)
        if self._engine and hasattr(self._engine, "looper_set_half_speed"):
            self._engine.looper_set_half_speed(track, bool(half))
        return self.get_status()

    def set_master_level_db(self, db: float) -> LooperStatus:
        db = float(max(-60.0, min(6.0, db)))
        if self._engine and hasattr(self._engine, "looper_set_master_level_db"):
            self._engine.looper_set_master_level_db(db)
        return self.get_status()

    # -------- Inspection --------

    def get_status(self) -> LooperStatus:
        if self._engine and hasattr(self._engine, "looper_get_status"):
            return _status_from_engine_dict(self._engine.looper_get_status())
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
        return LooperStatus(
            tracks=empty_tracks,
            active_track_count=0,
            sync_master=False,
            master_level_db=0.0,
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
