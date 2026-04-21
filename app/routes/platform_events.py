"""Canonical PlatformEvent HTTP routes."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, Response, status
from pydantic import BaseModel, Field

from app.services.node_identity import NodeIdentity
from app.services.platform_event.bus import get_platform_event_bus
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.factories import make_event
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import get_platform_event_store

router = APIRouter(prefix="/api/platform-events", tags=["Platform Events"])


class PlatformEventsResponse(BaseModel):
    events: list[PlatformEvent] = Field(default_factory=list)
    count: int = 0


class PlatformEventAckRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=255)
    event_id: str = Field(..., min_length=1, max_length=255)


class PlatformEventTestRequest(BaseModel):
    """Request body for POST /api/platform-events/test (T2418-D).

    Lets the Event Feed UI emit a synthetic `platform.test.ping` event onto
    the bus so operators can verify the canonical control-plane is wired
    correctly and any configured outbound webhooks fire.
    """

    title: str = Field(default="Test event", min_length=1, max_length=255)
    message: str = Field(default="Synthetic platform.test.ping from the API & Webhooks console.", min_length=1, max_length=2000)
    severity: str = Field(default="info")
    source_service: str = Field(default="api-webhooks-ui", min_length=1, max_length=128)
    context: dict[str, Any] | None = None
    target_surfaces: list[str] | None = None


class PlatformEventTestResponse(BaseModel):
    event: PlatformEvent


def _normalized_values(values: list[str]) -> list[str]:
    return [str(value).strip() for value in values if str(value).strip()]


def _matches_surface(event: PlatformEvent, requested_surfaces: set[str]) -> bool:
    targets = {str(surface).strip() for surface in event.target_surfaces if str(surface).strip()}
    return not targets or bool(targets & requested_surfaces)


@router.get("", response_model=PlatformEventsResponse)
async def get_platform_events(
    kind: Annotated[list[str], Query()] = [],
    severity: Annotated[list[str], Query()] = [],
    node: Annotated[list[str], Query()] = [],
    surface: Annotated[list[str], Query()] = [],
    min_priority: float | None = Query(default=None, ge=0.0, le=1.0),
    cursor: str | None = Query(default=None, min_length=1, max_length=255),
    limit: int = Query(default=100, ge=1, le=1000),
    session_id: str | None = Query(default=None, min_length=1, max_length=255),
) -> PlatformEventsResponse:
    store = get_platform_event_store()
    events = store.query_events(
        limit=None,
        hours=None,
        source_nodes=_normalized_values(node) or None,
        severities=[value.lower() for value in _normalized_values(severity)] or None,
        kinds=_normalized_values(kind) or None,
    )

    requested_surfaces = set(_normalized_values(surface))
    if requested_surfaces:
        events = [event for event in events if _matches_surface(event, requested_surfaces)]

    if min_priority is not None:
        events = [event for event in events if event.priority >= float(min_priority)]

    normalized_session_id = str(session_id or "").strip()
    if normalized_session_id:
        acknowledged = store.get_acknowledged_event_ids(normalized_session_id)
        events = [event for event in events if event.event_id not in acknowledged]

    normalized_cursor = str(cursor or "").strip()
    if normalized_cursor:
        for index, event in enumerate(events):
            if event.event_id == normalized_cursor:
                events = events[index + 1 :]
                break

    events = events[:limit]
    return PlatformEventsResponse(events=events, count=len(events))


@router.post("/ack", status_code=status.HTTP_204_NO_CONTENT)
async def ack_platform_event(request: PlatformEventAckRequest) -> Response:
    await get_platform_event_bus().ack(request.session_id, request.event_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _resolve_severity(value: str) -> Severity:
    normalized = (value or "").strip().lower()
    for member in Severity:
        if member.value == normalized:
            return member
    return Severity.INFO


def _resolve_local_node_id() -> str:
    try:
        return NodeIdentity().node_id
    except Exception:
        return "local"


@router.post("/test", response_model=PlatformEventTestResponse, status_code=status.HTTP_202_ACCEPTED)
async def emit_test_platform_event(request: PlatformEventTestRequest = Body(default_factory=PlatformEventTestRequest)) -> PlatformEventTestResponse:
    """Emit a synthetic `platform.test.ping` event (T2418-D).

    Drives the live feed in the API & Webhooks panel and exercises any
    configured outbound webhook targets. The event is emitted via
    `PlatformEventBus.emit()` so it uses the same replay + ack + filter
    pipeline as any other platform event.
    """

    event = make_event(
        kind="platform.test.ping",
        severity=_resolve_severity(request.severity),
        source_node=_resolve_local_node_id(),
        source_service=request.source_service,
        title=request.title,
        message=request.message,
        context=request.context or {"origin": "api-webhooks-ui"},
        target_surfaces=request.target_surfaces or ["workspace.platforms.api-webhooks"],
    )
    await get_platform_event_bus().emit(event)
    return PlatformEventTestResponse(event=event)
