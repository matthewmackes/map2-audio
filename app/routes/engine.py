"""
Audio Engine API Routes
Unified REST API for MAP2 Audio Engine (JUCE-based)

This module replaces the old pipedal.py routes with a cleaner,
engine-agnostic API.
"""

import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.services.juce_engine_service import get_audio_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engine", tags=["engine"])


# ============================================================================
# Request/Response Models
# ============================================================================

class InitializeRequest(BaseModel):
    sample_rate: int = 48000
    buffer_size: int = 256
    audio_device: str = "default"
    enable_midi: bool = True
    config_file: str = ""


class PluginRequest(BaseModel):
    uri: str


class ParameterRequest(BaseModel):
    instance_id: int
    param_name: str
    value: float


class BypassRequest(BaseModel):
    instance_id: int
    bypass: bool


class ReorderRequest(BaseModel):
    order: List[int]


class SnapshotRequest(BaseModel):
    snapshot_id: int
    name: str = ""


# ============================================================================
# Status & System
# ============================================================================

@router.get("/status")
async def get_status():
    """Get comprehensive audio engine status"""
    try:
        service = get_audio_engine()
        return service.get_system_info()
    except Exception as e:
        return {
            "running": False,
            "available": False,
            "error": str(e)
        }


@router.get("/version")
async def get_version():
    """Get audio engine version"""
    service = get_audio_engine()
    return {"version": service.get_version()}


@router.get("/diagnostics")
async def get_diagnostics():
    """Get comprehensive audio I/O diagnostics including xrun/jitter/connection health.
    
    Returns real-time data from the JUCE audio callback including:
    - Xrun count and history
    - Callback jitter analysis
    - CPU budget utilization
    - PipeWire/JACK connection health
    - Device recovery statistics
    """
    try:
        service = get_audio_engine()
        if not service._engine:
            raise HTTPException(status_code=503, detail="Engine not initialized")
        
        result = {}
        
        # Audio I/O stats (xrun, jitter, latency)
        try:
            result["io_stats"] = service._engine.get_audio_io_stats()
        except Exception as e:
            logger.warning(f"get_audio_io_stats failed: {e}")
            result["io_stats"] = {}
        
        # Connection health (PipeWire/JACK state, recovery count)
        try:
            result["connection_health"] = service._engine.get_connection_health()
        except Exception as e:
            logger.warning(f"get_connection_health failed: {e}")
            result["connection_health"] = {}
        
        # Xrun history (last 64 xrun timestamps)
        try:
            result["xrun_history"] = service._engine.get_xrun_history()
        except Exception as e:
            logger.warning(f"get_xrun_history failed: {e}")
            result["xrun_history"] = []
        
        # Basic engine info for context
        result["sample_rate"] = service._engine.get_sample_rate()
        result["buffer_size"] = service._engine.get_buffer_size()
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting diagnostics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get diagnostics")


