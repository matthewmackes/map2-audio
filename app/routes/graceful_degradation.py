"""
Graceful Degradation REST API Endpoints

Provides monitoring and management endpoints for feature availability.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from datetime import datetime, timezone

from app.services.graceful_degradation import get_feature_manager

router = APIRouter(prefix="/api/features", tags=["features"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# FEATURE STATUS AND HEALTH
# ============================================================================

@router.get("/status")
async def get_features_status() -> Dict[str, Any]:
    """Get status of all features."""
    manager = get_feature_manager()
    
    features_status = {
        name: {
            "status": feature.status.value,
            "level": feature.level.name,
            "operational": feature.is_operational,
            "dependencies": feature.dependencies,
            "last_error": feature.last_error,
            "consecutive_failures": feature.consecutive_failures
        }
        for name, feature in manager.features.items()
    }
    
    return {
        "timestamp": _utc_now_iso(),
        "features": features_status,
        "count": len(manager.features)
    }


@router.get("/features/{feature_name}")
async def get_feature_status(feature_name: str) -> Dict[str, Any]:
    """Get status of specific feature."""
    manager = get_feature_manager()
    feature = manager.features.get(feature_name)
    
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature {feature_name} not found")
    
    return {
        "name": feature.name,
        "level": feature.level.name,
        "status": feature.status.value,
        "operational": feature.is_operational,
        "is_core": feature.is_core,
        "dependencies": feature.dependencies,
        "details": {
            "last_error": feature.last_error,
            "consecutive_failures": feature.consecutive_failures,
            "last_check_at": feature.last_check_at.isoformat() if feature.last_check_at else None,
            "created_at": feature.created_at.isoformat()
        }
    }


@router.get("/health")
async def get_system_health() -> Dict[str, Any]:
    """Get overall system health."""
    manager = get_feature_manager()
    health = manager.get_system_health()
    
    # Determine system status
    if health["system_healthy"]:
        status = "HEALTHY"
    elif health["total_operational"] > 0:
        status = "DEGRADED"
    else:
        status = "CRITICAL"
    
    return {
        "timestamp": _utc_now_iso(),
        "status": status,
        "system_health": health
    }


# ============================================================================
# FEATURE METRICS AND ANALYTICS
# ============================================================================

@router.get("/metrics")
async def get_features_metrics() -> Dict[str, Any]:
    """Get metrics for all features."""
    manager = get_feature_manager()
    metrics = manager.get_metrics()
    
    features_metrics = {
        name: {
            "level": m.level.name,
            "status": m.status.value,
            "availability": f"{m.availability_percentage:.1f}%",
            "total_requests": m.total_requests,
            "successful_requests": m.successful_requests,
            "failed_requests": m.failed_requests,
            "degradation_events": m.degradation_events,
            "recovery_events": m.recovery_events,
            "uptime_seconds": f"{m.uptime_seconds:.1f}",
            "success_rate": f"{m.success_rate:.1f}%"
        }
        for name, m in metrics.items()
    }
    
    return {
        "timestamp": _utc_now_iso(),
        "features": features_metrics,
        "total_features": len(metrics)
    }


@router.get("/metrics/{feature_name}")
async def get_feature_metrics(feature_name: str) -> Dict[str, Any]:
    """Get detailed metrics for specific feature."""
    manager = get_feature_manager()
    metrics = manager.get_metrics()
    
    if feature_name not in metrics:
        raise HTTPException(status_code=404, detail=f"Feature {feature_name} not found")
    
    m = metrics[feature_name]
    
    return {
        "feature_name": feature_name,
        "timestamp": _utc_now_iso(),
        "level": m.level.name,
        "status": m.status.value,
        "availability": {
            "percentage": f"{m.availability_percentage:.1f}%",
            "total_requests": m.total_requests,
            "successful": m.successful_requests,
            "failed": m.failed_requests
        },
        "events": {
            "degradation_events": m.degradation_events,
            "recovery_events": m.recovery_events
        },
        "uptime": f"{m.uptime_seconds:.1f} seconds",
        "success_rate": f"{m.success_rate:.1f}%"
    }


@router.get("/summary")
async def get_features_summary() -> Dict[str, Any]:
    """Get concise summary of feature status."""
    manager = get_feature_manager()
    health = manager.get_system_health()
    
    return {
        "timestamp": _utc_now_iso(),
        "total_features": health["total_features"],
        "core_features": health["core_features"],
        "core_available": health["core_available"],
        "total_operational": health["total_operational"],
        "degraded": health["degraded_features"],
        "unavailable": health["unavailable_features"],
        "system_healthy": health["system_healthy"]
    }


# ============================================================================
# FEATURE DIAGNOSTICS
# ============================================================================

@router.get("/core-features")
async def get_core_features() -> Dict[str, Any]:
    """Get all core features and their status."""
    manager = get_feature_manager()
    
    core_features = {
        name: {
            "status": feature.status.value,
            "operational": feature.is_operational,
            "last_error": feature.last_error,
            "consecutive_failures": feature.consecutive_failures
        }
        for name, feature in manager.features.items()
        if feature.is_core
    }
    
    all_core_operational = all(
        f["operational"] for f in core_features.values()
    )
    
    return {
        "timestamp": _utc_now_iso(),
        "core_features": core_features,
        "all_operational": all_core_operational,
        "count": len(core_features)
    }


@router.get("/degraded-features")
async def get_degraded_features() -> Dict[str, Any]:
    """Get all degraded features."""
    manager = get_feature_manager()
    
    degraded_features = {
        name: {
            "level": feature.level.name,
            "last_error": feature.last_error,
            "consecutive_failures": feature.consecutive_failures,
            "dependencies": feature.dependencies
        }
        for name, feature in manager.features.items()
        if feature.status.value == "degraded"
    }
    
    return {
        "timestamp": _utc_now_iso(),
        "degraded_features": degraded_features,
        "count": len(degraded_features)
    }


@router.get("/unavailable-features")
async def get_unavailable_features() -> Dict[str, Any]:
    """Get all unavailable features."""
    manager = get_feature_manager()
    
    unavailable_features = {
        name: {
            "level": feature.level.name,
            "last_error": feature.last_error,
            "consecutive_failures": feature.consecutive_failures,
            "dependencies": feature.dependencies
        }
        for name, feature in manager.features.items()
        if feature.status.value == "unavailable"
    }
    
    return {
        "timestamp": _utc_now_iso(),
        "unavailable_features": unavailable_features,
        "count": len(unavailable_features)
    }


@router.get("/dependencies")
async def get_feature_dependencies() -> Dict[str, Any]:
    """Get feature dependency graph."""
    manager = get_feature_manager()
    
    dependencies = {
        name: {
            "dependencies": feature.dependencies,
            "dependents": [
                n for n, f in manager.features.items()
                if name in f.dependencies
            ]
        }
        for name, feature in manager.features.items()
    }
    
    return {
        "timestamp": _utc_now_iso(),
        "dependencies": dependencies
    }


# ============================================================================
# FEATURE OPERATIONS
# ============================================================================

@router.post("/health-check")
async def trigger_health_checks() -> Dict[str, Any]:
    """Manually trigger health checks for all features."""
    manager = get_feature_manager()
    
    # Trigger health checks
    await manager._perform_health_checks()
    
    return {
        "status": "health checks triggered",
        "timestamp": _utc_now_iso(),
        "message": "Health checks performed for all features"
    }


@router.get("/availability-report")
async def get_availability_report() -> Dict[str, Any]:
    """Get comprehensive availability report."""
    manager = get_feature_manager()
    health = manager.get_system_health()
    metrics = manager.get_metrics()
    
    # Calculate statistics
    total_requests = sum(m.total_requests for m in metrics.values())
    total_successful = sum(m.successful_requests for m in metrics.values())
    
    return {
        "timestamp": _utc_now_iso(),
        "system_overview": {
            "status": "HEALTHY" if health["system_healthy"] else "DEGRADED",
            "total_features": health["total_features"],
            "operational": health["total_operational"],
            "degraded": health["degraded_features"],
            "unavailable": health["unavailable_features"]
        },
        "aggregate_metrics": {
            "total_requests": total_requests,
            "successful_requests": total_successful,
            "overall_availability": f"{(total_successful / total_requests * 100) if total_requests > 0 else 0:.1f}%"
        },
        "by_level": {
            "core": {
                "total": len([f for f in manager.features.values() if f.is_core]),
                "operational": len([
                    f for f in manager.features.values()
                    if f.is_core and f.is_operational
                ])
            },
            "essential": {
                "total": len([f for f in manager.features.values() if f.level.value == 3]),
                "operational": len([
                    f for f in manager.features.values()
                    if f.level.value == 3 and f.is_operational
                ])
            },
            "standard": {
                "total": len([f for f in manager.features.values() if f.level.value == 2]),
                "operational": len([
                    f for f in manager.features.values()
                    if f.level.value == 2 and f.is_operational
                ])
            },
            "optional": {
                "total": len([f for f in manager.features.values() if f.level.value == 1]),
                "operational": len([
                    f for f in manager.features.values()
                    if f.level.value == 1 and f.is_operational
                ])
            }
        }
    }
