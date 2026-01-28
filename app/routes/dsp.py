"""
DSP Management API Routes
Endpoints for dynamic DSP allocation and priority management.
"""

import logging
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.dsp_manager import get_dsp_manager, QualityMode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dsp", tags=["dsp"])


class QualityModeRequest(BaseModel):
    """Request to set quality mode."""
    mode: str  # "performance", "balanced", or "quality"


class PluginPriorityRequest(BaseModel):
    """Request to set plugin priority."""
    plugin_uri: str
    priority: int  # 1-10


class TargetCPURequest(BaseModel):
    """Request to set target CPU percentage."""
    target_percent: float  # 0-100


class ChainEvaluationRequest(BaseModel):
    """Request to evaluate chain."""
    plugin_uris: List[str]


@router.get("/status")
async def get_dsp_status() -> Dict:
    """Get DSP manager status.
    
    Returns:
        {
            "mode": str,
            "sample_rate": int,
            "buffer_size": int,
            "buffer_time_us": float,
            "target_cpu_percent": float,
            "cpu_budget_us": float,
            "cpu_used_us": float,
            "cpu_available_us": float,
            "utilization_percent": float,
            "is_overloaded": bool,
            "active_plugins": int,
            "bypassed_plugins": int,
            "registered_plugins": int
        }
    """
    try:
        manager = get_dsp_manager()
        return manager.get_status()
    except Exception as e:
        logger.error(f"Error getting DSP status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mode")
async def set_quality_mode(request: QualityModeRequest) -> Dict:
    """Set DSP quality mode.
    
    Args:
        request: Quality mode request
        
    Returns:
        {
            "status": "ok",
            "mode": str,
            "message": str
        }
    """
    try:
        manager = get_dsp_manager()
        
        # Parse mode
        mode_map = {
            "performance": QualityMode.PERFORMANCE,
            "balanced": QualityMode.BALANCED,
            "quality": QualityMode.QUALITY
        }
        
        if request.mode.lower() not in mode_map:
            raise HTTPException(status_code=400, 
                              detail=f"Invalid mode: {request.mode}. Use performance, balanced, or quality")
        
        mode = mode_map[request.mode.lower()]
        manager.set_quality_mode(mode)
        
        return {
            "status": "ok",
            "mode": mode.value,
            "message": f"Quality mode set to {mode.value}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting quality mode: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/priorities")
async def get_plugin_priorities() -> Dict:
    """Get all plugin priorities.
    
    Returns:
        {
            "priorities": [
                {
                    "uri": str,
                    "priority": int,
                    "estimated_cpu_us": float,
                    "auto_bypass": bool,
                    "status": str
                },
                ...
            ]
        }
    """
    try:
        manager = get_dsp_manager()
        priorities = manager.get_plugin_priorities()
        
        return {
            "priorities": priorities
        }
    except Exception as e:
        logger.error(f"Error getting priorities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/priority")
async def set_plugin_priority(request: PluginPriorityRequest) -> Dict:
    """Set plugin priority manually.
    
    Args:
        request: Plugin priority request
        
    Returns:
        {
            "status": "ok",
            "plugin_uri": str,
            "priority": int
        }
    """
    try:
        manager = get_dsp_manager()
        
        # Validate priority
        if not 1 <= request.priority <= 10:
            raise HTTPException(status_code=400, detail="Priority must be between 1 and 10")
        
        success = manager.set_plugin_priority(request.plugin_uri, request.priority)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Plugin not found: {request.plugin_uri}")
        
        return {
            "status": "ok",
            "plugin_uri": request.plugin_uri,
            "priority": request.priority
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting plugin priority: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/target_cpu")
async def set_target_cpu(request: TargetCPURequest) -> Dict:
    """Set target CPU utilization percentage.
    
    Args:
        request: Target CPU request
        
    Returns:
        {
            "status": "ok",
            "target_percent": float,
            "cpu_budget_us": float
        }
    """
    try:
        manager = get_dsp_manager()
        
        # Validate percentage
        if not 10.0 <= request.target_percent <= 95.0:
            raise HTTPException(status_code=400, detail="Target CPU must be between 10% and 95%")
        
        manager.set_target_cpu_percent(request.target_percent)
        status = manager.get_status()
        
        return {
            "status": "ok",
            "target_percent": status["target_cpu_percent"],
            "cpu_budget_us": status["cpu_budget_us"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting target CPU: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate")
async def evaluate_chain(request: ChainEvaluationRequest) -> Dict:
    """Evaluate which plugins can run within CPU budget.
    
    Args:
        request: Chain evaluation request with plugin URIs
        
    Returns:
        {
            "active_plugins": [...],
            "bypassed_plugins": [...],
            "cpu_used_us": float,
            "cpu_budget_us": float,
            "utilization_percent": float
        }
    """
    try:
        manager = get_dsp_manager()
        
        active, bypassed = manager.evaluate_chain(request.plugin_uris)
        status = manager.get_status()
        
        return {
            "active_plugins": active,
            "bypassed_plugins": bypassed,
            "cpu_used_us": status["cpu_used_us"],
            "cpu_budget_us": status["cpu_budget_us"],
            "utilization_percent": status["utilization_percent"]
        }
    except Exception as e:
        logger.error(f"Error evaluating chain: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize")
async def optimize_dsp() -> Dict:
    """Run DSP optimization to re-evaluate all plugins.
    
    Triggers priority-based selection and bypasses low-priority plugins if needed.
    
    Returns:
        {
            "status": "ok",
            "active_plugins": int,
            "bypassed_plugins": int,
            "utilization_percent": float
        }
    """
    try:
        manager = get_dsp_manager()
        
        # Get current plugin list and re-evaluate
        all_plugins = list(manager.plugin_priorities.keys())
        active, bypassed = manager.evaluate_chain(all_plugins)
        status = manager.get_status()
        
        return {
            "status": "ok",
            "active_plugins": len(active),
            "bypassed_plugins": len(bypassed),
            "utilization_percent": status["utilization_percent"],
            "message": f"Optimized: {len(active)} active, {len(bypassed)} bypassed"
        }
    except Exception as e:
        logger.error(f"Error optimizing DSP: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/headroom")
async def get_cpu_headroom() -> Dict:
    """Get available CPU headroom.
    
    Returns:
        {
            "headroom_us": float,
            "headroom_percent": float,
            "budget_us": float,
            "used_us": float
        }
    """
    try:
        manager = get_dsp_manager()
        status = manager.get_status()
        
        headroom_percent = 100.0 - status["utilization_percent"]
        
        return {
            "headroom_us": status["cpu_available_us"],
            "headroom_percent": headroom_percent,
            "budget_us": status["cpu_budget_us"],
            "used_us": status["cpu_used_us"]
        }
    except Exception as e:
        logger.error(f"Error getting CPU headroom: {e}")
        raise HTTPException(status_code=500, detail=str(e))
