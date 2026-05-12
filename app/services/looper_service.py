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
    one_shot:            bool = False  # T2512-OS — one-shot / trigger mode
    # T2512-AUTO — auto-record state surface. v1 ships the operator
    # toggle + threshold storage so the UI and dispatcher path can
    # land without an engine binding. The actual "input level above
    # threshold → fire record()" behavior lands later under
    # T2512-AUTO-TRIGGER once engine input-level RMS is exposed to
    # Python.
    auto_armed:          bool  = False
    auto_threshold_db:   float = -36.0
    # T2512-FADE — per-track stop mode + fade duration. v1 ships the
    # operator-visible state ("hard" vs "fade"; fade duration in ms,
    # clamped 0..5000) so the route + UI + dispatcher pattern can land
    # independent of the engine. The actual gain-ramp on stop lives
    # in the C++ audio callback and is gated behind a separate
    # bench task (T2512-FADE-RAMP) for RT-safety review.
    stop_mode:           str   = "hard"
    fade_ms:             int   = 250
    # T2512-SYNC — per-track sync mode. "free" (default — track plays
    # at its own captured length), "master" (the timebase reference;
    # at most one master at a time, enforced by the service), or
    # "slave" (track length follows the master). State-only in v1;
    # actual loop-length locking on the engine is RT-critical work
    # gated behind T2512-SYNC-LOCK.
    sync_mode:           str   = "free"

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
            "one_shot":           self.one_shot,
            "auto_armed":         self.auto_armed,
            "auto_threshold_db":  self.auto_threshold_db,
            "stop_mode":          self.stop_mode,
            "fade_ms":            self.fade_ms,
            "sync_mode":          self.sync_mode,
        }


