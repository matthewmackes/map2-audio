"""
VST3 Plugin Routes - API endpoints for VST3 plugin discovery and management
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query

try:
    from app.services.vst3_discovery import get_vst3_discovery, VST3PluginDiscovery
    VST3_AVAILABLE = True
except ImportError:
    VST3_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vst3", tags=["vst3-plugins"])


@router.get("/discover")
async def discover_vst3_plugins(refresh: bool = False) -> Dict[str, Any]:
    """
    Discover all VST3 plugins on the system.

    Query parameters:
    - refresh: Force rescan even if cached (default: false)

    Returns:
        Plugin discovery results
    """
    if not VST3_AVAILABLE:
        return {
            "plugins": [],
            "count": 0,
            "cached": False,
            "error": "VST3 discovery service not available"
        }

    try:
        discovery = get_vst3_discovery()
        plugins = await discovery.discover_plugins(force_refresh=refresh)

        # Transform to frontend-compatible format
        plugin_list = []
        for plugin in plugins:
            plugin_list.append({
                "uri": plugin.get("uri", ""),
                "name": plugin.get("name", "Unknown"),
                "category": plugin.get("category", "Effect"),
                "author": plugin.get("author", "Unknown"),
                "description": plugin.get("description", ""),
                "format": "VST3",
                "in_ports": plugin.get("audio_inputs", 2),
                "out_ports": plugin.get("audio_outputs", 2),
                "has_ui": plugin.get("has_ui", True),
                "parameters": plugin.get("parameters", []),
                "path": plugin.get("path", ""),
            })

        return {
            "plugins": plugin_list,
            "count": len(plugin_list),
            "cached": not refresh,
        }

    except Exception as e:
        logger.error(f"Error discovering VST3 plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins")
async def list_vst3_plugins() -> Dict[str, Any]:
    """
    List all discovered VST3 plugins.

    Returns:
        List of VST3 plugins
    """
    if not VST3_AVAILABLE:
        return {"plugins": [], "count": 0}

    try:
        discovery = get_vst3_discovery()
        plugins = list(discovery.plugins.values())

        plugin_list = []
        for plugin in plugins:
            plugin_list.append({
                "uri": plugin.get("uri", ""),
                "name": plugin.get("name", "Unknown"),
                "category": plugin.get("category", "Effect"),
                "author": plugin.get("author", "Unknown"),
                "description": plugin.get("description", ""),
                "format": "VST3",
                "in_ports": plugin.get("audio_inputs", 2),
                "out_ports": plugin.get("audio_outputs", 2),
                "has_ui": plugin.get("has_ui", True),
                "parameters": plugin.get("parameters", []),
            })

        return {
            "plugins": plugin_list,
            "count": len(plugin_list)
        }

    except Exception as e:
        logger.error(f"Error listing VST3 plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugin")
async def get_vst3_plugin(uri: str, load_parameters: bool = False) -> Dict[str, Any]:
    """
    Get VST3 plugin metadata by URI.

    Query parameters:
    - uri: Plugin URI
    - load_parameters: If true, instantiate plugin to load real parameters (slower)

    Returns:
        Plugin metadata
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")

    discovery = get_vst3_discovery()
    plugin = discovery.get_plugin_by_uri(uri)

    if not plugin:
        raise HTTPException(status_code=404, detail=f"VST3 plugin not found: {uri}")

    parameters = plugin.get("parameters", [])
    
    # If requested and parameters are empty, try to load from JUCE
    if load_parameters and len(parameters) == 0:
        try:
            # TODO: Implement JUCE engine parameter loading
            # For now, return with a flag indicating parameters need loading
            logger.info(f"Parameters requested for {uri} but not yet implemented via JUCE")
        except Exception as e:
            logger.error(f"Failed to load parameters for {uri}: {e}")

    return {
        "uri": plugin.get("uri", ""),
        "name": plugin.get("name", "Unknown"),
        "category": plugin.get("category", "Effect"),
        "author": plugin.get("author", "Unknown"),
        "description": plugin.get("description", ""),
        "format": "VST3",
        "path": plugin.get("path", ""),
        "binary_path": plugin.get("binary_path", ""),
        "in_ports": plugin.get("audio_inputs", 2),
        "out_ports": plugin.get("audio_outputs", 2),
        "has_ui": plugin.get("has_ui", True),
        "parameters": parameters,
        "parameters_available": len(parameters) > 0,
    }


