"""
Advanced Integration Tests
Tests for audio processing, plugin management, and system integration.
"""

import pytest
import asyncio
from typing import List


class TestAudioBuffers:
    """Test audio buffer operations."""

    @pytest.mark.asyncio
    async def test_ring_buffer_write_read(self):
        """Test circular buffer write and read."""
        from app.services.audio_buffers import RingBuffer
        
        buffer = RingBuffer(256, channels=2)
        
        # Write some data
        test_data = [[0.1] * 64, [0.2] * 64]
        written = buffer.write(test_data)
        assert written == 64
        assert buffer.available() == 64
        
        # Read it back
        read_data = buffer.read(64)
        assert read_data is not None
        assert len(read_data) == 2
        assert buffer.available() == 0

    @pytest.mark.asyncio
    async def test_ring_buffer_overflow(self):
        """Test buffer overflow handling."""
        from app.services.audio_buffers import RingBuffer
        
        buffer = RingBuffer(256, channels=2)
        
        # Fill buffer
        test_data = [[0.1] * 256, [0.2] * 256]
        buffer.write(test_data)
        
        # Try to overfill - should fail
        overflow_data = [[0.3] * 100, [0.4] * 100]
        written = buffer.write(overflow_data)
        assert written == 0  # Should not write

    @pytest.mark.asyncio
    async def test_audio_block_gain(self):
        """Test audio block gain application."""
        from app.services.audio_buffers import AudioBlock
        
        # Test data: -6dB gain
        data = [[0.5] * 256, [0.5] * 256]
        block = AudioBlock(data, 2, 48000)
        
        # Apply -6dB gain
        processed = block.apply_gain(-6.0)
        assert processed.get_level() < block.get_level()

    @pytest.mark.asyncio
    async def test_audio_block_mix(self):
        """Test cross-fading two blocks."""
        from app.services.audio_buffers import AudioBlock
        
        block1 = AudioBlock([[1.0] * 100, [1.0] * 100], 2, 48000)
        block2 = AudioBlock([[0.0] * 100, [0.0] * 100], 2, 48000)
        
        # Mix 50/50
        mixed = block1.apply_mix(block2, 0.5)
        assert mixed.get_level() < block1.get_level()

    @pytest.mark.asyncio
    async def test_audio_block_resample(self):
        """Test audio resampling."""
        from app.services.audio_buffers import AudioBlock
        
        data = [[0.5] * 480, [0.5] * 480]
        block = AudioBlock(data, 2, 48000)
        
        # Resample to 96kHz
        resampled = block.resample(96000)
        assert resampled.sample_rate == 96000
        assert resampled.samples > 0

    @pytest.mark.asyncio
    async def test_compressor(self):
        """Test dynamic range compressor."""
        from app.services.audio_buffers import SimpleCompressor, AudioBlock
        
        compressor = SimpleCompressor(threshold=-20.0, ratio=4.0)
        
        # Test with signal above threshold
        data = [[0.8] * 256, [0.8] * 256]
        block = AudioBlock(data, 2, 48000)
        
        compressed = compressor.process(block)
        assert compressed.get_peak() <= 1.0


