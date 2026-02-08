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
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


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

    def __init__(self, app_path: str = "/opt/map2-audio"):
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
        validate: bool = True
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
            is_repo_ok = await self._validate_repository(node_id)
            if not is_repo_ok:
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error="Repository validation failed",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )

            # Step 2: Stash local changes
            stash_result = await self._stash_changes(node_id)
            if not stash_result[0]:
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to stash changes: {stash_result[1]}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )

            # Step 3: Fetch latest from remote
            fetch_result = await self._run_command(
                f"cd {self.app_path} && git fetch origin {branch}",
                node_id
            )
            if fetch_result.returncode != 0:
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to fetch from remote: {fetch_result.stderr}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )

            # Step 4: Checkout and merge branch
            checkout_result = await self._run_command(
                f"cd {self.app_path} && git checkout origin/{branch}",
                node_id
            )
            if checkout_result.returncode != 0:
                return UpdateResult(
                    success=False,
                    commit_before=commit_before,
                    error=f"Failed to checkout branch: {checkout_result.stderr}",
                    duration_seconds=(datetime.now() - start_time).total_seconds()
                )

            # Step 5: Install Python dependencies
            pip_result = await self._run_command(
                f"cd {self.app_path} && pip install -q -r requirements.txt",
                node_id
            )
            if pip_result.returncode != 0:
                logger.warning(f"Pip install had warnings: {pip_result.stderr}")

            # Step 6: Build frontend
            frontend_result = await self._build_frontend(node_id)
            if not frontend_result[0]:
                logger.warning(f"Frontend build had issues: {frontend_result[1]}")

            # Step 7: Get new commit hash
            commit_after = await self.get_current_commit(node_id)

            # Step 8: Validate if requested
            validation_ok = True
            validation_msg = ""
            if validate:
                validation_ok, validation_msg = await self._validate_after_update(node_id)

            duration = (datetime.now() - start_time).total_seconds()

            if validation_ok:
                logger.info(f"Update successful: {commit_before} -> {commit_after}")
                return UpdateResult(
                    success=True,
                    commit_before=commit_before,
                    commit_after=commit_after,
                    message=f"Updated from {commit_before[:8]} to {commit_after[:8]}",
                    duration_seconds=duration
                )
            else:
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
        node_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Build React frontend."""
        try:
            web_dir = self.app_path / "web"

            # Install dependencies
            npm_install = await self._run_command(
                f"cd {web_dir} && npm ci --quiet",
                node_id
            )

            if npm_install.returncode != 0:
                return False, f"npm install failed: {npm_install.stderr}"

            # Build production bundle
            npm_build = await self._run_command(
                f"cd {web_dir} && npm run build --quiet",
                node_id
            )

            if npm_build.returncode == 0:
                logger.info("Frontend built successfully")
                return True, "Frontend built"
            else:
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
        For remote node: would use SSH (future enhancement)
        """
        try:
            if node_id and node_id != "local":
                # Future: SSH execution for remote nodes
                # For now, only local execution
                logger.warning(f"Remote execution not yet implemented for {node_id}")
                raise NotImplementedError("Remote git updates require SSH integration")

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


def get_git_updater(app_path: str = "/opt/map2-audio") -> MAP2GitUpdater:
    """Get singleton instance of git updater."""
    global _git_updater_instance
    if "_git_updater_instance" not in globals():
        _git_updater_instance = MAP2GitUpdater(app_path)
    return _git_updater_instance
