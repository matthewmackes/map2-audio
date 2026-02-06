"""
Event Persistence Service

Handles asynchronous persistence of LCD events to database.
Implements batching and background cleanup.
"""

import asyncio
import logging
from typing import Optional
from datetime import datetime

from app.lcd_models.lcd_event import LCDEvent
from app.lcd_models.lcd_event_db import LCDEventRepository

logger = logging.getLogger(__name__)


class LCDEventPersistence:
    """
    Manages persistent storage of LCD events.
    
    Features:
    - Async event persistence
    - Batch writes for efficiency
    - Automatic cleanup of old events
    - Query interface for historical data
    """
    
    def __init__(self, session_factory):
        self.session_factory = session_factory
        
        # Batch writing
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.batch_size = 100
        self.batch_timeout = 10  # seconds
        
        # Background tasks
        self._writer_task = None
        self._cleanup_task = None
        
    async def start(self):
        """Start persistence services"""
        logger.info("Starting LCD Event Persistence")
        self._writer_task = asyncio.create_task(self._batch_write_loop())
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def stop(self):
        """Stop persistence services"""
        logger.info("Stopping LCD Event Persistence")
        
        # Cancel tasks
        if self._writer_task:
            self._writer_task.cancel()
        if self._cleanup_task:
            self._cleanup_task.cancel()
        
        # Flush remaining events
        await self._flush_batch()
    
    async def persist_event(self, event: LCDEvent):
        """
        Queue event for persistence.
        
        Events are batched and written asynchronously
        for efficiency.
        """
        await self.event_queue.put(event.to_dict())
    
    async def _batch_write_loop(self):
        """Background task to write events in batches"""
        batch = []
        timeout_handle = None
        
        try:
            while True:
                try:
                    # Wait for event with timeout
                    event_dict = await asyncio.wait_for(
                        self.event_queue.get(),
                        timeout=self.batch_timeout
                    )
                    batch.append(event_dict)
                    
                    # Write when batch is full
                    if len(batch) >= self.batch_size:
                        await self._write_batch(batch)
                        batch = []
                        
                except asyncio.TimeoutError:
                    # Timeout: write whatever we have
                    if batch:
                        await self._write_batch(batch)
                        batch = []
                        
        except asyncio.CancelledError:
            # Final flush
            if batch:
                await self._write_batch(batch)
    
    async def _write_batch(self, events: list):
        """Write batch of events to database"""
        try:
            async with self.session_factory() as session:
                repository = LCDEventRepository(session)
                count = await repository.save_events(events)
            logger.debug(f"Persisted {count} events to database")
            
        except Exception as e:
            logger.error(f"Error persisting events: {e}")
    
    async def _flush_batch(self):
        """Flush all remaining queued events"""
        batch = []
        
        while not self.event_queue.empty():
            try:
                batch.append(self.event_queue.get_nowait())
            except asyncio.QueueEmpty:
                break
        
        if batch:
            await self._write_batch(batch)
    
    async def _cleanup_loop(self):
        """Periodic cleanup of old events"""
        while True:
            try:
                await asyncio.sleep(3600)  # Every hour
                
                # Keep last 24 hours
                async with self.session_factory() as session:
                    repository = LCDEventRepository(session)
                    removed = await repository.cleanup_expired_events(24)
                if removed > 0:
                    logger.info(f"Cleaned up {removed} expired LCD events")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
    
    # Query interface
    async def get_recent_events(self, limit: int = 100, **filters):
        """Get recent events with optional filters"""
        async with self.session_factory() as session:
            repository = LCDEventRepository(session)
            return await repository.get_recent_events(limit=limit, **filters)
    
    async def get_events_by_node(self, source_node: str, limit: int = 100):
        """Get events from specific node"""
        async with self.session_factory() as session:
            repository = LCDEventRepository(session)
            return await repository.get_events_by_node(source_node, limit=limit)
    
    async def get_critical_events(self, limit: int = 50):
        """Get critical severity events"""
        async with self.session_factory() as session:
            repository = LCDEventRepository(session)
            return await repository.get_critical_events(limit=limit)
    
    async def get_statistics(self, hours: int = 24):
        """Get event statistics"""
        async with self.session_factory() as session:
            repository = LCDEventRepository(session)
            return await repository.get_event_statistics(hours=hours)


# Global persistence instance
_persistence_instance: Optional[LCDEventPersistence] = None


def get_lcd_persistence() -> Optional[LCDEventPersistence]:
    """Get the global LCD event persistence instance"""
    return _persistence_instance


def set_lcd_persistence(persistence: LCDEventPersistence):
    """Set the global LCD event persistence instance"""
    global _persistence_instance
    _persistence_instance = persistence
