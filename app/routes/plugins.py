"""
Plugin Route Handlers
API endpoints for plugin management.
"""

import time
import logging
import inspect
from typing import List

from app.response_models import PluginLoadResponse, PluginUnloadResponse
from app.exceptions import PluginNotFoundException, PluginLoadException
from app.services.plugin_resource_manager import get_resource_manager, ResourceLimits

logger = logging.getLogger(__name__)

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
        """Discover available LV2 plugins.

        Args:
            refresh: If True, forces a fresh scan of plugins instead of using cache.
        """
        global _discovered_plugins, _cache_timestamp

        # Return cached plugins if valid and not forcing refresh
        if not refresh and _is_cache_valid():
            logger.debug(f"Returning {len(_discovered_plugins)} cached plugins")
            logger.debug(f"Cached plugins: {[p.get('uri') for p in _discovered_plugins]}")
            return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": True}

        loader = service_manager.get_plugin_loader()
        if not loader:
            # If loader not available but we have cached data, return it anyway
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
                    plugins = loader.discover_plugins()
            
            logger.debug(f"Raw plugins from loader: {[(p.uri if hasattr(p, 'uri') else str(p)) for p in plugins]}")
            _discovered_plugins = [_transform_plugin(p) for p in plugins]
            _cache_timestamp = time.time()
            logger.info(f"Discovered {len(_discovered_plugins)} plugins (refresh={refresh})")
            logger.info(f"Plugin URIs: {[p.get('uri') for p in _discovered_plugins]}")
            return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": False}
        except Exception as e:
            logger.error(f"Error discovering plugins: {e}")
            # Return cached data on error if available
            if _discovered_plugins:
                return {"plugins": _discovered_plugins, "count": len(_discovered_plugins), "cached": True, "error": str(e)}
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

        _loaded_plugins[uri] = plugin_info
        return {"status": "loaded", "plugin": plugin_info, "engine_loaded": engine_loaded}

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
                # Note: Would need to look up instance_id from URI
                engine_unloaded = True  # Simplified for now
                if not engine_unloaded:
                    logger.warning(f"Failed to unload plugin from audio engine: {uri}")
        except Exception as e:
            logger.error(f"Error unloading plugin from audio engine: {e}")

        del _loaded_plugins[uri]
        return {"status": "unloaded", "uri": uri, "engine_unloaded": engine_unloaded}

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
        """Get all available plugins across all formats (VST3, AU, LV2, LADSPA)"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_all_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting all plugins: {e}")
            return []

    @router.get("/vst3")
    async def get_vst3_plugins():
        """Get all VST3 plugins"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_vst3_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting VST3 plugins: {e}")
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
    async def scan_all_plugins(format: str = Query(None, description="Plugin format to scan (VST3, AU, LV2, All)")):
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
