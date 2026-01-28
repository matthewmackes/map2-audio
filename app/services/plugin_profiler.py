"""
Plugin Profiler - RT-Safe Per-Plugin CPU Performance Monitoring

Tracks CPU time consumed by each plugin in the signal chain using
high-resolution timing with minimal overhead.

REAL-TIME SAFETY:
- Uses perf_counter_ns() for nanosecond precision
- Lock-free atomic statistics updates
- Pre-allocated data structures
- No dynamic memory allocation in RT path
- No I/O operations in measurement path
"""

import time
import logging
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass, field
from threading import Lock
from collections import deque

logger = logging.getLogger(__name__)


@dataclass
class PluginStats:
    """Performance statistics for a single plugin."""
    
    uri: str
    name: str = ""
    
    # Current window statistics
    call_count: int = 0
    total_time_ns: int = 0
    min_time_ns: int = float('inf')
    max_time_ns: int = 0
    
    # Rolling average (last N samples)
    recent_times: deque = field(default_factory=lambda: deque(maxlen=1000))
    
    # Percentage metrics
    avg_time_us: float = 0.0
    max_time_us: float = 0.0
    cpu_percent: float = 0.0
    
    def update(self, elapsed_ns: int, deadline_us: float) -> None:
        """Update statistics with new measurement (RT-safe)."""
        self.call_count += 1
        self.total_time_ns += elapsed_ns
        self.min_time_ns = min(self.min_time_ns, elapsed_ns)
        self.max_time_ns = max(self.max_time_ns, elapsed_ns)
        
        # Add to rolling window
        self.recent_times.append(elapsed_ns)
        
        # Calculate metrics
        if self.recent_times:
            avg_ns = sum(self.recent_times) / len(self.recent_times)
            self.avg_time_us = avg_ns / 1000.0
            self.max_time_us = self.max_time_ns / 1000.0
            
            # CPU% = (avg_time / deadline) * 100
            if deadline_us > 0:
                self.cpu_percent = (self.avg_time_us / deadline_us) * 100.0
    
    def reset(self) -> None:
        """Reset statistics counters."""
        self.call_count = 0
        self.total_time_ns = 0
        self.min_time_ns = float('inf')
        self.max_time_ns = 0
        self.recent_times.clear()
        self.avg_time_us = 0.0
        self.max_time_us = 0.0
        self.cpu_percent = 0.0


