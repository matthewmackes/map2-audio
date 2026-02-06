"""
Event Publisher Service
Centralized event publishing for real-time WebSocket updates.
"""

import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """WebSocket event types for MAP2 real-time updates."""

    # Chain events
    CHAIN_CREATED = "chain_created"
    CHAIN_DELETED = "chain_deleted"
    CHAIN_RENAMED = "chain_renamed"
    CHAIN_ACTIVATED = "chain_activated"
    CHAIN_DEACTIVATED = "chain_deactivated"

    # Plugin events
    PLUGIN_ADDED = "plugin_added"
    PLUGIN_REMOVED = "plugin_removed"
    PLUGIN_BYPASSED = "plugin_bypassed"
    PLUGIN_PARAMETER_CHANGED = "plugin_parameter_changed"

    # Parameter events
    PARAM_CHANGED = "param_changed"
    PRESET_LOADED = "preset_loaded"

    # Automation events
    AUTOMATION_STARTED = "automation_started"
    AUTOMATION_STOPPED = "automation_stopped"
    AUTOMATION_TIME = "automation_time"
    AUTOMATION_LANE_ADDED = "automation_lane_added"
    AUTOMATION_LANE_DELETED = "automation_lane_deleted"

    # System events
    SYSTEM_STATUS = "system_status"
    AUDIO_ENGINE_STATUS = "audio_engine_status"


class EventPublisher:
    """
    Centralized event publishing service.

    Integrates with WebSocket manager to broadcast events to subscribed clients.
    """

    def __init__(self):
        self._ws_manager = None

    def set_websocket_manager(self, ws_manager):
        """Set the WebSocket manager instance."""
        self._ws_manager = ws_manager
        logger.info("EventPublisher connected to WebSocket manager")

    async def publish(
        self,
        topic: str,
        event_type: EventType,
        data: Dict[str, Any],
        exclude_client: Optional[str] = None
    ):
        """
        Publish event to all subscribers of a topic.

        Args:
            topic: Topic name (e.g., 'chain_updates', 'plugin_params')
            event_type: Type of event from EventType enum
            data: Event payload data
            exclude_client: Optional client_id to exclude from broadcast
        """
        if not self._ws_manager:
            logger.warning(f"Cannot publish event {event_type}: WebSocket manager not set")
            return

        message = {
            "type": event_type.value,
            "data": data,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }

        try:
            await self._ws_manager.broadcast_json(message, topic=topic)
            logger.debug(f"Published {event_type.value} to topic '{topic}'")
        except Exception as e:
            logger.error(f"Error publishing event {event_type}: {e}")


# Global singleton instance
event_publisher = EventPublisher()
