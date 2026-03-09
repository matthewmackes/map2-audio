"""
MAP2 Native MIDI Hub core.
"""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from app.services.midi_hub.ports import (
    MidiMessage,
    MidiPort,
    MidiPortInfo,
    build_alsa_ports,
    discover_alsa_ports,
)
from app.services.midi_hub.ring_buffer import MidiRingBuffer


Subscriber = Callable[[MidiMessage], Any]


@dataclass
class MidiHubStats:
    running: bool
    port_count: int
    subscribed_consumers: int
    inbound_queue: int
    outbound_queue: int
    dropped_inbound: int
    dropped_outbound: int
    cycle_count: int
    last_cycle_ns: int


class MidiHub:
    """Centralized MIDI hub with dedicated I/O and hot-plug loops."""

    def __init__(
        self,
        *,
        poll_interval_s: float = 0.002,
        hotplug_interval_s: float = 1.5,
        auto_discover_alsa: bool = True,
    ):
        self._poll_interval_s = max(0.0005, float(poll_interval_s))
        self._hotplug_interval_s = max(0.25, float(hotplug_interval_s))
        self._auto_discover_alsa = bool(auto_discover_alsa)

        self._ports: Dict[str, MidiPort] = {}
        self._subscribers: Dict[str, Subscriber] = {}

        self._inbound = MidiRingBuffer[MidiMessage](8192, overwrite_on_full=False)
        self._outbound = MidiRingBuffer[MidiMessage](8192, overwrite_on_full=False)

        self._dropped_inbound = 0
        self._dropped_outbound = 0
        self._cycle_count = 0
        self._last_cycle_ns = 0

        self._running = False
        self._lock = threading.RLock()
        self._thread: Optional[threading.Thread] = None
        self._hotplug_thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()

        self._known_alsa_inputs: set[str] = set()
        self._known_alsa_outputs: set[str] = set()

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._stop_evt.clear()

            if self._auto_discover_alsa:
                self._seed_alsa_ports()

            for port in self._ports.values():
                if not port.is_open:
                    port.open()

            self._thread = threading.Thread(target=self._run_loop, name="midi_hub_io", daemon=True)
            self._thread.start()

            self._hotplug_thread = threading.Thread(target=self._run_hotplug_loop, name="midi_hub_hotplug", daemon=True)
            self._hotplug_thread.start()

            self._running = True

    def stop(self, *, join_timeout_s: float = 2.5) -> None:
        with self._lock:
            if not self._running:
                return
            self._stop_evt.set()

        if self._thread is not None:
            self._thread.join(timeout=join_timeout_s)
        if self._hotplug_thread is not None:
            self._hotplug_thread.join(timeout=join_timeout_s)

        with self._lock:
            for port in self._ports.values():
                port.close()
            self._running = False

    def register_port(self, port: MidiPort, *, open_now: bool = True) -> None:
        with self._lock:
            self._ports[port.port_id] = port
            if self._running and open_now and not port.is_open:
                port.open()

    def unregister_port(self, port_id: str) -> bool:
        with self._lock:
            port = self._ports.pop(port_id, None)
            if port is None:
                return False
        port.close()
        return True

    def list_ports(self) -> List[MidiPortInfo]:
        with self._lock:
            return [port.info() for port in self._ports.values()]

    def get_port(self, port_id: str) -> Optional[MidiPortInfo]:
        with self._lock:
            port = self._ports.get(port_id)
            return port.info() if port is not None else None

    def resolve_port(self, port_id: str) -> Optional[MidiPort]:
        with self._lock:
            return self._ports.get(port_id)

    def subscribe(self, subscriber_id: str, callback: Subscriber) -> None:
        with self._lock:
            self._subscribers[subscriber_id] = callback

    def unsubscribe(self, subscriber_id: str) -> bool:
        with self._lock:
            return self._subscribers.pop(subscriber_id, None) is not None

    def send(self, *, source_port: str, destination_port: str, data: bytes, metadata: Optional[Dict[str, Any]] = None) -> bool:
        msg = MidiMessage(
            data=bytes(data),
            timestamp_ns=time.time_ns(),
            source_port=source_port,
            destination_port=destination_port,
            metadata=dict(metadata or {}),
        )
        ok = self._outbound.push(msg)
        if not ok:
            self._dropped_outbound += 1
        return ok

    def inject(self, message: MidiMessage) -> bool:
        ok = self._inbound.push(message)
        if not ok:
            self._dropped_inbound += 1
        return ok

    def snapshot_alsa_ports(self) -> Dict[str, List[str]]:
        return discover_alsa_ports()

    def stats(self) -> MidiHubStats:
        return MidiHubStats(
            running=self._running,
            port_count=len(self._ports),
            subscribed_consumers=len(self._subscribers),
            inbound_queue=len(self._inbound),
            outbound_queue=len(self._outbound),
            dropped_inbound=self._dropped_inbound,
            dropped_outbound=self._dropped_outbound,
            cycle_count=self._cycle_count,
            last_cycle_ns=self._last_cycle_ns,
        )

    def to_dict(self) -> Dict[str, Any]:
        s = self.stats()
        return {
            "running": s.running,
            "port_count": s.port_count,
            "subscribed_consumers": s.subscribed_consumers,
            "inbound_queue": s.inbound_queue,
            "outbound_queue": s.outbound_queue,
            "dropped_inbound": s.dropped_inbound,
            "dropped_outbound": s.dropped_outbound,
            "cycle_count": s.cycle_count,
            "last_cycle_ns": s.last_cycle_ns,
            "ports": [p.__dict__ for p in self.list_ports()],
        }

    def _seed_alsa_ports(self) -> None:
        discovered = discover_alsa_ports()
        self._known_alsa_inputs = set(discovered.get("inputs", []))
        self._known_alsa_outputs = set(discovered.get("outputs", []))
        for port in build_alsa_ports(prefix="alsa"):
            self._ports[port.port_id] = port

    def _configure_current_thread_realtime(self) -> None:
        # Best-effort RT scheduling for MIDI I/O thread.
        if not hasattr(os, "sched_setscheduler"):
            return
        try:
            param = os.sched_param(20)
            os.sched_setscheduler(0, os.SCHED_FIFO, param)
        except Exception:
            return

    def _run_hotplug_loop(self) -> None:
        while not self._stop_evt.is_set():
            if self._auto_discover_alsa:
                self._sync_alsa_ports()
            self._stop_evt.wait(timeout=self._hotplug_interval_s)

    def _sync_alsa_ports(self) -> None:
        discovered = discover_alsa_ports()
        inputs = set(discovered.get("inputs", []))
        outputs = set(discovered.get("outputs", []))
        if inputs == self._known_alsa_inputs and outputs == self._known_alsa_outputs:
            return

        self._known_alsa_inputs = inputs
        self._known_alsa_outputs = outputs

        # Rebuild ALSA ports from scratch; preserve non-ALSA ports.
        with self._lock:
            existing_non_alsa = {
                port_id: port
                for port_id, port in self._ports.items()
                if port.kind != "alsa"
            }
            alsa_ports = {port.port_id: port for port in build_alsa_ports(prefix="alsa")}
            self._ports = {**existing_non_alsa, **alsa_ports}
            if self._running:
                for port in alsa_ports.values():
                    if not port.is_open:
                        port.open()

    def _run_loop(self) -> None:
        self._configure_current_thread_realtime()
        while not self._stop_evt.is_set():
            started_ns = time.time_ns()

            self._drain_outbound()
            self._collect_inbound()
            self._dispatch_inbound()

            self._cycle_count += 1
            self._last_cycle_ns = time.time_ns() - started_ns

            elapsed_s = self._last_cycle_ns / 1_000_000_000.0
            sleep_for = self._poll_interval_s - elapsed_s
            if sleep_for > 0:
                self._stop_evt.wait(timeout=sleep_for)

    def _drain_outbound(self) -> None:
        messages = self._outbound.drain(512)
        if not messages:
            return
        with self._lock:
            ports = dict(self._ports)
        for msg in messages:
            destination = msg.destination_port
            if destination is None:
                continue
            port = ports.get(destination)
            if port is None:
                continue
            port.send(msg.data)

    def _collect_inbound(self) -> None:
        with self._lock:
            ports = list(self._ports.values())
        for port in ports:
            if not port.is_open and self._running:
                port.open()
            if not port.can_receive() or not port.is_open:
                continue
            messages = port.receive(max_messages=128)
            for msg in messages:
                if not self._inbound.push(msg):
                    self._dropped_inbound += 1

    def _dispatch_inbound(self) -> None:
        messages = self._inbound.drain(1024)
        if not messages:
            return
        with self._lock:
            subscribers = list(self._subscribers.values())
        for msg in messages:
            for callback in subscribers:
                try:
                    callback(msg)
                except Exception:
                    continue


_midi_hub_singleton: Optional[MidiHub] = None


def get_midi_hub() -> MidiHub:
    global _midi_hub_singleton
    if _midi_hub_singleton is None:
        _midi_hub_singleton = MidiHub()
    return _midi_hub_singleton
