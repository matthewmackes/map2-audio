"""
Cluster Event Bus for Publishing/Subscribing to Cluster Events

Provides async event publishing and subscription for cluster-wide events.
"""

import asyncio
import logging
from enum import Enum
import threading
from typing import Callable, Dict, List, Any, Optional
from datetime import datetime

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """Cluster event types."""
    NODE_ONLINE = "node.online"
    NODE_OFFLINE = "node.offline"
    NODE_FAILOVER = "node.failover"
    FLOW_ASSIGNED = "flow.assigned"
    FLOW_UNASSIGNED = "flow.unassigned"
    CONFIG_UPDATED = "config.updated"
    AUDIO_PATH_CHANGED = "audio_path.changed"


class EventBus:
    """
    Simple async event bus for cluster events.
    """
    
    def __init__(self):
        self._subscribers: Dict[EventType, List[Callable]] = {}
        self._event_history: List[Dict[str, Any]] = []
        self._max_history = 1000
        self._lock = threading.RLock()
    
    async def subscribe(self, event_type: EventType, callback: Callable):
        """Subscribe to an event type."""
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            self._subscribers[event_type].append(callback)
        logger.debug(f"Subscribed to {event_type}: {callback.__name__}")
    
    async def unsubscribe(self, event_type: EventType, callback: Callable):
        """Unsubscribe from an event type."""
        with self._lock:
            if event_type in self._subscribers:
                try:
                    self._subscribers[event_type].remove(callback)
                    if not self._subscribers[event_type]:
                        del self._subscribers[event_type]
                    logger.debug(f"Unsubscribed from {event_type}: {callback.__name__}")
                except ValueError:
                    pass
    
    async def publish(self, event_type: EventType, data: Dict[str, Any]):
        """Publish an event to all subscribers."""
        # Add to history
        event = {
            'type': event_type,
            'data': data,
            'timestamp': utc_now().isoformat()
        }
        with self._lock:
            self._event_history.append(event)
            if len(self._event_history) > self._max_history:
                self._event_history = self._event_history[-self._max_history:]
            subscribers = list(self._subscribers.get(event_type, []))

        if subscribers:
            tasks = []
            for callback in subscribers:
                task = asyncio.create_task(self._safe_callback(callback, data))
                tasks.append(task)
            await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _safe_callback(self, callback: Callable, data: Dict[str, Any]):
        """Call a subscriber callback safely."""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(data)
            else:
                callback(data)
        except Exception as e:
            logger.error(f"Error in event callback {callback.__name__}: {e}", exc_info=True)
    
    def get_history(self, event_type: Optional[EventType] = None, limit: int = 100) -> List[Dict]:
        """Get event history."""
        with self._lock:
            history = list(self._event_history)

        if event_type:
            history = [e for e in history if e['type'] == event_type]

        return history[-limit:]


# Singleton instance
_event_bus = None
_event_bus_lock = threading.Lock()


def get_event_bus() -> EventBus:
    """Get or create the singleton event bus instance."""
    global _event_bus
    if _event_bus is None:
        with _event_bus_lock:
            if _event_bus is None:
                _event_bus = EventBus()
    return _event_bus
