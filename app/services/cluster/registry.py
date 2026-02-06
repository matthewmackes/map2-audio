"""
Cluster Registry (CMDB) - Centralized Node Inventory

Maintains authoritative database of all cluster nodes:
- Node metadata (ID, hostname, IP, MAC, role, capabilities)
- Node status (online/offline/degraded/updating)
- Health scores and metrics history
- Automatic discovery integration
- Replication to standby nodes

Schema designed for Fedora + SQLite, with upgrade path to PostgreSQL.
"""

import json
import logging
import sqlite3
from typing import Dict, List, Optional, Tuple
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
import threading

from app.services.cluster.mdns_discovery_enhanced import MDNSNode

logger = logging.getLogger(__name__)


class ClusterRegistry:
    """
    Cluster Registry (CMDB) for storing and managing node inventory.

    Manages:
    - Node registration and metadata
    - Node status tracking
    - Health metrics history
    - Automatic sync with discovered nodes
    """

    DB_PATH = Path("/var/lib/map2/cluster.db")
    SYNC_INTERVAL = 30  # seconds

    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize cluster registry.

        Args:
            db_path: Path to SQLite database (defaults to /var/lib/map2/cluster.db)
        """
        self.db_path = db_path or self.DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)
        self._local = threading.local()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        """Get thread-local database connection"""
        if not hasattr(self._local, "conn"):
            self._local.conn = sqlite3.connect(str(self.db_path))
            self._local.conn.row_factory = sqlite3.Row
            # Enable WAL mode for replication
            self._local.conn.execute("PRAGMA journal_mode=WAL;")
        return self._local.conn

    def _init_db(self) -> None:
        """Initialize database schema"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            # Main nodes table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cluster_nodes (
                    id TEXT PRIMARY KEY,
                    hostname TEXT NOT NULL,
                    ip_address TEXT,
                    mac_address TEXT,
                    role TEXT DEFAULT 'AUDIO-NODE',
                    deployment_mode TEXT DEFAULT 'AUDIO-NODE',
                    cpu_cores INTEGER DEFAULT 0,
                    total_memory_gb INTEGER DEFAULT 0,
                    audio_devices TEXT,
                    storage_gb INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'offline',
                    health_score REAL DEFAULT 50.0,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    version TEXT DEFAULT '0.0.0',
                    metadata JSON DEFAULT '{}'
                );
                """
            )

            # Metrics history table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS node_metrics_history (
                    node_id TEXT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    cpu_percent REAL,
                    memory_percent REAL,
                    dsp_load_percent REAL,
                    xrun_count INTEGER,
                    latency_ms REAL,
                    PRIMARY KEY (node_id, timestamp),
                    FOREIGN KEY (node_id) REFERENCES cluster_nodes(id)
                    ON DELETE CASCADE
                );
                """
            )

            # Create indexes for better query performance
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_nodes_status ON cluster_nodes(status);"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_nodes_role ON cluster_nodes(role);"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_metrics_time ON node_metrics_history(timestamp);"
            )

            conn.commit()
            self.logger.info("Cluster registry database initialized")

        except Exception as e:
            self.logger.error(f"Failed to initialize registry database: {e}")
            raise

    def add_or_update_node(
        self,
        node_id: str,
        hostname: str,
        ip_address: Optional[str] = None,
        mac_address: Optional[str] = None,
        role: str = "AUDIO-NODE",
        deployment_mode: str = "AUDIO-NODE",
        cpu_cores: int = 0,
        total_memory_gb: int = 0,
        audio_devices: Optional[List[str]] = None,
        storage_gb: int = 0,
        status: str = "online",
        health_score: float = 50.0,
        version: str = "0.0.0",
        metadata: Optional[Dict] = None,
    ) -> bool:
        """
        Add or update a node in the registry.

        Args:
            node_id: Unique node identifier
            hostname: Hostname
            ip_address: IP address
            mac_address: MAC address
            role: Node role (AUDIO-NODE, MANAGEMENT-NODE, etc)
            deployment_mode: Deployment mode
            cpu_cores: Number of CPU cores
            total_memory_gb: Total memory in GB
            audio_devices: List of audio devices
            storage_gb: Storage in GB
            status: Node status
            health_score: Health score (0-100)
            version: Software version
            metadata: Additional metadata as JSON

        Returns:
            True if successful
        """
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            audio_devices_json = json.dumps(audio_devices or [])
            metadata_json = json.dumps(metadata or {})

            # Check if node exists
            cursor.execute("SELECT id FROM cluster_nodes WHERE id = ?", (node_id,))
            exists = cursor.fetchone() is not None

            if exists:
                # Update existing node
                cursor.execute(
                    """
                    UPDATE cluster_nodes SET
                        hostname = ?, ip_address = ?, mac_address = ?,
                        role = ?, deployment_mode = ?,
                        cpu_cores = ?, total_memory_gb = ?,
                        audio_devices = ?, storage_gb = ?,
                        status = ?, health_score = ?,
                        last_seen = CURRENT_TIMESTAMP,
                        last_updated = CURRENT_TIMESTAMP,
                        version = ?, metadata = ?
                    WHERE id = ?
                    """,
                    (
                        hostname,
                        ip_address,
                        mac_address,
                        role,
                        deployment_mode,
                        cpu_cores,
                        total_memory_gb,
                        audio_devices_json,
                        storage_gb,
                        status,
                        health_score,
                        version,
                        metadata_json,
                        node_id,
                    ),
                )
                self.logger.debug(f"Updated node in registry: {node_id}")
            else:
                # Insert new node
                cursor.execute(
                    """
                    INSERT INTO cluster_nodes (
                        id, hostname, ip_address, mac_address,
                        role, deployment_mode,
                        cpu_cores, total_memory_gb,
                        audio_devices, storage_gb,
                        status, health_score,
                        version, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        node_id,
                        hostname,
                        ip_address,
                        mac_address,
                        role,
                        deployment_mode,
                        cpu_cores,
                        total_memory_gb,
                        audio_devices_json,
                        storage_gb,
                        status,
                        health_score,
                        version,
                        metadata_json,
                    ),
                )
                self.logger.info(f"Added node to registry: {node_id}")

            conn.commit()
            return True

        except Exception as e:
            self.logger.error(f"Failed to add/update node {node_id}: {e}")
            return False

    def update_node_status(self, node_id: str, status: str) -> bool:
        """Update node status"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute(
                """
                UPDATE cluster_nodes SET
                    status = ?, last_updated = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (status, node_id),
            )

            conn.commit()
            return cursor.rowcount > 0

        except Exception as e:
            self.logger.error(f"Failed to update node status: {e}")
            return False

    def update_node_health(self, node_id: str, health_score: float) -> bool:
        """Update node health score"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            # Clamp to 0-100
            health_score = max(0.0, min(100.0, health_score))

            cursor.execute(
                """
                UPDATE cluster_nodes SET
                    health_score = ?, last_updated = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (health_score, node_id),
            )

            conn.commit()
            return cursor.rowcount > 0

        except Exception as e:
            self.logger.error(f"Failed to update node health: {e}")
            return False

    def get_node(self, node_id: str) -> Optional[Dict]:
        """Get node by ID"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM cluster_nodes WHERE id = ?", (node_id,))
            row = cursor.fetchone()

            if row:
                return dict(row)
            return None

        except Exception as e:
            self.logger.error(f"Failed to get node: {e}")
            return None

    def get_all_nodes(self) -> List[Dict]:
        """Get all nodes"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM cluster_nodes ORDER BY id")
            rows = cursor.fetchall()

            return [dict(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get all nodes: {e}")
            return []

    def get_nodes_by_role(self, role: str) -> List[Dict]:
        """Get nodes by role"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute(
                "SELECT * FROM cluster_nodes WHERE role = ? ORDER BY id", (role,)
            )
            rows = cursor.fetchall()

            return [dict(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get nodes by role: {e}")
            return []

    def get_nodes_by_status(self, status: str) -> List[Dict]:
        """Get nodes by status"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute(
                "SELECT * FROM cluster_nodes WHERE status = ? ORDER BY id", (status,)
            )
            rows = cursor.fetchall()

            return [dict(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get nodes by status: {e}")
            return []

    def remove_node(self, node_id: str) -> bool:
        """Remove node from registry (cascades to metrics)"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute("DELETE FROM cluster_nodes WHERE id = ?", (node_id,))

            conn.commit()
            rows_deleted = cursor.rowcount
            if rows_deleted > 0:
                self.logger.info(f"Removed node from registry: {node_id}")
            return rows_deleted > 0

        except Exception as e:
            self.logger.error(f"Failed to remove node: {e}")
            return False

    def get_cluster_summary(self) -> Dict:
        """Get cluster summary statistics"""
        try:
            nodes = self.get_all_nodes()
            online_nodes = self.get_nodes_by_status("online")

            return {
                "total_nodes": len(nodes),
                "online_nodes": len(online_nodes),
                "offline_nodes": len(self.get_nodes_by_status("offline")),
                "management_nodes": len(self.get_nodes_by_role("MANAGEMENT-NODE")),
                "audio_nodes": len(self.get_nodes_by_role("AUDIO-NODE")),
                "avg_health": (
                    sum(n["health_score"] for n in online_nodes) / len(online_nodes)
                    if online_nodes
                    else 0.0
                ),
                "last_updated": datetime.utcnow().isoformat(),
            }

        except Exception as e:
            self.logger.error(f"Failed to get cluster summary: {e}")
            return {}

    def add_metrics(
        self,
        node_id: str,
        cpu_percent: float,
        memory_percent: float,
        dsp_load_percent: float = 0.0,
        xrun_count: int = 0,
        latency_ms: float = 0.0,
    ) -> bool:
        """Add metrics record for node"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO node_metrics_history (
                    node_id, cpu_percent, memory_percent,
                    dsp_load_percent, xrun_count, latency_ms
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    node_id,
                    cpu_percent,
                    memory_percent,
                    dsp_load_percent,
                    xrun_count,
                    latency_ms,
                ),
            )

            conn.commit()
            return True

        except Exception as e:
            self.logger.error(f"Failed to add metrics: {e}")
            return False

    def cleanup_old_metrics(self, days: int = 30) -> int:
        """Remove metrics older than specified days"""
        try:
            conn = self._get_conn()
            cursor = conn.cursor()

            cutoff = datetime.utcnow() - timedelta(days=days)

            cursor.execute(
                "DELETE FROM node_metrics_history WHERE timestamp < ?",
                (cutoff.isoformat(),),
            )

            conn.commit()
            return cursor.rowcount

        except Exception as e:
            self.logger.error(f"Failed to cleanup metrics: {e}")
            return 0


# Global registry instance
_cluster_registry: Optional[ClusterRegistry] = None


def get_cluster_registry() -> ClusterRegistry:
    """Get or create the cluster registry singleton"""
    global _cluster_registry
    if _cluster_registry is None:
        _cluster_registry = ClusterRegistry()
    return _cluster_registry
