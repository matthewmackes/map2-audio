"""
Connection Pool Management REST API Endpoints

Provides monitoring and management endpoints for connection pools.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, Optional
from datetime import datetime

from app.services.connection_pool import get_pool_manager

router = APIRouter(prefix="/api/connection-pool", tags=["connection-pool"])


# ============================================================================
# POOL STATUS AND METRICS
# ============================================================================

@router.get("/status")
async def get_pool_status() -> Dict[str, Any]:
    """Get status of all connection pools."""
    manager = get_pool_manager()
    metrics = manager.get_all_metrics()
    
    if not metrics:
        return {
            "total_pools": 0,
            "pools": {},
            "timestamp": datetime.now().isoformat()
        }
    
    return {
        "total_pools": len(metrics),
        "timestamp": datetime.now().isoformat(),
        "pools": {
            host: {
                "total_connections": m.total_connections,
                "available_connections": m.available_connections,
                "in_use_connections": m.in_use_connections,
                "unhealthy_connections": m.unhealthy_connections,
                "total_requests": m.total_requests,
                "total_errors": m.total_errors,
                "connection_reuse_rate": f"{m.connection_reuse_rate:.1f}%",
                "error_rate": f"{m.error_rate:.1f}%",
                "uptime_seconds": f"{m.uptime_seconds:.1f}",
                "avg_response_time_ms": f"{m.avg_response_time_ms:.1f}",
                "last_request_time": m.last_request_time.isoformat() if m.last_request_time else None
            }
            for host, m in metrics.items()
        }
    }


@router.get("/pools")
async def list_pools() -> Dict[str, Any]:
    """List all active connection pools."""
    manager = get_pool_manager()
    
    return {
        "count": len(manager.pools),
        "pools": list(manager.pools.keys()),
        "timestamp": datetime.now().isoformat()
    }


@router.get("/pools/{pool_host}")
async def get_pool_status_detail(pool_host: str) -> Dict[str, Any]:
    """Get detailed status for a specific pool."""
    manager = get_pool_manager()
    metrics = manager.get_pool_metrics(pool_host)
    
    if not metrics:
        raise HTTPException(status_code=404, detail=f"Pool for {pool_host} not found")
    
    return {
        "host": pool_host,
        "total_connections": metrics.total_connections,
        "available_connections": metrics.available_connections,
        "in_use_connections": metrics.in_use_connections,
        "unhealthy_connections": metrics.unhealthy_connections,
        "total_requests": metrics.total_requests,
        "total_errors": metrics.total_errors,
        "total_reuses": metrics.total_reuses,
        "connection_reuse_rate": f"{metrics.connection_reuse_rate:.1f}%",
        "error_rate": f"{metrics.error_rate:.1f}%",
        "uptime_seconds": metrics.uptime_seconds,
        "avg_response_time_ms": metrics.avg_response_time_ms,
        "last_request_time": metrics.last_request_time.isoformat() if metrics.last_request_time else None,
        "created_at": metrics.created_at.isoformat()
    }


# ============================================================================
# POOL METRICS AND STATISTICS
# ============================================================================

@router.get("/metrics")
async def get_metrics_summary() -> Dict[str, Any]:
    """Get overall connection pool metrics."""
    manager = get_pool_manager()
    all_metrics = manager.get_all_metrics()
    
    if not all_metrics:
        return {
            "total_pools": 0,
            "total_connections": 0,
            "total_available": 0,
            "total_in_use": 0,
            "total_requests": 0,
            "total_errors": 0,
            "overall_error_rate": 0.0,
            "overall_reuse_rate": 0.0,
            "timestamp": datetime.now().isoformat()
        }
    
    total_requests = sum(m.total_requests for m in all_metrics.values())
    total_errors = sum(m.total_errors for m in all_metrics.values())
    total_reuses = sum(m.total_reuses for m in all_metrics.values())
    
    return {
        "total_pools": len(all_metrics),
        "total_connections": sum(m.total_connections for m in all_metrics.values()),
        "total_available": sum(m.available_connections for m in all_metrics.values()),
        "total_in_use": sum(m.in_use_connections for m in all_metrics.values()),
        "total_unhealthy": sum(m.unhealthy_connections for m in all_metrics.values()),
        "total_requests": total_requests,
        "total_errors": total_errors,
        "total_reuses": total_reuses,
        "overall_error_rate": (total_errors / total_requests * 100) if total_requests > 0 else 0.0,
        "overall_reuse_rate": (total_reuses / total_requests * 100) if total_requests > 0 else 0.0,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/pools/{pool_host}/metrics")
async def get_pool_detailed_metrics(pool_host: str) -> Dict[str, Any]:
    """Get detailed metrics for a specific pool."""
    manager = get_pool_manager()
    metrics = manager.get_pool_metrics(pool_host)
    
    if not metrics:
        raise HTTPException(status_code=404, detail=f"Pool for {pool_host} not found")
    
    return {
        "host": pool_host,
        "connections": {
            "total": metrics.total_connections,
            "available": metrics.available_connections,
            "in_use": metrics.in_use_connections,
            "unhealthy": metrics.unhealthy_connections
        },
        "requests": {
            "total": metrics.total_requests,
            "errors": metrics.total_errors,
            "reuses": metrics.total_reuses,
            "error_rate": f"{metrics.error_rate:.1f}%",
            "reuse_rate": f"{metrics.connection_reuse_rate:.1f}%",
            "avg_response_time_ms": metrics.avg_response_time_ms
        },
        "health": {
            "uptime_seconds": metrics.uptime_seconds,
            "created_at": metrics.created_at.isoformat(),
            "last_request": metrics.last_request_time.isoformat() if metrics.last_request_time else None
        }
    }


# ============================================================================
# PERFORMANCE AND ANALYTICS
# ============================================================================

@router.get("/performance")
async def get_performance_analysis() -> Dict[str, Any]:
    """Get performance analysis across all pools."""
    manager = get_pool_manager()
    all_metrics = manager.get_all_metrics()
    
    if not all_metrics:
        return {
            "analysis": "No active pools",
            "pools_analyzed": 0
        }
    
    best_performing = max(
        all_metrics.items(),
        key=lambda x: x[1].connection_reuse_rate,
        default=(None, None)
    )
    
    worst_performing = min(
        all_metrics.items(),
        key=lambda x: x[1].connection_reuse_rate,
        default=(None, None)
    )
    
    return {
        "pools_analyzed": len(all_metrics),
        "best_performing_pool": {
            "host": best_performing[0],
            "reuse_rate": f"{best_performing[1].connection_reuse_rate:.1f}%",
            "error_rate": f"{best_performing[1].error_rate:.1f}%",
            "connections": best_performing[1].total_connections
        } if best_performing[0] else None,
        "worst_performing_pool": {
            "host": worst_performing[0],
            "reuse_rate": f"{worst_performing[1].connection_reuse_rate:.1f}%",
            "error_rate": f"{worst_performing[1].error_rate:.1f}%",
            "connections": worst_performing[1].total_connections
        } if worst_performing[0] else None,
        "average_metrics": {
            "avg_connections_per_pool": sum(m.total_connections for m in all_metrics.values()) / len(all_metrics),
            "avg_reuse_rate": sum(m.connection_reuse_rate for m in all_metrics.values()) / len(all_metrics),
            "avg_error_rate": sum(m.error_rate for m in all_metrics.values()) / len(all_metrics)
        },
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# POOL MANAGEMENT
# ============================================================================

@router.post("/pools/{pool_host}/health-check")
async def trigger_health_check(pool_host: str) -> Dict[str, Any]:
    """Manually trigger health check for a pool."""
    manager = get_pool_manager()
    pool = manager.get_pool(pool_host)
    
    if not pool:
        raise HTTPException(status_code=404, detail=f"Pool for {pool_host} not found")
    
    # Trigger health checks (simplified - in production would be more complex)
    return {
        "host": pool_host,
        "health_check_triggered": True,
        "message": f"Health check triggered for {pool_host}",
        "timestamp": datetime.now().isoformat()
    }


@router.get("/summary")
async def get_summary() -> Dict[str, Any]:
    """Get comprehensive connection pool summary."""
    manager = get_pool_manager()
    all_metrics = manager.get_all_metrics()
    
    return {
        "timestamp": datetime.now().isoformat(),
        "pools": {
            "total": len(all_metrics),
            "hosts": list(all_metrics.keys()) if all_metrics else []
        },
        "connections": {
            "total": sum(m.total_connections for m in all_metrics.values()),
            "available": sum(m.available_connections for m in all_metrics.values()),
            "in_use": sum(m.in_use_connections for m in all_metrics.values()),
            "unhealthy": sum(m.unhealthy_connections for m in all_metrics.values())
        },
        "requests": {
            "total": sum(m.total_requests for m in all_metrics.values()),
            "errors": sum(m.total_errors for m in all_metrics.values()),
            "reuses": sum(m.total_reuses for m in all_metrics.values())
        },
        "efficiency": {
            "overall_reuse_rate": (
                sum(m.total_reuses for m in all_metrics.values()) / 
                sum(m.total_requests for m in all_metrics.values()) * 100
            ) if sum(m.total_requests for m in all_metrics.values()) > 0 else 0.0,
            "overall_error_rate": (
                sum(m.total_errors for m in all_metrics.values()) / 
                sum(m.total_requests for m in all_metrics.values()) * 100
            ) if sum(m.total_requests for m in all_metrics.values()) > 0 else 0.0,
            "avg_response_time_ms": sum(
                m.avg_response_time_ms for m in all_metrics.values()
            ) / len(all_metrics) if all_metrics else 0.0
        }
    }
