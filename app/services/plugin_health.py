"""
Plugin Health Tracking and Error Recovery System

Provides:
- Per-plugin health monitoring
- Automatic bypass on consecutive failures
- Plugin sandboxing via process isolation (optional)
- RT-safety validation
- Processing time monitoring
- Graceful error recovery
"""

import logging
import time
import asyncio
import threading
import multiprocessing
from multiprocessing import Process, Queue as MPQueue
from typing import Dict, List, Optional, Any, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import numpy as np
import signal
import os

logger = logging.getLogger(__name__)


class PluginHealthState(Enum):
    """Plugin health states."""
    HEALTHY = "healthy"
    WARNING = "warning"  # Occasional errors
    DEGRADED = "degraded"  # Frequent errors, still running
    BYPASSED = "bypassed"  # Auto-bypassed due to failures
    CRASHED = "crashed"  # Plugin crashed
    DISABLED = "disabled"  # Manually disabled


class RTSafetyLevel(Enum):
    """Real-time safety classification."""
    VERIFIED_RT_SAFE = "verified_rt_safe"  # Confirmed RT-safe
    LIKELY_RT_SAFE = "likely_rt_safe"  # Probably safe
    UNKNOWN = "unknown"  # Not tested
    POTENTIALLY_UNSAFE = "potentially_unsafe"  # May have issues
    NOT_RT_SAFE = "not_rt_safe"  # Known to be unsafe


@dataclass
class PluginProcessingStats:
    """Processing statistics for a plugin."""
    total_calls: int = 0
    total_failures: int = 0
    consecutive_failures: int = 0
    total_processing_time_ms: float = 0.0
    max_processing_time_ms: float = 0.0
    min_processing_time_ms: float = float('inf')
    avg_processing_time_ms: float = 0.0
    deadline_violations: int = 0  # Times processing exceeded buffer deadline
    last_failure_time: Optional[float] = None
    last_failure_reason: Optional[str] = None

    def update_timing(self, processing_time_ms: float, deadline_ms: float) -> None:
        """Update timing statistics."""
        self.total_calls += 1
        self.total_processing_time_ms += processing_time_ms
        self.max_processing_time_ms = max(self.max_processing_time_ms, processing_time_ms)
        self.min_processing_time_ms = min(self.min_processing_time_ms, processing_time_ms)
        self.avg_processing_time_ms = self.total_processing_time_ms / self.total_calls

        if processing_time_ms > deadline_ms:
            self.deadline_violations += 1

    def record_failure(self, reason: str) -> None:
        """Record a processing failure."""
        self.total_failures += 1
        self.consecutive_failures += 1
        self.last_failure_time = time.perf_counter()
        self.last_failure_reason = reason

    def record_success(self) -> None:
        """Record successful processing."""
        self.consecutive_failures = 0


@dataclass
class PluginHealthRecord:
    """Health record for a single plugin."""
    plugin_uri: str
    plugin_name: str
    state: PluginHealthState = PluginHealthState.HEALTHY
    rt_safety: RTSafetyLevel = RTSafetyLevel.UNKNOWN
    stats: PluginProcessingStats = field(default_factory=PluginProcessingStats)
    auto_bypass_threshold: int = 5  # Consecutive failures before auto-bypass
    is_bypassed: bool = False
    bypass_reason: Optional[str] = None
    last_state_change: float = field(default_factory=time.perf_counter)

    # LV2 RT-safe extension check
    has_hard_rt_capable: bool = False
    reported_latency_samples: int = 0


