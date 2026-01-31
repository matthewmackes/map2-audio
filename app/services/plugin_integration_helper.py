"""
Integration Helper for Plugin Resource Management

Automatically integrates resource monitoring into plugin processing.
"""

from typing import Optional, Callable, Any
from app.services.plugin_resource_manager import get_resource_manager, ResourceLimits
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


def setup_plugin_resource_limits(plugin_uri: str, category: Optional[str] = None):
    """
    Setup default resource limits based on plugin category.
    
    Args:
        plugin_uri: Plugin URI
        category: Plugin category (e.g., "Reverb", "Delay", "Dynamics")
    """
    manager = get_resource_manager()
    
    # Category-specific defaults
    limits_by_category = {
        "Reverb": ResourceLimits(max_cpu_time_ms=100.0, max_memory_mb=200.0),
        "Delay": ResourceLimits(max_cpu_time_ms=50.0, max_memory_mb=150.0),
        "Dynamics": ResourceLimits(max_cpu_time_ms=20.0, max_memory_mb=50.0),
        "EQ": ResourceLimits(max_cpu_time_ms=20.0, max_memory_mb=50.0),
        "Distortion": ResourceLimits(max_cpu_time_ms=30.0, max_memory_mb=50.0),
        "Modulation": ResourceLimits(max_cpu_time_ms=40.0, max_memory_mb=100.0),
        "Simulator": ResourceLimits(max_cpu_time_ms=80.0, max_memory_mb=150.0),
    }
    
    limits = limits_by_category.get(category, ResourceLimits())  # Default limits
    manager.set_limits(plugin_uri, limits)
    
    logger.info(f"Set resource limits for {plugin_uri} (category: {category}): "
                f"CPU={limits.max_cpu_time_ms}ms, MEM={limits.max_memory_mb}MB")


def monitor_plugin_processing(
    plugin_uri: str,
    process_func: Callable,
    buffer_size: int = 256,
    sample_rate: int = 48000,
    bypass_callback: Optional[Callable] = None
) -> Callable:
    """
    Wrap plugin processing function with resource monitoring.
    
    Args:
        plugin_uri: Plugin URI
        process_func: Original processing function
        buffer_size: Audio buffer size
        sample_rate: Sample rate
        bypass_callback: Called when plugin is bypassed
    
    Returns:
        Wrapped function with monitoring
    """
    manager = get_resource_manager()
    
    def wrapped_process(*args, **kwargs) -> Any:
        # Check if bypassed
        if manager.is_bypassed(plugin_uri):
            logger.debug(f"Plugin {plugin_uri} bypassed, passing through")
            if bypass_callback:
                bypass_callback()
            # Return first argument (assumed to be audio data)
            return args[0] if args else None
        
        # Monitor processing
        with manager.monitor_processing(plugin_uri, buffer_size, sample_rate):
            return process_func(*args, **kwargs)
    
    return wrapped_process


async def check_plugin_health(plugin_uri: str) -> dict:
    """
    Check health status of a plugin.
    
    Returns:
        Health status dictionary
    """
    manager = get_resource_manager()
    usage = manager.get_usage(plugin_uri)
    limits = manager.get_limits(plugin_uri)
    bypassed = manager.is_bypassed(plugin_uri)
    
    # Calculate health score (0-100)
    health_score = 100
    
    if bypassed:
        health_score = 0
    else:
        if usage.timeout_count > 0:
            health_score -= usage.timeout_count * 20
        
        if usage.avg_time_ms > limits.max_cpu_time_ms * 0.8:
            health_score -= 20  # Near limit
        
        if usage.cpu_time_ms > limits.max_cpu_time_ms:
            health_score -= 30  # Over limit
    
    health_score = max(0, health_score)
    
    status = "healthy"
    if health_score < 30:
        status = "critical"
    elif health_score < 60:
        status = "warning"
    
    return {
        "plugin_uri": plugin_uri,
        "status": status,
        "health_score": health_score,
        "bypassed": bypassed,
        "cpu_usage_percent": (usage.avg_time_ms / limits.max_cpu_time_ms * 100) 
            if limits.max_cpu_time_ms > 0 else 0,
        "timeout_count": usage.timeout_count,
        "avg_time_ms": usage.avg_time_ms,
    }
