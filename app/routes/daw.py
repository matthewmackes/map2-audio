"""T2503 — DAW service FastAPI routes.

- ``/api/daw/mode`` (Set 3) — mode-switch surface.
- ``/api/v1/daw/transport`` etc. (Set 4) — full verb surface.

The route surface is **always registered** so OpenAPI is stable across builds.
When the engine was built without ``-DMAP2_DAW_MODE=ON``, every operation
returns the standard error envelope with HTTP 503.
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Path, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.schemas.daw import (
    AutomationSetPointRequest,
    ClipAddRequest,
    ClipMoveRequest,
    DawActionAccepted,
    PluginAddToTrackRequest,
    PluginSetParamRequest,
    ProjectLoadRequest,
    ProjectNewRequest,
    ProjectSaveRequest,
    ProjectStatusResponse,
    TrackCreateRequest,
    TrackSetArmRequest,
    TransportRecordRequest,
    TransportSetPositionRequest,
)
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


# ---------------------------------------------------------------------------
# T2503 Set 4 — /api/v1/daw verb surface
# ---------------------------------------------------------------------------
# These routes shape the full DAW verb surface as REST. Every endpoint maps
# 1:1 to a daw.* engine_command verb in app/services/daw_handlers.py. The
# route handler is intentionally thin: it validates the request, builds an
# EngineCommandContext-shaped dict, and dispatches via the in-process
# dispatcher. With MAP2_DAW_MODE=OFF, every endpoint returns 503 + standard
# envelope (same shape as /api/daw/mode POST).
#
# Bench-side, the dispatcher runs in the engine_command_bridge so engine-side
# state changes propagate back via WebSocket events on
# /api/v1/daw/events (T2503 Set 4 also).
# ---------------------------------------------------------------------------

router_v1 = APIRouter(prefix="/api/v1/daw", tags=["daw"])


def _gate_or_dispatch(verb: str, args: list, value=None) -> DawActionAccepted:
    """Common path for v1 verbs.

    Set 4 ships the FastAPI surface + dispatcher wiring; Set 7 adds the real
    engine-side hooks. Until then, the dispatcher logs the dispatch and
    returns ``accepted=True`` so the API contract is stable. Flag-OFF still
    returns 503 from the mode-availability check.
    """
    svc = _service()
    if not svc.daw_mode_available:
        raise HTTPException(status_code=503, detail=_unavailable_response())

    # Route through the in-process DAW dispatcher seam. We build a minimal
    # engine_command shape; the actual dispatcher wiring lives in
    # app/services/daw_dispatch_seam.py (Set 4 also). The seam logs verbs in
    # the no-hook path so tests can assert dispatch happened.
    from app.services.daw_dispatch_seam import dispatch_daw_verb

    dispatch_daw_verb(verb=verb, args=args, value=value)
    return DawActionAccepted(verb=verb)


# --- Transport ---


@router_v1.post(
    "/transport/play",
    response_model=DawActionAccepted,
    operation_id="daw_v1_transport_play",
)
async def v1_transport_play() -> DawActionAccepted:
    return _gate_or_dispatch("daw.transport.play", args=[])


@router_v1.post(
    "/transport/stop",
    response_model=DawActionAccepted,
    operation_id="daw_v1_transport_stop",
)
async def v1_transport_stop() -> DawActionAccepted:
    return _gate_or_dispatch("daw.transport.stop", args=[])


@router_v1.post(
    "/transport/record",
    response_model=DawActionAccepted,
    operation_id="daw_v1_transport_record",
)
async def v1_transport_record(request: TransportRecordRequest) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.transport.record",
        args=[],
        value=1.0 if request.arm else 0.0,
    )


@router_v1.post(
    "/transport/set_position",
    response_model=DawActionAccepted,
    operation_id="daw_v1_transport_set_position",
)
async def v1_transport_set_position(
    request: TransportSetPositionRequest,
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.transport.set_position",
        args=[],
        value=float(request.samples),
    )


# --- Project lifecycle ---


@router_v1.post(
    "/projects",
    response_model=DawActionAccepted,
    operation_id="daw_v1_project_new",
)
async def v1_project_new(request: ProjectNewRequest) -> DawActionAccepted:
    return _gate_or_dispatch("daw.project.new", args=[request.name])


@router_v1.post(
    "/projects/load",
    response_model=DawActionAccepted,
    operation_id="daw_v1_project_load",
)
async def v1_project_load(request: ProjectLoadRequest) -> DawActionAccepted:
    return _gate_or_dispatch("daw.project.load", args=[request.path])


@router_v1.post(
    "/projects/save",
    response_model=DawActionAccepted,
    operation_id="daw_v1_project_save",
)
async def v1_project_save() -> DawActionAccepted:
    return _gate_or_dispatch("daw.project.save", args=[])


# --- Tracks ---


@router_v1.post(
    "/tracks",
    response_model=DawActionAccepted,
    operation_id="daw_v1_track_create",
)
async def v1_track_create(request: TrackCreateRequest) -> DawActionAccepted:
    args: list = [request.type.value]
    if request.name is not None:
        args.append(request.name)
    return _gate_or_dispatch("daw.track.create", args=args)


@router_v1.delete(
    "/tracks/{track_id}",
    response_model=DawActionAccepted,
    operation_id="daw_v1_track_delete",
)
async def v1_track_delete(
    track_id: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.track.delete",
        args=[],
        value=float(track_id),
    )


@router_v1.patch(
    "/tracks/{track_id}/arm",
    response_model=DawActionAccepted,
    operation_id="daw_v1_track_set_arm",
)
async def v1_track_set_arm(
    request: TrackSetArmRequest,
    track_id: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.track.set_arm",
        args=[request.armed],
        value=float(track_id),
    )


# --- Clips ---


@router_v1.post(
    "/clips",
    response_model=DawActionAccepted,
    operation_id="daw_v1_clip_add",
)
async def v1_clip_add(request: ClipAddRequest) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.clip.add",
        args=[
            request.track_id,
            request.start_samples,
            request.length_samples,
            request.source,
        ],
    )


@router_v1.delete(
    "/clips/{clip_id}",
    response_model=DawActionAccepted,
    operation_id="daw_v1_clip_remove",
)
async def v1_clip_remove(
    clip_id: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch("daw.clip.remove", args=[clip_id])


@router_v1.patch(
    "/clips/{clip_id}/move",
    response_model=DawActionAccepted,
    operation_id="daw_v1_clip_move",
)
async def v1_clip_move(
    request: ClipMoveRequest,
    clip_id: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.clip.move",
        args=[clip_id, request.new_start_samples],
    )


# --- Automation ---


@router_v1.post(
    "/automation/points",
    response_model=DawActionAccepted,
    operation_id="daw_v1_automation_set_point",
)
async def v1_automation_set_point(
    request: AutomationSetPointRequest,
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.automation.set_point",
        args=[request.lane_id, request.position, request.value],
    )


# --- Plugins ---


@router_v1.post(
    "/tracks/{track_id}/plugins",
    response_model=DawActionAccepted,
    operation_id="daw_v1_plugin_add_to_track",
)
async def v1_plugin_add_to_track(
    request: PluginAddToTrackRequest,
    track_id: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.plugin.add_to_track",
        args=[track_id, request.plugin_uri],
    )


@router_v1.delete(
    "/tracks/{track_id}/plugins/{slot_index}",
    response_model=DawActionAccepted,
    operation_id="daw_v1_plugin_remove_from_track",
)
async def v1_plugin_remove_from_track(
    track_id: int = Path(..., ge=0),
    slot_index: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.plugin.remove_from_track",
        args=[track_id, slot_index],
    )


@router_v1.patch(
    "/tracks/{track_id}/plugins/{slot_index}",
    response_model=DawActionAccepted,
    operation_id="daw_v1_plugin_set_param",
)
async def v1_plugin_set_param(
    request: PluginSetParamRequest,
    track_id: int = Path(..., ge=0),
    slot_index: int = Path(..., ge=0),
) -> DawActionAccepted:
    return _gate_or_dispatch(
        "daw.plugin.set_param",
        args=[track_id, slot_index, request.param_id, request.value],
    )


# --- WebSocket events ---


@router_v1.websocket("/events")
async def v1_daw_events(websocket: WebSocket) -> None:
    """Subscribe to DAW events.

    Streams transport changes, track add/remove, clip moves, plugin param
    changes, and project dirty/saved transitions. The first message is a
    snapshot envelope so the React reference UI can hydrate without
    polling.

    With ``MAP2_DAW_MODE=OFF``, the WS still accepts connections — it just
    sends an empty snapshot and never publishes events. This keeps the WS
    surface uniform across builds for the React UI.
    """
    from app.services.daw_event_bus import get_daw_event_bus

    await websocket.accept()
    bus = get_daw_event_bus()
    queue = await bus.subscribe()

    try:
        # Initial hydration snapshot.
        svc = _service()
        status = svc.status()
        await websocket.send_json(
            {
                "kind": "snapshot",
                "payload": {
                    "mode": status.mode.value,
                    "state": status.state.value,
                    "daw_mode_available": status.daw_mode_available,
                },
                "timestamp": time.time(),
            }
        )

        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        await bus.unsubscribe(queue)