class PluginHealthTracker:
    """Tracks health of all plugins and manages error recovery.

    Features:
    - Per-plugin health monitoring
    - Automatic bypass after consecutive failures
    - Processing time tracking
    - RT-safety classification
    - State change notifications
    """

    # Thresholds
    WARNING_FAILURE_RATE = 0.01  # 1% failure rate
    DEGRADED_FAILURE_RATE = 0.05  # 5% failure rate
    AUTO_BYPASS_CONSECUTIVE = 5  # Consecutive failures to trigger bypass

    # Timing thresholds (relative to buffer deadline)
    TIMING_WARNING_FACTOR = 0.7  # Warn if >70% of deadline
    TIMING_CRITICAL_FACTOR = 0.9  # Critical if >90% of deadline

    def __init__(self, buffer_size: int = 256, sample_rate: int = 48000):
        self._plugins: Dict[str, PluginHealthRecord] = {}
        self._lock = threading.Lock()
        self._state_callbacks: List[Callable[[str, PluginHealthState], None]] = []

        # Calculate buffer deadline
        self.buffer_size = buffer_size
        self.sample_rate = sample_rate
        self.buffer_deadline_ms = (buffer_size / sample_rate) * 1000

        # RT-safety verified plugins (known good)
        self._verified_rt_safe_plugins: set = set()

        # Plugins that have been tested and found unsafe
        self._known_unsafe_plugins: set = set()

    def register_plugin(self, uri: str, name: str,
                       has_hard_rt_capable: bool = False,
                       latency_samples: int = 0) -> None:
        """Register a plugin for health tracking."""
        with self._lock:
            if uri not in self._plugins:
                record = PluginHealthRecord(
                    plugin_uri=uri,
                    plugin_name=name,
                    has_hard_rt_capable=has_hard_rt_capable,
                    reported_latency_samples=latency_samples,
                )

                # Set initial RT safety classification
                if has_hard_rt_capable:
                    record.rt_safety = RTSafetyLevel.VERIFIED_RT_SAFE
                elif uri in self._verified_rt_safe_plugins:
                    record.rt_safety = RTSafetyLevel.VERIFIED_RT_SAFE
                elif uri in self._known_unsafe_plugins:
                    record.rt_safety = RTSafetyLevel.NOT_RT_SAFE

                self._plugins[uri] = record
                logger.info(f"Registered plugin for health tracking: {name} ({uri})")

    def unregister_plugin(self, uri: str) -> None:
        """Unregister a plugin from health tracking."""
        with self._lock:
            if uri in self._plugins:
                del self._plugins[uri]

    def register_state_callback(self, callback: Callable[[str, PluginHealthState], None]) -> None:
        """Register callback for plugin state changes."""
        self._state_callbacks.append(callback)

    def record_processing(self, uri: str, processing_time_ms: float,
                         success: bool = True, error: Optional[str] = None) -> bool:
        """Record a plugin processing attempt.

        Args:
            uri: Plugin URI
            processing_time_ms: Time taken to process
            success: Whether processing succeeded
            error: Error message if failed

        Returns:
            True if plugin should continue processing, False if bypassed
        """
        with self._lock:
            if uri not in self._plugins:
                return True

            record = self._plugins[uri]

            if record.is_bypassed:
                return False

            # Update timing stats
            record.stats.update_timing(processing_time_ms, self.buffer_deadline_ms)

            if success:
                record.stats.record_success()
            else:
                record.stats.record_failure(error or "Unknown error")

                # Check for auto-bypass
                if record.stats.consecutive_failures >= record.auto_bypass_threshold:
                    self._auto_bypass_plugin(record, f"Exceeded {record.auto_bypass_threshold} consecutive failures")
                    return False

            # Update health state
            self._update_health_state(record)

            return not record.is_bypassed

    def _update_health_state(self, record: PluginHealthRecord) -> None:
        """Update plugin health state based on statistics."""
        old_state = record.state

        if record.is_bypassed:
            record.state = PluginHealthState.BYPASSED
        elif record.stats.total_calls > 0:
            failure_rate = record.stats.total_failures / record.stats.total_calls

            if failure_rate >= self.DEGRADED_FAILURE_RATE:
                record.state = PluginHealthState.DEGRADED
            elif failure_rate >= self.WARNING_FAILURE_RATE:
                record.state = PluginHealthState.WARNING
            else:
                record.state = PluginHealthState.HEALTHY

        # Notify on state change
        if old_state != record.state:
            record.last_state_change = time.perf_counter()
            self._notify_state_change(record.plugin_uri, record.state)

    def _auto_bypass_plugin(self, record: PluginHealthRecord, reason: str) -> None:
        """Automatically bypass a failing plugin."""
        record.is_bypassed = True
        record.bypass_reason = reason
        record.state = PluginHealthState.BYPASSED
        record.last_state_change = time.perf_counter()

        logger.warning(f"Auto-bypassed plugin '{record.plugin_name}': {reason}")
        self._notify_state_change(record.plugin_uri, PluginHealthState.BYPASSED)

    def _notify_state_change(self, uri: str, new_state: PluginHealthState) -> None:
        """Notify callbacks of state change."""
        for callback in self._state_callbacks:
            try:
                callback(uri, new_state)
            except Exception as e:
                logger.error(f"State callback error: {e}")

    def manual_bypass(self, uri: str, reason: str = "Manual bypass") -> bool:
        """Manually bypass a plugin."""
        with self._lock:
            if uri in self._plugins:
                record = self._plugins[uri]
                record.is_bypassed = True
                record.bypass_reason = reason
                record.state = PluginHealthState.BYPASSED
                record.last_state_change = time.perf_counter()
                logger.info(f"Manually bypassed plugin '{record.plugin_name}'")
                self._notify_state_change(uri, PluginHealthState.BYPASSED)
                return True
        return False

    def re_enable_plugin(self, uri: str) -> bool:
        """Re-enable a bypassed plugin."""
        with self._lock:
            if uri in self._plugins:
                record = self._plugins[uri]
                record.is_bypassed = False
                record.bypass_reason = None
                record.stats.consecutive_failures = 0
                record.state = PluginHealthState.HEALTHY
                record.last_state_change = time.perf_counter()
                logger.info(f"Re-enabled plugin '{record.plugin_name}'")
                self._notify_state_change(uri, PluginHealthState.HEALTHY)
                return True
        return False

    def is_plugin_bypassed(self, uri: str) -> bool:
        """Check if a plugin is currently bypassed."""
        with self._lock:
            if uri in self._plugins:
                return self._plugins[uri].is_bypassed
        return False

    def get_plugin_health(self, uri: str) -> Optional[Dict[str, Any]]:
        """Get health information for a plugin."""
        with self._lock:
            if uri not in self._plugins:
                return None

            record = self._plugins[uri]
            return {
                "uri": record.plugin_uri,
                "name": record.plugin_name,
                "state": record.state.value,
                "rt_safety": record.rt_safety.value,
                "is_bypassed": record.is_bypassed,
                "bypass_reason": record.bypass_reason,
                "total_calls": record.stats.total_calls,
                "total_failures": record.stats.total_failures,
                "consecutive_failures": record.stats.consecutive_failures,
                "avg_processing_ms": round(record.stats.avg_processing_time_ms, 3),
                "max_processing_ms": round(record.stats.max_processing_time_ms, 3),
                "deadline_violations": record.stats.deadline_violations,
                "failure_rate": round(record.stats.total_failures / max(1, record.stats.total_calls) * 100, 2),
                "last_failure_reason": record.stats.last_failure_reason,
                "has_hard_rt_capable": record.has_hard_rt_capable,
            }

    def get_all_plugin_health(self) -> List[Dict[str, Any]]:
        """Get health information for all plugins."""
        with self._lock:
            return [self.get_plugin_health(uri) for uri in self._plugins]

    def get_bypassed_plugins(self) -> List[str]:
        """Get list of currently bypassed plugin URIs."""
        with self._lock:
            return [uri for uri, record in self._plugins.items() if record.is_bypassed]

    def get_unhealthy_plugins(self) -> List[str]:
        """Get list of unhealthy plugin URIs."""
        with self._lock:
            unhealthy_states = {PluginHealthState.WARNING, PluginHealthState.DEGRADED,
                              PluginHealthState.BYPASSED, PluginHealthState.CRASHED}
            return [uri for uri, record in self._plugins.items()
                   if record.state in unhealthy_states]

    def validate_rt_safety(self, uri: str, test_buffer_size: int = 256,
                          test_iterations: int = 100) -> RTSafetyLevel:
        """Test a plugin for RT-safety by measuring processing time variance.

        This is a heuristic test - measures timing consistency.
        High variance suggests potential RT-safety issues.
        """
        with self._lock:
            if uri not in self._plugins:
                return RTSafetyLevel.UNKNOWN

            record = self._plugins[uri]

            # If we have enough data, analyze it
            if record.stats.total_calls >= test_iterations:
                avg_time = record.stats.avg_processing_time_ms
                max_time = record.stats.max_processing_time_ms
                deadline = self.buffer_deadline_ms

                # Check if max time is reasonable
                if max_time > deadline:
                    record.rt_safety = RTSafetyLevel.NOT_RT_SAFE
                    self._known_unsafe_plugins.add(uri)
                elif max_time > deadline * 0.9:
                    record.rt_safety = RTSafetyLevel.POTENTIALLY_UNSAFE
                elif max_time < deadline * 0.5 and record.stats.deadline_violations == 0:
                    record.rt_safety = RTSafetyLevel.LIKELY_RT_SAFE

                return record.rt_safety

            return RTSafetyLevel.UNKNOWN

    def mark_verified_rt_safe(self, uri: str) -> None:
        """Manually mark a plugin as verified RT-safe."""
        self._verified_rt_safe_plugins.add(uri)
        with self._lock:
            if uri in self._plugins:
                self._plugins[uri].rt_safety = RTSafetyLevel.VERIFIED_RT_SAFE

    def mark_not_rt_safe(self, uri: str) -> None:
        """Manually mark a plugin as not RT-safe."""
        self._known_unsafe_plugins.add(uri)
        with self._lock:
            if uri in self._plugins:
                self._plugins[uri].rt_safety = RTSafetyLevel.NOT_RT_SAFE


