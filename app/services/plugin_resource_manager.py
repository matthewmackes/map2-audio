"""
Plugin Resource Management & Sandboxing

Enforces resource limits and provides isolation for plugins:
- CPU time limits per plugin
- Memory limits with monitoring
- Watchdog for hung plugins
- Automatic bypass on timeout
- Resource usage tracking
"""

import time
import threading
import psutil
import signal
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from contextlib import contextmanager

from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger
from app.exceptions import PluginTimeoutException, PluginResourceException

logger = get_logger(__name__)


@dataclass
class ResourceLimits:
    """Resource limits for a plugin."""
    max_cpu_time_ms: float = 50.0  # Max processing time per block
    max_memory_mb: float = 100.0    # Max memory usage
    max_init_time_s: float = 5.0    # Max initialization time
    enabled: bool = True


@dataclass
class ResourceUsage:
    """Current resource usage for a plugin."""
    cpu_time_ms: float = 0.0
    memory_mb: float = 0.0
    timeout_count: int = 0
    last_timeout: Optional[datetime] = None
    total_calls: int = 0
    total_time_ms: float = 0.0
    avg_time_ms: float = 0.0


class PluginWatchdog:
    """Watchdog timer for plugin processing."""
    
    def __init__(self, timeout_s: float, callback: Optional[Callable] = None):
        self.timeout_s = timeout_s
        self.callback = callback
        self._timer: Optional[threading.Timer] = None
        self._active = False
    
    def start(self):
        """Start watchdog timer."""
        if self._active:
            return
        
        self._active = True
        self._timer = threading.Timer(self.timeout_s, self._timeout_handler)
        self._timer.daemon = True
        self._timer.start()
    
    def stop(self):
        """Stop watchdog timer."""
        if not self._active:
            return
        
        self._active = False
        if self._timer:
            self._timer.cancel()
            self._timer = None
    
    def _timeout_handler(self):
        """Called when timeout occurs."""
        logger.warning(f"Plugin watchdog timeout after {self.timeout_s}s")
        if self.callback:
            self.callback()


