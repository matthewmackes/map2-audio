"""MIDI Hub routing engine."""

from __future__ import annotations

import asyncio
import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple
from uuid import uuid4

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord, get_midi_traffic_monitor
from app.services.midi_hub.transforms import MidiTransformEngine, TransformedMidiEvent, get_midi_transform_engine


RouteMatchMode = Literal["all_match", "first_match"]


def _default_routes_path() -> Path:
    return Path("~/.map2/midi_routes.json").expanduser()


@dataclass(frozen=True)
class MidiRoute:
    route_id: str
    source_port: str
    destination_ports: Tuple[str, ...]
    enabled: bool = True
    priority: int = 100
    route_type: str = "pass_through"
    message_types: Tuple[str, ...] = field(default_factory=tuple)
    channels: Tuple[int, ...] = field(default_factory=tuple)
    cc_range: Optional[Tuple[int, int]] = None
    note_range: Optional[Tuple[int, int]] = None
    velocity_range: Optional[Tuple[int, int]] = None
    transform_chain: Tuple[Dict[str, Any], ...] = field(default_factory=tuple)
    latency_compensation_enabled: bool = False
    destination_latency_ms: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "route_id": self.route_id,
            "source_port": self.source_port,
            "destination_ports": list(self.destination_ports),
            "enabled": self.enabled,
            "priority": self.priority,
            "route_type": self.route_type,
            "filter": {
                "message_types": list(self.message_types),
                "channels": list(self.channels),
                "cc_range": list(self.cc_range) if self.cc_range else None,
                "note_range": list(self.note_range) if self.note_range else None,
                "velocity_range": list(self.velocity_range) if self.velocity_range else None,
            },
            "transform_chain": [dict(step) for step in self.transform_chain],
            "latency_compensation_enabled": self.latency_compensation_enabled,
            "destination_latency_ms": {k: float(v) for k, v in self.destination_latency_ms.items()},
        }

    @staticmethod
    def from_dict(payload: Dict[str, Any]) -> "MidiRoute":
        route_filter = dict(payload.get("filter") or {})
        cc_range = route_filter.get("cc_range")
        note_range = route_filter.get("note_range")
        velocity_range = route_filter.get("velocity_range")
        destination_latency_raw = payload.get("destination_latency_ms") or {}
        destination_latency_ms: Dict[str, float] = {}
        if isinstance(destination_latency_raw, dict):
            for key, value in destination_latency_raw.items():
                try:
                    destination_latency_ms[str(key)] = float(value)
                except Exception:
                    continue
        return MidiRoute(
            route_id=str(payload.get("route_id") or uuid4().hex),
            source_port=str(payload.get("source_port") or ""),
            destination_ports=tuple(str(p) for p in (payload.get("destination_ports") or [])),
            enabled=bool(payload.get("enabled", True)),
            priority=int(payload.get("priority", 100)),
            route_type=str(payload.get("route_type") or "pass_through"),
            message_types=tuple(str(m) for m in (route_filter.get("message_types") or [])),
            channels=tuple(int(c) for c in (route_filter.get("channels") or [])),
            cc_range=tuple(int(v) for v in cc_range) if isinstance(cc_range, Sequence) and len(cc_range) == 2 else None,
            note_range=tuple(int(v) for v in note_range) if isinstance(note_range, Sequence) and len(note_range) == 2 else None,
            velocity_range=tuple(int(v) for v in velocity_range)
            if isinstance(velocity_range, Sequence) and len(velocity_range) == 2
            else None,
            transform_chain=tuple(dict(step) for step in (payload.get("transform_chain") or [])),
            latency_compensation_enabled=bool(payload.get("latency_compensation_enabled", False)),
            destination_latency_ms=destination_latency_ms,
        )


