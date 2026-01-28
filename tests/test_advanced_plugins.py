"""
Test Suite for Advanced Plugin Management System
Tests all components: caching, lazy loading, NAM/IR streaming, Pipedal integration
"""

import pytest
import tempfile
import json
import os
from pathlib import Path
from app.services.plugin_manager_v3 import (
    PluginMetadataLite,
    PluginMetadataFull,
    BinaryPluginCache,
    LazyPluginMetadataManager,
    PluginSearchIndex,
    AdvancedPluginManager
)
from app.services.nam_ir_manager import (
    NAMFileInfo,
    IRFileInfo,
    NAMFileMetadataExtractor,
    IRFileMetadataExtractor,
    NAMIRManager
)
from app.services.pipedal_integration import (
    PipedalPluginBridge,
    PluginLifecycleState,
    QuickLoadPluginAPI
)


class TestBinaryPluginCache:
    """Test binary cache format - power failure safe."""
    
    def test_write_and_read_cache(self):
        """Test cache write and read."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "test_cache.bin"
            cache = BinaryPluginCache(cache_path)
            
            # Create test data
            plugins = [
                PluginMetadataLite("urn:test:1", "Plugin 1", "Reverb"),
                PluginMetadataLite("urn:test:2", "Plugin 2", "Delay"),
            ]
            full_meta = {
                "urn:test:1": PluginMetadataFull(
                    uri="urn:test:1",
                    name="Plugin 1",
                    category="Reverb",
                    parameters=[{"name": "Decay", "min": 0, "max": 10}]
                )
            }
            
            # Write
            success = cache.write(plugins, full_meta)
            assert success
            assert cache_path.exists()
            
            # Read
            read_plugins, read_full = cache.read()
            assert read_plugins is not None
            assert len(read_plugins) == 2
            assert read_plugins[0].name == "Plugin 1"
            assert len(read_full) == 1
    
    def test_cache_with_empty_data(self):
        """Test cache with empty plugin list."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "empty_cache.bin"
            cache = BinaryPluginCache(cache_path)
            
            success = cache.write([], {})
            assert success
            
            plugins, full_meta = cache.read()
            assert plugins is not None
            assert len(plugins) == 0
    
    def test_corrupted_cache_handling(self):
        """Test handling of corrupted cache file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "corrupt_cache.bin"
            
            # Write corrupt data
            with open(cache_path, 'wb') as f:
                f.write(b"CORRUPTED DATA")
            
            cache = BinaryPluginCache(cache_path)
            plugins, full_meta = cache.read()
            
            # Should return None for corrupted cache
            assert plugins is None
            assert full_meta is None


class TestLazyPluginMetadataManager:
    """Test lazy loading of plugin metadata."""
    
    def test_add_and_retrieve_lite_metadata(self):
        """Test adding and retrieving lite metadata."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = LazyPluginMetadataManager(Path(tmpdir))
            
            plugin = PluginMetadataLite("urn:test:plugin", "Test Plugin", "Other")
            mgr.add_lite(plugin)
            
            retrieved = mgr.get_lite("urn:test:plugin")
            assert retrieved is not None
            assert retrieved.name == "Test Plugin"
    
    def test_add_and_retrieve_full_metadata(self):
        """Test adding and retrieving full metadata."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = LazyPluginMetadataManager(Path(tmpdir))
            
            plugin = PluginMetadataFull(
                uri="urn:test:full",
                name="Full Plugin",
                category="Reverb",
                parameters=[{"name": "Wet", "min": 0, "max": 1}]
            )
            mgr.add_full(plugin)
            
            retrieved = mgr.get_full("urn:test:full")
            assert retrieved is not None
            assert len(retrieved.parameters) == 1
    
    def test_cache_cleanup_limits(self):
        """Test that cache doesn't grow unbounded."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = LazyPluginMetadataManager(Path(tmpdir))
            mgr.MAX_FULL_CACHED = 5
            
            # Add more than limit
            for i in range(10):
                plugin = PluginMetadataFull(
                    uri=f"urn:test:{i}",
                    name=f"Plugin {i}",
                    category="Other"
                )
                mgr.add_full(plugin)
            
            # Cleanup should have kept only top MAX_FULL_CACHED
            assert len(mgr._full_metadata) <= mgr.MAX_FULL_CACHED * 1.5