@router.get("/search")
async def search_vst3_plugins(
    query: str = "",
    category: Optional[str] = None,
    author: Optional[str] = None
) -> Dict[str, Any]:
    """
    Search VST3 plugins by criteria.

    Query parameters:
    - query: Name search query (optional)
    - category: Plugin category filter (optional)
    - author: Author filter (optional)

    Returns:
        List of matching plugins
    """
    if not VST3_AVAILABLE:
        return {"results": [], "count": 0}

    try:
        discovery = get_vst3_discovery()
        results = discovery.search_plugins(
            query=query,
            category=category,
            author=author
        )

        plugin_list = []
        for plugin in results:
            plugin_list.append({
                "uri": plugin.get("uri", ""),
                "name": plugin.get("name", "Unknown"),
                "category": plugin.get("category", "Effect"),
                "author": plugin.get("author", "Unknown"),
                "description": plugin.get("description", ""),
                "format": "VST3",
                "in_ports": plugin.get("audio_inputs", 2),
                "out_ports": plugin.get("audio_outputs", 2),
                "has_ui": plugin.get("has_ui", True),
            })

        return {
            "query": query,
            "category": category,
            "author": author,
            "results": plugin_list,
            "count": len(plugin_list)
        }

    except Exception as e:
        logger.error(f"Error searching VST3 plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_vst3_categories() -> Dict[str, Any]:
    """
    Get all VST3 plugin categories.

    Returns:
        List of categories
    """
    if not VST3_AVAILABLE:
        return {"categories": [], "count": 0}

    discovery = get_vst3_discovery()
    categories = discovery.get_categories()

    return {
        "categories": categories,
        "count": len(categories)
    }


@router.post("/refresh")
async def refresh_vst3_plugins() -> Dict[str, Any]:
    """
    Force refresh VST3 plugin discovery (rescan all paths).

    Returns:
        Refresh results
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")

    try:
        discovery = get_vst3_discovery()
        plugins = await discovery.discover_plugins(force_refresh=True)

        return {
            "status": "success",
            "message": f"Refreshed {len(plugins)} VST3 plugins",
            "plugin_count": len(plugins)
        }

    except Exception as e:
        logger.error(f"Error refreshing VST3 plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-cache")
async def clear_vst3_cache() -> Dict[str, str]:
    """
    Clear VST3 plugin cache.

    Returns:
        Success message
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")

    VST3PluginDiscovery.invalidate_cache()

    return {
        "status": "success",
        "message": "VST3 plugin cache cleared"
    }


@router.get("/cache-status")
async def get_vst3_cache_status() -> Dict[str, Any]:
    """
    Get VST3 plugin cache status.

    Returns:
        Cache statistics
    """
    if not VST3_AVAILABLE:
        return {
            "cached_plugins": 0,
            "cache_loaded": False,
            "vst3_paths": []
        }

    discovery = get_vst3_discovery()

    return {
        "cached_plugins": len(discovery.plugins),
        "cache_loaded": VST3PluginDiscovery._cache_loaded,
        "cache_timestamp": VST3PluginDiscovery._cache_timestamp,
        "vst3_paths": discovery._get_vst3_paths()
    }


@router.get("/paths")
async def get_vst3_paths() -> Dict[str, Any]:
    """
    Get VST3 search paths.

    Returns:
        List of search paths and their status
    """
    if not VST3_AVAILABLE:
        return {"paths": []}

    import os
    discovery = get_vst3_discovery()
    paths = discovery._get_vst3_paths()

    path_info = []
    for path in paths:
        exists = os.path.isdir(path)
        plugin_count = 0
        if exists:
            try:
                plugin_count = len([f for f in os.listdir(path) if f.endswith('.vst3')])
            except OSError:
                pass

        path_info.append({
            "path": path,
            "exists": exists,
            "plugin_count": plugin_count
        })

    return {"paths": path_info}


@router.post("/load")
async def load_vst3_plugin(uri: str) -> Dict[str, Any]:
    """
    Load a VST3 plugin instance.

    Query parameters:
    - uri: Plugin URI

    Returns:
        Loaded plugin instance info
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")

    discovery = get_vst3_discovery()
    instance = await discovery.load_plugin(uri)

    if not instance:
        raise HTTPException(status_code=404, detail=f"Failed to load VST3 plugin: {uri}")

    return {
        "status": "success",
        "instance": instance
    }


@router.post("/unload")
async def unload_vst3_plugin(instance_id: str) -> Dict[str, Any]:
    """
    Unload a VST3 plugin instance.

    Query parameters:
    - instance_id: Plugin instance ID

    Returns:
        Unload status
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")

    discovery = get_vst3_discovery()
    success = await discovery.unload_plugin(instance_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Plugin instance not found: {instance_id}")

    return {
        "status": "success",
        "message": f"Unloaded plugin instance: {instance_id}"
    }


@router.get("/parameters")
async def get_vst3_plugin_parameters(uri: str) -> Dict[str, Any]:
    """
    Get VST3 plugin parameters by loading through JUCE engine (when implemented).
    
    Query parameters:
    - uri: Plugin URI
    
    Returns:
        Plugin parameters with metadata
    """
    if not VST3_AVAILABLE:
        raise HTTPException(status_code=503, detail="VST3 discovery service not available")
    
    try:
        from app.services.vst3_parameter_loader import get_vst3_parameter_info
        
        # Get parameter information
        param_info = get_vst3_parameter_info(uri)
        
        return param_info
        
    except ImportError as e:
        logger.error(f"Failed to import parameter loader: {e}")
        return {
            "uri": uri,
            "parameters": [],
            "parameter_count": 0,
            "requires_instantiation": True,
            "message": "Parameter loading module not available",
            "error": str(e)
        }
    except Exception as e:
        logger.error(f"Error getting parameters for {uri}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
