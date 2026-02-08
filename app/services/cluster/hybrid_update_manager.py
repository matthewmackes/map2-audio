"""
Hybrid Update Manager

Coordinates both RPM-based and Git-based updates.
Auto-detects environment and routes to appropriate updater.
"""

import os
import logging
from typing import Dict, Optional, List
from enum import Enum
from dataclasses import dataclass

from app.services.cluster.map2_git_updater import MAP2GitUpdater, get_git_updater
from app.services.cluster.fedora_package_manager import FedoraPackageManager

logger = logging.getLogger(__name__)


class UpdateMode(str, Enum):
    """Update mode selection."""
    GIT = "git"          # Pull from git repository
    RPM = "rpm"          # Install via DNF/RPM
    AUTO = "auto"        # Auto-detect based on environment


class UpdateEnvironment(str, Enum):
    """Deployment environment."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


@dataclass
class HybridUpdateConfig:
    """Configuration for hybrid update system."""
    mode: UpdateMode = UpdateMode.AUTO
    environment: UpdateEnvironment = UpdateEnvironment.DEVELOPMENT
    git_repository: str = "https://github.com/matthewmackes/map2-audio.git"
    git_branch: str = "main"
    rpm_repository: str = "https://map2-audio.github.io/rpm/fedora/40"
    app_path: str = "/opt/map2-audio"
    validate_after_update: bool = True
    rollback_on_failure: bool = True


class HybridUpdateManager:
    """
    Manages both RPM and Git-based updates.
    
    Auto-detects environment and selects appropriate update method:
    - Development: Git-based updates from repository
    - Production: RPM-based updates from repository
    - Auto: Detects installation method and uses corresponding updater
    """

    def __init__(self, config: Optional[HybridUpdateConfig] = None):
        """
        Initialize hybrid update manager.
        
        Args:
            config: Update configuration (uses defaults if not provided)
        """
        self.config = config or HybridUpdateConfig()
        self.git_updater = get_git_updater(self.config.app_path)
        self.rpm_updater = FedoraPackageManager()
        self.mode = self._detect_update_mode()

        logger.info(f"Hybrid update manager initialized: mode={self.mode}, env={self.config.environment}")

    def _detect_update_mode(self) -> UpdateMode:
        """
        Auto-detect update mode based on installation method.
        
        Returns:
            UpdateMode.RPM if installed via RPM
            UpdateMode.GIT if git repository exists
            UpdateMode.GIT as fallback for development
        """
        if self.config.mode != UpdateMode.AUTO:
            return self.config.mode

        # Check if installed via RPM
        try:
            import subprocess
            result = subprocess.run(
                ["rpm", "-q", "map2-audio"],
                capture_output=True
            )
            if result.returncode == 0:
                logger.info("Detected RPM installation")
                return UpdateMode.RPM
        except Exception:
            pass

        # Check if git repository exists
        git_dir = os.path.join(self.config.app_path, ".git")
        if os.path.exists(git_dir):
            logger.info("Detected Git repository")
            return UpdateMode.GIT

        # Default to Git for development
        logger.info("Defaulting to Git mode")
        return UpdateMode.GIT

    async def trigger_application_update(
        self,
        version: Optional[str] = None,
        branch: str = "main",
        node_id: Optional[str] = None
    ) -> Dict:
        """
        Trigger MAP2 application update.
        
        Args:
            version: Target version (for RPM mode) or branch (for git mode)
            branch: Git branch (ignored in RPM mode)
            node_id: Node ID for logging
            
        Returns:
            Update result dictionary
        """
        logger.info(f"Triggering application update: mode={self.mode}, version={version or branch}")

        if self.mode == UpdateMode.RPM:
            return await self._update_via_rpm(version or "latest", node_id)
        else:
            return await self._update_via_git(branch or self.config.git_branch, node_id)

    async def trigger_system_update(self, node_id: Optional[str] = None) -> Dict:
        """
        Trigger system package updates (RPM).
        
        Args:
            node_id: Node ID for logging
            
        Returns:
            Update result dictionary
        """
        logger.info(f"Triggering system update on {node_id or 'local'}")
        
        try:
            updates = self.rpm_updater.check_updates()
            
            if not updates:
                return {
                    "status": "ok",
                    "message": "System is up to date",
                    "updates_available": 0
                }

            # Download packages
            package_names = [u.name for u in updates]
            self.rpm_updater.download_packages(package_names)

            # Apply updates
            success = self.rpm_updater.apply_updates(package_names)

            if success:
                return {
                    "status": "ok",
                    "message": f"Updated {len(package_names)} packages",
                    "packages": package_names,
                    "updates_count": len(package_names)
                }
            else:
                return {
                    "status": "error",
                    "message": "Failed to apply system updates"
                }

        except Exception as e:
            logger.error(f"System update failed: {e}")
            return {
                "status": "error",
                "message": f"System update failed: {e}"
            }

    async def trigger_full_update(
        self,
        update_system: bool = True,
        update_application: bool = True,
        version: Optional[str] = None,
        node_id: Optional[str] = None
    ) -> Dict:
        """
        Trigger full cluster update (system + application).
        
        Args:
            update_system: Whether to update system packages
            update_application: Whether to update MAP2 application
            version: Target version
            node_id: Node ID for logging
            
        Returns:
            Update result dictionary
        """
        logger.info(f"Triggering full update: system={update_system}, app={update_application}")

        results = {}

        # Phase 1: System packages
        if update_system:
            logger.info("Phase 1: Updating system packages")
            results["system"] = await self.trigger_system_update(node_id)

        # Phase 2: MAP2 application
        if update_application:
            logger.info("Phase 2: Updating MAP2 application")
            results["application"] = await self.trigger_application_update(version, node_id=node_id)

        # Overall status
        all_ok = all(r.get("status") == "ok" for r in results.values())

        return {
            "status": "ok" if all_ok else "partial",
            "message": "Full update completed",
            "results": results,
            "success": all_ok
        }

    async def _update_via_git(
        self,
        branch: str,
        node_id: Optional[str] = None
    ) -> Dict:
        """Update via git pull."""
        logger.info(f"Updating via git: branch={branch}")

        result = await self.git_updater.update_application(
            branch=branch,
            node_id=node_id,
            validate=self.config.validate_after_update
        )

        return {
            "status": "ok" if result.success else "error",
            "message": result.message or result.error,
            "commit_before": result.commit_before,
            "commit_after": result.commit_after,
            "duration_seconds": result.duration_seconds,
            "success": result.success
        }

    async def _update_via_rpm(
        self,
        version: str,
        node_id: Optional[str] = None
    ) -> Dict:
        """Update via RPM/DNF."""
        logger.info(f"Updating via RPM: version={version}")

        try:
            # Install specific version or latest
            cmd = f"dnf install -y map2-audio{'=' + version if version != 'latest' else ''}"

            import subprocess
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True
            )

            if result.returncode == 0:
                return {
                    "status": "ok",
                    "message": f"Updated to version {version}",
                    "success": True
                }
            else:
                return {
                    "status": "error",
                    "message": f"RPM update failed: {result.stderr.decode()}",
                    "success": False
                }

        except Exception as e:
            logger.error(f"RPM update failed: {e}")
            return {
                "status": "error",
                "message": f"RPM update failed: {e}",
                "success": False
            }

    def get_current_version(self, node_id: Optional[str] = None) -> str:
        """
        Get current application version.
        
        Returns git commit (git mode) or RPM version (rpm mode)
        """
        if self.mode == UpdateMode.RPM:
            try:
                import subprocess
                result = subprocess.run(
                    ["rpm", "-q", "map2-audio", "--queryformat", "%{VERSION}"],
                    capture_output=True
                )
                return result.stdout.decode().strip()
            except Exception:
                return "unknown"
        else:
            # Git mode - return commit hash
            import subprocess
            try:
                result = subprocess.run(
                    f"cd {self.config.app_path} && git rev-parse --short HEAD",
                    shell=True,
                    capture_output=True
                )
                return result.stdout.decode().strip()
            except Exception:
                return "unknown"


def get_hybrid_update_manager(
    config: Optional[HybridUpdateConfig] = None
) -> HybridUpdateManager:
    """Get singleton instance of hybrid update manager."""
    global _hybrid_manager_instance
    if "_hybrid_manager_instance" not in globals():
        _hybrid_manager_instance = HybridUpdateManager(config)
    return _hybrid_manager_instance
