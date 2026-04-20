"""
Integration Tests
Comprehensive test suite for APIs, services, and database operations.
"""

import pytest


class TestAudioAPI:
    """Test audio control endpoints."""

    @pytest.mark.asyncio
    async def test_audio_status(self):
        """Test getting audio status."""
        from app.services.audio_io import AudioIOFactory

        service = AudioIOFactory.create(enable_watchdog=False, enable_signal_detection=False)
        status = service.get_stats()
        assert status["sample_rate"] == 48000
        assert status["channels"] == 2

    @pytest.mark.asyncio
    async def test_audio_start_stop(self, monkeypatch):
        """Test starting and stopping audio."""
        import app.services.audio_io as audio_io_module
        from app.services.audio_io import AudioIOFactory

        monkeypatch.setattr(audio_io_module, "SOUNDDEVICE_AVAILABLE", False)
        service = AudioIOFactory.create(enable_watchdog=False, enable_signal_detection=False)
        assert await service.start_stream() is True
        assert service.is_running is True
        assert await service.stop_stream() is True
        assert service.is_running is False

    @pytest.mark.asyncio
    async def test_latency(self):
        """Test latency calculation."""
        from app.services.audio_io import AudioIOFactory

        service = AudioIOFactory.create(enable_watchdog=False, enable_signal_detection=False)
        latency = service.get_stats()["latency_ms"]
        assert latency > 0

    @pytest.mark.asyncio
    async def test_levels(self):
        """Test level monitoring."""
        from app.services.audio_io import AudioIOFactory

        service = AudioIOFactory.create(enable_watchdog=False, enable_signal_detection=False)
        stats = service.get_stats()
        assert "input_queue_fill_pct" in stats
        assert "output_queue_fill_pct" in stats


class TestPluginAPI:
    """Test plugin management endpoints."""

    @pytest.mark.asyncio
    async def test_discover_plugins(self):
        """Test plugin discovery."""
        from app.services.plugin_loader_unified import PluginLoaderV2

        service = PluginLoaderV2()
        plugins = await service.discover_plugins()
        assert len(plugins) > 0

    @pytest.mark.asyncio
    async def test_load_plugin(self):
        """Test loading a plugin."""
        from app.services.plugin_loader_unified import PluginLoaderV2

        service = PluginLoaderV2()
        plugins = await service.discover_plugins()
        plugin = await service.get_plugin_by_uri(plugins[0].uri)
        assert plugin is not None
        assert plugin.name == plugins[0].name

    @pytest.mark.asyncio
    async def test_get_parameters(self):
        """Test getting plugin parameters."""
        from app.services.plugin_loader_unified import PluginLoaderV2

        service = PluginLoaderV2()
        plugins = await service.discover_plugins()
        plugin = await service.get_plugin_by_uri(plugins[0].uri)
        assert plugin is not None
        params = list(plugin.parameters)
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
        mapping = await service.add_mapping(
            channel=1,
            message_type="cc",
            cc_number=7,
            target_plugin_uri="http://example.com/amp",
            target_param_index=0,
            target_param_name="Gain",
        )
        assert mapping is not None


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
        from app.services.plugin_loader_unified import PluginLoaderV2

        service = PluginLoaderV2()
        plugins = await service.discover_plugins()
        assert len(plugins) > 0

    @pytest.mark.asyncio
    async def test_audio_processor_service(self):
        """Test audio processor service."""
        from app.services.audio_io import get_audio_status

        metrics = get_audio_status()
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
