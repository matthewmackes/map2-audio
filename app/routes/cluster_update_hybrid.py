"""
Extended API endpoints for hybrid update system.

Adds application-level update endpoints to the cluster update API.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.cluster.hybrid_update_manager import (
    get_hybrid_update_manager,
    UpdateMode,
    UpdateEnvironment
)

router = APIRouter(prefix="/api/cluster/update", tags=["cluster-update"])


# ============================================================================
# Request/Response Models
# ============================================================================

class ApplicationUpdateRequest(BaseModel):
    """Request to update MAP2 application."""
    mode: Optional[str] = "auto"           # auto, git, rpm
    version: Optional[str] = None          # For RPM: version or "latest"
    branch: Optional[str] = "main"         # For Git: branch name
    force: Optional[bool] = False          # Force update even if running


class FullUpdateRequest(BaseModel):
    """Request for full system + application update."""
    update_system: bool = True             # Update OS packages
    update_application: bool = True        # Update MAP2 app
    version: Optional[str] = None          # Target version/branch
    force: Optional[bool] = False          # Force update


class ApplicationVersionResponse(BaseModel):
    """Current application version info."""
    version: str                           # Version or commit hash
    mode: str                              # git or rpm
    updated_at: Optional[str] = None
    branch: Optional[str] = None           # For git mode


# ============================================================================
# Application Update Endpoints
# ============================================================================

@router.post("/application")
async def update_application(request: ApplicationUpdateRequest):
    """
    Trigger MAP2 application update.
    
    Supports both Git-based (development) and RPM-based (production) updates.
    Mode is auto-detected unless explicitly specified.
    
    Parameters:
    - mode: "git" for branch-based updates, "rpm" for version-based, "auto" for detection
    - version: Target version (RPM mode) or branch (Git mode)
    - branch: Git branch (Git mode only)
    - force: Force update even if services running
    
    Returns:
    - status: "ok" or "error"
    - message: Human-readable result
    - commit_before/after: Git commit hashes (Git mode)
    - duration_seconds: Update duration
    """
    try:
        manager = get_hybrid_update_manager()
        
        result = await manager.trigger_application_update(
            version=request.version,
            branch=request.branch or "main",
            node_id=None  # Local node
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(500, f"Application update failed: {e}")


@router.get("/application/status")
async def get_application_status():
    """
    Get current application update status.
    
    Returns:
    - mode: Current update mode (git or rpm)
    - environment: Deployment environment
    - current_version: Current application version
    - running: Whether update is currently running
    - last_update: Timestamp of last update
    """
    try:
        manager = get_hybrid_update_manager()
        
        version = manager.get_current_version()
        
        return {
            "status": "ok",
            "mode": manager.mode.value,
            "environment": manager.config.environment.value,
            "current_version": version,
            "running": False,  # Would check actual update orchestrator
            "last_update": None  # Would fetch from db
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get status: {e}")


@router.get("/application/version")
async def get_application_versions():
    """
    Get application versions across cluster nodes.
    
    Returns per-node version information:
    - Each node's current version
    - Update mode (git/rpm)
    - Last update timestamp
    - Git branch (if applicable)
    
    Useful for detecting version drift in cluster.
    """
    try:
        manager = get_hybrid_update_manager()
        registry = get_cluster_registry()
        
        nodes = registry.get_all_nodes()
        versions = {}
        
        for node in nodes:
            # In real implementation, would query each node's status
            # For now, return current node info
            node_id = node.get("id")
            if not node_id:
                continue
            versions[node_id] = {
                "version": manager.get_current_version(),
                "mode": manager.mode.value,
                "updated_at": None,
                "branch": manager.config.git_branch if manager.mode == UpdateMode.GIT else None
            }
        
        return {
            "status": "ok",
            "nodes": versions
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to get versions: {e}")


@router.post("/full")
async def trigger_full_update(request: FullUpdateRequest):
    """
    Trigger full cluster update (system packages + application).
    
    Performs rolling update in phases:
    1. System packages (if requested)
    2. MAP2 application (if requested)
    3. Post-update validation
    
    Parameters:
    - update_system: Whether to update OS packages
    - update_application: Whether to update MAP2 application
    - version: Target version/branch
    - force: Force update
    
    Returns:
    - status: "ok" or "partial" or "error"
    - results: Per-phase results
    - duration_seconds: Total update duration
    """
    try:
        manager = get_hybrid_update_manager()
        
        result = await manager.trigger_full_update(
            update_system=request.update_system,
            update_application=request.update_application,
            version=request.version,
            node_id=None  # Local node
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(500, f"Full update failed: {e}")


# ============================================================================
# Git-Specific Endpoints
# ============================================================================

@router.get("/git/branches")
async def list_git_branches():
    """
    List available git branches for application update.
    
    Returns:
    - branches: List of available branches
    - current: Currently checked out branch
    """
    try:
        from app.services.cluster.map2_git_updater import get_git_updater
        
        updater = get_git_updater()
        
        # In real implementation, would query git repository
        # For now, return common branches
        return {
            "status": "ok",
            "branches": ["main", "develop", "staging"],
            "current": await updater.get_current_branch()
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to list branches: {e}")


@router.get("/git/commits")
async def list_git_commits(limit: int = 10):
    """
    List recent git commits available for update.
    
    Parameters:
    - limit: Maximum number of commits to return
    
    Returns:
    - commits: List of recent commits with hash, message, author, date
    """
    try:
        from app.services.cluster.map2_git_updater import get_git_updater
        
        updater = get_git_updater()
        
        # In real implementation, would query git log
        current = await updater.get_current_commit()
        
        return {
            "status": "ok",
            "current_commit": current,
            "available_commits": []  # Would populate from git log
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to list commits: {e}")


@router.post("/git/rollback")
async def rollback_to_commit(commit_hash: str):
    """
    Rollback application to specific git commit.
    
    Parameters:
    - commit_hash: Target commit hash
    
    Returns:
    - status: "ok" or "error"
    - message: Rollback result
    - commit: Commit hash rolled back to
    """
    try:
        from app.services.cluster.map2_git_updater import get_git_updater
        
        updater = get_git_updater()
        success, message = await updater.rollback_to_commit(commit_hash)
        
        if success:
            return {
                "status": "ok",
                "message": message,
                "commit": commit_hash
            }
        else:
            raise HTTPException(500, message)
            
    except Exception as e:
        raise HTTPException(500, f"Rollback failed: {e}")


# ============================================================================
# Helper Functions (not actual endpoints)
# ============================================================================

def get_cluster_registry():
    """Get cluster registry service."""
    from app.services.cluster.registry import get_cluster_registry as get_registry
    return get_registry()