class TestAdvancedPlugins:
    """Test advanced plugin management."""

    @pytest.mark.asyncio
    async def test_preset_save_load(self):
        """Test saving and loading presets."""
        from app.services.advanced_plugins import AdvancedPluginManager
        
        manager = AdvancedPluginManager()
        
        # Register a plugin
        params = [
            {"index": 0, "name": "Gain", "min": -24.0, "max": 24.0, "value": 0.0},
            {"index": 1, "name": "Tone", "min": 0.0, "max": 100.0, "value": 50.0},
        ]
        await manager.register_plugin("http://example.com/amp", "Amp", "Amplifier", params)
        
        # Modify parameters and save preset
        await manager.set_parameter("http://example.com/amp", 0, 6.0)
        await manager.set_parameter("http://example.com/amp", 1, 75.0)
        
        preset = await manager.save_preset("http://example.com/amp", "Bright")
        assert preset is not None
        assert preset.name == "Bright"
        
        # Change parameters
        await manager.set_parameter("http://example.com/amp", 0, -12.0)
        await manager.set_parameter("http://example.com/amp", 1, 25.0)
        
        # Load preset
        loaded = await manager.load_preset("http://example.com/amp", "Bright")
        assert loaded is True
        
        # Verify parameters restored
        val0 = await manager.get_parameter("http://example.com/amp", 0)
        val1 = await manager.get_parameter("http://example.com/amp", 1)
        assert val0 == 6.0
        assert val1 == 75.0

    @pytest.mark.asyncio
    async def test_plugin_ordering(self):
        """Test plugin chain ordering."""
        from app.services.advanced_plugins import AdvancedPluginManager
        
        manager = AdvancedPluginManager()
        
        # Register plugins
        for i, name in enumerate(["Amp", "Reverb", "Delay"]):
            uri = f"http://example.com/{name.lower()}"
            await manager.register_plugin(uri, name, name, [])
            await manager.load_plugin(uri)
        
        # Check order
        plugins = await manager.get_all_plugins()
        assert len(plugins) == 3
        assert plugins[0]["name"] == "Amp"
        assert plugins[1]["name"] == "Reverb"
        assert plugins[2]["name"] == "Delay"
        
        # Reorder
        new_order = [
            "http://example.com/delay",
            "http://example.com/amp",
            "http://example.com/reverb",
        ]
        await manager.reorder_plugins(new_order)
        
        plugins = await manager.get_all_plugins()
        assert plugins[0]["name"] == "Delay"
        assert plugins[1]["name"] == "Amp"
        assert plugins[2]["name"] == "Reverb"

    @pytest.mark.asyncio
    async def test_parameter_automation(self):
        """Test parameter automation."""
        from app.services.advanced_plugins import AdvancedPluginManager
        
        manager = AdvancedPluginManager()
        params = [{"index": 0, "name": "Gain", "min": -24.0, "max": 24.0, "value": 0.0}]
        await manager.register_plugin("http://example.com/amp", "Amp", "Amplifier", params)
        
        # Start automation
        started = await manager.start_automation(
            "http://example.com/amp", 0,
            start_value=0.0, end_value=12.0, duration=2.0, shape="linear"
        )
        assert started is True
        
        # Stop automation
        stopped = await manager.stop_automation("http://example.com/amp", 0)
        assert stopped is True

    @pytest.mark.asyncio
    async def test_chain_export_import(self):
        """Test chain configuration export/import."""
        from app.services.advanced_plugins import AdvancedPluginManager
        
        manager = AdvancedPluginManager()
        
        # Create chain with parameters
        params = [{"index": 0, "name": "Gain", "min": -24.0, "max": 24.0, "value": 0.0}]
        await manager.register_plugin("http://example.com/amp", "Amp", "Amplifier", params)
        await manager.load_plugin("http://example.com/amp")
        await manager.set_parameter("http://example.com/amp", 0, 6.0)
        
        # Export
        config = await manager.export_chain_config()
        assert "http://example.com/amp" in config
        assert '"0": 6.0' in config
        
        # Import to new manager
        manager2 = AdvancedPluginManager()
        params2 = [{"index": 0, "name": "Gain", "min": -24.0, "max": 24.0, "value": 0.0}]
        await manager2.register_plugin("http://example.com/amp", "Amp", "Amplifier", params2)
        
        imported = await manager2.import_chain_config(config)
        assert imported is True
        
        # Verify parameter value
        val = await manager2.get_parameter("http://example.com/amp", 0)
        assert val == 6.0


