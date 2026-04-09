"""
Hybrid Update Manager

Coordinates both RPM-based and Git-based updates.
Auto-detects environment and routes to appropriate updater.
"""

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

from app.services.cluster.map2_git_updater import get_git_updater
from app.services.cluster.fedora_package_manager import FedoraDNFManager

logger = logging.getLogger(__name__)

DEFAULT_APP_PATH = Path(__file__).resolve().parents[3]

HYBRID_APPLICATION_STEP_BLUEPRINT = [
    {
        "key": "detect-mode",
        "question": "Which update path should MAP2 use?",
        "detail": "Determine whether this node should update through Git or RPM.",
    },
    {
        "key": "identify-current-build",
        "question": "What build is currently installed?",
        "detail": "Read the currently installed commit or package version before changing anything.",
    },
    {
        "key": "validate-source",
        "question": "Is the update source healthy?",
        "detail": "Validate that the selected repository or package source is usable.",
    },
    {
        "key": "prepare-local-state",
        "question": "Can the node prepare its local state safely?",
        "detail": "Prepare the working tree or mark why that step is not needed for this mode.",
    },
    {
        "key": "fetch-update-payload",
        "question": "Can MAP2 fetch the requested update payload?",
        "detail": "Reach the remote branch or package metadata needed for the update.",
    },
    {
        "key": "apply-target-version",
        "question": "Can the target application version be applied?",
        "detail": "Checkout the requested branch or install the requested package.",
    },
    {
        "key": "refresh-runtime-dependencies",
        "question": "Can runtime dependencies be refreshed?",
        "detail": "Refresh Python or packaged runtime dependencies required by the updated build.",
    },
    {
        "key": "refresh-frontend-dependencies",
        "question": "Can frontend dependencies be refreshed?",
        "detail": "Refresh frontend dependencies when the update mode requires a rebuild.",
    },
    {
        "key": "rebuild-frontend-assets",
        "question": "Can the frontend bundle be rebuilt cleanly?",
        "detail": "Rebuild the production frontend assets if they are not shipped prebuilt.",
    },
    {
        "key": "validate-and-finalize",
        "question": "Does validation confirm the update is safe to keep?",
        "detail": "Run post-update validation and publish the final result back to the operator.",
    },
]


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
    app_path: str = str(DEFAULT_APP_PATH)
    validate_after_update: bool = True
    rollback_on_failure: bool = True


@dataclass
class HybridApplicationStep:
    key: str
    question: str
    detail: str
    status: str = "pending"
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    result: Optional[str] = None


