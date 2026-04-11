"""
LCD Event Bus

Local event publish/subscribe system for managing LCD events
on a single node. Events can be published locally and will be
distributed to local subscribers and remote nodes.
"""

import asyncio
import logging
from typing import Callable, List, Deque
from collections import deque
import uuid

from app.lcd_models.lcd_event import LCDEvent, EventType, EventSeverity
from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class LCDEventBus:
    """
    Local event bus for LCD events.
    
    Handles:
    - Publishing events locally
    - Notifying subscribers (LCD display, TUI, Web UI)
    - Broadcasting to remote nodes (via router)
    - Event history management
    """
    
    def __init__(self, node_id: str, node_label: str):
        self.node_id = node_id
        self.node_label = node_label  # AUDIO-NODE-<ID4> or CONTROL-NODE-<ID4>
        
        # Local subscribers
        self.subscribers: List[Callable] = []
        
        # Event history (last 100 events)
        self.event_history: Deque[LCDEvent] = deque(maxlen=100)
        
        # Remote broadcast handler (set by router)
        self.remote_broadcast_handler: Callable = None
        
        # Event queue for processing
        self.event_queue: asyncio.Queue = asyncio.Queue()
        
        # Background task
        self._processor_task = None
        
    async def start(self):
        """Start event processing"""
        logger.info(f"Starting LCD Event Bus for {self.node_label}")
        self._processor_task = asyncio.create_task(self._process_events())
        
    async def stop(self):
        """Stop event processing"""
        logger.info(f"Stopping LCD Event Bus for {self.node_label}")
        if self._processor_task:
            self._processor_task.cancel()
            try:
                await self._processor_task
            except asyncio.CancelledError:
                pass
    
    async def publish(self, event: LCDEvent):
        """
        Publish an event locally and optionally to remote nodes.
        
        Args:
            event: LCDEvent to publish
        """
        # Set source node if not already set
        if not event.source_node:
            event.source_node = self.node_label
            
        # Generate event ID if needed
        if not event.event_id:
            event.event_id = str(uuid.uuid4())
            
        # Add to queue for processing
        await self.event_queue.put(event)
        
        logger.debug(f"Published event: {event.event_id} ({event.title})")
    
    async def _process_events(self):
        """Background task to process events"""
        while True:
            try:
                event = await self.event_queue.get()
                
                # Store in history
                self.event_history.append(event)
                
                # Notify local subscribers
                for subscriber in self.subscribers:
                    try:
                        await subscriber(event)
                    except Exception as e:
                        logger.error(f"Subscriber error: {e}")
                
                # Broadcast to remote nodes if requested
                if event.broadcast and self.remote_broadcast_handler:
                    try:
                        await self.remote_broadcast_handler(event)
                    except Exception as e:
                        logger.error(f"Remote broadcast error: {e}")
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Event processing error: {e}")
    
    def subscribe(self, handler: Callable):
        """
        Subscribe to all events.
        
        Args:
            handler: Async function that receives LCDEvent
        """
        self.subscribers.append(handler)
        logger.debug(f"New subscriber added (total: {len(self.subscribers)})")
    
    def unsubscribe(self, handler: Callable):
        """Unsubscribe from events"""
        if handler in self.subscribers:
            self.subscribers.remove(handler)
            logger.debug(f"Subscriber removed (total: {len(self.subscribers)})")
    
    def set_remote_broadcast_handler(self, handler: Callable):
        """Set handler for broadcasting events to remote nodes"""
        self.remote_broadcast_handler = handler
        logger.info("Remote broadcast handler registered")
    
    def get_recent_events(self, limit: int = 50) -> List[LCDEvent]:
        """Get recent events from history"""
        events = list(self.event_history)
        return events[-limit:] if len(events) > limit else events
    
    def get_events_by_type(self, event_type: EventType, limit: int = 50) -> List[LCDEvent]:
        """Get recent events of specific type"""
        filtered = [e for e in self.event_history if e.event_type == event_type]
        return filtered[-limit:] if len(filtered) > limit else filtered
    
    def get_events_by_severity(self, severity: EventSeverity, limit: int = 50) -> List[LCDEvent]:
        """Get recent events of specific severity"""
        filtered = [e for e in self.event_history if e.severity == severity]
        return filtered[-limit:] if len(filtered) > limit else filtered
    
    async def clear_expired_events(self):
        """Remove expired events from history"""
        original_count = len(self.event_history)
        
        # Filter out expired events
        self.event_history = deque(
            [e for e in self.event_history if not e.is_expired()],
            maxlen=100
        )
        
        removed = original_count - len(self.event_history)
        if removed > 0:
            logger.debug(f"Cleared {removed} expired events")


# Example event creators for common scenarios
async def create_audio_event(
    event_bus: LCDEventBus,
    title: str,
    message: str,
    severity: EventSeverity = EventSeverity.INFO,
    **kwargs
):
    """Helper to create and publish an audio event"""
    event = LCDEvent(
        event_id=str(uuid.uuid4()),
        timestamp=utc_now(),
        source_node=event_bus.node_label,
        event_type=EventType.AUDIO,
        severity=severity,
        title=title,
        message=message,
        icon="🎵",
        **kwargs
    )
    await event_bus.publish(event)


async def create_system_event(
    event_bus: LCDEventBus,
    title: str,
    message: str,
    severity: EventSeverity = EventSeverity.INFO,
    **kwargs
):
    """Helper to create and publish a system event"""
    event = LCDEvent(
        event_id=str(uuid.uuid4()),
        timestamp=utc_now(),
        source_node=event_bus.node_label,
        event_type=EventType.SYSTEM,
        severity=severity,
        title=title,
        message=message,
        icon="⚙️",
        **kwargs
    )
    await event_bus.publish(event)


async def create_alert_event(
    event_bus: LCDEventBus,
    title: str,
    message: str,
    severity: EventSeverity = EventSeverity.CRITICAL,
    **kwargs
):
    """Helper to create and publish an alert event"""
    event = LCDEvent(
        event_id=str(uuid.uuid4()),
        timestamp=utc_now(),
        source_node=event_bus.node_label,
        event_type=EventType.ALERT,
        severity=severity,
        title=title,
        message=message,
        icon="❌" if severity == EventSeverity.CRITICAL else "⚠️",
        color="red" if severity == EventSeverity.CRITICAL else "yellow",
        sound=True,
        dismiss_auto=False,
        **kwargs
    )
    await event_bus.publish(event)
