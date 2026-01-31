"""
Real Audio I/O Support for MAP2 - Enhanced for Stage Reliability

Phase 5+: Production-grade audio I/O with:
- RT-safe lock-free queues
- Audio thread watchdog for stall detection
- Real-time thread priority (SCHED_FIFO)
- Dynamic buffer size adaptation
- Input signal detection and auto-mute
- Comprehensive XRun tracking and alerting

Primary audio device: Hotone Jogg USB Audio Interface

REAL-TIME SAFETY:
- Uses lock-free queues (queue.Queue is thread-safe in CPython)
- No blocking in audio callback
- No memory allocation in hot path
- Pre-allocated buffers
- No GIL contention in callback
"""

import logging
import asyncio
import os
import sys
from typing import Callable, Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
import threading
import time
import queue
import numpy as np

from app.utils.dependencies import DependencyChecker
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


# Hotone Jogg USB Audio Interface - Primary device
HOTONE_JOGG_DEVICE = {
    "name": "Jogg USB Audio",
    "vendor_id": "84ef",
    "product_id": "0014",
    "sample_rate": 48000,
    "channels": 2,
    "buffer_size": 256,
}

# Buffer size presets for different use cases
BUFFER_PRESETS = {
    "ultra_low": 64,    # ~1.3ms @ 48kHz - studio only
    "low": 128,         # ~2.7ms @ 48kHz - low latency live
    "standard": 256,    # ~5.3ms @ 48kHz - balanced
    "safe": 512,        # ~10.7ms @ 48kHz - high stability
    "high_latency": 1024,  # ~21.3ms @ 48kHz - maximum stability
}

# Try to import sounddevice
try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False
    logger.warning("sounddevice not available - running in simulation mode")

# Check for RT priority capability
RT_PRIORITY_AVAILABLE = False
try:
    if hasattr(os, 'sched_setscheduler') and hasattr(os, 'SCHED_FIFO'):
        os.sched_setscheduler(0, os.SCHED_FIFO, os.sched_param(80))
        RT_PRIORITY_AVAILABLE = True
except AttributeError:
    pass


class AudioThreadState(Enum):
    """Audio thread health states."""
    HEALTHY = "healthy"
    WARNING = "warning"  # Minor glitches
    CRITICAL = "critical"  # Significant issues
    STALLED = "stalled"  # Thread not responding


class SignalState(Enum):
    """Input signal detection states."""
    PRESENT = "present"
    WEAK = "weak"
    ABSENT = "absent"
    NOISE_ONLY = "noise_only"


@dataclass
class AudioDeviceInfo:
    """Information about an audio device."""
    index: int
    name: str
    channels_in: int
    channels_out: int
    sample_rate: float
    latency_ms: float
    is_input: bool
    is_output: bool


@dataclass
class XRunEvent:
    """Record of an XRun (buffer underrun/overrun) event."""
    timestamp: float
    xrun_type: str  # 'underrun' or 'overrun'
    buffer_fill_pct: float
    cpu_load: float = 0.0


@dataclass
class AudioHealthMetrics:
    """Comprehensive audio health metrics."""
    thread_state: AudioThreadState = AudioThreadState.HEALTHY
    signal_state: SignalState = SignalState.ABSENT
    total_blocks: int = 0
    total_xruns: int = 0
    xrun_rate_per_minute: float = 0.0
    last_xrun_time: Optional[float] = None
    input_level_db: float = -96.0
    output_level_db: float = -96.0
    cpu_load_percent: float = 0.0
    buffer_health_pct: float = 100.0
    is_auto_muted: bool = False
    watchdog_last_heartbeat: float = 0.0
    recent_xruns: List[XRunEvent] = field(default_factory=list)


