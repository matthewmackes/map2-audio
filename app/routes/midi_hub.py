"""MIDI Hub API routes (traffic monitor + hub lifecycle baseline)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.router import get_midi_router
from app.services.midi_hub.traffic_monitor import get_midi_traffic_monitor


router = APIRouter(prefix="/api/midi/hub", tags=["midi-hub"])


class TrafficExportRequest(BaseModel):
    format: str = Field(default="json")
    limit: int = Field(default=5000, ge=1, le=100000)


@router.get("/status")
async def get_hub_status() -> Dict[str, Any]:
    hub = get_midi_hub()
    router_service = get_midi_router()
    monitor = get_midi_traffic_monitor()

    payload = hub.to_dict()
    payload["route_count"] = len(router_service.list_routes())
    payload["route_match_mode"] = router_service.get_match_mode()
    payload["traffic"] = {
        "captured_total": monitor.snapshot(limit=1).get("captured_total", 0),
        "capacity": monitor.snapshot(limit=1).get("capacity", 0),
    }
    return payload


@router.post("/start")
async def start_hub() -> Dict[str, Any]:
    hub = get_midi_hub()
    router_service = get_midi_router()
    if not hub.running:
        hub.start()
    if not router_service.running:
        router_service.start()
    return {
        "running": hub.running,
        "router_running": router_service.running,
    }


@router.post("/stop")
async def stop_hub() -> Dict[str, Any]:
    hub = get_midi_hub()
    router_service = get_midi_router()
    if router_service.running:
        router_service.stop()
    if hub.running:
        hub.stop()
    return {
        "running": hub.running,
        "router_running": router_service.running,
    }


@router.get("/traffic/snapshot")
async def get_traffic_snapshot(
    limit: int = Query(default=500, ge=1, le=50000),
    source_port: Optional[str] = Query(default=None),
    destination_port: Optional[str] = Query(default=None),
    message_type: Optional[str] = Query(default=None),
    direction: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    monitor = get_midi_traffic_monitor()
    return monitor.snapshot(
        limit=limit,
        source_port=source_port,
        destination_port=destination_port,
        message_type=message_type,
        direction=direction,
    )


@router.get("/traffic/stats")
async def get_traffic_stats() -> Dict[str, Any]:
    monitor = get_midi_traffic_monitor()
    return monitor.stats()


@router.post("/traffic/export")
async def export_traffic(req: TrafficExportRequest) -> Dict[str, Any]:
    monitor = get_midi_traffic_monitor()
    return monitor.export(format=req.format, limit=req.limit)


@router.post("/traffic/clear")
async def clear_traffic() -> Dict[str, Any]:
    monitor = get_midi_traffic_monitor()
    monitor.clear()
    return {"ok": True}
