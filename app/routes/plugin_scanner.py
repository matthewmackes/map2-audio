"""
Plugin Scanner Routes - API endpoints for plugin discovery
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException

try:
    from app.services.plugin_scanner import plugin_scanner
    SCANNER_AVAILABLE = True
except ImportError:
    SCANNER_AVAILABLE = False
    plugin_scanner = None

logger = logging.getLogger(__name__)

if SCANNER_AVAILABLE:
    router = APIRouter(prefix="/api/plugins/scan", tags=["plugin-scanner"])
    
    @router.post("/all")
    async def scan_all_plugins(force_rescan: bool = False) -> Dict[str, Any]:
        """
        Scan all LV2 plugins
        
        Query parameters:
        - force_rescan: Force rescan even if cached (default: false)
        
        Returns:
            Scan results with plugin count
        """
        try:
            plugins = plugin_scanner.scan_all(force_rescan)
            
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
        plugin = plugin_scanner.get_plugin(uri)
        
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
        try:
            results = plugin_scanner.search_plugins(
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
        categories = plugin_scanner.get_categories()
        
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
        plugin_scanner.clear_cache()
        
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
        return {
            "cached_plugins": len(plugin_scanner.plugin_cache),
            "cache_file": str(plugin_scanner.cache_file),
            "lv2_paths": [str(p) for p in plugin_scanner.lv2_paths]
        }
else:
    router = None
    logger.warning("Plugin scanner service not available")
