"""
Database Event Producer

Emits canonical PlatformEvents targeted at the LCD surface for database
maintenance and health transitions.
"""

from __future__ import annotations

import logging

from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity

logger = logging.getLogger(__name__)


class DatabaseEventProducer:
    """Produces database-related LCD PlatformEvents."""

    def __init__(self, event_bus: PlatformEventBus, *, node_label: str):
        self.event_bus = event_bus
        self.node_label = node_label

    async def start(self):
        logger.info("Starting Database Event Producer")

    async def stop(self):
        logger.info("Stopping Database Event Producer")

    async def _emit(
        self,
        *,
        event_type: str,
        severity: Severity,
        title: str,
        message: str,
        color: str | None = None,
        sound: bool | None = None,
        dismiss_auto: bool | None = None,
        context: dict | None = None,
    ) -> None:
        await self.event_bus.emit(
            make_lcd_surface_event(
                event_type=event_type,
                severity=severity,
                source_node=self.node_label,
                source_service="database_event_producer",
                title=title,
                message=message,
                color=color,
                sound=sound,
                dismiss_auto=dismiss_auto,
                context=context,
            )
        )

    async def on_pool_warning(self, available: int, max_size: int):
        usage = (max_size - available) / max_size * 100
        if available == 0:
            severity = Severity.CRITICAL
            title = "Database Pool Exhausted"
        else:
            severity = Severity.WARNING
            title = "Database Pool Low"

        await self._emit(
            event_type="system",
            severity=severity,
            title=title,
            message=f"DB pool: {available}/{max_size} available ({usage:.0f}% used)",
            color="red" if severity == Severity.CRITICAL else "yellow",
            context={"available": available, "max_size": max_size, "usage_percent": usage},
        )
        logger.warning("Database pool warning: %s/%s", available, max_size)

    async def on_slow_query(self, query: str, duration_ms: float, threshold_ms: float):
        await self._emit(
            event_type="system",
            severity=Severity.WARNING,
            title="Slow Database Query",
            message=f"{duration_ms:.0f}ms (threshold: {threshold_ms:.0f}ms)",
            color="yellow",
            context={
                "duration_ms": duration_ms,
                "threshold_ms": threshold_ms,
                "query_type": query.split()[0] if query else "UNKNOWN",
            },
        )
        logger.warning("Slow query: %.0fms > %.0fms", duration_ms, threshold_ms)

    async def on_backup_started(self, database: str, size_mb: float):
        await self._emit(
            event_type="system",
            severity=Severity.INFO,
            title="Database Backup Started",
            message=f"{database} ({size_mb:.1f}MB)",
            color="cyan",
            context={"database": database, "size_mb": size_mb},
        )
        logger.info("Database backup started: %s", database)

    async def on_backup_completed(self, database: str, duration_seconds: float, size_mb: float):
        await self._emit(
            event_type="system",
            severity=Severity.INFO,
            title="Database Backup Complete",
            message=f"{database} in {duration_seconds:.0f}s ({size_mb:.1f}MB)",
            color="green",
            context={
                "database": database,
                "duration_seconds": duration_seconds,
                "size_mb": size_mb,
            },
        )
        logger.info("Database backup completed: %s", database)

    async def on_backup_failed(self, database: str, error: str):
        await self._emit(
            event_type="alert",
            severity=Severity.ERROR,
            title="Database Backup Failed",
            message=f"{database}: {error[:60]}",
            color="red",
            dismiss_auto=False,
            context={"database": database, "error": error},
        )
        logger.error("Database backup failed: %s - %s", database, error)

    async def on_maintenance_started(self, maintenance_type: str):
        await self._emit(
            event_type="system",
            severity=Severity.INFO,
            title=f"Database Maintenance: {maintenance_type}",
            message="Running optimization...",
            color="cyan",
            context={"maintenance_type": maintenance_type},
        )
        logger.info("Database maintenance started: %s", maintenance_type)

    async def on_maintenance_completed(self, maintenance_type: str, duration_seconds: float):
        await self._emit(
            event_type="system",
            severity=Severity.INFO,
            title=f"Database {maintenance_type} Complete",
            message=f"Completed in {duration_seconds:.0f}s",
            color="green",
            context={
                "maintenance_type": maintenance_type,
                "duration_seconds": duration_seconds,
            },
        )
        logger.info("Database %s completed in %.0fs", maintenance_type, duration_seconds)

    async def on_corruption_detected(self, database: str, details: str):
        await self._emit(
            event_type="alert",
            severity=Severity.CRITICAL,
            title="Database Corruption Detected",
            message=f"{database}: {details[:60]}",
            color="red",
            sound=True,
            dismiss_auto=False,
            context={"database": database, "details": details},
        )
        logger.critical("Database corruption detected: %s", database)
