"""
JUCE Audio Engine Tests
Tests for the MAP2 JUCE-based audio engine
"""

import pytest
import asyncio
import os
from unittest.mock import MagicMock, patch

# Try to import the JUCE engine service
try:
    from app.services.juce_engine_service import (
        JuceEngineService,
        AudioEngineConfig,
        get_audio_engine,
        JUCE_AVAILABLE
    )
    JUCE_ENGINE_INSTALLED = JUCE_AVAILABLE
except ImportError:
    JUCE_ENGINE_INSTALLED = False


@pytest.mark.skipif(
    not JUCE_ENGINE_INSTALLED or os.getenv("MAP2_RUN_JUCE_INTEGRATION", "").lower() != "true",
    reason="Native JUCE integration disabled (set MAP2_RUN_JUCE_INTEGRATION=true to run)",
)
class TestJuceEngine:
    """Test JUCE Audio Engine."""

    @pytest.fixture
    def engine(self):
        """Create a fresh engine instance for testing."""
        config = AudioEngineConfig(
            sample_rate=48000,
            buffer_size=256,
            audio_device="default",
            enable_midi=False
        )
        return JuceEngineService(config)

    @pytest.mark.asyncio
    async def test_engine_initializes(self, engine):
        """Test that engine can initialize."""
        result = await engine.initialize()
        assert result is True
        assert engine.is_running is True
        await engine.shutdown()

    @pytest.mark.asyncio
    async def test_list_plugins(self, engine):
        """Test plugin discovery."""
        await engine.initialize()
        
        plugins = await engine.list_plugins()
        
        # Should find some LV2 plugins if installed
        assert isinstance(plugins, list)
        
        if len(plugins) > 0:
            plugin = plugins[0]
            assert "uri" in plugin
            assert "name" in plugin
        
        await engine.shutdown()

    @pytest.mark.asyncio
    async def test_load_unload_plugin(self, engine):
        """Test loading and unloading a plugin."""
        await engine.initialize()
        
        plugins = await engine.list_plugins()
        
        if len(plugins) == 0:
            pytest.skip("No plugins available for testing")
        
        test_plugin = plugins[0]["uri"]
        
        # Load plugin
        instance_id = await engine.load_plugin(test_plugin)
        assert instance_id > 0
        
        # Unload plugin
        result = await engine.unload_plugin(instance_id)
        assert result is True
        
        await engine.shutdown()

    @pytest.mark.asyncio
    async def test_vu_levels(self, engine):
        """Test VU level retrieval."""
        await engine.initialize()
        
        levels = await engine.get_vu_levels()
        
        assert "input_left" in levels
        assert "input_right" in levels
        assert "output_left" in levels
        assert "output_right" in levels
        
        await engine.shutdown()

    @pytest.mark.asyncio
    async def test_system_info(self, engine):
        """Test system info retrieval."""
        await engine.initialize()
        
        info = engine.get_system_info()
        
        assert "version" in info
        assert "sample_rate" in info
        assert "buffer_size" in info
        assert "available" in info
        
        await engine.shutdown()


class TestJuceEngineService:
    """Test JUCE Engine Service without actual engine."""

    def test_singleton(self):
        """Test that get_audio_engine returns singleton."""
        from app.services.juce_engine_service import get_audio_engine
        
        service1 = get_audio_engine()
        service2 = get_audio_engine()
        
        assert service1 is service2

    def test_default_config(self):
        """Test default configuration."""
        config = AudioEngineConfig()
        
        assert config.sample_rate == 48000
        assert config.buffer_size == 64
        assert config.enable_midi is True

    def test_properties_when_not_initialized(self):
        """Test properties when engine not initialized."""
        service = JuceEngineService()
        
        assert service.is_running is False
        
        info = service.get_system_info()
        assert info["available"] is False or info["running"] is False


