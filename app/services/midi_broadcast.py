"""
MIDI Broadcast Service
Real-time MIDI event broadcasting via WebSocket for the MAP2 Audio Platform.

Events:
- midi_cc: CC messages received
- midi_note: Note on/off messages
- midi_program_change: Program change (chain switching)
- midi_learn_started: Learn mode activated
- midi_learn_completed: Learn mode captured CC
- midi_mapping_triggered: CC mapping activated parameter
- midi_command_triggered: Command (chain switch, etc.) executed
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Callable
from queue import Queue, Empty, Full
import threading

from app.services.websocket_manager import ws_manager
from app.services.juce_engine_service import get_audio_engine

logger = logging.getLogger(__name__)

try:
    from app.services.midi_hub.hub import get_midi_hub
    from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
    MIDI_HUB_AVAILABLE = True
except Exception:  # pragma: no cover - optional integration
    MidiMessage = None  # type: ignore[assignment]
    VirtualMidiPort = None  # type: ignore[assignment]
    MIDI_HUB_AVAILABLE = False

try:
    from app.services.cluster.distributed_event_bus import EventType, get_event_bus as get_distributed_event_bus
    MIDI_CLUSTER_EVENTS_AVAILABLE = True
except Exception:  # pragma: no cover - optional integration
    EventType = None  # type: ignore[assignment]
    get_distributed_event_bus = None  # type: ignore[assignment]
    MIDI_CLUSTER_EVENTS_AVAILABLE = False


class MidiBroadcastService:
    """
    Service that receives MIDI events from the C++ engine
    and broadcasts them to WebSocket subscribers.

    Uses a thread-safe queue for callback-to-asyncio bridging.
    """

    MAX_EVENT_QUEUE = 1024

    def __init__(self, queue_maxsize: int = MAX_EVENT_QUEUE):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._event_queue: Queue = Queue(maxsize=queue_maxsize)
        self._queue_maxsize = queue_maxsize
        self._dropped_events = 0
        self._callbacks_registered = False
        self._hub = None
        self._hub_subscriber_id = f"midi_broadcast:{id(self)}"
        self._hub_port_id = "consumer:midi_broadcast"
        self._cluster_event_bridge_registered = False

        # Topic names
        self.TOPIC_MIDI = "midi"
        self.TOPIC_MIDI_ACTIVITY = "midi_activity"
        self.TOPIC_MIDI_LEARN = "midi_learn"
        self.TOPIC_MIDI_CLUSTER = "midi_cluster"
        self.TOPIC_MIDI_CLUSTER_NODES = "midi_cluster_nodes"
        self.TOPIC_MIDI_CLUSTER_CONNECTIONS = "midi_cluster_connections"
        self.TOPIC_MIDI_CLUSTER_CLOCK = "midi_cluster_clock"

    async def start(self):
        """Start the MIDI broadcast service"""
        if self._running:
            logger.warning("MIDI broadcast already running")
            return

        self._running = True
        self._register_hub_bridge()
        self._register_cluster_event_bridge()
        self._register_callbacks()

        # Start the event processing task
        self._task = asyncio.create_task(self._process_events())

        logger.info("MIDI broadcast service started")

    async def stop(self):
        """Stop the MIDI broadcast service"""
        self._running = False
        if self._hub is not None:
            try:
                self._hub.unsubscribe(self._hub_subscriber_id)
            except Exception:
                pass

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._task = None
        logger.info("MIDI broadcast service stopped")

    def _register_hub_bridge(self) -> None:
        """Attach to MidiHub traffic so all routed MIDI is broadcastable."""
        if not MIDI_HUB_AVAILABLE:
            return
        try:
            hub = get_midi_hub()
            if hub.resolve_port(self._hub_port_id) is None:
                hub.register_port(
                    VirtualMidiPort(
                        port_id=self._hub_port_id,
                        name="MIDI Broadcast Sink",
                        direction="input",
                    ),
                    open_now=False,
                )
            hub.subscribe(self._hub_subscriber_id, self._on_hub_message)
            self._hub = hub
        except Exception as exc:
            logger.debug("MidiBroadcastService hub bridge unavailable: %s", exc)

    def _on_hub_message(self, message: MidiMessage):
        """Capture routed MIDI traffic from MidiHub and publish to monitor topic."""
        if not self._running:
            return
        if message.source_port == self._hub_port_id:
            return
        payload = list(message.data or [])
        if not payload:
            return
        status = int(payload[0]) & 0xFF
        message_type = "system"
        if (status & 0xF0) == 0x80:
            message_type = "note_off"
        elif (status & 0xF0) == 0x90:
            message_type = "note_on"
        elif (status & 0xF0) == 0xB0:
            message_type = "control_change"
        elif (status & 0xF0) == 0xC0:
            message_type = "program_change"
        elif status == 0xF0:
            message_type = "sysex"
        self._queue_event(
            "midi_message",
            {
                "message_type": message_type,
                "raw_hex": " ".join(f"{int(byte) & 0xFF:02X}" for byte in payload),
                "channel": (status & 0x0F) + 1 if status < 0xF0 else None,
                "source_port": message.source_port,
                "destination_port": message.destination_port,
                "metadata": dict(message.metadata or {}),
            },
        )

    def _register_callbacks(self):
        """Register Python callbacks with the C++ MIDI handler"""
        if self._callbacks_registered:
            return

        try:
            service = get_audio_engine()
            if not service.is_running or not service._engine:
                logger.warning("Audio engine not running, MIDI callbacks not registered")
                return

            engine = service._engine

            # Register parameter callback (when CC triggers parameter change)
            engine.midi_set_parameter_callback(self._on_parameter_change)

            # Register command callback (chain switch, etc.)
            engine.midi_set_command_callback(self._on_command_triggered)

            # Register monitor callback (all MIDI messages)
            engine.midi_set_monitor_callback(self._on_midi_message)

            # Register learn complete callback
            engine.midi_set_learn_complete_callback(self._on_learn_complete)

            # Register chain switch callback
            engine.midi_set_chain_switch_callback(self._on_chain_switch)

            self._callbacks_registered = True
            logger.info("MIDI callbacks registered with C++ engine")

        except Exception as e:
            logger.error(f"Failed to register MIDI callbacks: {e}")

    def _queue_event(self, event_type: str, data: Dict[str, Any], *, topics: Optional[list[str]] = None):
        """Queue an event for async processing"""
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat(),
            "topics": list(topics or []),
        }
        try:
            self._event_queue.put_nowait(event)
        except Full:
            try:
                self._event_queue.get_nowait()
            except Empty:
                pass
            self._dropped_events += 1
            try:
                self._event_queue.put_nowait(event)
            except Full:
                self._dropped_events += 1
        if self._dropped_events and self._dropped_events % 100 == 0:
            logger.warning(
                "MIDI broadcast queue dropped %d events (maxsize=%d)",
                self._dropped_events,
                self._queue_maxsize,
            )

    def _register_cluster_event_bridge(self) -> None:
        if self._cluster_event_bridge_registered or not MIDI_CLUSTER_EVENTS_AVAILABLE:
            return
        try:
            event_bus = get_distributed_event_bus()
            for event_type in EventType:
                if event_type.name.startswith("MIDI_"):
                    event_bus.subscribe(event_type, self._on_cluster_event)
            self._cluster_event_bridge_registered = True
        except Exception as exc:
            logger.debug("MidiBroadcastService cluster event bridge unavailable: %s", exc)

    def _on_cluster_event(self, event: Any) -> None:
        if not self._running:
            return

        topic_payload = self._cluster_topic_payload(event)
        if topic_payload is None:
            return

        self._queue_event(
            topic_payload["type"],
            topic_payload["data"],
            topics=topic_payload["topics"],
        )

    def _cluster_topic_payload(self, event: Any) -> Optional[Dict[str, Any]]:
        event_type = getattr(getattr(event, "event_type", None), "value", None)
        if not event_type:
            return None

        topics = [self.TOPIC_MIDI_CLUSTER]
        ws_type = "midi_cluster_event"

        if event_type in {
            "midi.node.discovered",
            "midi.node.lost",
            "midi.port.discovered",
            "midi.port.lost",
        }:
            topics.append(self.TOPIC_MIDI_CLUSTER_NODES)
        elif event_type in {
            "midi.connection.requested",
            "midi.connection.established",
            "midi.connection.failed",
            "midi.connection.lost",
        }:
            topics.append(self.TOPIC_MIDI_CLUSTER_CONNECTIONS)
        elif event_type in {
            "midi.clock.master_elected",
            "midi.clock.drift_detected",
        }:
            topics.append(self.TOPIC_MIDI_CLUSTER_CLOCK)

        type_map = {
            "midi.node.discovered": "midi_cluster_node_online",
            "midi.node.lost": "midi_cluster_node_offline",
            "midi.port.discovered": "midi_cluster_port_discovered",
            "midi.port.lost": "midi_cluster_port_lost",
            "midi.connection.requested": "midi_cluster_connection_requested",
            "midi.connection.established": "midi_cluster_connection_established",
            "midi.connection.failed": "midi_cluster_connection_failed",
            "midi.connection.lost": "midi_cluster_connection_lost",
            "midi.clock.master_elected": "midi_cluster_clock_sync",
            "midi.clock.drift_detected": "midi_cluster_clock_drift",
            "midi.failover.triggered": "midi_cluster_failover",
            "midi.failover.completed": "midi_cluster_failover",
            "midi.profile.shared": "midi_cluster_profile_shared",
        }
        ws_type = type_map.get(event_type, ws_type)

        payload = {
            "event_type": event_type,
            "severity": getattr(getattr(event, "severity", None), "value", "info"),
            "source_node_id": getattr(event, "source_node_id", ""),
            "affected_nodes": list(getattr(event, "affected_nodes", []) or []),
            "message": getattr(event, "message", ""),
            "details": dict(getattr(event, "details", {}) or {}),
            "correlation_id": getattr(event, "correlation_id", ""),
        }
        return {
            "type": ws_type,
            "topics": topics,
            "data": payload,
        }

    def _on_midi_message(self, msg: Dict[str, Any]):
        """Callback for all MIDI messages (monitoring)"""
        self._queue_event("midi_message", msg)

    def _on_parameter_change(self, plugin_id: int, param_symbol: str, param_index: int, value: float):
        """Callback when CC mapping triggers parameter change"""
        self._queue_event("midi_mapping_triggered", {
            "plugin_id": plugin_id,
            "parameter_symbol": param_symbol,
            "parameter_index": param_index,
            "value": value
        })

    def _on_command_triggered(self, trigger: Dict[str, Any]):
        """Callback when a MIDI command is triggered"""
        self._queue_event("midi_command_triggered", trigger)

    def _on_learn_complete(self, channel: int, cc: int):
        """Callback when MIDI learn captures a CC"""
        self._queue_event("midi_learn_completed", {
            "channel": channel,
            "cc": cc
        })

    def _on_chain_switch(self, program_number: int, chain_id: int):
        """Callback when Program Change triggers chain switch"""
        self._queue_event("midi_chain_switch", {
            "program_number": program_number,
            "chain_id": chain_id
        })

    async def _process_events(self):
        """Process queued MIDI events and broadcast via WebSocket"""
        while self._running:
            try:
                # Process all pending events
                events_processed = 0
                while True:
                    try:
                        event = self._event_queue.get_nowait()
                        await self._broadcast_event(event)
                        events_processed += 1
                    except Empty:
                        break

                # Small sleep to prevent busy-waiting
                await asyncio.sleep(0.01)  # 10ms polling

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing MIDI events: {e}")
                await asyncio.sleep(0.1)

    async def _broadcast_event(self, event: Dict[str, Any]):
        """Broadcast a MIDI event to WebSocket subscribers"""
        event_type = event.get("type", "")
        data = event.get("data", {})
        timestamp = event.get("timestamp", datetime.now().isoformat())
        topics = [topic for topic in event.get("topics", []) if str(topic).strip()]

        # Determine topic based on event type
        if not topics:
            if event_type in ("midi_learn_started", "midi_learn_completed"):
                topics = [self.TOPIC_MIDI_LEARN]
            elif event_type == "midi_message":
                topics = [self.TOPIC_MIDI_ACTIVITY]
            else:
                topics = [self.TOPIC_MIDI]

        for topic in topics:
            subscribers = ws_manager.get_subscribers(topic)
            if not subscribers:
                continue
            message = {
                "type": event_type,
                "data": data,
                "timestamp": timestamp,
                "topic": topic,
            }
            await ws_manager.broadcast_json(message, topic)

    async def broadcast_learn_started(self, target: Dict[str, Any]):
        """Broadcast that MIDI learn mode has started"""
        message = {
            "type": "midi_learn_started",
            "data": target,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI_LEARN)
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_learn_stopped(self):
        """Broadcast that MIDI learn mode has stopped"""
        message = {
            "type": "midi_learn_stopped",
            "data": {},
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI_LEARN)
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_mapping_created(self, mapping: Dict[str, Any]):
        """Broadcast that a new MIDI mapping was created"""
        message = {
            "type": "midi_mapping_created",
            "data": mapping,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_mapping_updated(self, mapping: Dict[str, Any]):
        """Broadcast that a MIDI mapping was updated"""
        message = {
            "type": "midi_mapping_updated",
            "data": mapping,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_mapping_deleted(self, mapping_id: int):
        """Broadcast that a MIDI mapping was deleted"""
        message = {
            "type": "midi_mapping_deleted",
            "data": {"id": mapping_id},
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_command_created(self, command: Dict[str, Any]):
        """Broadcast that a new MIDI command was created"""
        message = {
            "type": "midi_command_created",
            "data": command,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_preset_loaded(self, preset: Dict[str, Any]):
        """Broadcast that a MIDI preset was loaded"""
        message = {
            "type": "midi_preset_loaded",
            "data": preset,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    async def broadcast_status_update(self, status: Dict[str, Any]):
        """Broadcast MIDI status update"""
        message = {
            "type": "midi_status_update",
            "data": status,
            "timestamp": datetime.now().isoformat()
        }
        await ws_manager.broadcast_json(message, self.TOPIC_MIDI)

    def get_stats(self) -> Dict[str, Any]:
        """Get queue/broadcast stats for diagnostics."""
        return {
            "callbacks_registered": self._callbacks_registered,
            "dropped_events": self._dropped_events,
            "queue_maxsize": self._queue_maxsize,
            "queued_events": self._event_queue.qsize(),
            "running": self._running,
        }


# Global instance
midi_broadcast = MidiBroadcastService()


async def start_midi_broadcast():
    """Start the MIDI broadcast service"""
    await midi_broadcast.start()


async def stop_midi_broadcast():
    """Stop the MIDI broadcast service"""
    await midi_broadcast.stop()


def get_midi_broadcast() -> MidiBroadcastService:
    """Get the MIDI broadcast service instance"""
    return midi_broadcast
