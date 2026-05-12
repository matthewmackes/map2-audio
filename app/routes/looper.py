"""T2512 — Multi-track looper HTTP routes.

Versioned under /api/v1/looper.

Endpoints
---------
    GET    /api/v1/looper/status                   — full 4-track snapshot
    POST   /api/v1/looper/track/{track}/record     — record stomp
    POST   /api/v1/looper/track/{track}/stop       — stop / resume
    POST   /api/v1/looper/track/{track}/clear      — clear
    POST   /api/v1/looper/track/{track}/undo       — undo layer
    POST   /api/v1/looper/track/{track}/redo       — redo layer
    PATCH  /api/v1/looper/track/{track}/level      — set dB level
    PATCH  /api/v1/looper/track/{track}/muted      — set mute
    PATCH  /api/v1/looper/track/{track}/soloed     — set solo
    PATCH  /api/v1/looper/track/{track}/reverse    — toggle reverse
    PATCH  /api/v1/looper/track/{track}/half-speed — toggle half-speed
    PATCH  /api/v1/looper/master/level             — set master dB

Validation
----------
    track must be 0..3 (LooperServiceError(invalid_track) → 400).
    Mute / solo / reverse / half-speed: PATCH body {value: bool}.
    Level: PATCH body {db: float}, clamped to [-60, +6] dB.

RT-safety
---------
    All routes run on the FastAPI asyncio loop. They never block
    the audio callback. The engine's stomp implementations are
    atomic-flag flips observable on the next audio buffer.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.looper_service import (
    LooperService,
    LooperServiceError,
    LooperStatus,
    get_looper_service,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/looper", tags=["looper"])


def _get_service() -> LooperService:
    return get_looper_service()


def _http_for_error(exc: LooperServiceError) -> HTTPException:
    code = {
        "invalid_track": status.HTTP_400_BAD_REQUEST,
        # T2512-LOCK — write-locked tracks reject mutating verbs with
        # 409 Conflict. UI surfaces this as "Unlock the track first".
        "track_locked": status.HTTP_409_CONFLICT,
        # T2512-FADE — unknown stop_mode strings.
        "invalid_stop_mode": status.HTTP_400_BAD_REQUEST,
        # T2512-SYNC — unknown sync_mode strings.
        "invalid_sync_mode": status.HTTP_400_BAD_REQUEST,
        # T2512-SLICE — invalid frame ranges / overlap / cap reached.
        "invalid_slice": status.HTTP_400_BAD_REQUEST,
        "slice_overlap": status.HTTP_409_CONFLICT,
        "slice_limit":   status.HTTP_409_CONFLICT,
        # T2512-SLICE-DEL — addressed slice doesn't exist.
        "slice_not_found": status.HTTP_404_NOT_FOUND,
        # T2512-QUANT-WIRE — unknown quantize division name.
        "invalid_quantize_division": status.HTTP_400_BAD_REQUEST,
    }.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    return HTTPException(status_code=code, detail=str(exc))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TrackSliceResponse(BaseModel):
    """T2512-SLICE — non-destructive slice metadata."""
    start_frame: int
    end_frame: int
    label: str = ""


class TrackStatusResponse(BaseModel):
    track: int
    state: int
    state_label: str
    loop_length_frames: int
    playhead_frames: int
    layer_count: int
    level_db: float
    muted: bool
    soloed: bool
    reverse: bool
    half_speed: bool
    locked: bool = False  # T2512-LOCK — write-lock state
    one_shot: bool = False  # T2512-OS — one-shot / trigger mode
    one_shot_passes: int = 1  # T2512-OS-COUNT — consecutive-pass count
    auto_armed: bool = False           # T2512-AUTO — operator armed input-threshold record
    auto_threshold_db: float = -36.0   # T2512-AUTO — threshold dB
    # T2512-AUTO-PEAK — recent input-level + peak surface for the
    # threshold-tuning UI. Sentinel -150.0 dB means "no level pushed
    # since arm/reset". The route layer just mirrors the service-side
    # fields; producers are LooperAutoRecordTrigger.push_input_level
    # and the /auto-record/push HTTP endpoint.
    auto_last_level_db: float = -150.0
    auto_peak_db: float = -150.0
    stop_mode: str = "hard"            # T2512-FADE — "hard" | "fade"
    fade_ms: int = 250                 # T2512-FADE — fade-out duration in ms
    sync_mode: str = "free"            # T2512-SYNC — "free" | "master" | "slave"
    slices: list["TrackSliceResponse"] = []   # T2512-SLICE — slice metadata
    quantize_division: str = "off"     # T2512-QUANT-WIRE — auto-close grid


class ActivityEventResponse(BaseModel):
    """T2512-ACTIVITY — single activity-log entry."""
    timestamp_iso: str
    verb: str
    track: int | None = None
    summary: str


class ActivityLogResponse(BaseModel):
    """T2512-ACTIVITY — the operator activity log envelope."""
    events: list[ActivityEventResponse]
    cap: int


class MetricsResponse(BaseModel):
    """T2512-METRICS — verb counter snapshot."""
    counters: dict[str, int]


class LooperStatusResponse(BaseModel):
    tracks: list[TrackStatusResponse]
    active_track_count: int
    sync_master: bool
    master_level_db: float
    # T2512-CLOCK (inbound) — current snapshot tempo BPM.
    # Optional: None when the tempo service can't be reached.
    bpm: float | None = None
    # T2512-SYNC — index of the track currently set to sync_mode
    # "master", or null when no master is set.
    sync_master_track: int | None = None
    # T2512-ACTIVITY-WS — newest-first tail (cap 20) of the activity
    # log embedded in the status frame. Surfaces over WS without
    # forcing the client to poll /activity. Full 200-event log
    # remains at GET /activity.
    recent_activity: list[ActivityEventResponse] = []
    # T2512-METRICS-WS — cumulative verb-invocation counters embedded
    # in every status frame. Mirrors GET /metrics; subscribers see
    # counter changes without polling. Empty dict means no tracked
    # verb has been invoked yet.
    metrics: dict[str, int] = {}

    @classmethod
    def from_status(cls, status_obj: LooperStatus) -> "LooperStatusResponse":
        return cls(**status_obj.to_payload())


class SetLevelRequest(BaseModel):
    db: float = Field(..., ge=-60.0, le=6.0)


class SetBoolRequest(BaseModel):
    value: bool


class SetAutoThresholdRequest(BaseModel):
    """T2512-AUTO — auto-record threshold setter. Same -90..0 dB clamp
    as the service-side ``set_auto_threshold_db``."""
    db: float = Field(..., ge=-90.0, le=0.0)


class SetOneShotPassesRequest(BaseModel):
    """T2512-OS-COUNT — multi-pass one-shot setter. Service-side
    clamps to 1..32; FastAPI's validator enforces the same bounds
    so an out-of-range value returns 422 rather than being silently
    clamped at the route boundary."""
    passes: int = Field(..., ge=1, le=32)


class AutoRecordPushRequest(BaseModel):
    """T2512-AUTO-PUSH — body for the input-level push endpoint."""
    level_db: float


class AutoRecordPushResponse(BaseModel):
    """T2512-AUTO-PUSH — push result envelope."""
    fired: bool
    status: "LooperStatusResponse"


class SetStopModeRequest(BaseModel):
    """T2512-FADE — stop mode setter."""
    mode: str = Field(..., pattern="^(hard|fade)$")


class SetFadeMsRequest(BaseModel):
    """T2512-FADE — fade-out duration in ms (clamped 0..5000)."""
    fade_ms: int = Field(..., ge=0, le=5000)


class SetSyncModeRequest(BaseModel):
    """T2512-SYNC — sync mode setter."""
    mode: str = Field(..., pattern="^(free|master|slave)$")


class AddSliceRequest(BaseModel):
    """T2512-SLICE — add a non-destructive slice."""
    start_frame: int = Field(..., ge=0)
    end_frame: int = Field(..., ge=1)
    label: str = ""


class AddSliceAtPlayheadRequest(BaseModel):
    """T2512-SLICE-AT-PLAYHEAD — body for the playhead helper.

    Only the label is operator-controlled; start_frame + end_frame
    are computed service-side from the current playhead.
    """
    label: str = ""


class RenameSliceRequest(BaseModel):
    """T2512-SLICE-RENAME — replace a slice's label without changing
    its frame range. Empty/whitespace label clears the existing one."""
    label: str = ""


class SetQuantizeDivisionRequest(BaseModel):
    """T2512-QUANT-WIRE — quantize division setter.

    Pattern intentionally permissive — the service layer validates
    against the full allowlist (including 1/N aliases) so the error
    message stays useful when an unknown name slips through.
    """
    division: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/status",
            response_model=LooperStatusResponse,
            operation_id="looper_get_status",
            summary="Snapshot of every track in the looper")
async def get_status(service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    return LooperStatusResponse.from_status(service.get_status())


@router.post("/track/{track}/record",
             response_model=LooperStatusResponse,
             operation_id="looper_record_stomp",
             summary="Record stomp (empty→record / record→play / play→overdub / overdub→play / stopped→play)")
async def record_stomp(track: int,
                       service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.record(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/stop",
             response_model=LooperStatusResponse,
             operation_id="looper_stop_stomp",
             summary="Stop or resume playback for the track")
async def stop_stomp(track: int,
                     service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.stop_track(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/clear",
             response_model=LooperStatusResponse,
             operation_id="looper_clear_stomp",
             summary="Clear the track's loop content")
async def clear_stomp(track: int,
                      service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.clear(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/undo",
             response_model=LooperStatusResponse,
             operation_id="looper_undo_stomp",
             summary="Undo the most recent overdub layer (up to 4 deep)")
async def undo_stomp(track: int,
                     service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.undo(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/redo",
             response_model=LooperStatusResponse,
             operation_id="looper_redo_stomp",
             summary="Redo a previously-undone overdub layer")
async def redo_stomp(track: int,
                     service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.redo(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/level",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_level",
              summary="Set per-track playback level in dB (clamped -60..+6)")
async def set_track_level(track: int, body: SetLevelRequest,
                          service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.set_level_db(track, body.db)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/muted",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_muted",
              summary="Mute / unmute the track in the looper master sum")
async def set_track_muted(track: int, body: SetBoolRequest,
                          service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.set_muted(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/soloed",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_soloed",
              summary="Solo / un-solo the track (any solo'd track mutes the rest)")
async def set_track_soloed(track: int, body: SetBoolRequest,
                           service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.set_soloed(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/reverse",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_reverse",
              summary="Reverse the playback direction of the track")
async def set_track_reverse(track: int, body: SetBoolRequest,
                            service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.set_reverse(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/half-speed",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_half_speed",
              summary="Halve the playback rate (one octave down)")
async def set_track_half_speed(track: int, body: SetBoolRequest,
                               service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    try:
        result = service.set_half_speed(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/master/level",
              response_model=LooperStatusResponse,
              operation_id="looper_set_master_level",
              summary="Set the looper master bus level in dB (clamped -60..+6)")
async def set_master_level(body: SetLevelRequest,
                           service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    return LooperStatusResponse.from_status(service.set_master_level_db(body.db))


@router.patch("/track/{track}/locked",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_locked",
              summary="T2512-LOCK — toggle write-lock for a track")
async def set_track_locked(track: int, body: SetBoolRequest,
                           service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-LOCK — set the write-lock flag for a track.

    Locked tracks reject ``record``, ``clear``, ``undo``, ``redo`` with
    HTTP 409 Conflict (error code ``track_locked``). Playback, level,
    mute, solo, reverse, half-speed, and stop remain live so the
    operator can still mix and stop the loop.
    """
    try:
        result = service.set_locked(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/one-shot",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_one_shot",
              summary="T2512-OS — toggle one-shot / trigger mode for a track")
