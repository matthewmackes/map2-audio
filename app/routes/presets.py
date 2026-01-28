"""
Preset Browser Routes - Enhanced preset management
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/presets", tags=["presets"])


class CreatePresetRequest(BaseModel):
    """Create preset request"""
    name: str
    chain_id: int
    plugin_states: Dict[str, Any]
    tags: List[str] = []
    category: str = "User"
    description: str = ""
    is_favorite: bool = False


class UpdatePresetRequest(BaseModel):
    """Update preset request"""
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_favorite: Optional[bool] = None


@router.post("/")
async def create_preset(request: CreatePresetRequest) -> Dict[str, Any]:
    """
    Create a new preset
    
    Request body:
    - name: Preset name
    - chain_id: Associated chain ID
    - plugin_states: Plugin state data
    - tags: Preset tags (optional)
    - category: Preset category (optional)
    - description: Preset description (optional)
    - is_favorite: Mark as favorite (optional)
    
    Returns:
        Created preset info
    """
    try:
        from app.database import get_session
        from app.services.chain_service import ChainService
        
        async with get_session() as session:
            service = ChainService(session)
            
            preset_data = {
                **request.plugin_states,
                'tags': request.tags,
                'category': request.category,
                'description': request.description,
                'is_favorite': request.is_favorite
            }
            
            preset_id = await service.save_preset(
                chain_id=request.chain_id,
                preset_name=request.name,
                preset_data=preset_data
            )
            
            if not preset_id:
                raise HTTPException(status_code=500, detail="Failed to create preset")
            
            return {
                "status": "success",
                "preset_id": preset_id,
                "message": f"Created preset: {request.name}"
            }
            
    except Exception as e:
        logger.error(f"Error creating preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def list_presets(
    category: Optional[str] = None,
    tags: Optional[str] = None,
    favorites_only: bool = False,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    List presets with filtering
    
    Query parameters:
    - category: Filter by category (optional)
    - tags: Comma-separated tags filter (optional)
    - favorites_only: Show only favorites (optional)
    - search: Search query for name/description (optional)
    
    Returns:
        List of presets
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            query = select(Preset)
            
            # Apply filters
            if category:
                query = query.filter(Preset.category == category)
            
            if favorites_only:
                query = query.filter(Preset.is_favorite == True)
            
            if search:
                search_lower = f"%{search.lower()}%"
                query = query.filter(
                    (Preset.name.ilike(search_lower)) |
                    (Preset.description.ilike(search_lower))
                )
            
            result = await session.execute(query)
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
                    "chain_id": p.chain_id,
                    "tags": p.tags,
                    "category": p.category,
                    "description": p.description,
                    "is_favorite": p.is_favorite,
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
        logger.error(f"Error listing presets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_categories() -> Dict[str, Any]:
    """
    Get all preset categories
    
    Returns:
        List of categories
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select, func
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset.category, func.count(Preset.id))
                .group_by(Preset.category)
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


@router.get("/tags")
async def get_all_tags() -> Dict[str, Any]:
    """
    Get all preset tags
    
    Returns:
        List of unique tags
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(select(Preset))
            presets = result.scalars().all()
            
            # Collect all unique tags
            all_tags = set()
            for preset in presets:
                all_tags.update(preset.tags)
            
            return {
                "tags": sorted(list(all_tags)),
                "count": len(all_tags)
            }
            
    except Exception as e:
        logger.error(f"Error getting tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{preset_id}")
async def update_preset(preset_id: int, request: UpdatePresetRequest) -> Dict[str, Any]:
    """
    Update preset metadata
    
    Path parameters:
    - preset_id: Preset ID
    
    Request body:
    - name: New name (optional)
    - tags: New tags (optional)
    - category: New category (optional)
    - description: New description (optional)
    - is_favorite: New favorite status (optional)
    
    Returns:
        Updated preset info
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            # Update fields
            if request.name is not None:
                preset.name = request.name
            if request.tags is not None:
                preset.tags = request.tags
            if request.category is not None:
                preset.category = request.category
            if request.description is not None:
                preset.description = request.description
            if request.is_favorite is not None:
                preset.is_favorite = request.is_favorite
            
            await session.commit()
            
            return {
                "status": "success",
                "message": f"Updated preset {preset_id}"
            }
            
    except Exception as e:
        logger.error(f"Error updating preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{preset_id}/favorite")
async def toggle_favorite(preset_id: int) -> Dict[str, Any]:
    """
    Toggle preset favorite status
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        New favorite status
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            preset.is_favorite = not preset.is_favorite
            await session.commit()
            
            return {
                "status": "success",
                "is_favorite": preset.is_favorite,
                "message": f"{'Added to' if preset.is_favorite else 'Removed from'} favorites"
            }
            
    except Exception as e:
        logger.error(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{preset_id}")
async def delete_preset(preset_id: int) -> Dict[str, str]:
    """
    Delete a preset
    
    Path parameters:
    - preset_id: Preset ID
    
    Returns:
        Deletion confirmation
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset:
                raise HTTPException(status_code=404, detail=f"Preset {preset_id} not found")
            
            session.delete(preset)
            await session.commit()
            
            return {
                "status": "success",
                "message": f"Deleted preset {preset_id}"
            }
            
    except Exception as e:
        logger.error(f"Error deleting preset: {e}")
        raise HTTPException(status_code=500, detail=str(e))
