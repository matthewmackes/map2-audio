"""
Snapshot API Routes
Quick snapshot save/load for instant preset recall (6 slots)
"""

import logging
import json
import threading
from typing import Dict, Any, List, Optional
from pathlib import Path
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


def _default_snapshot_slot(slot_id: int) -> Dict[str, Any]:
    """Build default snapshot structure for a slot."""
    return {
        "id": slot_id,
        "name": f"Snapshot {slot_id + 1}",
        "has_data": False,
        "plugin_states": [],
    }


def _default_snapshot_store() -> Dict[int, Dict[str, Any]]:
    """Build default 6-slot snapshot map."""
    return {i: _default_snapshot_slot(i) for i in range(6)}


_snapshot_lock = threading.RLock()
_snapshot_store_path = Path("/home/mm/map2-audio/.map2/engine_snapshots.json")
_snapshots: Dict[int, Dict[str, Any]] = _default_snapshot_store()
_current_snapshot: int = 0


def _persist_snapshots_to_disk() -> None:
    """Persist snapshots and current pointer to disk (best effort)."""
    try:
        with _snapshot_lock:
            payload = {
                "current": _current_snapshot,
                "snapshots": [_snapshots[i] for i in range(6)],
            }
        _snapshot_store_path.parent.mkdir(parents=True, exist_ok=True)
        _snapshot_store_path.write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        logger.debug(f"Failed to persist snapshots: {e}")


def _load_snapshots_from_disk() -> None:
    """Load snapshots from disk if available."""
    global _snapshots, _current_snapshot

    if not _snapshot_store_path.exists():
        return

    try:
        payload = json.loads(_snapshot_store_path.read_text(encoding="utf-8"))
        loaded = _default_snapshot_store()

        raw_snapshots = payload.get("snapshots", [])
        if isinstance(raw_snapshots, list):
            for item in raw_snapshots:
                if not isinstance(item, dict):
                    continue
                slot_id = item.get("id")
                if not isinstance(slot_id, int) or slot_id not in loaded:
                    continue
                slot = _default_snapshot_slot(slot_id)
                slot["name"] = str(item.get("name", slot["name"]))
                slot["has_data"] = bool(item.get("has_data", False))
                plugin_states = item.get("plugin_states", [])
                slot["plugin_states"] = plugin_states if isinstance(plugin_states, list) else []
                loaded[slot_id] = slot

        current = payload.get("current", 0)
        if not isinstance(current, int) or current < 0 or current >= 6:
            current = 0

        with _snapshot_lock:
            _snapshots = loaded
            _current_snapshot = current
    except Exception as e:
        logger.debug(f"Failed to load snapshots from disk: {e}")


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
    
    # Fallback to persisted snapshot storage
    with _snapshot_lock:
        snapshots = [dict(_snapshots[i]) for i in range(6)]
        current = _current_snapshot

    return {
        "snapshots": [
            {
                "id": s["id"],
                "name": s["name"],
                "has_data": s["has_data"],
                "plugin_count": len(s.get("plugin_states", [])),
            }
            for s in snapshots
        ],
        "current": current,
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
    
    with _snapshot_lock:
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
                with _snapshot_lock:
                    slot = _snapshots.get(snapshot_id, _default_snapshot_slot(snapshot_id))
                    slot["name"] = request.name or slot["name"]
                    slot["has_data"] = True
                    _snapshots[snapshot_id] = slot
                    _current_snapshot = snapshot_id
                _persist_snapshots_to_disk()
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
        
        with _snapshot_lock:
            _snapshots[snapshot_id] = {
                "id": snapshot_id,
                "name": request.name or f"Snapshot {snapshot_id + 1}",
                "has_data": True,
                "plugin_states": plugin_states,
            }
            _current_snapshot = snapshot_id
        _persist_snapshots_to_disk()
        
    except Exception as e:
        logger.warning(f"Could not capture plugin states: {e}")
        # Still mark as saved even if we couldn't capture states
        with _snapshot_lock:
            _snapshots[snapshot_id] = {
                "id": snapshot_id,
                "name": request.name or f"Snapshot {snapshot_id + 1}",
                "has_data": True,
                "plugin_states": [],
            }
            _current_snapshot = snapshot_id
        _persist_snapshots_to_disk()
    
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
    
    with _snapshot_lock:
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
                with _snapshot_lock:
                    _current_snapshot = snapshot_id
                _persist_snapshots_to_disk()
                return {"status": "success", "message": f"Loaded snapshot {snapshot_id}"}
    except Exception as e:
        logger.debug(f"JUCE load_snapshot not available: {e}")
    
    # Fallback: restore plugin states (simplified - would need full implementation)
    with _snapshot_lock:
        _current_snapshot = snapshot_id
    _persist_snapshots_to_disk()
    
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
    
    with _snapshot_lock:
        _snapshots[snapshot_id] = _default_snapshot_slot(snapshot_id)
    _persist_snapshots_to_disk()
    
    return {"status": "success", "message": f"Cleared snapshot {snapshot_id}"}


_load_snapshots_from_disk()
