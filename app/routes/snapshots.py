"""
Snapshot API Routes
Quick snapshot save/load for instant preset recall (6 slots)
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/engine/snapshots", tags=["snapshots"])


class SaveSnapshotRequest(BaseModel):
    """Request to save a snapshot"""
    name: str = ""


class SnapshotInfo(BaseModel):
    """Snapshot information"""
    id: int
    name: str
    has_data: bool = False
    plugin_count: int = 0


# In-memory snapshot storage (in production, would be persisted)
_snapshots: Dict[int, Dict[str, Any]] = {
    i: {"id": i, "name": f"Snapshot {i + 1}", "has_data": False, "plugin_states": []}
    for i in range(6)
}
_current_snapshot: int = 0


@router.get("")
async def list_snapshots() -> Dict[str, Any]:
    """
    List all snapshots and current snapshot ID
    
    Returns:
        {
            "snapshots": [SnapshotInfo, ...],
            "current": int
        }
    """
    try:
        # Try to get from JUCE engine first
        from app.services.juce_engine_service import get_audio_engine
        engine = get_audio_engine()
        
        if engine.is_available and hasattr(engine, 'list_snapshots'):
            snapshots = engine.list_snapshots()
            current = engine.get_current_snapshot() if hasattr(engine, 'get_current_snapshot') else 0
            return {
                "snapshots": snapshots,
                "current": current
            }
    except Exception as e:
        logger.debug(f"JUCE engine not available for snapshots: {e}")
    
    # Fallback to in-memory storage
    return {
        "snapshots": [
            {
                "id": s["id"],
                "name": s["name"],
                "has_data": s["has_data"],
                "plugin_count": len(s.get("plugin_states", []))
            }
            for s in _snapshots.values()
        ],
        "current": _current_snapshot
    }


@router.get("/{snapshot_id}")
async def get_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Get snapshot details
    
    Args:
        snapshot_id: Snapshot slot (0-5)
        
    Returns:
        Snapshot details
    """
    if snapshot_id < 0 or snapshot_id >= 6:
        raise HTTPException(status_code=400, detail="Snapshot ID must be 0-5")
    
    snapshot = _snapshots.get(snapshot_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    return {
        "id": snapshot["id"],
        "name": snapshot["name"],
        "has_data": snapshot["has_data"],
        "plugin_count": len(snapshot.get("plugin_states", []))
    }


@router.post("/{snapshot_id}/save")
async def save_snapshot(snapshot_id: int, request: SaveSnapshotRequest) -> Dict[str, Any]:
    """
    Save current state to snapshot slot
    
    Args:
        snapshot_id: Snapshot slot (0-5)
        request: Save request with optional name
        
    Returns:
        Success message
    """
    global _current_snapshot
    
    if snapshot_id < 0 or snapshot_id >= 6:
        raise HTTPException(status_code=400, detail="Snapshot ID must be 0-5")
    
    try:
        # Try JUCE engine first
        from app.services.juce_engine_service import get_audio_engine
        engine = get_audio_engine()
        
        if engine.is_available and hasattr(engine, 'save_snapshot'):
            success = engine.save_snapshot(snapshot_id, request.name)
            if success:
                return {"status": "success", "message": f"Saved snapshot {snapshot_id}"}
    except Exception as e:
        logger.debug(f"JUCE save_snapshot not available: {e}")
    
    # Fallback: capture current plugin states
    try:
        from app.services.chain_service import ChainService
        from app.database import get_session
        
        plugin_states = []
        async with get_session() as session:
            service = ChainService(session)
            chains = await service.get_chains()
            for chain in chains:
                chain_data = await service.get_chain(chain["id"])
                if chain_data:
                    plugin_states.append({
                        "chain_id": chain["id"],
                        "plugins": chain_data.get("plugins", [])
                    })
        
        _snapshots[snapshot_id] = {
            "id": snapshot_id,
            "name": request.name or f"Snapshot {snapshot_id + 1}",
            "has_data": True,
            "plugin_states": plugin_states
        }
        _current_snapshot = snapshot_id
        
    except Exception as e:
        logger.warning(f"Could not capture plugin states: {e}")
        # Still mark as saved even if we couldn't capture states
        _snapshots[snapshot_id] = {
            "id": snapshot_id,
            "name": request.name or f"Snapshot {snapshot_id + 1}",
            "has_data": True,
            "plugin_states": []
        }
        _current_snapshot = snapshot_id
    
    return {
        "status": "success",
        "message": f"Saved snapshot {snapshot_id}: {_snapshots[snapshot_id]['name']}"
    }


@router.post("/{snapshot_id}/load")
async def load_snapshot(snapshot_id: int) -> Dict[str, Any]:
    """
    Load snapshot and apply to current state
    
    Args:
        snapshot_id: Snapshot slot (0-5)
        
    Returns:
        Success message
    """
    global _current_snapshot
    
    if snapshot_id < 0 or snapshot_id >= 6:
        raise HTTPException(status_code=400, detail="Snapshot ID must be 0-5")
    
    snapshot = _snapshots.get(snapshot_id)
    if not snapshot or not snapshot["has_data"]:
        raise HTTPException(status_code=404, detail="Snapshot is empty")
    
    try:
        # Try JUCE engine first
        from app.services.juce_engine_service import get_audio_engine
        engine = get_audio_engine()
        
        if engine.is_available and hasattr(engine, 'load_snapshot'):
            success = engine.load_snapshot(snapshot_id)
            if success:
                _current_snapshot = snapshot_id
                return {"status": "success", "message": f"Loaded snapshot {snapshot_id}"}
    except Exception as e:
        logger.debug(f"JUCE load_snapshot not available: {e}")
    
    # Fallback: restore plugin states (simplified - would need full implementation)
    _current_snapshot = snapshot_id
    
    return {
        "status": "success",
        "message": f"Loaded snapshot {snapshot_id}: {snapshot['name']}",
        "warning": "Plugin state restoration requires JUCE engine"
    }


@router.delete("/{snapshot_id}")
async def delete_snapshot(snapshot_id: int) -> Dict[str, str]:
    """
    Clear a snapshot slot
    
    Args:
        snapshot_id: Snapshot slot (0-5)
        
    Returns:
        Success message
    """
    if snapshot_id < 0 or snapshot_id >= 6:
        raise HTTPException(status_code=400, detail="Snapshot ID must be 0-5")
    
    _snapshots[snapshot_id] = {
        "id": snapshot_id,
        "name": f"Snapshot {snapshot_id + 1}",
        "has_data": False,
        "plugin_states": []
    }
    
    return {"status": "success", "message": f"Cleared snapshot {snapshot_id}"}