@dataclass(frozen=True)
class LooperStatus:
    tracks:             list[TrackStatus]
    active_track_count: int
    sync_master:        bool
    master_level_db:    float
    # T2512-CLOCK (inbound) — current snapshot tempo in BPM. Resolved
    # at status-read time from SnapshotTempoService; None when tempo
    # is unavailable (snapshot tempo service not wired, or read
    # failed). UI surfaces this without acting on it; quantization
    # logic lands later under T2512-QUANT.
    bpm:                Optional[float] = None
    # T2512-SYNC — index of the track currently set to sync_mode
    # "master", or None when no master is set. Top-level field
    # rather than per-track so subscribers (UI, scripts) can find
    # the timebase reference with a single read.
    sync_master_track:  Optional[int] = None

    def to_payload(self) -> dict[str, Any]:
        return {
            "tracks":             [t.to_payload() for t in self.tracks],
            "active_track_count": self.active_track_count,
            "sync_master":        self.sync_master,
            "master_level_db":    self.master_level_db,
            "bpm":                self.bpm,
            "sync_master_track":  self.sync_master_track,
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
        # T2512-OS — per-track one-shot / trigger flag. When True, the
        # track auto-stops after one full playhead pass. The flag is
        # persistent across state transitions and survives recall/clear.
        # Actual auto-stop scheduling is the responsibility of an
        # async runner outside this sync service (filed as
        # T2512-OS-RUNNER); this service exposes the flag + status so
        # the runner can react without owning service state.
        self._one_shot: list[bool] = [False, False, False, False]
        # T2512-AUTO — per-track auto-record state. `_auto_armed`
        # tracks whether the operator has armed input-level detection
        # for this track; `_auto_threshold_db` stores the dB threshold
        # below which audio is treated as silence (clamped -90..0 dB
        # to match the bounds of useful guitar input). When an
        # engine-side input-level binding eventually exposes RMS to
        # Python (filed as T2512-AUTO-TRIGGER), a watcher loop will
        # call `record(track)` whenever the RMS exceeds the threshold
        # on an armed track. Until then, these fields are storage-
        # only and surface in the status payload so the UI can show
        # the arm state.
        self._auto_armed: list[bool] = [False, False, False, False]
        self._auto_threshold_db: list[float] = [-36.0, -36.0, -36.0, -36.0]
        # T2512-FADE — per-track stop mode + fade duration. "hard"
        # (default, matches current engine behavior) vs "fade" (gain
        # ramp over fade_ms milliseconds). The engine reads these
        # values when it lands; until then they're storage-only.
        self._stop_mode: list[str] = ["hard", "hard", "hard", "hard"]
        self._fade_ms:   list[int] = [250, 250, 250, 250]
        # T2512-SYNC — per-track sync mode. The service enforces the
        # "at most one master" invariant: setting any track to
        # "master" demotes a previously-set master to "free".
        self._sync_mode: list[str] = ["free", "free", "free", "free"]
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

    def set_one_shot(self, track: int, one_shot: bool) -> LooperStatus:
        """T2512-OS — toggle the one-shot / trigger flag for a track.

        When True, the track is meant to auto-stop after one playhead
        pass (the runner that performs the actual stop lives outside
        this service — see T2512-OS-RUNNER). Setting the flag is
        non-destructive: the captured loop content stays intact and
        all other verbs (record / clear / undo / redo / level / mute /
        solo / reverse / half-speed) remain live.

        The flag is persistent across state transitions; the operator
        explicitly clears it via ``set_one_shot(track, False)``.
        """
        _validate_track(track)
        self._one_shot[track] = bool(one_shot)
        return self._broadcast(self.get_status())

    def set_auto_armed(self, track: int, armed: bool) -> LooperStatus:
        """T2512-AUTO — arm / disarm input-threshold auto-record.

        Arming a track only stores the operator's intent — actual
        record triggering depends on an engine binding that pushes
        input-level RMS to Python (filed as T2512-AUTO-TRIGGER).
        Until that lands, setting the flag is operator-visible state
        only; the looper does not start recording on its own.

        Non-destructive: does not touch loop content or any other
        verb's behavior.
        """
        _validate_track(track)
        self._auto_armed[track] = bool(armed)
        return self._broadcast(self.get_status())

    def set_auto_threshold_db(self, track: int, db: float) -> LooperStatus:
        """T2512-AUTO — set the input-threshold dB for auto-record.

        Clamped to -90..0 dB to match the useful range of a guitar
        front-end. Below -90 dB the operator can't realistically play
        quietly enough to stay under it; above 0 dB the threshold
        would never trip.
        """
        _validate_track(track)
        clamped = float(max(-90.0, min(0.0, db)))
        self._auto_threshold_db[track] = clamped
        return self._broadcast(self.get_status())

    _VALID_STOP_MODES = frozenset({"hard", "fade"})

    def set_stop_mode(self, track: int, mode: str) -> LooperStatus:
        """T2512-FADE — set the stop mode for a track.

        Accepts "hard" (current default, immediate cutoff) or "fade"
        (gain ramp over fade_ms milliseconds — engine ramp gated
        behind T2512-FADE-RAMP). Invalid modes raise
        ``LooperServiceError(invalid_stop_mode)``.
        """
        _validate_track(track)
        if mode not in self._VALID_STOP_MODES:
            raise LooperServiceError(
                code="invalid_stop_mode",
                message=(
                    f"stop_mode must be one of {sorted(self._VALID_STOP_MODES)} "
                    f"(got {mode!r})"
                ),
            )
        self._stop_mode[track] = mode
        return self._broadcast(self.get_status())

    def set_fade_ms(self, track: int, fade_ms: int) -> LooperStatus:
        """T2512-FADE — set the fade-out duration in milliseconds.

        Clamped to 0..5000 ms. 0 ms effectively degrades a "fade"
        stop to a "hard" stop. 5000 ms is the practical upper bound
        — longer ramps risk noticeable seam artifacts when the
        operator triggers another loop event.
        """
        _validate_track(track)
        clamped = int(max(0, min(5000, fade_ms)))
        self._fade_ms[track] = clamped
        return self._broadcast(self.get_status())

    _VALID_SYNC_MODES = frozenset({"free", "master", "slave"})

    def set_sync_mode(self, track: int, mode: str) -> LooperStatus:
        """T2512-SYNC — set per-track sync mode.

        Enforces the "at most one master" invariant: promoting a
        track to "master" demotes any other track currently set to
        "master" back to "free" (they can't both be the timebase
        reference).

        Invalid modes raise ``LooperServiceError(invalid_sync_mode)``.
        """
        _validate_track(track)
        if mode not in self._VALID_SYNC_MODES:
            raise LooperServiceError(
                code="invalid_sync_mode",
                message=(
                    f"sync_mode must be one of {sorted(self._VALID_SYNC_MODES)} "
                    f"(got {mode!r})"
                ),
            )
        if mode == "master":
            # Demote any other current master.
            for i in range(4):
                if i != track and self._sync_mode[i] == "master":
                    self._sync_mode[i] = "free"
        self._sync_mode[track] = mode
        return self._broadcast(self.get_status())

    def _current_master_track(self) -> Optional[int]:
        """Return the track index currently set to ``master``, or None."""
        for i in range(4):
            if self._sync_mode[i] == "master":
                return i
        return None

    # -------- Snapshot integration (T2512-SNAP) --------
    #
    # The looper carries operator preferences that should travel with a
    # snapshot recall: per-track write-lock, one-shot, auto-record
    # arm/threshold, and master level. These knobs are policy, not
    # captured audio — the captured loop content stays heap-only in
    # the engine across snapshot transitions. (Loop content persistence
    # is a separate bench task; see T2512-STOR.)
    #
    # ``export_state`` returns a JSON-safe dict; ``apply_state`` accepts
    # the same shape and is tolerant of missing keys so older snapshot
    # payloads still load. Both are sync — the integration point with
    # the snapshot service is expected to call them inline at recall
    # time. Unknown keys are ignored; out-of-range values are clamped
    # by the existing setters.

    _STATE_SCHEMA_VERSION = 1

    def export_state(self) -> dict[str, Any]:
        """T2512-SNAP — serialize operator policy state for snapshot save.

        Captures per-track lock / one_shot / auto_armed /
        auto_threshold_db + master level. Does NOT capture loop
        content or transient engine state (state machine, playhead).
        Output is JSON-safe.
        """
        master_level = 0.0
        try:
            engine_status = self.get_status()
            master_level = engine_status.master_level_db
        except Exception as exc:  # noqa: BLE001
            logger.debug("looper.export_state: master level read failed: %s", exc)

        return {
            "schema_version": self._STATE_SCHEMA_VERSION,
            "tracks": [
                {
                    "locked":            self._locked[i],
                    "one_shot":          self._one_shot[i],
                    "auto_armed":        self._auto_armed[i],
                    "auto_threshold_db": self._auto_threshold_db[i],
                    "stop_mode":         self._stop_mode[i],
                    "fade_ms":           self._fade_ms[i],
                    "sync_mode":         self._sync_mode[i],
                }
                for i in range(4)
            ],
            "master_level_db": master_level,
        }

    def apply_state(self, state: dict[str, Any]) -> LooperStatus:
        """T2512-SNAP — restore operator policy from snapshot payload.

        Tolerant of missing keys + unknown future fields. Each setter
        re-applies its own clamp (track indices, dB range), so a
        payload from a future schema doesn't corrupt service state.
        Broadcasts once on completion.
        """
        if not isinstance(state, dict):
            logger.warning("looper.apply_state: dropping non-dict payload")
            return self.get_status()

        tracks = state.get("tracks") or []
        for idx, track_state in enumerate(tracks[:4]):
            if not isinstance(track_state, dict):
                continue
            if "locked" in track_state:
                self._locked[idx] = bool(track_state["locked"])
            if "one_shot" in track_state:
                self._one_shot[idx] = bool(track_state["one_shot"])
            if "auto_armed" in track_state:
                self._auto_armed[idx] = bool(track_state["auto_armed"])
            if "auto_threshold_db" in track_state:
                try:
                    db = float(track_state["auto_threshold_db"])
                    self._auto_threshold_db[idx] = max(-90.0, min(0.0, db))
                except (TypeError, ValueError):
                    pass
            if "stop_mode" in track_state:
                mode = track_state["stop_mode"]
                if isinstance(mode, str) and mode in self._VALID_STOP_MODES:
                    self._stop_mode[idx] = mode
            if "fade_ms" in track_state:
                try:
                    ms = int(track_state["fade_ms"])
                    self._fade_ms[idx] = max(0, min(5000, ms))
                except (TypeError, ValueError):
                    pass
            if "sync_mode" in track_state:
                mode = track_state["sync_mode"]
                if isinstance(mode, str) and mode in self._VALID_SYNC_MODES:
                    self._sync_mode[idx] = mode

        # T2512-SYNC — enforce the "at most one master" invariant
        # after bulk apply. If the payload set multiple tracks to
        # "master" (malformed input), keep the lowest-indexed master
        # and demote the rest to "free". This preserves at least one
        # functional timebase reference rather than corrupting state.
        masters = [i for i in range(4) if self._sync_mode[i] == "master"]
        if len(masters) > 1:
            for extra in masters[1:]:
                self._sync_mode[extra] = "free"
            logger.warning(
                "looper.apply_state: payload listed multiple masters; "
                "kept track %d, demoted %s to free",
                masters[0], masters[1:],
            )

        master_level = state.get("master_level_db")
        if master_level is not None:
            try:
                db = float(master_level)
                clamped = max(-60.0, min(6.0, db))
                if (
                    self._engine
                    and hasattr(self._engine, "looper_set_master_level_db")
                ):
                    self._engine.looper_set_master_level_db(clamped)
            except (TypeError, ValueError):
                pass

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
        # T2512-LOCK / T2512-OS — overlay the Python-side flags onto
        # each track. The engine doesn't know about locks or one-shot
        # mode; the service is authoritative for both.
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
                one_shot=self._one_shot[t.track] if 0 <= t.track < 4 else False,
                auto_armed=(
                    self._auto_armed[t.track] if 0 <= t.track < 4 else False
                ),
                auto_threshold_db=(
                    self._auto_threshold_db[t.track]
                    if 0 <= t.track < 4 else -36.0
                ),
                stop_mode=(
                    self._stop_mode[t.track] if 0 <= t.track < 4 else "hard"
                ),
                fade_ms=(
                    self._fade_ms[t.track] if 0 <= t.track < 4 else 250
                ),
                sync_mode=(
                    self._sync_mode[t.track] if 0 <= t.track < 4 else "free"
                ),
            )
            for t in status.tracks
        ]
        # T2512-CLOCK (inbound) — resolve current BPM from the snapshot
        # tempo service lazily so the looper never hard-imports a
        # service that may not be wired in tests. Failures are
        # swallowed: tempo is informational only in v1; quantization
        # under T2512-QUANT will tighten this contract.
        bpm: Optional[float] = None
        try:
            from app.services.snapshot_tempo_service import SnapshotTempoService
            bpm = SnapshotTempoService().current_bpm()
        except Exception as exc:  # noqa: BLE001
            logger.debug("looper: tempo read failed (swallowed): %s", exc)

        # T2512-SYNC — resolve the master track from service state.
        # The boolean ``sync_master`` flag reports whether a master is
        # currently set (kept for backwards compatibility with the
        # original sync_master bool field).
        master_idx = self._current_master_track()
        sync_master_present = master_idx is not None

        return LooperStatus(
            tracks=decorated,
            active_track_count=status.active_track_count,
            sync_master=sync_master_present,
            master_level_db=status.master_level_db,
            bpm=bpm,
            sync_master_track=master_idx,
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
