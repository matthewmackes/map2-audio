"""
Database models and schema for LCD events persistence.
Stores events in SQLite for historical access and analytics.
"""

from sqlalchemy import Column, String, DateTime, Integer, JSON, Index, select, delete
from app.database import Base
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
from typing import List, Optional

class LCDEventRecord(Base):
    """
    Persisted LCD event record in database.
    
    Stores all event information for historical queries,
    analytics, and replay.
    """
    __tablename__ = 'lcd_events'
    
    # Primary key
    event_id = Column(String(36), primary_key=True, index=True)
    
    # Timing
    timestamp = Column(DateTime, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Source & routing
    source_node = Column(String(50), index=True, nullable=False)
    event_type = Column(String(20), index=True, nullable=False)
    severity = Column(String(20), index=True, nullable=False)
    
    # Content
    title = Column(String(100), nullable=False)
    message = Column(String(500), nullable=False)
    icon = Column(String(10), nullable=False)
    
    # Display properties
    color = Column(String(20), nullable=False)
    sound = Column(Integer, nullable=False, default=0)  # boolean
    dismiss_auto = Column(Integer, nullable=False, default=1)  # boolean
    
    # Routing
    broadcast = Column(Integer, nullable=False, default=1)  # boolean
    target_nodes = Column(String(500), nullable=False, default='')  # comma-separated
    ttl = Column(Integer, nullable=False, default=300)
    
    # Context data
    context = Column(JSON, nullable=False, default={})
    
    # Indexing for common queries
    __table_args__ = (
        Index('ix_timestamp_source', 'timestamp', 'source_node'),
        Index('ix_timestamp_severity', 'timestamp', 'severity'),
        Index('ix_timestamp_type', 'timestamp', 'event_type'),
    )
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'event_id': self.event_id,
            'timestamp': self.timestamp.isoformat(),
            'source_node': self.source_node,
            'event_type': self.event_type,
            'severity': self.severity,
            'title': self.title,
            'message': self.message,
            'icon': self.icon,
            'color': self.color,
            'sound': bool(self.sound),
            'dismiss_auto': bool(self.dismiss_auto),
            'broadcast': bool(self.broadcast),
            'target_nodes': self.target_nodes.split(',') if self.target_nodes else [],
            'ttl': self.ttl,
            'context': self.context
        }


class LCDEventRepository:
    """
    Data access layer for LCD events.
    Handles all database operations for event persistence.
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def save_event(self, event_dict: dict) -> bool:
        """Save a new event to database"""
        try:
            record = LCDEventRecord(
                event_id=event_dict['event_id'],
                timestamp=datetime.fromisoformat(event_dict['timestamp']),
                source_node=event_dict['source_node'],
                event_type=event_dict['event_type'],
                severity=event_dict['severity'],
                title=event_dict['title'],
                message=event_dict['message'],
                icon=event_dict['icon'],
                color=event_dict.get('color', 'white'),
                sound=int(event_dict.get('sound', False)),
                dismiss_auto=int(event_dict.get('dismiss_auto', True)),
                broadcast=int(event_dict.get('broadcast', True)),
                target_nodes=','.join(event_dict.get('target_nodes', [])),
                ttl=event_dict.get('ttl', 300),
                context=event_dict.get('context', {})
            )
            
            self.session.add(record)
            await self.session.commit()
            return True
        except Exception as e:
            await self.session.rollback()
            raise e

    async def save_events(self, events: List[dict]) -> int:
        """Save a batch of events to database"""
        if not events:
            return 0

        try:
            records = [
                LCDEventRecord(
                    event_id=event['event_id'],
                    timestamp=datetime.fromisoformat(event['timestamp']),
                    source_node=event['source_node'],
                    event_type=event['event_type'],
                    severity=event['severity'],
                    title=event['title'],
                    message=event['message'],
                    icon=event['icon'],
                    color=event.get('color', 'white'),
                    sound=int(event.get('sound', False)),
                    dismiss_auto=int(event.get('dismiss_auto', True)),
                    broadcast=int(event.get('broadcast', True)),
                    target_nodes=','.join(event.get('target_nodes', [])),
                    ttl=event.get('ttl', 300),
                    context=event.get('context', {})
                )
                for event in events
            ]

            self.session.add_all(records)
            await self.session.commit()
            return len(records)
        except Exception as e:
            await self.session.rollback()
            raise e
    
    async def get_event(self, event_id: str) -> Optional[dict]:
        """Get single event by ID"""
        result = await self.session.execute(
            select(LCDEventRecord).where(LCDEventRecord.event_id == event_id)
        )
        record = result.scalar_one_or_none()
        return record.to_dict() if record else None
    
    async def get_recent_events(
        self, 
        limit: int = 100,
        hours: int = 24,
        source_node: Optional[str] = None,
        event_type: Optional[str] = None,
        severity: Optional[str] = None
    ) -> List[dict]:
        """Get recent events with optional filtering"""
        since = datetime.utcnow() - timedelta(hours=hours)
        stmt = select(LCDEventRecord).where(LCDEventRecord.timestamp >= since)
        
        # Apply optional filters
        if source_node:
            stmt = stmt.where(LCDEventRecord.source_node == source_node)
        if event_type:
            stmt = stmt.where(LCDEventRecord.event_type == event_type)
        if severity:
            stmt = stmt.where(LCDEventRecord.severity == severity)
        
        stmt = stmt.order_by(LCDEventRecord.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        records = result.scalars().all()
        return [r.to_dict() for r in records]
    
    async def get_events_by_node(
        self, 
        source_node: str, 
        limit: int = 100,
        hours: int = 24
    ) -> List[dict]:
        """Get all events from specific node"""
        return await self.get_recent_events(
            limit=limit,
            hours=hours,
            source_node=source_node
        )
    
    async def get_critical_events(
        self, 
        limit: int = 50,
        hours: int = 24
    ) -> List[dict]:
        """Get critical severity events"""
        return await self.get_recent_events(
            limit=limit,
            hours=hours,
            severity='critical'
        )
    
    async def delete_old_events(self, hours_to_keep: int = 24) -> int:
        """Delete events older than specified hours"""
        cutoff = datetime.utcnow() - timedelta(hours=hours_to_keep)
        stmt = delete(LCDEventRecord).where(LCDEventRecord.timestamp < cutoff)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount or 0
    
    async def get_event_statistics(self, hours: int = 24) -> dict:
        """Get event statistics for dashboard"""
        since = datetime.utcnow() - timedelta(hours=hours)
        stmt = select(LCDEventRecord).where(LCDEventRecord.timestamp >= since)
        result = await self.session.execute(stmt)
        records = result.scalars().all()
        
        # Count by type
        by_type = {}
        by_severity = {}
        by_node = {}
        
        for record in records:
            by_type[record.event_type] = by_type.get(record.event_type, 0) + 1
            by_severity[record.severity] = by_severity.get(record.severity, 0) + 1
            by_node[record.source_node] = by_node.get(record.source_node, 0) + 1
        
        return {
            'total_events': len(records),
            'by_type': by_type,
            'by_severity': by_severity,
            'by_node': by_node,
            'unique_nodes': len(by_node),
            'period_hours': hours
        }
    
    async def cleanup_expired_events(self, max_age_hours: int = 24) -> int:
        """Remove events older than max age"""
        return await self.delete_old_events(max_age_hours)
