"""
Profiling API Routes
Per-plugin CPU performance monitoring endpoints.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.plugin_profiler import get_profiler
from app.database import get_db, PluginPerformanceLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profiling", tags=["profiling"])


@router.get("/plugins")
async def get_plugin_stats() -> Dict[str, Any]:
    """Get current CPU statistics for all plugins.
    
    Returns:
        {
            "plugins": [
                {
                    "uri": str,
                    "name": str,
                    "call_count": int,
                    "avg_time_us": float,
                    "max_time_us": float,
                    "cpu_percent": float,
                    "calls_per_second": float
                },
                ...
            ],
            "chain": {
                "total_plugins": int,
                "total_cpu_percent": float,
                "total_avg_us": float,
                "total_max_us": float,
                "deadline_us": float,
                "utilization_percent": float
            },
            "profiler": {
                "sample_rate": int,
                "buffer_size": int,
                "deadline_us": float,
                "overhead_per_call_us": float
            }
        }
    """
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")
    
    try:
        plugins = profiler.get_all_stats()
        chain = profiler.get_chain_stats()
        profiler_info = profiler.get_profiler_stats()
        
        return {
            "plugins": plugins,
            "chain": chain,
            "profiler": profiler_info
        }
    except Exception as e:
        logger.error(f"Error getting plugin stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins/{plugin_uri:path}")
async def get_plugin_stat(plugin_uri: str) -> Dict[str, Any]:
    """Get CPU statistics for specific plugin.
    
    Args:
        plugin_uri: Plugin URI (URL-encoded)
        
    Returns:
        Plugin stats dict
    """
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")
    
    stats = profiler.get_plugin_stats(plugin_uri)
    if not stats:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")
    
    return stats


@router.post("/reset")
async def reset_stats(plugin_uri: Optional[str] = None) -> Dict[str, str]:
    """Reset profiling statistics.
    
    Args:
        plugin_uri: Optional plugin URI to reset (resets all if not specified)
        
    Returns:
        Success message
    """
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")
    
    try:
        profiler.reset_stats(plugin_uri)
        
        if plugin_uri:
            return {"status": "ok", "message": f"Reset stats for {plugin_uri}"}
        else:
            return {"status": "ok", "message": "Reset all plugin stats"}
    except Exception as e:
        logger.error(f"Error resetting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{plugin_uri:path}")
async def get_plugin_history(
    plugin_uri: str,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Get historical performance data for plugin.
    
    Args:
        plugin_uri: Plugin URI (URL-encoded)
        limit: Maximum number of records (default 100)
        db: Database session
        
    Returns:
        List of historical performance records
    """
    try:
        result = await db.execute(
            select(PluginPerformanceLog)
            .filter(PluginPerformanceLog.plugin_uri == plugin_uri)
            .order_by(desc(PluginPerformanceLog.timestamp))
            .limit(limit)
        )
        logs = result.scalars().all()
        
        return [
            {
                "plugin_uri": log.plugin_uri,
                "plugin_name": log.plugin_name,
                "chain_id": log.chain_id,
                "avg_time_us": log.avg_time_us,
                "max_time_us": log.max_time_us,
                "cpu_percent": log.cpu_percent,
                "call_count": log.call_count,
                "sample_rate": log.sample_rate,
                "buffer_size": log.buffer_size,
                "deadline_us": log.deadline_us,
                "timestamp": log.timestamp.isoformat()
            }
            for log in logs
        ]
    except Exception as e:
        logger.error(f"Error getting plugin history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/snapshot")
async def save_snapshot(
    chain_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Save current profiling stats to database.
    
    Args:
        chain_id: Optional chain ID to associate with snapshot
        db: Database session
        
    Returns:
        {
            "status": "ok",
            "saved_plugins": int,
            "timestamp": str
        }
    """
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")
    
    try:
        plugins = profiler.get_all_stats()
        profiler_info = profiler.get_profiler_stats()
        timestamp = datetime.utcnow()
        
        # Save each plugin's stats
        saved_count = 0
        for plugin in plugins:
            log = PluginPerformanceLog(
                plugin_uri=plugin["uri"],
                plugin_name=plugin["name"],
                chain_id=chain_id,
                avg_time_us=plugin["avg_time_us"],
                max_time_us=plugin["max_time_us"],
                cpu_percent=plugin["cpu_percent"],
                call_count=plugin["call_count"],
                sample_rate=profiler_info["sample_rate"],
                buffer_size=profiler_info["buffer_size"],
                deadline_us=profiler_info["deadline_us"],
                timestamp=timestamp
            )
            db.add(log)
            saved_count += 1
        
        await db.commit()
        
        return {
            "status": "ok",
            "saved_plugins": saved_count,
            "timestamp": timestamp.isoformat()
        }
    except Exception as e:
        logger.error(f"Error saving snapshot: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_summary() -> Dict[str, Any]:
    """Get high-level profiling summary.
    
    Returns:
        {
            "top_consumers": [top 5 plugins by CPU],
            "total_utilization": float,
            "warning_plugins": [plugins using >20% CPU],
            "overhead": float
        }
    """
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")
    
    try:
        plugins = profiler.get_all_stats()
        chain = profiler.get_chain_stats()
        profiler_info = profiler.get_profiler_stats()
        
        # Top 5 consumers
        top_consumers = sorted(plugins, key=lambda x: x["cpu_percent"], reverse=True)[:5]
        
        # Warning plugins (>20% CPU)
        warning_plugins = [p for p in plugins if p["cpu_percent"] > 20.0]
        
        return {
            "top_consumers": top_consumers,
            "total_utilization": chain["utilization_percent"],
            "warning_plugins": warning_plugins,
            "overhead_us": profiler_info["overhead_per_call_us"],
            "deadline_us": profiler_info["deadline_us"]
        }
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
