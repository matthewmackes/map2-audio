"""
Automation Routes - API endpoints for parameter automation
"""

import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.automation_engine import automation_engine, CurveType, ModulationSource
from app.services.event_publisher import event_publisher, EventType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/automation", tags=["automation"])


class AutomationPoint(BaseModel):
    """Automation point model"""
    time: float
    value: float
    curve: str = "linear"


class AutomationLaneCreate(BaseModel):
    """Create automation lane request"""
    parameter_id: str
    points: List[AutomationPoint] = []
    enabled: bool = True
    modulation_source: str = "timeline"
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None


class AddPointRequest(BaseModel):
    """Add automation point request"""
    parameter_id: str
    time: float
    value: float
    curve: str = "linear"


class RemovePointRequest(BaseModel):
    """Remove automation point request"""
    parameter_id: str
    time: float


class LFOConfig(BaseModel):
    """LFO configuration"""
    parameter_id: str
    rate_hz: float = 1.0
    depth: float = 1.0
    waveform: str = "sine"


class PlaybackControl(BaseModel):
    """Playback control request"""
    action: str  # "start", "stop", "seek"
    time: Optional[float] = 0.0


@router.post("/lanes")
async def create_lane(request: AutomationLaneCreate) -> Dict[str, str]:
    """
    Create or update an automation lane

    Request body:
    - parameter_id: Parameter identifier (e.g., "plugin_1:0")
    - points: List of automation points
    - enabled: Whether automation is active
    - modulation_source: "timeline", "lfo", etc.
    - loop_start: Optional loop start time
    - loop_end: Optional loop end time

    Returns:
        Success message
    """
    try:
        # Create lane
        from app.services.automation_engine import AutomationLane, CurveType, ModulationSource

        lane = AutomationLane(
            parameter_id=request.parameter_id,
            enabled=request.enabled,
            modulation_source=ModulationSource(request.modulation_source),
            loop_start=request.loop_start,
            loop_end=request.loop_end
        )

        # Add points
        for point in request.points:
            lane.add_point(
                time=point.time,
                value=point.value,
                curve=CurveType(point.curve)
            )

        automation_engine.add_lane(request.parameter_id, lane)

        # Publish automation lane added event
        await event_publisher.publish(
            "automation",
            EventType.AUTOMATION_LANE_ADDED,
            {"parameter_id": request.parameter_id, "points_count": len(request.points)}
        )

        return {
            "status": "success",
            "message": f"Created automation lane for {request.parameter_id}"
        }

    except Exception as e:
        logger.error(f"Error creating automation lane: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/lanes/{parameter_id}")
async def delete_lane(parameter_id: str) -> Dict[str, str]:
    """
    Delete an automation lane

    Path parameters:
    - parameter_id: Parameter identifier

    Returns:
        Success message
    """
    success = automation_engine.remove_lane(parameter_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Lane not found: {parameter_id}")

    # Publish automation lane deleted event
    await event_publisher.publish(
        "automation",
        EventType.AUTOMATION_LANE_DELETED,
        {"parameter_id": parameter_id}
    )

    return {
        "status": "success",
        "message": f"Deleted automation lane for {parameter_id}"
    }


@router.post("/points")
async def add_point(request: AddPointRequest) -> Dict[str, str]:
    """
    Add automation point to a lane
    
    Request body:
    - parameter_id: Parameter identifier
    - time: Time in seconds
    - value: Normalized value (0.0 to 1.0)
    - curve: Interpolation curve type
    
    Returns:
        Success message
    """
    try:
        automation_engine.add_automation_point(
            parameter_id=request.parameter_id,
            time=request.time,
            value=request.value,
            curve=CurveType(request.curve)
        )
        
        return {
            "status": "success",
            "message": f"Added automation point at {request.time}s"
        }
        
    except Exception as e:
        logger.error(f"Error adding automation point: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/points")
async def remove_point(request: RemovePointRequest) -> Dict[str, str]:
    """
    Remove automation point from a lane
    
    Request body:
    - parameter_id: Parameter identifier
    - time: Time to remove
    
    Returns:
        Success message
    """
    success = automation_engine.remove_automation_point(
        parameter_id=request.parameter_id,
        time=request.time
    )
    
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Point not found at time {request.time}"
        )
    
    return {
        "status": "success",
        "message": f"Removed automation point at {request.time}s"
    }


