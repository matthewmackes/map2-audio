"""
Backup API Routes
RESTful endpoints for backup creation, restoration, and management.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services.backup import BackupSettings, get_backup_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])


# Request/Response Models

class BackupCreateRequest(BaseModel):
    """Request to create a new backup."""
    description: str = Field(default="", description="Optional description for the backup")


class BackupRestoreRequest(BaseModel):
    """Request to restore from a backup."""
    restore_database: bool = Field(default=True, description="Restore the database")
    restore_user_data: bool = Field(default=True, description="Restore user data directories")
    restore_config: bool = Field(default=True, description="Restore config files")


class BackupSettingsUpdate(BaseModel):
    """Request to update backup settings."""
    max_backups: Optional[int] = Field(None, ge=1, le=100, description="Maximum number of backups to keep")
    retention_days: Optional[int] = Field(None, ge=1, le=365, description="Days to retain backups")
    auto_cleanup: Optional[bool] = Field(None, description="Enable automatic cleanup")


# =============================================================================
# STATIC ROUTES (must come before dynamic /{backup_id} routes)
# =============================================================================

@router.get("/")
async def list_backups():
    """
    List all available backups.

    Returns list of backups sorted by date (newest first).
    """
    try:
        service = get_backup_service()
        backups = await service.list_backups()
        return {
            "backups": [
                {
                    "id": b.id,
                    "filename": b.filename,
                    "created_at": b.created_at,
                    "size_bytes": b.size_bytes,
                    "size_human": b.size_human,
                    "valid": b.valid,
                }
                for b in backups
            ],
            "count": len(backups)
        }
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_backup_status():
    """
    Get overall backup status and statistics.

    Returns backup count, total size, last backup info, and settings.
    """
    try:
        service = get_backup_service()
        return await service.get_backup_status()
    except Exception as e:
        logger.error(f"Error getting backup status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create")
async def create_backup(request: BackupCreateRequest = BackupCreateRequest()):
    """
    Create a new backup.

    Creates a tar.gz archive containing:
    - Database (map2.db)
    - User data (IR files, NAM models, sessions, packages)
    - Configuration files

    Returns information about the created backup.
    """
    try:
        service = get_backup_service()
        backup = await service.create_backup(description=request.description)
        return {
            "success": True,
            "message": "Backup created successfully",
            "backup": {
                "id": backup.id,
                "filename": backup.filename,
                "path": backup.path,
                "created_at": backup.created_at,
                "size_bytes": backup.size_bytes,
                "size_human": backup.size_human,
            }
        }
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/current")
async def get_backup_settings():
    """
    Get current backup settings.

    Returns lifecycle configuration (max backups, retention, auto-cleanup).
    """
    try:
        service = get_backup_service()
        settings = service.get_settings()
        return {
            "max_backups": settings.max_backups,
            "retention_days": settings.retention_days,
            "auto_cleanup": settings.auto_cleanup,
            "backup_location": settings.backup_location,
        }
    except Exception as e:
        logger.error(f"Error getting backup settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/current")
async def update_backup_settings(request: BackupSettingsUpdate):
    """
    Update backup settings.

    Updates lifecycle configuration for backup management.
    """
    try:
        service = get_backup_service()
        settings = service.update_settings(
            max_backups=request.max_backups,
            retention_days=request.retention_days,
            auto_cleanup=request.auto_cleanup
        )
        return {
            "success": True,
            "message": "Settings updated successfully",
            "settings": {
                "max_backups": settings.max_backups,
                "retention_days": settings.retention_days,
                "auto_cleanup": settings.auto_cleanup,
                "backup_location": settings.backup_location,
            }
        }
    except Exception as e:
        logger.error(f"Error updating backup settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup")
async def cleanup_backups():
    """
    Manually trigger backup cleanup.

    Applies retention policy and removes old backups.
    """
    try:
        service = get_backup_service()
        result = await service.cleanup_old_backups()
        return {
            "success": True,
            "message": "Cleanup completed",
            "result": result
        }
    except Exception as e:
        logger.error(f"Error during backup cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skip-list")
async def get_skip_list():
    """
    Get list of items not included in backups.

    Returns documentation of what is skipped because it can be
    reinstalled via package managers (DNF, pip, npm, etc.).
    """
    try:
        service = get_backup_service()
        return service.generate_skip_list()
    except Exception as e:
        logger.error(f"Error generating skip list: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-all")
async def update_all_backups():
    """
    Update all valid backups with the latest reinstaller and documentation.

    Updates the reinstaller script and documentation in all valid backups.
    Returns a summary of which backups were updated, skipped, or failed.
    """
    try:
        service = get_backup_service()
        result = await service.update_all_backups()
        return {
            "success": True,
            "message": f"Updated {len(result['updated'])} backups",
            "result": result
        }
    except Exception as e:
        logger.error(f"Error updating all backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-rebuild-script")
async def generate_rebuild_script(output_path: Optional[str] = None):
    """
    Generate a standalone rebuild script for the MAP2 Audio Platform.

    Creates a self-contained bash script that can:
    - Install all required DNF packages
    - Set up Python virtual environment and install packages
    - Clone/setup the MAP2 source code
    - Install Node.js dependencies and build web assets
    - Configure the audio system (JACK, real-time priorities)
    - Install systemd services

    This script is independent of any backup and can be run on a fresh
    Fedora Server installation to rebuild the system from scratch.

    Args:
        output_path: Optional custom path to save the script

    Returns:
        Information about the generated script including its location
    """
    try:
        service = get_backup_service()
        result = service.generate_rebuild_script(output_path)
        return {
            "success": True,
            "message": "Rebuild script generated successfully",
            "script_name": result["script_name"],
            "saved_to": result["saved_to"],
            "generated_at": result["generated_at"],
            "source_hostname": result["source_hostname"],
            "version": result["version"]
        }
    except Exception as e:
        logger.error(f"Error updating all backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# DYNAMIC ROUTES (with {backup_id} parameter - must come after static routes)
# =============================================================================

@router.get("/{backup_id}")
async def get_backup(backup_id: str):
    """
    Get details about a specific backup.

    Returns full backup information including manifest.
    """
    try:
        service = get_backup_service()
        backup = await service.get_backup(backup_id)
        if not backup:
            raise HTTPException(status_code=404, detail=f"Backup not found: {backup_id}")
        return {
            "id": backup.id,
            "filename": backup.filename,
            "path": backup.path,
            "created_at": backup.created_at,
            "size_bytes": backup.size_bytes,
            "size_human": backup.size_human,
            "valid": backup.valid,
            "manifest": backup.manifest,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting backup {backup_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{backup_id}/restore")
async def restore_backup(backup_id: str, request: BackupRestoreRequest = BackupRestoreRequest()):
    """
    Restore from a backup.

    Restores selected components from the backup archive.
    Creates pre-restore backups of current files before overwriting.
    """
    try:
        service = get_backup_service()
        result = await service.restore_backup(
            backup_id=backup_id,
            restore_database=request.restore_database,
            restore_user_data=request.restore_user_data,
            restore_config=request.restore_config
        )
        return {
            "success": True,
            "message": "Backup restored successfully",
            "result": result
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error restoring backup {backup_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{backup_id}/update")
async def update_backup(backup_id: str):
    """
    Update an existing backup with the latest reinstaller and documentation.

    Updates the reinstaller script and documentation in the specified backup
    without re-creating the user data backup. Useful for ensuring backups
    have the latest installer capabilities.
    """
    try:
        service = get_backup_service()
        backup = await service.update_backup(backup_id)
        return {
            "success": True,
            "message": "Backup updated successfully",
            "backup": {
                "id": backup.id,
                "filename": backup.filename,
                "path": backup.path,
                "created_at": backup.created_at,
                "size_bytes": backup.size_bytes,
                "size_human": backup.size_human,
                "last_updated": backup.manifest.get("last_updated") if backup.manifest else None,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating backup {backup_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{backup_id}")
async def delete_backup(backup_id: str):
    """
    Delete a backup.

    Permanently removes the backup file from disk.
    """
    try:
        service = get_backup_service()
        success = await service.delete_backup(backup_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Backup not found: {backup_id}")
        return {
            "success": True,
            "message": f"Backup {backup_id} deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting backup {backup_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
