"""MIDI Hub API routes (traffic monitor + hub lifecycle baseline)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.preset_service import get_midi_hub_preset_service
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


class UpsertPresetRequest(BaseModel):
    preset_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)
    conditions: Dict[str, Any] = Field(default_factory=dict)


class PresetCompareRequest(BaseModel):
    left_preset_id: str = Field(..., min_length=1, max_length=128)
    right_preset_id: str = Field(..., min_length=1, max_length=128)


class PresetExportRequest(BaseModel):
    export_path: Optional[str] = Field(default=None, max_length=2048)


class PresetImportRequest(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=2048)


class PresetChainRequest(BaseModel):
    preset_ids: List[str] = Field(default_factory=list)


class PresetChainRunRequest(BaseModel):
    interval_ms: int = Field(default=500, ge=25, le=120000)
    cycles: Optional[int] = Field(default=None, ge=1, le=10000)
    start_immediately: bool = True


class PresetContextRequest(BaseModel):
    context: Dict[str, Any] = Field(default_factory=dict)


class DefaultPresetRequest(BaseModel):
    preset_id: Optional[str] = Field(default=None, max_length=128)


class ProgramSlotRequest(BaseModel):
    target_id: str = Field(..., min_length=1, max_length=256)


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


@router.get("/presets")
async def list_presets() -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return {
        "presets": service.list_presets(),
        "default": service.get_default_preset(),
    }


@router.post("/presets")
async def save_preset(req: UpsertPresetRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    preset = await service.save_preset(
        preset_id=req.preset_id,
        name=req.name,
        description=req.description,
        conditions=req.conditions,
    )
    return {"ok": True, "preset": preset}


@router.post("/presets/{preset_id}/recall")
async def recall_preset(preset_id: str) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    preset = await service.recall_preset(preset_id)
    return {"ok": preset is not None, "preset": preset}


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return {"ok": service.delete_preset(preset_id)}


@router.post("/presets/compare")
async def compare_presets(req: PresetCompareRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        diff = service.compare_presets(req.left_preset_id, req.right_preset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "diff": diff}


@router.post("/presets/{preset_id}/export")
async def export_preset(preset_id: str, req: PresetExportRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        payload = service.export_preset(preset_id, export_path=req.export_path)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, **payload}


@router.post("/presets/import")
async def import_preset(req: PresetImportRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        preset = service.import_preset(req.file_path)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"import failed: {exc}") from exc
    return {"ok": True, "preset": preset}


@router.get("/presets/default")
async def get_default_preset() -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return service.get_default_preset()


@router.put("/presets/default")
async def set_default_preset(req: DefaultPresetRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        payload = service.set_default_preset(req.preset_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, **payload}


@router.post("/presets/default/recall")
async def recall_default_preset() -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    preset = await service.recall_default_preset()
    return {"ok": preset is not None, "preset": preset}


@router.get("/presets/chains")
async def get_preset_chains() -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return service.get_chains()


@router.put("/presets/chains/{chain_id}")
async def set_preset_chain(chain_id: str, req: PresetChainRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    payload = service.set_chain(chain_id, req.preset_ids)
    return {"ok": True, **payload}


@router.post("/presets/chains/{chain_id}/recall/{step_index}")
async def recall_preset_chain_step(chain_id: str, step_index: int) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    preset = await service.recall_chain_step(chain_id, step_index)
    return {"ok": preset is not None, "preset": preset}


@router.post("/presets/chains/{chain_id}/run")
async def run_preset_chain(chain_id: str, req: PresetChainRunRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        return await service.run_chain_timer(
            chain_id=chain_id,
            interval_ms=req.interval_ms,
            cycles=req.cycles,
            start_immediately=req.start_immediately,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/presets/chains/{chain_id}/stop")
async def stop_preset_chain(chain_id: str) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return await service.stop_chain_timer(chain_id)


@router.get("/presets/slots")
async def get_program_slots() -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return service.get_program_slots()


@router.put("/presets/slots/{program_number}")
async def set_program_slot(program_number: int, req: ProgramSlotRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    try:
        payload = service.set_program_slot(program_number, req.target_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **payload}


@router.delete("/presets/slots/{program_number}")
async def delete_program_slot(program_number: int) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return {"ok": service.delete_program_slot(program_number)}


@router.post("/presets/context/evaluate")
async def evaluate_preset_context(req: PresetContextRequest) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    return await service.evaluate_context_conditions(req.context)


@router.get("/presets/{preset_id}")
async def get_preset(preset_id: str) -> Dict[str, Any]:
    service = get_midi_hub_preset_service()
    preset = service.get_preset(preset_id)
    return {"ok": preset is not None, "preset": preset}


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
