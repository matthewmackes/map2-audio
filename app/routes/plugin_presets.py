"""
Plugin Presets Routes - Save and manage individual plugin parameter presets
Separate from chain presets - focuses on reusable parameter configurations
Integrates with lifecycle management system for event handling.
"""

import logging
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/plugin-presets", tags=["plugin-presets"])


class CreatePluginPresetRequest(BaseModel):
    """Create plugin preset request"""
    name: str
    plugin_uri: str
    plugin_name: str
    parameters: Dict[str, Any]  # {param_symbol: value, ...}
    tags: List[str] = []
    category: str = "User"
    description: str = ""
    is_favorite: bool = False
    is_default: bool = False


class UpdatePluginPresetRequest(BaseModel):
    """Update plugin preset request"""
    name: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_favorite: Optional[bool] = None
    is_default: Optional[bool] = None


@router.post("/")
async def create_plugin_preset(request: CreatePluginPresetRequest) -> Dict[str, Any]:
    """
    Create a new plugin parameter preset
    
    Request body:
    - name: Preset name
    - plugin_uri: Plugin URI (e.g., "http://calf.sourceforge.net/plugins/Reverb")
    - plugin_name: Plugin display name
    - parameters: Parameter values {symbol: value}
    - tags: Preset tags (optional)
    - category: Preset category (optional)
    - description: Preset description (optional)
    - is_favorite: Mark as favorite (optional)
    - is_default: Set as default for this plugin (optional)
    
    Returns:
        Created preset info
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            # Check if preset with same name already exists for this plugin
            result = await session.execute(
                select(PluginPreset).filter(
                    (PluginPreset.plugin_uri == request.plugin_uri) &
                    (PluginPreset.name == request.name)
                )
            )
            existing = result.scalar_one_or_none()
            
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"Preset '{request.name}' already exists for this plugin"
                )
            
            # If setting as default, unset other defaults for this plugin
            if request.is_default:
                await session.execute(
                    select(PluginPreset)
                    .filter(
                        (PluginPreset.plugin_uri == request.plugin_uri) &
                        (PluginPreset.is_default == True)
                    )
                )
                defaults = (await session.execute(
                    select(PluginPreset).filter(
                        (PluginPreset.plugin_uri == request.plugin_uri) &
                        (PluginPreset.is_default == True)
                    )
                )).scalars().all()
                for default in defaults:
                    default.is_default = False
            
            # Create new preset
            preset = PluginPreset(
                name=request.name,
                plugin_uri=request.plugin_uri,
                plugin_name=request.plugin_name,
                parameters=json.dumps(request.parameters),
                tags=request.tags,
                category=request.category,
                description=request.description,
                is_favorite=request.is_favorite,
                is_default=request.is_default
            )
            session.add(preset)
            await session.flush()
            await session.refresh(preset)
            
            # Emit lifecycle event
            try:
                from app.services.plugin_preset_lifecycle import get_preset_lifecycle
                lifecycle = get_preset_lifecycle()
                await lifecycle.on_preset_created(
                    preset.id,
                    request.name,
                    request.plugin_uri,
                    request.parameters
                )
            except Exception as e:
                logger.warning(f"Failed to emit lifecycle event: {e}")
            
            logger.info(f"Created plugin preset: {request.name} for {request.plugin_uri}")
            
            return {
                "status": "success",
                "preset_id": preset.id,
                "message": f"Created preset: {request.name}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating plugin preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def list_plugin_presets(
    plugin_uri: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[str] = None,
    favorites_only: bool = False,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    List plugin presets with filtering
    
    Query parameters:
    - plugin_uri: Filter by plugin URI (optional)
    - category: Filter by category (optional)
    - tags: Comma-separated tags filter (optional)
    - favorites_only: Show only favorites (optional)
    - search: Search query for name/description (optional)
    
    Returns:
        List of presets
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            query = select(PluginPreset)
            
            # Apply filters
            if plugin_uri:
                query = query.filter(PluginPreset.plugin_uri == plugin_uri)
            
            if category:
                query = query.filter(PluginPreset.category == category)
            
            if favorites_only:
                query = query.filter(PluginPreset.is_favorite == True)
            
            if search:
                search_lower = f"%{search.lower()}%"
                query = query.filter(
                    (PluginPreset.name.ilike(search_lower)) |
                    (PluginPreset.description.ilike(search_lower)) |
                    (PluginPreset.plugin_name.ilike(search_lower))
                )
            
            result = await session.execute(query.order_by(PluginPreset.is_favorite.desc(), PluginPreset.name))
            presets = result.scalars().all()
            
            # Filter by tags if specified
            if tags:
                tag_list = [t.strip() for t in tags.split(',')]
                presets = [
                    p for p in presets
                    if any(tag in p.tags for tag in tag_list)
                ]
            
            preset_list = [
                {
                    "id": p.id,
                    "name": p.name,
                    "plugin_uri": p.plugin_uri,
                    "plugin_name": p.plugin_name,
                    "parameters": json.loads(p.parameters),
                    "tags": p.tags,
                    "category": p.category,
                    "description": p.description,
                    "is_favorite": p.is_favorite,
                    "is_default": p.is_default,
                    "usage_count": p.usage_count,
                    "created_at": p.created_at.isoformat(),
                    "updated_at": p.updated_at.isoformat()
                }
                for p in presets
            ]
            
            return {
                "presets": preset_list,
                "count": len(preset_list)
            }
            
    except Exception as e:
        logger.error(f"Error listing plugin presets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{preset_id}")
async def get_plugin_preset(preset_id: int) -> Dict[str, Any]:
    """
    Get a specific plugin preset
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        Preset details
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset).filter(PluginPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            return {
                "id": preset.id,
                "name": preset.name,
                "plugin_uri": preset.plugin_uri,
                "plugin_name": preset.plugin_name,
                "parameters": json.loads(preset.parameters),
                "tags": preset.tags,
                "category": preset.category,
                "description": preset.description,
                "is_favorite": preset.is_favorite,
                "is_default": preset.is_default,
                "usage_count": preset.usage_count,
                "created_at": preset.created_at.isoformat(),
                "updated_at": preset.updated_at.isoformat()
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting plugin preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{preset_id}")
async def update_plugin_preset(
    preset_id: int,
    request: UpdatePluginPresetRequest
) -> Dict[str, Any]:
    """
    Update plugin preset metadata
    
    Path parameters:
    - preset_id: Preset ID
    
    Request body:
    - name: New name (optional)
    - parameters: New parameters (optional)
    - tags: New tags (optional)
    - category: New category (optional)
    - description: New description (optional)
    - is_favorite: New favorite status (optional)
    - is_default: New default status (optional)
    
    Returns:
        Updated preset info
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset).filter(PluginPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            # If setting as default, unset other defaults for this plugin
            if request.is_default is not None and request.is_default:
                defaults = (await session.execute(
                    select(PluginPreset).filter(
                        (PluginPreset.plugin_uri == preset.plugin_uri) &
                        (PluginPreset.is_default == True) &
                        (PluginPreset.id != preset_id)
                    )
                )).scalars().all()
                for default in defaults:
                    default.is_default = False
            
            # Update fields
            if request.name is not None:
                preset.name = request.name
            if request.parameters is not None:
                preset.parameters = json.dumps(request.parameters)
            if request.tags is not None:
                preset.tags = request.tags
            if request.category is not None:
                preset.category = request.category
            if request.description is not None:
                preset.description = request.description
            if request.is_favorite is not None:
                preset.is_favorite = request.is_favorite
            if request.is_default is not None:
                preset.is_default = request.is_default
            
            await session.flush()
            await session.refresh(preset)
            
            logger.info(f"Updated plugin preset: {preset_id}")
            
            return {
                "status": "success",
                "preset_id": preset.id,
                "message": f"Updated preset: {preset.name}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating plugin preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{preset_id}")
async def delete_plugin_preset(preset_id: int) -> Dict[str, Any]:
    """
    Delete a plugin preset
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        Deletion confirmation
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset).filter(PluginPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            preset_name = preset.name
            await session.delete(preset)
            
            # Emit lifecycle event
            try:
                from app.services.plugin_preset_lifecycle import get_preset_lifecycle
                lifecycle = get_preset_lifecycle()
                await lifecycle.on_preset_deleted(preset_id, preset_name)
            except Exception as e:
                logger.warning(f"Failed to emit lifecycle event: {e}")
            
            logger.info(f"Deleted plugin preset: {preset_id}")
            
            return {
                "status": "success",
                "deleted_id": preset_id,
                "message": f"Deleted preset: {preset_name}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting plugin preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{preset_id}/favorite")
async def toggle_favorite_preset(preset_id: int) -> Dict[str, Any]:
    """
    Toggle favorite status for a plugin preset
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        Updated favorite status
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset).filter(PluginPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            preset.is_favorite = not preset.is_favorite
            await session.flush()
            await session.refresh(preset)
            
            # Emit lifecycle event
            try:
                from app.services.plugin_preset_lifecycle import get_preset_lifecycle
                lifecycle = get_preset_lifecycle()
                await lifecycle.on_preset_favorite_toggled(preset_id, preset.is_favorite)
            except Exception as e:
                logger.warning(f"Failed to emit lifecycle event: {e}")
            
            logger.info(f"Toggled favorite for plugin preset: {preset_id} -> {preset.is_favorite}")
            
            return {
                "status": "success",
                "preset_id": preset.id,
                "is_favorite": preset.is_favorite,
                "message": f"Preset marked as {'favorite' if preset.is_favorite else 'not favorite'}"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{preset_id}/load")
async def load_plugin_preset(preset_id: int) -> Dict[str, Any]:
    """
    Load a plugin preset (increment usage count)
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        Preset parameters for loading
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset).filter(PluginPreset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            # Increment usage count
            preset.usage_count = (preset.usage_count or 0) + 1
            await session.flush()
            
            # Emit lifecycle event
            try:
                from app.services.plugin_preset_lifecycle import get_preset_lifecycle
                lifecycle = get_preset_lifecycle()
                await lifecycle.on_preset_loaded(preset_id)
            except Exception as e:
                logger.warning(f"Failed to emit lifecycle event: {e}")
            
            logger.info(f"Loaded plugin preset: {preset_id} (usage: {preset.usage_count})")
            
            return {
                "id": preset.id,
                "name": preset.name,
                "plugin_uri": preset.plugin_uri,
                "plugin_name": preset.plugin_name,
                "parameters": json.loads(preset.parameters),
                "usage_count": preset.usage_count
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading plugin preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugin/{plugin_uri}")
async def get_plugin_presets_by_uri(plugin_uri: str) -> Dict[str, Any]:
    """
    Get all presets for a specific plugin
    
    Path parameters:
    - plugin_uri: Plugin URI
    
    Returns:
        List of presets for the plugin
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset)
                .filter(PluginPreset.plugin_uri == plugin_uri)
                .order_by(PluginPreset.is_favorite.desc(), PluginPreset.is_default.desc(), PluginPreset.name)
            )
            presets = result.scalars().all()
            
            # Find default preset
            default_preset = next((p for p in presets if p.is_default), None)
            
            preset_list = [
                {
                    "id": p.id,
                    "name": p.name,
                    "parameters": json.loads(p.parameters),
                    "is_favorite": p.is_favorite,
                    "is_default": p.is_default,
                    "usage_count": p.usage_count,
                    "description": p.description
                }
                for p in presets
            ]
            
            return {
                "plugin_uri": plugin_uri,
                "presets": preset_list,
                "count": len(preset_list),
                "default_preset_id": default_preset.id if default_preset else None
            }
            
    except Exception as e:
        logger.error(f"Error getting presets for plugin: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories/all")
async def get_plugin_preset_categories() -> Dict[str, Any]:
    """
    Get all plugin preset categories
    
    Returns:
        List of categories with counts
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(
                select(PluginPreset.category, func.count(PluginPreset.id))
                .group_by(PluginPreset.category)
            )
            
            categories = [
                {"name": cat, "count": count}
                for cat, count in result.all()
            ]
            
            return {
                "categories": categories,
                "count": len(categories)
            }
            
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tags/all")
async def get_plugin_preset_tags() -> Dict[str, Any]:
    """
    Get all plugin preset tags
    
    Returns:
        List of unique tags
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            result = await session.execute(select(PluginPreset))
            presets = result.scalars().all()
            
            # Collect all unique tags
            all_tags = set()
            for preset in presets:
                all_tags.update(preset.tags or [])
            
            return {
                "tags": sorted(list(all_tags)),
                "count": len(all_tags)
            }
            
    except Exception as e:
        logger.error(f"Error getting tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/favorites/plugins")
async def get_plugins_with_favorite_presets() -> Dict[str, Any]:
    """
    Get all plugins that have at least one favorite preset
    
    Returns:
        List of plugin URIs and names with favorite presets
    """
    try:
        from app.database import get_session, PluginPreset
        
        async with get_session() as session:
            # Get unique plugins with favorite presets
            result = await session.execute(
                select(PluginPreset.plugin_uri, PluginPreset.plugin_name, func.count(PluginPreset.id))
                .filter(PluginPreset.is_favorite == True)
                .group_by(PluginPreset.plugin_uri, PluginPreset.plugin_name)
            )
            
            plugins = [
                {
                    "plugin_uri": uri,
                    "plugin_name": name,
                    "favorite_preset_count": count
                }
                for uri, name, count in result.all()
            ]
            
            return {
                "plugins": plugins,
                "count": len(plugins)
            }
            
    except Exception as e:
        logger.error(f"Error getting plugins with favorites: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== LIFECYCLE MANAGEMENT ENDPOINTS ====================

@router.post("/lifecycle/cleanup")
async def cleanup_unused_presets(days_threshold: int = Query(30)) -> Dict[str, Any]:
    """
    Clean up unused presets (lifecycle maintenance)
    
    Query parameters:
    - days_threshold: Delete presets older than this many days if never used (default: 30)
    
    Returns:
        Number of presets cleaned up
    """
    try:
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        
        lifecycle = get_preset_lifecycle()
        count = await lifecycle.cleanup_unused_presets(days_threshold)
        
        return {
            "status": "success",
            "cleaned_up": count,
            "message": f"Cleaned up {count} unused presets"
        }
        
    except Exception as e:
        logger.error(f"Error in preset cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lifecycle/stats")
async def get_preset_stats() -> Dict[str, Any]:
    """
    Get preset lifecycle statistics
    
    Returns:
        Usage statistics and lifecycle metrics
    """
    try:
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        
        lifecycle = get_preset_lifecycle()
        stats = await lifecycle.get_usage_stats()
        
        return {
            "status": "success",
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"Error getting preset stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lifecycle/startup")
async def startup_preset_lifecycle() -> Dict[str, Any]:
    """
    Initialize preset lifecycle (called on app startup)
    
    Returns:
        Startup status
    """
    try:
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        
        lifecycle = get_preset_lifecycle()
        await lifecycle.startup()
        
        return {
            "status": "success",
            "message": "Plugin preset lifecycle started"
        }
        
    except Exception as e:
        logger.error(f"Error starting preset lifecycle: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lifecycle/shutdown")
async def shutdown_preset_lifecycle() -> Dict[str, Any]:
    """
    Shutdown preset lifecycle (called on app shutdown)
    
    Returns:
        Shutdown status
    """
    try:
        from app.services.plugin_preset_lifecycle import get_preset_lifecycle
        
        lifecycle = get_preset_lifecycle()
        await lifecycle.shutdown()
        
        return {
            "status": "success",
            "message": "Plugin preset lifecycle shut down"
        }
        
    except Exception as e:
        logger.error(f"Error shutting down preset lifecycle: {e}")
        raise HTTPException(status_code=500, detail=str(e))