class PluginResourceManager(Singleton):
    """Manages resource limits and monitoring for all plugins."""
    
    def __init__(self):
        super().__init__()
        self._limits: Dict[str, ResourceLimits] = {}
        self._usage: Dict[str, ResourceUsage] = {}
        self._bypassed: Dict[str, bool] = {}
        self._lock = threading.RLock()
        
        # Default limits
        self.default_limits = ResourceLimits()
    
    def set_limits(self, plugin_uri: str, limits: ResourceLimits):
        """Set resource limits for a plugin."""
        with self._lock:
            self._limits[plugin_uri] = limits
            logger.info(f"Set resource limits for {plugin_uri}: "
                       f"cpu={limits.max_cpu_time_ms}ms, mem={limits.max_memory_mb}MB")
    
    def get_limits(self, plugin_uri: str) -> ResourceLimits:
        """Get resource limits for a plugin."""
        with self._lock:
            return self._limits.get(plugin_uri, self.default_limits)
    
    def get_usage(self, plugin_uri: str) -> ResourceUsage:
        """Get resource usage for a plugin."""
        with self._lock:
            if plugin_uri not in self._usage:
                self._usage[plugin_uri] = ResourceUsage()
            return self._usage[plugin_uri]
    
    def is_bypassed(self, plugin_uri: str) -> bool:
        """Check if plugin is bypassed due to violations."""
        with self._lock:
            return self._bypassed.get(plugin_uri, False)
    
    def bypass_plugin(self, plugin_uri: str, reason: str):
        """Bypass plugin due to resource violation."""
        with self._lock:
            self._bypassed[plugin_uri] = True
            logger.error(f"🚫 Plugin {plugin_uri} bypassed: {reason}")
    
    def unbypass_plugin(self, plugin_uri: str):
        """Remove bypass for plugin."""
        with self._lock:
            self._bypassed[plugin_uri] = False
            logger.info(f"Plugin {plugin_uri} bypass removed")
    
    @contextmanager
    def monitor_processing(self, plugin_uri: str, block_size: int, sample_rate: int):
        """
        Context manager to monitor plugin processing.
        
        Usage:
            with resource_manager.monitor_processing(uri, 256, 48000):
                plugin.process(audio)
        """
        limits = self.get_limits(plugin_uri)
        usage = self.get_usage(plugin_uri)
        
        # Check if already bypassed
        if self.is_bypassed(plugin_uri):
            yield  # Don't process, just pass through
            return
        
        # Start timing
        start_time = time.perf_counter()
        start_memory = psutil.Process().memory_info().rss / (1024 * 1024)
        
        # Setup watchdog
        watchdog = None
        if limits.enabled:
            timeout_s = limits.max_cpu_time_ms / 1000.0
            watchdog = PluginWatchdog(
                timeout_s,
                lambda: self._handle_timeout(plugin_uri, usage, limits)
            )
            watchdog.start()
        
        try:
            # Execute plugin processing
            yield
            
        finally:
            # Stop watchdog
            if watchdog:
                watchdog.stop()
            
            # Calculate resource usage
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            end_memory = psutil.Process().memory_info().rss / (1024 * 1024)
            memory_used = end_memory - start_memory
            
            # Update usage statistics
            with self._lock:
                usage.cpu_time_ms = elapsed_ms
                usage.memory_mb = memory_used
                usage.total_calls += 1
                usage.total_time_ms += elapsed_ms
                usage.avg_time_ms = usage.total_time_ms / usage.total_calls
                
                # Check for violations
                if limits.enabled:
                    if elapsed_ms > limits.max_cpu_time_ms:
                        self._handle_cpu_violation(plugin_uri, elapsed_ms, limits)
                    
                    if memory_used > limits.max_memory_mb:
                        self._handle_memory_violation(plugin_uri, memory_used, limits)
    
    def _handle_timeout(self, plugin_uri: str, usage: ResourceUsage, limits: ResourceLimits):
        """Handle plugin timeout."""
        with self._lock:
            usage.timeout_count += 1
            usage.last_timeout = datetime.now()
            
            logger.warning(
                f"⚠️  Plugin {plugin_uri} timeout #{usage.timeout_count} "
                f"(limit: {limits.max_cpu_time_ms}ms)"
            )
            
            # Auto-bypass after 3 consecutive timeouts
            if usage.timeout_count >= 3:
                self.bypass_plugin(
                    plugin_uri,
                    f"3 consecutive timeouts (>{limits.max_cpu_time_ms}ms)"
                )
    
    def _handle_cpu_violation(self, plugin_uri: str, elapsed_ms: float, limits: ResourceLimits):
        """Handle CPU time limit violation."""
        logger.warning(
            f"⚠️  Plugin {plugin_uri} exceeded CPU limit: "
            f"{elapsed_ms:.2f}ms > {limits.max_cpu_time_ms}ms"
        )
        
        # Bypass if severely over limit
        if elapsed_ms > limits.max_cpu_time_ms * 2:
            self.bypass_plugin(
                plugin_uri,
                f"Severe CPU violation: {elapsed_ms:.2f}ms"
            )
    
    def _handle_memory_violation(self, plugin_uri: str, memory_mb: float, limits: ResourceLimits):
        """Handle memory limit violation."""
        logger.warning(
            f"⚠️  Plugin {plugin_uri} exceeded memory limit: "
            f"{memory_mb:.2f}MB > {limits.max_memory_mb}MB"
        )
        
        # Bypass if severely over limit
        if memory_mb > limits.max_memory_mb * 2:
            self.bypass_plugin(
                plugin_uri,
                f"Severe memory violation: {memory_mb:.2f}MB"
            )
    
    def get_all_usage(self) -> Dict[str, Dict[str, Any]]:
        """Get usage statistics for all plugins."""
        with self._lock:
            return {
                uri: {
                    "cpu_time_ms": usage.cpu_time_ms,
                    "memory_mb": usage.memory_mb,
                    "avg_time_ms": usage.avg_time_ms,
                    "total_calls": usage.total_calls,
                    "timeout_count": usage.timeout_count,
                    "bypassed": self.is_bypassed(uri),
                }
                for uri, usage in self._usage.items()
            }
    
    def reset_plugin(self, plugin_uri: str):
        """Reset usage statistics and bypass for a plugin."""
        with self._lock:
            if plugin_uri in self._usage:
                del self._usage[plugin_uri]
            if plugin_uri in self._bypassed:
                del self._bypassed[plugin_uri]
            logger.info(f"Reset resource tracking for {plugin_uri}")


def get_resource_manager() -> PluginResourceManager:
    """Get singleton resource manager instance."""
    return PluginResourceManager.get_instance()
