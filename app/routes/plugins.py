"""
Plugin Route Handlers
API endpoints for plugin management.
"""

import time
import logging
import inspect
import json
from pathlib import Path
from typing import List, Dict, Any

from app.response_models import PluginLoadResponse, PluginUnloadResponse
from app.exceptions import PluginNotFoundException, PluginLoadException
from app.services.plugin_resource_manager import get_resource_manager, ResourceLimits

logger = logging.getLogger(__name__)


def _load_juce_processors() -> List[Dict[str, Any]]:
    """Load JUCE native processors from configuration file.

    These are high-performance processors built into the JUCE C++ engine:
    - Compressor, Limiter, Noise Gate (DynamicsProcessor)
    - 8-Band Parametric EQ (FilterProcessor)
    - Cabinet IR, Reverb IR (ConvolutionProcessor)
    - Neural Amp Modeler (NAMProcessor)

    Returns:
        List of processor definitions in plugin format
    """
    config_path = Path(__file__).parent.parent / "deployment" / "juce_processors.json"

    if not config_path.exists():
        logger.warning(f"JUCE processors config not found: {config_path}")
        return []

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)

        processors = []
        for proc in config.get("processors", []):
            # Build parameters list from config
            parameters = []
            param_index = 0

            for param in proc.get("parameters", []):
                parameters.append({
                    "index": param_index,
                    "name": param.get("name", ""),
                    "symbol": param.get("symbol", ""),
                    "min": param.get("min", 0),
                    "max": param.get("max", 1),
                    "default": param.get("default", 0),
                    "is_toggled": param.get("type") == "toggle",
                    "is_log": param.get("logarithmic", False),
                })
                param_index += 1

            # Add band parameters for EQ
            if "band_parameters" in proc:
                band_config = proc["band_parameters"]
                for band_idx in range(band_config.get("count", 0)):
                    for band_param in band_config.get("per_band", []):
                        parameters.append({
                            "index": param_index,
                            "name": f"Band {band_idx + 1} {band_param.get('name', '')}",
                            "symbol": f"band{band_idx}_{band_param.get('symbol', '')}",
                            "min": band_param.get("min", 0),
                            "max": band_param.get("max", 1),
                            "default": band_param.get("default", 0),
                            "is_toggled": band_param.get("type") == "toggle",
                            "is_log": band_param.get("logarithmic", False),
                        })
                        param_index += 1

            processors.append({
                "uri": proc["uri"],
                "name": proc["name"],
                "author": proc.get("author", "MAP2 Audio"),
                "category": proc["category"],
                "class_label": "JUCE Native",
                "version": "1.0",
                "license": "Proprietary",
                "has_ui": False,
                "in_ports": proc["audio_ports"]["inputs"],
                "out_ports": proc["audio_ports"]["outputs"],
                "format": "JUCE",
                "is_native": True,
                "api_base": proc.get("api_base"),
                "features": proc.get("features", []),
                "parameters": parameters,
                "priority": proc.get("priority", 10),
            })

        logger.info(f"Loaded {len(processors)} JUCE native processors")
        return processors

    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JUCE processors config: {e}")
        return []
    except Exception as e:
        logger.error(f"Error loading JUCE processors: {e}")
        return []


# Cache for JUCE processors (loaded once at startup)
_juce_processors_cache: List[Dict[str, Any]] = []


def _get_juce_processors() -> List[Dict[str, Any]]:
    """Get JUCE processors with caching."""
    global _juce_processors_cache
    if not _juce_processors_cache:
        _juce_processors_cache = _load_juce_processors()
    return _juce_processors_cache