class MidiRouter:
    """Lock-free hot-path MIDI routing with atomic route-table swaps."""

    TRANSFORM_TYPES: List[Dict[str, Any]] = []

    def __init__(
        self,
        hub: Optional[MidiHub] = None,
        *,
        persist_path: Optional[Path] = None,
        transform_engine: Optional[MidiTransformEngine] = None,
        traffic_monitor: Optional[MidiTrafficMonitor] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._persist_path = persist_path or _default_routes_path()
        self._transform_engine = transform_engine or get_midi_transform_engine()
        self._traffic_monitor = traffic_monitor or get_midi_traffic_monitor()
        self.TRANSFORM_TYPES = list(self._transform_engine.TRANSFORM_TYPES)
        self._routes_by_id: Dict[str, MidiRoute] = {}
        self._route_snapshot: Tuple[MidiRoute, ...] = tuple()
        self._match_mode: RouteMatchMode = "all_match"
        self._running = False
        self._lock = threading.RLock()
        self._subscriber_id = "midi_hub_router"
        self._load_routes()

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
        self._hub.subscribe(self._subscriber_id, self._on_message)

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._running = False
        self._hub.unsubscribe(self._subscriber_id)

    def set_match_mode(self, mode: RouteMatchMode) -> RouteMatchMode:
        with self._lock:
            self._match_mode = "first_match" if mode == "first_match" else "all_match"
            self._persist_routes_locked()
            return self._match_mode

    def get_match_mode(self) -> RouteMatchMode:
        return self._match_mode

    def list_routes(self) -> List[Dict[str, Any]]:
        return [route.to_dict() for route in self._route_snapshot]

    def get_route(self, route_id: str) -> Optional[Dict[str, Any]]:
        route = self._routes_by_id.get(route_id)
        return route.to_dict() if route else None

    def add_route(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        route = MidiRoute.from_dict(payload)
        if not route.source_port:
            raise ValueError("source_port is required")
        if not route.destination_ports:
            raise ValueError("destination_ports is required")

        with self._lock:
            self._routes_by_id[route.route_id] = route
            self._rebuild_snapshot_locked()
            self._persist_routes_locked()
        self._emit_route_event("added", route)
        return route.to_dict()

    def update_route(self, route_id: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self._lock:
            existing = self._routes_by_id.get(route_id)
            if existing is None:
                return None
            merged = existing.to_dict()
            merged.update(payload)
            merged["route_id"] = route_id
            route = MidiRoute.from_dict(merged)
            self._routes_by_id[route_id] = route
            self._rebuild_snapshot_locked()
            self._persist_routes_locked()
        self._emit_route_event("updated", route)
        return route.to_dict()

    def delete_route(self, route_id: str) -> bool:
        with self._lock:
            existing = self._routes_by_id.pop(route_id, None)
            if existing is None:
                return False
            self._rebuild_snapshot_locked()
            self._persist_routes_locked()
        self._emit_route_event("deleted", existing)
        return True

    def set_route_enabled(self, route_id: str, enabled: bool) -> Optional[Dict[str, Any]]:
        with self._lock:
            existing = self._routes_by_id.get(route_id)
            if existing is None:
                return None
            updated = MidiRoute.from_dict({**existing.to_dict(), "enabled": bool(enabled)})
            self._routes_by_id[route_id] = updated
            self._rebuild_snapshot_locked()
            self._persist_routes_locked()
        self._emit_route_event("enabled" if enabled else "disabled", updated)
        return updated.to_dict()

    def set_transform_chain(self, route_id: str, transform_chain: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return self.update_route(route_id, {"transform_chain": transform_chain})

    def topology(self) -> Dict[str, Any]:
        routes = self.list_routes()
        nodes = set()
        links = []
        for route in routes:
            source = route["source_port"]
            nodes.add(source)
            for destination in route["destination_ports"]:
                nodes.add(destination)
                links.append(
                    {
                        "route_id": route["route_id"],
                        "source": source,
                        "destination": destination,
                        "enabled": route["enabled"],
                        "priority": route["priority"],
                    }
                )
        return {"node_count": len(nodes), "nodes": sorted(nodes), "link_count": len(links), "links": links}

    def _rebuild_snapshot_locked(self) -> None:
        ordered = sorted(
            self._routes_by_id.values(),
            key=lambda route: (-int(route.priority), str(route.route_id)),
        )
        self._route_snapshot = tuple(ordered)

    def _persist_routes_locked(self) -> None:
        payload = {
            "match_mode": self._match_mode,
            "routes": [route.to_dict() for route in self._route_snapshot],
            "updated_at": time.time(),
        }
        self._persist_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self._persist_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        temp_path.replace(self._persist_path)

    def _load_routes(self) -> None:
        if not self._persist_path.exists():
            return
        try:
            payload = json.loads(self._persist_path.read_text(encoding="utf-8"))
        except Exception:
            return
        mode = payload.get("match_mode")
        self._match_mode = "first_match" if mode == "first_match" else "all_match"
        routes_raw = payload.get("routes") or []
        for item in routes_raw:
            try:
                route = MidiRoute.from_dict(dict(item))
            except Exception:
                continue
            if route.route_id and route.source_port and route.destination_ports:
                self._routes_by_id[route.route_id] = route
        self._rebuild_snapshot_locked()

    def _on_message(self, message: MidiMessage) -> None:
        if not self._running:
            return

        parsed = self._parse_message(message.data)
        for route in self._route_snapshot:
            if not route.enabled:
                continue
            if route.source_port != message.source_port:
                continue
            if not self._matches_filter(route, parsed):
                continue

            try:
                transformed_events = self._transform_engine.apply_chain(
                    message.data,
                    route.transform_chain,
                    route_id=route.route_id,
                    source_port=message.source_port,
                )
            except Exception as exc:
                self._emit_transform_error(
                    route_id=route.route_id,
                    transform_step={"type": "route_chain", "steps": len(route.transform_chain)},
                    error=str(exc),
                )
                transformed_events = [TransformedMidiEvent(data=bytes(message.data))]

            max_route_latency_ms = 0.0
            if route.latency_compensation_enabled and route.destination_latency_ms:
                max_route_latency_ms = max(float(v) for v in route.destination_latency_ms.values())

            for destination in route.destination_ports:
                destination_latency_ms = 0.0
                if route.latency_compensation_enabled:
                    destination_latency_ms = float(route.destination_latency_ms.get(destination, 0.0))
                compensation_delay_ms = max(0.0, max_route_latency_ms - destination_latency_ms)

                for event in transformed_events:
                    delay_ms = max(0, int(event.delay_ms + round(compensation_delay_ms)))
                    metadata = dict(event.metadata)
                    metadata["latency_compensation_ms"] = compensation_delay_ms
                    self._dispatch_event(
                        source_port=message.source_port,
                        destination_port=destination,
                        event_data=event.data,
                        route_id=route.route_id,
                        delay_ms=delay_ms,
                        metadata=metadata,
                    )

            if self._match_mode == "first_match":
                break

    def _dispatch_event(
        self,
        *,
        source_port: str,
        destination_port: str,
        event_data: bytes,
        route_id: str,
        delay_ms: int,
        metadata: Dict[str, Any],
    ) -> None:
        if delay_ms <= 0:
            self._send_and_track(
                source_port=source_port,
                destination_port=destination_port,
                data=event_data,
                route_id=route_id,
                delay_ms=0,
                metadata=metadata,
            )
            return

        timer = threading.Timer(
            float(delay_ms) / 1000.0,
            self._send_and_track,
            kwargs={
                "source_port": source_port,
                "destination_port": destination_port,
                "data": bytes(event_data),
                "route_id": route_id,
                "delay_ms": int(delay_ms),
                "metadata": dict(metadata),
            },
        )
        timer.daemon = True
        timer.start()

    def _send_and_track(
        self,
        *,
        source_port: str,
        destination_port: str,
        data: bytes,
        route_id: str,
        delay_ms: int,
        metadata: Dict[str, Any],
    ) -> None:
        self._hub.send(
            source_port=source_port,
            destination_port=destination_port,
            data=data,
            metadata={
                "route_id": route_id,
                "delay_ms": int(delay_ms),
                "transform_metadata": dict(metadata),
            },
        )
        self._emit_traffic_event(
            source_port=source_port,
            destination_port=destination_port,
            data=data,
            route_id=route_id,
        )

    def _matches_filter(self, route: MidiRoute, parsed: Dict[str, Any]) -> bool:
        message_type = parsed["message_type"]
        channel = parsed.get("channel")
        data1 = parsed.get("data1")
        data2 = parsed.get("data2")

        if route.message_types and message_type not in route.message_types:
            return False
        if route.channels and channel is not None and channel not in route.channels:
            return False
        if route.cc_range and message_type == "control_change":
            low, high = route.cc_range
            if data1 is None or data1 < low or data1 > high:
                return False
        if route.note_range and message_type in {"note_on", "note_off"}:
            low, high = route.note_range
            if data1 is None or data1 < low or data1 > high:
                return False
        if route.velocity_range and message_type in {"note_on", "note_off"}:
            low, high = route.velocity_range
            if data2 is None or data2 < low or data2 > high:
                return False
        return True

    @staticmethod
    def _parse_message(data: bytes) -> Dict[str, Any]:
        if not data:
            return {"message_type": "empty", "channel": None, "data1": None, "data2": None}

        status = data[0]
        if status == 0xF0:
            return {"message_type": "sysex", "channel": None, "data1": None, "data2": None}
        if status >= 0xF8:
            return {"message_type": "system_realtime", "channel": None, "data1": None, "data2": None}

        status_family = status & 0xF0
        channel = (status & 0x0F) + 1
        data1 = int(data[1]) if len(data) > 1 else None
        data2 = int(data[2]) if len(data) > 2 else None

        mapping = {
            0x80: "note_off",
            0x90: "note_on",
            0xA0: "poly_aftertouch",
            0xB0: "control_change",
            0xC0: "program_change",
            0xD0: "channel_aftertouch",
            0xE0: "pitchbend",
        }
        message_type = mapping.get(status_family, "system")
        if message_type == "note_on" and data2 == 0:
            message_type = "note_off"
        return {"message_type": message_type, "channel": channel, "data1": data1, "data2": data2}

    def _emit_route_event(self, action: str, route: MidiRoute) -> None:
        payload = {
            "action": action,
            "route": route.to_dict(),
            "match_mode": self._match_mode,
            "timestamp": time.time(),
        }
        self._emit_websocket_message("midi:route_changed", payload, topic="midi:routes")

    def _emit_traffic_event(
        self,
        *,
        source_port: str,
        destination_port: str,
        data: bytes,
        route_id: str,
    ) -> None:
        timestamp_ns = time.time_ns()
        parsed = self._parse_message(data)
        payload = {
            "timestamp_ns": timestamp_ns,
            "source_port": source_port,
            "destination_port": destination_port,
            "direction": "outbound",
            "route_id": route_id,
            "raw_hex": data.hex(),
            "decoded": parsed,
        }
        self._traffic_monitor.record(
            MidiTrafficRecord(
                timestamp_ns=timestamp_ns,
                source_port=source_port,
                destination_port=destination_port,
                direction="outbound",
                raw_hex=data.hex(),
                decoded=parsed,
                route_id=route_id,
            )
        )
        self._emit_websocket_message("midi:traffic", payload, topic="midi:traffic")

    def _emit_transform_error(
        self,
        *,
        route_id: str,
        transform_step: Dict[str, Any],
        error: str,
    ) -> None:
        payload = {
            "route_id": route_id,
            "transform_step": dict(transform_step),
            "error": error,
            "timestamp": time.time(),
        }
        self._emit_websocket_message("midi:transform_error", payload, topic="midi:routes")

    @staticmethod
    def _emit_websocket_message(event_type: str, payload: Dict[str, Any], *, topic: str) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            coro = ws_manager.broadcast_json({"type": event_type, "data": payload}, topic=topic)
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                asyncio.run(coro)
            else:
                loop.create_task(coro)
        except Exception:
            return


_midi_router_singleton: Optional[MidiRouter] = None


def get_midi_router() -> MidiRouter:
    global _midi_router_singleton
    if _midi_router_singleton is None:
        _midi_router_singleton = MidiRouter()
    return _midi_router_singleton
