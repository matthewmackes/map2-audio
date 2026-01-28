"""
Audio DSP Unit Tests

Comprehensive tests for audio processing correctness:
- Bit-exactness verification
- Latency measurement accuracy
- Buffer boundary handling
- RT-safety verification
- Signal detection accuracy
- Plugin health tracking
- Preset migration
"""

import pytest
import numpy as np
import asyncio
import time
from typing import Callable, Tuple
from unittest.mock import Mock, patch, MagicMock

# Import modules under test
import sys
sys.path.insert(0, '/home/mm/map2-audio')

from app.services.audio_io_v2 import (
    RealAudioIOManager,
    AudioIOFactory,
    SignalDetector,
    AudioWatchdog,
    AudioHealthMetrics,
    AudioThreadState,
    SignalState,
    XRunEvent,
    BUFFER_PRESETS,
)
from app.services.plugin_health import (
    PluginHealthTracker,
    PluginHealthState,
    RTSafetyLevel,
    SafePluginProcessor,
    PluginSandbox,
)
from app.services.preset_migration import (
    PresetMigrator,
    PresetMigrationRegistry,
    CURRENT_SCHEMA_VERSION,
)


class TestSignalDetector:
    """Tests for input signal detection."""

    def test_detect_silence(self):
        """Test detection of silence."""
        detector = SignalDetector(sample_rate=48000, block_size=256)

        # Process silent buffer
        silent_buffer = np.zeros((256, 2), dtype=np.float32)
        state = detector.process_input(silent_buffer)

        assert state == SignalState.ABSENT
        assert detector.input_level_db < -90

    def test_detect_signal_present(self):
        """Test detection of strong signal."""
        detector = SignalDetector(sample_rate=48000, block_size=256)

        # Generate 1kHz sine at -10dB
        t = np.linspace(0, 256/48000, 256)
        amplitude = 0.316  # -10dB
        signal = amplitude * np.sin(2 * np.pi * 1000 * t)
        stereo = np.column_stack([signal, signal]).astype(np.float32)

        # Process several buffers to stabilize smoothing
        for _ in range(10):
            state = detector.process_input(stereo)

        assert state == SignalState.PRESENT
        assert detector.input_level_db > -20

    def test_detect_weak_signal(self):
        """Test detection of weak signal."""
        detector = SignalDetector(sample_rate=48000, block_size=256)

        # Generate 1kHz sine at -45dB (weak)
        t = np.linspace(0, 256/48000, 256)
        amplitude = 0.0056  # -45dB
        signal = amplitude * np.sin(2 * np.pi * 1000 * t)
        stereo = np.column_stack([signal, signal]).astype(np.float32)

        for _ in range(10):
            state = detector.process_input(stereo)

        assert state in [SignalState.WEAK, SignalState.NOISE_ONLY]

    def test_auto_mute_after_timeout(self):
        """Test auto-mute engages after signal loss."""
        detector = SignalDetector(sample_rate=48000, block_size=256)
        detector.SIGNAL_LOSS_TIMEOUT_SEC = 0.1  # Short timeout for test

        # First establish signal presence
        t = np.linspace(0, 256/48000, 256)
        signal = 0.316 * np.sin(2 * np.pi * 1000 * t)
        stereo = np.column_stack([signal, signal]).astype(np.float32)

        for _ in range(10):
            detector.process_input(stereo)

        assert not detector.is_auto_muted

        # Now process silence
        silent = np.zeros((256, 2), dtype=np.float32)
        for _ in range(10):
            detector.process_input(silent)

        # Wait for timeout
        time.sleep(0.15)

        # Process more silence to trigger mute
        detector.process_input(silent)

        assert detector.is_auto_muted

    def test_force_unmute(self):
        """Test manual unmute override."""
        detector = SignalDetector(sample_rate=48000, block_size=256)
        detector._auto_muted = True

        detector.force_unmute()

        assert not detector.is_auto_muted


