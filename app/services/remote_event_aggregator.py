"""
Remote Event Aggregator

Collects and manages events received from remote nodes.
Maintains per-node event history and provides filtered access.
"""

import logging
from typing import Dict, List, Deque
from collections import deque

from app.models.lcd_event import LCDEvent, EventType, EventSeverity

logger = logging.getLogger(__name__)


class RemoteEventAggregator:
    """
    Aggregates events from remote nodes.
    
    Stores events per-node and provides filtered access to
    the full cluster event stream.
    """
    
    def __init__(self):
        # Per-node event history: {node_id: Deque[LCDEvent]}
        self.remote_events: Dict[str, Deque[LCDEvent]] = {}
        
        # All remote events (combined)
        self.all_remote_events: Deque[LCDEvent] = deque(maxlen=500)
        
        # Listeners for new remote events
        self.listeners: List[callable] = []
    
    async def receive_remote_event(self, event: LCDEvent):
        """
        Receive and store event from remote node.
        
        Args:
            event: LCDEvent from remote node
        """
        # Create node history if needed
        if event.source_node not in self.remote_events:
            self.remote_events[event.source_node] = deque(maxlen=50)
        
        # Store per-node
        self.remote_events[event.source_node].append(event)
        
        # Store in combined history
        self.all_remote_events.append(event)
        
        # Notify listeners
        for listener in self.listeners:
            try:
                await listener(event)
            except Exception as e:
                logger.error(f"Listener error: {e}")
        
        logger.debug(f"Aggregated remote event from {event.source_node}: {event.title}")
    
    def subscribe(self, listener: callable):
        """Subscribe to new remote events"""
        self.listeners.append(listener)
    
    def unsubscribe(self, listener: callable):
        """Unsubscribe from remote events"""
        if listener in self.listeners:
            self.listeners.remove(listener)
    
    def get_all_remote_events(self, limit: int = 100) -> List[LCDEvent]:
        """Get all remote events sorted by timestamp"""
        events = sorted(
            self.all_remote_events,
            key=lambda e: e.timestamp,
            reverse=True
        )
        return events[:limit]
    
    def get_events_by_node(self, node_id: str, limit: int = 50) -> List[LCDEvent]:
        """Get events from specific remote node"""
        if node_id not in self.remote_events:
            return []
        
        events = list(self.remote_events[node_id])
        return events[-limit:] if len(events) > limit else events
    
    def get_events_by_type(self, event_type: EventType, limit: int = 100) -> List[LCDEvent]:
        """Get remote events of specific type"""
        filtered = [e for e in self.all_remote_events if e.event_type == event_type]
        filtered_sorted = sorted(filtered, key=lambda e: e.timestamp, reverse=True)
        return filtered_sorted[:limit]
    
    def get_events_by_severity(self, severity: EventSeverity, limit: int = 100) -> List[LCDEvent]:
        """Get remote events of specific severity"""
        filtered = [e for e in self.all_remote_events if e.severity == severity]
        filtered_sorted = sorted(filtered, key=lambda e: e.timestamp, reverse=True)
        return filtered_sorted[:limit]
    
    def get_critical_alerts(self, limit: int = 20) -> List[LCDEvent]:
        """Get recent critical alerts from all nodes"""
        return self.get_events_by_severity(EventSeverity.CRITICAL, limit)
    
    def get_active_nodes(self) -> List[str]:
        """Get list of nodes that have sent events"""
        return list(self.remote_events.keys())
    
    def get_event_count_by_node(self) -> Dict[str, int]:
        """Get event counts per node"""
        return {
            node_id: len(events)
            for node_id, events in self.remote_events.items()
        }
    
    def clear_node_events(self, node_id: str):
        """Clear events from specific node"""
        if node_id in self.remote_events:
            self.remote_events[node_id].clear()
            logger.info(f"Cleared events for node {node_id}")
    
    def clear_all_events(self):
        """Clear all remote events"""
        self.remote_events.clear()
        self.all_remote_events.clear()
        logger.info("Cleared all remote events")
