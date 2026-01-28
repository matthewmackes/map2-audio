"""
CPU Monitoring API Routes
Real-time CPU and performance metrics from MAP2 Audio Engine
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/cpu", tags=["cpu"])


@router.get("")
async def get_cpu_metrics() -> Dict[str, Any]:
    """
    Get detailed CPU metrics

    Returns:
        total_cpu_percent: Overall CPU usage percentage
        audio_callback_percent: Audio thread CPU usage
        peak_cpu_percent: Peak CPU usage (with hold)
        average_cpu_percent: Average CPU usage
        xrun_count: Number of audio dropouts
        budget_ms: Time budget per callback in ms
        current_callback_ms: Current callback duration in ms
        headroom_percent: Remaining headroom percentage
        per_plugin_percent: Dict of plugin_id -> CPU percentage
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "total_cpu_percent": 0.0,
            "audio_callback_percent": 0.0,
            "peak_cpu_percent": 0.0,
            "average_cpu_percent": 0.0,
            "xrun_count": 0,
            "budget_ms": 0.0,
            "current_callback_ms": 0.0,
            "headroom_percent": 100.0,
            "per_plugin_percent": {},
            "running": False
        }

    metrics = await service.get_cpu_metrics()
    metrics["running"] = True
    return metrics


@router.get("/total")
async def get_total_cpu() -> Dict[str, float]:
    """
    Get total CPU usage percentage

    Simple endpoint for quick CPU monitoring.
    """
    service = get_audio_engine()

    return {
        "cpu_percent": await service.get_total_cpu(),
        "running": service.is_running
    }


@router.get("/plugin/{instance_id}")
async def get_plugin_cpu(instance_id: int) -> Dict[str, Any]:
    """
    Get CPU usage for a specific plugin

    Args:
        instance_id: Plugin instance ID

    Returns:
        cpu_percent: Plugin CPU usage percentage
    """
    service = get_audio_engine()

    if not service.is_running:
        raise HTTPException(status_code=503, detail="Audio engine not running")

    return {
        "instance_id": instance_id,
        "cpu_percent": await service.get_plugin_cpu(instance_id)
    }


@router.get("/plugins")
async def get_all_plugin_cpu() -> Dict[str, Any]:
    """
    Get CPU usage for all plugins

    Returns a mapping of plugin instance IDs to their CPU percentages.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"plugins": {}}

    metrics = await service.get_cpu_metrics()
    return {"plugins": metrics.get("per_plugin_percent", {})}


@router.get("/xruns")
async def get_xrun_count() -> Dict[str, int]:
    """
    Get audio dropout (xrun) count

    XRuns indicate when the audio callback couldn't complete in time.
    """
    service = get_audio_engine()

    return {"xrun_count": await service.get_xrun_count()}


@router.get("/headroom")
async def get_cpu_headroom() -> Dict[str, float]:
    """
    Get CPU headroom percentage

    Headroom = 100% - current CPU usage
    Indicates how much processing capacity remains.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"headroom_percent": 100.0}

    metrics = await service.get_cpu_metrics()
    return {"headroom_percent": metrics.get("headroom_percent", 100.0)}


@router.get("/budget")
async def get_callback_budget() -> Dict[str, float]:
    """
    Get audio callback time budget

    Returns the time budget in milliseconds available for each audio callback,
    based on sample rate and buffer size.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "budget_ms": 0.0,
            "current_ms": 0.0,
            "utilization_percent": 0.0
        }

    metrics = await service.get_cpu_metrics()
    budget = metrics.get("budget_ms", 0.0)
    current = metrics.get("current_callback_ms", 0.0)

    return {
        "budget_ms": budget,
        "current_ms": current,
        "utilization_percent": (current / budget * 100) if budget > 0 else 0.0
    }