async def set_track_one_shot(track: int, body: SetBoolRequest,
                             service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-OS — set the one-shot / trigger flag for a track.

    When True, the track is meant to auto-stop after one playhead
    pass (actual stop scheduling lives in a separate runner — see
    ``T2512-OS-RUNNER`` in PROJECT_WORKLIST). Setting the flag does
    not alter loop content or any other playback parameter; the
    operator clears it by sending ``{"value": false}``.
    """
    try:
        result = service.set_one_shot(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/one-shot-passes",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_one_shot_passes",
              summary="T2512-OS-COUNT — set consecutive-pass count for one-shot mode (1..32)")
async def set_track_one_shot_passes(track: int, body: SetOneShotPassesRequest,
                                    service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-OS-COUNT — set how many consecutive loop passes a
    one-shot track plays before the runner auto-stops it.

    Clamped 1..32 (1 preserves the original T2512-OS single-pass
    contract). Setting this on a non-one-shot track is intentionally
    allowed: operators may stage the count before flipping the
    one-shot flag. The runner only reads this when a track first
    enters the one-shot+playing state.
    """
    try:
        result = service.set_one_shot_passes(track, body.passes)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/auto-armed",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_auto_armed",
              summary="T2512-AUTO — arm / disarm input-threshold auto-record for a track")
