"""
Plugin Scanner Routes - API endpoints for plugin discovery
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException

from app.services.plugin_scanner import get_plugin_scanner

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/plugins/scan", tags=["plugin-scanner"])


def _get_scanner():
    return get_plugin_scanner()


@router.post("/all")
async def scan_all_plugins(force_rescan: bool = False) -> Dict[str, Any]:
    """
    Scan all LV2 plugins

    Query parameters:
    - force_rescan: Force rescan even if cached (default: false)

    Returns:
        Scan results with plugin count
    """
    scanner = _get_scanner()
    try:
        plugins = scanner.scan_all(force_rescan)

        return {
            "status": "success",
            "message": f"Scanned {len(plugins)} plugins",
            "plugin_count": len(plugins),
            "plugins": [p.to_dict() for p in plugins.values()]
        }

    except Exception as e:
        logger.error(f"Error scanning plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugin")
async def get_plugin_info(uri: str) -> Dict[str, Any]:
    """
    Get plugin metadata by URI

    Query parameters:
    - uri: Plugin URI

    Returns:
        Plugin metadata
    """
    plugin = _get_scanner().get_plugin(uri)

    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin not found: {uri}")

    return plugin.to_dict()


@router.get("/search")
async def search_plugins(
    query: str = "",
    category: Optional[str] = None,
    min_audio_inputs: Optional[int] = None,
    max_audio_inputs: Optional[int] = None,
    min_audio_outputs: Optional[int] = None,
    max_audio_outputs: Optional[int] = None
) -> Dict[str, Any]:
    """
    Search plugins by criteria

    Query parameters:
    - query: Name search query (optional)
    - category: Plugin category filter (optional)
    - min_audio_inputs: Minimum audio inputs (optional)
    - max_audio_inputs: Maximum audio inputs (optional)
    - min_audio_outputs: Minimum audio outputs (optional)
    - max_audio_outputs: Maximum audio outputs (optional)

    Returns:
        List of matching plugins
    """
    scanner = _get_scanner()
    try:
        results = scanner.search_plugins(
            query=query,
            category=category,
            min_audio_inputs=min_audio_inputs,
            max_audio_inputs=max_audio_inputs,
            min_audio_outputs=min_audio_outputs,
            max_audio_outputs=max_audio_outputs
        )

        return {
            "query": query,
            "category": category,
            "results": [p.to_dict() for p in results],
            "count": len(results)
        }

    except Exception as e:
        logger.error(f"Error searching plugins: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_categories() -> Dict[str, Any]:
    """
    Get all plugin categories

    Returns:
        List of categories
    """
    categories = _get_scanner().get_categories()

    return {
        "categories": categories,
        "count": len(categories)
    }


@router.post("/clear-cache")
async def clear_cache() -> Dict[str, str]:
    """
    Clear plugin cache

    Returns:
        Success message
    """
    _get_scanner().clear_cache()

    return {
        "status": "success",
        "message": "Plugin cache cleared"
    }


@router.get("/cache-status")
async def get_cache_status() -> Dict[str, Any]:
    """
    Get plugin cache status

    Returns:
        Cache statistics
    """
    scanner = _get_scanner()
    return {
        "cached_plugins": len(scanner.plugin_cache),
        "cache_file": str(scanner.cache_file),
        "lv2_paths": [str(p) for p in scanner.lv2_paths]
    }
