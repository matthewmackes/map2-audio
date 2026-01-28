"""
Session Manager Routes - API endpoints for session management
"""

import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from app.services.session_manager import session_manager, SessionState, SessionMetadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSessionRequest(BaseModel):
    """Create session request"""
    name: str
    description: str = ""
    author: str = ""
    tags: List[str] = []


class SaveSessionRequest(BaseModel):
    """Save session request"""
    session_data: Dict[str, Any]
    create_backup: bool = True


@router.post("/create")
async def create_session(request: CreateSessionRequest) -> Dict[str, Any]:
    """
    Create a new session
    
    Request body:
    - name: Session name
    - description: Session description
    - author: Author name
    - tags: Session tags
    
    Returns:
        Created session metadata
    """
    try:
        session = session_manager.create_session(
            name=request.name,
            description=request.description,
            author=request.author,
            tags=request.tags
        )
        
        return {
            "status": "success",
            "message": f"Created session: {request.name}",
            "session": session.to_dict()
        }
        
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_session(request: SaveSessionRequest) -> Dict[str, Any]:
    """
    Save current session
    
    Request body:
    - session_data: Complete session state
    - create_backup: Create backup before saving
    
    Returns:
        Save confirmation
    """
    try:
        # Reconstruct session from data
        session = SessionState.from_dict(request.session_data)
        
        # Save to disk
        path = session_manager.save_session(
            session=session,
            create_backup=request.create_backup
        )
        
        return {
            "status": "success",
            "message": f"Saved session: {session.metadata.name}",
            "path": str(path)
        }
        
    except Exception as e:
        logger.error(f"Error saving session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load")