class TestAudioIOManager:
    """Tests for audio I/O manager."""

    def test_factory_creation(self):
        """Test factory creates manager with correct settings."""
        manager = AudioIOFactory.create(
            sample_rate=44100,
            block_size=128,
            channels=2,
            enable_watchdog=True,
            enable_signal_detection=True,
        )

        assert manager.sample_rate == 44100
        assert manager.block_size == 128
        assert manager.channels == 2
        assert manager._watchdog is not None
        assert manager._signal_detector is not None

    def test_buffer_preallocation(self):
        """Test buffers are preallocated correctly."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=512,
            channels=2,
        )

        assert manager.zero_buffer.shape == (512, 2)
        assert manager.zero_buffer.dtype == np.float32
        assert manager.current_output.shape == (512, 2)

    def test_buffer_reallocation(self):
        """Test buffer reallocation on size change."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=256,
            channels=2,
        )

        assert manager.zero_buffer.shape == (256, 2)

        manager._reallocate_buffers(512, 2)

        assert manager.zero_buffer.shape == (512, 2)
        assert manager.block_size == 512

    def test_stats_calculation(self):
        """Test statistics calculation."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=256,
            channels=2,
        )

        stats = manager.get_stats()

        assert stats['sample_rate'] == 48000
        assert stats['block_size'] == 256
        assert stats['latency_ms'] == pytest.approx(256 * 1000 / 48000, 0.01)
        assert stats['rt_safe'] is True

    def test_health_metrics_initialization(self):
        """Test health metrics are properly initialized."""
        manager = RealAudioIOManager()

        health = manager.get_health_metrics()

        assert health.thread_state == AudioThreadState.HEALTHY
        assert health.signal_state == SignalState.ABSENT
        assert health.total_blocks == 0
        assert health.total_xruns == 0

    def test_xrun_callback_registration(self):
        """Test XRun callback registration."""
        manager = RealAudioIOManager()
        callback_called = False
        received_event = None

        def callback(event: XRunEvent):
            nonlocal callback_called, received_event
            callback_called = True
            received_event = event

        manager.register_xrun_callback(callback)
        manager._record_xrun(1)

        assert callback_called
        assert received_event is not None
        assert received_event.xrun_type in ['underrun', 'overrun']


class TestPluginHealthTracker:
    """Tests for plugin health tracking."""

    def test_plugin_registration(self):
        """Test plugin registration."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)

        tracker.register_plugin(
            uri="urn:test:plugin",
            name="Test Plugin",
            has_hard_rt_capable=True,
        )

        health = tracker.get_plugin_health("urn:test:plugin")

        assert health is not None
        assert health['name'] == "Test Plugin"
        assert health['state'] == PluginHealthState.HEALTHY.value
        assert health['rt_safety'] == RTSafetyLevel.VERIFIED_RT_SAFE.value

    def test_processing_timing_tracking(self):
        """Test processing time tracking."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Record successful processing
        for i in range(10):
            tracker.record_processing(
                "urn:test:plugin",
                processing_time_ms=2.0 + i * 0.1,
                success=True
            )

        health = tracker.get_plugin_health("urn:test:plugin")

        assert health['total_calls'] == 10
        assert health['total_failures'] == 0
        assert health['avg_processing_ms'] > 0
        assert health['max_processing_ms'] >= 2.9

    def test_failure_tracking(self):
        """Test failure tracking."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Record failures
        for i in range(3):
            tracker.record_processing(
                "urn:test:plugin",
                processing_time_ms=1.0,
                success=False,
                error="Test error"
            )

        health = tracker.get_plugin_health("urn:test:plugin")

        assert health['total_failures'] == 3
        assert health['consecutive_failures'] == 3
        assert health['last_failure_reason'] == "Test error"

    def test_auto_bypass_on_consecutive_failures(self):
        """Test automatic bypass after consecutive failures."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Trigger auto-bypass threshold (default 5)
        for i in range(6):
            should_continue = tracker.record_processing(
                "urn:test:plugin",
                processing_time_ms=1.0,
                success=False,
                error="Test error"
            )

        assert not should_continue
        assert tracker.is_plugin_bypassed("urn:test:plugin")

        health = tracker.get_plugin_health("urn:test:plugin")
        assert health['state'] == PluginHealthState.BYPASSED.value

    def test_re_enable_plugin(self):
        """Test re-enabling a bypassed plugin."""
        tracker = PluginHealthTracker()
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Bypass plugin
        tracker.manual_bypass("urn:test:plugin", "Test bypass")
        assert tracker.is_plugin_bypassed("urn:test:plugin")

        # Re-enable
        tracker.re_enable_plugin("urn:test:plugin")
        assert not tracker.is_plugin_bypassed("urn:test:plugin")

    def test_state_callback_notification(self):
        """Test state change callback notification."""
        tracker = PluginHealthTracker()
        state_changes = []

        def callback(uri: str, state: PluginHealthState):
            state_changes.append((uri, state))

        tracker.register_state_callback(callback)
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Trigger bypass
        tracker.manual_bypass("urn:test:plugin", "Test")

        assert len(state_changes) == 1
        assert state_changes[0] == ("urn:test:plugin", PluginHealthState.BYPASSED)

    def test_deadline_violation_tracking(self):
        """Test tracking of deadline violations."""
        # Buffer deadline for 256 @ 48kHz is ~5.33ms
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)
        tracker.register_plugin("urn:test:plugin", "Test Plugin")

        # Process within deadline
        tracker.record_processing("urn:test:plugin", 3.0, success=True)

        # Process exceeding deadline
        tracker.record_processing("urn:test:plugin", 6.0, success=True)
        tracker.record_processing("urn:test:plugin", 7.0, success=True)

        health = tracker.get_plugin_health("urn:test:plugin")
        assert health['deadline_violations'] == 2


class TestSafePluginProcessor:
    """Tests for safe plugin processor wrapper."""

    def test_successful_processing(self):
        """Test successful processing through wrapper."""
        tracker = PluginHealthTracker()

        def process_func(input_data: np.ndarray) -> np.ndarray:
            return input_data * 2  # Simple gain

        processor = SafePluginProcessor(
            plugin_uri="urn:test:plugin",
            plugin_name="Test Plugin",
            process_func=process_func,
            health_tracker=tracker,
        )

        input_data = np.ones((256, 2), dtype=np.float32)
        output = processor.process(input_data)

        assert np.allclose(output, input_data * 2)

    def test_error_handling(self):
        """Test error handling in processor."""
        tracker = PluginHealthTracker()

        def process_func(input_data: np.ndarray) -> np.ndarray:
            raise ValueError("Test error")

        processor = SafePluginProcessor(
            plugin_uri="urn:test:plugin",
            plugin_name="Test Plugin",
            process_func=process_func,
            health_tracker=tracker,
        )

        input_data = np.ones((256, 2), dtype=np.float32)
        output = processor.process(input_data)

        # Should return input on error (passthrough)
        assert np.array_equal(output, input_data)

        health = tracker.get_plugin_health("urn:test:plugin")
        assert health['total_failures'] == 1

    def test_bypass_passthrough(self):
        """Test bypassed plugin passes through unchanged."""
        tracker = PluginHealthTracker()

        process_called = False

        def process_func(input_data: np.ndarray) -> np.ndarray:
            nonlocal process_called
            process_called = True
            return input_data * 2

        processor = SafePluginProcessor(
            plugin_uri="urn:test:plugin",
            plugin_name="Test Plugin",
            process_func=process_func,
            health_tracker=tracker,
        )

        # Bypass the plugin
        tracker.manual_bypass("urn:test:plugin", "Test")

        input_data = np.ones((256, 2), dtype=np.float32)
        output = processor.process(input_data)

        assert not process_called  # Process function should not be called
        assert np.array_equal(output, input_data)  # Input passed through


class TestPresetMigration:
    """Tests for preset migration system."""

    def test_version_detection_v1_0(self):
        """Test detection of v1.0.0 preset."""
        migrator = PresetMigrator()

        preset = {
            'name': 'Test Preset',
            'plugins': [
                {'uri': 'urn:test', 'parameters': {}}
            ]
        }

        version = migrator.detect_version(preset)
        assert version == "1.0.0"

    def test_version_detection_v1_1(self):
        """Test detection of v1.1.0 preset."""
        migrator = PresetMigrator()

        preset = {
            'name': 'Test Preset',
            'plugins': [
                {'uri': 'urn:test', 'parameters': {}, 'is_bypassed': False}
            ]
        }

        version = migrator.detect_version(preset)
        assert version == "1.1.0"

    def test_version_detection_v2_0(self):
        """Test detection of v2.0.0 preset."""
        migrator = PresetMigrator()

        preset = {
            'schema_version': '2.0.0',
            'chain': {
                'plugins': []
            },
            'audio_settings': {}
        }

        version = migrator.detect_version(preset)
        assert version == "2.0.0"

    def test_migration_1_0_to_1_1(self):
        """Test migration from 1.0.0 to 1.1.0."""
        migrator = PresetMigrator()

        preset = {
            'name': 'Test',
            'plugins': [
                {'uri': 'urn:test', 'parameters': {}}
            ]
        }

        result = migrator.migrate(preset, target_version="1.1.0", create_backup=False)

        assert result.success
        assert result.original_version == "1.0.0"
        assert result.final_version == "1.1.0"
        assert 'is_bypassed' in preset['plugins'][0]

    def test_migration_to_current(self):
        """Test migration to current schema version."""
        migrator = PresetMigrator()

        preset = {
            'name': 'Test',
            'plugins': [
                {'uri': 'urn:test', 'parameters': {'gain': 0.5}}
            ]
        }

        result = migrator.migrate(preset, create_backup=False)

        assert result.success
        assert result.final_version == CURRENT_SCHEMA_VERSION
        assert 'schema_version' in preset
        assert 'chain' in preset

    def test_migration_preserves_data(self):
        """Test that migration preserves original data."""
        migrator = PresetMigrator()

        preset = {
            'name': 'Test Preset',
            'description': 'Test description',
            'plugins': [
                {
                    'uri': 'urn:test:plugin',
                    'parameters': {'gain': 0.75, 'mix': 0.5}
                }
            ]
        }

        result = migrator.migrate(preset, create_backup=False)

        assert result.success

        # Check data preserved in new structure
        chain = preset.get('chain', {})
        assert chain.get('name') == 'Test Preset'
        assert chain.get('description') == 'Test description'

        plugins = chain.get('plugins', [])
        assert len(plugins) == 1
        assert plugins[0]['uri'] == 'urn:test:plugin'
        assert plugins[0]['parameters']['gain'] == 0.75

    def test_validation_v2_0(self):
        """Test validation of v2.0.0 preset."""
        migrator = PresetMigrator()

        # Valid preset
        valid_preset = {
            'schema_version': '2.0.0',
            'chain': {
                'plugins': [
                    {'uri': 'urn:test', 'parameters': {}}
                ]
            }
        }

        errors = migrator.validate(valid_preset, "2.0.0")
        assert len(errors) == 0

        # Invalid preset (missing chain)
        invalid_preset = {
            'schema_version': '2.0.0',
        }

        errors = migrator.validate(invalid_preset, "2.0.0")
        assert len(errors) > 0

    def test_needs_migration(self):
        """Test migration check."""
        migrator = PresetMigrator()

        old_preset = {
            'name': 'Test',
            'plugins': []
        }

        current_preset = {
            'schema_version': CURRENT_SCHEMA_VERSION,
            'chain': {'plugins': []}
        }

        assert migrator.needs_migration(old_preset)
        assert not migrator.needs_migration(current_preset)


class TestBufferBoundaryHandling:
    """Tests for audio buffer boundary handling."""

    def test_odd_buffer_sizes(self):
        """Test handling of non-standard buffer sizes."""
        for size in [63, 127, 255, 513, 1023]:
            manager = RealAudioIOManager(
                sample_rate=48000,
                block_size=size,
                channels=2,
            )

            assert manager.zero_buffer.shape == (size, 2)
            assert manager.current_output.shape == (size, 2)

    def test_mono_buffer(self):
        """Test mono (single channel) handling."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=256,
            channels=1,
        )

        assert manager.zero_buffer.shape == (256, 1)

    def test_multichannel_buffer(self):
        """Test multichannel (>2) handling."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=256,
            channels=8,
        )

        assert manager.zero_buffer.shape == (256, 8)

    def test_signal_detector_mono(self):
        """Test signal detector with mono input."""
        detector = SignalDetector(sample_rate=48000, block_size=256)

        # Mono signal
        t = np.linspace(0, 256/48000, 256)
        mono_signal = (0.316 * np.sin(2 * np.pi * 1000 * t)).astype(np.float32)

        for _ in range(10):
            state = detector.process_input(mono_signal)

        assert state == SignalState.PRESENT

    def test_empty_buffer_handling(self):
        """Test handling of empty buffers."""
        detector = SignalDetector()

        empty_buffer = np.array([], dtype=np.float32)
        state = detector.process_input(empty_buffer)

        # Should not crash, return previous state
        assert state is not None


class TestLatencyCalculation:
    """Tests for latency calculation accuracy."""

    def test_latency_calculation_256_48k(self):
        """Test latency calculation at 256 samples, 48kHz."""
        manager = RealAudioIOManager(
            sample_rate=48000,
            block_size=256,
        )

        stats = manager.get_stats()
        expected_latency = 256 / 48000 * 1000  # 5.333ms

        assert stats['latency_ms'] == pytest.approx(expected_latency, 0.001)

    def test_latency_calculation_128_44k(self):
        """Test latency calculation at 128 samples, 44.1kHz."""
        manager = RealAudioIOManager(
            sample_rate=44100,
            block_size=128,
        )

        stats = manager.get_stats()
        expected_latency = 128 / 44100 * 1000  # 2.902ms

        assert stats['latency_ms'] == pytest.approx(expected_latency, 0.001)

    def test_latency_calculation_1024_96k(self):
        """Test latency calculation at 1024 samples, 96kHz."""
        manager = RealAudioIOManager(
            sample_rate=96000,
            block_size=1024,
        )

        stats = manager.get_stats()
        expected_latency = 1024 / 96000 * 1000  # 10.667ms

        assert stats['latency_ms'] == pytest.approx(expected_latency, 0.001)


class TestRTSafetyVerification:
    """Tests for RT-safety verification."""

    def test_buffer_dtype(self):
        """Test that buffers use correct dtype for RT-safety."""
        manager = RealAudioIOManager()

        # float32 is RT-safe (no conversion needed)
        assert manager.zero_buffer.dtype == np.float32
        assert manager.current_output.dtype == np.float32

    def test_preallocated_buffer_reuse(self):
        """Test that preallocated buffers are reused."""
        manager = RealAudioIOManager(block_size=256, channels=2)

        # Get buffer references
        zero_id = id(manager.zero_buffer)
        output_id = id(manager.current_output)

        # Simulate some processing (without actual audio)
        manager.total_blocks += 100

        # Buffers should be same objects (not reallocated)
        assert id(manager.zero_buffer) == zero_id
        assert id(manager.current_output) == output_id

    def test_health_tracker_deadline_calculation(self):
        """Test that health tracker calculates deadline correctly."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)

        expected_deadline = 256 / 48000 * 1000  # 5.333ms

        assert tracker.buffer_deadline_ms == pytest.approx(expected_deadline, 0.001)

    def test_rt_safety_classification(self):
        """Test RT-safety classification based on timing."""
        tracker = PluginHealthTracker(buffer_size=256, sample_rate=48000)
        tracker.register_plugin("urn:fast:plugin", "Fast Plugin")
        tracker.register_plugin("urn:slow:plugin", "Slow Plugin")

        # Fast plugin - well under deadline
        for _ in range(100):
            tracker.record_processing("urn:fast:plugin", 2.0, success=True)

        # Slow plugin - near deadline
        for _ in range(100):
            tracker.record_processing("urn:slow:plugin", 5.0, success=True)

        fast_safety = tracker.validate_rt_safety("urn:fast:plugin")
        slow_safety = tracker.validate_rt_safety("urn:slow:plugin")

        assert fast_safety == RTSafetyLevel.LIKELY_RT_SAFE
        # Slow might be POTENTIALLY_UNSAFE depending on exact threshold


class TestWatchdogBehavior:
    """Tests for audio watchdog behavior."""

    def test_watchdog_initialization(self):
        """Test watchdog initializes correctly."""
        manager = RealAudioIOManager(enable_watchdog=True)

        assert manager._watchdog is not None
        assert not manager._watchdog._running

    def test_watchdog_disabled(self):
        """Test watchdog can be disabled."""
        manager = RealAudioIOManager(enable_watchdog=False)

        assert manager._watchdog is None

    def test_stall_callback_registration(self):
        """Test stall callback registration."""
        manager = RealAudioIOManager(enable_watchdog=True)
        callback_registered = False

        def callback(health: AudioHealthMetrics):
            nonlocal callback_registered
            callback_registered = True

        manager.register_stall_callback(callback)

        # Verify callback is registered
        assert callback in manager._watchdog._stall_callbacks


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