@dataclass
class HybridApplicationProgress:
    status: str = "idle"
    mode: str = UpdateMode.AUTO.value
    environment: str = UpdateEnvironment.DEVELOPMENT.value
    running: bool = False
    current_version: Optional[str] = None
    target_version: Optional[str] = None
    current_step_key: Optional[str] = None
    current_step_index: Optional[int] = None
    message: str = "No update in progress"
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    steps: List[HybridApplicationStep] = field(default_factory=list)


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
        self.rpm_updater = FedoraDNFManager()
        self.mode = self._detect_update_mode()
        self.application_progress = self._make_idle_progress()

        logger.info(f"Hybrid update manager initialized: mode={self.mode}, env={self.config.environment}")

    def _make_steps(self) -> List[HybridApplicationStep]:
        return [
            HybridApplicationStep(
                key=step["key"],
                question=step["question"],
                detail=step["detail"],
            )
            for step in HYBRID_APPLICATION_STEP_BLUEPRINT
        ]

    def _make_idle_progress(self) -> HybridApplicationProgress:
        return HybridApplicationProgress(
            status="idle",
            mode=self.mode.value if isinstance(self.mode, UpdateMode) else str(self.mode),
            environment=self.config.environment.value,
            running=False,
            current_version=self.get_current_version(),
            message="No update in progress",
            steps=self._make_steps(),
        )

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _step_for_key(self, key: str) -> Optional[tuple[int, HybridApplicationStep]]:
        for index, step in enumerate(self.application_progress.steps):
            if step.key == key:
                return index, step
        return None

    def _start_application_progress(self, target_version: str) -> None:
        self.application_progress = HybridApplicationProgress(
            status="running",
            mode=self.mode.value,
            environment=self.config.environment.value,
            running=True,
            current_version=self.get_current_version(),
            target_version=target_version,
            message="Preparing update workflow",
            started_at=self._timestamp(),
            steps=self._make_steps(),
        )

    def _set_step_running(self, key: str, detail: Optional[str] = None) -> None:
        match = self._step_for_key(key)
        if not match:
            return
        index, step = match
        if step.started_at is None:
            step.started_at = self._timestamp()
        step.status = "running"
        step.completed_at = None
        if detail:
            step.result = detail
        self.application_progress.current_step_key = key
        self.application_progress.current_step_index = index
        self.application_progress.message = step.question

    def _set_step_completed(self, key: str, result: Optional[str] = None) -> None:
        match = self._step_for_key(key)
        if not match:
            return
        _, step = match
        if step.started_at is None:
            step.started_at = self._timestamp()
        step.status = "completed"
        step.completed_at = self._timestamp()
        if result:
            step.result = result
            self.application_progress.message = result

    def _set_step_skipped(self, key: str, reason: str) -> None:
        match = self._step_for_key(key)
        if not match:
            return
        _, step = match
        step.status = "skipped"
        if step.started_at is None:
            step.started_at = self._timestamp()
        step.completed_at = self._timestamp()
        step.result = reason

    def _set_step_failed(self, key: str, error: str) -> None:
        match = self._step_for_key(key)
        if not match:
            return
        _, step = match
        if step.started_at is None:
            step.started_at = self._timestamp()
        step.status = "failed"
        step.completed_at = self._timestamp()
        step.result = error
        self.application_progress.error = error
        self.application_progress.message = error

    def _report_progress(self, key: str, status: str, detail: Optional[str] = None) -> None:
        if status == "running":
            self._set_step_running(key, detail)
        elif status == "completed":
            self._set_step_completed(key, detail)
        elif status == "skipped":
            self._set_step_skipped(key, detail or "Skipped for this update mode")
        elif status == "failed":
            self._set_step_failed(key, detail or "Step failed")

    def _finalize_application_progress(
        self,
        status: str,
        message: str,
        *,
        error: Optional[str] = None,
    ) -> None:
        self.application_progress.status = status
        self.application_progress.running = False
        self.application_progress.completed_at = self._timestamp()
        self.application_progress.message = message
        self.application_progress.error = error
        self.application_progress.current_version = self.get_current_version()

    def get_application_status(self) -> Dict:
        if self.application_progress is None:
            self.application_progress = self._make_idle_progress()

        return {
            "status": self.application_progress.status,
            "mode": self.application_progress.mode,
            "environment": self.application_progress.environment,
            "running": self.application_progress.running,
            "current_version": self.application_progress.current_version,
            "target_version": self.application_progress.target_version,
            "current_step_key": self.application_progress.current_step_key,
            "current_step_index": self.application_progress.current_step_index,
            "message": self.application_progress.message,
            "error": self.application_progress.error,
            "started_at": self.application_progress.started_at,
            "completed_at": self.application_progress.completed_at,
            "last_update": self.application_progress.completed_at,
            "steps": [
                {
                    "key": step.key,
                    "question": step.question,
                    "detail": step.detail,
                    "status": step.status,
                    "started_at": step.started_at,
                    "completed_at": step.completed_at,
                    "result": step.result,
                }
                for step in self.application_progress.steps
            ],
        }

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
        target_version = version or branch or self.config.git_branch
        logger.info(f"Triggering application update: mode={self.mode}, version={target_version}")

        self._start_application_progress(target_version)
        self._report_progress(
            "detect-mode",
            "running",
            f"Detected {self.mode.value} update mode for {self.config.app_path}",
        )
        self._report_progress(
            "detect-mode",
            "completed",
            f"Using {self.mode.value.upper()} update mode",
        )

        current_version = self.get_current_version(node_id)
        self.application_progress.current_version = current_version
        self._report_progress(
            "identify-current-build",
            "running",
            "Reading the currently installed build identifier",
        )
        self._report_progress(
            "identify-current-build",
            "completed",
            f"Current build: {current_version}",
        )

        try:
            if self.mode == UpdateMode.RPM:
                result = await self._update_via_rpm(version or "latest", node_id)
            else:
                result = await self._update_via_git(branch or self.config.git_branch, node_id)

            if result.get("status") == "ok":
                self._finalize_application_progress(
                    "completed",
                    result.get("message", "Update completed"),
                )
            else:
                self._finalize_application_progress(
                    "failed",
                    result.get("message", "Update failed"),
                    error=result.get("message") or result.get("details"),
                )

            return result
        except Exception as e:
            logger.error(f"Application update failed unexpectedly: {e}", exc_info=True)
            if self.application_progress.current_step_key:
                self._report_progress(
                    self.application_progress.current_step_key,
                    "failed",
                    str(e),
                )
            self._finalize_application_progress(
                "failed",
                f"Application update failed: {e}",
                error=str(e),
            )
            raise

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
            updates = self.rpm_updater.check_for_updates()
            
            if not updates:
                return {
                    "status": "ok",
                    "message": "System is up to date",
                    "updates_available": 0
                }

            package_names = [u.package_name for u in updates]
            update_result = self.rpm_updater.apply_updates(packages=package_names)
            success = bool(update_result.get("success"))

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
                    "message": "Failed to apply system updates",
                    "details": update_result.get("stderr") or update_result.get("error", "")
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
            validate=self.config.validate_after_update,
            progress_callback=self._report_progress,
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
            self._report_progress(
                "validate-source",
                "running",
                "Checking the configured RPM repositories and available package metadata",
            )
            updates = self.rpm_updater.check_for_updates()
            self._report_progress(
                "validate-source",
                "completed",
                "RPM repository access succeeded",
            )
            self._report_progress(
                "prepare-local-state",
                "skipped",
                "RPM mode does not use a mutable git working tree",
            )
            self._report_progress(
                "fetch-update-payload",
                "running",
                "Resolving the requested MAP2 package version",
            )
            available_count = len(updates)
            self._report_progress(
                "fetch-update-payload",
                "completed",
                f"Resolved RPM metadata ({available_count} package update candidate(s) visible)",
            )
            self._report_progress(
                "refresh-runtime-dependencies",
                "skipped",
                "RPM mode installs runtime dependencies through the package manager",
            )
            self._report_progress(
                "refresh-frontend-dependencies",
                "skipped",
                "RPM mode expects packaged frontend dependencies",
            )
            self._report_progress(
                "rebuild-frontend-assets",
                "skipped",
                "RPM mode expects prebuilt frontend assets from the package",
            )

            # Install specific version or latest
            cmd = f"dnf install -y map2-audio{'=' + version if version != 'latest' else ''}"
            self._report_progress(
                "apply-target-version",
                "running",
                f"Applying RPM package target {version}",
            )

            import subprocess
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True
            )

            if result.returncode == 0:
                self._report_progress(
                    "apply-target-version",
                    "completed",
                    f"Installed MAP2 package target {version}",
                )
                self._report_progress(
                    "validate-and-finalize",
                    "running",
                    "Confirming the installed MAP2 package version",
                )
                installed_version = self.get_current_version(node_id)
                self._report_progress(
                    "validate-and-finalize",
                    "completed",
                    f"Installed version now reports {installed_version}",
                )
                return {
                    "status": "ok",
                    "message": f"Updated to version {version}",
                    "success": True
                }
            else:
                error_message = result.stderr.decode()
                self._report_progress(
                    "apply-target-version",
                    "failed",
                    error_message or "RPM update command failed",
                )
                return {
                    "status": "error",
                    "message": f"RPM update failed: {error_message}",
                    "success": False
                }

        except Exception as e:
            logger.error(f"RPM update failed: {e}")
            self._report_progress("validate-and-finalize", "failed", str(e))
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
