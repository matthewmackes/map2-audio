"""
MIDI API v2 - authoritative controller and mapping surface.

This module is the primary non-Hub MIDI API. It owns modern per-chain mapping,
device-profile, feedback, learn, and command-trigger workflows.

Features:
- CC mappings with curves and feedback
- Program Change chain switching
- MIDI learn mode
- Command triggers
- Preset save/load
- Device management
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import get_session
from app.services.midi_service import (
    midi_service,
    MIDIMappingDTO,
    MIDICommandDTO,
    CurveType,
    ActionType,
    CommandType,
)
from app.services.midi_device_profiles import device_profile_service

try:
    from app.services.midi_hub.clock_engine import get_midi_clock_engine
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.router import get_midi_router
    from app.services.midi_hub.traffic_monitor import get_midi_traffic_monitor
except Exception:  # pragma: no cover - optional integration
    get_midi_clock_engine = None  # type: ignore[assignment]
    get_midi_hub = None  # type: ignore[assignment]
    get_midi_router = None  # type: ignore[assignment]
    get_midi_traffic_monitor = None  # type: ignore[assignment]

# Connect services
device_profile_service.set_midi_service(midi_service)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/midi", tags=["midi-v2"])


# ==================== Request/Response Models ====================

class MappingCreateRequest(BaseModel):
    """Request body for creating a MIDI mapping."""
    channel: int = Field(0, ge=0, le=16, description="0=omni, 1-16=specific channel")
    cc: int = Field(..., ge=0, le=127, description="MIDI CC number 0-127")
    chain_id: Optional[int] = Field(None, description="Chain ID (null=global, int=per-chain)")
    target_plugin_uri: str = Field(..., description="Target plugin URI")
    target_plugin_position: Optional[int] = Field(None, ge=0, description="Optional chain position for duplicate-safe instance targeting")
    target_param_index: int = Field(..., ge=0, description="Parameter index")
    target_param_symbol: str = Field("", description="Parameter symbol for name-based access")
    min_val: float = Field(0.0, description="Minimum parameter value")
    max_val: float = Field(1.0, description="Maximum parameter value")
    curve_type: str = Field("linear", description="Value curve: linear, logarithmic, exponential, s_curve")
    invert: bool = Field(False, description="Invert the CC value")
    feedback_enabled: bool = Field(True, description="Enable MIDI feedback to controller")
    feedback_cc: Optional[int] = Field(None, ge=0, le=127, description="CC to send for feedback (defaults to same CC)")
    name: str = Field("", description="User-friendly display name")
    group_id: Optional[int] = Field(None, description="Mapping group ID")


class MappingUpdateRequest(BaseModel):
    """Request body for updating a MIDI mapping."""
    channel: Optional[int] = Field(None, ge=0, le=16)
    cc: Optional[int] = Field(None, ge=0, le=127)
    chain_id: Optional[int] = None
    target_plugin_position: Optional[int] = Field(None, ge=0)
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    curve_type: Optional[str] = None
    invert: Optional[bool] = None
    feedback_enabled: Optional[bool] = None
    feedback_cc: Optional[int] = Field(None, ge=0, le=127)
    name: Optional[str] = None
    is_enabled: Optional[bool] = None
    group_id: Optional[int] = None


class MappingTestRequest(BaseModel):
    """Request body for sending a one-shot outbound feedback test."""
    normalized_value: Optional[float] = Field(None, ge=0.0, le=1.0)
    use_current_value: bool = Field(False, description="Use the live parameter value instead of an explicit preview value")


class CommandCreateRequest(BaseModel):
    """Request body for creating a MIDI command trigger."""
    command_type: str = Field(..., description="Trigger type: program_change, note_on, cc_toggle")
    channel: int = Field(0, ge=0, le=16, description="0=omni, 1-16=specific")
    data1: int = Field(..., ge=0, le=127, description="PC number, Note number, or CC number")
    data2: Optional[int] = Field(None, ge=0, le=127, description="Velocity/value threshold")
    action_type: str = Field(..., description="Action: activate_chain, toggle_chain, toggle_plugin, set_routing")
    target_chain_id: Optional[int] = Field(None, description="Target chain ID for chain actions")
    target_plugin_uri: Optional[str] = Field(None, description="Target plugin URI for plugin actions")
    target_plugin_position: Optional[int] = Field(None, ge=0, description="Optional chain position for duplicate-safe plugin targeting")
    name: str = Field("", description="User-friendly name")
    action_data: Dict = Field(default_factory=dict, description="Extra action parameters")


class LearnStartRequest(BaseModel):
    """Request body for starting MIDI learn mode."""
    chain_id: Optional[int] = Field(None, description="Chain ID (null=global, int=per-chain)")
    plugin_uri: str = Field(..., description="Target plugin URI")
    plugin_position: Optional[int] = Field(None, ge=0, description="Optional chain position for duplicate-safe instance targeting")
    param_index: int = Field(..., ge=0, description="Parameter index")
    param_symbol: str = Field("", description="Parameter symbol")
    min_val: float = Field(0.0, description="Minimum value")
    max_val: float = Field(1.0, description="Maximum value")
    curve: str = Field("linear", description="Value curve")


class ChainProgramRequest(BaseModel):
    """Request body for setting chain Program Change number."""
    program_number: int = Field(..., ge=0, le=127, description="Program Change number 0-127")
    bank_msb: int = Field(0, ge=0, le=127, description="Bank Select MSB (CC#0)")
    bank_lsb: int = Field(0, ge=0, le=127, description="Bank Select LSB (CC#32)")


class ChainConfigUpsertRequest(BaseModel):
    """Request body for PUT /chain-configs/{chain_id} — upsert a chain's PC binding.

    Optional fields default to None so a partial PUT preserves the stored value
    on update (only fields explicitly sent are changed).
    """
    program_number: int = Field(..., ge=0, le=127, description="Program Change number 0-127")
    bank_msb: Optional[int] = Field(None, ge=0, le=127, description="Bank Select MSB (CC#0); omit to preserve")
    bank_lsb: Optional[int] = Field(None, ge=0, le=127, description="Bank Select LSB (CC#32); omit to preserve")
    send_pc_on_activate: Optional[bool] = Field(None, description="Send PC out when this chain is activated; omit to preserve")


class DeviceConfigUpsertRequest(BaseModel):
    """Request body for POST /device-configs — upsert a persistent device config."""
    device_name: str = Field(..., min_length=1, max_length=255)
    device_type: Optional[str] = Field(None, description="input or output")
    is_enabled: Optional[bool] = None
    auto_connect: Optional[bool] = None
    channel_filter: Optional[int] = Field(None, ge=0, le=16, description="0/None = all channels, 1-16 specific")


class PresetCreateRequest(BaseModel):
    """Request body for creating a MIDI preset."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=1000)


