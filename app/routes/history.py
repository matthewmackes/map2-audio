"""
Undo/Redo Routes - API endpoints for command history
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException

from app.services.command_history import command_history

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["history"])


@router.post("/undo")
async def undo() -> Dict[str, Any]:
    """
    Undo the last command
    
    Returns:
        Operation result and status
    """
    if not command_history.can_undo():
        raise HTTPException(status_code=400, detail="Nothing to undo")
    
    success = await command_history.undo()
    
    if not success:
        raise HTTPException(status_code=500, detail="Undo operation failed")
    
    return {
        "status": "success",
        "message": "Undo successful",
        "can_undo": command_history.can_undo(),
        "can_redo": command_history.can_redo(),
        "next_undo": command_history.get_undo_description()
    }


@router.post("/redo")
async def redo() -> Dict[str, Any]:
    """
    Redo the last undone command
    
    Returns:
        Operation result and status
    """
    if not command_history.can_redo():
        raise HTTPException(status_code=400, detail="Nothing to redo")
    
    success = await command_history.redo()
    
    if not success:
        raise HTTPException(status_code=500, detail="Redo operation failed")
    
    return {
        "status": "success",
        "message": "Redo successful",
        "can_undo": command_history.can_undo(),
        "can_redo": command_history.can_redo(),
        "next_redo": command_history.get_redo_description()
    }


@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """
    Get undo/redo status
    
    Returns:
        Status information
    """
    return {
        "can_undo": command_history.can_undo(),
        "can_redo": command_history.can_redo(),
        "next_undo": command_history.get_undo_description(),
        "next_redo": command_history.get_redo_description()
    }


@router.get("/list")
async def get_history() -> Dict[str, Any]:
    """
    Get command history
    
    Returns:
        List of commands in history
    """
    history = command_history.get_history()
    
    return {
        "history": history,
        "count": len(history)
    }


@router.post("/clear")
async def clear_history() -> Dict[str, str]:
    """
    Clear all command history
    
    Returns:
        Success message
    """
    command_history.clear()
    
    return {
        "status": "success",
        "message": "Command history cleared"
    }


@router.get("/snapshots")
async def get_snapshots() -> Dict[str, Any]:
    """
    Get list of state snapshots
    
    Returns:
        List of available snapshots
    """
    snapshots = command_history.get_snapshots()
    
    return {
        "snapshots": snapshots,
        "count": len(snapshots)
    }


@router.post("/snapshots/{index}/restore")
async def restore_snapshot(index: int) -> Dict[str, Any]:
    """
    Restore a state snapshot
    
    Path parameters:
    - index: Snapshot index
    
    Returns:
        Restored state data
    """
    state = command_history.restore_snapshot(index)
    
    if state is None:
        raise HTTPException(status_code=404, detail=f"Snapshot not found: {index}")
    
    return {
        "status": "success",
        "message": f"Restored snapshot {index}",
        "state": state
    }
