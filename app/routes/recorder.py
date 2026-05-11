"""T2508-4 — Multi-Track Recorder session-lifecycle HTTP routes.

Versioned under ``/api/v1/recorder/sessions`` per the API contract
standards. The route layer is a thin FastAPI shell over the
``RecorderService`` singleton from ``app/services/recorder_service.py``;
all state, transitions, and validation live in the service.

Mapping ``RecorderServiceError.code`` → HTTP status:

    unknown_session       → 404
    invalid_state         → 409 (rolling a stopped session, etc.)
    invalid_snapshot_id   → 400
    (anything else)       → 500

RT-safety profile: routes run on the FastAPI asyncio loop; they
never enter the JUCE audioCallback. The injected
``RecorderTransport`` ships verbs to the engine over the controller-
host IPC (consumed by the T2507 RT-safe tap nodes).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.services.recorder_service import (
    RecorderService,
    RecorderServiceError,
    RecorderSessionStatus,
    get_recorder_service,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/recorder", tags=["recorder"])


# ---------------------------------------------------------------------------
# Error-envelope mapping
# ---------------------------------------------------------------------------


_ERROR_STATUS: dict[str, int] = {
    "unknown_session": status.HTTP_404_NOT_FOUND,
    "invalid_state": status.HTTP_409_CONFLICT,
    "invalid_snapshot_id": status.HTTP_400_BAD_REQUEST,
}


def _http_for_error(exc: RecorderServiceError) -> HTTPException:
    """Translate a service-side error into a FastAPI ``HTTPException``.

    The detail body is the operator-readable message; the ``code``
    field is preserved on the exception for clients that parse the
    response envelope (FastAPI emits ``detail`` either way).
    """
    code = _ERROR_STATUS.get(exc.code, status.HTTP_500_INTERNAL_SERVER_ERROR)
    return HTTPException(status_code=code, detail=str(exc))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TapConfig(BaseModel):
    """Per-chain pre/post-FX capture flags. Aligned with the T2506
    snapshot graph ``recording.tap_matrix`` shape."""

    pre_fx: bool = False
    post_fx: bool = False


class ArmSessionRequest(BaseModel):
    """POST /api/v1/recorder/sessions request body."""

    snapshot_id: int = Field(..., ge=0, description="Snapshot id to record against.")
    tap_matrix: dict[str, TapConfig] = Field(
        default_factory=dict,
        description="Per-chain pre_fx/post_fx capture flags. Empty dict = no taps installed (status surface only).",
    )


class RecorderSessionStatusResponse(BaseModel):
    """Frozen projection of an in-flight or just-completed session."""

    session_id: str
    snapshot_id: int
    state: str  # ARMED / ROLLING / STOPPED
    armed: bool
    rolling: bool
    started_at: Optional[str]
    rolling_at: Optional[str]
    stopped_at: Optional[str]
    tap_matrix: dict[str, dict[str, bool]]
    participating_nodes: list[str]

    @classmethod
    def from_status(cls, status_obj: RecorderSessionStatus) -> "RecorderSessionStatusResponse":
        return cls(**status_obj.to_payload())


class RecorderSessionListResponse(BaseModel):
    """GET /api/v1/recorder/sessions response body."""

    sessions: list[RecorderSessionStatusResponse]
    count: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


def _get_service() -> RecorderService:
    """DI seam for tests — override ``get_recorder_service`` to
    inject a fixture service."""
    return get_recorder_service()


@router.post(
    "/sessions",
    response_model=RecorderSessionStatusResponse,
    operation_id="recorder_arm_session",
    summary="Arm a new recorder session",
    description=(
        "Allocates a session id, installs the requested taps (per the "
        "snapshot's recording.tap_matrix), and emits a recorder.arm "
        "verb to the audio engine. Returns the initial ARMED status."
    ),
    status_code=status.HTTP_201_CREATED,
)
async def arm_session(
    body: ArmSessionRequest,
    service: RecorderService = Depends(_get_service),
) -> RecorderSessionStatusResponse:
    try:
        result = await service.arm_session(
            snapshot_id=body.snapshot_id,
            tap_matrix={k: v.model_dump() for k, v in body.tap_matrix.items()},
        )
    except RecorderServiceError as exc:
        raise _http_for_error(exc)
    return RecorderSessionStatusResponse.from_status(result)


@router.post(
    "/sessions/{session_id}/roll",
    response_model=RecorderSessionStatusResponse,
    operation_id="recorder_start_rolling",
    summary="Start rolling on an armed session",
)
async def start_rolling(
    session_id: str,
    service: RecorderService = Depends(_get_service),
) -> RecorderSessionStatusResponse:
    try:
        result = await service.start_rolling(session_id=session_id)
    except RecorderServiceError as exc:
        raise _http_for_error(exc)
    return RecorderSessionStatusResponse.from_status(result)


@router.post(
    "/sessions/{session_id}/stop",
    response_model=RecorderSessionStatusResponse,
    operation_id="recorder_stop_session",
    summary="Stop a rolling or armed session",
)
async def stop_session(
    session_id: str,
    service: RecorderService = Depends(_get_service),
) -> RecorderSessionStatusResponse:
    try:
        result = await service.stop(session_id=session_id)
    except RecorderServiceError as exc:
        raise _http_for_error(exc)
    return RecorderSessionStatusResponse.from_status(result)


@router.delete(
    "/sessions/{session_id}",
    operation_id="recorder_disarm_session",
    summary="Disarm + drop a session entirely",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def disarm_session(
    session_id: str,
    service: RecorderService = Depends(_get_service),
) -> None:
    # ``disarm_session`` is idempotent on unknown — never raises.
    await service.disarm_session(session_id=session_id)


@router.get(
    "/sessions/{session_id}",
    response_model=RecorderSessionStatusResponse,
    operation_id="recorder_get_session_status",
    summary="Fetch the current status of an in-flight session",
)
async def get_session_status(
    session_id: str,
    service: RecorderService = Depends(_get_service),
) -> RecorderSessionStatusResponse:
    try:
        result = await service.get_session_status(session_id=session_id)
    except RecorderServiceError as exc:
        raise _http_for_error(exc)
    return RecorderSessionStatusResponse.from_status(result)


@router.get(
    "/sessions",
    response_model=RecorderSessionListResponse,
    operation_id="recorder_list_sessions",
    summary="List all in-flight recorder sessions on this node",
)
async def list_sessions(
    service: RecorderService = Depends(_get_service),
) -> RecorderSessionListResponse:
    sessions = await service.list_sessions()
    return RecorderSessionListResponse(
        sessions=[RecorderSessionStatusResponse.from_status(s) for s in sessions],
        count=len(sessions),
    )