class GroupCreateRequest(BaseModel):
    """Request body for creating a mapping group."""
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field("#808080", description="Hex color code")
    description: str = Field("")


class ClockConfigRequest(BaseModel):
    """Request body for configuring the MIDI Hub-owned clock."""
    bpm: Optional[float] = Field(default=None, ge=20.0, le=300.0)
    source_mode: Optional[str] = Field(default=None, description="internal or external")
    output_ports: Optional[List[str]] = None
    snapshot_sync_enabled: Optional[bool] = None
    divider: Optional[float] = Field(default=None, ge=0.25, le=16.0)
    multiplier: Optional[float] = Field(default=None, ge=0.25, le=16.0)
    offset_ms: Optional[float] = Field(default=None, ge=-500.0, le=500.0)
    tap_note: Optional[int] = Field(default=None, ge=0, le=127)
    tap_cc: Optional[int] = Field(default=None, ge=0, le=127)


class PortRouteFilterRequest(BaseModel):
    message_types: List[str] = Field(default_factory=list)
    channels: List[int] = Field(default_factory=list)
    cc_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)
    note_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)
    velocity_range: Optional[List[int]] = Field(default=None, min_length=2, max_length=2)


class PortRouteRequest(BaseModel):
    """Request body for durable MIDI Hub port routes."""
    route_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    source_port: Optional[str] = Field(default=None, min_length=1, max_length=255)
    destination_ports: Optional[List[str]] = Field(default=None, min_length=1)
    input_port: Optional[str] = Field(default=None, min_length=1, max_length=255)
    output_port: Optional[str] = Field(default=None, min_length=1, max_length=255)
    enabled: bool = True
    priority: int = Field(default=100, ge=0, le=10000)
    route_type: str = Field(default="pass_through")
    filter: PortRouteFilterRequest = Field(default_factory=PortRouteFilterRequest)
    transform_chain: List[Dict[str, Any]] = Field(default_factory=list)
    latency_compensation_enabled: bool = False
    destination_latency_ms: Dict[str, float] = Field(default_factory=dict)

    def router_payload(self, *, include_route_id: bool = True) -> Dict[str, Any]:
        source_port = self.source_port or self.input_port
        destination_ports = self.destination_ports or ([self.output_port] if self.output_port else [])
        if not source_port:
            raise ValueError("source_port is required")
        if not destination_ports:
            raise ValueError("destination_ports is required")

        payload: Dict[str, Any] = {
            "source_port": source_port,
            "destination_ports": destination_ports,
            "enabled": self.enabled,
            "priority": self.priority,
            "route_type": self.route_type,
            "filter": self.filter.model_dump(),
            "transform_chain": self.transform_chain,
            "latency_compensation_enabled": self.latency_compensation_enabled,
            "destination_latency_ms": self.destination_latency_ms,
        }
        if include_route_id and self.route_id:
            payload["route_id"] = self.route_id
        return payload


# ==================== Mappings ====================

@router.get("/mappings")
async def list_mappings(
    chain_id: Optional[int] = Query(None, description="Filter by chain ID"),
    plugin_uri: Optional[str] = Query(None, description="Filter by plugin URI"),
    plugin_position: Optional[int] = Query(None, ge=0, description="Filter duplicate plugin mappings by chain position"),
    enabled_only: bool = Query(False, description="Only return enabled mappings"),
):
    """List all MIDI CC mappings with optional filters."""
    async with get_session() as session:
        if plugin_uri:
            mappings = await midi_service.get_mappings_for_plugin(plugin_uri, session, plugin_position=plugin_position)
        else:
            mappings = await midi_service.get_all_mappings(session, chain_id=chain_id)

        if enabled_only:
            mappings = [m for m in mappings if m.get("is_enabled", True)]

        return {
            "mappings": mappings,
            "count": len(mappings),
            "active_chain_id": midi_service._active_chain_id,
        }


@router.get("/mappings/{mapping_id}")
async def get_mapping(mapping_id: int):
    """Get a single MIDI mapping by ID."""
    async with get_session() as session:
        mapping = await midi_service.get_mapping(mapping_id, session)
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        return mapping


