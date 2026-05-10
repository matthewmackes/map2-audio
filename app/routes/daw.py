"""T2503 Set 3 — DAW service FastAPI routes (mode-switch surface).

Set 3 ships only ``/api/daw/mode`` (GET, POST). Set 4 fills in the full verb
surface (``/api/v1/daw/transport``, ``/api/v1/daw/tracks``, etc.).

The route surface is **always registered** so OpenAPI is stable across builds.
When the engine was built without ``-DMAP2_DAW_MODE=ON``, every operation
returns the standard error envelope with HTTP 503.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.daw_service import (
    DawModeStatus,
    DawModeUnavailableError,
    DawService,
    EngineMode,
    TransitionState,
    get_daw_service,
)

router = APIRouter(prefix="/api/daw", tags=["daw"])


class DawModeStatusResponse(BaseModel):
    mode: EngineMode = Field(
        ..., description="Current engine mode (live | daw)."
    )
    state: TransitionState = Field(
        ...,
        description=(
            "Current state-machine state. 'running' means the named mode is "
            "active; any other value indicates a transition in flight."
        ),
    )
    daw_mode_available: bool = Field(
        ...,
        description=(
            "Whether the running engine was built with -DMAP2_DAW_MODE=ON. "
            "When false, mode-switch requests return 503."
        ),
    )
    last_error: Optional[str] = Field(
        default=None,
        description=(
            "Last error message from a transition, or null. Cleared on the "
            "next successful request_mode_switch."
        ),
    )

    @classmethod
    def from_status(cls, status: DawModeStatus) -> "DawModeStatusResponse":
        return cls(
            mode=status.mode,
            state=status.state,
            daw_mode_available=status.daw_mode_available,
            last_error=status.last_error,
        )


class DawModeSwitchRequest(BaseModel):
    mode: EngineMode = Field(
        ..., description="Target mode. 'live' or 'daw'."
    )


def _service() -> DawService:
    return get_daw_service()


def _unavailable_response() -> dict:
    """Standard error envelope per docs/api-contract-standards.md."""
    return {
        "error": {
            "code": "daw_mode_unavailable",
            "message": (
                "DAW service is not available in this build. "
                "Rebuild juce-engine with -DMAP2_DAW_MODE=ON to enable."
            ),
            "details": None,
        }
    }


@router.get(
    "/mode",
    response_model=DawModeStatusResponse,
    operation_id="daw_get_mode",
    summary="Get current DAW mode + state-machine status",
)
async def get_daw_mode() -> DawModeStatusResponse:
    """Return the current engine mode and state-machine state.

    Always succeeds (returns 200) even when ``MAP2_DAW_MODE`` is OFF — the
    response simply reports ``daw_mode_available: false`` so the caller can
    distinguish a flag-OFF build from a transition-in-flight.
    """
    return DawModeStatusResponse.from_status(_service().status())


@router.post(
    "/mode",
    response_model=DawModeStatusResponse,
    operation_id="daw_request_mode_switch",
    summary="Request a transition to live or DAW mode",
    responses={
        503: {
            "description": "DAW mode disabled in this build.",
            "content": {"application/json": {"schema": {"type": "object"}}},
        }
    },
)
async def request_daw_mode_switch(
    request: DawModeSwitchRequest,
) -> DawModeStatusResponse:
    """Request a hard mode switch.

    The state machine runs the full Stopping → Releasing → Initializing →
    Running ladder. Returns the post-transition status; for the in-process
    Set 3 simulator this is synchronous, so the response always has
    ``state: "running"`` and ``mode: <target>`` on success.

    When ``MAP2_DAW_MODE`` is OFF, returns 503 with the standard error
    envelope.
    """
    try:
        status = _service().request_mode_switch(request.mode)
    except DawModeUnavailableError:
        raise HTTPException(status_code=503, detail=_unavailable_response())
    return DawModeStatusResponse.from_status(status)
