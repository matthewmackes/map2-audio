"""
Configuration Pusher - Complete Implementation

Implements GitOps-style configuration distribution to all nodes.
"""

import asyncio
import subprocess
import os
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class ConfigurationDistributor:
    """Distributes configuration to all cluster nodes."""
    
    def __init__(self, git_repo_path: str, registry):
        self.git_repo = Path(git_repo_path)
        self.registry = registry
    
    def get_changed_files(self) -> List[str]:
        """Get files that changed since last distribution."""
        try:
            result = subprocess.run(
                ['git', '-C', str(self.git_repo), 'diff', '--name-only', 'HEAD~1..HEAD'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                files = result.stdout.strip().split('\n')
                logger.info(f"Found {len(files)} changed files")
                return [f for f in files if f]
            return []
        except Exception as e:
            logger.error(f"Failed to get changed files: {e}")
            return []
    
    def get_git_log(self, limit: int = 5) -> List[Dict]:
        """Get recent git commits."""
        try:
            result = subprocess.run(
                ['git', '-C', str(self.git_repo), 'log', f'-{limit}', '--format=%H|%an|%s|%ai'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            commits = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    parts = line.split('|')
                    commits.append({
                        'hash': parts[0],
                        'author': parts[1],
                        'message': parts[2],
                        'date': parts[3]
                    })
            return commits
        except Exception as e:
            logger.error(f"Failed to get git log: {e}")
            return []
    
    def checkout_version(self, version: str) -> bool:
        """Checkout specific git version."""
        try:
            result = subprocess.run(
                ['git', '-C', str(self.git_repo), 'checkout', version],
                capture_output=True,
                timeout=30
            )
            if result.returncode == 0:
                logger.info(f"Checked out version {version}")
                return True
            else:
                logger.error(f"Checkout failed: {result.stderr.decode()}")
                return False
        except Exception as e:
            logger.error(f"Checkout error: {e}")
            return False
    
    async def distribute_to_nodes(self, config_files: List[str]) -> bool:
        """Distribute config files to all nodes."""
        try:
            if not self.registry:
                logger.error("Registry not available")
                return False
            
            # Get all nodes
            all_nodes = self.registry.get_all_nodes()
            if not all_nodes:
                logger.warning("No nodes found in registry")
                return True  # Not an error
            
            # Distribute to each node in parallel
            tasks = []
            for node in all_nodes:
                node_id = node.get('node_id')
                ip_addr = node.get('ip_address')
                if node_id and ip_addr:
                    tasks.append(self._distribute_to_node(node_id, ip_addr, config_files))
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check if all succeeded
            failures = [r for r in results if r is not True and isinstance(r, Exception)]
            if failures:
                logger.error(f"Distribution failed on {len(failures)} nodes")
                return False
            
            logger.info(f"Configuration distributed to {len(all_nodes)} nodes")
            return True
            
        except Exception as e:
            logger.error(f"Distribution error: {e}")
            return False
    
    async def _distribute_to_node(self, node_id: str, ip_addr: str, config_files: List[str]) -> bool:
        """Distribute config to a single node."""
        try:
            from app.services.cluster.integration_helpers import HybridNodeClient
            
            client = HybridNodeClient(node_id, ip_addr)
            
            for config_file in config_files:
                local_path = self.git_repo / config_file
                if not local_path.exists():
                    logger.warning(f"Config file not found: {config_file}")
                    continue
                
                # Determine remote path
                remote_path = f"/etc/map2/{config_file.split('/')[-1]}"
                
                # Copy file to node
                if not client.ssh.put_file(str(local_path), remote_path):
                    logger.error(f"Failed to distribute {config_file} to {node_id}")
                    return False
                
                # Verify checksum
                try:
                    local_hash = subprocess.run(
                        ['sha256sum', str(local_path)],
                        capture_output=True,
                        text=True
                    ).stdout.split()[0]
                    
                    rc, remote_hash, _ = client.execute_command(
                        f"sha256sum {remote_path}",
                        timeout=10
                    )
                    
                    if rc == 0 and local_hash in remote_hash:
                        logger.debug(f"Checksum verified for {config_file} on {node_id}")
                    else:
                        logger.warning(f"Checksum mismatch for {config_file} on {node_id}")
                except Exception:
                    pass  # Non-critical
            
            # Signal node to reload configuration
            try:
                client.execute_command(
                    "systemctl reload map2-audio",
                    timeout=10
                )
                logger.info(f"Reloaded configuration on {node_id}")
            except Exception:
                logger.warning(f"Could not reload configuration on {node_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Distribution to {node_id} failed: {e}")
            return False


class NodeLifecycleManager:
    """Manages node lifecycle: diagnostics, recovery, promotion/demotion."""
    
    def __init__(self, registry):
        self.registry = registry
    
    async def run_diagnostics(self, node_id: str) -> Dict:
        """Run diagnostic checks on a node."""
        try:
            from app.services.cluster.integration_helpers import HybridNodeClient
            
            node_data = self.registry.get_node(node_id)
            if not node_data:
                return {"error": f"Node {node_id} not found"}
            
            ip_addr = node_data.get('ip_address')
            client = HybridNodeClient(node_id, ip_addr)
            
            diagnostics = {
                'timestamp': datetime.now().isoformat(),
                'node_id': node_id,
                'checks': {}
            }
            
            # Check 1: System resources
            try:
                rc, output, _ = client.execute_command("free -h", timeout=10)
                diagnostics['checks']['memory'] = output if rc == 0 else "N/A"
            except Exception:
                diagnostics['checks']['memory'] = "Error"
            
            # Check 2: Disk usage
            try:
                rc, output, _ = client.execute_command("df -h /", timeout=10)
                diagnostics['checks']['disk'] = output if rc == 0 else "N/A"
            except Exception:
                diagnostics['checks']['disk'] = "Error"
            
            # Check 3: Audio services
            try:
                rc, _, _ = client.execute_command("systemctl is-active map2-audio", timeout=10)
                diagnostics['checks']['audio_service'] = "running" if rc == 0 else "stopped"
            except Exception:
                diagnostics['checks']['audio_service'] = "unknown"
            
            # Check 4: Recent logs
            try:
                rc, logs, _ = client.execute_command(
                    "journalctl -u map2-audio -n 20 --no-pager",
                    timeout=10
                )
                diagnostics['checks']['recent_logs'] = logs if rc == 0 else "N/A"
            except Exception:
                diagnostics['checks']['recent_logs'] = "Error"
            
            logger.info(f"Diagnostics complete for {node_id}")
            return diagnostics
            
        except Exception as e:
            logger.error(f"Diagnostics failed: {e}")
            return {"error": str(e)}
    
    async def recover_node(self, node_id: str) -> bool:
        """Attempt to recover a failing node."""
        try:
            from app.services.cluster.integration_helpers import HybridNodeClient
            
            logger.warning(f"Attempting recovery of {node_id}...")
            
            node_data = self.registry.get_node(node_id)
            if not node_data:
                return False
            
            ip_addr = node_data.get('ip_address')
            client = HybridNodeClient(node_id, ip_addr)
            
            # Step 1: Stop services
            try:
                client.execute_command("systemctl stop map2-audio", timeout=30)
                logger.info(f"Stopped services on {node_id}")
            except Exception:
                pass
            
            # Step 2: Clear cache/temp
            try:
                client.execute_command("rm -rf /tmp/map2-*", timeout=10)
                logger.info(f"Cleared cache on {node_id}")
            except Exception:
                pass
            
            # Step 3: Restart services
            try:
                client.execute_command("systemctl start map2-audio", timeout=30)
                logger.info(f"Restarted services on {node_id}")
            except Exception:
                logger.error(f"Failed to restart services on {node_id}")
                return False
            
            # Step 4: Verify recovery
            await asyncio.sleep(5)
            try:
                rc, _, _ = client.execute_command("systemctl is-active map2-audio", timeout=10)
                if rc == 0:
                    self.registry.update_node_status(node_id, "active")
                    logger.info(f"Recovery successful for {node_id}")
                    return True
            except Exception:
                pass
            
            return False
            
        except Exception as e:
            logger.error(f"Recovery failed: {e}")
            return False
    
    async def graceful_shutdown(self, node_id: str) -> bool:
        """Gracefully shutdown a node."""
        try:
            from app.services.cluster.integration_helpers import HybridNodeClient
            
            logger.warning(f"Gracefully shutting down {node_id}...")
            
            node_data = self.registry.get_node(node_id)
            if not node_data:
                return False
            
            ip_addr = node_data.get('ip_address')
            client = HybridNodeClient(node_id, ip_addr)
            
            # Mark node as shutting down
            self.registry.update_node_status(node_id, "shutting_down")
            
            # Drain audio streams (10 second grace period)
            await asyncio.sleep(10)
            
            # Stop services
            client.execute_command("systemctl stop map2-audio", timeout=30)
            
            # Shutdown
            client.execute_command("systemctl poweroff", timeout=10)
            
            # Update registry
            self.registry.update_node_status(node_id, "offline")
            
            logger.info(f"Shutdown initiated for {node_id}")
            return True
            
        except Exception as e:
            logger.error(f"Shutdown failed: {e}")
            return False
    
    async def promote_node(self, node_id: str) -> bool:
        """Promote worker node to manager."""
        try:
            logger.info(f"Promoting {node_id} to manager...")
            
            self.registry.update_node_status(node_id, "promoting")
            
            # Update registry
            self.registry.update_node_role(node_id, "manager")
            
            # Deploy management services
            from app.services.cluster.integration_helpers import HybridNodeClient
            node_data = self.registry.get_node(node_id)
            ip_addr = node_data.get('ip_address')
            client = HybridNodeClient(node_id, ip_addr)
            
            # Install management services
            client.execute_command("dnf install -y map2-manager-services", timeout=300)
            client.execute_command("systemctl restart map2-manager", timeout=30)
            
            self.registry.update_node_status(node_id, "active")
            logger.info(f"Promotion complete for {node_id}")
            return True
            
        except Exception as e:
            logger.error(f"Promotion failed: {e}")
            return False
    
    async def demote_node(self, node_id: str) -> bool:
        """Demote manager to worker node."""
        try:
            logger.info(f"Demoting {node_id} to worker...")
            
            self.registry.update_node_status(node_id, "demoting")
            
            # Migrate management load
            # (In production, this would involve state migration)
            
            # Update registry
            self.registry.update_node_role(node_id, "worker")
            
            # Remove management services
            from app.services.cluster.integration_helpers import HybridNodeClient
            node_data = self.registry.get_node(node_id)
            ip_addr = node_data.get('ip_address')
            client = HybridNodeClient(node_id, ip_addr)
            
            client.execute_command("systemctl stop map2-manager", timeout=30)
            client.execute_command("dnf remove -y map2-manager-services", timeout=300)
            
            self.registry.update_node_status(node_id, "active")
            logger.info(f"Demotion complete for {node_id}")
            return True
            
        except Exception as e:
            logger.error(f"Demotion failed: {e}")
            return False
