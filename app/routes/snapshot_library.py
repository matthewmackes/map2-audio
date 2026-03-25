"""
Snapshot library routes.
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class CreateSnapshotRequest(BaseModel):
    """Create snapshot request"""
    name: str
    chain_id: int
    plugin_states: Dict[str, Any]
    tags: List[str] = []
    category: str = "User"
    description: str = ""
    is_favorite: bool = False


class UpdateSnapshotRequest(BaseModel):
    """Update snapshot request"""
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    category: Optional[str] = None
    description: Optional[str] = None
    is_favorite: Optional[bool] = None


@router.post("/")
async def create_snapshot(request: CreateSnapshotRequest) -> Dict[str, Any]:
    """
    Create a new snapshot
    
    Request body:
    - name: Snapshot name
    - chain_id: Associated chain ID
    - plugin_states: Plugin state data
    - tags: Snapshot tags (optional)
    - category: Snapshot category (optional)
    - description: Snapshot description (optional)
    - is_favorite: Mark as favorite (optional)
    
    Returns:
        Created snapshot info
    """
    try:
        from app.database import get_session
        from app.services.chain_service import ChainService
        
        async with get_session() as session:
            service = ChainService(session)
            
            snapshot_data = {
                **request.plugin_states,
                'tags': request.tags,
                'category': request.category,
                'description': request.description,
                'is_favorite': request.is_favorite
            }

            snapshot_id = await service.save_preset(
                chain_id=request.chain_id,
                preset_name=request.name,
                preset_data=snapshot_data
            )

            if not snapshot_id:
                raise HTTPException(status_code=500, detail="Failed to create snapshot")

            return {
                "status": "success",
                "snapshot_id": snapshot_id,
                "message": f"Created snapshot: {request.name}"
            }
            
    except Exception as e:
        logger.error(f"Error creating snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/")
async def list_snapshots(
    category: Optional[str] = None,
    tags: Optional[str] = None,
    favorites_only: bool = False,
    search: Optional[str] = None
) -> Dict[str, Any]:
    """
    List snapshots with filtering
    
    Query parameters:
    - category: Filter by category (optional)
    - tags: Comma-separated tags filter (optional)
    - favorites_only: Show only favorites (optional)
    - search: Search query for name/description (optional)
    
    Returns:
        List of snapshots
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
            snapshots = result.scalars().all()
            
            # Filter by tags if specified
            if tags:
                tag_list = [t.strip() for t in tags.split(',')]
                snapshots = [
                    p for p in snapshots
                    if any(tag in p.tags for tag in tag_list)
                ]
            
            snapshot_list = [
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
                for p in snapshots
            ]
            
            return {
                "snapshots": snapshot_list,
                "count": len(snapshot_list)
            }
            
    except Exception as e:
        logger.error(f"Error listing snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
async def get_categories() -> Dict[str, Any]:
    """
    Get all snapshot categories
    
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
    Get all snapshot tags
    
    Returns:
        List of unique tags
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(select(Preset))
            snapshots = result.scalars().all()
            
            # Collect all unique tags
            all_tags = set()
            for snapshot in snapshots:
                all_tags.update(snapshot.tags)
            
            return {
                "tags": sorted(list(all_tags)),
                "count": len(all_tags)
            }
            
    except Exception as e:
        logger.error(f"Error getting tags: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{snapshot_id}")
async def update_snapshot(snapshot_id: int, request: UpdateSnapshotRequest) -> Dict[str, Any]:
    """
    Update snapshot metadata
    
    Path parameters:
    - snapshot_id: Snapshot ID
    
    Request body:
    - name: New name (optional)
    - tags: New tags (optional)
    - category: New category (optional)
    - description: New description (optional)
    - is_favorite: New favorite status (optional)
    
    Returns:
        Updated snapshot info
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()
            
            if not snapshot:
                raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
            
            # Update fields
            if request.name is not None:
                snapshot.name = request.name
            if request.tags is not None:
                snapshot.tags = request.tags
            if request.category is not None:
                snapshot.category = request.category
            if request.description is not None:
                snapshot.description = request.description
            if request.is_favorite is not None:
                snapshot.is_favorite = request.is_favorite
            
            await session.commit()
            
            return {
                "status": "success",
                "message": f"Updated snapshot {snapshot_id}"
            }
            
    except Exception as e:
        logger.error(f"Error updating snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{snapshot_id}/favorite")
async def toggle_favorite(snapshot_id: int) -> Dict[str, Any]:
    """
    Toggle snapshot favorite status
    
    Path parameters:
    - snapshot_id: Snapshot ID
    
    Returns:
        New favorite status
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()
            
            if not snapshot:
                raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
            
            snapshot.is_favorite = not snapshot.is_favorite
            await session.commit()
            
            return {
                "status": "success",
                "is_favorite": snapshot.is_favorite,
                "message": f"{'Added to' if snapshot.is_favorite else 'Removed from'} favorites"
            }
            
    except Exception as e:
        logger.error(f"Error toggling snapshot favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int) -> Dict[str, str]:
    """
    Delete a snapshot
    
    Path parameters:
    - snapshot_id: Snapshot ID
    
    Returns:
        Deletion confirmation
    """
    try:
        from app.database import get_session, Preset
        from sqlalchemy import select
        
        async with get_session() as session:
            result = await session.execute(
                select(Preset).filter(Preset.id == snapshot_id)
            )
            snapshot = result.scalar_one_or_none()
            
            if not snapshot:
                raise HTTPException(status_code=404, detail=f"Snapshot {snapshot_id} not found")
            
            session.delete(snapshot)
            await session.commit()
            
            return {
                "status": "success",
                "message": f"Deleted snapshot {snapshot_id}"
            }
            
    except Exception as e:
        logger.error(f"Error deleting snapshot: {e}")
        raise HTTPException(status_code=500, detail=str(e))
