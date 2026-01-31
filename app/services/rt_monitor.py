"""
Real-Time Performance Monitor

Tracks audio callback performance and detects xruns.
Uses lock-free data structures for RT safety.
"""

import logging
import time
from collections import deque
from typing import Dict, Any, Optional
from dataclasses import dataclass
import statistics

logger = logging.getLogger(__name__)


@dataclass
class RTMetrics:
    """Real-time performance metrics."""
    callback_time_us: float
    deadline_us: float
    is_xrun: bool
    timestamp: float


class RTPerformanceMonitor:
    """Monitor real-time audio callback performance.
    
    Tracks timing, detects xruns, and provides statistics.
    All methods are RT-safe (no blocking, no allocation).
    """
    
    def __init__(self, max_history: int = 1000):
        """Initialize RT monitor.
        
        Args:
            max_history: Maximum number of samples to keep
        """
        self.max_history = max_history
        self.callback_times = deque(maxlen=max_history)
        
        # RT-safe counters (atomic in CPython)
        self.total_callbacks = 0
        self.xrun_count = 0
        self.max_callback_time_us = 0.0
        self.min_callback_time_us = float('inf')
        
        # Performance thresholds
        self.deadline_us = 5333.0  # 256 samples @ 48kHz = 5.33ms
        self.warning_threshold_pct = 80.0  # Warn at 80% of deadline
    
    def set_deadline(self, sample_rate: int, block_size: int) -> None:
        """Set RT deadline based on audio parameters.
        
        Args:
            sample_rate: Audio sample rate
            block_size: Buffer size in samples
        """
        self.deadline_us = (block_size / sample_rate) * 1_000_000
        logger.info(f"RT deadline set to {self.deadline_us:.1f}μs ({sample_rate}Hz, {block_size} samples)")
    
    def record_callback(self, duration_us: float) -> bool:
        """Record callback execution time (RT-safe).
        
        Args:
            duration_us: Callback duration in microseconds
            
        Returns:
            True if xrun detected
        """
        # Update counters (atomic)
        self.total_callbacks += 1
        
        # Track min/max
        if duration_us > self.max_callback_time_us:
            self.max_callback_time_us = duration_us
        if duration_us < self.min_callback_time_us:
            self.min_callback_time_us = duration_us
        
        # Store in history
        self.callback_times.append(duration_us)
        
        # Check for xrun
        is_xrun = duration_us > self.deadline_us
        if is_xrun:
            self.xrun_count += 1
        
        return is_xrun
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get performance statistics.
        
        NOT RT-safe - call from non-RT thread only.
        """
        if not self.callback_times:
            return {
                "total_callbacks": 0,
                "xrun_count": 0,
                "xrun_rate_pct": 0.0,
            }
        
        times = list(self.callback_times)
        
        return {
            "total_callbacks": self.total_callbacks,
            "xrun_count": self.xrun_count,
            "xrun_rate_pct": (self.xrun_count / self.total_callbacks * 100) if self.total_callbacks else 0.0,
            "deadline_us": self.deadline_us,
            "min_callback_us": self.min_callback_time_us,
            "max_callback_us": self.max_callback_time_us,
            "mean_callback_us": statistics.mean(times) if times else 0.0,
            "median_callback_us": statistics.median(times) if times else 0.0,
            "p95_callback_us": self._percentile(times, 95) if len(times) >= 20 else 0.0,
            "p99_callback_us": self._percentile(times, 99) if len(times) >= 100 else 0.0,
            "cpu_usage_pct": (statistics.mean(times) / self.deadline_us * 100) if times and self.deadline_us else 0.0,
        }
    
    def _percentile(self, data: list, percentile: float) -> float:
        """Calculate percentile (NOT RT-safe)."""
        if not data:
            return 0.0
        sorted_data = sorted(data)
        index = int(len(sorted_data) * (percentile / 100))
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    def reset(self) -> None:
        """Reset all counters and history."""
        self.callback_times.clear()
        self.total_callbacks = 0
        self.xrun_count = 0
        self.max_callback_time_us = 0.0
        self.min_callback_time_us = float('inf')
        logger.info("RT performance monitor reset")
    
    def check_health(self) -> Dict[str, Any]:
        """Check RT health and return status.
        
        Returns:
            Health status dict
        """
        if not self.callback_times:
            return {
                "status": "unknown",
                "message": "No data yet"
            }
        
        stats = self.get_statistics()
        cpu_usage = stats["cpu_usage_pct"]
        xrun_rate = stats["xrun_rate_pct"]
        
        # Determine health status
        if xrun_rate > 1.0:
            status = "critical"
            message = f"High xrun rate: {xrun_rate:.2f}%"
        elif cpu_usage > 95:
            status = "warning"
            message = f"CPU usage near limit: {cpu_usage:.1f}%"
        elif cpu_usage > self.warning_threshold_pct:
            status = "warning"
            message = f"CPU usage high: {cpu_usage:.1f}%"
        else:
            status = "healthy"
            message = f"RT performance good (CPU: {cpu_usage:.1f}%)"
        
        return {
            "status": status,
            "message": message,
            "cpu_usage_pct": round(cpu_usage, 1),
            "xrun_rate_pct": round(xrun_rate, 2),
            "max_callback_us": round(stats["max_callback_us"], 1),
            "deadline_us": round(self.deadline_us, 1),
        }


class RTCallbackTimer:
    """Context manager for timing RT callbacks.

    Usage:
        with RTCallbackTimer(monitor) as timer:
            # RT callback code
            process_audio()
    """

    def __init__(self, monitor: RTPerformanceMonitor):
        self.monitor = monitor
        self.start_time = 0.0

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        end_time = time.perf_counter()
        duration_us = (end_time - self.start_time) * 1_000_000
        self.monitor.record_callback(duration_us)
        return False


# Singleton accessor
def get_rt_monitor() -> RTPerformanceMonitor:
    """Get or create global RT performance monitor instance."""
    return RTPerformanceMonitor.get_instance()


def init_rt_monitor(sample_rate: int = 48000, block_size: int = 256) -> RTPerformanceMonitor:
    """Initialize the global RT monitor with audio parameters."""
    monitor = get_rt_monitor()
    monitor.set_deadline(sample_rate, block_size)
    return monitor


def get_rt_stats() -> Dict[str, Any]:
    """Get real-time performance statistics for health checks.

    Returns:
        Dictionary with RT performance statistics.
    """
    monitor = get_rt_monitor()
    return monitor.get_statistics()


def shutdown_rt_monitor() -> None:
    """Shutdown the RT monitor (cleanup)."""
    global _rt_monitor
    _rt_monitor = None
