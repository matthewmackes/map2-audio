"""
Database Event Producer

Monitors database health and generates events for:
- Connection pool status
- Query performance
- Database backups
- Table maintenance
"""

import logging
from datetime import datetime
from typing import Optional

from app.services.lcd_event_bus import LCDEventBus, create_system_event
from app.models.lcd_event import EventType, EventSeverity

logger = logging.getLogger(__name__)


class DatabaseEventProducer:
    """
    Produces events related to database operations.
    
    Monitors:
    - Connection pool health
    - Query performance
    - Backup status
    - Database maintenance
    """
    
    def __init__(self, event_bus: LCDEventBus):
        self.event_bus = event_bus
    
    async def on_pool_warning(self, available: int, max_size: int):
        """Called when connection pool is low"""
        usage = (max_size - available) / max_size * 100
        
        if available == 0:
            severity = EventSeverity.CRITICAL
            title = "Database Pool Exhausted"
        else:
            severity = EventSeverity.WARNING
            title = "Database Pool Low"
        
        await create_system_event(
            self.event_bus,
            title=title,
            message=f"DB pool: {available}/{max_size} available ({usage:.0f}% used)",
            severity=severity,
            color="red" if severity == EventSeverity.CRITICAL else "yellow",
            context={
                'available': available,
                'max_size': max_size,
                'usage_percent': usage
            }
        )
        
        logger.warning(f"Database pool warning: {available}/{max_size}")
    
    async def on_slow_query(self, query: str, duration_ms: float, threshold_ms: float):
        """Called when query exceeds threshold"""
        await create_system_event(
            self.event_bus,
            title="Slow Database Query",
            message=f"{duration_ms:.0f}ms (threshold: {threshold_ms:.0f}ms)",
            severity=EventSeverity.WARNING,
            color="yellow",
            context={
                'duration_ms': duration_ms,
                'threshold_ms': threshold_ms,
                'query_type': query.split()[0] if query else 'UNKNOWN'
            }
        )
        
        logger.warning(f"Slow query: {duration_ms:.0f}ms > {threshold_ms:.0f}ms")
    
    async def on_backup_started(self, database: str, size_mb: float):
        """Called when database backup starts"""
        await create_system_event(
            self.event_bus,
            title="Database Backup Started",
            message=f"{database} ({size_mb:.1f}MB)",
            severity=EventSeverity.INFO,
            color="cyan",
            context={
                'database': database,
                'size_mb': size_mb
            }
        )
        
        logger.info(f"Database backup started: {database}")
    
    async def on_backup_completed(self, database: str, duration_seconds: float, size_mb: float):
        """Called when database backup completes"""
        await create_system_event(
            self.event_bus,
            title="Database Backup Complete",
            message=f"{database} in {duration_seconds:.0f}s ({size_mb:.1f}MB)",
            severity=EventSeverity.INFO,
            color="green",
            context={
                'database': database,
                'duration_seconds': duration_seconds,
                'size_mb': size_mb
            }
        )
        
        logger.info(f"Database backup completed: {database}")
    
    async def on_backup_failed(self, database: str, error: str):
        """Called when database backup fails"""
        await create_system_event(
            self.event_bus,
            title="Database Backup Failed",
            message=f"{database}: {error[:60]}",
            severity=EventSeverity.ERROR,
            color="red",
            context={
                'database': database,
                'error': error
            }
        )
        
        logger.error(f"Database backup failed: {database} - {error}")
    
    async def on_maintenance_started(self, maintenance_type: str):
        """Called when database maintenance starts"""
        await create_system_event(
            self.event_bus,
            title=f"Database Maintenance: {maintenance_type}",
            message="Running optimization...",
            severity=EventSeverity.INFO,
            color="cyan",
            context={'maintenance_type': maintenance_type}
        )
        
        logger.info(f"Database maintenance started: {maintenance_type}")
    
    async def on_maintenance_completed(self, maintenance_type: str, duration_seconds: float):
        """Called when database maintenance completes"""
        await create_system_event(
            self.event_bus,
            title=f"Database {maintenance_type} Complete",
            message=f"Completed in {duration_seconds:.0f}s",
            severity=EventSeverity.INFO,
            color="green",
            context={
                'maintenance_type': maintenance_type,
                'duration_seconds': duration_seconds
            }
        )
        
        logger.info(f"Database {maintenance_type} completed in {duration_seconds:.0f}s")
    
    async def on_corruption_detected(self, database: str, details: str):
        """Called when database corruption is detected"""
        await create_system_event(
            self.event_bus,
            title="Database Corruption Detected",
            message=f"{database}: {details[:60]}",
            severity=EventSeverity.CRITICAL,
            color="red",
            sound=True,
            context={
                'database': database,
                'details': details
            }
        )
        
        logger.critical(f"Database corruption detected: {database}")