@router.get("/lanes")
async def list_lanes() -> Dict[str, List[str]]:
    """
    Get list of all parameters with automation
    
    Returns:
        List of parameter IDs
    """
    parameters = automation_engine.get_all_automated_parameters()
    
    return {
        "parameters": parameters,
        "count": len(parameters)
    }


@router.get("/lanes/{parameter_id}")
async def get_lane(parameter_id: str) -> Dict[str, Any]:
    """
    Get automation data for a parameter
    
    Path parameters:
    - parameter_id: Parameter identifier
    
    Returns:
        Automation lane data
    """
    data = automation_engine.export_automation(parameter_id)
    
    if not data:
        raise HTTPException(status_code=404, detail=f"Lane not found: {parameter_id}")
    
    return data


@router.get("/value/{parameter_id}")
async def get_value(parameter_id: str, time: Optional[float] = None) -> Dict[str, Any]:
    """
    Get current automated value for a parameter
    
    Path parameters:
    - parameter_id: Parameter identifier
    
    Query parameters:
    - time: Time position (uses current playback time if not specified)
    
    Returns:
        Current parameter value
    """
    value = automation_engine.get_parameter_value(parameter_id, time)
    
    if value is None:
        raise HTTPException(
            status_code=404,
            detail=f"No automation data for {parameter_id}"
        )
    
    return {
        "parameter_id": parameter_id,
        "value": value,
        "time": time if time is not None else automation_engine.current_time
    }


