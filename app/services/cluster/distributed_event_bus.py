"""
Distributed Event Bus for Cross-Node Events

Enables event-driven architecture across the cluster:
- Each node publishes state changes to event stream
- Management Node aggregates events into unified log
- Event replay capability for troubleshooting
- Maximum 7 days retention
- Full audit trail of all cluster operations

Built on existing LCD event bus, extended for cluster distribution.
"""

import asyncio
import inspect
import logging
import json
import sqlite3
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
import queue

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EventType(Enum):
    """Types of events that can occur in cluster"""

    # Node events
    NODE_JOINED = "node.joined"
    NODE_LEFT = "node.left"
    NODE_UPDATED = "node.updated"
    NODE_FAILED = "node.failed"
    NODE_RECOVERED = "node.recovered"

    # Update events
    UPDATE_STARTED = "update.started"
    UPDATE_COMPLETED = "update.completed"
    UPDATE_FAILED = "update.failed"
    UPDATE_ROLLED_BACK = "update.rolled_back"

    # Config events
    CONFIG_CHANGED = "config.changed"
    CONFIG_SYNC_REQUESTED = "config.sync_requested"
    CONFIG_SYNC_COMPLETED = "config.sync_completed"
    CONFIG_PUSHED = "config.pushed"
    CONFIG_ROLLED_BACK = "config.rolled_back"
    CONFIG_SYNCED = "config.synced"

    # Health events
    HEALTH_DEGRADED = "health.degraded"
    HEALTH_RECOVERED = "health.recovered"
    HEALTH_CRITICAL = "health.critical"

    # Failover events
    FAILOVER_INITIATED = "failover.initiated"
    FAILOVER_COMPLETED = "failover.completed"
    FAILOVER_FAILED = "failover.failed"

    # Metrics events
    METRICS_COLLECTED = "metrics.collected"
    PERFORMANCE_ALERT = "performance.alert"

    # MIDI cluster events
    MIDI_PORT_DISCOVERED = "midi.port.discovered"
    MIDI_PORT_LOST = "midi.port.lost"
    MIDI_NODE_DISCOVERED = "midi.node.discovered"
    MIDI_NODE_LOST = "midi.node.lost"
    MIDI_CONNECTION_REQUESTED = "midi.connection.requested"
    MIDI_CONNECTION_ESTABLISHED = "midi.connection.established"
    MIDI_CONNECTION_FAILED = "midi.connection.failed"
    MIDI_CONNECTION_LOST = "midi.connection.lost"
    MIDI_FAILOVER_TRIGGERED = "midi.failover.triggered"
    MIDI_FAILOVER_COMPLETED = "midi.failover.completed"
    MIDI_CLOCK_MASTER_ELECTED = "midi.clock.master_elected"
    MIDI_CLOCK_DRIFT_DETECTED = "midi.clock.drift_detected"
    MIDI_PROFILE_SHARED = "midi.profile.shared"

    # System events
    SYSTEM_ALERT = "system.alert"
    MAINTENANCE_STARTED = "maintenance.started"
    MAINTENANCE_COMPLETED = "maintenance.completed"


class EventSeverity(Enum):
    """Severity level of event"""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ClusterEvent:
    """Represents a single cluster event"""

    event_type: EventType
    timestamp: datetime = field(default_factory=_utcnow)
    severity: EventSeverity = EventSeverity.INFO
    source_node_id: str = ""
    affected_nodes: List[str] = field(default_factory=list)
    message: str = ""
    details: Dict = field(default_factory=dict)
    correlation_id: str = ""  # For tracking related events

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "severity": self.severity.value,
            "source_node_id": self.source_node_id,
            "affected_nodes": self.affected_nodes,
            "message": self.message,
            "details": self.details,
            "correlation_id": self.correlation_id,
        }

    @staticmethod
    def from_dict(data: Dict) -> "ClusterEvent":
        """Create from dictionary"""
        data_copy = data.copy()
        data_copy["event_type"] = EventType(data_copy["event_type"])
        data_copy["severity"] = EventSeverity(data_copy["severity"])
        data_copy["timestamp"] = datetime.fromisoformat(data_copy["timestamp"])
        return ClusterEvent(**data_copy)


