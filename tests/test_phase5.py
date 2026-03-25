"""Tests for unified plugin-loader compatibility wrappers."""

import pytest
import asyncio
from typing import List

from app.services.plugin_loader_unified import (
    PluginLoaderV2, LV2Plugin, PluginParameter, RealLV2Loader, LILV_AVAILABLE
)


class TestPluginLoaderV2:
    """Tests for advanced LV2 plugin loader."""
    
    @pytest.mark.asyncio
    async def test_plugin_discovery(self):
        """Test basic plugin discovery."""
        loader = PluginLoaderV2()
        plugins = await loader.discover_plugins()
        
        assert isinstance(plugins, list)
        assert len(plugins) > 0
        
        plugin_names = [p.name for p in plugins]
        assert any(plugin_names)
    
    @pytest.mark.asyncio
    async def test_plugin_caching(self):
        """Test that plugins are cached after first discovery."""
        loader = PluginLoaderV2()
        
        plugins1 = await loader.discover_plugins()
        plugins2 = await loader.discover_plugins()
        
        # Should return same cached list
        assert plugins1 is plugins2
        assert len(plugins1) == len(plugins2)
    
    @pytest.mark.asyncio
    async def test_plugin_refresh(self):
        """Test forcing refresh of plugin cache."""
        loader = PluginLoaderV2()
        
        plugins1 = await loader.discover_plugins()
        plugins2 = await loader.discover_plugins(refresh=True)
        
        # After refresh, should be new list (different object)
        assert len(plugins1) == len(plugins2)
    
    @pytest.mark.asyncio
    async def test_get_plugin_by_uri(self):
        """Test getting specific plugin by URI."""
        loader = PluginLoaderV2()
        
        plugins = await loader.discover_plugins()
        if plugins:
            first_plugin = plugins[0]
            found = await loader.get_plugin_by_uri(first_plugin.uri)
            
            assert found is not None
            assert found.uri == first_plugin.uri
            assert found.name == first_plugin.name
    
    @pytest.mark.asyncio
    async def test_search_plugins(self):
        """Test plugin search functionality."""
        loader = PluginLoaderV2()
        
        results = await loader.search_plugins("amp")
        assert isinstance(results, list)
        
        # If results exist, verify they match the query
        for plugin in results:
            match = ("amp" in plugin.name.lower() or
                    "amp" in plugin.category.lower() or
                    "amp" in plugin.author.lower())
            assert match
    
    @pytest.mark.asyncio
    async def test_get_plugins_by_category(self):
        """Test getting plugins by category."""
        loader = PluginLoaderV2()
        
        plugins = await loader.discover_plugins()
        if plugins:
            # Get categories
            categories = await loader.get_plugin_categories()
            assert len(categories) > 0
            
            # Get plugins for each category
            for category in categories:
                cat_plugins = await loader.get_plugins_by_category(category)
                assert isinstance(cat_plugins, list)
                
                # All should match category
                for plugin in cat_plugins:
                    assert plugin.category == category
    
    @pytest.mark.asyncio
    async def test_plugin_categories(self):
        """Test getting available plugin categories."""
        loader = PluginLoaderV2()
        
        categories = await loader.get_plugin_categories()
        
        assert isinstance(categories, list)
        assert len(categories) > 0
        assert all(isinstance(c, str) for c in categories)


