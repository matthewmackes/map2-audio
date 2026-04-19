"""
Network Topology Monitor

Real-time network monitoring and topology mapping:
- Build latency mesh between all nodes
- Calculate optimal audio stream routing
- Detect network issues (packet loss, high latency)
- Store latency matrix in SQLite
- Update every 60 seconds
- Provide topology visualization data

Critical for optimizing distributed audio routing and detecting network problems.
"""

import asyncio
import logging
import subprocess
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import sqlite3
from pathlib import Path

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.distributed_event_bus import (
    get_event_bus as get_distributed_event_bus,
    EventType,
    EventSeverity,
    ClusterEvent,
)
from app.utils.singleton import Singleton
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


@dataclass
class NetworkLink:
    """Network link between two nodes"""
    
    source_node: str
    target_node: str
    latency_ms: float
    packet_loss_percent: float
    jitter_ms: float
    last_updated: datetime
    status: str  # "healthy", "degraded", "failed"
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "source_node": self.source_node,
            "target_node": self.target_node,
            "latency_ms": round(self.latency_ms, 2),
            "packet_loss_percent": round(self.packet_loss_percent, 2),
            "jitter_ms": round(self.jitter_ms, 2),
            "last_updated": self.last_updated.isoformat(),
            "status": self.status,
        }