class TestJuceEngineMocked:
    """Test JUCE Engine with mocked C++ module."""

    @pytest.fixture
    def mock_engine(self):
        """Create a mocked engine module."""
        mock = MagicMock()
        mock.get_version.return_value = "1.0.0-test"
        mock.is_available.return_value = True
        mock.create_engine.return_value = mock
        mock.initialize.return_value = True
        mock.start_audio.return_value = True
        mock.stop_audio.return_value = True
        mock.is_running.return_value = True
        mock.is_audio_running.return_value = True
        mock.get_system_info.return_value = {
            "version": "1.0.0-test",
            "sample_rate": 48000,
            "buffer_size": 256,
            "audio_device": "default",
            "running": True,
            "audio_running": True
        }
        mock.list_plugins.return_value = [
            {"uri": "http://test.plugin/1", "name": "Test Plugin 1"},
            {"uri": "http://test.plugin/2", "name": "Test Plugin 2"}
        ]
        mock.load_plugin.return_value = 1
        mock.unload_plugin.return_value = True
        mock.get_vu_levels.return_value = {
            "input_left": 0.5,
            "input_right": 0.5,
            "output_left": 0.4,
            "output_right": 0.4
        }
        return mock

    @pytest.mark.asyncio
    async def test_initialize_with_mock(self, mock_engine):
        """Test initialization with mocked engine."""
        with patch.dict('sys.modules', {'map2_audio_engine': mock_engine}):
            with patch('app.services.juce_engine_service.juce_engine', mock_engine):
                with patch('app.services.juce_engine_service.JUCE_AVAILABLE', True):
                    service = JuceEngineService()
                    
                    # This would test the actual initialization flow
                    # Note: The import happens at module load, so this is tricky to test

    def test_version_string(self):
        """Test version string format."""
        service = JuceEngineService()
        version = service.get_version()
        assert isinstance(version, str)

    @pytest.mark.asyncio
    async def test_set_monitoring_output_index_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.set_monitoring_output_index.return_value = True

        result = await service.set_monitoring_output_index(4)

        assert result is True
        service._engine.set_monitoring_output_index.assert_called_once_with(4)

    @pytest.mark.asyncio
    async def test_trigger_parallel_ab_switch_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.trigger_parallel_ab_switch.return_value = True

        result = await service.trigger_parallel_ab_switch(7, 1)

        assert result is True
        service._engine.trigger_parallel_ab_switch.assert_called_once_with(7, 1)

    @pytest.mark.asyncio
    async def test_set_input_channel_mode_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.set_input_channel_mode.return_value = True

        result = await service.set_input_channel_mode("mono_left")

        assert result is True
        assert service.config.input_channel_mode == "mono_left"
        service._engine.set_input_channel_mode.assert_called_once_with(0)

    @pytest.mark.asyncio
    async def test_set_input_gain_db_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.set_input_gain_db.return_value = True

        result = await service.set_input_gain_db(6.0)

        assert result is True
        assert service.config.input_gain_db == 6.0
        service._engine.set_input_gain_db.assert_called_once_with(6.0)

    @pytest.mark.asyncio
    async def test_set_output_gain_db_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.set_output_gain_db.return_value = True

        result = await service.set_output_gain_db(-3.0)

        assert result is True
        assert service.config.output_gain_db == -3.0
        service._engine.set_output_gain_db.assert_called_once_with(-3.0)

    @pytest.mark.asyncio
    async def test_apply_routing_topology_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.apply_routing_topology.return_value = True

        result = await service.apply_routing_topology({"chain_order": [1, 2], "parallel_groups": []})

        assert result is True
        service._engine.apply_routing_topology.assert_called_once_with({"chain_order": [1, 2], "parallel_groups": []})

    @pytest.mark.asyncio
    async def test_replace_snapshot_expression_mappings_uses_engine_when_available(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.replace_snapshot_expression_mappings.return_value = True

        payload = [{"id": "expr-1", "cc": 11, "param_id": "plugin.cutoff"}]
        result = await service.replace_snapshot_expression_mappings(payload)

        assert result is True
        service._engine.replace_snapshot_expression_mappings.assert_called_once_with(payload)

    @pytest.mark.asyncio
    async def test_replace_snapshot_expression_mappings_resolves_target_plugin_instance(self):
        service = JuceEngineService()
        service._engine = MagicMock()
        service._engine.replace_snapshot_expression_mappings.return_value = True
        service._engine.get_current_pedalboard.return_value = {
            "items": [
                {
                    "uri": "urn:test:plugin",
                    "position": 0,
                    "instance_id": 41,
                }
            ]
        }

        payload = [
            {
                "id": "expr-1",
                "cc": 11,
                "param_id": "plugin.cutoff",
                "target_plugin_uri": "urn:test:plugin",
                "target_plugin_position": 0,
                "param_index": 2,
            }
        ]
        result = await service.replace_snapshot_expression_mappings(payload)

        assert result is True
        service._engine.replace_snapshot_expression_mappings.assert_called_once_with(
            [
                {
                    "id": "expr-1",
                    "cc": 11,
                    "param_id": "plugin.cutoff",
                    "target_plugin_uri": "urn:test:plugin",
                    "target_plugin_position": 0,
                    "param_index": 2,
                    "target_plugin": 41,
                }
            ]
        )
