"""
Event Publisher Service
Centralized event publishing for real-time WebSocket updates.
"""

import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Iterable, Optional, Protocol

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """WebSocket event types for MAP2 real-time updates."""

    # Chain events
    CHAIN_CREATED = "chain_created"
    CHAIN_DELETED = "chain_deleted"
    CHAIN_RENAMED = "chain_renamed"
    CHAIN_ACTIVATED = "chain_activated"
    CHAIN_DEACTIVATED = "chain_deactivated"
    CHAIN_MORPHED = "chain_morphed"

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

    # AVB routing events
    AVB_ENDPOINTS_UPDATED = "avb_endpoints_updated"
    AVB_CONNECTIONS_UPDATED = "avb_connections_updated"
    AVB_CONNECTION_STATE_CHANGED = "avb_connection_state_changed"
    AVB_STREAMS_UPDATED = "avb_streams_updated"
    AVB_PTP_UPDATED = "avb_ptp_updated"
    AVB_AVDECC_ENTITIES_UPDATED = "avb_avdecc_entities_updated"

    # Effects loop events
    EFFECTS_LOOP_STATE = "effects_loop_state"
    EFFECTS_LOOP_METRICS = "effects_loop_metrics"
    EFFECTS_LOOP_CALIBRATION_PROGRESS = "effects_loop_calibration_progress"

    # System events
    SYSTEM_STATUS = "system_status"
    AUDIO_ENGINE_STATUS = "audio_engine_status"


class RealtimeMessagePublisher(Protocol):
    """Thin publish abstraction for backend services that fan out realtime events."""

    async def publish_message(self, message: Dict[str, Any], *, topics: Iterable[str]) -> None:
        """Broadcast a prebuilt realtime payload to one or more topics."""


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
        if ws_manager is None:
            logger.info("EventPublisher disconnected from WebSocket manager")
        else:
            logger.info("EventPublisher connected to WebSocket manager")

    async def publish_message(self, message: Dict[str, Any], *, topics: Iterable[str]) -> None:
        """Broadcast a prebuilt message payload to one or more websocket topics."""
        if not self._ws_manager:
            logger.debug("Cannot publish realtime message: WebSocket manager not set")
            return

        delivered_topics = set()
        for raw_topic in topics:
            topic = str(raw_topic or "").strip()
            if not topic or topic in delivered_topics:
                continue
            delivered_topics.add(topic)
            try:
                await self._ws_manager.broadcast_json(dict(message), topic=topic)
                logger.debug("Published realtime message to topic '%s'", topic)
            except Exception as exc:
                logger.error("Error publishing realtime message to topic '%s': %s", topic, exc)

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

        await self.publish_message(message, topics=(topic,))


# Global singleton instance
event_publisher = EventPublisher()
