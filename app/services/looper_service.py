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
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
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
class ActivityEvent:
    """T2512-ACTIVITY — single entry in the looper activity log.

    Records that a mutating verb was invoked, with enough context
    (timestamp, verb name, optional track index, short summary) for
    an operator to audit what changed when. Loop content / engine
    state isn't captured — this is an operator-actions log, not a
    full snapshot stream.
    """
    timestamp_iso: str
    verb: str
    track: Optional[int]
    summary: str

    def to_payload(self) -> dict[str, Any]:
        return {
            "timestamp_iso": self.timestamp_iso,
            "verb": self.verb,
            "track": self.track,
            "summary": self.summary,
        }


@dataclass(frozen=True)
class TrackSlice:
    """T2512-SLICE — non-destructive slice metadata.

    A slice marks a frame range within a track's captured loop for
    operator-driven region editing (label, audition, future region-
    extract). Slices do NOT mutate captured audio; the engine plays
    the loop intact regardless of how many slices are stored.

    ``label`` is sanitized (trimmed; max 64 chars) by the setter,
    never the dataclass.
    """
    start_frame: int
    end_frame: int
    label: str = ""

    def to_payload(self) -> dict[str, Any]:
        return {
            "start_frame": self.start_frame,
            "end_frame":   self.end_frame,
            "label":       self.label,
        }


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
    # T2512-OS-COUNT — number of consecutive loop passes a one-shot
    # track should play before auto-stopping. Defaults to 1 (preserves
    # the original T2512-OS contract: stop after one full pass).
    # Operators set higher counts to play a verse-progression that
    # spans N bars before stopping. Clamped 1..32 by the service-side
    # setter; the runner reads this on the initial schedule and
    # decrements after each completed pass.
    one_shot_passes:     int  = 1
    # T2512-AUTO — auto-record state surface. v1 ships the operator
    # toggle + threshold storage so the UI and dispatcher path can
    # land without an engine binding. The actual "input level above
    # threshold → fire record()" behavior lands later under
    # T2512-AUTO-TRIGGER once engine input-level RMS is exposed to
    # Python.
    auto_armed:          bool  = False
    auto_threshold_db:   float = -36.0
    # T2512-AUTO-PEAK — operator-tuning surface for the auto-record
    # threshold. ``auto_last_level_db`` mirrors the most recent input
    # level pushed for this track (any source: LooperAutoRecordTrigger
    # poll, HTTP /auto-record/push, future engine RMS binding); -inf
    # equivalent (sentinel value -150.0 dB) means "no level pushed
    # yet since the last arm/reset". ``auto_peak_db`` is the highest
    # level seen since the last arm; the trigger resets it whenever
    # the operator re-arms a track (so a stale peak from a previous
    # take never misleads the threshold setter). Both stay updated
    # whether or not the track is armed — the operator can watch them
    # while disarmed to tune the threshold against real playing.
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
    auto_last_level_db:  float = -150.0
    auto_peak_db:        float = -150.0
    sync_mode:           str   = "free"
    # T2512-QUANT-WIRE — per-track quantize grid for auto-close on
    # record stop. "off" disables quantization (default — preserves
    # T2512 v1 behavior). Valid divisions match looper_quantize:
    # whole, half, quarter, eighth, sixteenth, thirty-second + 1/N
    # aliases. State-only here; engine-side auto-close lands later.
    quantize_division:   str   = "off"
    # T2512-SLICE — per-track non-destructive slice metadata. Ordered
    # by ``start_frame``, no overlaps within the same track (enforced
    # by the service-side setter). Region-editor UI lands as a
    # follow-up; the model + storage + snapshot round-trip ship now.
    slices:              tuple[TrackSlice, ...] = ()

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
            "one_shot_passes":    self.one_shot_passes,
            "auto_armed":         self.auto_armed,
            "auto_threshold_db":  self.auto_threshold_db,
            "auto_last_level_db": self.auto_last_level_db,
            "auto_peak_db":       self.auto_peak_db,
            "stop_mode":          self.stop_mode,
            "fade_ms":            self.fade_ms,
            "sync_mode":          self.sync_mode,
            "slices":             [s.to_payload() for s in self.slices],
            "quantize_division":  self.quantize_division,
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
    # T2512-ACTIVITY-WS — newest-first tail of the activity log
    # (capped 20 events). Embedded so a WS subscriber gets activity
    # updates pushed alongside status without a separate poll.
    # The full log (capped 200) is reachable via GET /activity.
    recent_activity:    tuple["ActivityEvent", ...] = ()
    # T2512-METRICS-WS — current verb-invocation counters embedded
    # in every status frame so WS subscribers see metric updates
    # without polling /metrics. Mirrors the cumulative counters
    # returned by ``LooperService.get_metrics()``. Empty dict means
    # the service has never recorded a tracked verb yet.
    metrics:            dict[str, int] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        return {
            "tracks":             [t.to_payload() for t in self.tracks],
            "active_track_count": self.active_track_count,
            "sync_master":        self.sync_master,
            "master_level_db":    self.master_level_db,
            "bpm":                self.bpm,
            "sync_master_track":  self.sync_master_track,
            "recent_activity":    [e.to_payload() for e in self.recent_activity],
            "metrics":            dict(self.metrics),
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
        # T2512-OS-COUNT — per-track pass count for one-shot mode.
        # Each entry is the number of consecutive loop passes a
        # one-shot track plays before the runner auto-stops.
        # Defaults to 1 (preserves the pre-OS-COUNT contract).
        # Clamped 1..32 by ``set_one_shot_passes``.
        self._one_shot_passes: list[int] = [1, 1, 1, 1]
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
        # T2512-AUTO-PEAK — operator-tuning surface. Both fields default
        # to a sentinel -150.0 dB ("no level pushed yet"). Updated by
        # ``record_input_level`` from any push source (auto-record
        # trigger, /auto-record/push HTTP route, future engine RMS
        # binding). Reset by ``set_auto_armed(armed=True)`` so a stale
        # pre-arm peak doesn't survive into the next take.
        self._auto_last_level_db: list[float] = [-150.0, -150.0, -150.0, -150.0]
        self._auto_peak_db:       list[float] = [-150.0, -150.0, -150.0, -150.0]
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
        # T2512-SLICE — per-track ordered list of non-destructive
        # slices. The setter sorts + validates (no overlaps); the
        # decoration step exposes an immutable tuple on TrackStatus.
        self._slices: list[list[TrackSlice]] = [[], [], [], []]
        # T2512-QUANT-WIRE — per-track quantize grid for auto-close.
        # "off" is the v1-compatible default; the snap helper is a
        # no-op in that case. Engine-side application of the snapped
        # length lands later in a focused engine slice.
        self._quantize_division: list[str] = ["off", "off", "off", "off"]
        # T2512-ACTIVITY — bounded in-memory log of recent verb
        # invocations. Cap is 200 events; oldest get dropped first.
        # Operator-facing audit trail, not a full state stream.
        self._activity: deque[ActivityEvent] = deque(maxlen=200)
        # T2512-METRICS — verb-name → invocation count. Mirrors the
        # activity log's coverage (records on the same set of high-
        # impact mutating verbs). Operator-facing diagnostics —
        # zero RT-path cost.
        self._metrics: dict[str, int] = {}
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

    def _record_activity(
        self,
        verb: str,
        track: Optional[int] = None,
        summary: str = "",
    ) -> None:
        """T2512-ACTIVITY — append a single event to the ring buffer.

        Internal helper called from mutating verbs. Time source is
        ``datetime.utcnow()`` formatted as ISO 8601 with a trailing
        Z — same convention map2's audit log uses elsewhere.

        Never raises: a failure to record activity must not break a
        verb call. Swallows everything with a debug log.
        """
        try:
            ts = datetime.now(timezone.utc).isoformat().replace(
                "+00:00", "Z"
            )
            self._activity.append(
                ActivityEvent(
                    timestamp_iso=ts,
                    verb=verb,
                    track=track,
                    summary=summary,
                )
            )
            # T2512-METRICS — increment the verb counter at the same
            # callsite the audit log records. Failures swallow to
            # debug so a metric write can't break verb flow.
            self._metrics[verb] = self._metrics.get(verb, 0) + 1
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "looper.record_activity: append failed (swallowed): %s", exc
            )

    def get_activity(self) -> list[ActivityEvent]:
        """T2512-ACTIVITY — snapshot copy of the recent activity log.

        Oldest first; newest last. Returns a list (not the deque) so
        callers can iterate without worrying about the buffer
        mutating mid-iteration.
        """
        return list(self._activity)

    def clear_activity(self) -> None:
        """T2512-ACTIVITY — drop every recorded event."""
        self._activity.clear()

    def get_metrics(self) -> dict[str, int]:
        """T2512-METRICS — snapshot copy of the verb invocation
        counters. Mirrors the activity log's coverage (high-impact
        mutating verbs only). Returns a fresh dict so callers can
        mutate it without affecting service state."""
        return dict(self._metrics)

    def reset_metrics(self) -> None:
        """T2512-METRICS — zero the counters. Operator-driven reset;
        does not affect the activity log or any other service state."""
        self._metrics.clear()

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
        self._record_activity("record", track, f"track {track} record stomp")
        return self._broadcast(self.get_status())

    def stop_track(self, track: int) -> LooperStatus:
        _validate_track(track)
        # stop_track is intentionally NOT lock-guarded: stopping a
        # locked track is part of how an operator "freezes" the loop —
        # take a playing track, lock it, then stop it later; the lock
        # remains intact through the stop.
        if self._engine and hasattr(self._engine, "looper_stop"):
            self._engine.looper_stop(track)
        self._record_activity("stop", track, f"track {track} stop")
        return self._broadcast(self.get_status())

    def clear(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "clear")
        if self._engine and hasattr(self._engine, "looper_clear"):
            self._engine.looper_clear(track)
        self._record_activity("clear", track, f"track {track} clear")
        return self._broadcast(self.get_status())

    def undo(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "undo")
        if self._engine and hasattr(self._engine, "looper_undo"):
            self._engine.looper_undo(track)
        self._record_activity("undo", track, f"track {track} undo")
        return self._broadcast(self.get_status())

    def redo(self, track: int) -> LooperStatus:
        _validate_track(track)
        self._enforce_lock(track, "redo")
        if self._engine and hasattr(self._engine, "looper_redo"):
            self._engine.looper_redo(track)
        self._record_activity("redo", track, f"track {track} redo")
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

    _MIN_ONE_SHOT_PASSES = 1
    _MAX_ONE_SHOT_PASSES = 32

    def set_one_shot_passes(self, track: int, passes: int) -> LooperStatus:
        """T2512-OS-COUNT — set the consecutive-pass count for a
        one-shot track. Clamped 1..32.

        Setting this on a non-one-shot track is intentionally allowed:
        the operator may stage the pass count before flipping
        ``one_shot=True``. The runner only reads this when one_shot is
        already True, so a pre-staged value never has runtime effect
        on its own.

        Coerces non-int input (e.g. float "2.0", numeric string) into
        an int when possible; rejects unparseable values with
        LooperServiceError.
        """
        _validate_track(track)
        try:
            value = int(passes)
        except (TypeError, ValueError):
            raise LooperServiceError(
                code="invalid_one_shot_passes",
                message=f"one_shot_passes must be int (got {passes!r})",
            )
        clamped = max(
            self._MIN_ONE_SHOT_PASSES,
            min(self._MAX_ONE_SHOT_PASSES, value),
        )
        self._one_shot_passes[track] = clamped
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

        T2512-AUTO-PEAK — re-arming a track resets the recent-peak
        tracking so a stale peak from a previous take never misleads
        the operator's threshold dial; disarming leaves the peak
        intact so the operator can review what they were playing into
        the trigger.
        """
        _validate_track(track)
        was_armed = self._auto_armed[track]
        self._auto_armed[track] = bool(armed)
        if bool(armed) and not was_armed:
            self._auto_last_level_db[track] = -150.0
            self._auto_peak_db[track] = -150.0
        return self._broadcast(self.get_status())

    def record_input_level(self, track: int, level_db: float) -> None:
        """T2512-AUTO-PEAK — record an input-level push for a track.

        Updates the per-track ``auto_last_level_db`` and bumps
        ``auto_peak_db`` when ``level_db`` exceeds the current peak.
        Invalid tracks (or NaN levels) silently no-op — the caller
        (engine binding, HTTP push, trigger) may not have full
        validation in the push path.

        This is the storage primitive; the LooperAutoRecordTrigger
        and the /auto-record/push route both call it on every push
        whether or not the push itself fires record(). Operators tune
        the threshold by watching `auto_peak_db` move while playing,
        regardless of arm state. No broadcast is fired here: input
        levels arrive far faster than the WS bridge can fan out, so
        subscribers read the field at next status frame.
        """
        if not isinstance(track, int) or not (0 <= track < 4):
            return
        try:
            db = float(level_db)
        except (TypeError, ValueError):
            return
        if db != db:  # NaN check (NaN != NaN by IEEE 754)
            return
        self._auto_last_level_db[track] = db
        if db > self._auto_peak_db[track]:
            self._auto_peak_db[track] = db

    def reset_auto_peak(self, track: int) -> LooperStatus:
        """T2512-AUTO-PEAK — explicit operator-driven peak reset.

        Clears the recent-peak surface for a single track without
        touching the arm state or threshold. UI exposes this as a
        "reset peak" button next to the threshold dial — operators
        use it after deliberately playing a louder-than-target hit to
        recalibrate the indicator without re-arming the track.
        """
        _validate_track(track)
        self._auto_last_level_db[track] = -150.0
        self._auto_peak_db[track] = -150.0
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

    # T2512-SLICE — slice metadata management ----------------------------

    _MAX_SLICES_PER_TRACK = 64
    _MAX_LABEL_LENGTH = 64

    def add_slice(
        self,
        track: int,
        start_frame: int,
        end_frame: int,
        label: str = "",
    ) -> LooperStatus:
        """T2512-SLICE — add a non-destructive slice to a track.

        Validates:
          - track index 0..3
          - 0 <= start_frame < end_frame
          - no overlap with any existing slice on this track
          - max 64 slices per track (hard cap to keep status payload
            bounded)
          - label trimmed; truncated to 64 chars

        Raises ``LooperServiceError`` on validation failure. The
        existing slice list is preserved on any error.
        """
        _validate_track(track)
        try:
            s = int(start_frame)
            e = int(end_frame)
        except (TypeError, ValueError):
            raise LooperServiceError(
                code="invalid_slice",
                message=(
                    f"start_frame / end_frame must be integers (got "
                    f"{start_frame!r}, {end_frame!r})"
                ),
            )
        if s < 0 or e <= s:
            raise LooperServiceError(
                code="invalid_slice",
                message=(
                    f"slice frame range must satisfy 0 <= start < end "
                    f"(got start={s}, end={e})"
                ),
            )
        existing = self._slices[track]
        if len(existing) >= self._MAX_SLICES_PER_TRACK:
            raise LooperServiceError(
                code="slice_limit",
                message=(
                    f"track {track} already has {len(existing)} slices "
                    f"(max {self._MAX_SLICES_PER_TRACK}); clear before adding more"
                ),
            )
        # Overlap check — half-open [s, e). Existing slice [es, ee)
        # overlaps when es < e AND s < ee.
        for ex in existing:
            if ex.start_frame < e and s < ex.end_frame:
                raise LooperServiceError(
                    code="slice_overlap",
                    message=(
                        f"slice [{s}, {e}) overlaps existing slice "
                        f"[{ex.start_frame}, {ex.end_frame})"
                    ),
                )
        sanitized = str(label or "").strip()[: self._MAX_LABEL_LENGTH]
        new_slice = TrackSlice(start_frame=s, end_frame=e, label=sanitized)
        existing.append(new_slice)
        existing.sort(key=lambda x: x.start_frame)
        return self._broadcast(self.get_status())

    def clear_slices(self, track: int) -> LooperStatus:
        """T2512-SLICE — drop every slice on a track. No-op if empty."""
        _validate_track(track)
        self._slices[track] = []
        return self._broadcast(self.get_status())

    def add_slice_at_playhead(
        self,
        track: int,
        label: str = "",
    ) -> LooperStatus:
        """T2512-SLICE-AT-PLAYHEAD — add a slice from the previous
        boundary to the current playhead.

        Convenience helper for operators who want to drop a region
        marker at the moment they noticed something interesting.
        Computes:
          - ``start = max(largest existing slice's end, 0)``
          - ``end   = current playhead_frames``

        Raises ``LooperServiceError(invalid_slice)`` when:
          - the playhead is at frame 0 (no content captured yet)
          - the computed range is empty (playhead is at or before the
            previous slice's end — meaning the operator already
            captured everything up to here).

        Reuses ``add_slice`` for all other validation (overlap,
        per-track cap, label sanitization), so any future tightening
        of those rules picks up here for free.
        """
        _validate_track(track)
        status = self.get_status()
        playhead = int(status.tracks[track].playhead_frames)
        if playhead <= 0:
            raise LooperServiceError(
                code="invalid_slice",
                message=(
                    f"cannot slice at playhead — track {track} has no captured "
                    f"content yet (playhead_frames={playhead})"
                ),
            )
        prior_end = 0
        for slc in self._slices[track]:
            if slc.end_frame > prior_end:
                prior_end = slc.end_frame
        start = prior_end
        if playhead <= start:
            raise LooperServiceError(
                code="invalid_slice",
                message=(
                    f"playhead ({playhead}) is at or before the previous "
                    f"slice's end ({start}); no new region to add"
                ),
            )
        return self.add_slice(track, start, playhead, label)

    def delete_slice(self, track: int, start_frame: int) -> LooperStatus:
        """T2512-SLICE-DEL — drop a single slice identified by its start_frame.

        slice start_frame is unique within a track (slices can't
        overlap), so it's an unambiguous identifier. Raises
        ``LooperServiceError(slice_not_found)`` when no slice on the
        track matches.
        """
        _validate_track(track)
        try:
            start = int(start_frame)
        except (TypeError, ValueError):
            raise LooperServiceError(
                code="invalid_slice",
                message=f"start_frame must be an integer (got {start_frame!r})",
            )
        existing = self._slices[track]
        for idx, slc in enumerate(existing):
            if slc.start_frame == start:
                del existing[idx]
                return self._broadcast(self.get_status())
        raise LooperServiceError(
            code="slice_not_found",
            message=(
                f"no slice on track {track} with start_frame={start}"
            ),
        )

    def rename_slice(
        self, track: int, start_frame: int, label: str
    ) -> LooperStatus:
        """T2512-SLICE-RENAME — replace an existing slice's label.

        Identified by start_frame (unique per track). The new label is
        trimmed + truncated to the same 64-char cap as ``add_slice``;
        an empty / all-whitespace label is accepted and clears the
        existing label (lets the operator un-label without deleting).
        The slice's frame range is unchanged — this is metadata-only.

        Raises ``LooperServiceError(slice_not_found)`` when no slice
        on the track matches.
        """
        _validate_track(track)
        try:
            start = int(start_frame)
        except (TypeError, ValueError):
            raise LooperServiceError(
                code="invalid_slice",
                message=f"start_frame must be an integer (got {start_frame!r})",
            )
        sanitized = str(label or "").strip()[: self._MAX_LABEL_LENGTH]
        existing = self._slices[track]
        for idx, slc in enumerate(existing):
            if slc.start_frame == start:
                existing[idx] = TrackSlice(
                    start_frame=slc.start_frame,
                    end_frame=slc.end_frame,
                    label=sanitized,
                )
                return self._broadcast(self.get_status())
        raise LooperServiceError(
            code="slice_not_found",
            message=(
                f"no slice on track {track} with start_frame={start}"
            ),
        )

    # T2512-QUANT-WIRE — quantize state + decision math ----------------

    _VALID_QUANTIZE_DIVISIONS = frozenset({
        "off",
        "whole", "1/1",
        "half", "1/2",
        "quarter", "1/4",
        "eighth", "1/8",
        "sixteenth", "1/16",
        "thirty-second", "thirty_second", "1/32",
    })

    def set_quantize_division(self, track: int, division: str) -> LooperStatus:
        """T2512-QUANT-WIRE — set the auto-close grid for a track.

        ``"off"`` disables quantization (the v1-compatible default).
        Any value from :data:`_VALID_QUANTIZE_DIVISIONS` is stored
        as-is so the snap helper can resolve aliases at call time.

        Raises ``LooperServiceError(invalid_quantize_division)`` for
        anything outside the allowlist.
        """
        _validate_track(track)
        if division not in self._VALID_QUANTIZE_DIVISIONS:
            raise LooperServiceError(
                code="invalid_quantize_division",
                message=(
                    f"quantize_division must be one of "
                    f"{sorted(self._VALID_QUANTIZE_DIVISIONS)} (got {division!r})"
                ),
            )
        self._quantize_division[track] = division
        return self._broadcast(self.get_status())

    def quantize_record_length(self, track: int, raw_frames: int) -> int:
        """T2512-QUANT-WIRE — snap a raw recording length to the
        track's quantize grid.

        Returns ``raw_frames`` unchanged when:
          - the track's quantize_division is ``"off"``, OR
          - the snapshot tempo service is unreachable / returns a
            zero/negative BPM (no usable grid), OR
          - ``raw_frames`` is non-positive.

        Otherwise calls ``looper_quantize.snap_frames_to_grid`` with
        ``mode="nearest"`` (the operator's intent: the *closest*
        bar/beat to where they actually let off the pedal). The
        result is always an ``int`` ready for engine consumption.

        This is a *decision* helper — no state mutation; callers
        (engine-side auto-close, UI preview) read it as needed.
        """
        _validate_track(track)
        if raw_frames <= 0:
            return int(raw_frames)
        division = self._quantize_division[track]
        if division == "off":
            return int(raw_frames)
        # Lazy import keeps the looper service light when callers
        # never touch quantize math (unit-test path).
        from app.services import looper_quantize

        bpm: Optional[float] = None
        try:
            from app.services.snapshot_tempo_service import SnapshotTempoService
            bpm = SnapshotTempoService().current_bpm()
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "quantize_record_length: tempo read failed (swallowed): %s",
                exc,
            )
        if bpm is None or bpm <= 0:
            return int(raw_frames)

        try:
            return looper_quantize.snap_frames_to_grid(
                int(raw_frames), bpm, division, mode="nearest"
            )
        except looper_quantize.QuantizeError as exc:
            logger.warning(
                "quantize_record_length: snap failed (track=%d, division=%r): %s",
                track, division, exc,
            )
            return int(raw_frames)

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
                    "one_shot_passes":   self._one_shot_passes[i],
                    "auto_armed":        self._auto_armed[i],
                    "auto_threshold_db": self._auto_threshold_db[i],
                    "stop_mode":         self._stop_mode[i],
                    "fade_ms":           self._fade_ms[i],
                    "sync_mode":         self._sync_mode[i],
                    "slices":            [s.to_payload() for s in self._slices[i]],
                    "quantize_division": self._quantize_division[i],
                }
                for i in range(4)
            ],
            "master_level_db": master_level,
        }

    def reset_state(self) -> LooperStatus:
        """T2512-RESET — return every Python-side per-track flag and
        the master level back to defaults.

        Resets:
          - locked / one_shot / auto_armed all → False
          - auto_threshold_db → -36 dB
          - stop_mode → "hard"; fade_ms → 250
          - sync_mode → "free"
          - quantize_division → "off"
          - slices → empty list per track
          - master level → 0 dB (only if engine bound)

        Does NOT touch captured loop content — the engine's heap-
        allocated layer storage is unaffected. Operators clear loops
        with the per-track ``clear`` verb. The state-machine flags
        (state / loop_length / playhead) come from the engine and
        are not reset here either.

        Broadcasts once on completion.
        """
        self._locked = [False, False, False, False]
        self._one_shot = [False, False, False, False]
        self._one_shot_passes = [1, 1, 1, 1]
        self._auto_armed = [False, False, False, False]
        self._auto_threshold_db = [-36.0, -36.0, -36.0, -36.0]
        self._auto_last_level_db = [-150.0, -150.0, -150.0, -150.0]
        self._auto_peak_db = [-150.0, -150.0, -150.0, -150.0]
        self._stop_mode = ["hard", "hard", "hard", "hard"]
        self._fade_ms = [250, 250, 250, 250]
        self._sync_mode = ["free", "free", "free", "free"]
        self._quantize_division = ["off", "off", "off", "off"]
        self._slices = [[], [], [], []]
        if (
            self._engine is not None
            and hasattr(self._engine, "looper_set_master_level_db")
        ):
            try:
                self._engine.looper_set_master_level_db(0.0)
            except Exception as exc:  # noqa: BLE001
                logger.debug(
                    "looper.reset_state: master_level reset failed: %s", exc
                )
        self._record_activity("reset_state", None, "full state reset")
        return self._broadcast(self.get_status())

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
            if "one_shot_passes" in track_state:
                try:
                    passes_val = int(track_state["one_shot_passes"])
                    self._one_shot_passes[idx] = max(
                        self._MIN_ONE_SHOT_PASSES,
                        min(self._MAX_ONE_SHOT_PASSES, passes_val),
                    )
                except (TypeError, ValueError):
                    pass
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
            if "quantize_division" in track_state:
                qd = track_state["quantize_division"]
                if (
                    isinstance(qd, str)
                    and qd in self._VALID_QUANTIZE_DIVISIONS
                ):
                    self._quantize_division[idx] = qd
            if "slices" in track_state:
                raw_slices = track_state["slices"]
                if isinstance(raw_slices, list):
                    rebuilt: list[TrackSlice] = []
                    seen_ranges: list[tuple[int, int]] = []
                    for raw in raw_slices:
                        if not isinstance(raw, dict):
                            continue
                        try:
                            s = int(raw.get("start_frame", -1))
                            e = int(raw.get("end_frame", -1))
                        except (TypeError, ValueError):
                            continue
                        if s < 0 or e <= s:
                            continue
                        if len(rebuilt) >= self._MAX_SLICES_PER_TRACK:
                            break
                        # Drop overlapping slices defensively.
                        overlap = any(
                            es < e and s < ee for es, ee in seen_ranges
                        )
                        if overlap:
                            continue
                        label = str(raw.get("label") or "").strip()[
                            : self._MAX_LABEL_LENGTH
                        ]
                        rebuilt.append(
                            TrackSlice(start_frame=s, end_frame=e, label=label)
                        )
                        seen_ranges.append((s, e))
                    rebuilt.sort(key=lambda x: x.start_frame)
                    self._slices[idx] = rebuilt

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

        self._record_activity(
            "apply_state", None,
            f"snapshot-restore (schema v{state.get('schema_version', '?')})",
        )
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
                one_shot_passes=(
                    self._one_shot_passes[t.track]
                    if 0 <= t.track < 4 else 1
                ),
                auto_armed=(
                    self._auto_armed[t.track] if 0 <= t.track < 4 else False
                ),
                auto_threshold_db=(
                    self._auto_threshold_db[t.track]
                    if 0 <= t.track < 4 else -36.0
                ),
                auto_last_level_db=(
                    self._auto_last_level_db[t.track]
                    if 0 <= t.track < 4 else -150.0
                ),
                auto_peak_db=(
                    self._auto_peak_db[t.track]
                    if 0 <= t.track < 4 else -150.0
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
                slices=(
                    tuple(self._slices[t.track])
                    if 0 <= t.track < 4 else ()
                ),
                quantize_division=(
                    self._quantize_division[t.track]
                    if 0 <= t.track < 4 else "off"
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

        # T2512-ACTIVITY-WS — capture the last 20 events newest-first
        # so WS subscribers get the same shape the UI panel expects.
        # The full log (capped 200) is reachable via GET /activity.
        recent_tail = tuple(reversed(list(self._activity)[-20:]))

        return LooperStatus(
            tracks=decorated,
            active_track_count=status.active_track_count,
            sync_master=sync_master_present,
            master_level_db=status.master_level_db,
            bpm=bpm,
            sync_master_track=master_idx,
            recent_activity=recent_tail,
            # T2512-METRICS-WS — embed the cumulative verb counters
            # so WS subscribers stay in sync without polling /metrics.
            # Copy via dict() so a frame consumer mutating the dict
            # doesn't corrupt service state.
            metrics=dict(self._metrics),
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