async def load_session(path: str) -> Dict[str, Any]:
    """
    Load a session
    
    Query parameters:
    - path: Path to session file
    
    Returns:
        Loaded session data
    """
    try:
        session_path = Path(path)
        session = session_manager.load_session(session_path)
        
        return {
            "status": "success",
            "message": f"Loaded session: {session.metadata.name}",
            "session": session.to_dict()
        }
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Session not found: {path}")
    except Exception as e:
        logger.error(f"Error loading session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_sessions() -> Dict[str, Any]:
    """
    List all available sessions
    
    Returns:
        List of sessions
    """
    try:
        sessions = session_manager.list_sessions()
        
        return {
            "sessions": sessions,
            "count": len(sessions)
        }
        
    except Exception as e:
        logger.error(f"Error listing sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
async def delete_session(path: str, create_backup: bool = True) -> Dict[str, str]:
    """
    Delete a session
    
    Query parameters:
    - path: Path to session file
    - create_backup: Create backup before deleting
    
    Returns:
        Deletion confirmation
    """
    try:
        session_path = Path(path)
        success = session_manager.delete_session(session_path, create_backup)
        
        if not success:
            raise HTTPException(status_code=404, detail=f"Session not found: {path}")
        
        return {
            "status": "success",
            "message": f"Deleted session: {path}"
        }
        
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/current")
async def get_current_session() -> Dict[str, Any]:
    """
    Get current session
    
    Returns:
        Current session data
    """
    session = session_manager.get_current_session()
    
    if not session:
        raise HTTPException(status_code=404, detail="No current session")
    
    return session.to_dict()


@router.post("/export")
async def export_session(export_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Export current session
    
    Query parameters:
    - export_path: Export destination (optional)
    
    Returns:
        Export confirmation
    """
    try:
        path = Path(export_path) if export_path else None
        exported_path = session_manager.export_session(export_path=path)
        
        return {
            "status": "success",
            "message": "Session exported",
            "path": str(exported_path)
        }
        
    except Exception as e:
        logger.error(f"Error exporting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import")
async def import_session(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Import session from file
    
    Request:
    - file: Session file upload
    
    Returns:
        Import confirmation
    """
    try:
        # Save uploaded file temporarily
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".map2") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = Path(tmp.name)
        
        # Import session
        session = session_manager.import_session(tmp_path)
        
        # Clean up temp file
        tmp_path.unlink()
        
        return {
            "status": "success",
            "message": f"Imported session: {session.metadata.name}",
            "session": session.to_dict()
        }
        
    except Exception as e:
        logger.error(f"Error importing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_sessions(
    query: str = "",
    tags: Optional[List[str]] = None,
    author: str = ""
) -> Dict[str, Any]:
    """
    Search sessions
    
    Query parameters:
    - query: Name/description search
    - tags: Required tags (comma-separated)
    - author: Author filter
    
    Returns:
        Matching sessions
    """
    try:
        results = session_manager.search_sessions(
            query=query,
            tags=tags,
            author=author
        )
        
        return {
            "results": results,
            "count": len(results)
        }
        
    except Exception as e:
        logger.error(f"Error searching sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# New endpoints for session status, auto-save, and recovery
# ============================================================================

# In-memory session state tracking
_session_state = {
    "name": "Untitled",
    "has_unsaved_changes": False,
    "last_saved": None,
    "auto_save_enabled": True,
    "auto_save_interval_sec": 60,
}

_recovery_state = {
    "has_recovery": False,
    "session_name": None,
    "crashed_at": None,
    "can_recover": False,
}


class SessionSettingsUpdate(BaseModel):
    """Update session settings"""
    auto_save_enabled: Optional[bool] = None
    auto_save_interval_sec: Optional[int] = None


@router.get("/current")
async def get_current_session_status() -> Dict[str, Any]:
    """
    Get current session status for UI display
    
    Returns:
        Current session info with unsaved changes indicator
    """
    session = session_manager.get_current_session()
    
    return {
        "name": session.metadata.name if session else _session_state["name"],
        "has_unsaved_changes": _session_state["has_unsaved_changes"],
        "last_saved": _session_state["last_saved"],
        "auto_save_enabled": _session_state["auto_save_enabled"],
        "auto_save_interval_sec": _session_state["auto_save_interval_sec"],
    }


@router.get("/recent")
async def get_recent_sessions() -> Dict[str, Any]:
    """
    Get list of recently used sessions
    
    Returns:
        List of recent sessions with metadata
    """
    try:
        sessions = session_manager.list_sessions()
        
        # Sort by modified date and take recent ones
        recent = sorted(
            sessions,
            key=lambda s: s.get("modified_at", ""),
            reverse=True
        )[:10]
        
        return {
            "sessions": [
                {
                    "name": s.get("name", "Unknown"),
                    "path": s.get("path", ""),
                    "modifiedAt": s.get("modified_at", ""),
                    "description": s.get("description", ""),
                }
                for s in recent
            ]
        }
        
    except Exception as e:
        logger.error(f"Error getting recent sessions: {e}")
        return {"sessions": []}


@router.patch("/settings")
async def update_session_settings(request: SessionSettingsUpdate) -> Dict[str, Any]:
    """
    Update session settings (auto-save, etc.)
    
    Returns:
        Updated settings
    """
    if request.auto_save_enabled is not None:
        _session_state["auto_save_enabled"] = request.auto_save_enabled
    
    if request.auto_save_interval_sec is not None:
        _session_state["auto_save_interval_sec"] = max(10, min(600, request.auto_save_interval_sec))
    
    return {
        "status": "success",
        "auto_save_enabled": _session_state["auto_save_enabled"],
        "auto_save_interval_sec": _session_state["auto_save_interval_sec"],
    }


@router.get("/recovery")
async def check_recovery() -> Dict[str, Any]:
    """
    Check if there's a recoverable session from a crash
    
    Returns:
        Recovery availability status
    """
    # Check for recovery file
    recovery_path = session_manager.sessions_dir / ".recovery"
    
    if recovery_path.exists():
        try:
            import json
            with open(recovery_path) as f:
                recovery_data = json.load(f)
            
            return {
                "has_recovery": True,
                "session_name": recovery_data.get("name", "Unknown"),
                "crashed_at": recovery_data.get("timestamp", ""),
                "can_recover": True,
            }
        except Exception as e:
            logger.warning(f"Could not read recovery file: {e}")
    
    return {
        "has_recovery": False,
        "session_name": None,
        "crashed_at": None,
        "can_recover": False,
    }


@router.post("/recovery/restore")
async def restore_recovery() -> Dict[str, Any]:
    """
    Restore session from recovery file
    
    Returns:
        Restored session info
    """
    recovery_path = session_manager.sessions_dir / ".recovery"
    
    if not recovery_path.exists():
        raise HTTPException(status_code=404, detail="No recovery data found")
    
    try:
        import json
        with open(recovery_path) as f:
            recovery_data = json.load(f)
        
        # Load the recovered session
        session = SessionState.from_dict(recovery_data.get("session", {}))
        session_manager.current_session = session
        
        # Remove recovery file
        recovery_path.unlink()
        
        _session_state["name"] = session.metadata.name
        _session_state["has_unsaved_changes"] = True
        
        return {
            "status": "success",
            "message": f"Recovered session: {session.metadata.name}",
            "session": session.to_dict(),
        }
        
    except Exception as e:
        logger.error(f"Error restoring recovery: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recovery/dismiss")
async def dismiss_recovery() -> Dict[str, str]:
    """
    Dismiss recovery data without restoring
    
    Returns:
        Success message
    """
    recovery_path = session_manager.sessions_dir / ".recovery"
    
    if recovery_path.exists():
        recovery_path.unlink()
    
    return {"status": "success", "message": "Recovery dismissed"}


def mark_session_changed():
    """Helper function to mark session as having unsaved changes"""
    _session_state["has_unsaved_changes"] = True


def mark_session_saved():
    """Helper function to mark session as saved"""
    from datetime import datetime
    _session_state["has_unsaved_changes"] = False
    _session_state["last_saved"] = datetime.now().isoformat()

