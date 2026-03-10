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

        # Topic names
        self.TOPIC_MIDI = "midi"
        self.TOPIC_MIDI_ACTIVITY = "midi_activity"
        self.TOPIC_MIDI_LEARN = "midi_learn"

    async def start(self):
        """Start the MIDI broadcast service"""
        if self._running:
            logger.warning("MIDI broadcast already running")
            return

        self._running = True
        self._register_hub_bridge()
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

    def _queue_event(self, event_type: str, data: Dict[str, Any]):
        """Queue an event for async processing"""
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now().isoformat()
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

        # Determine topic based on event type
        if event_type in ("midi_learn_started", "midi_learn_completed"):
            topic = self.TOPIC_MIDI_LEARN
        elif event_type == "midi_message":
            topic = self.TOPIC_MIDI_ACTIVITY
        else:
            topic = self.TOPIC_MIDI

        # Check for subscribers
        subscribers = ws_manager.get_subscribers(topic)
        if not subscribers:
            return

        # Build message
        message = {
            "type": event_type,
            "data": data,
            "timestamp": timestamp
        }

        # Broadcast
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
