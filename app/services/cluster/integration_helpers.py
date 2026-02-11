"""
Integration helpers for cluster components

These helpers facilitate communication between cluster services.
"""

import subprocess
import asyncio
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import logging
import aiohttp

logger = logging.getLogger(__name__)


class NodeSSHClient:
    """SSH client for node management."""
    
    def __init__(self, node_id: str, ip_address: str, username: str = "root"):
        self.node_id = node_id
        self.ip_address = ip_address
        self.username = username
    
    def execute_command(
        self, 
        command: str, 
        timeout: int = 30,
        check_returncode: bool = False
    ) -> Tuple[int, str, str]:
        """Execute command via SSH and return (returncode, stdout, stderr)."""
        try:
            cmd = [
                'ssh',
                '-o', 'ConnectTimeout=5',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                f'{self.username}@{self.ip_address}',
                command
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            if check_returncode and result.returncode != 0:
                logger.error(f"SSH command failed on {self.node_id}: {result.stderr}")
                raise RuntimeError(f"Command failed: {result.stderr}")
            
            return result.returncode, result.stdout, result.stderr
            
        except subprocess.TimeoutExpired:
            logger.error(f"SSH timeout on {self.node_id}")
            raise
        except Exception as e:
            logger.error(f"SSH error on {self.node_id}: {e}")
            raise
    
    def put_file(self, local_path: str, remote_path: str) -> bool:
        """Copy file to node via SCP."""
        try:
            subprocess.run(
                [
                    'scp',
                    '-o', 'ConnectTimeout=5',
                    '-o', 'StrictHostKeyChecking=no',
                    local_path,
                    f'{self.username}@{self.ip_address}:{remote_path}'
                ],
                check=True,
                timeout=30,
                capture_output=True
            )
            logger.info(f"Copied {local_path} to {self.node_id}:{remote_path}")
            return True
        except Exception as e:
            logger.error(f"SCP failed: {e}")
            return False
    
    def get_file(self, remote_path: str, local_path: str) -> bool:
        """Copy file from node via SCP."""
        try:
            subprocess.run(
                [
                    'scp',
                    '-o', 'ConnectTimeout=5',
                    '-o', 'StrictHostKeyChecking=no',
                    f'{self.username}@{self.ip_address}:{remote_path}',
                    local_path
                ],
                check=True,
                timeout=30,
                capture_output=True
            )
            logger.info(f"Retrieved {remote_path} from {self.node_id}")
            return True
        except Exception as e:
            logger.error(f"SCP failed: {e}")
            return False


class NodeAPIClient:
    """REST API client for node communication."""
    
    def __init__(self, node_id: str, node_url: str):
        self.node_id = node_id
        self.node_url = node_url
    
    async def get(self, endpoint: str, timeout: int = 5) -> Optional[Dict]:
        """GET request to node API."""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.node_url}/api{endpoint}"
                async with session.get(url, timeout=timeout) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.warning(f"API error from {self.node_id}: {response.status}")
                        return None
        except asyncio.TimeoutError:
            logger.warning(f"API timeout from {self.node_id}")
            return None
        except Exception as e:
            logger.warning(f"API error from {self.node_id}: {e}")
            return None
    
    async def post(self, endpoint: str, data: Dict, timeout: int = 5) -> Optional[Dict]:
        """POST request to node API."""
        try:
            async with aiohttp.ClientSession() as session:
                url = f"{self.node_url}/api{endpoint}"
                async with session.post(url, json=data, timeout=timeout) as response:
                    if response.status in [200, 201]:
                        return await response.json()
                    else:
                        logger.warning(f"API error from {self.node_id}: {response.status}")
                        return None
        except asyncio.TimeoutError:
            logger.warning(f"API timeout from {self.node_id}")
            return None
        except Exception as e:
            logger.warning(f"API error from {self.node_id}: {e}")
            return None


class HybridNodeClient:
    """Hybrid SSH+API client for node management."""
    
    def __init__(self, node_id: str, ip_address: str, api_url: str = None):
        self.node_id = node_id
        self.ssh = NodeSSHClient(node_id, ip_address)
        self.api = NodeAPIClient(node_id, api_url) if api_url else None
    
    def execute_command(self, command: str, **kwargs) -> Tuple[int, str, str]:
        """Execute command, preferring API if available."""
        # Try API first (if available)
        if self.api:
            try:
                loop = asyncio.get_event_loop()
                result = loop.run_until_complete(
                    self.api.post("/command", {"command": command})
                )
                if result:
                    return 0, result.get("stdout", ""), ""
            except Exception:
                pass
        
        # Fall back to SSH
        return self.ssh.execute_command(command, **kwargs)
    
    def execute_update(self, packages: List[str]) -> bool:
        """Execute DNF update on node."""
        # Build DNF command
        pkg_list = ' '.join(packages)
        cmd = f"dnf update -y {pkg_list} && systemctl reboot"
        
        try:
            returncode, stdout, stderr = self.execute_command(cmd, timeout=600)
            if returncode == 0:
                logger.info(f"Update executed on {self.node_id}")
                return True
            else:
                logger.error(f"Update failed on {self.node_id}: {stderr}")
                return False
        except Exception as e:
            logger.error(f"Update execution failed: {e}")
            return False
    
    def validate_config(self, config_data: Dict) -> bool:
        """Validate configuration on node."""
        try:
            # Try API first
            if self.api:
                loop = asyncio.get_event_loop()
                result = loop.run_until_complete(
                    self.api.post("/validate/config", config_data)
                )
                if result and result.get("valid"):
                    return True
            
            # Fall back to SSH + local command
            returncode, _, _ = self.execute_command(
                "/usr/local/bin/map2-validate-config",
                timeout=10
            )
            return returncode == 0
        except Exception:
            return False


def get_node_client(node_id: str, registry) -> Optional[HybridNodeClient]:
    """Get a node client based on registry data."""
    try:
        node_data = registry.get_node(node_id)
        if not node_data:
            return None
        
        ip = node_data.get("ip_address")
        api_url = f"http://{ip}:8080"
        
        return HybridNodeClient(node_id, ip, api_url)
    except Exception as e:
        logger.error(f"Failed to create node client: {e}")
        return None
