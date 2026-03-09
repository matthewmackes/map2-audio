"""MIDI Hub API routes (traffic monitor + hub lifecycle baseline)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.clock_engine import get_midi_clock_engine
from app.services.midi_hub.preset_service import get_midi_hub_preset_service
from app.services.midi_hub.router import get_midi_router
from app.services.midi_hub.script_engine import get_midi_script_engine
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


class ScriptUpsertRequest(BaseModel):
    script_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=100000)
    enabled: bool = True


class ScriptRunRequest(BaseModel):
    event: Dict[str, Any] = Field(default_factory=dict)


class ClockConfigRequest(BaseModel):
    bpm: Optional[float] = Field(default=None, ge=20.0, le=300.0)
    source_mode: Optional[str] = Field(default=None, pattern="^(internal|external)$")
    output_ports: Optional[List[str]] = None
    divider: Optional[float] = Field(default=None, ge=0.25, le=16.0)
    multiplier: Optional[float] = Field(default=None, ge=0.25, le=16.0)
    offset_ms: Optional[float] = Field(default=None, ge=-500.0, le=500.0)
    tap_note: Optional[int] = Field(default=None, ge=0, le=127)
    tap_cc: Optional[int] = Field(default=None, ge=0, le=127)


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


@router.get("/scripts/examples")
async def list_script_examples() -> Dict[str, Any]:
    examples = [
        {
            "script_id": "cc_lfo",
            "name": "CC LFO Generator",
            "code": "def main(event):\n    for value in (0, 32, 64, 96, 127):\n        midi.cc('dst', 1, 1, value)\n",
        },
        {
            "script_id": "midi_panic",
            "name": "MIDI Panic",
            "code": "def main(event):\n    for note in range(128):\n        midi.note_off('dst', 1, note, 0)\n",
        },
        {
            "script_id": "program_stepper",
            "name": "Program Change Stepper",
            "code": "def main(event):\n    current = int(state.get('program', 0))\n    nxt = (current + 1) % 128\n    midi.pc('dst', 1, nxt)\n    state.set('program', nxt)\n",
        },
    ]
    return {"count": len(examples), "examples": examples}


@router.get("/scripts")
async def list_scripts() -> Dict[str, Any]:
    service = get_midi_script_engine()
    scripts = service.list_scripts()
    return {"count": len(scripts), "scripts": scripts}


@router.get("/scripts/{script_id}")
async def get_script(script_id: str) -> Dict[str, Any]:
    service = get_midi_script_engine()
    script = service.get_script(script_id)
    return {"ok": script is not None, "script": script}


@router.post("/scripts")
async def upsert_script(req: ScriptUpsertRequest) -> Dict[str, Any]:
    service = get_midi_script_engine()
    script = service.upsert_script(
        script_id=req.script_id,
        name=req.name,
        code=req.code,
        enabled=req.enabled,
    )
    return {"ok": True, "script": script}


@router.delete("/scripts/{script_id}")
async def delete_script(script_id: str) -> Dict[str, Any]:
    service = get_midi_script_engine()
    return {"ok": service.delete_script(script_id)}


@router.post("/scripts/{script_id}/enable")
async def enable_script(script_id: str) -> Dict[str, Any]:
    service = get_midi_script_engine()
    script = service.set_enabled(script_id, True)
    return {"ok": script is not None, "script": script}


@router.post("/scripts/{script_id}/disable")
async def disable_script(script_id: str) -> Dict[str, Any]:
    service = get_midi_script_engine()
    script = service.set_enabled(script_id, False)
    return {"ok": script is not None, "script": script}


@router.post("/scripts/{script_id}/run")
async def run_script(script_id: str, req: ScriptRunRequest) -> Dict[str, Any]:
    service = get_midi_script_engine()
    try:
        payload = await service.run_script(script_id, event=req.event)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.post("/scripts/{script_id}/trigger")
async def trigger_script(script_id: str, req: ScriptRunRequest) -> Dict[str, Any]:
    service = get_midi_script_engine()
    try:
        payload = await service.trigger_script(script_id, event=req.event)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.post("/scripts/{script_id}/stop")
async def stop_script(script_id: str) -> Dict[str, Any]:
    service = get_midi_script_engine()
    return {"ok": service.stop_script(script_id)}


@router.get("/scripts/{script_id}/console")
async def get_script_console(
    script_id: str,
    limit: int = Query(default=200, ge=1, le=2000),
) -> Dict[str, Any]:
    service = get_midi_script_engine()
    return service.get_console(script_id, limit=limit)


@router.get("/clock")
async def get_clock_status() -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    return engine.status()


@router.put("/clock")
async def configure_clock(req: ClockConfigRequest) -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    updates = {key: value for key, value in req.model_dump().items() if value is not None}
    return engine.configure(**updates)


@router.post("/clock/tap")
async def tap_clock() -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    return await engine.tap()


@router.post("/clock/start")
async def start_clock() -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    return await engine.start()


@router.post("/clock/stop")
async def stop_clock() -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    return await engine.stop()


@router.post("/clock/continue")
async def continue_clock() -> Dict[str, Any]:
    engine = get_midi_clock_engine()
    return await engine.cont()


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
