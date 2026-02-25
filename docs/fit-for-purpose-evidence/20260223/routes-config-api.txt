"""
Configuration Distribution API Routes

Handles configuration management endpoints:
- Push configuration to nodes
- Query configuration
- Trigger manual sync
- Rollback configuration
"""

from datetime import datetime
from pathlib import Path
import shutil
import tempfile
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
import io
import tarfile
import json
import yaml

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


def _validate_config_tree(config_path: Path) -> bool:
    """Validate YAML/JSON config files in a directory tree."""
    config_files = list(config_path.glob("**/*.yaml")) + \
                  list(config_path.glob("**/*.yml")) + \
                  list(config_path.glob("**/*.json"))

    # Must contain at least one recognized config file.
    if not config_files:
        return False

    for config_file in config_files:
        try:
            if config_file.suffix in [".yaml", ".yml"]:
                with open(config_file, "r", encoding="utf-8") as f:
                    yaml.safe_load(f)
            elif config_file.suffix == ".json":
                with open(config_file, "r", encoding="utf-8") as f:
                    json.load(f)
        except Exception:
            return False
    return True


@router.post("/push")
async def push_config(request: Request, file: Optional[UploadFile] = File(None)):
    """
    Receive configuration push from another node.
    
    Expects tarball with configuration files.
    """
    try:
        distributor = get_config_distributor()

        # Support both multipart upload (`file`) and raw body (octet-stream)
        if file is not None:
            content = await file.read()
        else:
            content = await request.body()
        if not content:
            raise HTTPException(400, "Empty config payload")

        local_path = distributor.local_path
        local_path.parent.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="map2_config_push_") as tmpdir:
            extract_root = Path(tmpdir) / "extract"
            extract_root.mkdir(parents=True, exist_ok=True)

            tar_buffer = io.BytesIO(content)
            with tarfile.open(fileobj=tar_buffer, mode="r:gz") as tar:
                # Validate members before extracting (path traversal prevention + link checks)
                dest = extract_root.resolve()
                for member in tar.getmembers():
                    member_path = (dest / member.name).resolve()
                    if not str(member_path).startswith(str(dest)):
                        raise HTTPException(400, f"Illegal path in archive: {member.name}")
                    if member.issym() or member.islnk():
                        raise HTTPException(400, f"Links are not allowed in archive: {member.name}")
                tar.extractall(path=extract_root)

            # Validate extracted configuration
            if not _validate_config_tree(extract_root):
                raise HTTPException(400, "Configuration validation failed")

            # Stage new config in same parent for atomic rename
            staging_path = local_path.parent / f".config_staging_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
            shutil.copytree(extract_root, staging_path, dirs_exist_ok=True)

            # Validate staged config once more before swap
            if not _validate_config_tree(staging_path):
                shutil.rmtree(staging_path, ignore_errors=True)
                raise HTTPException(400, "Staged configuration validation failed")

            backup_path = local_path.parent / f".config_backup_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
            did_backup = False
            try:
                if local_path.exists():
                    local_path.rename(backup_path)
                    did_backup = True
                staging_path.rename(local_path)
                if did_backup:
                    shutil.rmtree(backup_path, ignore_errors=True)
            except Exception:
                # Roll back if swap failed
                if local_path.exists():
                    shutil.rmtree(local_path, ignore_errors=True)
                if did_backup and backup_path.exists():
                    backup_path.rename(local_path)
                shutil.rmtree(staging_path, ignore_errors=True)
                raise

        # Update commit/checksum metadata after successful apply
        try:
            distributor.current_commit = await distributor._get_current_commit()
        except Exception:
            # Keep previous commit if this is not a git checkout
            pass
        distributor.last_sync = datetime.utcnow().isoformat()
        
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
            distributor.last_sync = datetime.utcnow().isoformat()
        
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
        distributor.last_sync = datetime.utcnow().isoformat()
        
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
            "last_sync": distributor.last_sync,
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get status: {e}")