@router.post("/diagnostics/reset-xruns")
async def reset_xrun_counter():
    """Reset the xrun counter without resetting other statistics."""
    try:
        service = get_audio_engine()
        if not service._engine:
            raise HTTPException(status_code=503, detail="Engine not initialized")
        service._engine.reset_xrun_counter()
        return {"status": "ok", "message": "Xrun counter reset"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to reset xrun counter")


# ============================================================================
# Engine Control
# ============================================================================

@router.post("/initialize")
async def initialize(request: InitializeRequest):
    """Initialize audio engine with configuration"""
    service = get_audio_engine()
    
    # Update configuration
    from app.services.juce_engine_service import AudioEngineConfig
    service.config = AudioEngineConfig(
        sample_rate=request.sample_rate,
        buffer_size=request.buffer_size,
        audio_device=request.audio_device,
        enable_midi=request.enable_midi,
        config_file=request.config_file
    )
    
    success = await service.initialize()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to initialize audio engine")
    
    return {
        "status": "initialized",
        "version": service.get_version(),
        "config": service.get_system_info()
    }


@router.post("/shutdown")
async def shutdown():
    """Shutdown audio engine"""
    service = get_audio_engine()
    await service.shutdown()
    return {"status": "shutdown"}


@router.post("/audio/start")
async def start_audio():
    """Start audio processing"""
    service = get_audio_engine()
    
    if not service.is_running:
        success = await service.initialize()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to initialize engine")
    
    success = await service.start_audio()
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start audio")
    
    return {"status": "audio_started"}


@router.post("/audio/stop")
async def stop_audio():
    """Stop audio processing"""
    service = get_audio_engine()
    await service.stop_audio()
    return {"status": "audio_stopped"}


@router.get("/audio/status")
async def get_audio_status():
    """Get audio processing status"""
    service = get_audio_engine()
    return {
        "running": service.is_audio_running(),
        "engine_running": service.is_running,
        "available": service.is_available
    }


# ============================================================================
# Plugin Management
# ============================================================================

@router.get("/plugins")
async def list_plugins():
    """List all available plugins (JUCE native + LV2)"""
    service = get_audio_engine()
    
    if not service.is_available:
        raise HTTPException(status_code=503, detail="Audio engine not available")
    
    if not service.is_running:
        success = await service.initialize()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to initialize engine")
    
    # Get JUCE native processors
    from app.routes.plugins import _get_juce_processors
    juce_processors = _get_juce_processors()
    
    # Get LV2 plugins
    lv2_plugins = await service.list_plugins()
    
    # Combine both - JUCE processors first as they are preferred
    plugins = juce_processors + lv2_plugins
    
    return {
        "plugins": plugins,
        "count": len(plugins),
        "engine": "juce"
    }


@router.get("/plugins/{uri:path}")
async def get_plugin_info(uri: str):
    """Get detailed plugin information"""
    service = get_audio_engine()
    
    if not service.is_running:
        await service.initialize()
    
    plugins = await service.list_plugins()
    
    for plugin in plugins:
        if plugin.get("uri") == uri:
            return plugin
    
    raise HTTPException(status_code=404, detail=f"Plugin not found: {uri}")


@router.post("/plugins/load")
async def load_plugin(request: PluginRequest):
    """Load a plugin into the chain"""
    service = get_audio_engine()
    
    if not service.is_running:
        await service.initialize()
    
    instance_id = await service.load_plugin(request.uri)
    
    if instance_id < 0:
        raise HTTPException(status_code=400, detail=f"Failed to load plugin: {request.uri}")
    
    return {
        "status": "loaded",
        "instance_id": instance_id,
        "uri": request.uri
    }


@router.post("/plugins/unload/{instance_id}")
async def unload_plugin(instance_id: int):
    """Unload a plugin from the chain"""
    service = get_audio_engine()
    
    success = await service.unload_plugin(instance_id)
    
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to unload plugin: {instance_id}")
    
    return {"status": "unloaded", "instance_id": instance_id}


# ============================================================================
# Chain Management
# ============================================================================

@router.get("/chain")
async def get_chain():
    """Get current plugin chain"""
    service = get_audio_engine()
    
    return {
        "chain": await service.get_chain_order(),
        "pedalboard": await service.get_current_pedalboard()
    }


@router.post("/chain/reorder")
async def reorder_chain(request: ReorderRequest):
    """Reorder plugins in the chain"""
    service = get_audio_engine()
    
    success = await service.reorder_chain(request.order)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reorder chain")
    
    return {"status": "reordered", "order": request.order}


# ============================================================================
# Parameters
# ============================================================================

@router.post("/parameter")
async def set_parameter(request: ParameterRequest):
    """Set a plugin parameter"""
    service = get_audio_engine()
    
    success = await service.set_parameter_direct(
        request.instance_id,
        request.param_name,
        request.value
    )
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to set parameter")
    
    return {
        "status": "set",
        "instance_id": request.instance_id,
        "param_name": request.param_name,
        "value": request.value
    }


@router.get("/parameter/{instance_id}/{param_name}")
async def get_parameter(instance_id: int, param_name: str):
    """Get a plugin parameter value"""
    service = get_audio_engine()
    
    # FIX #10: Actually read the parameter value from the engine
    # (was returning hardcoded 0.0 before)
    if not service or not service._engine:
        return {
            "instance_id": instance_id,
            "param_name": param_name,
            "value": 0.0,
            "error": "Engine not available"
        }
    
    try:
        value = await asyncio.to_thread(
            service._engine.get_parameter_by_name,
            instance_id,
            param_name
        )
        return {
            "instance_id": instance_id,
            "param_name": param_name,
            "value": value
        }
    except Exception as e:
        logger.error(f"Error getting parameter {param_name} for instance {instance_id}: {e}")
        return {
            "instance_id": instance_id,
            "param_name": param_name,
            "value": 0.0,
            "error": str(e)
        }


@router.post("/bypass")
async def set_bypass(request: BypassRequest):
    """Set plugin bypass state"""
    service = get_audio_engine()
    
    success = await service.set_bypass(request.instance_id, request.bypass)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to set bypass")
    
    return {
        "status": "set",
        "instance_id": request.instance_id,
        "bypass": request.bypass
    }


# ============================================================================
# Snapshots
# ============================================================================

@router.get("/snapshots")
async def list_snapshots():
    """List all snapshots"""
    service = get_audio_engine()
    
    return {
        "snapshots": await service.list_snapshots(),
        "current": await service.get_current_snapshot()
    }


@router.post("/snapshots/load")
async def load_snapshot(request: SnapshotRequest):
    """Load a snapshot"""
    service = get_audio_engine()
    
    success = await service.load_snapshot(request.snapshot_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to load snapshot")
    
    return {"status": "loaded", "snapshot_id": request.snapshot_id}


@router.get("/snapshot/current")
async def get_current_snapshot():
    """Get current snapshot ID"""
    service = get_audio_engine()
    return {"snapshot_id": await service.get_current_snapshot()}


# ============================================================================
# MIDI (JUCE-Based)
# ============================================================================

class MIDICCMappingRequest(BaseModel):
    channel: int
    cc_number: int
    plugin_uri: str
    param_index: int


class MIDILearnRequest(BaseModel):
    plugin_uri: str
    param_index: int


@router.get("/midi/status")
async def get_midi_status():
    """Get comprehensive MIDI status from JUCE engine"""
    service = get_audio_engine()
    return await service.get_midi_status()


@router.get("/midi/devices")
async def get_midi_devices():
    """List available MIDI devices"""
    service = get_audio_engine()

    return {
        "devices": await service.get_midi_devices(),
        "inputs": await service.get_midi_input_devices(),
        "outputs": await service.get_midi_output_devices(),
        "enabled": service._engine.is_midi_enabled() if service._engine else False
    }


@router.post("/midi/enable")
async def enable_midi(enable: bool = True):
    """Enable or disable MIDI"""
    service = get_audio_engine()

    success = await service.enable_midi(enable)

    return {"status": "enabled" if enable else "disabled", "success": success}


@router.post("/midi/input/open/{device_index}")
async def open_midi_input(device_index: int):
    """Open a MIDI input device"""
    service = get_audio_engine()
    success = await service.open_midi_input(device_index)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to open MIDI input device {device_index}")
    return {"status": "opened", "device_index": device_index}


@router.post("/midi/input/close")
async def close_midi_input():
    """Close the current MIDI input device"""
    service = get_audio_engine()
    success = await service.close_midi_input()
    return {"status": "closed", "success": success}


@router.post("/midi/output/open/{device_index}")
async def open_midi_output(device_index: int):
    """Open a MIDI output device"""
    service = get_audio_engine()
    success = await service.open_midi_output(device_index)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to open MIDI output device {device_index}")
    return {"status": "opened", "device_index": device_index}


@router.post("/midi/output/close")
async def close_midi_output():
    """Close the current MIDI output device"""
    service = get_audio_engine()
    success = await service.close_midi_output()
    return {"status": "closed", "success": success}


# MIDI CC Mappings (JUCE)

@router.get("/midi/mappings")
async def get_midi_mappings():
    """Get all MIDI CC mappings from JUCE engine"""
    service = get_audio_engine()
    mappings = await service.get_midi_cc_mappings()
    return {"mappings": mappings, "count": len(mappings)}


@router.post("/midi/mappings")
async def add_midi_mapping(request: MIDICCMappingRequest):
    """Add MIDI CC to parameter mapping via JUCE"""
    service = get_audio_engine()
    success = await service.add_midi_cc_mapping(
        request.channel,
        request.cc_number,
        request.plugin_uri,
        request.param_index
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to add MIDI mapping")
    return {
        "status": "added",
        "channel": request.channel,
        "cc_number": request.cc_number,
        "plugin_uri": request.plugin_uri,
        "param_index": request.param_index
    }


@router.delete("/midi/mappings/{channel}/{cc_number}")
async def remove_midi_mapping(channel: int, cc_number: int):
    """Remove MIDI CC mapping via JUCE"""
    service = get_audio_engine()
    success = await service.remove_midi_cc_mapping(channel, cc_number)
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"status": "removed", "channel": channel, "cc_number": cc_number}


@router.post("/midi/mappings/clear")
async def clear_midi_mappings():
    """Clear all MIDI CC mappings via JUCE"""
    service = get_audio_engine()
    success = await service.clear_midi_cc_mappings()
    return {"status": "cleared", "success": success}


# MIDI Learn (JUCE)

@router.post("/midi/learn/start")
async def start_midi_learn(request: MIDILearnRequest):
    """Start MIDI learn mode for a parameter via JUCE"""
    service = get_audio_engine()
    success = await service.start_midi_learn(request.plugin_uri, request.param_index)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to start MIDI learn")
    return {
        "status": "learning",
        "plugin_uri": request.plugin_uri,
        "param_index": request.param_index
    }


@router.post("/midi/learn/stop")
async def stop_midi_learn():
    """Stop MIDI learn mode via JUCE"""
    service = get_audio_engine()
    success = await service.stop_midi_learn()
    return {"status": "stopped", "success": success}


@router.get("/midi/learn/status")
async def get_midi_learn_status():
    """Get MIDI learn status from JUCE"""
    service = get_audio_engine()
    return await service.get_midi_learn_status()


# ============================================================================
# VU Meters
# ============================================================================

@router.get("/vu")
async def get_vu_levels():
    """Get master VU levels"""
    service = get_audio_engine()
    return await service.get_vu_levels()


@router.get("/vu/plugins")
async def get_plugin_vu_levels():
    """Get per-plugin VU levels"""
    service = get_audio_engine()
    return await service.get_plugin_vu_levels()


# ============================================================================
# PiPedal Compatibility Routes
# These provide backward compatibility with code expecting /api/pipedal/* endpoints
# ============================================================================

pipedal_compat_router = APIRouter(prefix="/api/pipedal", tags=["pipedal-compat"])


@pipedal_compat_router.get("/status")
async def pipedal_status():
    """PiPedal compatibility: Get status"""
    return await get_status()


@pipedal_compat_router.get("/plugins")
async def pipedal_plugins():
    """PiPedal compatibility: List plugins"""
    result = await list_plugins()
    result["engine"] = "pipedal"  # Pretend to be pipedal for compatibility
    return result


@pipedal_compat_router.post("/initialize")
async def pipedal_initialize(request: InitializeRequest):
    """PiPedal compatibility: Initialize"""
    return await initialize(request)


@pipedal_compat_router.get("/audio/status")
async def pipedal_audio_status():
    """PiPedal compatibility: Audio status"""
    return await get_audio_status()
