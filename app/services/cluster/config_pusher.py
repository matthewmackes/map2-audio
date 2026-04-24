"""
Configuration Distribution System (GitOps-style)

Centralized configuration management for the cluster:
- Manages presets, MIDI mappings, audio chain configs
- Version control using local git repository
- Push-based distribution to all nodes
- Pull-based polling from audio nodes (30-second interval)
- Diff/rollback capabilities
- Automatic sync on config changes

Runs on Management Node.
"""

import asyncio
import logging
import json
import hashlib
import subprocess
import io
import tarfile
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import aiohttp

from app.paths import Map2Paths
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


@dataclass
class ConfigVersion:
    """Represents a version of cluster configuration"""
    
    version_hash: str
    timestamp: datetime
    author: str
    message: str
    files_changed: int
    config_data: Dict


class ConfigSync(Singleton):
    """
    Manages configuration distribution across cluster.
    
    Uses local git repository for versioning and rollback.
    """
    
    def __init__(self, config_repo_path: Optional[str] = None):
        """
        Initialize config sync manager.

        Args:
            config_repo_path: Path to local git repository for configs
                (defaults to Map2Paths.config_repo_dir())
        """
        self.repo_path = Path(config_repo_path) if config_repo_path else Map2Paths.config_repo_dir()
        self.logger = logging.getLogger(__name__)
        self._init_repo()
    
    def _init_repo(self):
        """Initialize git repository if not exists"""
        try:
            if not self.repo_path.exists():
                self.repo_path.mkdir(parents=True, exist_ok=True)
                subprocess.run(
                    ["git", "init"],
                    cwd=self.repo_path,
                    check=True,
                    capture_output=True,
                )
                self.logger.info(f"Initialized config repository at {self.repo_path}")
            self._run_git(["config", "user.email", "map2@localhost"], check=False)
            self._run_git(["config", "user.name", "MAP2 ConfigSync"], check=False)
        except Exception as e:
            self.logger.error(f"Failed to initialize repo: {e}")
    
    async def push_config_to_nodes(
        self, 
        config_type: str,  # "preset", "midi_mapping", "audio_chain"
        config_data: Dict,
        message: str,
    ) -> bool:
        """
        Push configuration to all nodes.
        
        Args:
            config_type: Type of configuration
            config_data: Configuration data
            message: Commit message
            
        Returns:
            True if successful
        """
        try:
            self.logger.info(f"Pushing {config_type} to all nodes...")
            
            # Write config file
            config_file = self.repo_path / f"{config_type}.json"
            with open(config_file, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            # Commit to git
            subprocess.run(
                ["git", "add", config_file.name],
                cwd=self.repo_path,
                check=True,
                capture_output=True,
            )
            
            commit_result = self._run_git(["commit", "-m", message], check=False)
            if commit_result.returncode != 0 and "nothing to commit" not in commit_result.stderr.lower():
                raise RuntimeError(commit_result.stderr.strip())
            
            self.logger.info(f"Committed {config_type} to repository")
            return await self._distribute_repo_to_nodes()
            
        except Exception as e:
            self.logger.error(f"Failed to push config: {e}")
            return False
    
    async def pull_config_from_nodes(self) -> Dict[str, Dict]:
        """
        Poll nodes for configuration changes.
        
        Returns:
            Dictionary mapping node_id to their current config hash
        """
        try:
            from app.services.cluster.registry import get_cluster_registry

            registry = get_cluster_registry()
            nodes = registry.get_all_nodes()
            local_hash = self._get_local_tree_hash()
            results: Dict[str, Dict] = {}

            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=6)
            ) as session:
                tasks = [
                    self._poll_single_node(session, node, local_hash)
                    for node in nodes
                    if node.get("id")
                ]
                polled = await asyncio.gather(*tasks, return_exceptions=True)

            for item in polled:
                if isinstance(item, dict):
                    results[item["node_id"]] = item
            return results
            
        except Exception as e:
            self.logger.error(f"Failed to pull configs: {e}")
            return {}
    
    async def get_config_diff(
        self,
        version_a: str,
        version_b: str,
    ) -> Dict:
        """
        Get diff between two configuration versions.
        
        Args:
            version_a: First version hash
            version_b: Second version hash
            
        Returns:
            Dictionary showing differences
        """
        try:
            summary = self._run_git(
                ["diff", "--numstat", f"{version_a}..{version_b}"],
                check=False,
            )
            name_only = self._run_git(
                ["diff", "--name-only", f"{version_a}..{version_b}"],
                check=False,
            )

            if summary.returncode != 0 or name_only.returncode != 0:
                raise RuntimeError((summary.stderr or name_only.stderr).strip())

            files = [line.strip() for line in name_only.stdout.splitlines() if line.strip()]
            added = 0
            removed = 0
            per_file = []
            for line in summary.stdout.splitlines():
                parts = line.split("\t")
                if len(parts) < 3:
                    continue
                add_s, rem_s, name = parts[0], parts[1], parts[2]
                try:
                    a_val = int(add_s)
                except ValueError:
                    a_val = 0
                try:
                    r_val = int(rem_s)
                except ValueError:
                    r_val = 0
                added += a_val
                removed += r_val
                per_file.append(
                    {"file": name, "lines_added": a_val, "lines_removed": r_val}
                )

            return {
                "files_changed": files,
                "total_files": len(files),
                "lines_added": added,
                "lines_removed": removed,
                "details": per_file,
            }
            
        except Exception as e:
            self.logger.error(f"Failed to get diff: {e}")
            return {}
    
    async def rollback_config(self, version_hash: str) -> bool:
        """
        Rollback to previous configuration version.
        
        Args:
            version_hash: Git commit hash to restore
            
        Returns:
            True if successful
        """
        try:
            self.logger.info(f"Rolling back config to {version_hash}")
            pre_head = self._run_git(["rev-parse", "HEAD"], check=False)
            if pre_head.returncode != 0:
                return False

            checkout = self._run_git(["checkout", version_hash], check=False)
            if checkout.returncode != 0:
                self.logger.error(f"Checkout failed: {checkout.stderr.strip()}")
                return False

            distributed = await self._distribute_repo_to_nodes()
            if not distributed:
                self._run_git(["checkout", pre_head.stdout.strip()], check=False)
                return False

            return True
            
        except Exception as e:
            self.logger.error(f"Failed to rollback: {e}")
            return False
    
    def get_config_history(self, limit: int = 20) -> List[ConfigVersion]:
        """
        Get history of configuration changes.
        
        Args:
            limit: Maximum number of versions to return
            
        Returns:
            List of ConfigVersion objects
        """
        try:
            log_result = self._run_git(
                [
                    "log",
                    f"-{max(1, limit)}",
                    "--date=iso",
                    "--pretty=format:%H|%ad|%an|%s",
                ],
                check=False,
            )
            if log_result.returncode != 0:
                return []

            versions: List[ConfigVersion] = []
            for line in log_result.stdout.splitlines():
                if not line.strip():
                    continue
                parts = line.split("|", 3)
                if len(parts) < 4:
                    continue
                commit_hash, commit_date, author, message = parts

                files_changed = 0
                cfg_data: Dict = {}
                show_result = self._run_git(
                    ["show", "--name-only", "--pretty=format:", commit_hash],
                    check=False,
                )
                if show_result.returncode == 0:
                    changed_files = [
                        p.strip() for p in show_result.stdout.splitlines() if p.strip()
                    ]
                    files_changed = len(changed_files)
                    for rel in changed_files:
                        if not rel.endswith(".json"):
                            continue
                        path = self.repo_path / rel
                        if not path.exists():
                            continue
                        try:
                            with open(path, "r", encoding="utf-8") as f:
                                cfg_data[rel] = json.load(f)
                        except Exception:
                            continue

                try:
                    ts = datetime.fromisoformat(commit_date.replace(" ", "T", 1))
                except Exception:
                    ts = utc_now()

                versions.append(
                    ConfigVersion(
                        version_hash=commit_hash,
                        timestamp=ts,
                        author=author,
                        message=message,
                        files_changed=files_changed,
                        config_data=cfg_data,
                    )
                )

            return versions
            
        except Exception as e:
            self.logger.error(f"Failed to get history: {e}")
            return []

    def _run_git(self, args: List[str], check: bool = True) -> subprocess.CompletedProcess:
        """Run git command in config repository."""
        return subprocess.run(
            ["git", *args],
            cwd=self.repo_path,
            check=check,
            capture_output=True,
            text=True,
        )

    def _get_local_tree_hash(self) -> str:
        """Compute hash of all tracked JSON config files."""
        digest = hashlib.sha256()
        for file_path in sorted(self.repo_path.glob("**/*.json")):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(self.repo_path).as_posix()
            digest.update(rel.encode("utf-8"))
            with open(file_path, "rb") as f:
                digest.update(f.read())
        return digest.hexdigest()

    async def _poll_single_node(
        self, session: aiohttp.ClientSession, node: Dict, local_hash: str
    ) -> Dict:
        """Fetch node config status and compare against local hash."""
        node_id = node.get("id", "unknown")
        host = node.get("ip_address") or node.get("hostname")
        if not host:
            return {
                "node_id": node_id,
                "reachable": False,
                "in_sync": False,
                "error": "missing_host",
            }

        url = f"http://{host}:8080/api/cluster/config/status"
        try:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return {
                        "node_id": node_id,
                        "reachable": False,
                        "in_sync": False,
                        "error": f"status_{resp.status}",
                    }
                payload = await resp.json()
        except Exception as e:
            return {
                "node_id": node_id,
                "reachable": False,
                "in_sync": False,
                "error": str(e),
            }

        remote_commit = payload.get("current_commit")
        local_commit = self._run_git(["rev-parse", "HEAD"], check=False).stdout.strip()
        in_sync = bool(remote_commit and local_commit and remote_commit == local_commit)

        return {
            "node_id": node_id,
            "reachable": True,
            "remote_commit": remote_commit,
            "local_commit": local_commit,
            "local_hash": local_hash,
            "in_sync": in_sync,
        }

    def _build_repo_tarball(self) -> bytes:
        """Create gzipped tarball from repository contents."""
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode="w:gz") as tar:
            for file_path in self.repo_path.glob("**/*"):
                if not file_path.is_file() or ".git" in file_path.parts:
                    continue
                tar.add(file_path, arcname=file_path.relative_to(self.repo_path))
        return tar_buffer.getvalue()

    async def _distribute_repo_to_nodes(self) -> bool:
        """Distribute current repository snapshot to all nodes."""
        try:
            from app.services.cluster.registry import get_cluster_registry
            from app.services.cluster.integration_helpers import NodeSSHClient

            registry = get_cluster_registry()
            nodes = registry.get_all_nodes()
            if not nodes:
                return True

            payload = self._build_repo_tarball()
            success_count = 0
            for node in nodes:
                node_id = node.get("id")
                host = node.get("ip_address") or node.get("hostname")
                if not node_id or not host:
                    continue

                # Try config API first.
                pushed = False
                try:
                    async with aiohttp.ClientSession(
                        timeout=aiohttp.ClientTimeout(total=20)
                    ) as session:
                        resp = await session.post(
                            f"http://{host}:8080/api/cluster/config/push",
                            data=payload,
                            headers={"Content-Type": "application/octet-stream"},
                        )
                        pushed = resp.status == 200
                except Exception:
                    pushed = False

                if not pushed:
                    # SSH fallback: place changed JSON files and reload.
                    client = NodeSSHClient(node_id=node_id, ip_address=host)
                    pushed = True
                    for file_path in self.repo_path.glob("**/*.json"):
                        rel = file_path.relative_to(self.repo_path).as_posix()
                        remote_path = str(Map2Paths.host_file(rel.split('/')[-1]))
                        if not client.put_file(str(file_path), remote_path):
                            pushed = False
                            break
                    if pushed:
                        try:
                            client.execute_command("systemctl reload map2-audio", timeout=20)
                        except Exception:
                            pass

                if pushed:
                    success_count += 1

            required = len(nodes) // 2 + 1
            return success_count >= required
        except Exception as e:
            self.logger.error(f"Distribution failed: {e}")
            return False


def get_config_sync() -> ConfigSync:
    """Get or create the config sync instance"""
    return ConfigSync.get_instance()
