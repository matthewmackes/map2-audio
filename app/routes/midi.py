"""
Legacy MIDI Route Handlers.

This `/api/midi` surface is kept as a compatibility layer for older controller
and engine clients. New mapping, device-profile, and automation work should use
`/api/v2/midi`, while MIDI Hub workstation features live under `/api/midi/hub`.
"""

import logging
from typing import Dict, Any, List, Optional
from collections import deque

from app.utils.time import utc_now

logger = logging.getLogger(__name__)

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from app.services.midi_engine import MIDIEngineService

    router = APIRouter(prefix="/api/midi", tags=["midi-legacy"])
    midi_service = MIDIEngineService()

    # In-memory storage for additional MIDI state
    _midi_routes: Dict[int, Dict[str, Any]] = {}
    _midi_route_id = 0
    _midi_filters: Dict[str, bool] = {
        "note_on": True,
        "note_off": True,
        "cc": True,
        "program_change": True,
        "pitch_bend": True,
        "aftertouch": True,
        "sysex": False,
        "clock": True,
    }
    _midi_monitor_buffer: deque = deque(maxlen=100)
    _midi_clock_config: Dict[str, Any] = {
        "mode": "internal",
        "bpm": 120.0,
        "send_clock": False,
        "receive_clock": True,
        "running": False,
    }
    _midi_presets: Dict[int, Dict[str, Any]] = {}
    _midi_preset_id = 0

    # Pydantic models for request validation
    class MIDIRouteRequest(BaseModel):
        input_port: str
        output_port: str
        channel: Optional[int] = None
        enabled: bool = True

    class MIDIFiltersRequest(BaseModel):
        note_on: Optional[bool] = None
        note_off: Optional[bool] = None
        cc: Optional[bool] = None
        program_change: Optional[bool] = None
        pitch_bend: Optional[bool] = None
        aftertouch: Optional[bool] = None
        sysex: Optional[bool] = None
        clock: Optional[bool] = None

    class MIDIClockRequest(BaseModel):
        mode: str = "internal"
        bpm: float = 120.0
        send_clock: bool = False
        receive_clock: bool = True

    class MIDIPresetRequest(BaseModel):
        name: str

    @router.get("/status")
    async def get_midi_status():
        """Get MIDI engine status."""
        try:
            devices = await midi_service.discover_devices()
            mappings = await midi_service.get_mappings()
            running = getattr(midi_service, '_running', False)
            return {
                "enabled": running,
                "running": running,
                "available": True,
                "devices": len(devices) if isinstance(devices, list) else devices.get("count", 0),
                "device_list": devices if isinstance(devices, list) else devices.get("devices", []),
                "mappings_count": len(mappings) if isinstance(mappings, list) else 0
            }
        except Exception as e:
            return {
                "enabled": False,
                "running": False,
                "available": False,
                "devices": 0,
                "device_list": [],
                "mappings_count": 0,
                "error": str(e)
            }

    @router.get("/devices")
    async def get_devices():
        """Get available MIDI devices."""
        devices = await midi_service.discover_devices()
        return devices

    @router.post("/start")
    async def start_midi():
        """Start MIDI engine."""
        await midi_service.start()
        return {"message": "MIDI engine started"}

    @router.post("/stop")
    async def stop_midi():
        """Stop MIDI engine."""
        await midi_service.stop()
        return {"message": "MIDI engine stopped"}

    @router.get("/mappings")
    async def get_mappings():
        """Get MIDI CC mappings."""
        mappings = await midi_service.get_mappings()
        return {"mappings": mappings, "count": len(mappings)}

    @router.post("/mappings")
    async def add_mapping(
        channel: int,
        cc: int,
        target_uri: str,
        param_index: int,
        plugin_position: Optional[int] = None,
    ):
        """Add MIDI CC to parameter mapping.
        
        Query Parameters:
            channel: MIDI channel 1-16
            cc: MIDI CC number 0-127
            target_uri: Plugin URI string
            param_index: Parameter index >= 0
            plugin_position: Optional duplicate-safe chain position
        """
        success = await midi_service.add_cc_mapping(
            channel,
            cc,
            target_uri,
            param_index,
            plugin_position=plugin_position,
        )
        if not success:
            raise HTTPException(status_code=400, detail="Invalid MIDI parameters: channel must be 1-16, CC must be 0-127, param_index >= 0")
        return {
            "status": "mapped",
            "channel": channel,
            "cc": cc,
            "target": target_uri,
            "plugin_position": plugin_position,
            "param": param_index,
        }

    @router.post("/learn")
    async def midi_learn(target_uri: str, param_index: int, plugin_position: Optional[int] = None):
        """Enable MIDI learn mode for parameter."""
        success = await midi_service.midi_learn(target_uri, param_index, plugin_position=plugin_position)
        if not success:
            raise HTTPException(status_code=400, detail="Learn failed")
        return {
            "status": "learn_mode",
            "target": target_uri,
            "plugin_position": plugin_position,
            "param": param_index,
        }

    @router.delete("/mappings/{mapping_id}")
    async def delete_mapping(mapping_id: int):
        """Delete a MIDI CC mapping by ID."""
        success = await midi_service.delete_mapping(mapping_id)
        if not success:
            raise HTTPException(status_code=404, detail="Mapping not found")
        return {"status": "deleted", "mapping_id": mapping_id}

    # ==================== DEVICE REFRESH ====================

    @router.post("/refresh")
    async def refresh_devices():
        """Refresh/rescan MIDI devices."""
        devices = await midi_service.discover_devices()
        return {
            "status": "refreshed",
            "inputs": devices.get("inputs", []),
            "outputs": devices.get("outputs", []),
            "input_count": len(devices.get("inputs", [])),
            "output_count": len(devices.get("outputs", [])),
        }

    # ==================== MIDI ROUTING ====================

    @router.get("/routing")
    async def get_routing():
        """Get MIDI routing configuration."""
        return {
            "routes": list(_midi_routes.values()),
            "count": len(_midi_routes),
        }

    @router.post("/routing")
    async def create_route(request: MIDIRouteRequest):
        """Create or update a MIDI route."""
        global _midi_route_id
        _midi_route_id += 1
        route = {
            "id": _midi_route_id,
            "input_port": request.input_port,
            "output_port": request.output_port,
            "channel": request.channel,
            "enabled": request.enabled,
            "created_at": utc_now().isoformat(),
        }
        _midi_routes[_midi_route_id] = route
        return {"status": "created", "route": route}

    @router.delete("/routing/{route_id}")
    async def delete_route(route_id: int):
        """Delete a MIDI route."""
        if route_id not in _midi_routes:
            raise HTTPException(status_code=404, detail="Route not found")
        del _midi_routes[route_id]
        return {"status": "deleted", "route_id": route_id}

    # ==================== MIDI FILTERS ====================

    @router.get("/filters")
    async def get_filters():
        """Get MIDI filter configuration."""
        return {"filters": _midi_filters}

    @router.put("/filters")
    async def set_filters(request: MIDIFiltersRequest):
        """Set MIDI message type filters."""
        if request.note_on is not None:
            _midi_filters["note_on"] = request.note_on
        if request.note_off is not None:
            _midi_filters["note_off"] = request.note_off
        if request.cc is not None:
            _midi_filters["cc"] = request.cc
        if request.program_change is not None:
            _midi_filters["program_change"] = request.program_change
        if request.pitch_bend is not None:
            _midi_filters["pitch_bend"] = request.pitch_bend
        if request.aftertouch is not None:
            _midi_filters["aftertouch"] = request.aftertouch
        if request.sysex is not None:
            _midi_filters["sysex"] = request.sysex
        if request.clock is not None:
            _midi_filters["clock"] = request.clock
        return {"status": "updated", "filters": _midi_filters}

    # ==================== MIDI MONITOR ====================

    @router.get("/monitor")
    async def get_monitor(limit: int = 50):
        """Get recent MIDI messages (monitor mode)."""
        messages = list(_midi_monitor_buffer)[-limit:]
        return {
            "messages": messages,
            "count": len(messages),
            "buffer_size": len(_midi_monitor_buffer),
        }

    @router.post("/monitor/clear")
    async def clear_monitor():
        """Clear MIDI monitor message buffer."""
        _midi_monitor_buffer.clear()
        return {"status": "cleared"}

    def log_midi_message(msg_type: str, channel: int, data: Dict[str, Any]):
        """Log a MIDI message to the monitor buffer."""
        _midi_monitor_buffer.append({
            "type": msg_type,
            "channel": channel,
            "data": data,
            "timestamp": utc_now().isoformat(),
        })

    # ==================== MIDI CLOCK ====================

    @router.get("/clock")
    async def get_clock_config():
        """Get MIDI clock configuration."""
        return _midi_clock_config

    @router.put("/clock")
    async def set_clock_config(request: MIDIClockRequest):
        """Configure MIDI clock."""
        _midi_clock_config["mode"] = request.mode
        _midi_clock_config["bpm"] = max(20.0, min(300.0, request.bpm))
        _midi_clock_config["send_clock"] = request.send_clock
        _midi_clock_config["receive_clock"] = request.receive_clock
        return {"status": "updated", "config": _midi_clock_config}

    @router.post("/clock/start")
    async def start_clock():
        """Start MIDI clock."""
        _midi_clock_config["running"] = True
        return {"status": "started", "bpm": _midi_clock_config["bpm"]}

    @router.post("/clock/stop")
    async def stop_clock():
        """Stop MIDI clock."""
        _midi_clock_config["running"] = False
        return {"status": "stopped"}

    # ==================== MIDI PRESETS ====================

    @router.get("/presets")
    async def list_presets():
        """List MIDI presets."""
        return {
            "presets": list(_midi_presets.values()),
            "count": len(_midi_presets),
        }

    @router.post("/presets")
    async def save_preset(request: MIDIPresetRequest):
        """Save current MIDI configuration as a preset."""
        global _midi_preset_id
        _midi_preset_id += 1
        preset = {
            "id": _midi_preset_id,
            "name": request.name,
            "routes": list(_midi_routes.values()),
            "filters": dict(_midi_filters),
            "clock": dict(_midi_clock_config),
            "mappings": await midi_service.get_mappings(),
            "created_at": utc_now().isoformat(),
        }
        _midi_presets[_midi_preset_id] = preset
        return {"status": "saved", "preset": {"id": preset["id"], "name": preset["name"]}}

    @router.post("/presets/{preset_id}/load")
    async def load_preset(preset_id: int):
        """Load a MIDI preset."""
        if preset_id not in _midi_presets:
            raise HTTPException(status_code=404, detail="Preset not found")

        preset = _midi_presets[preset_id]

        # Restore routes
        global _midi_routes, _midi_route_id
        _midi_routes = {r["id"]: r for r in preset.get("routes", [])}
        if _midi_routes:
            _midi_route_id = max(_midi_routes.keys())

        # Restore filters
        _midi_filters.update(preset.get("filters", {}))

        # Restore clock config
        _midi_clock_config.update(preset.get("clock", {}))

        return {"status": "loaded", "preset_id": preset_id, "name": preset["name"]}

    @router.delete("/presets/{preset_id}")
    async def delete_preset(preset_id: int):
        """Delete a MIDI preset."""
        if preset_id not in _midi_presets:
            raise HTTPException(status_code=404, detail="Preset not found")
        del _midi_presets[preset_id]
        return {"status": "deleted", "preset_id": preset_id}

except ImportError:
    router = None