class PluginSandbox:
    """Process-isolated plugin execution sandbox.

    Runs plugin processing in a separate process to protect
    the main audio thread from plugin crashes.

    Note: This adds latency and is optional for critical plugins only.
    """

    def __init__(self, plugin_uri: str, plugin_name: str,
                 buffer_size: int = 256, channels: int = 2):
        self.plugin_uri = plugin_uri
        self.plugin_name = plugin_name
        self.buffer_size = buffer_size
        self.channels = channels

        self._process: Optional[Process] = None
        self._input_queue: Optional[MPQueue] = None
        self._output_queue: Optional[MPQueue] = None
        self._running = False
        self._timeout_ms = 50  # Max wait time for processing

        # Fallback buffer for timeout/crash scenarios
        self._fallback_buffer = np.zeros((buffer_size, channels), dtype=np.float32)

    def start(self, plugin_init_func: Callable) -> bool:
        """Start sandboxed plugin process.

        Args:
            plugin_init_func: Function to initialize the plugin in subprocess
        """
        try:
            self._input_queue = MPQueue(maxsize=4)
            self._output_queue = MPQueue(maxsize=4)

            self._process = Process(
                target=self._sandbox_worker,
                args=(self._input_queue, self._output_queue,
                      plugin_init_func, self.buffer_size, self.channels),
                daemon=True
            )
            self._process.start()
            self._running = True
            logger.info(f"Started sandbox for plugin: {self.plugin_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to start sandbox: {e}")
            return False

    @staticmethod
    def _sandbox_worker(input_q: MPQueue, output_q: MPQueue,
                       init_func: Callable, buffer_size: int, channels: int):
        """Worker function running in sandboxed process."""
        # Set up signal handlers
        def handle_signal(signum, frame):
            pass  # Graceful shutdown

        signal.signal(signal.SIGTERM, handle_signal)

        try:
            # Initialize plugin
            plugin = init_func()

            while True:
                try:
                    # Get input (blocking with timeout)
                    input_data = input_q.get(timeout=1.0)

                    if input_data is None:
                        # Shutdown signal
                        break

                    # Process
                    output_data = plugin.process(input_data)

                    # Send output
                    output_q.put(output_data, timeout=0.1)

                except Exception as e:
                    # Send error marker
                    output_q.put(None, timeout=0.1)

        except Exception as e:
            pass  # Process will exit

    def process(self, input_buffer: np.ndarray) -> Tuple[np.ndarray, bool]:
        """Process audio through sandboxed plugin.

        Args:
            input_buffer: Input audio data

        Returns:
            Tuple of (output_buffer, success)
        """
        if not self._running or not self._process or not self._process.is_alive():
            return self._fallback_buffer, False

        try:
            # Send input
            self._input_queue.put_nowait(input_buffer)

            # Wait for output
            output = self._output_queue.get(timeout=self._timeout_ms / 1000.0)

            if output is None:
                return self._fallback_buffer, False

            return output, True

        except Exception:
            return self._fallback_buffer, False

    def stop(self) -> None:
        """Stop sandboxed plugin process."""
        self._running = False

        if self._input_queue:
            try:
                self._input_queue.put_nowait(None)  # Shutdown signal
            except:
                pass

        if self._process and self._process.is_alive():
            self._process.terminate()
            self._process.join(timeout=1.0)
            if self._process.is_alive():
                self._process.kill()

        logger.info(f"Stopped sandbox for plugin: {self.plugin_name}")

    @property
    def is_alive(self) -> bool:
        """Check if sandbox process is alive."""
        return self._process is not None and self._process.is_alive()


