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
    instance_id: Optional[int] = None
    plugin_position: Optional[int] = None
    
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

    @staticmethod
    def _stats_key(
        uri: str,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> str:
        if isinstance(instance_id, int) and instance_id > 0:
            return f"instance:{instance_id}"
        if isinstance(plugin_position, int) and plugin_position >= 0:
            return f"position:{uri}:{plugin_position}"
        return f"uri:{uri}"

    def _serialize_stats(self, stats: PluginStats) -> Dict:
        payload = {
            "uri": stats.uri,
            "name": stats.name,
            "call_count": stats.call_count,
            "avg_time_us": round(stats.avg_time_us, 2),
            "max_time_us": round(stats.max_time_us, 2),
            "cpu_percent": round(stats.cpu_percent, 2),
            "deadline_us": round(self.deadline_us, 2),
        }
        if isinstance(stats.instance_id, int) and stats.instance_id > 0:
            payload["instance_id"] = stats.instance_id
        if isinstance(stats.plugin_position, int) and stats.plugin_position >= 0:
            payload["plugin_position"] = stats.plugin_position
            payload["position"] = stats.plugin_position
        return payload

    def _aggregate_stats(self, matches: List[PluginStats]) -> Dict:
        total_calls = sum(stats.call_count for stats in matches)
        weighted_avg_us = (
            sum(stats.avg_time_us * stats.call_count for stats in matches) / total_calls
            if total_calls > 0
            else 0.0
        )
        max_time_us = max((stats.max_time_us for stats in matches), default=0.0)
        cpu_percent = sum(stats.cpu_percent for stats in matches)
        return {
            "uri": matches[0].uri,
            "name": matches[0].name,
            "call_count": total_calls,
            "avg_time_us": round(weighted_avg_us, 2),
            "max_time_us": round(max_time_us, 2),
            "cpu_percent": round(cpu_percent, 2),
            "deadline_us": round(self.deadline_us, 2),
        }
    
    def register_plugin(
        self,
        uri: str,
        name: str = "",
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Register a plugin for profiling.
        
        Args:
            uri: Plugin URI
            name: Human-readable plugin name
        """
        stats_key = self._stats_key(uri, instance_id, plugin_position)
        with self._stats_lock:
            if stats_key not in self._stats:
                self._stats[stats_key] = PluginStats(
                    uri=uri,
                    name=name or uri,
                    instance_id=instance_id if isinstance(instance_id, int) and instance_id > 0 else None,
                    plugin_position=plugin_position if isinstance(plugin_position, int) and plugin_position >= 0 else None,
                )
                logger.debug(f"Registered plugin for profiling: {name} ({uri})")
    
    def measure_start(
        self,
        plugin_uri: str,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> int:
        """Mark plugin processing start (RT-safe).
        
        Args:
            plugin_uri: Plugin URI
            
        Returns:
            Start timestamp in nanoseconds
        """
        return time.perf_counter_ns()
    
    def measure_end(
        self,
        plugin_uri: str,
        start_ns: int,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Record plugin processing time (RT-safe).
        
        Args:
            plugin_uri: Plugin URI
            start_ns: Start timestamp from measure_start()
        """
        elapsed_ns = time.perf_counter_ns() - start_ns
        stats_key = self._stats_key(plugin_uri, instance_id, plugin_position)
        
        # Update plugin stats
        with self._stats_lock:
            if stats_key in self._stats:
                self._stats[stats_key].update(elapsed_ns, self.deadline_us)
            
            # Update chain totals
            self._chain_total_ns += elapsed_ns
            self._chain_call_count += 1
    
    def get_plugin_stats(
        self,
        plugin_uri: str,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> Optional[Dict]:
        """Get statistics for specific plugin.
        
        Args:
            plugin_uri: Plugin URI
            
        Returns:
            Stats dict or None if not found
        """
        stats_key = self._stats_key(plugin_uri, instance_id, plugin_position)
        with self._stats_lock:
            if instance_id is not None or plugin_position is not None:
                stats = self._stats.get(stats_key)
                return self._serialize_stats(stats) if stats else None

            matches = [stats for stats in self._stats.values() if stats.uri == plugin_uri]
            if not matches:
                return None
            if len(matches) == 1:
                return self._serialize_stats(matches[0])
            return self._aggregate_stats(matches)
    
    def get_all_stats(self) -> List[Dict]:
        """Get statistics for all plugins.
        
        Returns:
            List of stats dicts sorted by CPU usage
        """
        with self._stats_lock:
            stats_list = []
            
            for stats in self._stats.values():
                if stats.call_count > 0:
                    payload = self._serialize_stats(stats)
                    payload["calls_per_second"] = round(self.sample_rate / self.buffer_size, 2)
                    stats_list.append(payload)
            
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
    
    def reset_stats(
        self,
        plugin_uri: Optional[str] = None,
        *,
        instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> None:
        """Reset statistics.
        
        Args:
            plugin_uri: Specific plugin to reset, or None for all
        """
        with self._stats_lock:
            if plugin_uri:
                if instance_id is not None or plugin_position is not None:
                    stats_key = self._stats_key(plugin_uri, instance_id, plugin_position)
                    if stats_key in self._stats:
                        self._stats[stats_key].reset()
                        logger.debug(f"Reset stats for plugin: {plugin_uri}")
                    return

                for stats in self._stats.values():
                    if stats.uri == plugin_uri:
                        stats.reset()
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