class NetworkTopologyMonitor(Singleton):
    """
    Monitors network topology and performance between cluster nodes.
    
    Functions:
    - Ping mesh: Test latency between all node pairs
    - Packet loss detection
    - Jitter measurement
    - Optimal routing calculation
    - Alert on degraded links
    """
    
    def __init__(
        self,
        db_path: str = "/var/lib/map2/network-topology.db",
        update_interval: int = 60,
        latency_threshold_ms: float = 10.0,
        packet_loss_threshold: float = 1.0,
    ):
        """
        Initialize network topology monitor.
        
        Args:
            db_path: SQLite database path
            update_interval: Seconds between updates
            latency_threshold_ms: Alert threshold for latency
            packet_loss_threshold: Alert threshold for packet loss (%)
        """
        self.db_path = db_path
        self.update_interval = update_interval
        self.latency_threshold = latency_threshold_ms
        self.packet_loss_threshold = packet_loss_threshold
        
        self.logger = logging.getLogger(__name__)
        self.event_bus = get_distributed_event_bus()
        self.registry = get_cluster_registry()
        
        self._init_database()
        self._running = False
        self._task: Optional[asyncio.Task] = None
    
    def _init_database(self):
        """Initialize database schema"""
        try:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS network_links (
                        source_node TEXT NOT NULL,
                        target_node TEXT NOT NULL,
                        latency_ms REAL NOT NULL,
                        packet_loss_percent REAL NOT NULL,
                        jitter_ms REAL NOT NULL,
                        timestamp DATETIME NOT NULL,
                        status TEXT NOT NULL,
                        PRIMARY KEY (source_node, target_node, timestamp)
                    )
                """)
                
                # Index for fast queries
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_network_links_timestamp
                    ON network_links(timestamp DESC)
                """)
                
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_network_links_nodes
                    ON network_links(source_node, target_node)
                """)
                
                conn.commit()
            
            self.logger.info(f"Initialized topology database at {self.db_path}")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize database: {e}")
    
    async def start(self):
        """Start topology monitoring"""
        if self._running:
            self.logger.warning("Topology monitor already running")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        self.logger.info("Network topology monitor started")
    
    async def stop(self):
        """Stop topology monitoring"""
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Network topology monitor stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self._running:
            try:
                await self._update_topology()
                await asyncio.sleep(self.update_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Topology update failed: {e}", exc_info=True)
                await asyncio.sleep(self.update_interval)
    
    async def _update_topology(self):
        """Update network topology"""
        try:
            # Get all online nodes
            nodes = self.registry.get_all_nodes()
            online_nodes = [n for n in nodes if n.get("status") == "online"]
            
            if len(online_nodes) < 2:
                self.logger.debug("Not enough nodes for topology update")
                return
            
            # Test all pairs
            tasks = []
            for source in online_nodes:
                for target in online_nodes:
                    if source["id"] != target["id"]:
                        tasks.append(
                            self._test_link(source["id"], target["ip"])
                        )
            
            # Run tests in parallel
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Store results
            links = [r for r in results if isinstance(r, NetworkLink)]
            await self._store_links(links)
            
            # Check for degraded links
            await self._check_link_health(links)
            
            self.logger.debug(f"Topology updated: {len(links)} links tested")
            
        except Exception as e:
            self.logger.error(f"Topology update failed: {e}")
    
    async def _test_link(
        self,
        source_node: str,
        target_ip: str,
        count: int = 10,
    ) -> Optional[NetworkLink]:
        """
        Test network link using ping.
        
        Args:
            source_node: Source node ID
            target_ip: Target IP address
            count: Number of pings
            
        Returns:
            NetworkLink with measurements
        """
        try:
            # Run ping command
            result = subprocess.run(
                ["ping", "-c", str(count), "-i", "0.2", "-q", target_ip],
                capture_output=True,
                text=True,
                timeout=10,
            )
            
            if result.returncode != 0:
                # Ping failed
                return NetworkLink(
                    source_node=source_node,
                    target_node=target_ip,
                    latency_ms=0.0,
                    packet_loss_percent=100.0,
                    jitter_ms=0.0,
                    last_updated=utc_now(),
                    status="failed",
                )
            
            # Parse ping output
            output = result.stdout
            
            # Extract packet loss
            packet_loss = 0.0
            for line in output.split('\n'):
                if "packet loss" in line:
                    parts = line.split(',')
                    for part in parts:
                        if "packet loss" in part:
                            packet_loss = float(part.split('%')[0].strip().split()[-1])
            
            # Extract latency stats (min/avg/max/stddev)
            latency = 0.0
            jitter = 0.0
            for line in output.split('\n'):
                if "min/avg/max" in line or "rtt" in line:
                    # Format: rtt min/avg/max/mdev = 0.123/0.456/0.789/0.012 ms
                    parts = line.split('=')
                    if len(parts) == 2:
                        stats = parts[1].strip().split('/')[0:4]
                        if len(stats) >= 4:
                            latency = float(stats[1])  # avg
                            jitter = float(stats[3].split()[0])  # mdev/stddev
            
            # Determine status
            status = "healthy"
            if packet_loss > self.packet_loss_threshold:
                status = "failed"
            elif latency > self.latency_threshold:
                status = "degraded"
            
            return NetworkLink(
                source_node=source_node,
                target_node=target_ip,
                latency_ms=latency,
                packet_loss_percent=packet_loss,
                jitter_ms=jitter,
                last_updated=utc_now(),
                status=status,
            )
            
        except subprocess.TimeoutExpired:
            self.logger.warning(f"Ping timeout to {target_ip}")
            return NetworkLink(
                source_node=source_node,
                target_node=target_ip,
                latency_ms=0.0,
                packet_loss_percent=100.0,
                jitter_ms=0.0,
                last_updated=utc_now(),
                status="failed",
            )
        except Exception as e:
            self.logger.error(f"Link test failed: {e}")
            return None
    
    async def _store_links(self, links: List[NetworkLink]):
        """Store link measurements in database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                for link in links:
                    conn.execute("""
                        INSERT INTO network_links
                        (source_node, target_node, latency_ms, packet_loss_percent,
                         jitter_ms, timestamp, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        link.source_node,
                        link.target_node,
                        link.latency_ms,
                        link.packet_loss_percent,
                        link.jitter_ms,
                        link.last_updated,
                        link.status,
                    ))
                
                conn.commit()
            
        except Exception as e:
            self.logger.error(f"Failed to store links: {e}")
    
    async def _check_link_health(self, links: List[NetworkLink]):
        """Check link health and publish alerts"""
        try:
            for link in links:
                if link.status == "failed":
                    # Critical alert
                    event = ClusterEvent(
                        event_type=EventType.SYSTEM_ALERT,
                        severity=EventSeverity.CRITICAL,
                        source_node_id=link.source_node,
                        message=f"Network link failed to {link.target_node}",
                        details=link.to_dict(),
                    )
                    await self.event_bus.publish_event(event)
                    
                elif link.status == "degraded":
                    # Warning alert
                    event = ClusterEvent(
                        event_type=EventType.SYSTEM_ALERT,
                        severity=EventSeverity.WARNING,
                        source_node_id=link.source_node,
                        message=f"Network link degraded to {link.target_node}",
                        details=link.to_dict(),
                    )
                    await self.event_bus.publish_event(event)
            
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
    
    def get_current_topology(self) -> Dict:
        """
        Get current network topology.
        
        Returns:
            - nodes: List of nodes
            - links: List of network links with current status
            - summary: Overall topology health
        """
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get latest link for each node pair
                cursor = conn.execute("""
                    SELECT source_node, target_node, latency_ms,
                           packet_loss_percent, jitter_ms, timestamp, status
                    FROM network_links
                    WHERE (source_node, target_node, timestamp) IN (
                        SELECT source_node, target_node, MAX(timestamp)
                        FROM network_links
                        GROUP BY source_node, target_node
                    )
                    ORDER BY source_node, target_node
                """)
                
                links = []
                for row in cursor.fetchall():
                    link = NetworkLink(
                        source_node=row[0],
                        target_node=row[1],
                        latency_ms=row[2],
                        packet_loss_percent=row[3],
                        jitter_ms=row[4],
                        last_updated=datetime.fromisoformat(row[5]),
                        status=row[6],
                    )
                    links.append(link.to_dict())
                
                # Calculate summary
                total_links = len(links)
                healthy_links = sum(1 for l in links if l["status"] == "healthy")
                degraded_links = sum(1 for l in links if l["status"] == "degraded")
                failed_links = sum(1 for l in links if l["status"] == "failed")
                
                avg_latency = (
                    sum(l["latency_ms"] for l in links) / total_links
                    if total_links > 0 else 0
                )
                
                return {
                    "nodes": [n["id"] for n in self.registry.get_all_nodes()],
                    "links": links,
                    "summary": {
                        "total_links": total_links,
                        "healthy": healthy_links,
                        "degraded": degraded_links,
                        "failed": failed_links,
                        "avg_latency_ms": round(avg_latency, 2),
                        "health_percent": round(
                            (healthy_links / total_links * 100) if total_links > 0 else 0,
                            1
                        ),
                    },
                }
            
        except Exception as e:
            self.logger.error(f"Failed to get topology: {e}")
            return {"nodes": [], "links": [], "summary": {}}
    
    def get_optimal_route(
        self,
        source_node: str,
        target_node: str,
    ) -> Optional[List[str]]:
        """
        Calculate optimal route between two nodes.
        
        Currently returns direct path. In future, could implement
        routing through intermediate nodes if direct link is degraded.
        
        Args:
            source_node: Source node ID
            target_node: Target node ID
            
        Returns:
            List of node IDs forming the route
        """
        try:
            # For now, use direct routing
            # Future: Implement Dijkstra's algorithm for multi-hop routing
            
            topology = self.get_current_topology()
            
            # Find direct link
            for link in topology["links"]:
                if (link["source_node"] == source_node and
                    link["target_node"] == target_node):
                    
                    if link["status"] in ["healthy", "degraded"]:
                        return [source_node, target_node]
            
            # No route found
            return None
            
        except Exception as e:
            self.logger.error(f"Route calculation failed: {e}")
            return None
    
    def cleanup_old_data(self, days: int = 7):
        """
        Remove topology data older than specified days.
        
        Args:
            days: Days to retain
        """
        try:
            cutoff = utc_now() - timedelta(days=days)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("""
                    DELETE FROM network_links
                    WHERE timestamp < ?
                """, (cutoff,))
                
                deleted = conn.total_changes
                conn.commit()
            
            self.logger.info(f"Deleted {deleted} old topology records")
            
        except Exception as e:
            self.logger.error(f"Cleanup failed: {e}")

def get_topology_monitor() -> NetworkTopologyMonitor:
    """Get the process-wide topology monitor."""
    return NetworkTopologyMonitor.get_instance()
