"""
Profiling API Routes
Per-plugin CPU performance monitoring endpoints.
"""

import logging
from collections import defaultdict, deque
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.services.plugin_profiler import get_profiler
from app.services.juce_engine_service import get_audio_engine
from app.database import get_db, PluginPerformanceLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/profiling", tags=["profiling"])


def _merge_runtime_and_profiler_plugins(
    runtime_plugins: List[Dict[str, Any]],
    profiler_plugins: List[Dict[str, Any]],
    *,
    profiler_info: Dict[str, Any],
) -> List[Dict[str, Any]]:
    if not runtime_plugins:
        return profiler_plugins

    by_instance: Dict[int, Dict[str, Any]] = {}
    by_position: Dict[tuple[str, int], deque[Dict[str, Any]]] = defaultdict(deque)
    by_uri: Dict[str, deque[Dict[str, Any]]] = defaultdict(deque)
    for plugin in profiler_plugins:
        instance_id = plugin.get("instance_id")
        if isinstance(instance_id, int) and instance_id > 0:
            by_instance[instance_id] = plugin

        position = plugin.get("plugin_position", plugin.get("position"))
        if isinstance(position, int) and position >= 0:
            by_position[(plugin.get("uri"), position)].append(plugin)

        uri = plugin.get("uri")
        if isinstance(uri, str):
            by_uri[uri].append(plugin)

    merged: List[Dict[str, Any]] = []
    matched_profiler_ids: set[int] = set()
    default_calls_per_second = round(
        float(profiler_info.get("sample_rate", 0)) / float(profiler_info.get("buffer_size", 1) or 1),
        2,
    )

    for runtime_plugin in runtime_plugins:
        profiler_plugin: Optional[Dict[str, Any]] = None
        instance_id = runtime_plugin.get("instance_id")
        if isinstance(instance_id, int) and instance_id > 0:
            profiler_plugin = by_instance.get(instance_id)

        if profiler_plugin is None:
            position = runtime_plugin.get("plugin_position", runtime_plugin.get("position"))
            uri = runtime_plugin.get("uri")
            if isinstance(uri, str) and isinstance(position, int) and position >= 0:
                queue = by_position.get((uri, position))
                while queue:
                    candidate = queue.popleft()
                    if id(candidate) in matched_profiler_ids:
                        continue
                    profiler_plugin = candidate
                    break

        if profiler_plugin is None:
            uri = runtime_plugin.get("uri")
            if isinstance(uri, str):
                queue = by_uri.get(uri)
                while queue:
                    candidate = queue.popleft()
                    if id(candidate) in matched_profiler_ids:
                        continue
                    profiler_plugin = candidate
                    break

        if profiler_plugin is not None:
            matched_profiler_ids.add(id(profiler_plugin))

        payload = dict(profiler_plugin or {})
        payload.update(runtime_plugin)
        payload.setdefault("call_count", int((profiler_plugin or {}).get("call_count", 0)))
        payload.setdefault("avg_time_us", float((profiler_plugin or {}).get("avg_time_us", 0.0)))
        payload.setdefault("max_time_us", float((profiler_plugin or {}).get("max_time_us", 0.0)))
        payload.setdefault("calls_per_second", default_calls_per_second)
        payload["cpu_percent"] = round(float(payload.get("cpu_percent", 0.0) or 0.0), 2)
        merged.append(payload)

    for profiler_plugin in profiler_plugins:
        if id(profiler_plugin) in matched_profiler_ids:
            continue
        merged.append(dict(profiler_plugin))

    merged.sort(key=lambda plugin: float(plugin.get("cpu_percent", 0.0) or 0.0), reverse=True)
    return merged


async def _build_live_plugin_stats_payload() -> Dict[str, Any]:
    profiler = get_profiler()
    if not profiler:
        raise HTTPException(status_code=503, detail="Profiler not initialized")

    profiler_plugins = profiler.get_all_stats()
    chain = profiler.get_chain_stats()
    profiler_info = profiler.get_profiler_stats()

    runtime_plugins: List[Dict[str, Any]] = []
    engine_service = get_audio_engine()
    if engine_service and getattr(engine_service, "is_available", False) and getattr(engine_service, "is_running", False):
        try:
            runtime_plugins = await engine_service.get_runtime_plugin_cpu_telemetry()
        except Exception as exc:
            logger.debug("Unable to load runtime plugin CPU telemetry: %s", exc)

    plugins = _merge_runtime_and_profiler_plugins(runtime_plugins, profiler_plugins, profiler_info=profiler_info)
    if runtime_plugins:
        chain = {
            **chain,
            "total_plugins": len(runtime_plugins),
            "total_cpu_percent": round(
                sum(float(plugin.get("cpu_percent", 0.0) or 0.0) for plugin in runtime_plugins),
                2,
            ),
        }

    return {
        "plugins": plugins,
        "chain": chain,
        "profiler": profiler_info,
    }


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
    try:
        return await _build_live_plugin_stats_payload()
    except HTTPException:
        raise
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
    try:
        payload = await _build_live_plugin_stats_payload()
        plugins = payload["plugins"]
        chain = payload["chain"]
        profiler_info = payload["profiler"]
        
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
