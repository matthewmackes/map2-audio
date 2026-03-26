"""
Reverb API Routes
Control ReevR convolution engine and IR management.
"""

import logging
from typing import Dict, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import os

from app.services.reevr_engine import get_reevr_engine
from app.services.ir_loader import get_ir_loader
from app.paths import StoragePaths
from app.utils.route_helpers import api_route, StandardResponses
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/reverb", tags=["reverb"])


class ReverbParametersRequest(BaseModel):
    """Request to update reverb parameters."""
    dry_wet_mix: Optional[float] = None
    predelay_ms: Optional[float] = None
    bypass: Optional[bool] = None


class LoadIRRequest(BaseModel):
    """Request to load IR file."""
    ir_path: str


@router.get("/status")
async def get_reverb_status() -> Dict:
    """Get reverb engine status.
    
    Returns:
        {
            "loaded": bool,
            "ir_path": str,
            "ir_length_ms": float,
            "latency_ms": float,
            "dry_wet_mix": float,
            "predelay_ms": float,
            "bypass": bool,
            "num_partitions": int
        }
    """
    try:
        engine = get_reevr_engine()
        return engine.get_status()
    except Exception as e:
        logger.error(f"Error getting reverb status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/load")
async def load_ir(request: LoadIRRequest) -> Dict:
    """Load impulse response file.
    
    Args:
        request: Load IR request with file path
        
    Returns:
        {
            "status": "ok",
            "ir_path": str,
            "ir_length_samples": int,
            "latency_samples": int
        }
    """
    try:
        engine = get_reevr_engine()
        loader = get_ir_loader()
        
        # Validate IR first
        ir_data = loader.load_ir_file(request.ir_path)
        if ir_data is None:
            raise HTTPException(status_code=400, detail=f"Invalid IR file: {request.ir_path}")
        
        # Load into engine
        success = engine.load_ir(request.ir_path)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to load IR into engine")
        
        status = engine.get_status()
        
        return {
            "status": "ok",
            "ir_path": request.ir_path,
            "ir_length_samples": status["ir_length_samples"],
            "latency_samples": status["latency_samples"],
            "message": f"Loaded IR: {os.path.basename(request.ir_path)}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading IR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/parameters")
async def update_parameters(request: ReverbParametersRequest) -> Dict:
    """Update reverb parameters.
    
    Args:
        request: Parameter update request
        
    Returns:
        {
            "status": "ok",
            "parameters": {...}
        }
    """
    try:
        engine = get_reevr_engine()
        
        if request.dry_wet_mix is not None:
            engine.set_dry_wet_mix(request.dry_wet_mix)
        
        if request.predelay_ms is not None:
            engine.set_predelay(request.predelay_ms)
        
        if request.bypass is not None:
            engine.set_bypass(request.bypass)
        
        status = engine.get_status()
        
        return {
            "status": "ok",
            "parameters": {
                "dry_wet_mix": status["dry_wet_mix"],
                "predelay_ms": status["predelay_ms"],
                "bypass": status["bypass"]
            }
        }
        
    except Exception as e:
        logger.error(f"Error updating parameters: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bypass")
async def toggle_bypass() -> Dict:
    """Toggle reverb bypass.
    
    Returns:
        {
            "status": "ok",
            "bypass": bool
        }
    """
    try:
        engine = get_reevr_engine()
        current_bypass = engine.get_status()["bypass"]
        engine.set_bypass(not current_bypass)
        
        return {
            "status": "ok",
            "bypass": engine.get_status()["bypass"]
        }
        
    except Exception as e:
        logger.error(f"Error toggling bypass: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_engine() -> Dict:
    """Reset reverb engine (clear buffers).
    
    Returns:
        {
            "status": "ok",
            "message": str
        }
    """
    try:
        engine = get_reevr_engine()
        engine.reset()
        
        return {
            "status": "ok",
            "message": "Reverb engine reset"
        }
        
    except Exception as e:
        logger.error(f"Error resetting engine: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/latency")
async def get_latency() -> Dict:
    """Get reverb processing latency.
    
    Returns:
        {
            "latency_samples": int,
            "latency_ms": float,
            "sample_rate": int
        }
    """
    try:
        engine = get_reevr_engine()
        status = engine.get_status()
        
        return {
            "latency_samples": status["latency_samples"],
            "latency_ms": status["latency_ms"],
            "sample_rate": engine.sample_rate
        }
        
    except Exception as e:
        logger.error(f"Error getting latency: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_ir(file: UploadFile = File(...)) -> Dict:
    """Upload custom IR file.
    
    Args:
        file: Uploaded WAV/FLAC file
        
    Returns:
        {
            "status": "ok",
            "file_path": str,
            "metadata": {...}
        }
    """
    try:
        # Save to user IR directory using centralized paths
        user_ir_dir = StoragePaths.get_ir_user_upload_dir()
        user_ir_dir.mkdir(parents=True, exist_ok=True)
        
        # Sanitize filename
        filename = os.path.basename(file.filename)
        file_path = os.path.join(user_ir_dir, filename)
        
        # Save file
        with open(file_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Validate
        loader = get_ir_loader()
        ir_data = loader.load_ir_file(file_path)
        
        if ir_data is None:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail="Invalid IR file")
        
        audio_data, sample_rate, metadata = ir_data
        
        return {
            "status": "ok",
            "file_path": file_path,
            "metadata": metadata,
            "message": f"Uploaded IR: {filename}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading IR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/validate/{file_path:path}")
async def validate_ir(file_path: str) -> Dict:
    """Validate IR file and get metadata.
    
    Args:
        file_path: Path to IR file
        
    Returns:
        {
            "valid": bool,
            "metadata": {...} or null,
            "errors": [...]
        }
    """
    try:
        loader = get_ir_loader()
        result = loader.load_ir_file(file_path)
        
        if result is None:
            return {
                "valid": False,
                "metadata": None,
                "errors": ["Failed to load or validate IR file"]
            }
        
        audio_data, sample_rate, metadata = result
        
        return {
            "valid": True,
            "metadata": metadata,
            "errors": []
        }
        
    except Exception as e:
        return {
            "valid": False,
            "metadata": None,
            "errors": [str(e)]
        }