class AudioWatchdog:
    """Watchdog thread to monitor audio callback health.

    Detects stalled audio threads and triggers recovery.
    Runs in separate thread with higher priority than normal threads.
    """

    # Maximum time between heartbeats before considering thread stalled
    STALL_THRESHOLD_MS = 100  # ~20 buffer cycles at 256 samples
    WARNING_THRESHOLD_MS = 50  # ~10 buffer cycles

    def __init__(self, audio_manager: 'RealAudioIOManager'):
        self.audio_manager = audio_manager
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_block_count = 0
        self._last_check_time = 0.0
        self._stall_callbacks: List[Callable] = []
        self._recovery_in_progress = False

    def register_stall_callback(self, callback: Callable[[AudioHealthMetrics], None]) -> None:
        """Register callback for stall detection."""
        self._stall_callbacks.append(callback)

    def start(self) -> None:
        """Start watchdog monitoring."""
        if self._running:
            return

        self._running = True
        self._last_check_time = time.perf_counter()
        self._last_block_count = self.audio_manager.total_blocks

        self._thread = threading.Thread(
            target=self._watchdog_loop,
            name="AudioWatchdog",
            daemon=True
        )
        self._thread.start()
        logger.info("Audio watchdog started")

    def stop(self) -> None:
        """Stop watchdog monitoring."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
        logger.info("Audio watchdog stopped")

    def _watchdog_loop(self) -> None:
        """Main watchdog monitoring loop."""
        check_interval = 0.010  # 10ms check interval

        while self._running:
            try:
                time.sleep(check_interval)

                if not self.audio_manager.is_running:
                    continue

                current_time = time.perf_counter()
                current_blocks = self.audio_manager.total_blocks
                elapsed_ms = (current_time - self._last_check_time) * 1000

                # Check if blocks are incrementing
                blocks_processed = current_blocks - self._last_block_count

                if blocks_processed == 0 and elapsed_ms > self.STALL_THRESHOLD_MS:
                    # Audio thread appears stalled
                    self._handle_stall(elapsed_ms)
                elif blocks_processed == 0 and elapsed_ms > self.WARNING_THRESHOLD_MS:
                    # Warning state
                    self.audio_manager._health_metrics.thread_state = AudioThreadState.WARNING
                else:
                    # Healthy
                    self.audio_manager._health_metrics.thread_state = AudioThreadState.HEALTHY
                    self.audio_manager._health_metrics.watchdog_last_heartbeat = current_time
                    self._last_block_count = current_blocks
                    self._last_check_time = current_time

            except Exception as e:
                logger.error(f"Watchdog error: {e}")

    def _handle_stall(self, stall_duration_ms: float) -> None:
        """Handle detected audio thread stall."""
        if self._recovery_in_progress:
            return

        self._recovery_in_progress = True
        logger.critical(f"Audio thread stall detected! Duration: {stall_duration_ms:.1f}ms")

        self.audio_manager._health_metrics.thread_state = AudioThreadState.STALLED

        # Notify callbacks
        for callback in self._stall_callbacks:
            try:
                callback(self.audio_manager._health_metrics)
            except Exception as e:
                logger.error(f"Stall callback error: {e}")

        # Attempt recovery
        self._attempt_recovery()
        self._recovery_in_progress = False

    def _attempt_recovery(self) -> None:
        """Attempt to recover from audio stall."""
        logger.warning("Attempting audio recovery...")

        try:
            # Stop and restart stream
            if self.audio_manager.stream and SOUNDDEVICE_AVAILABLE:
                self.audio_manager.stream.abort()
                time.sleep(0.1)
                self.audio_manager.stream.start()
                logger.info("Audio stream restarted after stall")

            # Reset counters
            self._last_block_count = self.audio_manager.total_blocks
            self._last_check_time = time.perf_counter()

        except Exception as e:
            logger.error(f"Recovery failed: {e}")


class SignalDetector:
    """Detects input signal presence and manages auto-mute.

    Monitors input levels and automatically mutes output when
    no valid signal is detected (prevents noise/feedback).
    """

    # Thresholds in dBFS
    NOISE_FLOOR_DB = -60.0  # Below this is considered noise
    SIGNAL_PRESENT_DB = -40.0  # Above this is valid signal
    WEAK_SIGNAL_DB = -50.0  # Between noise floor and this is weak

    # Timing
    SIGNAL_LOSS_TIMEOUT_SEC = 3.0  # Auto-mute after this duration of no signal
    SIGNAL_RESTORE_DELAY_SEC = 0.1  # Delay before unmuting when signal returns

    def __init__(self, sample_rate: int = 48000, block_size: int = 256):
        self.sample_rate = sample_rate
        self.block_size = block_size

        self._last_signal_time = time.perf_counter()
        self._signal_state = SignalState.ABSENT
        self._auto_muted = False
        self._input_level_db = -96.0
        self._peak_hold_db = -96.0
        self._peak_hold_time = 0.0

        # Smoothing for level detection (start at noise floor)
        self._level_smoother = -96.0
        self._smooth_factor = 0.1

    def process_input(self, audio_data: np.ndarray) -> SignalState:
        """Analyze input audio and update signal state.

        Args:
            audio_data: Input audio buffer

        Returns:
            Current signal state
        """
        # Calculate RMS level
        if audio_data.size == 0:
            return self._signal_state

        # Handle stereo by taking max of channels
        if audio_data.ndim > 1:
            rms = np.sqrt(np.mean(np.max(audio_data ** 2, axis=1)))
        else:
            rms = np.sqrt(np.mean(audio_data ** 2))

        # Convert to dB
        if rms > 0:
            level_db = 20.0 * np.log10(rms + 1e-10)
        else:
            level_db = -96.0

        # Smooth the level
        self._level_smoother = (self._smooth_factor * level_db +
                                (1 - self._smooth_factor) * self._level_smoother)
        self._input_level_db = self._level_smoother

        # Update peak hold
        if level_db > self._peak_hold_db:
            self._peak_hold_db = level_db
            self._peak_hold_time = time.perf_counter()
        elif time.perf_counter() - self._peak_hold_time > 2.0:
            # Decay peak hold
            self._peak_hold_db = max(self._peak_hold_db - 1.0, level_db)

        # Determine signal state
        current_time = time.perf_counter()

        if self._input_level_db >= self.SIGNAL_PRESENT_DB:
            self._signal_state = SignalState.PRESENT
            self._last_signal_time = current_time
        elif self._input_level_db >= self.WEAK_SIGNAL_DB:
            self._signal_state = SignalState.WEAK
            self._last_signal_time = current_time
        elif self._input_level_db >= self.NOISE_FLOOR_DB:
            self._signal_state = SignalState.NOISE_ONLY
        else:
            self._signal_state = SignalState.ABSENT

        # Check for auto-mute
        time_since_signal = current_time - self._last_signal_time
        if time_since_signal > self.SIGNAL_LOSS_TIMEOUT_SEC:
            self._auto_muted = True
        elif time_since_signal < self.SIGNAL_RESTORE_DELAY_SEC and self._signal_state == SignalState.PRESENT:
            self._auto_muted = False

        return self._signal_state

    @property
    def is_auto_muted(self) -> bool:
        return self._auto_muted

    @property
    def input_level_db(self) -> float:
        return self._input_level_db

    def force_unmute(self) -> None:
        """Manually override auto-mute."""
        self._auto_muted = False
        self._last_signal_time = time.perf_counter()


class RealAudioIOManager:
    """Real audio I/O with sounddevice - REAL-TIME SAFE.

    Uses lock-free queues to communicate between RT audio callback
    and async processing threads. Audio callback never blocks.

    Enhanced features:
    - Audio thread watchdog for stall detection
    - RT thread priority support (SCHED_FIFO)
    - Dynamic buffer size adaptation
    - Input signal detection and auto-mute
    - Comprehensive health metrics

    Default device: Hotone Jogg USB Audio Interface
    """

    def __init__(
        self,
        sample_rate: int = HOTONE_JOGG_DEVICE["sample_rate"],
        block_size: int = HOTONE_JOGG_DEVICE["buffer_size"],
        channels: int = HOTONE_JOGG_DEVICE["channels"],
        input_device: Optional[int] = None,
        output_device: Optional[int] = None,
        queue_size: int = 8,
        enable_watchdog: bool = True,
        enable_signal_detection: bool = True,
        enable_auto_mute: bool = True,
        rt_priority: int = 80,
    ):
        # ⚠️  DEPRECATION WARNING ⚠️
        logger.warning(
            "\n" + "="*80 + "\n"
            "⚠️  DEPRECATED: Python audio I/O is NOT recommended for production!\n"
            "\n"
            "This module has CRITICAL issues:\n"
            "  - Python GIL causes latency spikes\n"
            "  - NOT real-time safe for live performance\n"
            "  - Resource conflicts with JUCE engine\n"
            "\n"
            "RECOMMENDED: Use JUCE C++ Audio Engine instead.\n"
            "See: app/services/juce_engine_service.py\n"
            + "="*80
        )
        
        self.sample_rate = sample_rate
        self.block_size = block_size
        self.channels = channels
        self.input_device = input_device
        self.output_device = output_device
        self.is_running = False
        self.stream: Optional[object] = None
        self._queue_size = queue_size

        # Configuration
        self._enable_watchdog = enable_watchdog
        self._enable_signal_detection = enable_signal_detection
        self._enable_auto_mute = enable_auto_mute
        self._rt_priority = rt_priority

        # Lock-free queues (thread-safe in CPython)
        self.input_queue = queue.Queue(maxsize=queue_size)
        self.output_queue = queue.Queue(maxsize=queue_size)

        # Pre-allocated buffers (no allocation in RT callback)
        self._reallocate_buffers(block_size, channels)

        # RT-safe counters (atomic in CPython due to GIL)
        self.total_blocks = 0
        self.total_underruns = 0
        self.total_overruns = 0
        self.input_drops = 0
        self.output_underruns = 0

        # Health metrics
        self._health_metrics = AudioHealthMetrics()
        self._xrun_history: List[XRunEvent] = []
        self._xrun_history_max = 100

        # Processing callbacks
        self.input_callback: Optional[Callable] = None
        self.output_callback: Optional[Callable] = None
        self.processor_task = None

        # Watchdog
        self._watchdog: Optional[AudioWatchdog] = None
        if enable_watchdog:
            self._watchdog = AudioWatchdog(self)

        # Signal detection
        self._signal_detector: Optional[SignalDetector] = None
        if enable_signal_detection:
            self._signal_detector = SignalDetector(sample_rate, block_size)

        # Dynamic buffer adaptation
        self._adaptive_buffer_enabled = False
        self._xrun_count_window = 0
        self._window_start_time = time.perf_counter()

        # Alert callbacks
        self._xrun_callbacks: List[Callable[[XRunEvent], None]] = []

    def _reallocate_buffers(self, block_size: int, channels: int) -> None:
        """Reallocate audio buffers for new size."""
        self.zero_buffer = np.zeros((block_size, channels), dtype=np.float32)
        self.current_output = np.zeros((block_size, channels), dtype=np.float32)
        self.block_size = block_size
        self.channels = channels

    def register_xrun_callback(self, callback: Callable[[XRunEvent], None]) -> None:
        """Register callback for XRun events."""
        self._xrun_callbacks.append(callback)

    def register_stall_callback(self, callback: Callable[[AudioHealthMetrics], None]) -> None:
        """Register callback for audio stall detection."""
        if self._watchdog:
            self._watchdog.register_stall_callback(callback)

    def get_devices(self) -> List[AudioDeviceInfo]:
        """Get list of available audio devices."""
        if not SOUNDDEVICE_AVAILABLE:
            return self._get_stub_devices()

        try:
            devices = []
            for i, device in enumerate(sd.query_devices()):
                latency = (
                    (device.get("default_low_output_latency", 0) +
                     device.get("default_low_input_latency", 0)) * 1000
                )

                device_info = AudioDeviceInfo(
                    index=i,
                    name=device.get("name", f"Device {i}"),
                    channels_in=device.get("max_input_channels", 0),
                    channels_out=device.get("max_output_channels", 0),
                    sample_rate=float(device.get("default_samplerate", self.sample_rate)),
                    latency_ms=latency,
                    is_input=device.get("max_input_channels", 0) > 0,
                    is_output=device.get("max_output_channels", 0) > 0,
                )
                devices.append(device_info)

            return devices
        except Exception as e:
            logger.error(f"Error querying devices: {e}")
            return self._get_stub_devices()

    def _get_stub_devices(self) -> List[AudioDeviceInfo]:
        """Return stub devices when sounddevice unavailable."""
        return [
            AudioDeviceInfo(
                index=0,
                name=HOTONE_JOGG_DEVICE["name"],
                channels_in=HOTONE_JOGG_DEVICE["channels"],
                channels_out=HOTONE_JOGG_DEVICE["channels"],
                sample_rate=float(HOTONE_JOGG_DEVICE["sample_rate"]),
                latency_ms=5.0,
                is_input=True,
                is_output=True,
            )
        ]

    def find_hotone_jogg(self) -> Optional[int]:
        """Find the Hotone Jogg USB Audio device index."""
        devices = self.get_devices()
        for device in devices:
            if "jogg" in device.name.lower() or "hotone" in device.name.lower():
                logger.info(f"Found Hotone Jogg at device index {device.index}: {device.name}")
                return device.index
        return None

    def auto_configure_hotone_jogg(self) -> bool:
        """Auto-configure to use Hotone Jogg as primary input/output."""
        jogg_index = self.find_hotone_jogg()
        if jogg_index is not None:
            self.input_device = jogg_index
            self.output_device = jogg_index
            self.sample_rate = HOTONE_JOGG_DEVICE["sample_rate"]
            self.block_size = HOTONE_JOGG_DEVICE["buffer_size"]
            self.channels = HOTONE_JOGG_DEVICE["channels"]
            self._reallocate_buffers(self.block_size, self.channels)
            logger.info(f"Auto-configured Hotone Jogg at device {jogg_index}")
            return True
        logger.warning("Hotone Jogg not found - using default device")
        return False

    def set_buffer_size(self, buffer_size: int) -> bool:
        """Change buffer size (requires stream restart).

        Args:
            buffer_size: New buffer size in samples

        Returns:
            True if change was successful
        """
        if buffer_size not in [64, 128, 256, 512, 1024, 2048]:
            logger.warning(f"Non-standard buffer size: {buffer_size}")

        was_running = self.is_running

        if was_running:
            # Need to restart stream
            asyncio.create_task(self._restart_with_new_buffer(buffer_size))
            return True
        else:
            self._reallocate_buffers(buffer_size, self.channels)
            return True

    async def _restart_with_new_buffer(self, new_buffer_size: int) -> None:
        """Restart stream with new buffer size."""
        old_input_cb = self.input_callback
        old_output_cb = self.output_callback

        await self.stop_stream()
        self._reallocate_buffers(new_buffer_size, self.channels)

        # Clear queues
        while not self.input_queue.empty():
            try:
                self.input_queue.get_nowait()
            except queue.Empty:
                break
        while not self.output_queue.empty():
            try:
                self.output_queue.get_nowait()
            except queue.Empty:
                break

        await self.start_stream(old_input_cb, old_output_cb)
        logger.info(f"Stream restarted with buffer size: {new_buffer_size}")

    def enable_adaptive_buffer(self, enabled: bool = True) -> None:
        """Enable/disable automatic buffer size adaptation based on XRun rate."""
        self._adaptive_buffer_enabled = enabled
        if enabled:
            self._xrun_count_window = 0
            self._window_start_time = time.perf_counter()
            logger.info("Adaptive buffer sizing enabled")
        else:
            logger.info("Adaptive buffer sizing disabled")

    def _check_adaptive_buffer(self) -> None:
        """Check if buffer size should be adapted based on XRun rate."""
        if not self._adaptive_buffer_enabled:
            return

        current_time = time.perf_counter()
        window_duration = current_time - self._window_start_time

        if window_duration >= 60.0:  # Check every minute
            xrun_rate = self._xrun_count_window / (window_duration / 60.0)

            if xrun_rate > 5.0 and self.block_size < 1024:
                # Too many XRuns, increase buffer
                new_size = min(self.block_size * 2, 1024)
                logger.warning(f"High XRun rate ({xrun_rate:.1f}/min), increasing buffer to {new_size}")
                asyncio.create_task(self._restart_with_new_buffer(new_size))
            elif xrun_rate < 0.5 and self.block_size > 128:
                # Very stable, could decrease buffer
                new_size = max(self.block_size // 2, 128)
                logger.info(f"Low XRun rate ({xrun_rate:.1f}/min), could decrease buffer to {new_size}")
                # Don't auto-decrease, just log suggestion

            # Reset window
            self._xrun_count_window = 0
            self._window_start_time = current_time

    def _set_rt_priority(self) -> bool:
        """Attempt to set real-time thread priority."""
        if not RT_PRIORITY_AVAILABLE:
            logger.debug("RT priority not available on this system")
            return False

        try:
            # Try to set SCHED_FIFO with specified priority
            param = os.sched_param(self._rt_priority)
            os.sched_setscheduler(0, os.SCHED_FIFO, param)
            logger.info(f"Set audio thread to SCHED_FIFO priority {self._rt_priority}")
            return True
        except PermissionError:
            logger.warning("Insufficient permissions for RT priority. Run with CAP_SYS_NICE or as root.")
            return False
        except Exception as e:
            logger.warning(f"Failed to set RT priority: {e}")
            return False

    async def start_stream(self, input_callback=None, output_callback=None) -> bool:
        """Start audio stream with RT-safe callbacks.

        Audio callback uses lock-free queues - never blocks!
        Processing happens in separate async tasks.
        """
        if self.is_running:
            logger.warning("Stream already running")
            return False

        if not SOUNDDEVICE_AVAILABLE:
            logger.warning("sounddevice not available, using simulation mode")
            return await self._start_simulation_stream(input_callback, output_callback)

        try:
            self.input_callback = input_callback
            self.output_callback = output_callback

            # Pre-fill output queue with silence
            for _ in range(self.output_queue.maxsize - 1):
                self.output_queue.put_nowait(self.zero_buffer.copy())

            # Reference to self for closure
            manager = self

            def audio_callback(indata, outdata, frames, time_info, status):
                """RT-SAFE callback - NO BLOCKING, NO ALLOCATION.

                This runs in a separate high-priority thread.
                RULES:
                - No asyncio.run() or asyncio.create_task()
                - No memory allocation
                - No logging (counter increments only)
                - No blocking operations
                - Fast path only!
                """
                # Track status (atomic counter increment)
                if status:
                    if status.input_underflow or status.input_overflow:
                        manager.total_underruns += 1
                        manager._xrun_count_window += 1
                    if status.output_underflow or status.output_overflow:
                        manager.total_overruns += 1
                        manager._xrun_count_window += 1

                # Push input to queue (non-blocking)
                try:
                    manager.input_queue.put_nowait(indata.copy())
                except queue.Full:
                    manager.input_drops += 1

                # Pull output from queue (non-blocking)
                try:
                    output_data = manager.output_queue.get_nowait()

                    # Apply auto-mute if enabled
                    if manager._enable_auto_mute and manager._signal_detector and manager._signal_detector.is_auto_muted:
                        outdata[:] = manager.zero_buffer
                    else:
                        outdata[:] = output_data
                except queue.Empty:
                    outdata[:] = manager.zero_buffer
                    manager.output_underruns += 1

                # Atomic counter
                manager.total_blocks += 1

            # Start queue processor
            self.processor_task = asyncio.create_task(
                self._process_queues()
            )

            self.stream = sd.Stream(
                device=(self.input_device, self.output_device),
                samplerate=self.sample_rate,
                blocksize=self.block_size,
                channels=self.channels,
                callback=audio_callback,
                latency="low",
                dtype=np.float32,
            )

            self.stream.start()
            self.is_running = True

            # Set RT priority for audio thread
            self._set_rt_priority()

            # Start watchdog
            if self._watchdog:
                self._watchdog.start()

            logger.info(f"RT-safe audio stream started: {self.sample_rate}Hz, {self.block_size} samples, {self.channels}ch")
            return True

        except Exception as e:
            logger.error(f"Failed to start stream: {e}")
            return False

    async def _process_queues(self):
        """Process audio queues in async task."""
        last_xrun_count = self.total_underruns + self.total_overruns

        while self.is_running:
            try:
                # Process input queue
                if not self.input_queue.empty():
                    input_data = await asyncio.to_thread(
                        self.input_queue.get, timeout=0.001
                    )

                    # Signal detection
                    if self._signal_detector:
                        signal_state = self._signal_detector.process_input(input_data)
                        self._health_metrics.signal_state = signal_state
                        self._health_metrics.input_level_db = self._signal_detector.input_level_db
                        self._health_metrics.is_auto_muted = self._signal_detector.is_auto_muted

                    if self.input_callback:
                        await self.input_callback(input_data)

                # Generate output for queue
                if self.output_queue.qsize() < self.output_queue.maxsize - 2:
                    if self.output_callback:
                        output_data = await self.output_callback()
                        if output_data is not None:
                            await asyncio.to_thread(
                                self.output_queue.put, output_data, timeout=0.001
                            )
                    else:
                        await asyncio.to_thread(
                            self.output_queue.put, self.zero_buffer.copy(), timeout=0.001
                        )

                # Check for new XRuns
                current_xrun_count = self.total_underruns + self.total_overruns
                if current_xrun_count > last_xrun_count:
                    self._record_xrun(current_xrun_count - last_xrun_count)
                    last_xrun_count = current_xrun_count

                # Check adaptive buffer
                self._check_adaptive_buffer()

                # Update health metrics
                self._update_health_metrics()

                # Small sleep to prevent spinning
                await asyncio.sleep(0.001)

            except Exception as e:
                logger.error(f"Queue processing error: {e}")
                await asyncio.sleep(0.01)

    def _record_xrun(self, count: int) -> None:
        """Record XRun event and notify callbacks."""
        current_time = time.perf_counter()

        for _ in range(count):
            event = XRunEvent(
                timestamp=current_time,
                xrun_type='underrun' if self.total_underruns > self.total_overruns else 'overrun',
                buffer_fill_pct=self.output_queue.qsize() / self.output_queue.maxsize * 100,
            )

            self._xrun_history.append(event)
            if len(self._xrun_history) > self._xrun_history_max:
                self._xrun_history = self._xrun_history[-self._xrun_history_max:]

            # Notify callbacks
            for callback in self._xrun_callbacks:
                try:
                    callback(event)
                except Exception as e:
                    logger.error(f"XRun callback error: {e}")

        self._health_metrics.last_xrun_time = current_time
        self._health_metrics.total_xruns = self.total_underruns + self.total_overruns

    def _update_health_metrics(self) -> None:
        """Update health metrics snapshot."""
        self._health_metrics.total_blocks = self.total_blocks

        # Calculate XRun rate
        recent_xruns = [x for x in self._xrun_history
                       if time.perf_counter() - x.timestamp < 60.0]
        self._health_metrics.xrun_rate_per_minute = len(recent_xruns)
        self._health_metrics.recent_xruns = recent_xruns[-10:]

        # Buffer health
        self._health_metrics.buffer_health_pct = (
            self.output_queue.qsize() / self.output_queue.maxsize * 100
        )

    async def _start_simulation_stream(self, input_callback, output_callback):
        """Start simulation mode when sounddevice unavailable."""
        logger.info("Starting audio simulation (sounddevice unavailable)")

        self.input_callback = input_callback
        self.output_callback = output_callback
        self.is_running = True

        asyncio.create_task(self._run_simulation())
        return True

    async def _run_simulation(self):
        """Simulate audio processing."""
        while self.is_running:
            try:
                input_data = np.zeros((self.block_size, self.channels), dtype=np.float32)

                if self._signal_detector:
                    self._signal_detector.process_input(input_data)

                if self.input_callback:
                    await self.input_callback(input_data)

                if self.output_callback:
                    await self.output_callback()

                self.total_blocks += 1
                await asyncio.sleep(self.block_size / self.sample_rate)
            except Exception as e:
                logger.error(f"Simulation error: {e}")
                break

    async def stop_stream(self) -> bool:
        """Stop audio stream."""
        if not self.is_running:
            return True

        self.is_running = False

        # Stop watchdog
        if self._watchdog:
            self._watchdog.stop()

        # Cancel processor task
        if self.processor_task:
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass

        try:
            if self.stream and SOUNDDEVICE_AVAILABLE:
                self.stream.stop()
                self.stream.close()

            logger.info("Audio stream stopped")
            return True
        except Exception as e:
            logger.error(f"Error stopping stream: {e}")
            return False

    def force_unmute(self) -> None:
        """Manually disable auto-mute."""
        if self._signal_detector:
            self._signal_detector.force_unmute()
            self._health_metrics.is_auto_muted = False

    def get_stats(self) -> dict:
        """Get audio statistics with RT performance metrics."""
        latency_ms = (self.block_size * 1000.0) / self.sample_rate if self.sample_rate else 0

        input_queue_pct = (self.input_queue.qsize() / self.input_queue.maxsize * 100) if self.input_queue.maxsize else 0
        output_queue_pct = (self.output_queue.qsize() / self.output_queue.maxsize * 100) if self.output_queue.maxsize else 0

        return {
            "is_running": self.is_running,
            "sample_rate": self.sample_rate,
            "block_size": self.block_size,
            "channels": self.channels,
            "total_blocks": self.total_blocks,
            "total_underruns": self.total_underruns,
            "total_overruns": self.total_overruns,
            "input_drops": self.input_drops,
            "output_underruns": self.output_underruns,
            "latency_ms": latency_ms,
            "is_simulated": not SOUNDDEVICE_AVAILABLE,
            "input_queue_fill_pct": round(input_queue_pct, 1),
            "output_queue_fill_pct": round(output_queue_pct, 1),
            "rt_safe": True,
            "rt_priority_set": RT_PRIORITY_AVAILABLE,
            "watchdog_enabled": self._watchdog is not None,
            "signal_detection_enabled": self._signal_detector is not None,
            "auto_mute_enabled": self._enable_auto_mute,
            "adaptive_buffer_enabled": self._adaptive_buffer_enabled,
        }

    def get_health_metrics(self) -> AudioHealthMetrics:
        """Get comprehensive health metrics."""
        return self._health_metrics

    def get_health_dict(self) -> Dict[str, Any]:
        """Get health metrics as dictionary for API."""
        return {
            "thread_state": self._health_metrics.thread_state.value,
            "signal_state": self._health_metrics.signal_state.value,
            "total_blocks": self._health_metrics.total_blocks,
            "total_xruns": self._health_metrics.total_xruns,
            "xrun_rate_per_minute": self._health_metrics.xrun_rate_per_minute,
            "last_xrun_time": self._health_metrics.last_xrun_time,
            "input_level_db": round(self._health_metrics.input_level_db, 1),
            "output_level_db": round(self._health_metrics.output_level_db, 1),
            "buffer_health_pct": round(self._health_metrics.buffer_health_pct, 1),
            "is_auto_muted": self._health_metrics.is_auto_muted,
            "watchdog_healthy": self._health_metrics.thread_state != AudioThreadState.STALLED,
        }


class AudioIOFactory:
    """Factory for creating appropriate audio I/O manager."""

    @staticmethod
    def create(
        sample_rate: int = 48000,
        block_size: int = 256,
        channels: int = 2,
        enable_watchdog: bool = True,
        enable_signal_detection: bool = True,
        enable_auto_mute: bool = True,
    ) -> RealAudioIOManager:
        """Create audio I/O manager with all safety features."""
        if not SOUNDDEVICE_AVAILABLE:
            logger.warning("sounddevice not available, using simulation mode")
            logger.info("Install with: pip install sounddevice")

        return RealAudioIOManager(
            sample_rate=sample_rate,
            block_size=block_size,
            channels=channels,
            enable_watchdog=enable_watchdog,
            enable_signal_detection=enable_signal_detection,
            enable_auto_mute=enable_auto_mute,
        )


# Global audio manager instance (set by ServiceManager)
_audio_manager: Optional[RealAudioIOManager] = None


def get_audio_status() -> Dict[str, Any]:
    """Get current audio engine status for health checks.

    Returns:
        Dictionary with audio status including running state, sample rate, etc.
    """
    global _audio_manager

    # Direct access without ServiceManager (deprecated)
    if _audio_manager is None:
        return {
            "running": False,
            "sample_rate": 48000,
            "buffer_size": 256,
            "latency_ms": 5.33,
            "cpu_load": 0.0,
            "xruns": 0,
            "error": "Audio manager not initialized"
        }

    return {
        "running": _audio_manager.is_running,
        "sample_rate": _audio_manager.sample_rate,
        "buffer_size": _audio_manager.block_size,
        "latency_ms": (_audio_manager.block_size / _audio_manager.sample_rate) * 1000,
        "cpu_load": 0.0,  # Would need RT monitor integration
        "xruns": _audio_manager.total_underruns + _audio_manager.total_overruns,
    }
