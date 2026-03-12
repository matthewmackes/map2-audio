"""API Observatory backend routes."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.api_observatory import get_api_observatory_service


router = APIRouter(prefix="/api/observatory", tags=["API Observatory"])


class SessionStartRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=160)


class SessionImportRequest(BaseModel):
    session: dict[str, Any]


@router.get("/traffic")
async def get_traffic(
    limit: int = Query(default=200, ge=1, le=5000),
    method: Optional[str] = Query(default=None),
    status_min: Optional[int] = Query(default=None, ge=100, le=599),
    status_max: Optional[int] = Query(default=None, ge=100, le=599),
    path_pattern: Optional[str] = Query(default=None),
    min_duration_ms: Optional[float] = Query(default=None, ge=0.0),
    min_size_bytes: Optional[int] = Query(default=None, ge=0),
):
    service = get_api_observatory_service()
    events = service.list_traffic_events(
        limit=limit,
        method=method,
        status_min=status_min,
        status_max=status_max,
        path_pattern=path_pattern,
        min_duration_ms=min_duration_ms,
        min_size_bytes=min_size_bytes,
    )
    return {
        "count": len(events),
        "recording_session_id": service.recording_session_id,
        "events": events,
    }


@router.get("/traffic/stats")
async def get_traffic_stats(
    limit: int = Query(default=500, ge=1, le=5000),
    method: Optional[str] = Query(default=None),
    status_min: Optional[int] = Query(default=None, ge=100, le=599),
    status_max: Optional[int] = Query(default=None, ge=100, le=599),
    path_pattern: Optional[str] = Query(default=None),
):
    service = get_api_observatory_service()
    events = service.list_traffic_events(
        limit=limit,
        method=method,
        status_min=status_min,
        status_max=status_max,
        path_pattern=path_pattern,
    )
    return service.build_traffic_stats(events)


@router.post("/traffic/recording/start")
async def start_recording(payload: SessionStartRequest):
    session = get_api_observatory_service().start_recording(payload.name)
    return {
        "session_id": session.session_id,
        "name": session.name,
        "started_at": session.started_at,
        "stopped_at": session.stopped_at,
    }


@router.post("/traffic/recording/stop")
async def stop_recording():
    session = get_api_observatory_service().stop_recording()
    if session is None:
        raise HTTPException(status_code=409, detail="No active recording session")
    return {
        "session_id": session.session_id,
        "name": session.name,
        "started_at": session.started_at,
        "stopped_at": session.stopped_at,
        "event_count": len(session.events),
    }


@router.get("/traffic/sessions")
async def list_sessions():
    return {"sessions": get_api_observatory_service().list_sessions()}


@router.get("/traffic/sessions/{session_id}")
async def get_session(session_id: str):
    session = get_api_observatory_service().get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return session


@router.get("/traffic/sessions/{session_id}/export")
async def export_session(session_id: str, format: str = Query(default="json")):
    service = get_api_observatory_service()
    if format == "har":
        payload = service.export_session_har(session_id)
        if payload is None:
            raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
        return payload

    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    return session


@router.post("/traffic/sessions/import")
async def import_session(payload: SessionImportRequest):
    imported = get_api_observatory_service().import_session(payload.session)
    return imported
