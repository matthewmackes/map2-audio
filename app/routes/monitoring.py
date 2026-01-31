"""
System Monitoring API Routes

New endpoints for monitoring the improvements:
- Database pool statistics
- Plugin resource usage
- Configuration validation
- Rate limit status
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from pydantic import BaseModel

from app.services.db_pool_manager import get_pool_manager
from app.services.plugin_resource_manager import get_resource_manager
from app.services.config_validator import get_validator, get_hot_reload_manager
from app.response_models import APIResponse, StatusEnum
from app.exceptions import ConfigurationValidationException

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


# ==================== Database Pool ====================

@router.get("/database/pool-stats")
async def get_database_pool_stats() -> Dict[str, Any]:
    """Get database connection pool statistics."""
    pool_manager = get_pool_manager()
    return pool_manager.get_stats()


@router.get("/database/health")
async def check_database_health() -> Dict[str, bool]:
    """Check database connection health."""
    pool_manager = get_pool_manager()
    is_healthy = await pool_manager.health_check()
    return {"healthy": is_healthy}


# ==================== Plugin Resources ====================

@router.get("/plugins/resource-stats")
async def get_plugin_resource_stats() -> Dict[str, Dict[str, Any]]:
    """Get resource usage statistics for all plugins."""
    resource_manager = get_resource_manager()
    return resource_manager.get_all_usage()


@router.get("/plugins/resource-stats/{plugin_uri:path}")
async def get_plugin_resource_stat(plugin_uri: str) -> Dict[str, Any]:
    """Get resource usage for a specific plugin."""
    resource_manager = get_resource_manager()
    usage = resource_manager.get_usage(plugin_uri)
    limits = resource_manager.get_limits(plugin_uri)
    
    return {
        "uri": plugin_uri,
        "usage": {
            "cpu_time_ms": usage.cpu_time_ms,
            "memory_mb": usage.memory_mb,
            "avg_time_ms": usage.avg_time_ms,
            "total_calls": usage.total_calls,
            "timeout_count": usage.timeout_count,
            "last_timeout": usage.last_timeout.isoformat() if usage.last_timeout else None,
        },
        "limits": {
            "max_cpu_time_ms": limits.max_cpu_time_ms,
            "max_memory_mb": limits.max_memory_mb,
            "enabled": limits.enabled,
        },
        "bypassed": resource_manager.is_bypassed(plugin_uri),
    }


@router.post("/plugins/resource-limits/{plugin_uri:path}")
async def set_plugin_resource_limits(
    plugin_uri: str,
    max_cpu_time_ms: float = 50.0,
    max_memory_mb: float = 100.0,
    enabled: bool = True
) -> APIResponse:
    """Set resource limits for a plugin."""
    from app.services.plugin_resource_manager import ResourceLimits
    
    resource_manager = get_resource_manager()
    limits = ResourceLimits(
        max_cpu_time_ms=max_cpu_time_ms,
        max_memory_mb=max_memory_mb,
        enabled=enabled,
    )
    resource_manager.set_limits(plugin_uri, limits)
    
    return APIResponse(
        status=StatusEnum.SUCCESS,
        message=f"Resource limits set for {plugin_uri}",
        data={"limits": limits.__dict__}
    )


@router.post("/plugins/{plugin_uri:path}/unbypass")
async def unbypass_plugin(plugin_uri: str) -> APIResponse:
    """Remove bypass for a plugin that was auto-bypassed."""
    resource_manager = get_resource_manager()
    resource_manager.unbypass_plugin(plugin_uri)
    
    return APIResponse(
        status=StatusEnum.SUCCESS,
        message=f"Bypass removed for {plugin_uri}",
    )


@router.post("/plugins/{plugin_uri:path}/reset-stats")
async def reset_plugin_stats(plugin_uri: str) -> APIResponse:
    """Reset resource statistics for a plugin."""
    resource_manager = get_resource_manager()
    resource_manager.reset_plugin(plugin_uri)
    
    return APIResponse(
        status=StatusEnum.SUCCESS,
        message=f"Statistics reset for {plugin_uri}",
    )


# ==================== Configuration ====================

class ConfigValidationRequest(BaseModel):
    """Configuration validation request."""
    config: Dict[str, Any]


@router.post("/config/validate")
async def validate_configuration(request: ConfigValidationRequest) -> Dict[str, Any]:
    """Validate a configuration object."""
    validator = get_validator()
    result = validator.validate(request.config)
    
    return {
        "valid": result.valid,
        "errors": result.errors,
        "warnings": result.warnings,
        "timestamp": result.timestamp.isoformat(),
    }


@router.get("/config/hot-reloadable")
async def get_hot_reloadable_keys() -> Dict[str, Any]:
    """Get list of configuration keys that can be hot-reloaded."""
    hot_reload = get_hot_reload_manager()
    
    return {
        "reloadable_keys": list(hot_reload._reloadable_keys),
        "description": "These configuration keys can be changed without restart"
    }


class ConfigHotReloadRequest(BaseModel):
    """Hot reload configuration request."""
    key: str
    value: Any


@router.post("/config/hot-reload")
async def hot_reload_config(request: ConfigHotReloadRequest) -> APIResponse:
    """Hot reload a configuration value."""
    hot_reload = get_hot_reload_manager()
    
    if not hot_reload.is_reloadable(request.key):
        raise ConfigurationValidationException(
            f"Configuration key '{request.key}' cannot be hot-reloaded. Requires restart."
        )
    
    success = await hot_reload.reload(request.key, request.value)
    
    if success:
        return APIResponse(
            status=StatusEnum.SUCCESS,
            message=f"Configuration '{request.key}' hot-reloaded successfully",
            data={"key": request.key, "value": request.value}
        )
    else:
        return APIResponse(
            status=StatusEnum.ERROR,
            message=f"Failed to hot-reload '{request.key}'",
            errors=[f"Hot reload failed for {request.key}"]
        )


# ==================== Rate Limiting ====================

@router.get("/rate-limits/status")
async def get_rate_limit_status() -> Dict[str, Any]:
    """Get rate limiting configuration and status."""
    from app.middleware.rate_limiting import ENDPOINT_RATE_LIMITS
    
    return {
        "default_limit": 100,
        "default_window": "60s",
        "endpoint_limits": {
            path: {"limit": limit, "window": f"{window}s"}
            for path, (limit, window) in ENDPOINT_RATE_LIMITS.items()
        },
        "description": "Rate limits enforced per client IP"
    }


# ==================== Overall System Health ====================

@router.get("/system/health-summary")
async def get_system_health_summary() -> Dict[str, Any]:
    """Get comprehensive system health summary."""
    pool_manager = get_pool_manager()
    resource_manager = get_resource_manager()
    
    # Database health
    db_healthy = await pool_manager.health_check()
    db_stats = pool_manager.get_stats()
    
    # Plugin resource health
    all_usage = resource_manager.get_all_usage()
    bypassed_plugins = [uri for uri, stats in all_usage.items() if stats["bypassed"]]
    
    return {
        "database": {
            "healthy": db_healthy,
            "active_connections": db_stats.get("checked_out", 0),
            "total_errors": db_stats.get("total_errors", 0),
        },
        "plugins": {
            "total_tracked": len(all_usage),
            "bypassed_count": len(bypassed_plugins),
            "bypassed_plugins": bypassed_plugins,
        },
        "status": "healthy" if db_healthy and len(bypassed_plugins) == 0 else "degraded",
    }
