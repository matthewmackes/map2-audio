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
from contextlib import contextmanager
from typing import Dict, List, Optional, Tuple
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

from app.utils.singleton import Singleton
from app.utils.time import utc_now

from app.services.cluster.mdns_discovery_enhanced import MDNSNode

logger = logging.getLogger(__name__)


class ClusterRegistry(Singleton):
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
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    @contextmanager
    def _connection(self) -> sqlite3.Connection:
        conn = self._connect()
        try:
            yield conn
        finally:
            conn.close()

    @staticmethod
    def _json_dumps(value) -> str:
        return json.dumps(value, sort_keys=True, separators=(",", ":"))

    @staticmethod
    def _json_loads(value, *, fallback):
        if isinstance(value, type(fallback)):
            return value
        if not value:
            return fallback
        try:
            parsed = json.loads(value)
        except Exception:
            return fallback
        return parsed if isinstance(parsed, type(fallback)) else fallback

    @staticmethod
    def _utc_timestamp() -> str:
        return utc_now().isoformat()

    def _normalize_node_row(self, row: sqlite3.Row | Dict) -> Dict:
        payload = dict(row)
        payload["audio_devices"] = self._json_loads(payload.get("audio_devices"), fallback=[])
        payload["midi_devices"] = self._json_loads(payload.get("midi_devices"), fallback=[])
        payload["metadata"] = self._json_loads(payload.get("metadata"), fallback={})
        return payload

    def _init_db(self) -> None:
        """Initialize database schema"""
        try:
            with self._connection() as conn:
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
                        midi_input_count INTEGER DEFAULT 0,
                        midi_output_count INTEGER DEFAULT 0,
                        midi_devices TEXT DEFAULT '[]',
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

                self._ensure_cluster_nodes_columns(cursor)
                conn.commit()
            self.logger.info("Cluster registry database initialized")

        except Exception as e:
            self.logger.error(f"Failed to initialize registry database: {e}")
            raise

    def _ensure_cluster_nodes_columns(self, cursor: sqlite3.Cursor) -> None:
        cursor.execute("PRAGMA table_info(cluster_nodes)")
        columns = {row[1] for row in cursor.fetchall()}
        required_columns = {
            "midi_input_count": "INTEGER DEFAULT 0",
            "midi_output_count": "INTEGER DEFAULT 0",
            "midi_devices": "TEXT DEFAULT '[]'",
        }
        for column_name, ddl in required_columns.items():
            if column_name in columns:
                continue
            cursor.execute(f"ALTER TABLE cluster_nodes ADD COLUMN {column_name} {ddl}")

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
        midi_input_count: int = 0,
        midi_output_count: int = 0,
        midi_devices: Optional[List[str]] = None,
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
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    INSERT INTO cluster_nodes (
                        id, hostname, ip_address, mac_address,
                        role, deployment_mode,
                        cpu_cores, total_memory_gb,
                        audio_devices, midi_input_count, midi_output_count, midi_devices, storage_gb,
                        status, health_score,
                        version, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        hostname = excluded.hostname,
                        ip_address = excluded.ip_address,
                        mac_address = excluded.mac_address,
                        role = excluded.role,
                        deployment_mode = excluded.deployment_mode,
                        cpu_cores = excluded.cpu_cores,
                        total_memory_gb = excluded.total_memory_gb,
                        audio_devices = excluded.audio_devices,
                        midi_input_count = excluded.midi_input_count,
                        midi_output_count = excluded.midi_output_count,
                        midi_devices = excluded.midi_devices,
                        storage_gb = excluded.storage_gb,
                        status = excluded.status,
                        health_score = excluded.health_score,
                        last_seen = CURRENT_TIMESTAMP,
                        last_updated = CURRENT_TIMESTAMP,
                        version = excluded.version,
                        metadata = excluded.metadata
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
                        self._json_dumps(audio_devices or []),
                        int(midi_input_count),
                        int(midi_output_count),
                        self._json_dumps(midi_devices or []),
                        storage_gb,
                        status,
                        health_score,
                        version,
                        self._json_dumps(metadata or {}),
                    ),
                )
                timestamp = self._utc_timestamp()
                cursor.execute(
                    """
                    UPDATE cluster_nodes SET
                        last_seen = ?, last_updated = ?
                    WHERE id = ?
                    """,
                    (timestamp, timestamp, node_id),
                )
                conn.commit()
            return True

        except Exception as e:
            self.logger.error(f"Failed to add/update node {node_id}: {e}")
            return False

    def update_node_status(self, node_id: str, status: str) -> bool:
        """Update node status"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    UPDATE cluster_nodes SET
                        status = ?, last_updated = ?
                    WHERE id = ?
                    """,
                    (status, self._utc_timestamp(), node_id),
                )

                conn.commit()
                return cursor.rowcount > 0

        except Exception as e:
            self.logger.error(f"Failed to update node status: {e}")
            return False

    def update_node_health(self, node_id: str, health_score: float) -> bool:
        """Update node health score"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                # Clamp to 0-100
                health_score = max(0.0, min(100.0, health_score))

                cursor.execute(
                    """
                    UPDATE cluster_nodes SET
                        health_score = ?, last_updated = ?
                    WHERE id = ?
                    """,
                    (health_score, self._utc_timestamp(), node_id),
                )

                conn.commit()
                return cursor.rowcount > 0

        except Exception as e:
            self.logger.error(f"Failed to update node health: {e}")
            return False

    def get_node(self, node_id: str) -> Optional[Dict]:
        """Get node by ID"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute("SELECT * FROM cluster_nodes WHERE id = ?", (node_id,))
                row = cursor.fetchone()

                if row:
                    return self._normalize_node_row(row)
                return None

        except Exception as e:
            self.logger.error(f"Failed to get node: {e}")
            return None

    def get_all_nodes(self) -> List[Dict]:
        """Get all nodes"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute("SELECT * FROM cluster_nodes ORDER BY id")
                rows = cursor.fetchall()

                return [self._normalize_node_row(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get all nodes: {e}")
            return []

    def get_nodes_by_role(self, role: str) -> List[Dict]:
        """Get nodes by role"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    "SELECT * FROM cluster_nodes WHERE role = ? ORDER BY id", (role,)
                )
                rows = cursor.fetchall()

                return [self._normalize_node_row(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get nodes by role: {e}")
            return []

    def get_nodes_by_status(self, status: str) -> List[Dict]:
        """Get nodes by status"""
        try:
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    "SELECT * FROM cluster_nodes WHERE status = ? ORDER BY id", (status,)
                )
                rows = cursor.fetchall()

                return [self._normalize_node_row(row) for row in rows]

        except Exception as e:
            self.logger.error(f"Failed to get nodes by status: {e}")
            return []

    def remove_node(self, node_id: str) -> bool:
        """Remove node from registry (cascades to metrics)"""
        try:
            with self._connection() as conn:
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
            with self._connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT
                        COUNT(*) AS total_nodes,
                        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) AS online_nodes,
                        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) AS offline_nodes,
                        SUM(CASE WHEN role = 'MANAGEMENT-NODE' THEN 1 ELSE 0 END) AS management_nodes,
                        SUM(CASE WHEN role = 'AUDIO-NODE' THEN 1 ELSE 0 END) AS audio_nodes,
                        SUM(
                            CASE
                                WHEN COALESCE(midi_input_count, 0) > 0
                                  OR COALESCE(midi_output_count, 0) > 0 THEN 1
                                ELSE 0
                            END
                        ) AS midi_capable_nodes,
                        AVG(CASE WHEN status = 'online' THEN health_score END) AS avg_health,
                        MAX(last_updated) AS last_updated
                    FROM cluster_nodes
                    """
                )
                row = cursor.fetchone()

            if row is None:
                return {}

            return {
                "total_nodes": int(row["total_nodes"] or 0),
                "online_nodes": int(row["online_nodes"] or 0),
                "offline_nodes": int(row["offline_nodes"] or 0),
                "management_nodes": int(row["management_nodes"] or 0),
                "audio_nodes": int(row["audio_nodes"] or 0),
                "midi_capable_nodes": int(row["midi_capable_nodes"] or 0),
                "avg_health": float(row["avg_health"] or 0.0),
                "last_updated": row["last_updated"] or self._utc_timestamp(),
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
            with self._connection() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    INSERT INTO node_metrics_history (
                        node_id, timestamp, cpu_percent, memory_percent,
                        dsp_load_percent, xrun_count, latency_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        node_id,
                        self._utc_timestamp(),
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
            with self._connection() as conn:
                cursor = conn.cursor()

                cutoff = utc_now() - timedelta(days=days)

                cursor.execute(
                    "DELETE FROM node_metrics_history WHERE timestamp < ?",
                    (cutoff.isoformat(),),
                )

                conn.commit()
                return cursor.rowcount

        except Exception as e:
            self.logger.error(f"Failed to cleanup metrics: {e}")
            return 0

def get_cluster_registry() -> ClusterRegistry:
    """Get the process-wide cluster registry singleton."""
    return ClusterRegistry.get_instance()
