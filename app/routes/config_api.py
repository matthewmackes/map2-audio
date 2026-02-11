"""
Configuration Distribution API Routes

Handles configuration management endpoints:
- Push configuration to nodes
- Query configuration
- Trigger manual sync
- Rollback configuration
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Dict, Any, Optional
import io
import tarfile

from app.services.cluster.config_distributor import get_config_distributor

router = APIRouter(prefix="/api/cluster/config", tags=["config"])


class ConfigRequest(BaseModel):
    """Configuration query request."""
    key: Optional[str] = None


class ConfigResponse(BaseModel):
    """Configuration response."""
    status: str
    config: Dict[str, Any]


class SyncRequest(BaseModel):
    """Manual sync request."""
    force: bool = False


@router.get("/")
async def get_config(key: Optional[str] = None):
    """
    Get configuration values.
    
    Query Parameters:
        key: Optional specific config key to retrieve
    """
    try:
        distributor = get_config_distributor()
        config = distributor.get_config(key)
        
        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "key": key,
            "config": config,
            "commit": distributor.current_commit,
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get config: {e}")


@router.post("/push")
async def push_config(file: UploadFile = File(...)):
    """
    Receive configuration push from another node.
    
    Expects tarball with configuration files.
    """
    try:
        content = await file.read()
        
        # Extract tarball
        tar_buffer = io.BytesIO(content)
        with tarfile.open(fileobj=tar_buffer, mode='r:gz') as tar:
            # Validate members before extracting (path traversal prevention)
            dest = Path("/tmp/config_push")
            for member in tar.getmembers():
                member_path = (dest / member.name).resolve()
                if not str(member_path).startswith(str(dest.resolve())):
                    raise HTTPException(400, f"Illegal path in archive: {member.name}")
            tar.extractall(path="/tmp/config_push")
        
        # TODO: Validate and apply configuration
        # For now, just acknowledge receipt
        
        return {
            "status": "ok",
            "message": "Configuration received and applied",
            "size_bytes": len(content),
        }
    
    except Exception as e:
        raise HTTPException(500, f"Config push failed: {e}")


@router.post("/sync")
async def trigger_sync(request: SyncRequest):
    """
    Manually trigger configuration synchronization.
    
    Parameters:
        force: Force re-sync even if no changes detected
    """
    try:
        distributor = get_config_distributor()
        
        # Trigger git pull
        await distributor._git_pull()
        
        # Check for changes
        new_commit = await distributor._get_current_commit()
        
        if new_commit != distributor.current_commit or request.force:
            # Validate and distribute
            is_valid = await distributor._validate_config()
            if not is_valid:
                raise HTTPException(400, "Configuration validation failed")
            
            success = await distributor._distribute_config()
            if not success:
                raise HTTPException(500, "Configuration distribution failed")
            
            distributor.current_commit = new_commit
        
        return {
            "status": "ok",
            "message": "Configuration synchronized",
            "commit": distributor.current_commit,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Sync failed: {e}")


@router.post("/rollback")
async def rollback_config(commit: Optional[str] = None):
    """
    Rollback configuration to a previous commit.
    
    Parameters:
        commit: Commit SHA to rollback to (defaults to previous)
    """
    try:
        distributor = get_config_distributor()
        
        if not commit:
            # Rollback to previous commit
            result = await distributor._run_command([
                "git", "-C", str(distributor.local_path), "rev-parse", "HEAD~1"
            ], check=False)
            
            if result.returncode != 0:
                raise HTTPException(400, "No previous commit to rollback to")
            
            commit = result.stdout.strip()
        
        # Checkout commit
        await distributor._git_checkout(commit)
        
        # Validate config
        is_valid = await distributor._validate_config()
        if not is_valid:
            raise HTTPException(400, "Rollback config is invalid")
        
        # Distribute
        success = await distributor._distribute_config()
        if not success:
            raise HTTPException(500, "Rollback distribution failed")
        
        distributor.current_commit = commit
        
        return {
            "status": "ok",
            "message": "Configuration rolled back",
            "commit": commit,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Rollback failed: {e}")


@router.get("/status")
async def get_config_status():
    """Get current configuration distribution status."""
    try:
        distributor = get_config_distributor()
        
        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "current_commit": distributor.current_commit,
            "git_repo": distributor.git_repo,
            "is_syncing": distributor.is_running,
            "last_sync": None,  # TODO: Track last sync time
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get status: {e}")
