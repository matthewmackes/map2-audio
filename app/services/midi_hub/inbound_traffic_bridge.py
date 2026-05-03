"""Inbound MIDI traffic bridge for the midi:traffic WS topic.

Subscribes to MidiHub once at startup and mirrors every inbound MIDI message
into the traffic monitor + the midi:traffic WS topic, regardless of whether
any router rule matches the source port.

Why this exists: the MidiRouter only emits to midi:traffic when a routing
rule matches an inbound message (see MidiRouter._on_message in router.py).
That makes routing the gate for visibility, which breaks setup-time
workflows like the Sequencer "Connect a new keyboard" task — operators need
to see MIDI events arriving from a freshly-plugged-in keyboard *before*
they author any route.

This bridge runs in parallel to the router subscription (different
subscriber_id, different callback) and is unfiltered. Frontend consumers
that subscribe to midi:traffic still receive routed-outbound events from
the router AND raw-inbound events from this bridge; they distinguish via
the `direction` field on the payload (inbound | outbound).

Per-message overhead: one parse + one publish_message_threadsafe per
inbound message. The traffic monitor's ring buffer is bounded (50k records)
so memory is capped. The publisher's threadsafe path is non-blocking.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from app.services.event_publisher import event_publisher
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import MidiMessage
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.traffic_monitor import (
    MidiTrafficMonitor,
    MidiTrafficRecord,
    get_midi_traffic_monitor,
)

logger = logging.getLogger(__name__)

INBOUND_BRIDGE_SUBSCRIBER_ID = "midi_hub.inbound_traffic_bridge"


class InboundMidiTrafficBridge:
    """Singleton bridge that publishes every inbound MIDI message to the
    midi:traffic WS topic and records it in the traffic monitor."""

    def __init__(
        self,
        hub: MidiHub,
        traffic_monitor: Optional[MidiTrafficMonitor] = None,
    ) -> None:
        self._hub = hub
        self._traffic_monitor = traffic_monitor or get_midi_traffic_monitor()
        self._publisher = event_publisher
        self._installed = False
        self._lock = threading.Lock()

    def install(self) -> None:
        with self._lock:
            if self._installed:
                return
            self._hub.subscribe(INBOUND_BRIDGE_SUBSCRIBER_ID, self._on_message)
            self._installed = True

    def uninstall(self) -> None:
        with self._lock:
            if not self._installed:
                return
            self._hub.unsubscribe(INBOUND_BRIDGE_SUBSCRIBER_ID)
            self._installed = False

    def _on_message(self, message: MidiMessage) -> None:
        # Skip messages that the router originated (round-trip noise).
        if bool((message.metadata or {}).get("router_dispatch")):
            return
        try:
            parsed = MidiRouter._parse_message(message.data)
            payload = {
                "timestamp_ns": int(message.timestamp_ns),
                "source_port": str(message.source_port),
                "destination_port": str(message.destination_port or ""),
                "direction": "inbound",
                "route_id": None,
                "raw_hex": message.data.hex(),
                "decoded": parsed,
            }
            self._traffic_monitor.record(
                MidiTrafficRecord(
                    timestamp_ns=int(message.timestamp_ns),
                    source_port=str(message.source_port),
                    destination_port=str(message.destination_port or ""),
                    direction="inbound",
                    raw_hex=message.data.hex(),
                    decoded=parsed,
                    route_id=None,
                )
            )
            self._publish(payload)
        except Exception:
            # Inbound bridge must never raise into the MidiHub dispatcher
            # — that would corrupt the subscriber callback chain for every
            # other subscriber on this hub.
            logger.exception("InboundMidiTrafficBridge._on_message failed")

    def _publish(self, payload: dict) -> None:
        message = {"type": "midi:traffic", "data": payload}
        publish_threadsafe = getattr(self._publisher, "publish_message_threadsafe", None)
        if callable(publish_threadsafe):
            publish_threadsafe(message, topics=("midi:traffic",))


_bridge_singleton: Optional[InboundMidiTrafficBridge] = None
_bridge_singleton_lock = threading.Lock()


def get_inbound_midi_traffic_bridge(hub: Optional[MidiHub] = None) -> InboundMidiTrafficBridge:
    global _bridge_singleton
    if _bridge_singleton is None:
        with _bridge_singleton_lock:
            if _bridge_singleton is None:
                if hub is None:
                    from app.services.midi_hub.hub import get_midi_hub
                    hub = get_midi_hub()
                _bridge_singleton = InboundMidiTrafficBridge(hub)
    return _bridge_singleton


def install_inbound_midi_traffic_bridge() -> None:
    """Install the singleton bridge. Idempotent — safe to call at startup."""
    bridge = get_inbound_midi_traffic_bridge()
    bridge.install()
    logger.info("Inbound MIDI traffic bridge installed (subscriber_id=%s)", INBOUND_BRIDGE_SUBSCRIBER_ID)
