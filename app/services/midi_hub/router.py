"""MIDI Hub routing engine."""

from __future__ import annotations

import asyncio
import heapq
import json
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence, Tuple
from uuid import uuid4

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord, get_midi_traffic_monitor
from app.services.midi_hub.transforms import MidiTransformEngine, TransformedMidiEvent, get_midi_transform_engine


RouteMatchMode = Literal["all_match", "first_match"]


def _default_routes_path() -> Path:
    return Path("~/.map2/midi_routes.json").expanduser()


def _resolve_local_node_id() -> str:
    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        return get_enhanced_node_identity().get_node_id()
    except Exception:
        return "local"


@dataclass(frozen=True)
class MidiRoute:
    route_id: str
    source_port: str
    destination_ports: Tuple[str, ...]
    source_node_id: Optional[str] = None
    destination_node_id: Optional[str] = None
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
            "source_node_id": self.source_node_id,
            "destination_node_id": self.destination_node_id,
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
        source_node_id_raw = str(payload.get("source_node_id") or "").strip()
        destination_node_id_raw = str(payload.get("destination_node_id") or "").strip()
        return MidiRoute(
            route_id=str(payload.get("route_id") or uuid4().hex),
            source_port=str(payload.get("source_port") or ""),
            destination_ports=tuple(str(p) for p in (payload.get("destination_ports") or [])),
            source_node_id=source_node_id_raw or None,
            destination_node_id=destination_node_id_raw or None,
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
        publisher: Optional[RealtimeMessagePublisher] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._persist_path = persist_path or _default_routes_path()
        self._transform_engine = transform_engine or get_midi_transform_engine()
        self._traffic_monitor = traffic_monitor or get_midi_traffic_monitor()
        self._publisher = publisher or event_publisher
        self.TRANSFORM_TYPES = list(self._transform_engine.TRANSFORM_TYPES)
        self._routes_by_id: Dict[str, MidiRoute] = {}
        self._route_snapshot: Tuple[MidiRoute, ...] = tuple()
        self._match_mode: RouteMatchMode = "all_match"
        self._running = False
        self._lock = threading.RLock()
        self._delay_cv = threading.Condition(self._lock)
        self._delay_queue: List[Tuple[float, int, Dict[str, Any]]] = []
        self._delay_sequence = 0
        self._delay_thread: Optional[threading.Thread] = None
        self._max_pending_delayed_events = 4096
        self._subscriber_id = "midi_hub_router"
        self._local_node_id = _resolve_local_node_id()
        self._load_routes()

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._delay_thread = threading.Thread(target=self._run_delayed_dispatch_loop, name="midi_router_delay", daemon=True)
            self._delay_thread.start()
        self._hub.subscribe(self._subscriber_id, self._on_message)

    def stop(self) -> None:
        delay_thread: Optional[threading.Thread] = None
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._delay_queue.clear()
            self._delay_cv.notify_all()
            delay_thread = self._delay_thread
            self._delay_thread = None
        self._hub.unsubscribe(self._subscriber_id)
        if delay_thread is not None:
            delay_thread.join(timeout=1.0)

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

    def replace_routes(
        self,
        routes: Sequence[Dict[str, Any]],
        *,
        match_mode: Optional[RouteMatchMode] = None,
    ) -> List[Dict[str, Any]]:
        parsed_routes: Dict[str, MidiRoute] = {}
        for item in routes:
            route = MidiRoute.from_dict(dict(item))
            if not route.route_id or not route.source_port or not route.destination_ports:
                continue
            parsed_routes[route.route_id] = route

        with self._lock:
            self._routes_by_id = parsed_routes
            if match_mode is not None:
                self._match_mode = "first_match" if match_mode == "first_match" else "all_match"
            self._rebuild_snapshot_locked()
            self._persist_routes_locked()

        self._emit_websocket_message(
            "midi:route_changed",
            {
                "action": "replaced",
                "match_mode": self._match_mode,
                "routes": [route.to_dict() for route in self._route_snapshot],
                "timestamp": time.time(),
            },
            topic="midi:routes",
        )
        return [route.to_dict() for route in self._route_snapshot]

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

    def get_cluster_routes(self) -> List[Dict[str, Any]]:
        return [route.to_dict() for route in self._route_snapshot if self._route_has_remote_endpoint(route)]

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
        if bool((message.metadata or {}).get("router_dispatch")):
            return

        parsed = self._parse_message(message.data)
        source_node_id = self._message_source_node_id(message)
        matched_any = False
        for route in self._route_snapshot:
            if not route.enabled:
                continue
            if route.source_port != message.source_port:
                continue
            if route.source_node_id and route.source_node_id != source_node_id:
                continue
            if not self._matches_filter(route, parsed):
                continue

            destinations = [destination for destination in route.destination_ports if self._destination_matches_route(route, destination)]
            if not destinations:
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

            for destination in destinations:
                destination_latency_ms = 0.0
                if route.latency_compensation_enabled:
                    destination_latency_ms = float(route.destination_latency_ms.get(destination, 0.0))
                compensation_delay_ms = max(0.0, max_route_latency_ms - destination_latency_ms)

                for event in transformed_events:
                    matched_any = True
                    delay_ms = max(0, int(event.delay_ms + round(compensation_delay_ms)))
                    metadata = dict(event.metadata)
                    metadata["latency_compensation_ms"] = compensation_delay_ms
                    if "origin_node_id" not in metadata:
                        metadata["origin_node_id"] = source_node_id
                    if "origin_port" not in metadata:
                        metadata["origin_port"] = (message.metadata or {}).get("origin_port", message.source_port)
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

        if (
            not matched_any
            and bool((message.metadata or {}).get("cluster_remote_injected"))
            and bool(message.destination_port)
        ):
            self._dispatch_event(
                source_port=message.source_port,
                destination_port=str(message.destination_port),
                event_data=bytes(message.data),
                route_id="cluster_remote_direct",
                delay_ms=0,
                metadata=dict(message.metadata or {}),
            )

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

        self._schedule_delayed_event(
            source_port=source_port,
            destination_port=destination_port,
            event_data=event_data,
            route_id=route_id,
            delay_ms=delay_ms,
            metadata=metadata,
        )

    def _schedule_delayed_event(
        self,
        *,
        source_port: str,
        destination_port: str,
        event_data: bytes,
        route_id: str,
        delay_ms: int,
        metadata: Dict[str, Any],
    ) -> None:
        with self._delay_cv:
            if not self._running:
                return
            run_at = time.monotonic() + (float(delay_ms) / 1000.0)
            if len(self._delay_queue) >= self._max_pending_delayed_events:
                worst_index = max(range(len(self._delay_queue)), key=lambda index: (self._delay_queue[index][0], self._delay_queue[index][1]))
                worst_run_at, worst_sequence, _ = self._delay_queue[worst_index]
                if (run_at, self._delay_sequence + 1) >= (worst_run_at, worst_sequence):
                    return
                self._delay_queue[worst_index] = self._delay_queue[-1]
                self._delay_queue.pop()
                if self._delay_queue:
                    heapq.heapify(self._delay_queue)
            self._delay_sequence += 1
            heapq.heappush(
                self._delay_queue,
                (
                    run_at,
                    self._delay_sequence,
                    {
                        "source_port": source_port,
                        "destination_port": destination_port,
                        "data": bytes(event_data),
                        "route_id": route_id,
                        "delay_ms": int(delay_ms),
                        "metadata": dict(metadata),
                    },
                ),
            )
            self._delay_cv.notify()

    def _run_delayed_dispatch_loop(self) -> None:
        while True:
            payload: Optional[Dict[str, Any]] = None
            with self._delay_cv:
                while self._running and not self._delay_queue:
                    self._delay_cv.wait(timeout=0.25)
                if not self._running and not self._delay_queue:
                    return
                if not self._delay_queue:
                    continue
                run_at, _, next_payload = self._delay_queue[0]
                wait_s = run_at - time.monotonic()
                if wait_s > 0:
                    self._delay_cv.wait(timeout=wait_s)
                    continue
                _, _, payload = heapq.heappop(self._delay_queue)

            if payload is None:
                continue
            self._send_and_track(**payload)

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
        preserved_metadata = {
            key: metadata[key]
            for key in (
                "origin_node_id",
                "origin_port",
                "cluster_remote_injected",
                "cluster_transport",
                "cluster_transport_received",
                "cluster_remote_node_id",
                "cluster_session_id",
                "mesh_forwarded",
                "mesh_origin",
                "udp_raw_forwarded",
            )
            if key in metadata
        }
        event_metadata = {
            **preserved_metadata,
            "route_id": route_id,
            "delay_ms": int(delay_ms),
            "transform_metadata": dict(metadata),
        }
        self._hub.send(
            source_port=source_port,
            destination_port=destination_port,
            data=data,
            metadata=dict(event_metadata),
        )
        # Re-inject routed messages into the hub bus so internal consumers
        # (engine bridge, learn manager, diagnostics, broadcast) can subscribe
        # without polling per-port TX queues.
        self._hub.inject(
            MidiMessage(
                data=bytes(data),
                timestamp_ns=time.time_ns(),
                source_port=source_port,
                destination_port=destination_port,
                metadata={**event_metadata, "router_dispatch": True},
            )
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

    def _destination_matches_route(self, route: MidiRoute, destination: str) -> bool:
        if not route.destination_node_id:
            return True
        return self._endpoint_node_id(destination) == route.destination_node_id

    def _message_source_node_id(self, message: MidiMessage) -> str:
        metadata = dict(message.metadata or {})
        origin_node_id = str(metadata.get("origin_node_id") or "").strip()
        if origin_node_id:
            return origin_node_id
        endpoint_node_id = self._endpoint_node_id(message.source_port)
        return endpoint_node_id or self._local_node_id

    def _endpoint_node_id(self, identifier: str) -> str:
        target = str(identifier or "").strip()
        if not target:
            return self._local_node_id
        if self._is_local_endpoint(target):
            return self._local_node_id
        if ":" not in target:
            return self._local_node_id
        node_id, _port_name = target.split(":", 1)
        return node_id.strip() or self._local_node_id

    def _is_local_endpoint(self, identifier: str) -> bool:
        target = str(identifier or "").strip()
        if not target:
            return False
        for port in self._hub.list_ports():
            if target in {port.port_id, port.name}:
                return True
        return False

    def _route_has_remote_endpoint(self, route: MidiRoute) -> bool:
        if route.source_node_id or route.destination_node_id:
            return True
        if self._endpoint_node_id(route.source_port) != self._local_node_id:
            return True
        return any(self._endpoint_node_id(destination) != self._local_node_id for destination in route.destination_ports)

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

    def _emit_websocket_message(self, event_type: str, payload: Dict[str, Any], *, topic: str) -> None:
        try:
            message = {"type": event_type, "data": payload}
            publish_threadsafe = getattr(self._publisher, "publish_message_threadsafe", None)
            if callable(publish_threadsafe):
                publish_threadsafe(message, topics=(topic,))
            else:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    asyncio.run(self._publisher.publish_message(message, topics=(topic,)))
                else:
                    loop.call_soon(
                        lambda: loop.create_task(self._publisher.publish_message(message, topics=(topic,)))
                    )
        except Exception:
            return


_midi_router_singleton: Optional[MidiRouter] = None
_midi_router_singleton_lock = threading.Lock()


def get_midi_router() -> MidiRouter:
    global _midi_router_singleton
    if _midi_router_singleton is None:
        with _midi_router_singleton_lock:
            if _midi_router_singleton is None:
                _midi_router_singleton = MidiRouter()
    return _midi_router_singleton
