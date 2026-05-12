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

from fastapi import APIRouter, Depends, HTTPException, status
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
    }.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    return HTTPException(status_code=code, detail=str(exc))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


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


class LooperStatusResponse(BaseModel):
    tracks: list[TrackStatusResponse]
    active_track_count: int
    sync_master: bool
    master_level_db: float

    @classmethod
    def from_status(cls, status_obj: LooperStatus) -> "LooperStatusResponse":
        return cls(**status_obj.to_payload())


class SetLevelRequest(BaseModel):
    db: float = Field(..., ge=-60.0, le=6.0)


class SetBoolRequest(BaseModel):
    value: bool


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
