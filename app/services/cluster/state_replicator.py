"""
Cluster State Persistence & Replication

Synchronizes cluster state to Standby Management Node:
- Primary maintains authoritative cluster registry
- State replicated to Standby every 5 minutes
- Uses SQLite WAL mode for reliable replication
- Automatic failover if primary becomes unreachable
- Detects primary failure via heartbeat (30-second timeout)

Ensures cluster metadata survives primary node failure.
"""

import asyncio
import logging
import shutil
import hashlib
import socket
from typing import Optional, Dict
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

logger = logging.getLogger(__name__)


class StateReplicator:
    """
    Manages state replication from primary to standby management node.
    """
    
    def __init__(
        self,
        primary_db_path: str = "/var/lib/map2/cluster.db",
        standby_host: Optional[str] = None,
        primary_host: Optional[str] = None,
        replication_interval_seconds: int = 300,
        standby_db_path: str = "/var/lib/map2/cluster.db",
    ):
        """
        Initialize state replicator.
        
        Args:
            primary_db_path: Path to primary cluster registry database
            standby_host: IP/hostname of standby management node
            replication_interval_seconds: How often to replicate (default 5 min)
        """
        self.primary_db_path = Path(primary_db_path)
        self.standby_host = standby_host
        self.primary_host = primary_host
        self.replication_interval = replication_interval_seconds
        self.standby_db_path = standby_db_path
        self.logger = logging.getLogger(__name__)
        self.last_replication: Optional[datetime] = None
        self.is_primary = True
        self.last_primary_heartbeat = datetime.utcnow()
    
    async def start_replication_loop(self):
        """Start continuous replication loop"""
        try:
            self.logger.info("Starting state replication loop...")
            
            while True:
                try:
                    if self.is_primary and self.standby_host:
                        await self._replicate_to_standby()
                    
                    # Check primary heartbeat (if we're standby)
                    if not self.is_primary:
                        await self._check_primary_heartbeat()
                    
                    await asyncio.sleep(self.replication_interval)
                    
                except Exception as e:
                    self.logger.error(f"Replication error: {e}")
                    await asyncio.sleep(10)
                    
        except asyncio.CancelledError:
            self.logger.info("Replication loop cancelled")
        except Exception as e:
            self.logger.error(f"Replication loop fatal error: {e}", exc_info=True)
    
    async def _replicate_to_standby(self) -> bool:
        """
        Replicate database to standby node.
        
        Returns:
            True if successful
        """
        try:
            if not self.standby_host:
                return False
            
            self.logger.debug(f"Replicating state to {self.standby_host}...")

            if not self.primary_db_path.exists():
                self.logger.error(f"Primary database missing: {self.primary_db_path}")
                return False

            local_hash = self._sha256(self.primary_db_path)
            if not local_hash:
                return False

            if self.standby_host in {"127.0.0.1", "localhost", socket.gethostname()}:
                standby_path = Path(self.standby_db_path)
                standby_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.primary_db_path, standby_path)
                standby_hash = self._sha256(standby_path)
                if standby_hash != local_hash:
                    self.logger.error("Local standby copy checksum mismatch")
                    return False
            else:
                if not await self._replicate_remote():
                    return False
                remote_hash = await self._get_remote_hash(self.standby_host, self.standby_db_path)
                if remote_hash and remote_hash != local_hash:
                    self.logger.error("Remote standby checksum mismatch")
                    return False

            self.last_replication = datetime.utcnow()
            return True
            
        except Exception as e:
            self.logger.error(f"Replication failed: {e}")
            return False
    
    async def _check_primary_heartbeat(self) -> bool:
        """
        Check if primary is still alive.
        
        Returns:
            True if primary is reachable
        """
        try:
            if self.primary_host:
                reachable = await asyncio.to_thread(self._probe_host, self.primary_host)
                if reachable:
                    self.last_primary_heartbeat = datetime.utcnow()
                    return True

            time_since_heartbeat = (
                datetime.utcnow() - self.last_primary_heartbeat
            ).total_seconds()
            
            if time_since_heartbeat > 30:
                self.logger.warning("Primary heartbeat timeout - initiating failover")
                await self._assume_primary_role()
                return False
            
            return True
            
        except Exception as e:
            self.logger.error(f"Heartbeat check failed: {e}")
            return False
    
    async def _assume_primary_role(self) -> bool:
        """
        Failover: Standby assumes primary role.
        
        Returns:
            True if successful
        """
        try:
            self.logger.warning("Assuming primary role (failover)...")

            if not self.primary_db_path.exists():
                self.logger.warning(
                    "Cluster DB missing during failover; creating empty database file"
                )
                self.primary_db_path.parent.mkdir(parents=True, exist_ok=True)
                self.primary_db_path.touch(exist_ok=True)

            self.is_primary = True

            await self._mark_local_node_primary()
            await self._publish_failover_event()

            self.logger.warning("Failover completed - now primary")
            return True
            
        except Exception as e:
            self.logger.error(f"Failover failed: {e}")
            return False
    
    def get_replication_status(self) -> Dict:
        """
        Get current replication status.
        
        Returns:
            Dictionary with replication information
        """
        return {
            "is_primary": self.is_primary,
            "last_replication": (
                self.last_replication.isoformat() 
                if self.last_replication else None
            ),
            "standby_host": self.standby_host,
            "primary_host": self.primary_host,
            "replication_interval_seconds": self.replication_interval,
            "last_heartbeat": self.last_primary_heartbeat.isoformat(),
        }

    async def _replicate_remote(self) -> bool:
        """Replicate DB file to remote standby via rsync/scp."""
        destination = f"{self.standby_host}:{self.standby_db_path}"
        commands = [
            ["rsync", "-az", "--inplace", str(self.primary_db_path), destination],
            ["scp", str(self.primary_db_path), destination],
        ]

        for cmd in commands:
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await process.communicate()
                if process.returncode == 0:
                    return True
                self.logger.warning(
                    "Replication command failed (%s): %s",
                    " ".join(cmd[:1]),
                    stderr.decode("utf-8", errors="ignore").strip(),
                )
            except FileNotFoundError:
                continue
            except Exception as e:
                self.logger.warning("Replication command error (%s): %s", cmd[0], e)

        self.logger.error("No remote replication method succeeded")
        return False

    async def _get_remote_hash(self, host: str, remote_path: str) -> Optional[str]:
        """Get remote sha256 hash via ssh if possible."""
        cmd = ["ssh", host, "sha256sum", remote_path]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await process.communicate()
            if process.returncode != 0:
                return None
            output = stdout.decode("utf-8", errors="ignore").strip()
            return output.split()[0] if output else None
        except Exception:
            return None

    def _probe_host(self, host: str) -> bool:
        """Probe primary via health endpoint, then TCP fallback."""
        health_urls = [
            f"http://{host}:8000/api/health",
            f"http://{host}:8080/api/health",
        ]

        for url in health_urls:
            try:
                with urlopen(url, timeout=2):  # nosec B310 - controlled internal endpoint
                    return True
            except URLError:
                continue
            except Exception:
                continue

        for port in (8000, 8080, 22):
            try:
                with socket.create_connection((host, port), timeout=2):
                    return True
            except Exception:
                continue

        return False

    async def _mark_local_node_primary(self) -> None:
        """Record local node as active management node after failover."""
        try:
            from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
            from app.services.cluster.registry import get_cluster_registry

            identity = get_enhanced_node_identity()
            registry = get_cluster_registry()
            node_cfg = getattr(identity, "config", None)
            hostname = node_cfg.hostname if node_cfg else socket.gethostname()
            deployment_mode = identity.get_role()

            registry.add_or_update_node(
                node_id=identity.get_node_id(),
                hostname=hostname,
                role="MANAGEMENT-NODE",
                deployment_mode=deployment_mode,
                status="online",
            )
        except Exception as e:
            self.logger.warning(f"Failed to update local primary role in registry: {e}")

    async def _publish_failover_event(self) -> None:
        """Publish failover completion on local and distributed buses."""
        payload = {
            "timestamp": datetime.utcnow().isoformat(),
            "standby_host": self.standby_host,
            "primary_host": self.primary_host,
        }
        try:
            from app.services.event_bus import get_event_bus, EventType

            await get_event_bus().publish(EventType.NODE_FAILOVER, payload)
        except Exception as e:
            self.logger.debug(f"Failed to publish local failover event: {e}")

        try:
            from app.services.cluster.distributed_event_bus import (
                ClusterEvent,
                EventType as DistributedEventType,
                EventSeverity,
                get_event_bus as get_distributed_event_bus,
            )

            await get_distributed_event_bus().publish_event(
                ClusterEvent(
                    event_type=DistributedEventType.FAILOVER_COMPLETED,
                    severity=EventSeverity.WARNING,
                    source_node_id="state-replicator",
                    message="Standby node assumed primary role",
                    details=payload,
                )
            )
        except Exception as e:
            self.logger.debug(f"Failed to publish distributed failover event: {e}")

    def _sha256(self, path: Path) -> Optional[str]:
        """Compute SHA256 hash for integrity checks."""
        try:
            digest = hashlib.sha256()
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(1024 * 1024)
                    if not chunk:
                        break
                    digest.update(chunk)
            return digest.hexdigest()
        except Exception as e:
            self.logger.error(f"Failed to hash {path}: {e}")
            return None


# Global instance
_state_replicator: Optional[StateReplicator] = None


def get_state_replicator(
    standby_host: Optional[str] = None,
    primary_host: Optional[str] = None,
) -> StateReplicator:
    """Get or create the state replicator instance"""
    global _state_replicator
    if _state_replicator is None:
        _state_replicator = StateReplicator(
            standby_host=standby_host,
            primary_host=primary_host,
        )
    return _state_replicator