async def set_track_auto_armed(track: int, body: SetBoolRequest,
                               service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-AUTO — operator arms input-level auto-record on a track.

    Storage-only in v1: actual record triggering depends on the
    forthcoming engine input-level RMS push (T2512-AUTO-TRIGGER).
    """
    try:
        result = service.set_auto_armed(track, body.value)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/auto-threshold",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_auto_threshold",
              summary="T2512-AUTO — set the input-threshold dB for auto-record (clamped -90..0)")
async def set_track_auto_threshold(track: int, body: SetAutoThresholdRequest,
                                   service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-AUTO — set the input-threshold dB for auto-record."""
    try:
        result = service.set_auto_threshold_db(track, body.db)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/auto-record/push",
             response_model=AutoRecordPushResponse,
             operation_id="looper_auto_record_push",
             summary="T2512-AUTO-PUSH — feed an input-level RMS sample to the auto-record trigger")
async def auto_record_push(track: int, body: AutoRecordPushRequest,
                           service: LooperService = Depends(_get_service)) -> AutoRecordPushResponse:
    """T2512-AUTO-PUSH — drive the T2512-AUTO-TRIGGER state machine
    over HTTP. Lets test harnesses or external level monitors fire
    auto-record without the engine binding being wired.

    Returns ``{fired: bool, status: LooperStatusResponse}``. The
    trigger only fires when the track is armed + EMPTY + level >
    threshold + outside the cooldown window; otherwise ``fired``
    is False and ``status`` reflects the unchanged state.
    """
    # Construct a route-scoped trigger bound to the injected service.
    # Using the singleton would shadow the route's DI override in
    # tests; per-call construction keeps cooldown semantics
    # per-request (acceptable for an HTTP-driven push path — the
    # operator's external monitor is the cooldown authority).
    from app.services.looper_auto_record_trigger import (
        LooperAutoRecordTrigger,
    )
    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(track, body.level_db)
    return AutoRecordPushResponse(
        fired=fired,
        status=LooperStatusResponse.from_status(service.get_status()),
    )