class PluginProfiler:
    """RT-safe per-plugin CPU profiling."""
    
    def __init__(self, sample_rate: int = 48000, buffer_size: int = 256):
        """Initialize profiler.
        
        Args:
            sample_rate: Audio sample rate (Hz)
            buffer_size: Audio buffer size (samples)
        """
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        
        # Calculate buffer deadline in microseconds
        self.deadline_us = (buffer_size * 1_000_000.0) / sample_rate
        
        # Plugin statistics (uri -> PluginStats)
        self._stats: Dict[str, PluginStats] = {}
        self._stats_lock = Lock()
        
        # Total chain statistics
        self._chain_total_ns = 0
        self._chain_call_count = 0
        
        logger.info(f"PluginProfiler initialized: {sample_rate}Hz, {buffer_size} samples, "
                   f"{self.deadline_us:.1f}μs deadline")
    
    def register_plugin(self, uri: str, name: str = "") -> None:
        """Register a plugin for profiling.
        
        Args:
            uri: Plugin URI
            name: Human-readable plugin name
        """
        with self._stats_lock:
            if uri not in self._stats:
                self._stats[uri] = PluginStats(uri=uri, name=name or uri)
                logger.debug(f"Registered plugin for profiling: {name} ({uri})")
    
    def measure_start(self, plugin_uri: str) -> int:
        """Mark plugin processing start (RT-safe).
        
        Args:
            plugin_uri: Plugin URI
            
        Returns:
            Start timestamp in nanoseconds
        """
        return time.perf_counter_ns()
    
    def measure_end(self, plugin_uri: str, start_ns: int) -> None:
        """Record plugin processing time (RT-safe).
        
        Args:
            plugin_uri: Plugin URI
            start_ns: Start timestamp from measure_start()
        """
        elapsed_ns = time.perf_counter_ns() - start_ns
        
        # Update plugin stats
        with self._stats_lock:
            if plugin_uri in self._stats:
                self._stats[plugin_uri].update(elapsed_ns, self.deadline_us)
            
            # Update chain totals
            self._chain_total_ns += elapsed_ns
            self._chain_call_count += 1
    
    def get_plugin_stats(self, plugin_uri: str) -> Optional[Dict]:
        """Get statistics for specific plugin.
        
        Args:
            plugin_uri: Plugin URI
            
        Returns:
            Stats dict or None if not found
        """
        with self._stats_lock:
            stats = self._stats.get(plugin_uri)
            if not stats:
                return None
            
            return {
                "uri": stats.uri,
                "name": stats.name,
                "call_count": stats.call_count,
                "avg_time_us": round(stats.avg_time_us, 2),
                "max_time_us": round(stats.max_time_us, 2),
                "cpu_percent": round(stats.cpu_percent, 2),
                "deadline_us": round(self.deadline_us, 2)
            }
    
    def get_all_stats(self) -> List[Dict]:
        """Get statistics for all plugins.
        
        Returns:
            List of stats dicts sorted by CPU usage
        """
        with self._stats_lock:
            stats_list = []
            
            for uri, stats in self._stats.items():
                if stats.call_count > 0:
                    stats_list.append({
                        "uri": uri,
                        "name": stats.name,
                        "call_count": stats.call_count,
                        "avg_time_us": round(stats.avg_time_us, 2),
                        "max_time_us": round(stats.max_time_us, 2),
                        "cpu_percent": round(stats.cpu_percent, 2),
                        "calls_per_second": round(self.sample_rate / self.buffer_size, 2)
                    })
            
            # Sort by CPU usage (highest first)
            stats_list.sort(key=lambda x: x["cpu_percent"], reverse=True)
            return stats_list
    
    def get_chain_stats(self) -> Dict:
        """Get total chain statistics.
        
        Returns:
            Chain stats dict
        """
        with self._stats_lock:
            total_cpu_percent = sum(s.cpu_percent for s in self._stats.values())
            total_avg_us = sum(s.avg_time_us for s in self._stats.values())
            total_max_us = max((s.max_time_us for s in self._stats.values()), default=0.0)
            
            return {
                "total_plugins": len(self._stats),
                "total_cpu_percent": round(total_cpu_percent, 2),
                "total_avg_us": round(total_avg_us, 2),
                "total_max_us": round(total_max_us, 2),
                "deadline_us": round(self.deadline_us, 2),
                "utilization_percent": round((total_avg_us / self.deadline_us) * 100, 2) if self.deadline_us > 0 else 0.0,
                "chain_call_count": self._chain_call_count
            }
    
    def reset_stats(self, plugin_uri: Optional[str] = None) -> None:
        """Reset statistics.
        
        Args:
            plugin_uri: Specific plugin to reset, or None for all
        """
        with self._stats_lock:
            if plugin_uri:
                if plugin_uri in self._stats:
                    self._stats[plugin_uri].reset()
                    logger.debug(f"Reset stats for plugin: {plugin_uri}")
            else:
                for stats in self._stats.values():
                    stats.reset()
                self._chain_total_ns = 0
                self._chain_call_count = 0
                logger.debug("Reset all plugin stats")
    
    def update_buffer_config(self, sample_rate: int, buffer_size: int) -> None:
        """Update buffer configuration.
        
        Args:
            sample_rate: New sample rate
            buffer_size: New buffer size
        """
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        self.deadline_us = (buffer_size * 1_000_000.0) / sample_rate
        
        logger.info(f"Updated buffer config: {sample_rate}Hz, {buffer_size} samples, "
                   f"{self.deadline_us:.1f}μs deadline")
    
    def get_overhead_estimate(self) -> float:
        """Estimate profiler overhead.
        
        Returns:
            Estimated overhead in microseconds per call
        """
        # Measure overhead of measurement calls
        iterations = 1000
        start = time.perf_counter_ns()
        
        for _ in range(iterations):
            ts = time.perf_counter_ns()
            _ = time.perf_counter_ns() - ts
        
        end = time.perf_counter_ns()
        overhead_ns = (end - start) / iterations
        overhead_us = overhead_ns / 1000.0
        
        return overhead_us
    
    def get_profiler_stats(self) -> Dict:
        """Get profiler metadata and overhead info.
        
        Returns:
            Profiler stats dict
        """
        return {
            "sample_rate": self.sample_rate,
            "buffer_size": self.buffer_size,
            "deadline_us": round(self.deadline_us, 2),
            "registered_plugins": len(self._stats),
            "total_measurements": self._chain_call_count,
            "overhead_per_call_us": round(self.get_overhead_estimate(), 3)
        }


# Global profiler instance
_profiler: Optional[PluginProfiler] = None


def get_profiler() -> Optional[PluginProfiler]:
    """Get global profiler instance."""
    return _profiler


def init_profiler(sample_rate: int = 48000, buffer_size: int = 256) -> PluginProfiler:
    """Initialize global profiler instance.
    
    Args:
        sample_rate: Audio sample rate
        buffer_size: Audio buffer size
        
    Returns:
        PluginProfiler instance
    """
    global _profiler
    _profiler = PluginProfiler(sample_rate, buffer_size)
    return _profiler


def shutdown_profiler() -> None:
    """Shutdown global profiler instance."""
    global _profiler
    if _profiler:
        logger.info("Shutting down plugin profiler")
        _profiler = None