@router.post("/playback")
async def control_playback(control: PlaybackControl) -> Dict[str, Any]:
    """
    Control automation playback

    Request body:
    - action: "start", "stop", or "seek"
    - time: Time position for start/seek actions

    Returns:
        Playback status
    """
    try:
        if control.action == "start":
            automation_engine.start_playback(control.time or 0.0)
            # Publish automation started event
            await event_publisher.publish(
                "automation",
                EventType.AUTOMATION_STARTED,
                {"time": control.time or 0.0}
            )
        elif control.action == "stop":
            automation_engine.stop_playback()
            # Publish automation stopped event
            await event_publisher.publish(
                "automation",
                EventType.AUTOMATION_STOPPED,
                {"time": automation_engine.current_time}
            )
        elif control.action == "seek":
            automation_engine.seek(control.time or 0.0)
            # Publish time update event
            await event_publisher.publish(
                "automation",
                EventType.AUTOMATION_TIME,
                {"time": control.time or 0.0}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid action: {control.action}")

        return {
            "status": "success",
            "action": control.action,
            "is_playing": automation_engine.is_playing,
            "current_time": automation_engine.current_time
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error controlling playback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_automation(data: Dict[str, Any]) -> Dict[str, str]:
    """
    Import automation data
    
    Request body:
    - Automation lane data (from export)
    
    Returns:
        Success message
    """
    success = automation_engine.import_automation(data)
    
    if not success:
        raise HTTPException(status_code=400, detail="Invalid automation data")
    
    return {
        "status": "success",
        "message": f"Imported automation for {data.get('parameter_id')}"
    }


@router.post("/clear")
async def clear_all() -> Dict[str, str]:
    """
    Clear all automation data
    
    Returns:
        Success message
    """
    automation_engine.clear_all()
    
    return {
        "status": "success",
        "message": "Cleared all automation data"
    }


# ============================================================================
# Recording endpoints for real-time automation recording
# ============================================================================

# In-memory recording state
_recording_state = {
    "recording": False,
    "playing": False,
    "start_time": None,
    "current_time": 0.0,
    "duration": 0.0,
    "recorded_lanes": {},
}


@router.get("/status")
async def get_full_status() -> Dict[str, Any]:
    """
    Get full automation status including recording state
    
    Returns:
        Complete automation status
    """
    return {
        "is_playing": automation_engine.is_playing,
        "playing": _recording_state["playing"],
        "recording": _recording_state["recording"],
        "current_time": _recording_state["current_time"],
        "duration": _recording_state["duration"],
        "loop_enabled": automation_engine.loop_enabled,
        "loop_start": automation_engine.loop_start,
        "loop_end": automation_engine.loop_end,
        "automated_parameters": len(automation_engine.get_all_automated_parameters()),
        "sample_rate": automation_engine.sample_rate
    }


    
    _recording_state["recording"] = False
    duration = time.time() - _recording_state["start_time"] if _recording_state["start_time"] else 0
    _recording_state["duration"] = duration
    
    # Count recorded points
    total_points = sum(
        len(lane.get("points", []))
        for lane in _recording_state["recorded_lanes"].values()
    )
    
    await event_publisher.publish(
        "automation",
        EventType.AUTOMATION_RECORDING_STOPPED,
        {"duration": duration, "points_recorded": total_points}
    )
    
    return {
        "status": "success",
        "message": "Recording stopped",
        "duration": duration,
        "lanes_recorded": len(_recording_state["recorded_lanes"]),
        "points_recorded": total_points,
    }


@router.post("/record/point")
async def record_point(request: AddPointRequest) -> Dict[str, str]:
    """
    Record a single automation point (called during recording)
    
    Request body:
    - parameter_id: Parameter being automated
    - time: Time offset from recording start
    - value: Parameter value
    - curve: Curve type
    
    Returns:
        Success message
    """
    if not _recording_state["recording"]:
        raise HTTPException(status_code=400, detail="Not recording")
    
    # Add to recorded lanes
    if request.parameter_id not in _recording_state["recorded_lanes"]:
        _recording_state["recorded_lanes"][request.parameter_id] = {"points": []}
    
    _recording_state["recorded_lanes"][request.parameter_id]["points"].append({
        "time": request.time,
        "value": request.value,
        "curve": request.curve,
    })
    
    # Also add to actual automation engine
    automation_engine.add_automation_point(
        parameter_id=request.parameter_id,
        time=request.time,
        value=request.value,
        curve=CurveType(request.curve)
    )
    
    _recording_state["current_time"] = request.time
    
    return {"status": "success", "message": "Point recorded"}


@router.post("/playback/start")
async def start_playback() -> Dict[str, str]:
    """
    Start automation playback
    
    Returns:
        Success message
    """
    automation_engine.start_playback()
    _recording_state["playing"] = True
    
    return {"status": "success", "message": "Playback started"}


@router.post("/playback/stop")
async def stop_playback() -> Dict[str, str]:
    """
    Stop automation playback
    
    Returns:
        Success message
    """
    automation_engine.stop_playback()
    _recording_state["playing"] = False
    
    return {"status": "success", "message": "Playback stopped"}


# ============================================================================
# LFO Modulation endpoints
# ============================================================================

class LFOConfigRequest(BaseModel):
    """LFO configuration request"""
    parameter_id: str
    rate_hz: float = 1.0
    depth: float = 0.5
    waveform: str = "sine"
    bipolar: bool = True
    sync_to_tempo: bool = False
    tempo_division: str = "1/4"


# In-memory LFO state
_lfo_configs: Dict[str, Dict[str, Any]] = {}


@router.post("/lfo")
async def configure_lfo(request: LFOConfigRequest) -> Dict[str, str]:
    """
    Configure LFO modulation for a parameter
    
    Request body:
    - parameter_id: Parameter to modulate
    - rate_hz: LFO rate in Hz
    - depth: Modulation depth (0-1)
    - waveform: sine, triangle, square, saw_up, saw_down, random, sample_hold, pulse
    - bipolar: True for -1 to 1, False for 0 to 1
    - sync_to_tempo: Sync rate to tempo
    - tempo_division: Note division when synced
    
    Returns:
        Success message
    """
    try:
        # Try to apply via automation engine
        automation_engine.configure_lfo(
            parameter_id=request.parameter_id,
            rate_hz=request.rate_hz,
            depth=request.depth,
            waveform=request.waveform,
        )
    except Exception as e:
        logger.debug(f"LFO via automation engine failed: {e}")
    
    # Store config
    _lfo_configs[request.parameter_id] = {
        "rate_hz": request.rate_hz,
        "depth": request.depth,
        "waveform": request.waveform,
        "bipolar": request.bipolar,
        "sync_to_tempo": request.sync_to_tempo,
        "tempo_division": request.tempo_division,
        "active": True,
    }
    
    await event_publisher.publish(
        "automation",
        EventType.LFO_CONFIGURED,
        {"parameter_id": request.parameter_id, "config": _lfo_configs[request.parameter_id]}
    )
    
    return {
        "status": "success",
        "message": f"LFO configured for {request.parameter_id}"
    }


@router.delete("/lfo/{parameter_id:path}")
async def remove_lfo(parameter_id: str) -> Dict[str, str]:
    """
    Remove LFO from a parameter
    
    Path parameters:
    - parameter_id: Parameter to remove LFO from
    
    Returns:
        Success message
    """
    if parameter_id in _lfo_configs:
        del _lfo_configs[parameter_id]
    
    try:
        automation_engine.remove_lfo(parameter_id)
    except Exception as e:
        logger.debug(f"Remove LFO from engine failed: {e}")
    
    return {
        "status": "success",
        "message": f"LFO removed from {parameter_id}"
    }


@router.get("/lfo/{parameter_id:path}")
async def get_lfo(parameter_id: str) -> Dict[str, Any]:
    """
    Get LFO configuration for a parameter
    
    Path parameters:
    - parameter_id: Parameter to query
    
    Returns:
        LFO configuration or 404
    """
    if parameter_id not in _lfo_configs:
        raise HTTPException(status_code=404, detail=f"No LFO for {parameter_id}")
    
    return _lfo_configs[parameter_id]


# ============================================================================
# Envelope Follower endpoints
# ============================================================================

class EnvelopeConfigRequest(BaseModel):
    """Envelope follower configuration request"""
    parameter_id: str
    input_source: str = "main_input"  # main_input, sidechain, plugin_output
    attack_ms: float = 10.0
    release_ms: float = 100.0
    threshold_db: float = -60.0
    sensitivity: float = 1.0
    invert: bool = False


# In-memory envelope state
_envelope_configs: Dict[str, Dict[str, Any]] = {}
_envelope_levels: Dict[str, float] = {}


@router.post("/envelope")
async def configure_envelope(request: EnvelopeConfigRequest) -> Dict[str, str]:
    """
    Configure envelope follower for a parameter
    
    Request body:
    - parameter_id: Parameter to modulate
    - input_source: Audio input source
    - attack_ms: Attack time in ms
    - release_ms: Release time in ms
    - threshold_db: Gate threshold
    - sensitivity: Amplitude multiplier
    - invert: Invert output (ducking mode)
    
    Returns:
        Success message
    """
    try:
        automation_engine.configure_envelope_follower(
            parameter_id=request.parameter_id,
            input_source=request.input_source,
            attack_ms=request.attack_ms,
            release_ms=request.release_ms,
            threshold_db=request.threshold_db,
            sensitivity=request.sensitivity,
            invert=request.invert,
        )
    except Exception as e:
        logger.debug(f"Envelope via automation engine failed: {e}")
    
    _envelope_configs[request.parameter_id] = {
        "input_source": request.input_source,
        "attack_ms": request.attack_ms,
        "release_ms": request.release_ms,
        "threshold_db": request.threshold_db,
        "sensitivity": request.sensitivity,
        "invert": request.invert,
        "active": True,
    }
    _envelope_levels[request.parameter_id] = 0.0
    
    return {
        "status": "success",
        "message": f"Envelope follower configured for {request.parameter_id}"
    }


@router.delete("/envelope/{parameter_id:path}")
async def remove_envelope(parameter_id: str) -> Dict[str, str]:
    """
    Remove envelope follower from a parameter
    
    Path parameters:
    - parameter_id: Parameter to remove envelope from
    
    Returns:
        Success message
    """
    if parameter_id in _envelope_configs:
        del _envelope_configs[parameter_id]
    if parameter_id in _envelope_levels:
        del _envelope_levels[parameter_id]
    
    try:
        automation_engine.remove_envelope_follower(parameter_id)
    except Exception as e:
        logger.debug(f"Remove envelope from engine failed: {e}")
    
    return {
        "status": "success",
        "message": f"Envelope follower removed from {parameter_id}"
    }