@router.post("/track/{track}/auto-record/reset-peak",
             response_model=LooperStatusResponse,
             operation_id="looper_reset_auto_peak",
             summary="T2512-AUTO-PEAK — reset the recent-peak indicator for a track")
async def reset_auto_peak(track: int,
                          service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-AUTO-PEAK — clear the per-track ``auto_last_level_db``
    + ``auto_peak_db`` indicators without touching the arm flag or
    threshold. UI exposes this as a "reset peak" button next to the
    threshold dial so operators can recalibrate after a deliberately
    loud hit.
    """
    try:
        result = service.reset_auto_peak(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/stop-mode",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_stop_mode",
              summary="T2512-FADE — set the track's stop mode (\"hard\" | \"fade\")")
async def set_track_stop_mode(track: int, body: SetStopModeRequest,
                              service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-FADE — set the operator-visible stop mode for a track.

    State-only in v1: the C++ engine still performs a hard cutoff
    on ``stop_track`` regardless of this value. The actual gain
    ramp is gated behind T2512-FADE-RAMP for RT-safety review.
    """
    try:
        result = service.set_stop_mode(track, body.mode)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/fade-ms",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_fade_ms",
              summary="T2512-FADE — set the fade-out duration in ms (clamped 0..5000)")
async def set_track_fade_ms(track: int, body: SetFadeMsRequest,
                            service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-FADE — set the fade-out duration in milliseconds."""
    try:
        result = service.set_fade_ms(track, body.fade_ms)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/sync-mode",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_sync_mode",
              summary="T2512-SYNC — set per-track sync mode (\"free\" | \"master\" | \"slave\")")
async def set_track_sync_mode(track: int, body: SetSyncModeRequest,
                              service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SYNC — set per-track sync mode.

    State-only in v1: the engine still plays every track at its own
    captured length regardless of this value. Actual loop-length
    locking is gated behind T2512-SYNC-LOCK (RT-critical).

    Service enforces the "at most one master" invariant: promoting
    a track to "master" demotes any other track currently set to
    "master" back to "free".
    """
    try:
        result = service.set_sync_mode(track, body.mode)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/slices",
             response_model=LooperStatusResponse,
             operation_id="looper_add_track_slice",
             summary="T2512-SLICE — add a non-destructive slice to a track")