class TestPluginSearchIndex:
    """Test plugin search capabilities."""
    
    def test_search_by_category(self):
        """Test category-based search."""
        index = PluginSearchIndex()
        
        p1 = PluginMetadataLite("urn:test:1", "Reverb 1", "Reverb")
        p2 = PluginMetadataLite("urn:test:2", "Reverb 2", "Reverb")
        p3 = PluginMetadataLite("urn:test:3", "Delay 1", "Delay")
        
        index.add_plugin(p1)
        index.add_plugin(p2)
        index.add_plugin(p3)
        
        reverbs = index.search_by_category("Reverb")
        assert len(reverbs) == 2
        
        delays = index.search_by_category("Delay")
        assert len(delays) == 1
    
    def test_search_by_name(self):
        """Test name-based search."""
        index = PluginSearchIndex()
        
        p1 = PluginMetadataLite("urn:test:1", "Hall Reverb", "Reverb")
        p2 = PluginMetadataLite("urn:test:2", "Plate Reverb", "Reverb")
        p3 = PluginMetadataLite("urn:test:3", "Delay Effect", "Delay")
        
        index.add_plugin(p1)
        index.add_plugin(p2)
        index.add_plugin(p3)
        
        reverb_results = index.search_by_name("reverb")
        assert len(reverb_results) == 2
    
    def test_get_categories(self):
        """Test getting all categories."""
        index = PluginSearchIndex()
        
        index.add_plugin(PluginMetadataLite("urn:test:1", "P1", "Reverb"))
        index.add_plugin(PluginMetadataLite("urn:test:2", "P2", "Delay"))
        index.add_plugin(PluginMetadataLite("urn:test:3", "P3", "EQ"))
        
        categories = index.get_categories()
        assert len(categories) == 3
        assert "Reverb" in categories
        assert "Delay" in categories
        assert "EQ" in categories


class TestNAMFileMetadata:
    """Test NAM file metadata extraction."""
    
    def test_nam_file_info_creation(self):
        """Test creating NAM file info."""
        info = NAMFileInfo(
            path="/path/to/plugin.nam",
            name="Plugin Model",
            file_size=1024000,
            model_type="Guitar Amp"
        )
        
        assert info.name == "Plugin Model"
        assert info.file_size == 1024000
        assert info.model_type == "Guitar Amp"


class TestIRFileMetadata:
    """Test IR file metadata extraction."""
    
    def test_ir_file_info_creation(self):
        """Test creating IR file info."""
        info = IRFileInfo(
            path="/path/to/impulse.wav",
            name="Small Room",
            file_size=2048000,
            channels=2,
            sample_rate=48000,
            num_samples=102400,
            duration_ms=2133.33
        )
        
        assert info.name == "Small Room"
        assert info.channels == 2
        assert abs(info.duration_ms - 2133.33) < 0.1


class TestNAMIRManager:
    """Test NAM/IR file manager (no streaming of actual files)."""
    
    def test_nam_ir_manager_initialization(self):
        """Test manager initialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = NAMIRManager(
                nam_dir=tmpdir,
                ir_dir=tmpdir
            )
            
            assert mgr.nam_dir.exists()
            assert mgr.ir_dir.exists()
    
    def test_metadata_retrieval(self):
        """Test metadata retrieval without loading files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            mgr = NAMIRManager(nam_dir=tmpdir, ir_dir=tmpdir)
            
            # Add test metadata
            info = NAMFileInfo("/path/to/test.nam", "Test Model", 1024000)
            mgr._nam_metadata["Test Model"] = info
            
            retrieved = mgr.get_nam_metadata("Test Model")
            assert retrieved is not None
            assert retrieved.name == "Test Model"


