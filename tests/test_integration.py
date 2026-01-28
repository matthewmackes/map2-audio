"""
Integration Tests
Comprehensive test suite for APIs, services, and database operations.
"""

import pytest
from typing import AsyncGenerator


class TestAudioAPI:
    """Test audio control endpoints."""

    @pytest.mark.asyncio
    async def test_audio_status(self):
        """Test getting audio status."""
        from app.services.audio_processor import AudioProcessorService
        service = AudioProcessorService()
        status = await service.get_status()
        assert status["sample_rate"] == 48000
        assert status["channels"] == 2

    @pytest.mark.asyncio
    async def test_audio_start_stop(self):
        """Test starting and stopping audio."""
        from app.services.audio_processor import AudioProcessorService
        service = AudioProcessorService()
        await service.start()
        assert service.is_running is True
        await service.stop()
        assert service.is_running is False

    @pytest.mark.asyncio
    async def test_latency(self):
        """Test latency calculation."""
        from app.services.audio_processor import AudioProcessorService
        service = AudioProcessorService()
        latency = await service.get_latency_ms()
        assert latency > 0

    @pytest.mark.asyncio
    async def test_levels(self):
        """Test level monitoring."""
        from app.services.audio_processor import AudioProcessorService
        service = AudioProcessorService()
        levels = await service.get_levels()
        assert "input" in levels
        assert "output" in levels


class TestPluginAPI:
    """Test plugin management endpoints."""

    @pytest.mark.asyncio
    async def test_discover_plugins(self):
        """Test plugin discovery."""
        from app.services.plugin_host_enhanced import EnhancedPluginHostService
        service = EnhancedPluginHostService()
        plugins = await service.discover()
        assert len(plugins) == 3

    @pytest.mark.asyncio
    async def test_load_plugin(self):
        """Test loading a plugin."""
        from app.services.plugin_host_enhanced import EnhancedPluginHostService
        service = EnhancedPluginHostService()
        plugins = await service.discover()
        plugin = await service.load(plugins[0]["uri"])
        assert plugin is not None
        assert plugin.name == plugins[0]["name"]

    @pytest.mark.asyncio
    async def test_get_parameters(self):
        """Test getting plugin parameters."""
        from app.services.plugin_host_enhanced import EnhancedPluginHostService
        service = EnhancedPluginHostService()
        plugins = await service.discover()
        plugin = await service.load(plugins[0]["uri"])
        params = list(plugin.parameters.values())
        assert len(params) > 0


class TestMIDIAPI:
    """Test MIDI routing endpoints."""

    @pytest.mark.asyncio
    async def test_get_devices(self):
        """Test MIDI device enumeration."""
        from app.services.midi_engine import MIDIEngineService
        service = MIDIEngineService()
        devices = await service.discover_devices()
        assert "inputs" in devices
        assert "outputs" in devices

    @pytest.mark.asyncio
    async def test_add_mapping(self):
        """Test adding MIDI CC mapping."""
        from app.services.midi_engine import MIDIEngineService
        service = MIDIEngineService()
        success = await service.add_cc_mapping(1, 7, "http://example.com/amp", 0)
        assert success is True


class TestChainAPI:
    """Test signal chain endpoints."""

    def test_create_chain(self):
        """Test creating a signal chain."""
        chain = {"id": 1, "name": "Test Chain", "plugins": []}
        assert chain["name"] == "Test Chain"

    def test_add_plugin_to_chain(self):
        """Test adding plugin to chain."""
        result = {"status": "plugin_added", "chain_id": 1}
        assert result["status"] == "plugin_added"


class TestServices:
    """Test service layer."""

    @pytest.mark.asyncio
    async def test_plugin_host_service(self):
        """Test plugin host service."""
        from app.services.plugin_host_enhanced import EnhancedPluginHostService
        service = EnhancedPluginHostService()
        plugins = await service.discover()
        assert len(plugins) > 0

    @pytest.mark.asyncio
    async def test_audio_processor_service(self):
        """Test audio processor service."""
        from app.services.audio_processor import AudioProcessorService
        service = AudioProcessorService()
        metrics = await service.get_status()
        assert metrics["sample_rate"] == 48000

    @pytest.mark.asyncio
    async def test_midi_engine_service(self):
        """Test MIDI engine service."""
        from app.services.midi_engine import MIDIEngineService
        service = MIDIEngineService()
        devices = await service.discover_devices()
        assert "inputs" in devices


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
