"""
Performance Monitor Routes - API endpoints for performance tracking

Provides real-time and historical performance data:
- Current system metrics (CPU, memory, disk)
- Historical time-series data with configurable retention
- Plugin-level performance tracking
- Buffer underrun monitoring
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Query

from app.services.performance_metrics import (
    get_performance_stats,
    get_metrics_collector,
    get_performance_history,
    get_plugin_performance,
    record_buffer_underrun as _record_underrun
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/performance", tags=["performance"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/start")
async def start_monitoring(interval: float = 1.0) -> Dict[str, str]:
    """
    Start performance monitoring
    
    Query parameters:
    - interval: Monitoring interval in seconds (default: 1.0)
    
    Returns:
        Success message
    """
    # Performance metrics are always running in background
    return {
        "status": "success",
        "message": "Performance metrics already running (via performance_metrics service)"
    }


@router.post("/stop")
async def stop_monitoring() -> Dict[str, str]:
    """
    Stop performance monitoring
    
    Returns:
        Success message
    """
    # Performance metrics managed by performance_metrics service
    return {
        "status": "success",
        "message": "Performance metrics managed by service"
    }


@router.get("/current")
async def get_current_stats() -> Dict[str, Any]:
    """
    Get current performance statistics
    
    Returns:
        Current performance metrics
    """
    return get_performance_stats()


@router.get("/history")
async def get_history(
    duration: int = Query(60, ge=1, le=3600, description="Duration in seconds"),
    resolution: int = Query(1, ge=1, le=60, description="Sample resolution in seconds")
) -> Dict[str, Any]:
    """
    Get performance history with time-series data.
    
    Query parameters:
    - duration: How far back to retrieve in seconds (1-3600, default: 60)
    - resolution: Sample interval in seconds (1-60, default: 1)
    
    Returns:
        Historical performance data with timestamps
    """
    try:
        history = await get_performance_history(duration, resolution)
        return {
            "duration_seconds": duration,
            "resolution_seconds": resolution,
            "snapshots": history["snapshots"],
            "count": len(history["snapshots"]),
            "statistics": history.get("statistics", {}),
            "timestamp": _utc_now_iso()
        }
    except Exception as e:
        logger.error(f"Error fetching performance history: {e}")
        return {
            "duration_seconds": duration,
            "snapshots": [],
            "count": 0,
            "error": str(e)
        }


@router.get("/summary")
async def get_summary() -> Dict[str, Any]:
    """
    Get performance summary
    
    Returns:
        Summary statistics
    """
    return get_performance_stats()


@router.get("/plugins")
async def get_plugin_stats(plugin_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get plugin performance statistics.
    
    Query parameters:
    - plugin_id: Specific plugin ID (optional, returns all if omitted)
    
    Returns:
        Plugin performance metrics including CPU usage, latency, and call counts
    """
    try:
        stats = await get_plugin_performance(plugin_id)
        return {
            "plugins": stats.get("plugins", []),
            "count": len(stats.get("plugins", [])),
            "total_cpu_percent": stats.get("total_cpu_percent", 0.0),
            "timestamp": _utc_now_iso()
        }
    except Exception as e:
        logger.error(f"Error fetching plugin stats: {e}")
        return {
            "plugins": [],
            "count": 0,
            "error": str(e)
        }


@router.post("/plugins/reset")
async def reset_plugin_stats(plugin_id: Optional[str] = None) -> Dict[str, str]:
    """
    Reset plugin statistics.
    
    Query parameters:
    - plugin_id: Specific plugin to reset (optional, resets all if omitted)
    
    Returns:
        Success message
    """
    try:
        collector = await get_metrics_collector()
        collector.reset_plugin_stats(plugin_id)
        return {
            "status": "success",
            "message": f"Reset plugin stats: {plugin_id or 'all'}"
        }
    except Exception as e:
        logger.error(f"Error resetting plugin stats: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@router.post("/underrun")
async def record_underrun() -> Dict[str, str]:
    """
    Record a buffer underrun event.
    
    Returns:
        Success message with current underrun count
    """
    try:
        count = _record_underrun()
        return {
            "status": "success",
            "message": "Buffer underrun recorded",
            "total_underruns": count
        }
    except Exception as e:
        logger.error(f"Error recording underrun: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@router.get("/alerts")
async def get_performance_alerts() -> Dict[str, Any]:
    """
    Get active performance alerts.
    
    Returns:
        List of current performance warnings/alerts
    """
    try:
        collector = await get_metrics_collector()
        alerts = collector.get_alerts()
        return {
            "alerts": alerts,
            "count": len(alerts),
            "timestamp": _utc_now_iso()
        }
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        return {"alerts": [], "count": 0, "error": str(e)}