class TestTUIScreens:
    """Test TUI screen functionality."""

    @pytest.mark.asyncio
    async def test_signal_chain_screen(self):
        """Test signal chain screen."""
        from tui.screens import SignalChainScreen
        
        screen = SignalChainScreen()
        
        # Add chain
        chain = screen.add_chain("Test Chain")
        assert chain.name == "Test Chain"
        assert len(screen.chains) == 1
        
        # Add plugin to chain
        added = screen.add_plugin_to_chain(chain.id, "http://example.com/amp")
        assert added is True
        assert len(chain.plugins) == 1
        
        # Activate chain
        activated = screen.activate_chain(chain.id)
        assert activated is True
        assert chain.is_active is True

    @pytest.mark.asyncio
    async def test_plugin_browser_screen(self):
        """Test plugin browser screen."""
        from tui.screens import PluginBrowserScreen
        
        screen = PluginBrowserScreen()
        
        # Discover plugins
        await screen.discover_plugins()
        assert len(screen.available_plugins) == 3
        
        # Load a plugin
        loaded = await screen.load_plugin(screen.available_plugins[0].uri)
        assert loaded is True
        assert len(screen.loaded_plugins) == 1

    @pytest.mark.asyncio
    async def test_midi_monitor_screen(self):
        """Test MIDI monitor screen."""
        from tui.screens import MIDIMonitorScreen
        
        screen = MIDIMonitorScreen()
        
        # Log MIDI message
        await screen.log_message(1, 7, 127)
        assert len(screen.messages) == 1
        
        # Add mapping
        mapped = await screen.add_mapping(1, 7, "http://example.com/amp", 0)
        assert mapped is True
        
        # Enable learn mode
        await screen.enable_learn("http://example.com/amp", 0)
        assert screen.learn_mode is True
        
        # Disable learn mode
        await screen.disable_learn()
        assert screen.learn_mode is False

    @pytest.mark.asyncio
    async def test_system_dashboard_screen(self):
        """Test system dashboard screen."""
        from tui.screens import SystemDashboardScreen
        
        screen = SystemDashboardScreen()
        
        # Update metrics
        metrics = {
            "cpu_percent": 45.5,
            "memory_mb": 256.0,
            "audio_running": True,
            "plugins_loaded": 3,
            "uptime_seconds": 3661.0,
            "sample_rate": 48000,
            "buffer_size": 256,
        }
        await screen.update_metrics(metrics)
        
        assert screen.cpu_percent == 45.5
        assert screen.audio_running is True
        
        # Test rendering
        output = await screen.render()
        assert "45.5%" in output
        assert "RUNNING" in output


class TestSystemIntegration:
    """Integration tests across multiple systems."""

    @pytest.mark.asyncio
    async def test_plugin_to_chain_integration(self):
        """Test plugin loading into chain."""
        from app.services.plugin_host_enhanced import EnhancedPluginHostService
        from tui.screens import SignalChainScreen
        
        # Service: Discover and load plugin
        plugin_service = EnhancedPluginHostService()
        plugins = await plugin_service.discover()
        assert len(plugins) > 0
        
        plugin = await plugin_service.load(plugins[0]["uri"])
        assert plugin is not None
        
        # TUI: Create chain and add plugin
        screen = SignalChainScreen()
        chain = screen.add_chain("Processing Chain")
        added = screen.add_plugin_to_chain(chain.id, plugin.uri)
        assert added is True

    @pytest.mark.asyncio
    async def test_audio_processing_pipeline(self):
        """Test complete audio processing pipeline."""
        from app.services.audio_buffers import EnhancedAudioProcessorService
        
        processor = EnhancedAudioProcessorService()
        await processor.start()
        
        # Generate test audio
        test_audio = [[0.1 * (i % 100) / 100.0 for i in range(256)],
                      [0.1 * (i % 100) / 100.0 for i in range(256)]]
        
        # Process through chain
        output = await processor.process_chain(test_audio)
        assert len(output) == 2
        assert len(output[0]) == 256
        
        # Check metrics
        metrics = await processor.get_metrics()
        assert metrics["processed_blocks"] == 1
        assert metrics["sample_rate"] == 48000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
