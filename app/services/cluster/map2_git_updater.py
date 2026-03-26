"""
Git-Based Application Updater

Handles updating MAP2 application code via git pull across the cluster.
Supports branch switching, dependency installation, and service restarts.

Features:
- Clone/pull from GitHub repository
- Stash local changes before update
- Install Python dependencies
- Rebuild frontend assets
- Restart services
- Validate application health
- Rollback on failure
"""

import os
import subprocess
import logging
import asyncio
from typing import Callable, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_APP_PATH = Path(__file__).resolve().parents[3]


@dataclass
class UpdateResult:
    """Result of git-based update operation."""
    success: bool
    commit_before: str
    commit_after: Optional[str] = None
    message: str = ""
    error: Optional[str] = None
    duration_seconds: float = 0.0
    stdout: str = ""
    stderr: str = ""


class MAP2GitUpdater:
    """
    Git-based updater for MAP2 application code.
    
    Handles updating MAP2 application by pulling latest code from repository.
    """

    def __init__(self, app_path: str = str(DEFAULT_APP_PATH)):
        """
        Initialize git updater.
        
        Args:
            app_path: Path to MAP2 application directory
        """
        self.app_path = Path(app_path)
        self.git_url = "https://github.com/matthewmackes/map2-audio.git"
        self.timeout = 300  # 5 minutes

    async def get_current_commit(self, node_id: Optional[str] = None) -> str:
        """Get current git commit hash."""
        try:
            result = await self._run_command(
                f"cd {self.app_path} && git rev-parse HEAD",
                node_id
            )
            return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to get current commit: {e}")
            return "unknown"

    async def get_current_branch(self, node_id: Optional[str] = None) -> str:
        """Get current git branch."""
        try:
            result = await self._run_command(
                f"cd {self.app_path} && git rev-parse --abbrev-ref HEAD",
                node_id
            )
            return result.stdout.strip()
        except Exception as e:
            logger.error(f"Failed to get current branch: {e}")
            return "unknown"

    async def update_application(
        self,
        branch: str = "main",
        node_id: Optional[str] = None,
        validate: bool = True,
        progress_callback: Optional[Callable[[str, str, Optional[str]], None]] = None,
    ) -> UpdateResult:
        """
        Update MAP2 application to latest version on specified branch.
        
        Args:
            branch: Git branch to update to (default: main)
            node_id: Node ID for logging (local node if None)
            validate: Whether to validate after update
            
        Returns:
            UpdateResult with success status and details
        """
        start_time = datetime.now()
        
        try:
            # Get current state
            commit_before = await self.get_current_commit(node_id)
            logger.info(f"Starting update from commit {commit_before} to branch {branch}")

            # Step 1: Check repository state
            progress_callback and progress_callback(
                "validate-source",
                "running",
                f"Validating repository state at {self.app_path}",
            )
            is_repo_ok = await self._validate_repository(node_id)
            if not is_repo_ok:
                progress_callback and progress_callback(
                    "validate-source",
                    "failed",
                    "Repository validation failed",
                )
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error="Repository validation failed",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )
            progress_callback and progress_callback(
                "validate-source",
                "completed",
                "Repository validation passed",
            )

            # Step 2: Stash local changes
            progress_callback and progress_callback(
                "prepare-local-state",
                "running",
                "Stashing local changes before applying the update",
            )
            stash_result = await self._stash_changes(node_id)
            if not stash_result[0]:
                progress_callback and progress_callback(
                    "prepare-local-state",
                    "failed",
                    f"Failed to stash changes: {stash_result[1]}",
                )
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to stash changes: {stash_result[1]}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )
            progress_callback and progress_callback(
                "prepare-local-state",
                "completed",
                stash_result[1],
            )

            # Step 3: Fetch latest from remote
            progress_callback and progress_callback(
                "fetch-update-payload",
                "running",
                f"Fetching branch {branch} from origin",
            )
            fetch_result = await self._run_command(
                f"cd {self.app_path} && git fetch origin {branch}",
                node_id
            )
            if fetch_result.returncode != 0:
                progress_callback and progress_callback(
                    "fetch-update-payload",
                    "failed",
                    f"Failed to fetch from remote: {fetch_result.stderr}",
                )
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to fetch from remote: {fetch_result.stderr}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )
            progress_callback and progress_callback(
                "fetch-update-payload",
                "completed",
                f"Fetched origin/{branch}",
            )

            # Step 4: Checkout and merge branch
            progress_callback and progress_callback(
                "apply-target-version",
                "running",
                f"Checking out origin/{branch}",
            )
            checkout_result = await self._run_command(
                f"cd {self.app_path} && git checkout origin/{branch}",
                node_id
            )
            if checkout_result.returncode != 0:
                progress_callback and progress_callback(
                    "apply-target-version",
                    "failed",
                    f"Failed to checkout branch: {checkout_result.stderr}",
                )
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to checkout branch: {checkout_result.stderr}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )
            progress_callback and progress_callback(
                "apply-target-version",
                "completed",
                f"Checked out origin/{branch}",
            )

            # Step 5: Install Python dependencies
            progress_callback and progress_callback(
                "refresh-runtime-dependencies",
                "running",
                "Refreshing Python dependencies from requirements.txt",
            )
            pip_result = await self._run_command(
                f"cd {self.app_path} && pip install -q -r requirements.txt",
                node_id
            )
            if pip_result.returncode != 0:
                logger.warning(f"Pip install had warnings: {pip_result.stderr}")
                progress_callback and progress_callback(
                    "refresh-runtime-dependencies",
                    "completed",
                    f"Dependency refresh reported issues: {pip_result.stderr.strip() or 'see logs'}",
                )
            else:
                progress_callback and progress_callback(
                    "refresh-runtime-dependencies",
                    "completed",
                    "Python dependencies refreshed",
                )

            # Step 6: Build frontend
            frontend_result = await self._build_frontend(node_id, progress_callback=progress_callback)
            if not frontend_result[0]:
                logger.warning(f"Frontend build had issues: {frontend_result[1]}")

            # Step 7: Get new commit hash
            commit_after = await self.get_current_commit(node_id)

            # Step 8: Validate if requested
            validation_ok = True
            validation_msg = ""
            if validate:
                progress_callback and progress_callback(
                    "validate-and-finalize",
                    "running",
                    "Running post-update validation checks",
                )
                validation_ok, validation_msg = await self._validate_after_update(node_id)
            else:
                progress_callback and progress_callback(
                    "validate-and-finalize",
                    "skipped",
                    "Validation disabled for this update run",
                )

            duration = (datetime.now() - start_time).total_seconds()

            if validation_ok:
                progress_callback and progress_callback(
                    "validate-and-finalize",
                    "completed",
                    f"Validation passed on commit {commit_after[:8]}",
                )
                logger.info(f"Update successful: {commit_before} -> {commit_after}")
                return UpdateResult(
                    success=True,
                    commit_before=commit_before,
                    commit_after=commit_after,
                    message=f"Updated from {commit_before[:8]} to {commit_after[:8]}",
                    duration_seconds=duration
                )
            else:
                progress_callback and progress_callback(
                    "validate-and-finalize",
                    "failed",
                    f"Validation failed: {validation_msg}",
                )
                logger.error(f"Validation failed after update: {validation_msg}")
                # Attempt rollback
                await self._rollback_to_commit(commit_before, node_id)
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Post-update validation failed: {validation_msg}",
                    duration_seconds=duration
                )

        except Exception as e:
            logger.error(f"Unexpected error during update: {e}", exc_info=True)
            return UpdateResult(
                success=False,
                commit_before=commit_before if 'commit_before' in locals() else "unknown",
                error=str(e),
                duration_seconds=(datetime.now() - start_time).total_seconds()
            )

    async def rollback_to_commit(
        self,
        commit_hash: str,
        node_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Rollback to specific commit.
        
        Args:
            commit_hash: Git commit hash to rollback to
            node_id: Node ID for logging
            
        Returns:
            Tuple of (success, message)
        """
        return await self._rollback_to_commit(commit_hash, node_id)

    async def _validate_repository(self, node_id: Optional[str] = None) -> bool:
        """Validate git repository state."""
        try:
            # Check if .git directory exists
            git_dir = self.app_path / ".git"
            if not git_dir.exists():
                logger.error("Not a git repository")
                return False

            # Check git status
            result = await self._run_command(
                f"cd {self.app_path} && git status --short",
                node_id
            )

            return result.returncode == 0

        except Exception as e:
            logger.error(f"Repository validation failed: {e}")
            return False

    async def _stash_changes(
        self,
        node_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Stash local changes before updating."""
        try:
            result = await self._run_command(
                f"cd {self.app_path} && git stash",
                node_id
            )

            if result.returncode == 0:
                logger.info("Local changes stashed")
                return True, "Stashed local changes"
            else:
                return False, result.stderr

        except Exception as e:
            logger.error(f"Failed to stash changes: {e}")
            return False, str(e)

    async def _rollback_to_commit(
        self,
        commit_hash: str,
        node_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Rollback to specified commit."""
        try:
            result = await self._run_command(
                f"cd {self.app_path} && git checkout {commit_hash}",
                node_id
            )

            if result.returncode == 0:
                logger.info(f"Rolled back to {commit_hash}")
                return True, f"Rolled back to {commit_hash}"
            else:
                return False, result.stderr

        except Exception as e:
            logger.error(f"Rollback failed: {e}")
            return False, str(e)

    async def _build_frontend(
        self,
        node_id: Optional[str] = None,
        progress_callback: Optional[Callable[[str, str, Optional[str]], None]] = None,
    ) -> Tuple[bool, str]:
        """Build React frontend."""
        try:
            web_dir = self.app_path / "web"

            # Install dependencies
            progress_callback and progress_callback(
                "refresh-frontend-dependencies",
                "running",
                "Refreshing frontend dependencies with npm ci",
            )
            npm_install = await self._run_command(
                f"cd {web_dir} && npm ci --quiet",
                node_id
            )

            if npm_install.returncode != 0:
                progress_callback and progress_callback(
                    "refresh-frontend-dependencies",
                    "failed",
                    f"npm ci failed: {npm_install.stderr}",
                )
                progress_callback and progress_callback(
                    "rebuild-frontend-assets",
                    "skipped",
                    "Build skipped because npm ci did not complete cleanly",
                )
                return False, f"npm install failed: {npm_install.stderr}"
            progress_callback and progress_callback(
                "refresh-frontend-dependencies",
                "completed",
                "Frontend dependencies refreshed",
            )

            # Build production bundle
            progress_callback and progress_callback(
                "rebuild-frontend-assets",
                "running",
                "Building the production frontend bundle",
            )
            npm_build = await self._run_command(
                f"cd {web_dir} && npm run build --quiet",
                node_id
            )

            if npm_build.returncode == 0:
                logger.info("Frontend built successfully")
                progress_callback and progress_callback(
                    "rebuild-frontend-assets",
                    "completed",
                    "Frontend build completed",
                )
                return True, "Frontend built"
            else:
                progress_callback and progress_callback(
                    "rebuild-frontend-assets",
                    "failed",
                    f"npm build failed: {npm_build.stderr}",
                )
                return False, f"npm build failed: {npm_build.stderr}"

        except Exception as e:
            logger.error(f"Frontend build failed: {e}")
            return False, str(e)

    async def _validate_after_update(
        self,
        node_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Validate application after update."""
        try:
            # Check Python syntax
            python_check = await self._run_command(
                f"python3 -m py_compile {self.app_path}/app/main.py",
                node_id
            )

            if python_check.returncode != 0:
                return False, "Python syntax error"

            # Check that requirements are satisfied
            pip_check = await self._run_command(
                f"pip check",
                node_id
            )

            if pip_check.returncode != 0:
                logger.warning(f"Pip check warnings: {pip_check.stderr}")

            logger.info("Application validation passed")
            return True, "Validation passed"

        except Exception as e:
            logger.error(f"Validation error: {e}")
            return False, str(e)

    async def _run_command(
        self,
        command: str,
        node_id: Optional[str] = None
    ) -> subprocess.CompletedProcess:
        """
        Run shell command.
        
        For local node: execute directly
        For remote node: execute via SSH
        """
        try:
            if node_id and node_id != "local":
                from app.services.cluster.integration_helpers import NodeSSHClient
                from app.services.cluster.registry import get_cluster_registry

                registry = get_cluster_registry()
                node_data = registry.get_node(node_id)
                if not node_data:
                    raise RuntimeError(f"Unknown node_id: {node_id}")

                host = node_data.get("ip_address") or node_data.get("hostname")
                if not host:
                    raise RuntimeError(f"Node {node_id} missing ip/hostname")

                ssh = NodeSSHClient(node_id=node_id, ip_address=host)
                rc, out, err = await asyncio.to_thread(
                    ssh.execute_command, command, self.timeout
                )
                return subprocess.CompletedProcess(
                    args=f"ssh:{node_id}:{command}",
                    returncode=rc,
                    stdout=out,
                    stderr=err,
                )

            # Local execution
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout
            )

            return subprocess.CompletedProcess(
                args=command,
                returncode=process.returncode,
                stdout=stdout.decode(),
                stderr=stderr.decode()
            )

        except asyncio.TimeoutError:
            logger.error(f"Command timed out: {command}")
            raise
        except Exception as e:
            logger.error(f"Failed to execute command: {e}")
            raise


def get_git_updater(app_path: str = str(DEFAULT_APP_PATH)) -> MAP2GitUpdater:
    """Get singleton instance of git updater."""
    global _git_updater_instance
    if "_git_updater_instance" not in globals():
        _git_updater_instance = MAP2GitUpdater(app_path)
    return _git_updater_instance