class DistributedEventBus:
    """
    Manages cluster-wide event bus.

    Events flow: Audio Node → Management Node → Event Log
    """

    def __init__(self, db_path: str = "/var/lib/map2/cluster-events.db"):
        """
        Initialize event bus.

        Args:
            db_path: Path to SQLite database for events
        """
        self.db_path = Path(db_path)
        self.logger = logging.getLogger(__name__)
        self.event_queue: queue.Queue = queue.Queue()
        self._subscribers: Dict[EventType, List[Callable]] = {}
        self._init_db()

    def _init_db(self):
        """Initialize event database"""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Create events table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS cluster_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    timestamp DATETIME NOT NULL,
                    severity TEXT NOT NULL,
                    source_node_id TEXT NOT NULL,
                    affected_nodes TEXT,
                    message TEXT,
                    details TEXT,
                    correlation_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            # Create index on timestamp for fast queries
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_timestamp ON cluster_events(timestamp DESC)"
            )

            # Create index on event_type
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_event_type ON cluster_events(event_type)"
            )

            # Create index on severity
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_severity ON cluster_events(severity)"
            )

            conn.commit()
            conn.close()

            self.logger.info(f"Initialized event database at {self.db_path}")

        except Exception as e:
            self.logger.error(f"Failed to initialize event database: {e}")

    async def publish_event(self, event: ClusterEvent) -> bool:
        """
        Publish event to bus.

        Args:
            event: Event to publish

        Returns:
            True if successful
        """
        try:
            self.logger.debug(f"Publishing event: {event.event_type.value}")

            # Store in database
            self._store_event(event)

            # Call subscribers
            await self._call_subscribers(event)

            return True

        except Exception as e:
            self.logger.error(f"Failed to publish event: {e}")
            return False

    def _store_event(self, event: ClusterEvent):
        """Store event in database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO cluster_events
                (event_type, timestamp, severity, source_node_id, affected_nodes, message, details, correlation_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.event_type.value,
                    event.timestamp.isoformat(),
                    event.severity.value,
                    event.source_node_id,
                    json.dumps(event.affected_nodes),
                    event.message,
                    json.dumps(event.details),
                    event.correlation_id,
                ),
            )

            conn.commit()
            conn.close()

        except Exception as e:
            self.logger.error(f"Failed to store event: {e}")

    async def _call_subscribers(self, event: ClusterEvent):
        """Call all subscribers for event type"""
        try:
            subscribers = self._subscribers.get(event.event_type, [])

            for callback in subscribers:
                try:
                    if inspect.iscoroutinefunction(callback):
                        await callback(event)
                    else:
                        callback(event)
                except Exception as e:
                    self.logger.error(f"Subscriber callback failed: {e}")

        except Exception as e:
            self.logger.error(f"Failed to call subscribers: {e}")

    def subscribe(
        self, event_type: EventType, callback: Callable
    ) -> bool:
        """
        Subscribe to event type.

        Args:
            event_type: Type of event to subscribe to
            callback: Function to call when event occurs

        Returns:
            True if successful
        """
        try:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []

            self._subscribers[event_type].append(callback)
            self.logger.debug(f"Subscribed to {event_type.value}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to subscribe: {e}")
            return False

    def get_events(
        self,
        event_type: Optional[EventType] = None,
        severity: Optional[EventSeverity] = None,
        hours: int = 24,
        limit: int = 100,
    ) -> List[ClusterEvent]:
        """
        Get events from log.

        Args:
            event_type: Filter by event type (optional)
            severity: Filter by severity (optional)
            hours: How far back to search (default 24 hours)
            limit: Maximum events to return

        Returns:
            List of events
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Build query
            query = "SELECT * FROM cluster_events WHERE timestamp > ?"
            params = [
                (_utcnow() - timedelta(hours=hours)).isoformat()
            ]

            if event_type:
                query += " AND event_type = ?"
                params.append(event_type.value)

            if severity:
                query += " AND severity = ?"
                params.append(severity.value)

            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()

            events = []
            for row in rows:
                event = self._row_to_event(row)
                events.append(event)

            conn.close()
            return events

        except Exception as e:
            self.logger.error(f"Failed to get events: {e}")
            return []

    def _row_to_event(self, row: tuple) -> ClusterEvent:
        """Convert database row to event"""
        (
            id_,
            event_type,
            timestamp,
            severity,
            source_node_id,
            affected_nodes,
            message,
            details,
            correlation_id,
            created_at,
        ) = row

        return ClusterEvent(
            event_type=EventType(event_type),
            timestamp=datetime.fromisoformat(timestamp),
            severity=EventSeverity(severity),
            source_node_id=source_node_id,
            affected_nodes=json.loads(affected_nodes) if affected_nodes else [],
            message=message,
            details=json.loads(details) if details else {},
            correlation_id=correlation_id,
        )

    def get_events_by_node(
        self,
        node_id: str,
        hours: int = 24,
        limit: int = 100,
    ) -> List[ClusterEvent]:
        """
        Get all events related to a specific node.

        Args:
            node_id: Node ID to filter by
            hours: How far back to search
            limit: Maximum events to return

        Returns:
            List of events
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT * FROM cluster_events
                WHERE (source_node_id = ? OR affected_nodes LIKE ?)
                AND timestamp > ?
                ORDER BY timestamp DESC
                LIMIT ?
                """,
                (
                    node_id,
                    f"%{node_id}%",
                    (_utcnow() - timedelta(hours=hours)).isoformat(),
                    limit,
                ),
            )

            rows = cursor.fetchall()
            events = [self._row_to_event(row) for row in rows]

            conn.close()
            return events

        except Exception as e:
            self.logger.error(f"Failed to get node events: {e}")
            return []

    async def replay_events(
        self,
        start_time: datetime,
        end_time: datetime,
        callback: Callable,
    ) -> int:
        """
        Replay events in time window.

        Used for troubleshooting or system recovery.

        Args:
            start_time: Start of time window
            end_time: End of time window
            callback: Function to call for each event

        Returns:
            Number of events replayed
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                """
                SELECT * FROM cluster_events
                WHERE timestamp BETWEEN ? AND ?
                ORDER BY timestamp ASC
                """,
                (start_time.isoformat(), end_time.isoformat()),
            )

            rows = cursor.fetchall()
            count = 0

            for row in rows:
                event = self._row_to_event(row)
                if asyncio.iscoroutinefunction(callback):
                    await callback(event)
                else:
                    callback(event)
                count += 1

            conn.close()
            self.logger.info(f"Replayed {count} events")
            return count

        except Exception as e:
            self.logger.error(f"Failed to replay events: {e}")
            return 0

    async def cleanup_old_events(self, days: int = 7) -> int:
        """
        Clean up events older than specified days.

        Returns:
            Number of events deleted
        """
        try:
            cutoff = _utcnow() - timedelta(days=days)

            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute(
                "DELETE FROM cluster_events WHERE timestamp < ?",
                (cutoff.isoformat(),),
            )

            deleted = cursor.rowcount
            conn.commit()
            conn.close()

            self.logger.info(f"Deleted {deleted} old events")
            return deleted

        except Exception as e:
            self.logger.error(f"Failed to cleanup events: {e}")
            return 0

    def get_statistics(self, hours: int = 24) -> Dict:
        """
        Get statistics about events in time window.

        Args:
            hours: Time window to analyze

        Returns:
            Dictionary with statistics
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cutoff = (_utcnow() - timedelta(hours=hours)).isoformat()

            # Total events
            cursor.execute(
                "SELECT COUNT(*) FROM cluster_events WHERE timestamp > ?",
                (cutoff,),
            )
            total_events = cursor.fetchone()[0]

            # Events by type
            cursor.execute(
                """
                SELECT event_type, COUNT(*) as count
                FROM cluster_events
                WHERE timestamp > ?
                GROUP BY event_type
                ORDER BY count DESC
                """,
                (cutoff,),
            )
            events_by_type = {row[0]: row[1] for row in cursor.fetchall()}

            # Events by severity
            cursor.execute(
                """
                SELECT severity, COUNT(*) as count
                FROM cluster_events
                WHERE timestamp > ?
                GROUP BY severity
                """,
                (cutoff,),
            )
            events_by_severity = {row[0]: row[1] for row in cursor.fetchall()}

            # Top nodes
            cursor.execute(
                """
                SELECT source_node_id, COUNT(*) as count
                FROM cluster_events
                WHERE timestamp > ? AND source_node_id != ''
                GROUP BY source_node_id
                ORDER BY count DESC
                LIMIT 10
                """,
                (cutoff,),
            )
            top_nodes = {row[0]: row[1] for row in cursor.fetchall()}

            conn.close()

            return {
                "time_window_hours": hours,
                "total_events": total_events,
                "events_by_type": events_by_type,
                "events_by_severity": events_by_severity,
                "top_nodes": top_nodes,
            }

        except Exception as e:
            self.logger.error(f"Failed to get statistics: {e}")
            return {}


# Global instance
_event_bus: Optional[DistributedEventBus] = None


def get_event_bus() -> DistributedEventBus:
    """Get or create the event bus"""
    global _event_bus
    if _event_bus is None:
        _event_bus = DistributedEventBus()
    return _event_bus