class SafePluginProcessor:
    """Wrapper for safe plugin processing with health tracking.

    Wraps a plugin processing function with:
    - Timing measurement
    - Error handling
    - Health tracking integration
    - Automatic bypass
    """

    def __init__(self, plugin_uri: str, plugin_name: str,
                 process_func: Callable[[np.ndarray], np.ndarray],
                 health_tracker: PluginHealthTracker,
                 use_sandbox: bool = False):
        self.plugin_uri = plugin_uri
        self.plugin_name = plugin_name
        self._process_func = process_func
        self._health_tracker = health_tracker
        self._use_sandbox = use_sandbox

        # Register with health tracker
        health_tracker.register_plugin(plugin_uri, plugin_name)

    def process(self, input_buffer: np.ndarray) -> np.ndarray:
        """Process audio with safety wrapper.

        Args:
            input_buffer: Input audio data

        Returns:
            Processed audio (or passthrough if bypassed/error)
        """
        # Check if bypassed
        if self._health_tracker.is_plugin_bypassed(self.plugin_uri):
            return input_buffer

        start_time = time.perf_counter()

        try:
            output = self._process_func(input_buffer)

            processing_time_ms = (time.perf_counter() - start_time) * 1000

            # Record success
            should_continue = self._health_tracker.record_processing(
                self.plugin_uri,
                processing_time_ms,
                success=True
            )

            if not should_continue:
                return input_buffer

            return output

        except Exception as e:
            processing_time_ms = (time.perf_counter() - start_time) * 1000

            # Record failure
            self._health_tracker.record_processing(
                self.plugin_uri,
                processing_time_ms,
                success=False,
                error=str(e)
            )

            logger.error(f"Plugin '{self.plugin_name}' error: {e}")
            return input_buffer


# Global singleton
_plugin_health_tracker: Optional[PluginHealthTracker] = None


def get_plugin_health_tracker(buffer_size: int = 256,
                              sample_rate: int = 48000) -> PluginHealthTracker:
    """Get or create global plugin health tracker."""
    global _plugin_health_tracker
    if _plugin_health_tracker is None:
        _plugin_health_tracker = PluginHealthTracker(buffer_size, sample_rate)
    return _plugin_health_tracker
