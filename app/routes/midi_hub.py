"""MIDI Hub API routes (traffic monitor + hub lifecycle baseline)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.router import get_midi_router
from app.services.midi_hub.traffic_monitor import get_midi_traffic_monitor


router = APIRouter(prefix="/api/midi/hub", tags=["midi-hub"])


class TrafficExportRequest(BaseModel):
    format: str = Field(default="json")
    limit: int = Field(default=5000, ge=1, le=100000)


class RouteFilterRequest(BaseModel):
    message_types: List[str] = Field(default_factory=list)
    channels: List[int] = Field(default_factory=list)
    cc_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)
    note_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)
    velocity_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)


class RouteRequest(BaseModel):
    route_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    source_port: str = Field(..., min_length=1, max_length=255)
    destination_ports: List[str] = Field(..., min_length=1)
    enabled: bool = True
    priority: int = Field(default=100, ge=0, le=10000)
    route_type: str = Field(default="pass_through")
    filter: RouteFilterRequest = Field(default_factory=RouteFilterRequest)
    transform_chain: List[Dict[str, Any]] = Field(default_factory=list)
    latency_compensation_enabled: bool = False
    destination_latency_ms: Dict[str, float] = Field(default_factory=dict)


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
    payload["routes"] = router_service.list_routes()
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


@router.get("/routes")
async def list_routes() -> Dict[str, Any]:
    service = get_midi_router()
    return {
        "routes": service.list_routes(),
        "match_mode": service.get_match_mode(),
    }


@router.post("/routes")
async def create_route(req: RouteRequest) -> Dict[str, Any]:
    service = get_midi_router()
    payload = req.model_dump()
    route = service.add_route(payload)
    return {"ok": True, "route": route}


@router.put("/routes/{route_id}")
async def update_route(route_id: str, req: RouteRequest) -> Dict[str, Any]:
    service = get_midi_router()
    payload = req.model_dump(exclude={"route_id"})
    route = service.update_route(route_id, payload)
    if route is None:
        return {"ok": False, "error": "route_not_found"}
    return {"ok": True, "route": route}


@router.delete("/routes/{route_id}")
async def delete_route(route_id: str) -> Dict[str, Any]:
    service = get_midi_router()
    ok = service.delete_route(route_id)
    return {"ok": ok}


@router.post("/routes/{route_id}/enable")
async def enable_route(route_id: str) -> Dict[str, Any]:
    service = get_midi_router()
    route = service.set_route_enabled(route_id, True)
    return {"ok": route is not None, "route": route}


@router.post("/routes/{route_id}/disable")
async def disable_route(route_id: str) -> Dict[str, Any]:
    service = get_midi_router()
    route = service.set_route_enabled(route_id, False)
    return {"ok": route is not None, "route": route}


@router.get("/topology")
async def get_topology() -> Dict[str, Any]:
    service = get_midi_router()
    return service.topology()


@router.get("/transforms/types")
async def get_transform_types() -> Dict[str, Any]:
    service = get_midi_router()
    return {"types": service.TRANSFORM_TYPES}


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
