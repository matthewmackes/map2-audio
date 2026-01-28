"""
MIDI Learn Routes - API endpoints for MIDI parameter mapping
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.midi_learn import midi_learn_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/midi-learn", tags=["midi-learn"])


class CreateMappingRequest(BaseModel):
    """Create MIDI mapping request"""
    parameter_id: str
    cc_number: int
    channel: Optional[int] = None
    min_value: float = 0.0
    max_value: float = 1.0
    curve: str = "linear"
    inverted: bool = False


class ProcessCCRequest(BaseModel):
    """Process MIDI CC message"""
    cc_number: int
    cc_value: int
    channel: Optional[int] = None


class TemplateRequest(BaseModel):
    """MIDI mapping template"""
    name: str
    description: str = ""


@router.post("/learn/start")
async def start_learn(parameter_id: str) -> Dict[str, Any]:
    """
    Start MIDI learn mode for a parameter
    
    Query parameters:
    - parameter_id: Parameter to assign (e.g., "plugin_1:0")
    
    Returns:
        Learn mode status
    """
    midi_learn_manager.start_learn_mode(parameter_id)
    
    return {
        "status": "success",
        "message": f"MIDI Learn active for {parameter_id}",
        "learn_status": midi_learn_manager.get_learn_status()
    }


@router.post("/learn/stop")
async def stop_learn() -> Dict[str, str]:
    """
    Stop MIDI learn mode
    
    Returns:
        Success message
    """
    midi_learn_manager.stop_learn_mode()
    
    return {
        "status": "success",
        "message": "MIDI Learn stopped"
    }


@router.get("/learn/status")
async def get_learn_status() -> Dict[str, Any]:
    """
    Get current MIDI learn status
    
    Returns:
        Learn mode status
    """
    return midi_learn_manager.get_learn_status()


@router.post("/mappings")
async def create_mapping(request: CreateMappingRequest) -> Dict[str, Any]:
    """
    Create a new MIDI CC to parameter mapping
    
    Request body:
    - parameter_id: Target parameter
    - cc_number: MIDI CC number (0-127)
    - channel: MIDI channel (0-15, None = omni)
    - min_value: Minimum parameter value
    - max_value: Maximum parameter value
    - curve: Response curve ("linear", "exponential", "logarithmic")
    - inverted: Invert CC direction
    
    Returns:
        Created mapping
    """
    try:
        mapping = midi_learn_manager.create_mapping(
            parameter_id=request.parameter_id,
            cc_number=request.cc_number,
            channel=request.channel,
            min_value=request.min_value,
            max_value=request.max_value,
            curve=request.curve,
            inverted=request.inverted
        )
        
        return {
            "status": "success",
            "message": "Mapping created",
            "mapping": mapping.to_dict()
        }
        
    except Exception as e:
        logger.error(f"Error creating mapping: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mappings/{parameter_id}")
async def delete_mapping(parameter_id: str) -> Dict[str, str]:
    """
    Delete MIDI mapping for a parameter
    
    Path parameters:
    - parameter_id: Parameter to unmap
    
    Returns:
        Success message
    """
    success = midi_learn_manager.remove_mapping(parameter_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"No mapping found for {parameter_id}")
    
    return {
        "status": "success",
        "message": f"Mapping removed for {parameter_id}"
    }


@router.get("/mappings")
async def list_mappings() -> Dict[str, Any]:
    """
    Get all active MIDI mappings
    
    Returns:
        List of mappings
    """
    mappings = midi_learn_manager.get_all_mappings()
    
    return {
        "mappings": [m.to_dict() for m in mappings],
        "count": len(mappings)
    }


@router.get("/mappings/{parameter_id}")
async def get_mapping(parameter_id: str) -> Dict[str, Any]:
    """
    Get MIDI mapping for a parameter
    
    Path parameters:
    - parameter_id: Parameter to query
    
    Returns:
        Mapping data
    """
    mapping = midi_learn_manager.get_mapping(parameter_id)
    
    if not mapping:
        raise HTTPException(status_code=404, detail=f"No mapping found for {parameter_id}")
    
    return mapping.to_dict()


@router.get("/mappings/cc/{cc_number}")
async def get_mappings_for_cc(cc_number: int, channel: Optional[int] = None) -> Dict[str, Any]:
    """
    Get all mappings for a MIDI CC number
    
    Path parameters:
    - cc_number: MIDI CC number (0-127)
    
    Query parameters:
    - channel: MIDI channel filter (optional)
    
    Returns:
        List of mappings
    """
    if not 0 <= cc_number <= 127:
        raise HTTPException(status_code=400, detail="CC number must be 0-127")
    
    mappings = midi_learn_manager.get_mappings_for_cc(cc_number, channel)
    
    return {
        "cc_number": cc_number,
        "channel": channel,
        "mappings": [m.to_dict() for m in mappings],
        "count": len(mappings)
    }


@router.post("/process")
async def process_midi_cc(request: ProcessCCRequest) -> Dict[str, Any]:
    """
    Process incoming MIDI CC message
    
    Request body:
    - cc_number: MIDI CC number (0-127)
    - cc_value: MIDI CC value (0-127)
    - channel: MIDI channel (0-15, None = omni)
    
    Returns:
        List of parameter updates
    """
    if not 0 <= request.cc_number <= 127:
        raise HTTPException(status_code=400, detail="CC number must be 0-127")
    
    if not 0 <= request.cc_value <= 127:
        raise HTTPException(status_code=400, detail="CC value must be 0-127")
    
    updates = midi_learn_manager.process_midi_cc(
        cc_number=request.cc_number,
        cc_value=request.cc_value,
        channel=request.channel
    )
    
    return {
        "status": "success",
        "updates": [
            {"parameter_id": param_id, "value": value}
            for param_id, value in updates
        ],
        "count": len(updates)
    }


@router.post("/clear")
async def clear_mappings() -> Dict[str, str]:
    """
    Clear all MIDI mappings
    
    Returns:
        Success message
    """
    midi_learn_manager.clear_all_mappings()
    
    return {
        "status": "success",
        "message": "All MIDI mappings cleared"
    }


@router.get("/export")
async def export_mappings() -> Dict[str, Any]:
    """
    Export all MIDI mappings
    
    Returns:
        Mapping data for export
    """
    mappings = midi_learn_manager.export_mappings()
    
    return {
        "mappings": mappings,
        "count": len(mappings),
        "exported_at": midi_learn_manager.param_to_mapping.get(list(midi_learn_manager.param_to_mapping.keys())[0]).created_at.isoformat() if mappings else None
    }


@router.post("/import")
async def import_mappings(mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Import MIDI mappings
    
    Request body:
    - Array of mapping objects
    
    Returns:
        Import status
    """
    try:
        count = midi_learn_manager.import_mappings(mappings)
        
        return {
            "status": "success",
            "message": f"Imported {count} mappings",
            "imported_count": count
        }
        
    except Exception as e:
        logger.error(f"Error importing mappings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/templates")
async def create_template(request: TemplateRequest) -> Dict[str, Any]:
    """
    Create a mapping template from current mappings
    
    Request body:
    - name: Template name
    - description: Template description
    
    Returns:
        Created template
    """
    template = midi_learn_manager.create_template(
        name=request.name,
        description=request.description
    )
    
    return {
        "status": "success",
        "template": template
    }


@router.post("/templates/apply")
async def apply_template(template: Dict[str, Any], clear_existing: bool = True) -> Dict[str, Any]:
    """
    Apply a mapping template
    
    Request body:
    - Template data (from create_template)
    
    Query parameters:
    - clear_existing: Clear existing mappings first (default: true)
    
    Returns:
        Application status
    """
    try:
        count = midi_learn_manager.apply_template(template, clear_existing)
        
        return {
            "status": "success",
            "message": f"Applied template with {count} mappings",
            "applied_count": count
        }
        
    except Exception as e:
        logger.error(f"Error applying template: {e}")
        raise HTTPException(status_code=500, detail=str(e))