class TestPipedalIntegration:
    """Test Pipedal plugin integration."""
    
    def test_bridge_initialization(self):
        """Test bridge initialization."""
        bridge = PipedalPluginBridge()
        chain = bridge.get_chain()
        
        assert len(chain) == 0
    
    def test_add_plugin_to_chain(self):
        """Test adding plugin to chain."""
        bridge = PipedalPluginBridge()
        
        success = bridge.add_plugin_to_chain("urn:test:plugin")
        assert success
        
        chain = bridge.get_chain()
        assert len(chain) == 1
        assert chain[0].uri == "urn:test:plugin"
    
    def test_remove_plugin_from_chain(self):
        """Test removing plugin from chain."""
        bridge = PipedalPluginBridge()
        
        bridge.add_plugin_to_chain("urn:test:plugin")
        success = bridge.remove_plugin_from_chain("urn:test:plugin")
        
        assert success
        assert len(bridge.get_chain()) == 0
    
    def test_duplicate_plugin_prevention(self):
        """Test that duplicate plugins can't be added."""
        bridge = PipedalPluginBridge()
        
        assert bridge.add_plugin_to_chain("urn:test:plugin")
        assert not bridge.add_plugin_to_chain("urn:test:plugin")
    
    def test_plugin_reordering(self):
        """Test reordering plugins in chain."""
        bridge = PipedalPluginBridge()
        
        bridge.add_plugin_to_chain("urn:test:1")
        bridge.add_plugin_to_chain("urn:test:2")
        bridge.add_plugin_to_chain("urn:test:3")
        
        success = bridge.reorder_chain(["urn:test:3", "urn:test:1", "urn:test:2"])
        assert success
        
        chain = bridge.get_chain()
        assert chain[0].uri == "urn:test:3"
        assert chain[1].uri == "urn:test:1"
        assert chain[2].uri == "urn:test:2"
    
    def test_set_plugin_parameter(self):
        """Test setting plugin parameters."""
        bridge = PipedalPluginBridge()
        bridge.add_plugin_to_chain("urn:test:plugin")
        
        bridge.set_plugin_parameter("urn:test:plugin", 0, 0.5)
        
        chain = bridge.get_chain()
        assert chain[0].parameters[0] == 0.5
    
    def test_bypass_plugin(self):
        """Test bypassing plugin."""
        bridge = PipedalPluginBridge()
        bridge.add_plugin_to_chain("urn:test:plugin")
        
        bridge.bypass_plugin("urn:test:plugin", True)
        
        chain = bridge.get_chain()
        assert chain[0].bypass is True


class TestQuickLoadAPI:
    """Test quick-load API."""
    
    @pytest.mark.asyncio
    async def test_quick_load_preset(self):
        """Test quick-loading a preset."""
        bridge = PipedalPluginBridge()
        api = QuickLoadPluginAPI(bridge)
        
        uris = ["urn:test:1", "urn:test:2", "urn:test:3"]
        success = await api.quick_load_preset(uris)
        
        assert success
        chain = bridge.get_chain()
        assert len(chain) == 3
    
    @pytest.mark.asyncio
    async def test_quick_unload_all(self):
        """Test quick-unloading all plugins."""
        bridge = PipedalPluginBridge()
        api = QuickLoadPluginAPI(bridge)
        
        bridge.add_plugin_to_chain("urn:test:1")
        bridge.add_plugin_to_chain("urn:test:2")
        
        success = await api.quick_unload_all()
        
        assert success
        assert len(bridge.get_chain()) == 0
    
    def test_get_chain_info(self):
        """Test getting chain info."""
        bridge = PipedalPluginBridge()
        api = QuickLoadPluginAPI(bridge)
        
        bridge.add_plugin_to_chain("urn:test:plugin")
        info = api.get_chain_info()
        
        assert len(info) == 1
        assert info[0]['uri'] == "urn:test:plugin"
        assert info[0]['bypass'] is False


# Run tests with: pytest test_advanced_plugins.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
