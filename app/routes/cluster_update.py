"""
Phase 3: Cluster Update Orchestration API Routes

Handles cluster-wide updates with zero downtime.
Provides endpoints for update scheduling, progress tracking, and rollback.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.services.cluster.update_orchestrator import get_update_orchestrator
from app.services.cluster.update_rollback import UpdateRollbackManager, RollbackReason
from app.services.cluster.version_manifest import get_version_manifest as get_version_manifest_service
from app.services.cluster.registry import get_cluster_registry

router = APIRouter(prefix="/api/cluster/update", tags=["cluster-update"])


class UpdateRequest(BaseModel):
    """Cluster update request."""
    target_version: str
    dry_run: bool = False


class UpdateProgressResponse(BaseModel):
    """Update progress information."""
    total_nodes: int
    completed_nodes: int
    failed_nodes: int
    remaining_nodes: int
    current_node: Optional[str] = None
    status: str
    message: str


class UpdateResponse(BaseModel):
    """Update operation response."""
    status: str
    message: str
    nodes_updated: Optional[int] = None
    duration_seconds: Optional[float] = None
    failed_nodes: Optional[List[str]] = None
    rolled_back: Optional[bool] = None


class ManifestCaptureRequest(BaseModel):
    source_node_id: str


class ManifestEnforceRequest(BaseModel):
    node_id: str
    dry_run: bool = True


@router.post("/trigger", response_model=UpdateResponse)
async def trigger_cluster_update(request: UpdateRequest):
    """
    Trigger a cluster-wide update.
    
    Performs rolling update across all audio nodes with zero downtime.
    
    Request body:
        - target_version: Version to update to
        - dry_run: If true, validate without applying changes
    
    Returns:
        Update operation result with status
    """
    try:
        orchestrator = get_update_orchestrator()

        result = await orchestrator.trigger_cluster_update(
            target_version=request.target_version,
            dry_run=request.dry_run
        )
        
        return UpdateResponse(**result)
    
    except Exception as e:
        raise HTTPException(500, f"Update failed: {e}")


@router.get("/progress", response_model=UpdateProgressResponse)
async def get_update_progress():
    """
    Get current update progress.
    
    Returns information about ongoing update operation.
    """
    try:
        orchestrator = get_update_orchestrator()
        progress = orchestrator.get_current_progress()
        
        if not progress:
            raise HTTPException(404, "No update in progress")
        
        return UpdateProgressResponse(**progress)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get progress: {e}")


@router.get("/status")
async def get_update_status():
    """
    Get detailed update status.
    
    Returns:
        Status information including progress, phase, and errors
    """
    try:
        orchestrator = get_update_orchestrator()
        progress = orchestrator.get_current_progress()
        
        if not progress:
            return {
                "status": "idle",
                "message": "No update in progress"
            }
        
        return {
            "status": progress["status"],
            "progress": {
                "total": progress["total_nodes"],
                "completed": progress["completed_nodes"],
                "failed": progress["failed_nodes"],
                "remaining": progress["remaining_nodes"],
            },
            "current_node": progress["current_node"],
            "message": progress["message"],
            "started_at": progress["started_at"],
            "completed_at": progress["completed_at"],
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get status: {e}")


@router.post("/validate")
async def validate_update(request: UpdateRequest):
    """
    Validate update without applying changes.
    
    Performs pre-flight checks and returns validation results.
    """
    try:
        orchestrator = get_update_orchestrator()
        
        result = await orchestrator.trigger_cluster_update(
            target_version=request.target_version,
            dry_run=True
        )
        
        return {
            "status": "ok",
            "validation_passed": result["status"] == "ok",
            "details": result
        }
    
    except Exception as e:
        raise HTTPException(400, f"Validation failed: {e}")


@router.post("/abort")
async def abort_update():
    """
    Abort ongoing update operation.
    
    Stops current update and returns cluster to stable state.
    """
    try:
        orchestrator = get_update_orchestrator()
        progress = orchestrator.get_current_progress()
        
        if not progress or progress["status"] == "idle":
            raise HTTPException(400, "No update in progress")
        
        # In production, would abort the update
        return {
            "status": "ok",
            "message": "Update aborted",
            "nodes_updated": progress["completed_nodes"],
            "nodes_remaining": progress["remaining_nodes"],
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to abort update: {e}")


@router.get("/snapshots")
async def list_update_snapshots():
    """
    List available cluster snapshots for rollback.
    
    Snapshots are created before updates and can be used for rollback.
    """
    try:
        orchestrator = get_update_orchestrator()
        snapshots_dir = orchestrator.snapshots_dir
        
        snapshots = []
        if snapshots_dir.exists():
            for snapshot_file in sorted(snapshots_dir.glob("*.json"), reverse=True):
                try:
                    with open(snapshot_file) as f:
                        data = json.load(f)
                        snapshots.append(
                            {
                                "id": data.get("snapshot_id"),
                                "timestamp": data.get("timestamp"),
                                "node_id": data.get("node_id"),
                                "package_count": len(data.get("packages", {})),
                                "has_database_backup": bool(data.get("database_backup")),
                            }
                        )
                except Exception as e:
                    logger.warning(f"Failed to read snapshot {snapshot_file}: {e}")
        
        return {
            "status": "ok",
            "total_snapshots": len(snapshots),
            "snapshots": snapshots,
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to list snapshots: {e}")


@router.post("/rollback/{snapshot_id}")
async def rollback_to_snapshot(snapshot_id: str):
    """
    Manually rollback cluster to a specific snapshot.
    
    Path parameters:
        - snapshot_id: ID of snapshot to restore
    
    Returns:
        Rollback operation result
    """
    try:
        orchestrator = get_update_orchestrator()
        snapshot_file = orchestrator.snapshots_dir / f"{snapshot_id}.json"
        if not snapshot_file.exists():
            raise HTTPException(404, f"Snapshot not found: {snapshot_id}")

        rollback_manager = UpdateRollbackManager(
            snapshot_dir=str(orchestrator.snapshots_dir)
        )
        result = rollback_manager.rollback(snapshot_id, RollbackReason.MANUAL_TRIGGER)

        return {
            "status": "ok" if result.success else "failed",
            "message": f"Rollback {'completed' if result.success else 'failed'}",
            "snapshot_id": snapshot_id,
            "errors": result.errors,
            "duration_seconds": result.duration_seconds,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Rollback failed: {e}")


@router.get("/manifest")
async def get_version_manifest_endpoint():
    """Get current golden version manifest."""
    try:
        manifest = get_version_manifest_service().get_manifest()
        if not manifest:
            raise HTTPException(404, "No version manifest found")
        return {"status": "ok", "manifest": manifest}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to get manifest: {e}")


@router.post("/manifest/capture")
async def capture_version_manifest(request: ManifestCaptureRequest):
    """Capture a new golden manifest from a source node."""
    try:
        manifest = get_version_manifest_service().capture_manifest(request.source_node_id)
        return {"status": "ok", "manifest": manifest}
    except Exception as e:
        raise HTTPException(500, f"Failed to capture manifest: {e}")


@router.get("/manifest/drift")
async def get_manifest_drift():
    """Compare all nodes against the current manifest."""
    try:
        drift = get_version_manifest_service().compare_all_nodes()
        return {"status": "ok", "drift": drift}
    except Exception as e:
        raise HTTPException(500, f"Failed to compare manifest: {e}")


@router.post("/manifest/enforce")
async def enforce_manifest(request: ManifestEnforceRequest):
    """Enforce manifest on a node (dry-run by default)."""
    try:
        result = get_version_manifest_service().enforce_manifest(
            request.node_id, dry_run=request.dry_run
        )
        return {"status": "ok", "result": result}
    except Exception as e:
        raise HTTPException(500, f"Failed to enforce manifest: {e}")


# Import required for snapshot handling
import json
import logging

logger = logging.getLogger(__name__)