@router.post("/mappings")
async def create_mapping(request: MappingCreateRequest):
    """Create a new MIDI CC mapping."""
    dto = MIDIMappingDTO(
        channel=request.channel,
        cc=request.cc,
        chain_id=request.chain_id,
        target_plugin_uri=request.target_plugin_uri,
        target_plugin_position=request.target_plugin_position,
        target_param_index=request.target_param_index,
        target_param_symbol=request.target_param_symbol,
        min_val=request.min_val,
        max_val=request.max_val,
        curve_type=CurveType(request.curve_type) if request.curve_type in [c.value for c in CurveType] else CurveType.LINEAR,
        invert=request.invert,
        feedback_enabled=request.feedback_enabled,
        feedback_cc=request.feedback_cc,
        name=request.name,
        group_id=request.group_id,
    )

    try:
        async with get_session() as session:
            mapping_id = await midi_service.create_mapping(dto, session)
            if not mapping_id:
                raise HTTPException(status_code=400, detail="Failed to create mapping - check server logs")
            mapping = await midi_service.get_mapping(mapping_id, session)
            if not mapping:
                raise HTTPException(status_code=500, detail="Mapping was created but could not be reloaded")
            return {"mapping": mapping, "message": "Mapping created"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating mapping: {str(e)}")


@router.patch("/mappings/{mapping_id}")
async def update_mapping(mapping_id: int, request: MappingUpdateRequest):
    """Update a MIDI mapping."""
    updates = request.dict(exclude_unset=True)

    async with get_session() as session:
        success = await midi_service.update_mapping(mapping_id, updates, session)
        if not success:
            raise HTTPException(status_code=404, detail="Mapping not found")
        mapping = await midi_service.get_mapping(mapping_id, session)
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping not found")
        return {"mapping": mapping, "message": "Mapping updated"}


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(mapping_id: int):
    """Delete a MIDI mapping."""
    async with get_session() as session:
        success = await midi_service.delete_mapping(mapping_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Mapping not found")

        return {"status": "deleted", "mapping_id": mapping_id}


@router.post("/mappings/{mapping_id}/test")
async def test_mapping_feedback(mapping_id: int, request: MappingTestRequest):
    """Send a one-shot outbound MIDI feedback message for a mapping."""
    async with get_session() as session:
        try:
            payload = await midi_service.send_mapping_feedback_test(
                mapping_id,
                session,
                normalized_value=request.normalized_value,
                use_current_value=request.use_current_value,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc

        if not payload:
            raise HTTPException(status_code=404, detail="Mapping not found")

        return {"message": "Feedback test sent", **payload}


# ==================== Commands ====================

@router.get("/commands")
async def list_commands():
    """List all MIDI command triggers."""
    async with get_session() as session:
        commands = await midi_service.get_all_commands(session)
        return {"commands": commands, "count": len(commands)}


@router.post("/commands")
async def create_command(request: CommandCreateRequest):
    """Create a MIDI command trigger."""
    dto = MIDICommandDTO(
        command_type=CommandType(request.command_type) if request.command_type in [c.value for c in CommandType] else CommandType.PROGRAM_CHANGE,
        channel=request.channel,
        data1=request.data1,
        data2=request.data2,
        action_type=ActionType(request.action_type) if request.action_type in [a.value for a in ActionType] else ActionType.ACTIVATE_CHAIN,
        target_chain_id=request.target_chain_id,
        target_plugin_uri=request.target_plugin_uri,
        target_plugin_position=request.target_plugin_position,
        name=request.name,
        action_data=request.action_data,
    )

    async with get_session() as session:
        command_id = await midi_service.create_command(dto, session)
        if not command_id:
            raise HTTPException(status_code=400, detail="Failed to create command")
        command = await midi_service.get_command(command_id, session)
        if not command:
            raise HTTPException(status_code=500, detail="Command was created but could not be reloaded")
        return {"command": command, "message": "Command created"}


@router.delete("/commands/{command_id}")
async def delete_command(command_id: int):
    """Delete a MIDI command trigger."""
    async with get_session() as session:
        success = await midi_service.delete_command(command_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Command not found")

        return {"status": "deleted", "command_id": command_id}


class CommandUpdateRequest(BaseModel):
    """Request body for updating a MIDI command trigger."""
    command_type: Optional[str] = None
    channel: Optional[int] = Field(None, ge=0, le=16)
    data1: Optional[int] = Field(None, ge=0, le=127)
    data2: Optional[int] = Field(None, ge=0, le=127)
    action_type: Optional[str] = None
    target_chain_id: Optional[int] = None
    target_plugin_uri: Optional[str] = None
    target_plugin_position: Optional[int] = Field(None, ge=0)
    name: Optional[str] = None
    action_data: Optional[Dict] = None
    is_enabled: Optional[bool] = None


@router.patch("/commands/{command_id}")
async def update_command(command_id: int, request: CommandUpdateRequest):
    """Update a MIDI command trigger."""
    async with get_session() as session:
        updates = request.model_dump(exclude_unset=True)
        success = await midi_service.update_command(command_id, updates, session)
        if not success:
            raise HTTPException(status_code=404, detail="Command not found")
        command = await midi_service.get_command(command_id, session)
        if not command:
            raise HTTPException(status_code=404, detail="Command not found")
        return {"command": command, "message": "Command updated"}


# ==================== Routing Rules ====================

class RoutingRuleRequest(BaseModel):
    """Request body for creating a MIDI routing rule."""
    chain_id: int = Field(..., description="Chain this rule belongs to")
    name: Optional[str] = Field(None, max_length=255)
    trigger_type: str = Field(..., description="Trigger: program_change, note_on, cc_toggle")
    channel: int = Field(0, ge=0, le=16)
    data1: int = Field(0, ge=0, le=127)
    from_flow_index: int = Field(0, ge=0)
    to_flow_index: int = Field(0, ge=0)
    is_enabled: bool = True


def _routing_rule_to_dict(r) -> Dict[str, Any]:
    """Map DB MIDIRoutingRule to frontend contract."""
    routing_data = r.routing_data or {}
    return {
        "id": r.id,
        "chain_id": r.chain_id,
        "name": r.name,
        "trigger_type": r.routing_type or "cc_toggle",
        "channel": r.channel,
        "data1": r.cc,
        "from_flow_index": routing_data.get("from_flow_index", 0),
        "to_flow_index": routing_data.get("to_flow_index", 0),
        "is_enabled": r.is_enabled,
    }


@router.get("/routing-rules")
async def list_routing_rules(
    chain_id: Optional[int] = Query(None, description="Filter by chain ID"),
):
    """List MIDI routing rules."""
    async with get_session() as session:
        from app.database import MIDIRoutingRule
        stmt = select(MIDIRoutingRule)
        if chain_id is not None:
            stmt = stmt.where(MIDIRoutingRule.chain_id == chain_id)
        result = await session.execute(stmt)
        rules = result.scalars().all()
        rule_list = [_routing_rule_to_dict(r) for r in rules]
        return {"routing_rules": rule_list, "count": len(rule_list)}


@router.post("/routing-rules")
async def create_routing_rule(request: RoutingRuleRequest):
    """Create a MIDI routing rule."""
    async with get_session() as session:
        from app.database import MIDIRoutingRule
        rule = MIDIRoutingRule(
            chain_id=request.chain_id,
            name=request.name,
            routing_type=request.trigger_type,
            channel=request.channel,
            cc=request.data1,
            routing_data={
                "from_flow_index": request.from_flow_index,
                "to_flow_index": request.to_flow_index,
            },
            is_enabled=request.is_enabled,
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
        return {
            "routing_rule": _routing_rule_to_dict(rule),
            "message": "Routing rule created",
        }


@router.delete("/routing-rules/{rule_id}")
async def delete_routing_rule(rule_id: int):
    """Delete a MIDI routing rule."""
    async with get_session() as session:
        from app.database import MIDIRoutingRule
        stmt = delete(MIDIRoutingRule).where(MIDIRoutingRule.id == rule_id)
        result = await session.execute(stmt)
        await session.commit()
        return {"success": result.rowcount > 0, "message": "Routing rule deleted" if result.rowcount else "Not found"}


# ==================== Port Routes ====================

def _midi_router_or_503():
    if get_midi_router is None:
        raise HTTPException(status_code=503, detail="MIDI route service not available")
    return get_midi_router()


@router.get("/routes")
async def list_port_routes() -> Dict[str, Any]:
    """List durable MIDI Hub port routes."""
    route_service = _midi_router_or_503()
    routes = route_service.list_routes()
    return {
        "routes": routes,
        "count": len(routes),
        "match_mode": route_service.get_match_mode(),
    }


@router.post("/routes")
async def create_port_route(request: PortRouteRequest) -> Dict[str, Any]:
    """Create a durable MIDI Hub port route."""
    route_service = _midi_router_or_503()
    try:
        route = route_service.add_route(request.router_payload())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "created", "route": route}


@router.put("/routes/{route_id}")
async def update_port_route(route_id: str, request: PortRouteRequest) -> Dict[str, Any]:
    """Update a durable MIDI Hub port route."""
    route_service = _midi_router_or_503()
    try:
        route = route_service.update_route(route_id, request.router_payload(include_route_id=False))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"status": "updated", "route": route}


@router.delete("/routes/{route_id}")
async def delete_port_route(route_id: str) -> Dict[str, Any]:
    """Delete a durable MIDI Hub port route."""
    route_service = _midi_router_or_503()
    if not route_service.delete_route(route_id):
        raise HTTPException(status_code=404, detail="Route not found")
    return {"status": "deleted", "route_id": route_id}


@router.post("/routes/{route_id}/enable")
async def enable_port_route(route_id: str) -> Dict[str, Any]:
    """Enable a durable MIDI Hub port route."""
    route = _midi_router_or_503().set_route_enabled(route_id, True)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"status": "enabled", "route": route}


@router.post("/routes/{route_id}/disable")
async def disable_port_route(route_id: str) -> Dict[str, Any]:
    """Disable a durable MIDI Hub port route."""
    route = _midi_router_or_503().set_route_enabled(route_id, False)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"status": "disabled", "route": route}


# ==================== MIDI Output ====================

class SendCCRequest(BaseModel):
    channel: int = Field(..., ge=0, le=16)
    cc: int = Field(..., ge=0, le=127)
    value: int = Field(..., ge=0, le=127)


class SendProgramChangeRequest(BaseModel):
    channel: int = Field(..., ge=0, le=16)
    program: int = Field(..., ge=0, le=127)


class SendNoteRequest(BaseModel):
    channel: int = Field(..., ge=1, le=16)
    note: int = Field(..., ge=0, le=127)
    velocity: int = Field(..., ge=0, le=127)
    on: bool = True


@router.post("/send/cc")
async def send_cc(req: SendCCRequest):
    """Send a MIDI CC message."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")
    try:
        result = midi_service._engine.midi_send_cc(req.channel, req.cc, req.value)
        return {"success": bool(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send/program-change")
async def send_program_change(req: SendProgramChangeRequest):
    """Send a MIDI Program Change message."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")
    try:
        result = midi_service._engine.midi_send_program_change(req.channel, req.program)
        return {"success": bool(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send/note")
async def send_note(req: SendNoteRequest):
    """Send a MIDI Note On/Off message."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")
    try:
        if req.on:
            result = midi_service._engine.midi_send_note_on(req.channel, req.note, req.velocity)
        else:
            result = midi_service._engine.midi_send_note_off(req.channel, req.note, req.velocity)
        return {"success": bool(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_to_controller():
    """Sync all active mappings to the MIDI controller (send feedback for all)."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")
    try:
        midi_service._engine.midi_sync_all_mappings_to_controller()
        async with get_session() as session:
            mappings = await midi_service.get_all_mappings(session)
            return {"success": True, "mappings_synced": len(mappings)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Chain MIDI Config ====================

@router.post("/chains/{chain_id}/program")
async def set_chain_program(chain_id: int, request: ChainProgramRequest):
    """Set the Program Change number for a chain."""
    async with get_session() as session:
        success = await midi_service.set_chain_program_number(
            chain_id=chain_id,
            program_number=request.program_number,
            session=session,
            bank_msb=request.bank_msb,
            bank_lsb=request.bank_lsb,
        )
        if not success:
            raise HTTPException(status_code=400, detail="Failed to set chain program number")

        return {
            "status": "set",
            "chain_id": chain_id,
            "program_number": request.program_number,
        }


@router.post("/chains/{chain_id}/activate")
async def activate_chain(chain_id: int):
    """Activate a chain and its MIDI mappings."""
    async with get_session() as session:
        success = await midi_service.activate_chain(chain_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Chain not found")

        return {"status": "activated", "chain_id": chain_id}


def _serialize_chain_midi_config(config: "ChainMIDIConfig") -> Dict[str, Any]:
    return {
        "id": config.id,
        "chain_id": config.chain_id,
        "program_number": config.program_number,
        "bank_msb": config.bank_msb or 0,
        "bank_lsb": config.bank_lsb or 0,
        "send_pc_on_activate": bool(config.send_pc_on_activate),
    }


@router.get("/chain-configs")
async def list_chain_configs():
    """List all chain Program Change bindings."""
    from app.database import ChainMIDIConfig

    async with get_session() as session:
        result = await session.execute(select(ChainMIDIConfig))
        configs = [_serialize_chain_midi_config(c) for c in result.scalars().all()]
        return {"configs": configs, "count": len(configs)}


@router.put("/chain-configs/{chain_id}")
async def upsert_chain_config(chain_id: int, request: ChainConfigUpsertRequest):
    """Upsert the Program Change binding for a chain."""
    from app.database import Chain, ChainMIDIConfig

    async with get_session() as session:
        chain_exists = await session.execute(select(Chain.id).filter(Chain.id == chain_id))
        if chain_exists.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

        result = await session.execute(
            select(ChainMIDIConfig).filter(ChainMIDIConfig.chain_id == chain_id)
        )
        config = result.scalar_one_or_none()

        if config is None:
            config = ChainMIDIConfig(
                chain_id=chain_id,
                program_number=request.program_number,
                bank_msb=request.bank_msb or 0,
                bank_lsb=request.bank_lsb or 0,
                send_pc_on_activate=True if request.send_pc_on_activate is None else request.send_pc_on_activate,
            )
            session.add(config)
        else:
            config.program_number = request.program_number
            if request.bank_msb is not None:
                config.bank_msb = request.bank_msb
            if request.bank_lsb is not None:
                config.bank_lsb = request.bank_lsb
            if request.send_pc_on_activate is not None:
                config.send_pc_on_activate = request.send_pc_on_activate

        await session.flush()
        await session.refresh(config)
        return {
            "config": _serialize_chain_midi_config(config),
            "message": f"Saved chain {chain_id} program change binding",
        }


@router.delete("/chain-configs/{chain_id}")
async def delete_chain_config(chain_id: int):
    """Remove the Program Change binding for a chain."""
    from app.database import ChainMIDIConfig

    async with get_session() as session:
        result = await session.execute(
            select(ChainMIDIConfig).filter(ChainMIDIConfig.chain_id == chain_id)
        )
        config = result.scalar_one_or_none()
        if config is None:
            raise HTTPException(status_code=404, detail=f"No chain-config for chain {chain_id}")
        await session.delete(config)
        return {"success": True, "message": f"Deleted chain-config for chain {chain_id}"}


# ==================== Device Configs ====================

def _serialize_device_config(config: "MIDIDeviceConfig") -> Dict[str, Any]:
    return {
        "id": config.id,
        "device_name": config.device_name,
        "device_type": config.device_type,
        "is_enabled": bool(config.is_enabled),
        "auto_connect": bool(config.auto_connect),
        "channel_filter": config.channel_filter,
    }


@router.get("/device-configs")
async def list_device_configs():
    """List persistent MIDI device configurations."""
    from app.database import MIDIDeviceConfig

    async with get_session() as session:
        result = await session.execute(select(MIDIDeviceConfig))
        configs = [_serialize_device_config(c) for c in result.scalars().all()]
        return {"configs": configs, "count": len(configs)}


@router.post("/device-configs")
async def upsert_device_config(request: DeviceConfigUpsertRequest):
    """Upsert a persistent MIDI device configuration (keyed by device_name)."""
    from app.database import MIDIDeviceConfig

    async with get_session() as session:
        result = await session.execute(
            select(MIDIDeviceConfig).filter(MIDIDeviceConfig.device_name == request.device_name)
        )
        config = result.scalar_one_or_none()

        if config is None:
            config = MIDIDeviceConfig(
                device_name=request.device_name,
                device_type=request.device_type,
                is_enabled=True if request.is_enabled is None else request.is_enabled,
                auto_connect=True if request.auto_connect is None else request.auto_connect,
                channel_filter=request.channel_filter,
            )
            session.add(config)
        else:
            if request.device_type is not None:
                config.device_type = request.device_type
            if request.is_enabled is not None:
                config.is_enabled = request.is_enabled
            if request.auto_connect is not None:
                config.auto_connect = request.auto_connect
            if request.channel_filter is not None:
                config.channel_filter = request.channel_filter

        await session.flush()
        await session.refresh(config)
        return {
            "config": _serialize_device_config(config),
            "message": f"Saved device config for {request.device_name}",
        }


# ==================== Learn Mode ====================

@router.post("/learn/start")
async def start_learn(request: LearnStartRequest):
    """Start MIDI learn mode for a parameter."""
    curve = CurveType(request.curve) if request.curve in [c.value for c in CurveType] else CurveType.LINEAR

    success = await midi_service.start_learn(
        chain_id=request.chain_id,
        plugin_uri=request.plugin_uri,
        plugin_position=request.plugin_position,
        param_index=request.param_index,
        param_symbol=request.param_symbol,
        min_val=request.min_val,
        max_val=request.max_val,
        curve=curve,
    )

    return {
        "success": success,
        "target": {
            "chain_id": request.chain_id,
            "plugin_uri": request.plugin_uri,
            "plugin_position": request.plugin_position,
            "parameter_index": request.param_index,
            "parameter_symbol": request.param_symbol,
            "min_value": request.min_val,
            "max_value": request.max_val,
            "curve": curve.value,
        }
    }


@router.post("/learn/stop")
async def stop_learn():
    """Stop MIDI learn mode."""
    await midi_service.stop_learn()
    return {"success": True}


@router.get("/learn/status")
async def get_learn_status():
    """Get current MIDI learn status."""
    status = midi_service.get_learn_status()
    target = status.get("target")
    normalized_target = None
    if target:
        normalized_target = {
            "chain_id": target.get("chain_id"),
            "plugin_uri": target.get("plugin_uri"),
            "plugin_position": target.get("plugin_position"),
            "parameter_index": target.get("param_index"),
            "parameter_symbol": target.get("param_symbol"),
            "min_value": target.get("min_val"),
            "max_value": target.get("max_val"),
            "curve": target.get("curve").value if isinstance(target.get("curve"), CurveType) else target.get("curve"),
        }
    return {
        "learning": status.get("active", False),
        "target": normalized_target,
    }


@router.post("/learn/complete")
async def complete_learn(channel: int = Query(..., ge=0, le=16), cc: int = Query(..., ge=0, le=127)):
    """Manually complete MIDI learn with specified channel and CC."""
    async with get_session() as session:
        mapping_id = await midi_service.complete_learn(channel, cc, session)
        if not mapping_id:
            raise HTTPException(status_code=400, detail="Learn mode not active or no target set")

        return {"status": "completed", "mapping_id": mapping_id}


# ==================== Presets ====================

@router.get("/presets")
async def list_presets():
    """List all MIDI configuration presets."""
    async with get_session() as session:
        presets = await midi_service.list_presets(session)
        return {"presets": presets, "count": len(presets)}


@router.post("/presets")
async def save_preset(request: PresetCreateRequest):
    """Save current MIDI configuration as a preset."""
    async with get_session() as session:
        preset_id = await midi_service.save_preset(request.name, session, request.description)
        if not preset_id:
            raise HTTPException(status_code=400, detail="Failed to save preset")

        return {"status": "saved", "preset_id": preset_id}


@router.post("/presets/{preset_id}/load")
async def load_preset(preset_id: int):
    """Load a MIDI preset."""
    async with get_session() as session:
        success = await midi_service.load_preset(preset_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Preset not found")

        return {"status": "loaded", "preset_id": preset_id}


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: int):
    """Delete a MIDI preset."""
    async with get_session() as session:
        success = await midi_service.delete_preset(preset_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Preset not found")

        return {"status": "deleted", "preset_id": preset_id}


# ==================== Groups ====================

@router.get("/groups")
async def list_groups():
    """List all MIDI mapping groups."""
    async with get_session() as session:
        groups = await midi_service.get_all_groups(session)
        return {"groups": groups, "count": len(groups)}


@router.post("/groups")
async def create_group(request: GroupCreateRequest):
    """Create a MIDI mapping group."""
    async with get_session() as session:
        group_id = await midi_service.create_group(
            name=request.name,
            session=session,
            color=request.color,
            description=request.description,
        )
        if not group_id:
            raise HTTPException(status_code=400, detail="Failed to create group")

        return {"status": "created", "group_id": group_id}


# ==================== Status & Devices ====================

def _device_name_list(entries: Any) -> list[str]:
    names: list[str] = []
    if not isinstance(entries, list):
        return names
    for entry in entries:
        if isinstance(entry, str):
            name = entry.strip()
        elif isinstance(entry, dict):
            raw = entry.get("name")
            name = raw.strip() if isinstance(raw, str) else ""
        else:
            name = ""
        if name:
            names.append(name)
    return names


async def _collect_midi_devices() -> Dict[str, Any]:
    inputs: list[Any] = []
    outputs: list[Any] = []

    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            for index, port in enumerate(hub.list_ports()):
                row = {
                    "index": index,
                    "name": port.name,
                    "type": port.direction,
                    "port_id": port.port_id,
                    "kind": port.kind,
                }
                if port.direction in ("input", "duplex"):
                    inputs.append(row)
                if port.direction in ("output", "duplex"):
                    outputs.append(row)
            return {
                "inputs": inputs,
                "outputs": outputs,
                "input_devices": _device_name_list(inputs),
                "output_devices": _device_name_list(outputs),
                "source": "midi_hub",
            }
        except Exception as e:
            logger.debug(f"Could not get MidiHub devices: {e}")

    if midi_service._engine:
        try:
            inputs = await midi_service._engine.get_midi_input_devices()
            outputs = await midi_service._engine.get_midi_output_devices()
        except Exception as e:
            logger.debug(f"Could not get MIDI devices: {e}")

    return {
        "inputs": inputs,
        "outputs": outputs,
        "input_devices": _device_name_list(inputs),
        "output_devices": _device_name_list(outputs),
        "source": "juce_engine",
    }


@router.post("/engine/start")
async def start_midi_runtime():
    """Start the authoritative v2 MIDI runtime owner."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            midi_service.attach_midi_hub()
            return {"status": "started", "running": bool(hub.running), "source": "midi_hub"}
        except Exception as e:
            logger.debug(f"MidiHub start fallback to engine: {e}")

    if midi_service._engine:
        enabled = await midi_service._engine.enable_midi(True)
        return {"status": "started", "running": bool(enabled), "source": "juce_engine"}

    raise HTTPException(status_code=503, detail="MIDI runtime not available")


@router.post("/engine/stop")
async def stop_midi_runtime():
    """Stop the authoritative v2 MIDI runtime owner."""
    stopped = False
    source = "none"

    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            midi_service.detach_midi_hub()
            if hub.running:
                hub.stop()
            stopped = True
            source = "midi_hub"
        except Exception as e:
            logger.debug(f"MidiHub stop fallback to engine: {e}")

    if midi_service._engine:
        enabled = await midi_service._engine.enable_midi(False)
        stopped = stopped or not bool(enabled)
        source = source if source != "none" else "juce_engine"

    if not stopped:
        raise HTTPException(status_code=503, detail="MIDI runtime not available")

    return {"status": "stopped", "running": False, "source": source}


def _clock_engine_or_503():
    if get_midi_clock_engine is None:
        raise HTTPException(status_code=503, detail="MIDI clock engine not available")
    return get_midi_clock_engine()


@router.get("/clock")
async def get_clock_status() -> Dict[str, Any]:
    """Get MIDI clock status from the v2 clock owner."""
    return _clock_engine_or_503().status()


@router.put("/clock")
async def configure_clock(request: ClockConfigRequest) -> Dict[str, Any]:
    """Configure MIDI clock through the v2 clock owner."""
    updates = {key: value for key, value in request.model_dump().items() if value is not None}
    return _clock_engine_or_503().configure(**updates)


@router.post("/clock/tap")
async def tap_clock() -> Dict[str, Any]:
    """Record a tap-tempo event through the v2 clock owner."""
    return await _clock_engine_or_503().tap()


@router.post("/clock/start")
async def start_clock() -> Dict[str, Any]:
    """Start MIDI clock through the v2 clock owner."""
    return await _clock_engine_or_503().start()


@router.post("/clock/stop")
async def stop_clock() -> Dict[str, Any]:
    """Stop MIDI clock through the v2 clock owner."""
    return await _clock_engine_or_503().stop()


@router.post("/clock/continue")
async def continue_clock() -> Dict[str, Any]:
    """Continue MIDI clock through the v2 clock owner."""
    return await _clock_engine_or_503().cont()


@router.get("/status")
async def get_midi_status():
    """Get comprehensive MIDI system status."""
    async with get_session() as session:
        mappings = await midi_service.get_all_mappings(session)
        commands = await midi_service.get_all_commands(session)

    learn_status = midi_service.get_learn_status()

    # Get engine status if available
    engine_status = {}
    if midi_service._engine:
        try:
            engine_status = await midi_service._engine.get_midi_status()
        except Exception as e:
            logger.debug(f"Could not get engine MIDI status: {e}")

    return {
        "enabled": engine_status.get("enabled", False),
        "input_open": engine_status.get("input_open", False),
        "output_open": engine_status.get("output_open", False),
        "input_device": engine_status.get("input_device"),
        "output_device": engine_status.get("output_device"),
        "learning": learn_status["active"],
        "learn_target": learn_status["target"],
        "active_chain_id": midi_service._active_chain_id,
        "mappings_count": len(mappings),
        "commands_count": len(commands),
        "last_channel": engine_status.get("last_channel", 0),
        "last_cc": engine_status.get("last_cc", 0),
        "last_value": engine_status.get("last_value", 0),
    }


@router.get("/devices")
async def get_midi_devices():
    """List available MIDI devices."""
    return await _collect_midi_devices()


@router.post("/devices/refresh")
async def refresh_midi_devices():
    """Refresh MIDI devices through the authoritative v2 inventory path."""
    devices = await _collect_midi_devices()
    return {"status": "refreshed", **devices}


class DeviceOpenRequest(BaseModel):
    device_name: str = Field(..., min_length=1, max_length=255)


def _resolve_device_index(ports: list, device_name: str) -> Optional[int]:
    """Resolve a device name to its index in the port list."""
    for i, port in enumerate(ports):
        name = port.name if hasattr(port, "name") else (port.get("name") if isinstance(port, dict) else str(port))
        if name == device_name:
            return i
    return None


@router.post("/devices/input")
async def open_input_device_by_name(req: DeviceOpenRequest):
    """Open a MIDI input device by name (used by JUCE-GRID GUI)."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            ports = [port for port in hub.list_ports() if port.direction in ("input", "duplex")]
            idx = _resolve_device_index(ports, req.device_name)
            if idx is not None:
                return {"success": True, "device": req.device_name, "port_id": ports[idx].port_id}
        except Exception as e:
            logger.debug(f"MidiHub input open fallback to engine: {e}")

    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    try:
        devices = await midi_service._engine.get_midi_input_devices()
        idx = _resolve_device_index(devices, req.device_name)
        if idx is None:
            raise HTTPException(status_code=404, detail=f"Input device not found: {req.device_name}")
        success = await midi_service._engine.open_midi_input(idx)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to open input device: {req.device_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "device": req.device_name}


@router.post("/devices/input/{device_index}")
async def open_input_device(device_index: int):
    """Open a MIDI input device by index (legacy)."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            ports = [port for port in hub.list_ports() if port.direction in ("input", "duplex")]
            if 0 <= device_index < len(ports):
                return {"status": "opened", "device_index": device_index, "port_id": ports[device_index].port_id}
        except Exception as e:
            logger.debug(f"MidiHub input open fallback to engine: {e}")

    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    success = await midi_service._engine.open_midi_input(device_index)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to open input device")

    return {"status": "opened", "device_index": device_index}


@router.post("/devices/output")
async def open_output_device_by_name(req: DeviceOpenRequest):
    """Open a MIDI output device by name (used by JUCE-GRID GUI)."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            ports = [port for port in hub.list_ports() if port.direction in ("output", "duplex")]
            idx = _resolve_device_index(ports, req.device_name)
            if idx is not None:
                return {"success": True, "device": req.device_name, "port_id": ports[idx].port_id}
        except Exception as e:
            logger.debug(f"MidiHub output open fallback to engine: {e}")

    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    try:
        devices = await midi_service._engine.get_midi_output_devices()
        idx = _resolve_device_index(devices, req.device_name)
        if idx is None:
            raise HTTPException(status_code=404, detail=f"Output device not found: {req.device_name}")
        success = await midi_service._engine.open_midi_output(idx)
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to open output device: {req.device_name}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "device": req.device_name}


@router.post("/devices/output/{device_index}")
async def open_output_device(device_index: int):
    """Open a MIDI output device by index (legacy)."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            if not hub.running:
                hub.start()
            ports = [port for port in hub.list_ports() if port.direction in ("output", "duplex")]
            if 0 <= device_index < len(ports):
                return {"status": "opened", "device_index": device_index, "port_id": ports[device_index].port_id}
        except Exception as e:
            logger.debug(f"MidiHub output open fallback to engine: {e}")

    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    success = await midi_service._engine.open_midi_output(device_index)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to open output device")

    return {"status": "opened", "device_index": device_index}


@router.delete("/devices/input")
async def close_input_device():
    """Close the active MIDI input device."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            # Hub manages ports lifecycle; closing input specifically isn't typical
            # but we signal intent
        except Exception as e:
            logger.debug(f"MidiHub input close: {e}")
    if midi_service._engine:
        try:
            await midi_service._engine.close_midi_devices()
        except Exception as e:
            logger.debug(f"Engine close input: {e}")
    return {"success": True}


@router.delete("/devices/output")
async def close_output_device():
    """Close the active MIDI output device."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
        except Exception as e:
            logger.debug(f"MidiHub output close: {e}")
    if midi_service._engine:
        try:
            await midi_service._engine.close_midi_devices()
        except Exception as e:
            logger.debug(f"Engine close output: {e}")
    return {"success": True}


@router.post("/devices/close")
async def close_all_devices():
    """Close all MIDI devices."""
    if get_midi_hub is not None:
        try:
            hub = get_midi_hub()
            hub.stop()
        except Exception as e:
            logger.debug(f"MidiHub close failed: {e}")
    if midi_service._engine:
        await midi_service._engine.close_midi_devices()

    return {"status": "closed"}


# ==================== Activity Monitor ====================

@router.get("/activity")
async def get_midi_activity(limit: int = Query(50, ge=1, le=200)):
    """Get recent MIDI activity from monitor buffer."""
    # Activity is typically provided via WebSocket for real-time updates
    # This endpoint provides a snapshot
    return {
        "messages": [],
        "count": 0,
        "note": "Use WebSocket topic 'midi' for real-time activity",
    }


@router.post("/activity/clear")
async def clear_midi_activity():
    """Clear the v2 MIDI activity/traffic monitor."""
    if get_midi_traffic_monitor is not None:
        monitor = get_midi_traffic_monitor()
        monitor.clear()
        return {"success": True, "source": "midi_hub"}
    return {"success": True, "source": "none"}


# ==================== Device Profiles ====================

class ProfileApplyRequest(BaseModel):
    """Request to apply a device profile."""
    profile_id: str = Field(..., description="Profile ID to apply")
    clear_existing: bool = Field(True, description="Clear existing mappings first")


class ExpressionCalibrationRequest(BaseModel):
    """Request to update expression pedal calibration."""
    pedal_id: str = Field(..., description="Pedal ID (EXP1, EXP2)")
    min_raw: Optional[int] = Field(None, ge=0, le=127)
    max_raw: Optional[int] = Field(None, ge=0, le=127)
    deadzone_low: Optional[int] = Field(None, ge=0, le=127)
    deadzone_high: Optional[int] = Field(None, ge=0, le=127)
    curve: Optional[str] = Field(None, description="linear, logarithmic, exponential, s_curve")
    invert: Optional[bool] = None


class FirmwareFlashRequest(BaseModel):
    """Request to flash firmware."""
    profile_id: str = Field(..., description="Device profile ID")
    firmware_path: str = Field(..., description="Path to firmware file")


@router.get("/device-profiles")
async def list_device_profiles():
    """List all available device profiles."""
    profiles = device_profile_service.get_all_profiles()
    active = device_profile_service.get_active_profile()

    return {
        "profiles": profiles,
        "count": len(profiles),
        "active_profile_id": active["profile_id"] if active else None,
    }


@router.get("/device-profiles/{profile_id}")
async def get_device_profile(profile_id: str):
    """Get a specific device profile."""
    profile = device_profile_service.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/device-profiles/apply")
async def apply_device_profile(request: ProfileApplyRequest):
    """Apply a device profile, creating default mappings and commands."""
    try:
        async with get_session() as session:
            result = await device_profile_service.apply_profile(
                request.profile_id,
                session,
                clear_existing=request.clear_existing,
            )
            return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/device-profiles/detect")
async def detect_device_profile(device_name: str = Query(..., description="Connected device name")):
    """Auto-detect which profile matches a device name."""
    profile_id = await device_profile_service.detect_device(device_name)

    if profile_id:
        profile = device_profile_service.get_profile(profile_id)
        return {
            "detected": True,
            "profile_id": profile_id,
            "profile": profile,
        }

    return {
        "detected": False,
        "profile_id": None,
        "suggestion": "generic",
    }


@router.get("/device-profiles/active")
async def get_active_profile():
    """Get the currently active device profile."""
    profile = device_profile_service.get_active_profile()
    if not profile:
        return {"active": False, "profile": None}

    return {"active": True, "profile": profile}


# ==================== Bank Management ====================

@router.get("/banks/current")
async def get_current_bank():
    """Get current bank state."""
    bank = device_profile_service.get_current_bank()
    profile = device_profile_service.get_active_profile()

    if profile and profile.get("bank_config"):
        return {
            "current_bank": bank,
            "max_banks": profile["bank_config"]["max_banks"],
            "items_per_bank": profile["bank_config"]["items_per_bank"],
            "pc_offset": bank * profile["bank_config"]["items_per_bank"],
        }

    return {"current_bank": 0, "max_banks": 1, "items_per_bank": 128, "pc_offset": 0}


@router.post("/banks/up")
async def bank_up():
    """Move to next bank."""
    result = device_profile_service.bank_up()
    return result


@router.post("/banks/down")
async def bank_down():
    """Move to previous bank."""
    result = device_profile_service.bank_down()
    return result


@router.post("/banks/set")
async def set_bank(bank: int = Query(..., ge=0, description="Bank number to set")):
    """Set specific bank number."""
    result = device_profile_service.set_bank(bank)
    return result


# ==================== Expression Pedal Calibration ====================

@router.get("/expression/calibration")
async def get_expression_calibration():
    """Get all expression pedal calibration settings."""
    calibrations = device_profile_service.get_all_expression_calibrations()
    return {"calibrations": calibrations}


@router.get("/expression/calibration/{pedal_id}")
async def get_pedal_calibration(pedal_id: str):
    """Get calibration for a specific expression pedal."""
    cal = device_profile_service.get_expression_calibration(pedal_id)
    if not cal:
        raise HTTPException(status_code=404, detail="Pedal not found")
    return cal


@router.post("/expression/calibration")
async def update_expression_calibration(request: ExpressionCalibrationRequest):
    """Update expression pedal calibration settings."""
    result = device_profile_service.update_expression_calibration(
        pedal_id=request.pedal_id,
        min_raw=request.min_raw,
        max_raw=request.max_raw,
        deadzone_low=request.deadzone_low,
        deadzone_high=request.deadzone_high,
        curve=request.curve,
        invert=request.invert,
    )
    return {"status": "updated", "calibration": result}


# ==================== Firmware Update ====================

@router.get("/firmware/dfu-status")
async def check_dfu_status():
    """Check if DFU utility is available and list devices in DFU mode."""
    dfu_available = await device_profile_service.check_dfu_available()
    devices = await device_profile_service.list_dfu_devices() if dfu_available else []

    return {
        "dfu_available": dfu_available,
        "devices_in_dfu_mode": devices,
        "install_hint": "sudo dnf install dfu-util" if not dfu_available else None,
    }


@router.get("/firmware/dfu-instructions/{profile_id}")
async def get_dfu_instructions(profile_id: str):
    """Get instructions for entering DFU mode for a device."""
    instructions = device_profile_service.get_dfu_instructions(profile_id)
    return instructions


@router.post("/firmware/flash")
async def flash_firmware(request: FirmwareFlashRequest):
    """Flash firmware to a device in DFU mode."""
    result = await device_profile_service.flash_firmware(
        profile_id=request.profile_id,
        firmware_path=request.firmware_path,
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Flash failed"))

    return result
