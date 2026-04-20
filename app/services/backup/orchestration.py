"""Backup service orchestration and public facade."""

import json
import os
import tarfile
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.utils.singleton import Singleton

from .file_io import BackupFileIOMixin, BackupInfo, BackupSettings, logger
from .recovery import BackupRecoveryMixin


class BackupService(BackupFileIOMixin, BackupRecoveryMixin, Singleton):
    """Service for managing MAP2 platform backups."""

    # Default paths to backup
    DEFAULT_BACKUP_PATHS = {
        "database": Path.home() / "map2-audio" / "data" / "map2.db",
        "user_ir": Path.home() / ".map2" / "ir",
        "user_nam": Path.home() / ".map2" / "nam",
        "user_sessions": Path.home() / ".map2" / "sessions",
        "user_packages": Path.home() / ".map2" / "packages",
        "user_config": Path.home() / ".map2" / "config.json",
    }

    @staticmethod
    def _get_app_root_dir() -> Path:
        """Dynamically determine the MAP2 application root directory."""
        env_path = os.environ.get("MAP2_APP_DIR")
        if env_path:
            path = Path(env_path)
            if path.exists():
                return path

        try:
            for candidate in Path(__file__).resolve().parents:
                if (candidate / "app").exists() and (candidate / "tui").exists():
                    return candidate
        except Exception:
            pass

        return Path.home() / "map2-audio"


    # Items that can be reinstalled via RPM/package managers
    SKIP_LIST = {
        "dnf_packages": [
            "python3",
            "python3-pip",
            "alsa-utils",
            "alsa-lib",
            "jack-audio-connection-kit",
            "jack-audio-connection-kit-dbus",
            "pipewire",
            "pipewire-jack-audio-connection-kit",
            "nodejs",
            "npm",
            "lv2",
            "lilv",
            "suil",
            "lv2-calf-plugins",
            "lv2-x42-plugins",
            "guitarix-lv2",
            "gxplugins-lv2",
            "lsp-plugins-lv2",
        ],
        "flatpak_packages": [
            "com.play0ad.zeroad",
            "org.audacityteam.Audacity",
            "org.ardour.Ardour",
        ],
        "python_packages": [
            "fastapi",
            "uvicorn",
            "aiohttp",
            "httpx",
            "psutil",
            "sqlalchemy",
            "aiosqlite",
            "textual",
            "rich",
            "python-multipart",
            "pydantic",
        ],
        "npm_packages": [
            "All packages in node_modules/ (regenerate via npm install)",
        ],
        "source_code": [
            "map2-audio/ application code (reinstall via git clone)",
        ],
        "build_artifacts": [
            "web/dist/ (rebuild via npm run build)",
            "__pycache__/ directories",
            "*.pyc files",
        ],
        "system_services": [
            "map2-backend.service",
            "map2-web.service",
            "map2-boot-manager.service",
            "(reinstall via ./install-boot-manager.sh)",
        ],
        "logs": [
            "logs/ directory",
            "/tmp/map2_*.log files",
        ],
    }

    def __init__(self, settings: Optional[BackupSettings] = None):
        """Initialize backup service with optional settings."""
        self.settings = settings or BackupSettings()
        self._ensure_backup_dir()
        self._settings_file = Path(self.settings.backup_location) / "settings.json"
        self._load_settings()

    def get_settings(self) -> BackupSettings:
        """Get current backup settings."""
        return self.settings

    def update_settings(self, max_backups: Optional[int] = None,
                       retention_days: Optional[int] = None,
                       auto_cleanup: Optional[bool] = None) -> BackupSettings:
        """Update backup settings."""
        if max_backups is not None:
            self.settings.max_backups = max(1, min(100, max_backups))
        if retention_days is not None:
            self.settings.retention_days = max(1, min(365, retention_days))
        if auto_cleanup is not None:
            self.settings.auto_cleanup = auto_cleanup
        self._save_settings()
        return self.settings

    async def list_backups(self) -> List[BackupInfo]:
        """List all available backups, sorted by date (newest first)."""
        backups = []
        backup_dir = Path(self.settings.backup_location)

        if not backup_dir.exists():
            return []

        for backup_file in backup_dir.glob("map2-backup-*.tar.gz"):
            try:
                # Extract backup ID from filename
                backup_id = backup_file.stem.replace("map2-backup-", "").replace(".tar", "")

                # Get file info
                stat = backup_file.stat()
                created_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

                # Try to read manifest
                manifest = None
                valid = True
                try:
                    with tarfile.open(backup_file, "r:gz") as tar:
                        manifest_member = tar.getmember("manifest.json")
                        manifest_file = tar.extractfile(manifest_member)
                        if manifest_file:
                            manifest = json.load(manifest_file)
                            created_at = manifest.get("created_at", created_at)
                except Exception:
                    valid = False

                backups.append(BackupInfo(
                    id=backup_id,
                    filename=backup_file.name,
                    path=str(backup_file),
                    created_at=created_at,
                    size_bytes=stat.st_size,
                    size_human=self._human_readable_size(stat.st_size),
                    valid=valid,
                    manifest=manifest
                ))
            except Exception as e:
                logger.error(f"Error reading backup {backup_file}: {e}")

        # Sort by created_at descending (newest first)
        backups.sort(key=lambda x: x.created_at, reverse=True)
        return backups
    async def get_backup(self, backup_id: str) -> Optional[BackupInfo]:
        """Get details about a specific backup."""
        backups = await self.list_backups()
        for backup in backups:
            if backup.id == backup_id:
                return backup
        return None
    async def delete_backup(self, backup_id: str) -> bool:
        """Delete a backup file."""
        backup = await self.get_backup(backup_id)
        if not backup:
            return False

        try:
            Path(backup.path).unlink()
            return True
        except Exception as e:
            logger.error(f"Failed to delete backup {backup_id}: {e}")
            return False
    async def cleanup_old_backups(self) -> Dict[str, Any]:
        """Apply retention policy and cleanup old backups."""
        results = {
            "deleted_count": 0,
            "deleted_backups": [],
            "remaining_count": 0
        }

        backups = await self.list_backups()

        # Delete by count limit
        if len(backups) > self.settings.max_backups:
            to_delete = backups[self.settings.max_backups:]
            for backup in to_delete:
                if await self.delete_backup(backup.id):
                    results["deleted_count"] += 1
                    results["deleted_backups"].append(backup.id)

        # Delete by age
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.settings.retention_days)
        backups = await self.list_backups()  # Refresh list

        for backup in backups:
            try:
                backup_date = datetime.fromisoformat(backup.created_at)
                if backup_date < cutoff_date:
                    if await self.delete_backup(backup.id):
                        results["deleted_count"] += 1
                        results["deleted_backups"].append(backup.id)
            except Exception:
                pass

        # Get final count
        backups = await self.list_backups()
        results["remaining_count"] = len(backups)

        return results
    async def get_backup_status(self) -> Dict[str, Any]:
        """Get overall backup status and statistics."""
        backups = await self.list_backups()

        total_size = sum(b.size_bytes for b in backups)
        valid_count = sum(1 for b in backups if b.valid)

        last_backup = backups[0] if backups else None

        return {
            "backup_count": len(backups),
            "valid_count": valid_count,
            "invalid_count": len(backups) - valid_count,
            "total_size_bytes": total_size,
            "total_size_human": self._human_readable_size(total_size),
            "last_backup": asdict(last_backup) if last_backup else None,
            "backup_location": self.settings.backup_location,
            "settings": asdict(self.settings),
        }
    async def update_all_backups(self) -> Dict[str, Any]:
        """
        Update all valid backups with the latest reinstaller and documentation.

        Returns:
            Dictionary with update results for each backup
        """
        results = {
            "updated": [],
            "failed": [],
            "skipped": [],
            "total_processed": 0
        }

        backups = await self.list_backups()

        for backup in backups:
            results["total_processed"] += 1

            if not backup.valid:
                results["skipped"].append({
                    "id": backup.id,
                    "reason": "Invalid backup"
                })
                continue

            try:
                await self.update_backup(backup.id)
                results["updated"].append(backup.id)
            except Exception as e:
                results["failed"].append({
                    "id": backup.id,
                    "error": str(e)
                })
                logger.error(f"Failed to update backup {backup.id}: {e}")

        return results



def get_backup_service() -> BackupService:
    """Get or create the backup service singleton."""
    return BackupService.get_instance()


def reset_backup_service() -> None:
    """Reset the backup service singleton (primarily for testing)."""
    BackupService.reset_instance()
