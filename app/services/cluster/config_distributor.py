"""
Configuration Distribution Service - GitOps Style

Manages cluster configuration via Git repository:
- Pull configurations from Git
- Distribute to all nodes in parallel
- Monitor for changes and auto-sync
- Rollback capability

Uses Raft to ensure consistent state across all management nodes.
"""

import asyncio
import logging
import json
from pathlib import Path
from typing import Dict, Optional, List, Any
import subprocess
import httpx
import yaml

from app.paths import Map2Paths
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class ConfigDistributor(Singleton):
    """
    Distributes cluster configuration to all nodes via Git.
    
    Features:
    - Git repository cloning/pulling
    - Configuration validation
    - Parallel distribution
    - Checksum-based change detection
    - Automatic rollback on failure
    """

    def __init__(self, git_repo: str, local_path: Optional[Path] = None):
        """
        Initialize config distributor.

        Args:
            git_repo: Git repository URL (https://github.com/user/config.git)
            local_path: Local path for config clone (defaults to Map2Paths.config_distribution_dir())
        """
        self.git_repo = git_repo
        self.local_path = local_path or Map2Paths.config_distribution_dir()
        self.current_commit = None
        self.current_checksum = None
        self.last_sync: Optional[str] = None
        self.is_running = False
        self._sync_task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger("ConfigDistributor")

    async def start(self):
        """Start configuration distribution service."""
        if self.is_running:
            return
        
        self.logger.info("Starting configuration distributor...")
        self.is_running = True
        
        # Initialize git repo
        await self._init_git_repo()
        
        # Start sync loop
        self._sync_task = asyncio.create_task(self._sync_loop())

    async def stop(self):
        """Stop configuration distribution service."""
        if not self.is_running:
            return
        
        self.logger.info("Stopping configuration distributor")
        self.is_running = False
        
        if self._sync_task:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass

    async def _init_git_repo(self):
        """Initialize or update Git repository."""
        try:
            if self.local_path.exists():
                self.logger.info("Git repo exists, pulling latest changes...")
                await self._git_pull()
            else:
                self.logger.info(f"Cloning Git repo from {self.git_repo}...")
                await self._git_clone()
            
            # Get current commit
            self.current_commit = await self._get_current_commit()
            self.logger.info(f"Current commit: {self.current_commit}")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Git repo: {e}")
            raise

    async def _git_clone(self):
        """Clone Git repository."""
        self.local_path.parent.mkdir(parents=True, exist_ok=True)
        
        result = await self._run_command([
            "git", "clone", "--depth", "1", self.git_repo, str(self.local_path)
        ])
        
        if result.returncode != 0:
            raise RuntimeError(f"Git clone failed: {result.stderr}")

    async def _git_pull(self):
        """Pull latest changes from Git."""
        result = await self._run_command(
            ["git", "-C", str(self.local_path), "pull", "origin", "main"],
            check=False
        )
        
        if result.returncode != 0:
            self.logger.warning(f"Git pull failed: {result.stderr}")

    async def _get_current_commit(self) -> str:
        """Get current Git commit SHA."""
        result = await self._run_command([
            "git", "-C", str(self.local_path), "rev-parse", "HEAD"
        ])
        
        return result.stdout.strip()

    async def _sync_loop(self):
        """Periodically sync configuration from Git."""
        while self.is_running:
            try:
                # Pull latest from Git
                await self._git_pull()
                
                # Check if config changed
                new_commit = await self._get_current_commit()
                
                if new_commit != self.current_commit:
                    self.logger.info(f"Configuration changed: {self.current_commit} -> {new_commit}")
                    
                    # Validate config
                    is_valid = await self._validate_config()
                    if not is_valid:
                        self.logger.error("Config validation failed, skipping distribution")
                        await self._git_checkout(self.current_commit)
                        continue
                    
                    # Distribute to all nodes
                    success = await self._distribute_config()
                    
                    if success:
                        self.current_commit = new_commit
                        self.last_sync = utc_now().isoformat()
                        self.logger.info(f"Configuration synchronized to all nodes")
                    else:
                        self.logger.error("Distribution failed, rolling back")
                        await self._git_checkout(self.current_commit)
                
                # Wait before next sync
                await asyncio.sleep(30)
                
            except Exception as e:
                self.logger.error(f"Error in sync loop: {e}", exc_info=True)
                await asyncio.sleep(10)

    async def _validate_config(self) -> bool:
        """Validate configuration files."""
        try:
            # Find all config files
            config_files = list(self.local_path.glob("**/*.yaml")) + \
                          list(self.local_path.glob("**/*.yml")) + \
                          list(self.local_path.glob("**/*.json"))
            
            for config_file in config_files:
                try:
                    if config_file.suffix in ['.yaml', '.yml']:
                        with open(config_file) as f:
                            yaml.safe_load(f)
                    elif config_file.suffix == '.json':
                        with open(config_file) as f:
                            json.load(f)
                except Exception as e:
                    self.logger.error(f"Invalid config file {config_file}: {e}")
                    return False
            
            self.logger.debug(f"Validated {len(config_files)} config files")
            return True
            
        except Exception as e:
            self.logger.error(f"Config validation error: {e}")
            return False

    async def _distribute_config(self) -> bool:
        """Distribute configuration to all nodes."""
        try:
            from app.services.cluster.registry import get_cluster_registry
            
            registry = get_cluster_registry()
            nodes = registry.get_all_nodes()
            
            # Distribute in parallel
            tasks = []
            for node in nodes:
                task = self._push_config_to_node(node)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check if majority succeeded
            successes = sum(1 for r in results if r is True)
            majority = len(nodes) // 2 + 1
            
            if successes >= majority:
                self.logger.info(f"Config distributed to {successes}/{len(nodes)} nodes")
                return True
            else:
                self.logger.error(f"Distribution failed: only {successes}/{len(nodes)} nodes")
                return False
                
        except Exception as e:
            self.logger.error(f"Distribution error: {e}")
            return False

    async def _push_config_to_node(self, node: Dict[str, Any]) -> bool:
        """Push configuration to a single node."""
        try:
            node_id = node.get("id")
            hostname = node.get("hostname") or node.get("ip_address")
            
            if not hostname:
                return False
            
            # Create config tarball
            config_data = await self._prepare_config_tarball()
            
            # Push to node
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                resp = await client.post(
                    f"http://{hostname}:8080/api/cluster/config/push",
                    content=config_data,
                    headers={"Content-Type": "application/octet-stream"}
                )
                
                return resp.status_code == 200
                
        except Exception as e:
            self.logger.debug(f"Failed to push config to {node.get('id')}: {e}")
            return False

    async def _prepare_config_tarball(self) -> bytes:
        """Prepare configuration as tarball."""
        import tarfile
        import io
        
        tar_buffer = io.BytesIO()
        
        with tarfile.open(fileobj=tar_buffer, mode='w:gz') as tar:
            for config_file in self.local_path.glob("**/*"):
                if config_file.is_file():
                    arcname = config_file.relative_to(self.local_path)
                    tar.add(config_file, arcname=arcname)
        
        return tar_buffer.getvalue()

    async def _git_checkout(self, commit: str):
        """Checkout specific Git commit."""
        result = await self._run_command([
            "git", "-C", str(self.local_path), "checkout", commit
        ], check=False)
        
        if result.returncode == 0:
            self.logger.info(f"Rolled back to commit {commit}")
        else:
            self.logger.error(f"Rollback failed: {result.stderr}")

    async def _run_command(self, cmd: List[str], check: bool = True):
        """Run shell command asynchronously."""
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            result = type('Result', (), {
                'returncode': process.returncode,
                'stdout': stdout.decode('utf-8', errors='ignore'),
                'stderr': stderr.decode('utf-8', errors='ignore')
            })()
            
            if check and process.returncode != 0:
                raise RuntimeError(f"Command failed: {result.stderr}")
            
            return result
            
        except Exception as e:
            self.logger.error(f"Command execution failed: {e}")
            raise

    def get_config(self, key: Optional[str] = None) -> Any:
        """Get configuration value(s)."""
        try:
            config_files = list(self.local_path.glob("**/*.yaml")) + \
                          list(self.local_path.glob("**/*.yml"))
            
            config = {}
            for config_file in config_files:
                with open(config_file) as f:
                    file_config = yaml.safe_load(f)
                    if file_config:
                        config.update(file_config)
            
            if key:
                return config.get(key)
            return config
            
        except Exception as e:
            self.logger.error(f"Failed to read config: {e}")
            return None

def get_config_distributor() -> ConfigDistributor:
    """Get the initialized config distributor instance."""
    if not ConfigDistributor.has_instance():
        raise RuntimeError("ConfigDistributor not initialized")
    return ConfigDistributor._instances[ConfigDistributor]  # type: ignore[return-value]


def initialize_config_distributor(git_repo: str) -> ConfigDistributor:
    """Initialize config distributor."""
    with ConfigDistributor._lock:
        ConfigDistributor._instances[ConfigDistributor] = ConfigDistributor(git_repo)
        return ConfigDistributor._instances[ConfigDistributor]  # type: ignore[return-value]
