"""
MIDI API v2 - Comprehensive MIDI endpoints
Consolidates and enhances all MIDI functionality with per-chain mapping scope.

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
    from app.services.midi_hub.hub import get_midi_hub
    MIDI_HUB_AVAILABLE = True
except Exception:  # pragma: no cover - optional integration
    get_midi_hub = None  # type: ignore[assignment]
    MIDI_HUB_AVAILABLE = False

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


class PresetCreateRequest(BaseModel):
    """Request body for creating a MIDI preset."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=1000)


class GroupCreateRequest(BaseModel):
    """Request body for creating a mapping group."""
    name: str = Field(..., min_length=1, max_length=255)
    color: str = Field("#808080", description="Hex color code")
    description: str = Field("")


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
        name=request.name,
        action_data=request.action_data,
    )

    async with get_session() as session:
        command_id = await midi_service.create_command(dto, session)
        if not command_id:
            raise HTTPException(status_code=400, detail="Failed to create command")

        return {"status": "created", "command_id": command_id}


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
    name: Optional[str] = None
    action_data: Optional[Dict] = None
    is_enabled: Optional[bool] = None


@router.patch("/commands/{command_id}")
async def update_command(command_id: int, request: CommandUpdateRequest):
    """Update a MIDI command trigger."""
    async with get_session() as session:
        from app.database import MIDICommand
        stmt = select(MIDICommand).where(MIDICommand.id == command_id)
        result = await session.execute(stmt)
        command = result.scalar_one_or_none()
        if not command:
            raise HTTPException(status_code=404, detail="Command not found")

        updates = request.model_dump(exclude_none=True)
        for key, value in updates.items():
            if hasattr(command, key):
                setattr(command, key, value)

        await session.commit()
        return {"status": "updated", "command_id": command_id}


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
    inputs = []
    outputs = []

    if MIDI_HUB_AVAILABLE:
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
        "source": "juce_engine",
    }


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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
    if MIDI_HUB_AVAILABLE:
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
