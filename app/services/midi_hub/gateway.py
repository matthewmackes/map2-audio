"""MIDI Hub resilient gateway transport."""

from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional

from app.services.midi_hub.hub import MidiHub, get_midi_hub


GatewayState = Literal["disconnected", "connecting", "connected", "error", "reconnecting"]

IDENTITY_REQUEST_SYSEX = b"\xF0\x7E\x7F\x06\x01\xF7"


@dataclass
class MidiGatewayStatus:
    gateway_id: str
    in_port_id: str
    out_port_id: str
    state: GatewayState
    connected: bool
    responding: bool
    latency_ms: Optional[float]
    health_error: Optional[str]
    last_health_at: Optional[str]
    bridge_adapter: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "gateway_id": self.gateway_id,
            "in_port_id": self.in_port_id,
            "out_port_id": self.out_port_id,
            "state": self.state,
            "connected": self.connected,
            "responding": self.responding,
            "latency_ms": self.latency_ms,
            "health_error": self.health_error,
            "last_health_at": self.last_health_at,
            "bridge_adapter": self.bridge_adapter,
            "metadata": dict(self.metadata),
        }


def _utc_now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class MidiGateway:
    """Resilient wrapper around a MIDI in/out port pair."""

    def __init__(
        self,
        *,
        gateway_id: str,
        in_port_id: str,
        out_port_id: str,
        hub: Optional[MidiHub] = None,
        reconnect_interval_s: float = 5.0,
        health_interval_s: float = 30.0,
        probe_timeout_s: float = 1.0,
        bridge_adapter: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.gateway_id = str(gateway_id)
        self.in_port_id = str(in_port_id)
        self.out_port_id = str(out_port_id)
        self.bridge_adapter = str(bridge_adapter) if bridge_adapter else None
        self.metadata = dict(metadata or {})

        self._hub = hub or get_midi_hub()
        self._reconnect_interval_s = max(0.25, float(reconnect_interval_s))
        self._health_interval_s = max(1.0, float(health_interval_s))
        self._probe_timeout_s = max(0.05, float(probe_timeout_s))

        self._state: GatewayState = "disconnected"
        self._connected = False
        self._responding = False
        self._latency_ms: Optional[float] = None
        self._health_error: Optional[str] = None
        self._last_health_at: Optional[str] = None

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        self._lock = threading.RLock()
        self._next_health_deadline = 0.0

    @property
    def running(self) -> bool:
        return self._running

    def status(self) -> MidiGatewayStatus:
        with self._lock:
            return MidiGatewayStatus(
                gateway_id=self.gateway_id,
                in_port_id=self.in_port_id,
                out_port_id=self.out_port_id,
                state=self._state,
                connected=self._connected,
                responding=self._responding,
                latency_ms=self._latency_ms,
                health_error=self._health_error,
                last_health_at=self._last_health_at,
                bridge_adapter=self.bridge_adapter,
                metadata=self.metadata,
            )

    def to_dict(self) -> Dict[str, Any]:
        return self.status().to_dict()

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._stop_evt.clear()
            self._next_health_deadline = 0.0
            self._thread = threading.Thread(
                target=self._run_loop,
                name=f"midi_gateway_{self.gateway_id}",
                daemon=True,
            )
            self._thread.start()

    def stop(self, *, join_timeout_s: float = 1.5) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop_evt.set()
            thread = self._thread
            self._thread = None
        if thread is not None:
            thread.join(timeout=join_timeout_s)

    def reconnect(self) -> None:
        in_port = self._hub.resolve_port(self.in_port_id)
        out_port = self._hub.resolve_port(self.out_port_id)
        if in_port is not None:
            try:
                in_port.close()
            except Exception:
                pass
        if out_port is not None and out_port is not in_port:
            try:
                out_port.close()
            except Exception:
                pass
        self._set_state("reconnecting")
        self._next_health_deadline = 0.0

    def _set_state(self, state: GatewayState) -> None:
        with self._lock:
            previous = self._state
            self._state = state
            connected = state == "connected"
            self._connected = connected
        if previous == state:
            return
        if state == "connected":
            self._emit_event("midi:gateway_connected", self.to_dict())
        elif previous == "connected":
            self._emit_event("midi:gateway_disconnected", self.to_dict())

    def _run_loop(self) -> None:
        while not self._stop_evt.is_set():
            in_port = self._hub.resolve_port(self.in_port_id)
            out_port = self._hub.resolve_port(self.out_port_id)

            if in_port is None or out_port is None:
                self._responding = False
                self._health_error = "port_missing"
                self._set_state("reconnecting")
                self._stop_evt.wait(timeout=self._reconnect_interval_s)
                continue

            if not in_port.is_open:
                in_port.open()
            if not out_port.is_open:
                out_port.open()

            if not in_port.is_open or not out_port.is_open:
                self._responding = False
                self._health_error = "port_not_open"
                self._set_state("connecting")
                self._stop_evt.wait(timeout=self._reconnect_interval_s)
                continue

            self._set_state("connected")
            now = time.monotonic()
            if now >= self._next_health_deadline:
                self._run_health_probe()
                self._next_health_deadline = now + self._health_interval_s

            self._stop_evt.wait(timeout=0.1)

    def _run_health_probe(self) -> None:
        in_port = self._hub.resolve_port(self.in_port_id)
        out_port = self._hub.resolve_port(self.out_port_id)
        if in_port is None or out_port is None:
            self._responding = False
            self._health_error = "port_missing"
            return

        started = time.perf_counter_ns()
        try:
            sent = out_port.send(IDENTITY_REQUEST_SYSEX)
        except Exception:
            sent = False
        if not sent:
            self._responding = False
            self._health_error = "identity_probe_send_failed"
            self._last_health_at = _utc_now_iso()
            self._emit_health()
            return

        deadline = time.monotonic() + self._probe_timeout_s
        matched_response = False
        while time.monotonic() < deadline and not self._stop_evt.is_set():
            try:
                messages = in_port.receive(max_messages=32)
            except Exception:
                messages = []
            for message in messages:
                if self._is_identity_response(message.data):
                    matched_response = True
                    elapsed_ns = time.perf_counter_ns() - started
                    self._latency_ms = elapsed_ns / 1_000_000.0
                    self._responding = True
                    self._health_error = None
                    self._last_health_at = _utc_now_iso()
                    self._emit_health()
                    self._emit_event(
                        "midi:gateway_latency",
                        {
                            "gateway_id": self.gateway_id,
                            "latency_ms": self._latency_ms,
                            "timestamp": self._last_health_at,
                        },
                    )
                    break
            if matched_response:
                break
            self._stop_evt.wait(timeout=0.01)

        if not matched_response:
            self._responding = False
            self._health_error = "identity_probe_timeout"
            self._last_health_at = _utc_now_iso()
            self._emit_health()

    def _emit_health(self) -> None:
        self._emit_event(
            "midi:gateway_health",
            {
                "gateway_id": self.gateway_id,
                "responding": self._responding,
                "latency_ms": self._latency_ms,
                "health_error": self._health_error,
                "timestamp": self._last_health_at,
                "bridge_adapter": self.bridge_adapter,
            },
        )

    @staticmethod
    def _is_identity_response(data: bytes) -> bool:
        if len(data) < 6:
            return False
        return data[:5] == b"\xF0\x7E\x00\x06\x02" or data[:4] == b"\xF0\x7E\x7F\x06"

    def _emit_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            message = {
                "type": event_type,
                "data": payload,
                "timestamp": _utc_now_iso(),
            }
            coro = ws_manager.broadcast_json(message, topic="midi:gateways")
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                asyncio.run(coro)
            else:
                loop.create_task(coro)
        except Exception:
            return


class MidiGatewayManager:
    """Lifecycle manager for MIDI gateways."""

    def __init__(self, hub: Optional[MidiHub] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._gateways: Dict[str, MidiGateway] = {}
        self._lock = threading.RLock()

    def list_gateways(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [gateway.to_dict() for gateway in self._gateways.values()]

    def get_gateway(self, gateway_id: str) -> Optional[MidiGateway]:
        with self._lock:
            return self._gateways.get(gateway_id)

    def create_gateway(
        self,
        *,
        gateway_id: str,
        in_port_id: str,
        out_port_id: str,
        reconnect_interval_s: float = 5.0,
        health_interval_s: float = 30.0,
        probe_timeout_s: float = 1.0,
        bridge_adapter: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        auto_start: bool = True,
    ) -> Dict[str, Any]:
        gateway = MidiGateway(
            gateway_id=gateway_id,
            in_port_id=in_port_id,
            out_port_id=out_port_id,
            hub=self._hub,
            reconnect_interval_s=reconnect_interval_s,
            health_interval_s=health_interval_s,
            probe_timeout_s=probe_timeout_s,
            bridge_adapter=bridge_adapter,
            metadata=metadata,
        )
        with self._lock:
            previous = self._gateways.pop(gateway_id, None)
            self._gateways[gateway_id] = gateway
        if previous is not None:
            previous.stop()
        if auto_start:
            gateway.start()
        return gateway.to_dict()

    def remove_gateway(self, gateway_id: str) -> bool:
        with self._lock:
            gateway = self._gateways.pop(gateway_id, None)
        if gateway is None:
            return False
        gateway.stop()
        return True

    def reconnect_gateway(self, gateway_id: str) -> Optional[Dict[str, Any]]:
        gateway = self.get_gateway(gateway_id)
        if gateway is None:
            return None
        gateway.reconnect()
        return gateway.to_dict()

    def stop_all(self) -> None:
        with self._lock:
            gateways = list(self._gateways.values())
        for gateway in gateways:
            gateway.stop()


_midi_gateway_manager_singleton: Optional[MidiGatewayManager] = None


def get_midi_gateway_manager() -> MidiGatewayManager:
    global _midi_gateway_manager_singleton
    if _midi_gateway_manager_singleton is None:
        _midi_gateway_manager_singleton = MidiGatewayManager()
    return _midi_gateway_manager_singleton