try:
    from fastapi import APIRouter, HTTPException, Query
    from pydantic import BaseModel
    from app.services import service_manager
    from app.services.event_publisher import event_publisher, EventType

    router = APIRouter(prefix="/api/plugins", tags=["plugins"])

    # Batch parameter update model
    class ParameterUpdate(BaseModel):
        """Single parameter update in a batch."""
        plugin_uri: str
        param_index: int
        value: float

    class BatchParameterRequest(BaseModel):
        """Batch parameter update request."""
        updates: List[ParameterUpdate]

    # In-memory cache of discovered and loaded plugins with TTL
    _discovered_plugins = []
    _loaded_plugins = {}
    _cache_timestamp = 0
    _cache_ttl = 300  # 5 minutes cache TTL

    def _is_cache_valid() -> bool:
        """Check if plugin cache is still valid."""
        if not _discovered_plugins:
            return False
        return (time.time() - _cache_timestamp) < _cache_ttl

    def invalidate_plugin_cache():
        """Invalidate the plugin cache. Call this after installing/uninstalling plugins."""
        global _discovered_plugins, _cache_timestamp
        count = len(_discovered_plugins)
        _discovered_plugins = []
        _cache_timestamp = 0
        logger.info(f"Plugin cache invalidated ({count} plugins cleared)")

        # Refresh the plugin loader's lilv world to pick up new/removed plugins
        try:
            from app.services.plugin_loader_unified import UnifiedPluginLoader
            loader = UnifiedPluginLoader.get_instance()
            loader.refresh_lilv_world()
            logger.info("Plugin loader lilv world refreshed")
        except Exception as e:
            logger.warning(f"Could not refresh plugin loader: {e}")

        # Also refresh the LV2 service if it exists
        try:
            from app.services.lv2_enhanced import get_lv2_service
            lv2_service = get_lv2_service()
            lv2_service.refresh()
        except Exception as e:
            pass  # LV2 enhanced service may not be used

        return count

    def _transform_plugin(p) -> dict:
        """Transform a plugin object to API response format."""
        return {
            "uri": p.uri,
            "name": p.name,
            "author": p.author,
            "category": p.category,
            "class_label": p.class_label,
            "version": p.version,
            "license": p.license,
            "has_ui": p.has_ui,
            "in_ports": p.in_port_count,
            "out_ports": p.out_port_count,
            "parameters": [
                {
                    "index": param.index,
                    "name": param.name,
                    "symbol": param.symbol,
                    "min": param.min_value,
                    "max": param.max_value,
                    "default": param.default_value,
                    "is_toggled": param.is_toggled,
                    "is_log": param.is_logarithmic,
                }
                for param in p.parameters
            ] if hasattr(p, 'parameters') else []
        }

    @router.get("/discover")
    async def discover_plugins(refresh: bool = Query(False, description="Force refresh of plugin cache")):
        """Discover available plugins (JUCE native + LV2).

        Args:
            refresh: If True, forces a fresh scan of plugins instead of using cache.

        Returns:
            Combined list of JUCE native processors and LV2 plugins.
            JUCE processors are listed first as they are the best-in-class options.
        """
        global _discovered_plugins, _cache_timestamp

        # Return cached plugins if valid and not forcing refresh
        if not refresh and _is_cache_valid():
            logger.debug(f"Returning {len(_discovered_plugins)} cached plugins")
            logger.debug(f"Cached plugins: {[p.get('uri') for p in _discovered_plugins]}")
            return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": True}

        # Always include JUCE native processors (best-in-class built-in effects)
        # Clear JUCE cache on refresh to pick up config changes
        if refresh:
            global _juce_processors_cache
            _juce_processors_cache = []
        juce_processors = _get_juce_processors()
        logger.info(f"Including {len(juce_processors)} JUCE native processors")

        loader = service_manager.get_plugin_loader()
        if not loader:
            # If loader not available, return JUCE processors only
            if juce_processors:
                _discovered_plugins = juce_processors
                _cache_timestamp = time.time()
                logger.warning("Plugin loader not available, returning JUCE processors only")
                return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": False, "warning": "LV2 loader not available, showing JUCE processors only"}
            # If we have cached data, return it anyway
            if _discovered_plugins:
                logger.warning("Plugin loader not available, returning stale cache")
                return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": True, "warning": "Plugin loader not available, showing cached data"}
            return {"plugins": [], "count": 0, "error": "Plugin loader not available"}

        try:
            # Check if the loader has async or sync discover method
            if hasattr(loader, 'discover_plugins_sync'):
                # Use sync version
                plugins = loader.discover_plugins_sync()
            else:
                # Use async version (this is for the unified loader)
                # Check if discover_plugins is coroutine
                if inspect.iscoroutinefunction(loader.discover_plugins):
                    plugins = await loader.discover_plugins(force_refresh=refresh)
                else:
                    plugins = loader.discover_plugins(force_refresh=refresh)

            logger.debug(f"Raw plugins from loader: {[(p.uri if hasattr(p, 'uri') else str(p)) for p in plugins]}")
            lv2_plugins = [_transform_plugin(p) for p in plugins]

            # Combine JUCE processors (first, highest priority) with LV2 plugins
            # JUCE processors are preferred as they are optimized native implementations
            _discovered_plugins = juce_processors + lv2_plugins
            _cache_timestamp = time.time()

            logger.info(f"Discovered {len(_discovered_plugins)} total plugins ({len(juce_processors)} JUCE + {len(lv2_plugins)} LV2, refresh={refresh})")
            logger.info(f"Plugin URIs: {[p.get('uri') for p in _discovered_plugins]}")
            return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": False}
        except Exception as e:
            logger.error(f"Error discovering plugins: {e}")
            # Return JUCE processors + cached data on error if available
            if juce_processors or _discovered_plugins:
                fallback = juce_processors if juce_processors else _discovered_plugins
                return {"plugins": fallback, "count": len(fallback), "cached": True, "error": str(e)}
            return {"plugins": [], "count": 0, "error": str(e)}

    @router.post("/refresh")
    async def refresh_plugins():
        """Force refresh of plugin cache and return updated list."""
        return await discover_plugins(refresh=True)

    @router.delete("/cache")
    async def clear_plugin_cache():
        """Clear the plugin cache, forcing next discovery to rescan."""
        global _discovered_plugins, _cache_timestamp
        count = len(_discovered_plugins)
        _discovered_plugins = []
        _cache_timestamp = 0
        logger.info("Plugin cache cleared")
        return {"status": "cleared", "plugins_cleared": count}

    @router.get("/list")
    async def list_plugins():
        """List currently loaded plugins."""
        loaded = [
            {
                "uri": uri,
                "name": info.get("name", uri),
                "category": info.get("category", "Unknown")
            }
            for uri, info in _loaded_plugins.items()
        ]
        return {"loaded": loaded, "count": len(loaded)}

    @router.post("/load")
    async def load_plugin(uri: str):
        """Load a plugin by URI."""
        global _loaded_plugins

        # Find plugin in discovered list
        plugin_info = next((p for p in _discovered_plugins if p["uri"] == uri), None)
        if not plugin_info:
            raise HTTPException(status_code=404, detail="Plugin not found in discovered list")

        # Instantiate the plugin in the audio engine
        engine_loaded = False
        instance_id = None
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running:
                instance_id = await engine.load_plugin(uri)
                engine_loaded = instance_id > 0
                if not engine_loaded:
                    logger.warning(f"Failed to load plugin in audio engine: {uri}")
        except Exception as e:
            logger.error(f"Error loading plugin in audio engine: {e}")

        loaded_plugin = dict(plugin_info)
        loaded_plugin["instance_id"] = instance_id
        loaded_plugin["engine_loaded"] = engine_loaded

        _loaded_plugins[uri] = loaded_plugin
        return {"status": "loaded", "plugin": loaded_plugin, "engine_loaded": engine_loaded}

    @router.post("/unload")
    async def unload_plugin(uri: str):
        """Unload a plugin."""
        global _loaded_plugins

        if uri not in _loaded_plugins:
            raise HTTPException(status_code=404, detail="Plugin not loaded")

        # Remove from audio engine
        engine_unloaded = False
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running:
                loaded_entry = _loaded_plugins.get(uri, {})
                instance_id = loaded_entry.get("instance_id")

                if not isinstance(instance_id, int) or instance_id <= 0:
                    resolver = getattr(engine, "_get_instance_id_for_uri", None)
                    if callable(resolver):
                        instance_id = resolver(uri)

                if isinstance(instance_id, int) and instance_id > 0:
                    engine_unloaded = await engine.unload_plugin(instance_id)
                else:
                    logger.warning(f"No instance_id found for loaded plugin {uri}; skipping engine unload")

                if not engine_unloaded:
                    logger.warning(f"Failed to unload plugin from audio engine: {uri}")
        except Exception as e:
            logger.error(f"Error unloading plugin from audio engine: {e}")

        del _loaded_plugins[uri]
        return {"status": "unloaded", "uri": uri, "engine_unloaded": engine_unloaded}

    @router.delete("/{uri:path}")
    async def delete_plugin(uri: str):
        """Delete an LV2 plugin from the system.
        
        This removes the plugin package/bundle from the LV2 paths.
        For LV2 plugins, it removes the .lv2 directory.
        If the plugin doesn't exist on the filesystem, it removes it from the database.
        
        Args:
            uri: Plugin URI identifier
            
        Returns:
            Status and count of removed plugins
        """
        import shutil
        from pathlib import Path
        
        logger.info(f"Delete request for plugin: {uri}")
        
        # Define standard LV2 paths
        lv2_paths = [
            Path.home() / ".lv2",
            Path("/usr/lib/lv2"),
            Path("/usr/lib64/lv2"),  # 64-bit lib path
            Path("/usr/local/lib/lv2"),
            Path("/usr/local/lib64/lv2"),  # 64-bit local lib path
            Path("/opt/lv2"),
        ]
        
        bundle_path = None
        removed_from_fs = False
        
        # Search through LV2 directories for the plugin
        for lv2_dir in lv2_paths:
            if not lv2_dir.exists():
                continue
                
            # Scan all .lv2 bundles in this directory
            for bundle in lv2_dir.glob("*.lv2"):
                # Check if this is the plugin we're looking for
                # by examining the manifest.ttl file
                manifest = bundle / "manifest.ttl"
                if manifest.exists():
                    try:
                        with open(manifest, 'r') as f:
                            content = f.read()
                            # Check if the URI is in the manifest
                            if uri.replace(":", "\\:") in content or uri in content:
                                bundle_path = bundle
                                logger.info(f"Found plugin bundle at: {bundle_path}")
                                break
                    except Exception as e:
                        logger.debug(f"Error reading manifest {manifest}: {e}")
                        continue
            
            if bundle_path:
                break
        
        # Also check non-.lv2 bundles (some plugins install as regular directories)
        if not bundle_path:
            for lv2_dir in lv2_paths:
                if not lv2_dir.exists():
                    continue
                    
                for item in lv2_dir.iterdir():
                    if item.is_dir() and not item.name.endswith('.lv2'):
                        manifest = item / "manifest.ttl"
                        if manifest.exists():
                            try:
                                with open(manifest, 'r') as f:
                                    content = f.read()
                                    if uri.replace(":", "\\:") in content or uri in content:
                                        bundle_path = item
                                        logger.info(f"Found plugin bundle at: {bundle_path}")
                                        break
                            except Exception as e:
                                logger.debug(f"Error reading manifest {manifest}: {e}")
                                continue
                
                if bundle_path:
                    break
        
        # If found on filesystem, try to delete it
        if bundle_path:
            logger.info(f"Deleting plugin bundle: {bundle_path}")
            try:
                if bundle_path.exists():
                    if bundle_path.is_dir():
                        shutil.rmtree(bundle_path)
                        removed_from_fs = True
                        logger.info(f"Successfully deleted LV2 plugin directory: {bundle_path}")
                    else:
                        bundle_path.unlink()
                        removed_from_fs = True
                        logger.info(f"Successfully deleted LV2 plugin file: {bundle_path}")
                else:
                    logger.warning(f"Plugin path does not exist: {bundle_path}")
                    # Continue - we'll remove from database below
            except PermissionError as e:
                logger.error(f"Permission denied deleting {bundle_path}: {e}")
                raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
            except Exception as e:
                logger.error(f"Error removing plugin files: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to delete plugin files: {str(e)}")
        else:
            logger.info(f"Plugin not found on filesystem: {uri}")
        
        # Always invalidate plugin cache to remove from database
        invalidate_plugin_cache()
        
        # Try to remove from plugin loader's cache if it has one
        try:
            loader = service_manager.get_plugin_loader()
            if loader and hasattr(loader, 'plugins') and isinstance(loader.plugins, dict):
                if uri in loader.plugins:
                    del loader.plugins[uri]
                    logger.info(f"Removed plugin from loader cache: {uri}")
        except Exception as e:
            logger.debug(f"Could not remove from loader cache: {e}")
        
        return {
            "status": "deleted",
            "uri": uri,
            "path": str(bundle_path) if bundle_path else None,
            "removed_from_filesystem": removed_from_fs,
            "removed_from_database": True
        }

    @router.get("/{uri:path}/parameters")
    async def get_parameters(uri: str):
        """Get plugin parameters."""
        if uri not in _loaded_plugins:
            raise HTTPException(status_code=404, detail="Plugin not loaded")

        # Find full plugin info from discovered list
        plugin_info = next((p for p in _discovered_plugins if p["uri"] == uri), None)
        if not plugin_info:
            return {"uri": uri, "parameters": []}

        # Get actual parameter values from running instance
        parameters = plugin_info.get("parameters", []).copy()

        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running:
                for param in parameters:
                    symbol = param.get("symbol", "")
                    if symbol:
                        value = await engine.get_parameter(uri, symbol)
                        if value is not None:
                            param["value"] = value
                        else:
                            param["value"] = param.get("default", 0.0)
                    else:
                        param["value"] = param.get("default", 0.0)
        except Exception as e:
            logger.error(f"Error getting parameter values: {e}")
            for param in parameters:
                param["value"] = param.get("default", 0.0)

        return {"uri": uri, "parameters": parameters}

    @router.post("/{uri:path}/parameters/{param_index}")
    async def set_parameter(uri: str, param_index: int, value: float):
        """Set a plugin parameter value."""
        if param_index < 0:
            raise HTTPException(status_code=400, detail="Parameter index must be >= 0")
        if uri not in _loaded_plugins:
            raise HTTPException(status_code=404, detail="Plugin not loaded")

        # Set parameter in running plugin instance
        engine_set = False
        plugin_info = _loaded_plugins.get(uri, {})
        parameters = plugin_info.get("parameters", [])
        symbol = None

        # Get parameter symbol from index
        if param_index < len(parameters):
            symbol = parameters[param_index].get("symbol", "")

        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running and symbol:
                engine_set = await engine.set_parameter(uri, symbol, value)
                if not engine_set:
                    logger.warning(f"Failed to set parameter in audio engine: {uri}:{symbol}={value}")
        except Exception as e:
            logger.error(f"Error setting parameter in audio engine: {e}")

        # Publish parameter change event
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_PARAMETER_CHANGED,
            {"plugin_uri": uri, "param_index": param_index, "value": value}
        )

        return {"uri": uri, "param": param_index, "value": value, "engine_set": engine_set}

    @router.post("/batch/parameters")
    async def batch_set_parameters(request: BatchParameterRequest):
        """Set multiple plugin parameters in a single request.

        This endpoint reduces network overhead for real-time parameter updates
        by batching multiple parameter changes into a single API call.

        Args:
            request: BatchParameterRequest containing list of parameter updates

        Returns:
            Summary of applied updates and any errors
        """
        results = []
        errors = []

        for update in request.updates:
            try:
                if update.param_index < 0:
                    errors.append({
                        "plugin_uri": update.plugin_uri,
                        "param_index": update.param_index,
                        "error": "Parameter index must be >= 0"
                    })
                    continue

                if update.plugin_uri not in _loaded_plugins:
                    errors.append({
                        "plugin_uri": update.plugin_uri,
                        "param_index": update.param_index,
                        "error": "Plugin not loaded"
                    })
                    continue

                # Set parameter in running plugin instance
                plugin_info = _loaded_plugins.get(update.plugin_uri, {})
                parameters = plugin_info.get("parameters", [])
                symbol = None

                if update.param_index < len(parameters):
                    symbol = parameters[update.param_index].get("symbol", "")

                try:
                    from app.services.juce_engine_service import get_audio_engine
                    engine = get_audio_engine()
                    if engine.is_available and engine.is_running and symbol:
                        await engine.set_parameter(update.plugin_uri, symbol, update.value)
                except Exception as e:
                    logger.warning(f"Error setting batch parameter: {e}")

                results.append({
                    "plugin_uri": update.plugin_uri,
                    "param_index": update.param_index,
                    "value": update.value
                })

            except Exception as e:
                errors.append({
                    "plugin_uri": update.plugin_uri,
                    "param_index": update.param_index,
                    "error": str(e)
                })

        # Publish batch parameter change event (single event for all changes)
        if results:
            await event_publisher.publish(
                "plugin_params",
                EventType.PLUGIN_PARAMETER_CHANGED,
                {"batch": True, "updates": results}
            )

        return {
            "status": "batch_complete",
            "applied": len(results),
            "errors": len(errors),
            "results": results,
            "error_details": errors if errors else None
        }

    # ============================================
    # Multi-Format Plugin Endpoints (JUCE)
    # ============================================

    class PluginInfoResponse(BaseModel):
        """Plugin information response"""
        uri: str
        name: str
        author: str
        brand: str
        category: str
        version: str
        format: str
        formatName: str
        filePath: str
        audioInputs: int
        audioOutputs: int
        hasMidiInput: bool
        hasMidiOutput: bool
        latencySamples: int
        supportsDoublePrecision: bool = False
        numSidechainBuses: int = 0

    class ScanStatusResponse(BaseModel):
        """Plugin scan status response"""
        isScanning: bool
        progress: float
        currentPath: str
        totalFound: int
        errors: List[str]

    def _transform_juce_plugin(p: dict) -> dict:
        """Transform a JUCE plugin info to API response format."""
        return {
            "uri": p.get("uri", ""),
            "name": p.get("name", "Unknown"),
            "author": p.get("author", "Unknown"),
            "brand": p.get("brand", p.get("author", "")),
            "category": p.get("category", "Uncategorized"),
            "version": p.get("version", "1.0"),
            "format": p.get("format", "Unknown"),
            "formatName": p.get("format_name", p.get("format", "Unknown")),
            "filePath": p.get("file_path", ""),
            "audioInputs": p.get("audio_inputs", 0),
            "audioOutputs": p.get("audio_outputs", 0),
            "hasMidiInput": p.get("has_midi_input", False),
            "hasMidiOutput": p.get("has_midi_output", False),
            "latencySamples": p.get("latency_samples", 0),
            "supportsDoublePrecision": p.get("supports_double", False),
            "numSidechainBuses": p.get("sidechain_buses", 0)
        }

    @router.get("/all")
    async def get_all_plugins():
        """Get all available plugins across all formats (AU, LV2, LADSPA)"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_all_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting all plugins: {e}")
            return []

    @router.get("/au")
    async def get_au_plugins():
        """Get all AudioUnit plugins"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_au_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting AU plugins: {e}")
            return []

    @router.get("/scan-status")
    async def get_scan_status():
        """Get current plugin scan status"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            status = await engine.get_plugin_scan_status()
            return ScanStatusResponse(
                isScanning=status.get("is_scanning", False),
                progress=status.get("progress", 0.0),
                currentPath=status.get("current_path", ""),
                totalFound=status.get("total_found", 0),
                errors=status.get("errors", [])
            )
        except Exception as e:
            logger.error(f"Error getting scan status: {e}")
            return ScanStatusResponse(
                isScanning=False,
                progress=0.0,
                currentPath="",
                totalFound=0,
                errors=[str(e)]
            )

    @router.post("/scan")
    async def scan_all_plugins(format: str = Query(None, description="Plugin format to scan (AU, LV2, All)")):
        """Trigger a plugin scan for all formats or a specific format"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            await engine.scan_plugins(format=format)
            return {"success": True, "message": f"Plugin scan started for format: {format or 'All'}"}
        except Exception as e:
            logger.error(f"Error starting plugin scan: {e}")
            raise HTTPException(status_code=500, detail=str(e))

except ImportError:
    router = None
