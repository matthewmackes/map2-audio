"""MIDI Hub API routes (traffic monitor + hub lifecycle baseline)."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_hub.clock_engine import get_midi_clock_engine
from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_hub.macros import get_midi_macro_service
from app.services.midi_hub.midi2 import get_midi2_manager
from app.services.midi_hub.network import get_midi_network_bridge
from app.services.midi_hub.preset_service import get_midi_hub_preset_service
from app.services.midi_hub.recorder import get_midi_recorder
from app.services.midi_hub.router import get_midi_router
from app.services.midi_hub.scheduler import get_midi_scheduler
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


class NetworkSessionRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    mode: str = Field(default="send", pattern="^(send|listen)$")


class NetworkSendRequest(BaseModel):
    message: List[int] = Field(..., min_length=1, max_length=1024)


class OscMappingsRequest(BaseModel):
    mappings: List[Dict[str, Any]] = Field(default_factory=list)


class OscServerRequest(BaseModel):
    listen_port: int = Field(..., ge=1, le=65535)


class OscSendRequest(BaseModel):
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(..., ge=1, le=65535)
    address: str = Field(..., min_length=1, max_length=255)
    value: float = 0.0


class Midi2ConfigRequest(BaseModel):
    enabled: Optional[bool] = None
    default_protocol: Optional[str] = Field(default=None, pattern="^(midi1|midi2)$")


class Midi2DiscoverRequest(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)


class Midi2ProfileRequest(BaseModel):
    profile_id: str = Field(..., min_length=1, max_length=128)
    enabled: bool = True


class Midi2PropertyRequest(BaseModel):
    key: str = Field(..., min_length=1, max_length=255)
    value: Any = None


class Midi2TranslateMidi1Request(BaseModel):
    message: List[int] = Field(..., min_length=1, max_length=3)


class Midi2TranslateUmpRequest(BaseModel):
    words: List[int] = Field(..., min_length=1, max_length=8)


class LearnSuggestRequest(BaseModel):
    parameter_id: str = Field(..., min_length=1, max_length=255)
    chain_context: Dict[str, Any] = Field(default_factory=dict)


class MacroUpsertRequest(BaseModel):
    macro_id: str = Field(..., min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=255)
    trigger: Dict[str, Any] = Field(default_factory=dict)
    actions: List[Dict[str, Any]] = Field(default_factory=list)
    enabled: bool = True


class MacroTriggerRequest(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


class RecorderStartRequest(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    name: Optional[str] = Field(default=None, max_length=255)


class RecorderPlaybackRequest(BaseModel):
    destination_override: Optional[str] = Field(default=None, max_length=255)
    loop: bool = False
    speed: float = Field(default=1.0, ge=0.1, le=8.0)


class RecorderExportRequest(BaseModel):
    export_path: Optional[str] = Field(default=None, max_length=4096)
    bpm: float = Field(default=120.0, ge=20.0, le=300.0)
    ticks_per_quarter: int = Field(default=480, ge=24, le=9600)


class SchedulerCreateRequest(BaseModel):
    schedule_id: str = Field(..., min_length=1, max_length=128)
    destination_port: str = Field(..., min_length=1, max_length=255)
    message: List[int] = Field(..., min_length=1, max_length=1024)
    delay_ms: Optional[int] = Field(default=None, ge=0, le=86_400_000)
    run_at_ns: Optional[int] = Field(default=None, ge=1)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SchedulerUpdateRequest(BaseModel):
    destination_port: Optional[str] = Field(default=None, max_length=255)
    message: Optional[List[int]] = Field(default=None, min_length=1, max_length=1024)
    delay_ms: Optional[int] = Field(default=None, ge=0, le=86_400_000)
    run_at_ns: Optional[int] = Field(default=None, ge=1)
    metadata: Optional[Dict[str, Any]] = None


class MeshPeerRequest(BaseModel):
    peer_id: str = Field(..., min_length=1, max_length=128)
    base_url: str = Field(..., min_length=1, max_length=2048)
    active: bool = True


class MeshRoutesRequest(BaseModel):
    source_instance: str = Field(default="local", min_length=1, max_length=128)
    routes: List[Dict[str, Any]] = Field(default_factory=list)
    fanout: bool = True


class MeshForwardRequest(BaseModel):
    source_instance: str = Field(default="remote", min_length=1, max_length=128)
    source_port: str = Field(..., min_length=1, max_length=255)
    destination_port: str = Field(..., min_length=1, max_length=255)
    data_hex: str = Field(..., min_length=2, max_length=4096)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MeshForwardToggleRequest(BaseModel):
    forwarding_enabled: bool = False


class ShadowStateRequest(BaseModel):
    expected_state: Dict[str, Any] = Field(default_factory=dict)
    source: str = Field(default="api", min_length=1, max_length=128)


def _build_learn_suggestions(parameter_id: str, chain_context: Dict[str, Any]) -> List[Dict[str, Any]]:
    token = str(parameter_id).lower()
    suggestions: List[Dict[str, Any]] = []

    heuristics = [
        (("mod", "lfo", "vibrato", "depth"), 1, "Modulation wheel"),
        (("volume", "gain", "level", "master"), 7, "Main volume"),
        (("expression", "expr"), 11, "Expression pedal"),
        (("wah", "filter", "cutoff", "tone"), 74, "Brightness / filter cutoff"),
        (("reverb", "mix", "wet"), 91, "Reverb send"),
        (("delay", "echo"), 94, "Delay send"),
        (("pan", "balance"), 10, "Pan"),
    ]

    for keywords, cc, reason in heuristics:
        if any(keyword in token for keyword in keywords):
            suggestions.append(
                {
                    "cc_number": cc,
                    "channel": 1,
                    "confidence": 0.92,
                    "reason": reason,
                }
            )

    if not suggestions:
        suggestions = [
            {"cc_number": 1, "channel": 1, "confidence": 0.66, "reason": "Default expressive mapping"},
            {"cc_number": 7, "channel": 1, "confidence": 0.61, "reason": "Default level mapping"},
            {"cc_number": 11, "channel": 1, "confidence": 0.58, "reason": "Default expression mapping"},
        ]

    active_plugins = chain_context.get("active_plugins")
    if isinstance(active_plugins, list) and active_plugins:
        for suggestion in suggestions:
            suggestion["chain_context"] = {
                "active_plugins": active_plugins[:5],
            }
    return suggestions


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


@router.get("/network/sessions")
async def list_network_sessions() -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    sessions = bridge.list_sessions()
    return {"count": len(sessions), "sessions": sessions}


@router.post("/network/sessions")
async def create_network_session(req: NetworkSessionRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    session = await bridge.create_session(
        session_id=req.session_id,
        host=req.host,
        port=req.port,
        mode=req.mode,
    )
    return {"ok": True, "session": session}


@router.delete("/network/sessions/{session_id}")
async def delete_network_session(session_id: str) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return {"ok": await bridge.remove_session(session_id)}


@router.post("/network/sessions/{session_id}/send")
async def send_network_midi(session_id: str, req: NetworkSendRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    payload = bytes(int(byte) & 0xFF for byte in req.message)
    ok = await bridge.send_midi(session_id, payload)
    return {"ok": ok}


@router.get("/network/osc/mappings")
async def get_osc_mappings() -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    mappings = bridge.list_osc_mappings()
    return {"count": len(mappings), "mappings": mappings}


@router.put("/network/osc/mappings")
async def set_osc_mappings(req: OscMappingsRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return bridge.set_osc_mappings(req.mappings)


@router.post("/network/osc/server")
async def start_osc_server(req: OscServerRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return await bridge.start_osc_server(req.listen_port)


@router.delete("/network/osc/server")
async def stop_osc_server() -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return await bridge.stop_osc_server()


@router.post("/network/osc/send")
async def send_osc(req: OscSendRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return await bridge.send_osc(
        host=req.host,
        port=req.port,
        address=req.address,
        value=req.value,
    )


@router.get("/midi2")
async def get_midi2_status() -> Dict[str, Any]:
    manager = get_midi2_manager()
    return manager.status()


@router.put("/midi2")
async def configure_midi2(req: Midi2ConfigRequest) -> Dict[str, Any]:
    manager = get_midi2_manager()
    if req.enabled is not None:
        manager.set_enabled(req.enabled)
    if req.default_protocol is not None:
        manager.set_default_protocol(req.default_protocol)
    return manager.status()


@router.post("/midi2/discover")
async def discover_midi2_device(req: Midi2DiscoverRequest) -> Dict[str, Any]:
    manager = get_midi2_manager()
    return manager.discover(req.device_id)


@router.post("/midi2/translate/midi1-to-ump")
async def translate_midi1_to_ump(req: Midi2TranslateMidi1Request) -> Dict[str, Any]:
    manager = get_midi2_manager()
    payload = bytes(int(byte) & 0xFF for byte in req.message)
    return {"words": manager.midi1_to_ump(payload)}


@router.post("/midi2/translate/ump-to-midi1")
async def translate_ump_to_midi1(req: Midi2TranslateUmpRequest) -> Dict[str, Any]:
    manager = get_midi2_manager()
    midi1 = manager.ump_to_midi1([int(word) for word in req.words])
    return {"message": [int(byte) & 0xFF for byte in midi1]}


@router.put("/midi2/{device_id}/profiles")
async def set_midi2_profile(device_id: str, req: Midi2ProfileRequest) -> Dict[str, Any]:
    manager = get_midi2_manager()
    device = manager.enable_profile(device_id, req.profile_id, req.enabled)
    return {"ok": True, "device": device}


@router.put("/midi2/{device_id}/properties")
async def set_midi2_property(device_id: str, req: Midi2PropertyRequest) -> Dict[str, Any]:
    manager = get_midi2_manager()
    device = manager.set_property(device_id, req.key, req.value)
    return {"ok": True, "device": device}


@router.get("/midi2/{device_id}/properties/{key}")
async def get_midi2_property(device_id: str, key: str) -> Dict[str, Any]:
    manager = get_midi2_manager()
    return {"ok": True, "device_id": device_id, "key": key, "value": manager.get_property(device_id, key)}


@router.post("/learn/suggestions")
async def get_learn_suggestions(req: LearnSuggestRequest) -> Dict[str, Any]:
    suggestions = _build_learn_suggestions(req.parameter_id, req.chain_context)
    suspended = [str(item) for item in (req.chain_context.get("bypassed_plugins") or []) if str(item).strip()]
    active = [str(item) for item in (req.chain_context.get("active_plugins") or []) if str(item).strip()]
    split_targets = [str(item) for item in (req.chain_context.get("split_targets") or []) if str(item).strip()]
    plugin_splits = []
    for target in split_targets[:8]:
        plugin_splits.append(
            {
                "target": target,
                "mode": "split",
                "suspended_plugins": suspended[:16],
                "recommended_cc": suggestions[0]["cc_number"] if suggestions else 1,
            }
        )
    return {
        "ok": True,
        "parameter_id": req.parameter_id,
        "suggestions": suggestions,
        "plugin_context": {
            "active_plugins": active[:16],
            "bypassed_plugins": suspended[:16],
            "auto_suspended": bool(suspended),
        },
        "split_suggestions": plugin_splits,
    }


@router.get("/macros")
async def list_macros() -> Dict[str, Any]:
    service = get_midi_macro_service()
    macros = service.list_macros()
    return {"count": len(macros), "macros": macros}


@router.get("/macros/{macro_id}")
async def get_macro(macro_id: str) -> Dict[str, Any]:
    service = get_midi_macro_service()
    macro = service.get_macro(macro_id)
    return {"ok": macro is not None, "macro": macro}


@router.post("/macros")
async def upsert_macro(req: MacroUpsertRequest) -> Dict[str, Any]:
    service = get_midi_macro_service()
    macro = service.upsert_macro(
        macro_id=req.macro_id,
        name=req.name,
        trigger=req.trigger,
        actions=req.actions,
        enabled=req.enabled,
    )
    return {"ok": True, "macro": macro}


@router.delete("/macros/{macro_id}")
async def delete_macro(macro_id: str) -> Dict[str, Any]:
    service = get_midi_macro_service()
    return {"ok": service.delete_macro(macro_id)}


@router.post("/macros/{macro_id}/trigger")
async def trigger_macro(macro_id: str, req: MacroTriggerRequest) -> Dict[str, Any]:
    service = get_midi_macro_service()
    payload = await service.trigger_macro(macro_id, payload=req.payload)
    if not payload.get("ok"):
        raise HTTPException(status_code=404, detail=payload.get("reason", "macro trigger failed"))
    return payload


@router.post("/macros/match")
async def match_macros(req: MacroTriggerRequest) -> Dict[str, Any]:
    service = get_midi_macro_service()
    triggered = await service.match_and_trigger(req.payload)
    return {"ok": True, "count": len(triggered), "triggered_macro_ids": triggered}


@router.get("/recorder/sessions")
async def list_recording_sessions() -> Dict[str, Any]:
    recorder = get_midi_recorder()
    sessions = recorder.list_sessions()
    return {"count": len(sessions), "sessions": sessions}


@router.get("/recorder/sessions/{session_id}")
async def get_recording_session(
    session_id: str,
    include_events: bool = Query(default=False),
) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    session = recorder.get_session(session_id, include_events=include_events)
    return {"ok": session is not None, "session": session}


@router.post("/recorder/start")
async def start_recording(req: RecorderStartRequest) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    try:
        session = recorder.start_recording(session_id=req.session_id, name=req.name)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"ok": True, "session": session}


@router.post("/recorder/stop")
async def stop_recording() -> Dict[str, Any]:
    recorder = get_midi_recorder()
    session = recorder.stop_recording()
    return {"ok": session is not None, "session": session}


@router.post("/recorder/sessions/{session_id}/playback")
async def playback_recording_session(session_id: str, req: RecorderPlaybackRequest) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    try:
        payload = await recorder.playback(
            session_id=session_id,
            destination_override=req.destination_override,
            loop=req.loop,
            speed=req.speed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return payload


@router.post("/recorder/sessions/{session_id}/stop")
async def stop_recording_playback(session_id: str) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    return {"ok": recorder.stop_playback(session_id)}


@router.post("/recorder/sessions/{session_id}/export")
async def export_recording_session(session_id: str, req: RecorderExportRequest) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    try:
        return recorder.export_smf(
            session_id=session_id,
            export_path=req.export_path,
            bpm=req.bpm,
            ticks_per_quarter=req.ticks_per_quarter,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/recorder/sessions/{session_id}")
async def delete_recording_session(session_id: str) -> Dict[str, Any]:
    recorder = get_midi_recorder()
    return {"ok": recorder.delete_session(session_id)}


@router.get("/scheduler")
async def list_scheduler_entries(include_finished: bool = Query(default=True)) -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    entries = scheduler.list(include_finished=include_finished)
    return {"count": len(entries), "entries": entries}


@router.get("/scheduler/{schedule_id}")
async def get_scheduler_entry(schedule_id: str) -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    entry = scheduler.get(schedule_id)
    return {"ok": entry is not None, "entry": entry}


@router.post("/scheduler")
async def create_scheduler_entry(req: SchedulerCreateRequest) -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    message = bytes(int(byte) & 0xFF for byte in req.message)
    entry = await scheduler.schedule(
        schedule_id=req.schedule_id,
        destination_port=req.destination_port,
        message=message,
        delay_ms=req.delay_ms,
        run_at_ns=req.run_at_ns,
        metadata=req.metadata,
    )
    return {"ok": True, "entry": entry}


@router.put("/scheduler/{schedule_id}")
async def update_scheduler_entry(schedule_id: str, req: SchedulerUpdateRequest) -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    message = None
    if req.message is not None:
        message = bytes(int(byte) & 0xFF for byte in req.message)
    entry = await scheduler.update(
        schedule_id,
        destination_port=req.destination_port,
        message=message,
        delay_ms=req.delay_ms,
        run_at_ns=req.run_at_ns,
        metadata=req.metadata,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    return {"ok": True, "entry": entry}


@router.delete("/scheduler/{schedule_id}")
async def cancel_scheduler_entry(schedule_id: str) -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    return {"ok": scheduler.cancel(schedule_id)}


@router.post("/scheduler/clear-finished")
async def clear_finished_scheduler_entries() -> Dict[str, Any]:
    scheduler = get_midi_scheduler()
    return {"ok": True, **scheduler.clear_finished()}


@router.get("/network/mesh")
async def get_mesh_status() -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return bridge.mesh_status()


@router.post("/network/mesh/peers")
async def upsert_mesh_peer(req: MeshPeerRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    peer = bridge.upsert_mesh_peer(peer_id=req.peer_id, base_url=req.base_url, active=req.active)
    return {"ok": True, "peer": peer}


@router.delete("/network/mesh/peers/{peer_id}")
async def delete_mesh_peer(peer_id: str) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return {"ok": bridge.remove_mesh_peer(peer_id)}


@router.put("/network/mesh/forwarding")
async def set_mesh_forwarding(req: MeshForwardToggleRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return {"ok": True, **bridge.set_mesh_forwarding(req.forwarding_enabled)}


@router.post("/network/mesh/routes")
async def publish_mesh_routes(req: MeshRoutesRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    payload = await bridge.publish_routes(
        source_instance=req.source_instance,
        routes=req.routes,
        fanout=req.fanout,
    )
    return {"ok": True, **payload}


@router.post("/network/mesh/forward")
async def receive_mesh_forward(req: MeshForwardRequest) -> Dict[str, Any]:
    bridge = get_midi_network_bridge()
    return await bridge.receive_mesh_forward(
        source_instance=req.source_instance,
        source_port=req.source_port,
        destination_port=req.destination_port,
        data_hex=req.data_hex,
        metadata=req.metadata,
    )


@router.get("/devices/shadow")
async def list_shadow_drift(limit: int = Query(default=200, ge=1, le=5000)) -> Dict[str, Any]:
    registry = get_midi_device_registry()
    snapshot = registry.snapshot()
    drift = registry.list_drift_events(limit=limit)
    return {"shadow_state": snapshot.get("shadow_state", {}), **drift}


@router.put("/devices/{device_id}/shadow")
async def upsert_shadow_state(device_id: str, req: ShadowStateRequest) -> Dict[str, Any]:
    registry = get_midi_device_registry()
    return await registry.upsert_shadow_state(
        device_id=device_id,
        expected_state=req.expected_state,
        source=req.source,
    )


@router.post("/devices/shadow/clear")
async def clear_shadow_drift() -> Dict[str, Any]:
    registry = get_midi_device_registry()
    return {"ok": True, **registry.clear_drift_events()}


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
