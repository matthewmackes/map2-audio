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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/midi", tags=["midi-v2"])


# ==================== Request/Response Models ====================

class MappingCreateRequest(BaseModel):
    """Request body for creating a MIDI mapping."""
    channel: int = Field(0, ge=0, le=16, description="0=omni, 1-16=specific channel")
    cc: int = Field(..., ge=0, le=127, description="MIDI CC number 0-127")
    chain_id: int = Field(..., description="Chain ID this mapping belongs to")
    target_plugin_uri: str = Field(..., description="Target plugin URI")
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
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    curve_type: Optional[str] = None
    invert: Optional[bool] = None
    feedback_enabled: Optional[bool] = None
    feedback_cc: Optional[int] = None
    name: Optional[str] = None
    is_enabled: Optional[bool] = None
    group_id: Optional[int] = None


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
    chain_id: int = Field(..., description="Chain ID for the new mapping")
    plugin_uri: str = Field(..., description="Target plugin URI")
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
    enabled_only: bool = Query(False, description="Only return enabled mappings"),
):
    """List all MIDI CC mappings with optional filters."""
    async with get_session() as session:
        if plugin_uri:
            mappings = await midi_service.get_mappings_for_plugin(plugin_uri, session)
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

            return {"status": "created", "mapping_id": mapping_id}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error creating mapping: {str(e)}")


@router.patch("/mappings/{mapping_id}")
async def update_mapping(mapping_id: int, request: MappingUpdateRequest):
    """Update a MIDI mapping."""
    updates = request.dict(exclude_none=True)

    async with get_session() as session:
        success = await midi_service.update_mapping(mapping_id, updates, session)
        if not success:
            raise HTTPException(status_code=404, detail="Mapping not found")

        return {"status": "updated", "mapping_id": mapping_id}


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(mapping_id: int):
    """Delete a MIDI mapping."""
    async with get_session() as session:
        success = await midi_service.delete_mapping(mapping_id, session)
        if not success:
            raise HTTPException(status_code=404, detail="Mapping not found")

        return {"status": "deleted", "mapping_id": mapping_id}


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
        param_index=request.param_index,
        param_symbol=request.param_symbol,
        min_val=request.min_val,
        max_val=request.max_val,
        curve=curve,
    )

    return {
        "status": "learning",
        "target": {
            "chain_id": request.chain_id,
            "plugin_uri": request.plugin_uri,
            "param_index": request.param_index,
        }
    }


@router.post("/learn/stop")
async def stop_learn():
    """Stop MIDI learn mode."""
    await midi_service.stop_learn()
    return {"status": "stopped"}


@router.get("/learn/status")
async def get_learn_status():
    """Get current MIDI learn status."""
    return midi_service.get_learn_status()


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
        "input_device": engine_status.get("input_device"),
        "output_device": engine_status.get("output_device"),
        "learning": learn_status["active"],
        "learn_target": learn_status["target"],
        "active_chain_id": midi_service._active_chain_id,
        "mappings_count": len(mappings),
        "commands_count": len(commands),
    }


@router.get("/devices")
async def get_midi_devices():
    """List available MIDI devices."""
    inputs = []
    outputs = []

    if midi_service._engine:
        try:
            inputs = await midi_service._engine.get_midi_input_devices()
            outputs = await midi_service._engine.get_midi_output_devices()
        except Exception as e:
            logger.debug(f"Could not get MIDI devices: {e}")

    return {
        "inputs": inputs,
        "outputs": outputs,
    }


@router.post("/devices/input/{device_index}")
async def open_input_device(device_index: int):
    """Open a MIDI input device."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    success = await midi_service._engine.open_midi_input(device_index)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to open input device")

    return {"status": "opened", "device_index": device_index}


@router.post("/devices/output/{device_index}")
async def open_output_device(device_index: int):
    """Open a MIDI output device."""
    if not midi_service._engine:
        raise HTTPException(status_code=503, detail="MIDI engine not available")

    success = await midi_service._engine.open_midi_output(device_index)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to open output device")

    return {"status": "opened", "device_index": device_index}


@router.post("/devices/close")
async def close_all_devices():
    """Close all MIDI devices."""
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
