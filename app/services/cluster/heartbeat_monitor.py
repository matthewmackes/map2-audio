"""
Heartbeat Monitoring Service for Cluster Nodes

Monitors all nodes with 1-second intervals, detects failures within 3 seconds,
and triggers failover events.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, Optional, Set
from dataclasses import dataclass, field

import httpx
from urllib.parse import urlparse

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
from app.services.platform_event.bus import get_platform_event_bus
from app.services.platform_event.factories import make_node_offline, make_node_online
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


@dataclass
class NodeHealthStatus:
    """Health status for a single node."""
    node_id: str
    is_online: bool
    last_seen: datetime
    consecutive_failures: int = 0
    response_time_ms: Optional[float] = None
    metadata: Dict = field(default_factory=dict)


class HeartbeatMonitor(Singleton):
    """
    Monitors cluster node health via periodic heartbeat checks.
    
    Features:
    - 1-second polling interval
    - 3-second failure detection (3 consecutive failures)
    - Automatic offline/online event publishing
    - Minimal CPU overhead (<1%)
    """
    
    def __init__(self):
        self.registry = get_cluster_registry()
        self.event_bus = get_platform_event_bus()
        self.node_health: Dict[str, NodeHealthStatus] = {}
        self.is_running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._client: Optional[httpx.AsyncClient] = None
        self._local_node_id = get_enhanced_node_identity().get_node_id()
        
        # Configuration
        self.poll_interval_seconds = 1.0
        self.failure_threshold = 3  # consecutive failures before marking offline
        self.timeout_seconds = 2.0
        
    async def start(self):
        """Start heartbeat monitoring."""
        if self.is_running:
            logger.warning("Heartbeat monitor already running")
            return
        
        logger.info("Starting heartbeat monitor")
        self.is_running = True
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout_seconds)
        self._monitor_task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop heartbeat monitoring."""
        if not self.is_running:
            return
        
        logger.info("Stopping heartbeat monitor")
        self.is_running = False
        
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        if self._client is not None:
            await self._client.aclose()
            self._client = None
    
    async def _monitor_loop(self):
        """Main monitoring loop."""
        while self.is_running:
            try:
                start_time = time.time()
                await self._run_monitor_iteration()
                
                # Sleep for remaining time to maintain 1-second interval
                elapsed = time.time() - start_time
                sleep_time = max(0, self.poll_interval_seconds - elapsed)
                
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                else:
                    logger.warning(f"Heartbeat check took {elapsed:.2f}s, exceeding {self.poll_interval_seconds}s interval")
                
            except Exception as e:
                logger.error(f"Error in heartbeat monitor loop: {e}", exc_info=True)
                await asyncio.sleep(1)

    async def _run_monitor_iteration(self) -> None:
        nodes = self.registry.get_all_nodes()

        tasks = []
        for node in nodes:
            node_id, node_url = self._resolve_registry_node_endpoint(node)
            if not node_id or not node_url:
                continue
            if node_id == self._local_node_id:
                continue
            tasks.append(self._check_node(node_id, node_url))

        current_node_ids = {
            self._resolve_registry_node_endpoint(node)[0]
            for node in nodes
        }
        self._prune_removed_nodes(current_node_ids)

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _monitor_loop_iteration_for_test(self) -> None:
        await self._run_monitor_iteration()

    @staticmethod
    def _resolve_registry_node_endpoint(node) -> tuple[Optional[str], Optional[str]]:
        """Resolve registry rows into a node id and API URL."""
        if isinstance(node, dict):
            node_id = str(node.get("id") or node.get("node_id") or node.get("hostname") or "").strip() or None
            hostname = str(node.get("hostname") or "").strip() or None
            ip_address = str(node.get("ip_address") or "").strip() or None
            metadata = node.get("metadata")
        else:
            node_id = str(getattr(node, "node_id", None) or getattr(node, "id", None) or getattr(node, "hostname", "")).strip() or None
            hostname = str(getattr(node, "hostname", "")).strip() or None
            ip_address = str(getattr(node, "ip_address", "")).strip() or None
            metadata = getattr(node, "metadata", None)

        metadata_dict: Dict = {}
        if isinstance(metadata, dict):
            metadata_dict = metadata
        elif isinstance(metadata, str) and metadata.strip():
            try:
                parsed = json.loads(metadata)
                if isinstance(parsed, dict):
                    metadata_dict = parsed
            except Exception:
                metadata_dict = {}

        explicit_url = str(metadata_dict.get("node_url") or metadata_dict.get("url") or "").strip()
        if explicit_url:
            parsed = urlparse(explicit_url)
            if parsed.hostname:
                port = parsed.port or (443 if parsed.scheme == "https" else 8080)
                return node_id, f"{parsed.scheme or 'http'}://{parsed.hostname}:{port}"

        host = ip_address or str(metadata_dict.get("ip_address") or "").strip() or hostname
        if not node_id or not host:
            return node_id, None

        port = int(metadata_dict.get("api_port") or 8080)
        return node_id, f"http://{host}:{port}"
    
    async def _check_node(self, node_id: str, node_url: str):
        """Check health of a single node."""
        start_time = time.time()
        
        try:
            # Send heartbeat request
            if self._client is None:
                self._client = httpx.AsyncClient(timeout=self.timeout_seconds)
            response = await self._client.get(f"{node_url}/api/health")
            response.raise_for_status()
            health_data = response.json()
            
            response_time_ms = (time.time() - start_time) * 1000
            
            # Node is healthy
            await self._mark_node_online(node_id, response_time_ms, health_data)
            
        except (httpx.TimeoutException, httpx.ConnectError, httpx.HTTPError) as e:
            # Node is unhealthy
            await self._mark_node_failure(node_id, str(e))
        
        except Exception as e:
            logger.error(f"Unexpected error checking node {node_id}: {e}", exc_info=True)
            await self._mark_node_failure(node_id, str(e))
    
    async def _mark_node_online(self, node_id: str, response_time_ms: float, metadata: Dict):
        """Mark node as online and reset failure count."""
        now = utc_now()
        
        # Get or create health status
        if node_id not in self.node_health:
            self.node_health[node_id] = NodeHealthStatus(
                node_id=node_id,
                is_online=True,
                last_seen=now,
                response_time_ms=response_time_ms,
                metadata=metadata
            )
            await self.event_bus.emit(
                make_node_online(
                    node_id=node_id,
                    source_service="heartbeat_monitor",
                    response_time_ms=response_time_ms,
                    metadata=metadata,
                    first_seen=True,
                    occurred_at=now,
                )
            )
            self.registry.update_node_status(node_id, 'online')
        else:
            status = self.node_health[node_id]
            was_offline = not status.is_online
            
            # Update status
            status.is_online = True
            status.last_seen = now
            status.consecutive_failures = 0
            status.response_time_ms = response_time_ms
            status.metadata = metadata
            
            # If node just came back online, publish event
            if was_offline:
                logger.info(f"Node {node_id} is back ONLINE (response time: {response_time_ms:.1f}ms)")
                await self.event_bus.emit(
                    make_node_online(
                        node_id=node_id,
                        source_service="heartbeat_monitor",
                        response_time_ms=response_time_ms,
                        metadata=metadata,
                        occurred_at=now,
                    )
                )
                
                # Update registry
                self.registry.update_node_status(node_id, 'online')
    
    async def _mark_node_failure(self, node_id: str, error: str):
        """Mark node failure and trigger offline event if threshold reached."""
        now = utc_now()
        
        # Get or create health status
        if node_id not in self.node_health:
            self.node_health[node_id] = NodeHealthStatus(
                node_id=node_id,
                is_online=False,
                last_seen=now,
                consecutive_failures=1
            )
        else:
            status = self.node_health[node_id]
            status.consecutive_failures += 1
            
            # If we've hit the failure threshold, mark as offline
            if status.consecutive_failures >= self.failure_threshold and status.is_online:
                status.is_online = False
                
                logger.error(f"Node {node_id} is OFFLINE (failed {status.consecutive_failures} consecutive checks)")
                
                # Publish offline event
                await self.event_bus.emit(
                    make_node_offline(
                        node_id=node_id,
                        source_service="heartbeat_monitor",
                        consecutive_failures=status.consecutive_failures,
                        last_error=error,
                        occurred_at=now,
                    )
                )
                
                # Update registry
                self.registry.update_node_status(node_id, 'offline')
    
    def get_node_health(self, node_id: str) -> Optional[NodeHealthStatus]:
        """Get health status for a specific node."""
        return self.node_health.get(node_id)
    
    def get_all_health(self) -> Dict[str, NodeHealthStatus]:
        """Get health status for all nodes."""
        return self.node_health.copy()
    
    def get_online_nodes(self) -> Set[str]:
        """Get set of online node IDs."""
        return {
            node_id for node_id, status in self.node_health.items()
            if status.is_online
        }
    
    def get_offline_nodes(self) -> Set[str]:
        """Get set of offline node IDs."""
        return {
            node_id for node_id, status in self.node_health.items()
            if not status.is_online
        }

    def _prune_removed_nodes(self, current_node_ids: Set[Optional[str]]) -> None:
        normalized = {node_id for node_id in current_node_ids if node_id}
        for node_id in list(self.node_health.keys()):
            if node_id not in normalized:
                del self.node_health[node_id]

def get_heartbeat_monitor() -> HeartbeatMonitor:
    """Get the process-wide heartbeat monitor instance."""
    return HeartbeatMonitor.get_instance()