async def add_track_slice(track: int, body: AddSliceRequest,
                          service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SLICE — append a slice. Overlaps with existing slices
    return HTTP 409 ``slice_overlap``; the per-track 64-slice cap
    returns ``slice_limit``."""
    try:
        result = service.add_slice(
            track, body.start_frame, body.end_frame, body.label
        )
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.post("/track/{track}/slices/at-playhead",
             response_model=LooperStatusResponse,
             operation_id="looper_add_slice_at_playhead",
             summary="T2512-SLICE-AT-PLAYHEAD — add a slice from the previous boundary to the current playhead")
async def add_slice_at_playhead(track: int, body: AddSliceAtPlayheadRequest,
                                service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SLICE-AT-PLAYHEAD — convenience helper that reads the
    current playhead and adds a slice from the previous slice
    boundary up to it. Returns HTTP 400 ``invalid_slice`` when the
    playhead is at 0 (no captured content yet) or before the
    previous slice's end (no new region).
    """
    try:
        result = service.add_slice_at_playhead(track, body.label)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.delete("/track/{track}/slices",
               response_model=LooperStatusResponse,
               operation_id="looper_clear_track_slices",
               summary="T2512-SLICE — clear all slices on a track")
async def clear_track_slices(track: int,
                             service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SLICE — drop every slice on a track. Loop content is
    unaffected."""
    try:
        result = service.clear_slices(track)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.delete("/track/{track}/slices/{start_frame}",
               response_model=LooperStatusResponse,
               operation_id="looper_delete_track_slice",
               summary="T2512-SLICE-DEL — drop a single slice by start_frame")
async def delete_track_slice(track: int, start_frame: int,
                             service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SLICE-DEL — remove the slice with the matching start_frame.

    Returns HTTP 404 ``slice_not_found`` when no slice on the track
    has that start_frame. Loop content is unaffected.
    """
    try:
        result = service.delete_slice(track, start_frame)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/slices/{start_frame}",
              response_model=LooperStatusResponse,
              operation_id="looper_rename_track_slice",
              summary="T2512-SLICE-RENAME — replace a slice's label by start_frame")
async def rename_track_slice(track: int, start_frame: int,
                             body: RenameSliceRequest,
                             service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-SLICE-RENAME — update an existing slice's label.

    Frame range is unchanged; label is trimmed + truncated to 64
    chars. Empty label clears the existing one. Returns HTTP 404
    ``slice_not_found`` when no slice on the track matches.
    """
    try:
        result = service.rename_slice(track, start_frame, body.label)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


@router.patch("/track/{track}/quantize-division",
              response_model=LooperStatusResponse,
              operation_id="looper_set_track_quantize_division",
              summary="T2512-QUANT-WIRE — set the auto-close grid (\"off\" | grid name)")
async def set_track_quantize_division(track: int,
                                      body: SetQuantizeDivisionRequest,
                                      service: LooperService = Depends(_get_service)) -> LooperStatusResponse:
    """T2512-QUANT-WIRE — set per-track quantize grid for auto-close.

    State-only in v1: the math is wired (``LooperService.quantize_record_length``)
    so callers and the future engine-side auto-close can read it,
    but recording stop currently still uses the raw playhead. Engine
    integration lands later under T2512-QUANT-ENGINE.
    """
    try:
        result = service.set_quantize_division(track, body.division)
    except LooperServiceError as exc:
        raise _http_for_error(exc)
    return LooperStatusResponse.from_status(result)


# ---------------------------------------------------------------------------
# T2512-SNAP — snapshot integration primitive
# ---------------------------------------------------------------------------
#
# These routes expose ``export_state`` + ``apply_state`` so a snapshot
# service hook (or an operator with curl) can save/load operator
# policy state across snapshot recalls. Loop content is not part of
# the payload — only knobs that the operator sets (lock, one-shot,
# auto-record arm + threshold, master level).
#
# Two patterns make sense for the snapshot integration:
#   1. Snapshot service calls export_state() at save time, writes the
#      payload to its store, and calls apply_state(payload) at recall
#      time.
#   2. Operator backups: GET /state, POST /state.
#
# Both are served by the same routes below.


class LooperStateTrackPayload(BaseModel):
    locked: bool = False
    one_shot: bool = False
    auto_armed: bool = False
    auto_threshold_db: float = -36.0
    stop_mode: str = "hard"
    fade_ms: int = 250
    sync_mode: str = "free"
    slices: list[TrackSliceResponse] = []
    quantize_division: str = "off"


class LooperStatePayload(BaseModel):
    schema_version: int = 1
    tracks: list[LooperStateTrackPayload]
    master_level_db: float = 0.0


@router.get("/state",
            response_model=LooperStatePayload,
            operation_id="looper_export_state",
            summary="T2512-SNAP — serialize operator policy state for snapshot save")
async def export_state(
    service: LooperService = Depends(_get_service),
) -> LooperStatePayload:
    return LooperStatePayload(**service.export_state())


@router.post("/state",
             response_model=LooperStatusResponse,
             operation_id="looper_apply_state",
             summary="T2512-SNAP — restore operator policy state from a snapshot payload")
async def apply_state(
    body: LooperStatePayload,
    service: LooperService = Depends(_get_service),
) -> LooperStatusResponse:
    """T2512-SNAP — apply a saved snapshot payload to the looper.

    Tolerant of missing optional keys; unknown future fields are
    ignored. Out-of-range values are clamped by the underlying
    setters (-90..0 dB threshold; -60..+6 dB master level).
    """
    result = service.apply_state(body.model_dump())
    return LooperStatusResponse.from_status(result)


@router.get("/activity",
            response_model=ActivityLogResponse,
            operation_id="looper_get_activity",
            summary="T2512-ACTIVITY — recent operator-action audit log (capped 200 events)")
async def get_activity(
    verb: str | None = Query(
        None,
        description=(
            "T2512-ACTIVITY-FILTER — case-sensitive exact-match filter on the "
            "verb field. Multiple comma-separated values OR-match "
            "(e.g. ?verb=record,stop). Unknown verbs match nothing."
        ),
    ),
    track: int | None = Query(
        None,
        ge=0,
        le=3,
        description=(
            "T2512-ACTIVITY-FILTER — exact-match filter on the track field. "
            "Events with track=null (e.g. reset_state) are excluded when this "
            "filter is set."
        ),
    ),
    limit: int | None = Query(
        None,
        ge=1,
        le=200,
        description=(
            "T2512-ACTIVITY-FILTER — return only the most recent N events "
            "after verb/track filtering. Applied last so a low limit on a "
            "big log doesn't drop matching events from the head."
        ),
    ),
    service: LooperService = Depends(_get_service),
) -> ActivityLogResponse:
    """T2512-ACTIVITY — return the recent activity log.

    Oldest first; newest last. Capped at 200 events (configured on
    the service's internal deque). Loop content and engine state
    are not in this log — it's an operator-actions trail, not a
    full state stream.

    T2512-ACTIVITY-FILTER — optional ``verb`` (comma-separated set)
    and ``track`` (0..3) query params narrow the result; ``limit``
    truncates to the most recent N entries *after* filtering so the
    operator's filter intent isn't masked by an early-drop. ``cap``
    in the response remains 200 (the buffer size) regardless of
    filters — clients can tell the absolute ceiling vs. the
    filtered slice.
    """
    events = service.get_activity()

    if verb is not None:
        # Comma-separated OR-set; empty tokens are ignored. Case-sensitive
        # match because activity verbs are canonical names (record, stop,
        # clear, undo, redo, reset_state, apply_state).
        wanted = {token.strip() for token in verb.split(",") if token.strip()}
        if wanted:
            events = [ev for ev in events if ev.verb in wanted]
        else:
            events = []

    if track is not None:
        events = [ev for ev in events if ev.track == track]

    if limit is not None and len(events) > limit:
        events = events[-limit:]

    return ActivityLogResponse(
        events=[ActivityEventResponse(**ev.to_payload()) for ev in events],
        cap=200,
    )


@router.delete("/activity",
               response_model=ActivityLogResponse,
               operation_id="looper_clear_activity",
               summary="T2512-ACTIVITY — drop every recorded activity event")
async def clear_activity(
    service: LooperService = Depends(_get_service),
) -> ActivityLogResponse:
    """T2512-ACTIVITY — clear the audit log. Returns an empty
    ``ActivityLogResponse`` so the client can confirm the wipe in
    one round-trip."""
    service.clear_activity()
    return ActivityLogResponse(events=[], cap=200)


@router.get("/metrics",
            response_model=MetricsResponse,
            operation_id="looper_get_metrics",
            summary="T2512-METRICS — verb invocation counters")
async def get_metrics(
    service: LooperService = Depends(_get_service),
) -> MetricsResponse:
    """T2512-METRICS — return the current verb counter snapshot.

    Each key is a verb name (record / stop / clear / undo / redo /
    reset_state / apply_state); each value is the cumulative count
    since the last reset.
    """
    return MetricsResponse(counters=service.get_metrics())


@router.delete("/metrics",
               response_model=MetricsResponse,
               operation_id="looper_reset_metrics",
               summary="T2512-METRICS — zero the verb counters")
async def reset_metrics(
    service: LooperService = Depends(_get_service),
) -> MetricsResponse:
    """T2512-METRICS — clear every verb counter. The activity log is
    unaffected — use ``DELETE /activity`` for that."""
    service.reset_metrics()
    return MetricsResponse(counters={})


@router.post("/state/reset",
             response_model=LooperStatusResponse,
             operation_id="looper_reset_state",
             summary="T2512-RESET — return all operator policy state to defaults")
async def reset_state(
    service: LooperService = Depends(_get_service),
) -> LooperStatusResponse:
    """T2512-RESET — clear every Python-side per-track flag (lock,
    one-shot, auto-record, stop mode, fade, sync, quantize, slices)
    and reset master level to 0 dB.

    Captured loop content is NOT touched — operators clear loops
    with the per-track ``clear`` verb. The state-machine state /
    loop_length / playhead come from the engine and are not reset.
    """
    return LooperStatusResponse.from_status(service.reset_state())
