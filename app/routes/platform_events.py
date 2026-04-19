"""Canonical PlatformEvent HTTP routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from pydantic import BaseModel, Field

from app.services.platform_event.bus import get_platform_event_bus
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.store import get_platform_event_store

router = APIRouter(prefix="/api/platform-events", tags=["Platform Events"])


class PlatformEventsResponse(BaseModel):
    events: list[PlatformEvent] = Field(default_factory=list)
    count: int = 0


class PlatformEventAckRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=255)
    event_id: str = Field(..., min_length=1, max_length=255)


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