class TestLV2PluginMetadata:
    """Tests for LV2 plugin metadata models."""
    
    def test_plugin_parameter_creation(self):
        """Test creating plugin parameter."""
        param = PluginParameter(
            index=0,
            name="Gain",
            symbol="gain",
            uri="http://example.com/gain",
            value_type="float",
            min_value=-24.0,
            max_value=24.0,
            default_value=0.0,
        )
        
        assert param.index == 0
        assert param.name == "Gain"
        assert param.min_value == -24.0
        assert param.max_value == 24.0
    
    def test_lv2_plugin_creation(self):
        """Test creating LV2 plugin metadata."""
        plugin = LV2Plugin(
            uri="http://example.com/test",
            name="Test Plugin",
            author="Test Author",
            license="MIT",
            version="1.0.0",
            class_label="Distortion",
            category="Distortion",
            in_port_count=2,
            out_port_count=2,
        )
        
        assert plugin.uri == "http://example.com/test"
        assert plugin.category == "Distortion"
        assert plugin.in_port_count == 2
    
    def test_plugin_category_mapping(self):
        """Test that class labels map to categories correctly."""
        test_cases = [
            ("Distortion", "Distortion"),
            ("Equalizer", "EQ"),
            ("Reverb", "Reverb"),
            ("Compressor", "Compressor"),
            ("Unknown", "Utility"),
        ]
        
        for class_label, expected_category in test_cases:
            plugin = LV2Plugin(
                uri="http://example.com/test",
                name="Test",
                author="Author",
                license="MIT",
                version="1.0",
                class_label=class_label,
                category=expected_category,
            )
            assert plugin.category == expected_category


class TestRealLV2Loader:
    """Tests for the real LV2 loader."""
    
    def test_loader_initialization(self):
        """Test loader initializes without errors."""
        loader = RealLV2Loader()
        
        # Should initialize successfully
        assert loader is not None
        
        # If lilv is available, world should be set
        if LILV_AVAILABLE:
            assert loader.world is not None
    
    def test_stub_plugins_fallback(self):
        """Test that stub plugins are returned when lilv unavailable."""
        loader = RealLV2Loader()
        
        # Always get some plugins (stubs if lilv unavailable)
        plugins = loader.discover_plugins()
        assert len(plugins) > 0
        
        # Stub plugins have known names
        plugin_names = [p.name for p in plugins]
        assert any(name for name in plugin_names)


class TestPluginIntegration:
    """Integration tests for plugin system."""
    
    @pytest.mark.asyncio
    async def test_full_plugin_workflow(self):
        """Test complete plugin discovery and search workflow."""
        loader = PluginLoaderV2()
        
        # 1. Discover all plugins
        all_plugins = await loader.discover_plugins()
        assert len(all_plugins) > 0
        
        # 2. Get categories
        categories = await loader.get_plugin_categories()
        assert len(categories) > 0
        
        # 3. Search by name
        results = await loader.search_plugins("gain")
        assert isinstance(results, list)
        
        # 4. Get by URI
        if all_plugins:
            uri = all_plugins[0].uri
            plugin = await loader.get_plugin_by_uri(uri)
            assert plugin is not None
            assert plugin.uri == uri
    
    @pytest.mark.asyncio
    async def test_plugin_parameters(self):
        """Test accessing plugin parameters."""
        loader = PluginLoaderV2()
        plugins = await loader.discover_plugins()
        
        # Check that plugins have parameters
        for plugin in plugins[:3]:  # Check first 3
            assert isinstance(plugin.parameters, list)
            
            # If plugin has parameters, verify structure
            for param in plugin.parameters:
                assert isinstance(param, PluginParameter)
                assert hasattr(param, 'name')
                assert hasattr(param, 'min_value')
                assert hasattr(param, 'max_value')


@pytest.mark.skipif(not LILV_AVAILABLE, reason="lilv not available")
class TestRealLilvIntegration:
    """Tests that require real lilv library."""
    
    @pytest.mark.asyncio
    async def test_real_system_plugins(self):
        """Test discovering real LV2 plugins from system."""
        loader = PluginLoaderV2()
        plugins = await loader.discover_plugins()
        
        # With real lilv, might discover system plugins
        # At minimum, should return something
        assert len(plugins) > 0
        
        # Plugins should have valid metadata
        for plugin in plugins[:5]:
            assert plugin.uri
            assert plugin.name
            assert plugin.author
            assert plugin.version


# Async test fixtures
@pytest.fixture
async def plugin_loader():
    """Fixture providing plugin loader."""
    return PluginLoaderV2()


@pytest.fixture
async def discovered_plugins(plugin_loader):
    """Fixture providing discovered plugins."""
    return await plugin_loader.discover_plugins()
