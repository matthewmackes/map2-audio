"""Cluster-wide MIDI routing orchestration."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.config import config_get
from app.services.midi_hub.device_registry import MidiDeviceRegistry, get_midi_device_registry
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.midi_discovery import MidiDiscoveryService, get_midi_discovery_service
from app.services.midi_hub.network import MidiNetworkBridge, get_midi_network_bridge
from app.services.midi_hub.ports import MidiMessage
from app.services.midi_hub.rtp_transport import MidiRtpTransport, get_rtp_transport
from app.services.platform_event.bus import PlatformEventBus, get_platform_event_bus
from app.services.platform_event.factories import make_midi_cluster_event, midi_connection_dedupe_key
from app.services.platform_event.severity import Severity

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _resolve_local_node_id() -> str:
    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        return get_enhanced_node_identity().get_node_id()
    except Exception:
        return "local"


@dataclass
class MidiEndpoint:
    node_id: str
    port_name: str
    direction: str
    device_name: str
    node_address: str
    available: bool
    last_seen: datetime
    port_ref: str = ""

    def endpoint_id(self) -> str:
        return f"{self.node_id}:{self.port_name}"


@dataclass
class MidiClusterConnection:
    connection_id: str
    source: MidiEndpoint
    destination: MidiEndpoint
    state: str = "disconnected"
    transport: str = "rtp-midi"
    session_id: Optional[str] = None
    established_at: Optional[datetime] = None
    error_message: Optional[str] = None
    latency_ms: Optional[float] = None
    messages_forwarded: int = 0


class MidiClusterRouter:
    """Manage cross-node MIDI connections and forwarding."""

    def __init__(
        self,
        discovery: Optional[MidiDiscoveryService] = None,
        transport: Optional[MidiRtpTransport] = None,
        hub: Optional[MidiHub] = None,
        event_bus: Optional[PlatformEventBus] = None,
        network_bridge: Optional[MidiNetworkBridge] = None,
        device_registry: Optional[MidiDeviceRegistry] = None,
        *,
        local_node_id: Optional[str] = None,
    ) -> None:
        self._discovery = discovery or get_midi_discovery_service()
        self._transport = transport or get_rtp_transport()
        self._hub = hub or get_midi_hub()
        self._event_bus = event_bus or get_platform_event_bus()
        self._network_bridge = network_bridge or get_midi_network_bridge()
        self._device_registry = device_registry or get_midi_device_registry()
        self._local_node_id = str(local_node_id or _resolve_local_node_id())
        if hasattr(self._network_bridge, "set_cluster_router"):
            self._network_bridge.set_cluster_router(self)

        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._subscriber_id = f"midi_cluster_router_{id(self)}"
        self._connections: Dict[str, MidiClusterConnection] = {}
        self._known_nodes: set[str] = set()
        self._health_task: Optional[asyncio.Task[None]] = None
        self._auto_connect_task: Optional[asyncio.Task[None]] = None
        self._udp_listener_session_id: Optional[str] = None
        self._last_auto_connect_summary: Dict[str, Any] = {
            "reason": "not_run",
            "last_run_at": None,
            "pair_count": 0,
            "created_count": 0,
            "failed_count": 0,
            "created_connections": [],
            "failed_connections": [],
            "transport": self._transport_mode(),
        }

    def set_discovery(self, discovery: MidiDiscoveryService) -> None:
        self._discovery = discovery

    def set_transport(self, transport: MidiRtpTransport) -> None:
        self._transport = transport
        self._network_bridge.register_rtp_transport(transport)

    def set_hub(self, hub: MidiHub) -> None:
        if self._running:
            self._hub.unsubscribe(self._subscriber_id)
        self._hub = hub
        if self._running:
            self._hub.subscribe(self._subscriber_id, self._on_hub_message)

    async def start(self) -> None:
        if self._running:
            return

        self._loop = asyncio.get_running_loop()
        self._running = True
        self._hub.subscribe(self._subscriber_id, self._on_hub_message)
        self._network_bridge.register_rtp_transport(self._transport)
        self._network_bridge.set_transport_mode(self._transport_mode())

        if self._transport_mode() == "rtp-midi":
            await self._transport.start()
        elif self._transport_mode() == "udp-raw":
            self._udp_listener_session_id = f"cluster-midi:{self._local_node_id}:listener"
            await self._network_bridge.create_session(
                session_id=self._udp_listener_session_id,
                host="0.0.0.0",
                port=self._transport_port(),
                mode="listen",
            )

        await self._refresh_node_presence()
        self._health_task = asyncio.create_task(self._health_monitor())
        if self._is_auto_connect_enabled():
            self._auto_connect_task = asyncio.create_task(self._auto_connect_startup())

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False
        self._hub.unsubscribe(self._subscriber_id)

        if self._auto_connect_task is not None:
            self._auto_connect_task.cancel()
            try:
                await self._auto_connect_task
            except asyncio.CancelledError:
                pass
        self._auto_connect_task = None

        if self._health_task is not None:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
        self._health_task = None

        for connection_id in list(self._connections):
            await self.disconnect(connection_id)

        if self._udp_listener_session_id:
            await self._network_bridge.remove_session(self._udp_listener_session_id)
            self._udp_listener_session_id = None

    async def connect(
        self,
        source_endpoint_id: str,
        dest_endpoint_id: str,
        *,
        transport: Optional[str] = None,
    ) -> MidiClusterConnection:
        endpoints = {endpoint.endpoint_id(): endpoint for endpoint in self.get_endpoints()}
        source = endpoints.get(str(source_endpoint_id))
        destination = endpoints.get(str(dest_endpoint_id))
        if source is None:
            raise ValueError(f"Unknown source endpoint: {source_endpoint_id}")
        if destination is None:
            raise ValueError(f"Unknown destination endpoint: {dest_endpoint_id}")
        if source.direction != "output":
            raise ValueError("Source endpoint must be an output")
        if destination.direction != "input":
            raise ValueError("Destination endpoint must be an input")
        if source.node_id == destination.node_id:
            raise ValueError("Same-node MIDI routes belong in the local MIDI router")
        if source.node_id != self._local_node_id:
            raise ValueError("Cross-node connections must be initiated on the source node")
        if not source.available or not destination.available:
            raise ValueError("Endpoints must be online before they can be connected")

        connection_id = f"{source.endpoint_id()}→{destination.endpoint_id()}"
        existing = self._connections.get(connection_id)
        if existing is not None and existing.state in {"connecting", "connected"}:
            return existing
        if self._connected_remote_count() >= self._max_remote_connections():
            raise ValueError("Maximum cluster MIDI connections reached")

        connection = MidiClusterConnection(
            connection_id=connection_id,
            source=source,
            destination=destination,
            state="connecting",
            transport=self._normalize_transport(transport or self._transport_mode()),
        )
        self._connections[connection_id] = connection
        await self._publish_connection_event(
            "midi.connection.requested",
            connection,
            latency_ms=None,
        )

        try:
            await self._establish_connection(connection)
        except Exception as exc:
            connection.state = "error"
            connection.error_message = str(exc)
            await self._publish_connection_event(
                "midi.connection.failed",
                connection,
                latency_ms=connection.latency_ms,
                extra_details={"reason": str(exc)},
                severity=Severity.WARNING,
            )
            return connection

        connection.state = "connected"
        connection.established_at = _utcnow()
        connection.error_message = None
        await self._publish_connection_event(
            "midi.connection.established",
            connection,
            latency_ms=connection.latency_ms,
        )
        return connection

    async def disconnect(self, connection_id: str) -> bool:
        connection = self._connections.get(str(connection_id))
        if connection is None:
            return False

        connection.state = "disconnecting"
        if connection.session_id:
            if connection.transport == "rtp-midi":
                await self._transport.close_session(connection.session_id)
            elif connection.transport == "udp-raw":
                await self._network_bridge.remove_session(connection.session_id)

        connection.session_id = None
        connection.state = "disconnected"
        await self._publish_connection_event(
            "midi.connection.lost",
            connection,
            latency_ms=connection.latency_ms,
        )
        return True

    def get_connections(self) -> List[MidiClusterConnection]:
        return sorted(self._connections.values(), key=lambda row: row.connection_id)

    def get_connection(self, connection_id: str) -> Optional[MidiClusterConnection]:
        return self._connections.get(str(connection_id))

    async def trigger_auto_connect(self, *, reason: str = "manual") -> Dict[str, Any]:
        return await self._run_auto_connect_pass(reason=reason)

    def get_auto_connect_status(self) -> Dict[str, Any]:
        return dict(self._last_auto_connect_summary)

    async def failover_port(self, port_name: str) -> Optional[MidiClusterConnection]:
        target_port_name = str(port_name or "").strip()
        if not target_port_name:
            return None

        candidates = [
            connection
            for connection in self.get_connections()
            if connection.source.node_id == self._local_node_id
            and target_port_name in {connection.destination.port_name, connection.destination.port_ref}
        ]
        for connection in candidates:
            replacement = self._find_equivalent_input(
                target_port_name,
                exclude_node_id=connection.destination.node_id,
            )
            if replacement is None:
                continue

            await self._publish_connection_event(
                "midi.failover.triggered",
                connection,
                latency_ms=connection.latency_ms,
            )
            replacement_connection = await self.connect(
                connection.source.endpoint_id(),
                replacement.endpoint_id(),
                transport=connection.transport,
            )
            if replacement_connection.state == "connected":
                if replacement_connection.connection_id != connection.connection_id:
                    await self.disconnect(connection.connection_id)
                await self._publish_connection_event(
                    "midi.failover.completed",
                    replacement_connection,
                    latency_ms=replacement_connection.latency_ms,
                )
            return replacement_connection
        return None

    def forward(
        self,
        *,
        source_port: str,
        destination_node_id: str,
        destination_port_name: str,
        data: bytes,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        if not str(source_port).strip() or not str(destination_node_id).strip() or not str(destination_port_name).strip():
            return False
        self._schedule_coroutine(
            self._forward_dynamic(
                source_port=str(source_port),
                destination_node_id=str(destination_node_id),
                destination_port_name=str(destination_port_name),
                data=bytes(data),
                metadata=dict(metadata or {}),
            )
        )
        return True

    def get_endpoints(self) -> List[MidiEndpoint]:
        now = _utcnow()
        alias_by_port_name = self._alias_by_port_name()
        endpoints: List[MidiEndpoint] = []

        for port in self._hub.list_ports():
            visible_name = alias_by_port_name.get(port.name, port.name)
            address = "127.0.0.1"
            if port.direction in {"output", "duplex"}:
                endpoints.append(
                    MidiEndpoint(
                        node_id=self._local_node_id,
                        port_name=visible_name,
                        direction="output",
                        device_name=visible_name,
                        node_address=address,
                        available=bool(port.is_open or self._hub.running),
                        last_seen=now,
                        port_ref=port.port_id,
                    )
                )
            if port.direction in {"input", "duplex"}:
                endpoints.append(
                    MidiEndpoint(
                        node_id=self._local_node_id,
                        port_name=visible_name,
                        direction="input",
                        device_name=visible_name,
                        node_address=address,
                        available=bool(port.is_open or self._hub.running),
                        last_seen=now,
                        port_ref=port.port_id,
                    )
                )

        timeout_seconds = int(config_get("midi.cluster.discovery_timeout_s", 120))
        for node in self._discovery.get_discovered_nodes(online_only=False):
            if node.node_id == self._local_node_id:
                continue
            address = node.addresses[0] if node.addresses else node.hostname
            available = node.is_online(timeout_seconds)
            caps = node.midi_capabilities
            if not caps:
                continue
            for port_name in caps.output_ports:
                endpoints.append(
                    MidiEndpoint(
                        node_id=node.node_id,
                        port_name=port_name,
                        direction="output",
                        device_name=port_name,
                        node_address=address,
                        available=available,
                        last_seen=node.last_seen,
                        port_ref=port_name,
                    )
                )
            for port_name in caps.input_ports:
                endpoints.append(
                    MidiEndpoint(
                        node_id=node.node_id,
                        port_name=port_name,
                        direction="input",
                        device_name=port_name,
                        node_address=address,
                        available=available,
                        last_seen=node.last_seen,
                        port_ref=port_name,
                    )
                )

        return sorted(endpoints, key=lambda row: (row.node_id, row.direction, row.port_name))

    def get_endpoints_for_node(self, node_id: str) -> List[MidiEndpoint]:
        target = str(node_id)
        return [endpoint for endpoint in self.get_endpoints() if endpoint.node_id == target]

    def _is_auto_connect_enabled(self) -> bool:
        return bool(config_get("midi.cluster.auto_connect", False))

    def _build_auto_connect_pairs(self) -> List[Tuple[MidiEndpoint, MidiEndpoint]]:
        outputs = [
            endpoint
            for endpoint in self.get_endpoints()
            if endpoint.direction == "output"
            and endpoint.node_id == self._local_node_id
            and endpoint.available
        ]
        inputs = [endpoint for endpoint in self.get_endpoints() if endpoint.direction == "input" and endpoint.available]
        outputs.sort(key=lambda row: row.endpoint_id())
        inputs.sort(key=lambda row: row.endpoint_id())

        paired_inputs: set[str] = set()
        active_pairs = {
            (connection.source.endpoint_id(), connection.destination.endpoint_id())
            for connection in self._connections.values()
            if connection.state in {"connecting", "connected"}
        }
        pairs: List[Tuple[MidiEndpoint, MidiEndpoint]] = []
        for output in outputs:
            for input_endpoint in inputs:
                if input_endpoint.node_id == output.node_id:
                    continue
                pair_key = (output.endpoint_id(), input_endpoint.endpoint_id())
                if input_endpoint.endpoint_id() in paired_inputs or pair_key in active_pairs:
                    continue
                pairs.append((output, input_endpoint))
                paired_inputs.add(input_endpoint.endpoint_id())
                break
        return pairs

    async def _auto_connect_startup(self) -> None:
        attempts = max(1, int(config_get("midi.cluster.auto_connect.startup_attempts", 3)))
        retry_delay_s = max(0.0, float(config_get("midi.cluster.auto_connect.retry_delay_ms", 2000)) / 1000.0)

        for attempt in range(attempts):
            summary = await self._run_auto_connect_pass(
                reason="startup",
                attempt=attempt + 1,
                attempts_total=attempts,
            )
            if summary["pair_count"] <= 0:
                return

            if attempt < attempts - 1:
                await asyncio.sleep(retry_delay_s)

    async def _health_monitor(self) -> None:
        failover_timeout_ms = max(500, int(config_get("midi.cluster.failover_timeout_ms", 3000)))
        while self._running:
            await self._refresh_node_presence()
            now = _utcnow()
            endpoints_by_id = {endpoint.endpoint_id(): endpoint for endpoint in self.get_endpoints()}
            for connection in list(self._connections.values()):
                if connection.state != "connected":
                    continue

                source = endpoints_by_id.get(connection.source.endpoint_id())
                destination = endpoints_by_id.get(connection.destination.endpoint_id())
                if source is None or destination is None or not source.available or not destination.available:
                    await self._handle_node_lost(
                        connection.destination.node_id if destination is None or not destination.available else connection.source.node_id
                    )
                    continue

                if connection.transport == "rtp-midi" and connection.session_id:
                    stats = self._transport.get_session_stats(connection.session_id)
                    if stats:
                        connection.latency_ms = stats.get("latency_ms")
                        last_activity = self._parse_timestamp(stats.get("last_activity"))
                        if last_activity is not None:
                            idle_ms = (now - last_activity).total_seconds() * 1000.0
                            if idle_ms >= failover_timeout_ms:
                                connection.state = "error"
                                connection.error_message = "transport_unresponsive"
                                await self._attempt_failover(connection)
            await asyncio.sleep(5.0)

    async def _refresh_node_presence(self) -> None:
        current_nodes = {self._local_node_id}
        for node in self._discovery.get_discovered_nodes(online_only=True):
            current_nodes.add(node.node_id)

        discovered = sorted(current_nodes - self._known_nodes)
        lost = sorted(self._known_nodes - current_nodes)
        self._known_nodes = current_nodes

        for node_id in discovered:
            if node_id == self._local_node_id:
                continue
            await self._publish_node_event("midi.node.discovered", node_id)
            await self._handle_node_discovered(node_id)

        for node_id in lost:
            if node_id == self._local_node_id:
                continue
            await self._publish_node_event("midi.node.lost", node_id, severity=Severity.WARNING)
            await self._handle_node_lost(node_id)

    async def _handle_node_lost(self, node_id: str) -> None:
        affected = [
            connection
            for connection in self._connections.values()
            if connection.state == "connected"
            and (connection.source.node_id == node_id or connection.destination.node_id == node_id)
        ]
        for connection in affected:
            if connection.session_id:
                if connection.transport == "rtp-midi":
                    await self._transport.close_session(connection.session_id)
                elif connection.transport == "udp-raw":
                    await self._network_bridge.remove_session(connection.session_id)
                connection.session_id = None
            connection.state = "disconnected"
            connection.error_message = "node_lost"
            await self._publish_connection_event(
                "midi.connection.lost",
                connection,
                latency_ms=connection.latency_ms,
                severity=Severity.WARNING,
            )
            if self._is_failover_enabled():
                await self._attempt_failover(connection)

    async def _handle_node_discovered(self, node_id: str) -> None:
        if not self._is_auto_connect_enabled():
            return
        try:
            new_pairs = [
                pair
                for pair in self._build_auto_connect_pairs()
                if pair[1].node_id == str(node_id)
            ]
        except Exception as exc:
            logger.warning("Cluster MIDI auto-connect skipped for discovered node %s: %s", node_id, exc)
            self._last_auto_connect_summary = {
                "reason": "node_discovered",
                "last_run_at": _isoformat(_utcnow()),
                "pair_count": 0,
                "created_count": 0,
                "failed_count": 1,
                "created_connections": [],
                "failed_connections": [{"node_id": str(node_id), "error": str(exc), "state": "error"}],
                "transport": self._transport_mode(),
            }
            return
        for source, destination in new_pairs:
            try:
                await self.connect(source.endpoint_id(), destination.endpoint_id())
            except Exception as exc:
                logger.warning(
                    "Cluster MIDI auto-connect skipped for discovered node %s (%s -> %s): %s",
                    node_id,
                    source.endpoint_id(),
                    destination.endpoint_id(),
                    exc,
                )
                self._last_auto_connect_summary = {
                    "reason": "node_discovered",
                    "last_run_at": _isoformat(_utcnow()),
                    "pair_count": len(new_pairs),
                    "created_count": 0,
                    "failed_count": 1,
                    "created_connections": [],
                    "failed_connections": [
                        {
                            "source_endpoint_id": source.endpoint_id(),
                            "destination_endpoint_id": destination.endpoint_id(),
                            "error": str(exc),
                            "state": "error",
                        }
                    ],
                    "transport": self._transport_mode(),
                }

    async def _attempt_failover(self, connection: MidiClusterConnection) -> None:
        if connection.source.node_id != self._local_node_id:
            return

        replacement = self._find_equivalent_input(connection.destination.port_name, exclude_node_id=connection.destination.node_id)
        if replacement is None:
            return

        await self._publish_connection_event(
            "midi.failover.triggered",
            connection,
            latency_ms=connection.latency_ms,
        )
        replacement_connection = await self.connect(connection.source.endpoint_id(), replacement.endpoint_id())
        if replacement_connection.state == "connected":
            await self._publish_connection_event(
                "midi.failover.completed",
                replacement_connection,
                latency_ms=replacement_connection.latency_ms,
            )

    async def _run_auto_connect_pass(
        self,
        *,
        reason: str,
        attempt: Optional[int] = None,
        attempts_total: Optional[int] = None,
    ) -> Dict[str, Any]:
        try:
            pairs = self._build_auto_connect_pairs()
        except Exception as exc:
            summary = {
                "reason": str(reason),
                "last_run_at": _isoformat(_utcnow()),
                "pair_count": 0,
                "created_count": 0,
                "failed_count": 1,
                "created_connections": [],
                "failed_connections": [{"error": str(exc), "state": "error"}],
                "transport": self._transport_mode(),
            }
            if attempt is not None:
                summary["attempt"] = int(attempt)
            if attempts_total is not None:
                summary["attempts_total"] = int(attempts_total)
            self._last_auto_connect_summary = summary
            logger.warning("Cluster MIDI auto-connect pass failed (%s): %s", reason, exc)
            return dict(summary)
        created_connections: List[str] = []
        failed_connections: List[Dict[str, Any]] = []

        for source, destination in pairs:
            try:
                connection = await self.connect(source.endpoint_id(), destination.endpoint_id())
            except Exception as exc:
                failed_connections.append(
                    {
                        "source_endpoint_id": source.endpoint_id(),
                        "destination_endpoint_id": destination.endpoint_id(),
                        "error": str(exc),
                        "state": "error",
                    }
                )
                continue
            if connection.state == "connected":
                created_connections.append(connection.connection_id)
                continue
            failed_connections.append(
                {
                    "source_endpoint_id": source.endpoint_id(),
                    "destination_endpoint_id": destination.endpoint_id(),
                    "error": connection.error_message or "connection_failed",
                    "state": connection.state,
                }
            )

        summary = {
            "reason": str(reason),
            "last_run_at": _isoformat(_utcnow()),
            "pair_count": len(pairs),
            "created_count": len(created_connections),
            "failed_count": len(failed_connections),
            "created_connections": created_connections,
            "failed_connections": failed_connections,
            "transport": self._transport_mode(),
        }
        if attempt is not None:
            summary["attempt"] = int(attempt)
        if attempts_total is not None:
            summary["attempts_total"] = int(attempts_total)
        self._last_auto_connect_summary = summary
        return dict(summary)

    async def _establish_connection(self, connection: MidiClusterConnection) -> None:
        destination = connection.destination
        transport_mode = connection.transport

        if transport_mode == "rtp-midi":
            try:
                session = await self._transport.invite(
                    destination.node_address,
                    self._transport_port(),
                    remote_node_id=destination.node_id,
                    source_port=connection.source.port_name,
                    destination_port=connection.destination.port_name,
                    source_node_id=self._local_node_id,
                )
            except TimeoutError:
                connection.transport = "http-mesh"
                connection.error_message = "rtp_timeout_fallback_http"
                await self._publish_connection_event(
                    "midi.connection.failed",
                    connection,
                    latency_ms=None,
                    severity=Severity.WARNING,
                    extra_details={"reason": "rtp_timeout_fallback_http"},
                )
                transport_mode = "http-mesh"
            else:
                connection.session_id = session.session_id
                connection.latency_ms = session.latency_ms
                return

        if transport_mode == "http-mesh":
            self._ensure_mesh_peer(destination)
            return

        if transport_mode == "udp-raw":
            session_id = connection.connection_id
            connection.session_id = session_id
            await self._network_bridge.create_session(
                session_id=session_id,
                host=destination.node_address,
                port=self._transport_port(),
                mode="send",
            )
            return

        raise RuntimeError(f"Unsupported cluster MIDI transport: {transport_mode}")

    def _ensure_mesh_peer(self, endpoint: MidiEndpoint) -> None:
        self._network_bridge.upsert_mesh_peer(
            peer_id=endpoint.node_id,
            base_url=f"http://{endpoint.node_address}:{self._backend_port()}",
            active=True,
        )

    def _find_equivalent_input(self, port_name: str, *, exclude_node_id: str) -> Optional[MidiEndpoint]:
        target = str(port_name or "").strip()
        if not target:
            return None

        try:
            equivalent = self._device_registry.find_equivalent_port(target, exclude_node_id)
        except Exception:
            equivalent = None
        if equivalent:
            target_node_id = str(equivalent.get("node_id") or "").strip()
            candidate_names = [str(name).strip() for name in equivalent.get("port_names", []) if str(name).strip()]
            for endpoint in self.get_endpoints():
                if endpoint.direction != "input" or endpoint.node_id != target_node_id:
                    continue
                if endpoint.port_name in candidate_names or endpoint.port_ref in candidate_names:
                    return endpoint

        for endpoint in self.get_endpoints():
            if endpoint.direction != "input":
                continue
            if endpoint.node_id == exclude_node_id or not endpoint.available:
                continue
            if endpoint.port_name == target:
                return endpoint
        return None

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not self._running:
            return

        metadata = dict(message.metadata or {})
        if metadata.get("cluster_transport_received") or metadata.get("mesh_forwarded") or metadata.get("udp_raw_forwarded"):
            return

        for connection in self._connections.values():
            if connection.state != "connected":
                continue
            if connection.source.node_id != self._local_node_id:
                continue
            if message.source_port not in {connection.source.port_ref, connection.source.port_name}:
                continue
            self._schedule_coroutine(self._forward_message(connection, message))

    async def _forward_message(self, connection: MidiClusterConnection, message: MidiMessage) -> None:
        metadata = dict(message.metadata or {})
        metadata.update(
            {
                "cluster_forwarded": True,
                "cluster_connection_id": connection.connection_id,
                "cluster_source_node_id": self._local_node_id,
            }
        )

        result = await self._network_bridge.forward_to_peer(
            peer_id=connection.destination.node_id,
            source_port=connection.source.port_name,
            destination_port=connection.destination.port_name,
            data=bytes(message.data),
            metadata=metadata,
            session_id=connection.session_id,
            host=connection.destination.node_address,
            port=self._backend_port() if connection.transport == "http-mesh" else self._transport_port(),
            transport_mode=connection.transport,
        )

        if result.get("ok"):
            connection.messages_forwarded += 1
            latency_ms = result.get("latency_ms")
            if latency_ms is not None:
                connection.latency_ms = float(latency_ms)
            return

        connection.state = "error"
        connection.error_message = str(result.get("reason") or result.get("error") or "forward_failed")
        await self._publish_connection_event(
            "midi.connection.failed",
            connection,
            latency_ms=connection.latency_ms,
            severity=Severity.WARNING,
            extra_details={"reason": connection.error_message},
        )

    async def _forward_dynamic(
        self,
        *,
        source_port: str,
        destination_node_id: str,
        destination_port_name: str,
        data: bytes,
        metadata: Dict[str, Any],
    ) -> None:
        connection = self._find_forward_connection(
            source_port=source_port,
            destination_node_id=destination_node_id,
            destination_port_name=destination_port_name,
        )
        if connection is None:
            source_endpoint = self._find_local_output_endpoint(source_port)
            if source_endpoint is None:
                return
            connection = await self.connect(
                source_endpoint.endpoint_id(),
                f"{destination_node_id}:{destination_port_name}",
            )
        if connection.state != "connected":
            return

        await self._forward_message(
            connection,
            MidiMessage(
                data=bytes(data),
                timestamp_ns=time.time_ns(),
                source_port=source_port,
                destination_port=f"{destination_node_id}:{destination_port_name}",
                metadata=metadata,
            ),
        )

    def _find_local_output_endpoint(self, source_port: str) -> Optional[MidiEndpoint]:
        target = str(source_port).strip()
        if not target:
            return None
        for endpoint in self.get_endpoints():
            if endpoint.node_id != self._local_node_id or endpoint.direction != "output":
                continue
            if target in {endpoint.port_ref, endpoint.port_name, endpoint.endpoint_id()}:
                return endpoint
        return None

    def _find_forward_connection(
        self,
        *,
        source_port: str,
        destination_node_id: str,
        destination_port_name: str,
    ) -> Optional[MidiClusterConnection]:
        target_source = str(source_port).strip()
        target_node_id = str(destination_node_id).strip()
        target_port_name = str(destination_port_name).strip()
        for connection in self._connections.values():
            if connection.state != "connected":
                continue
            if connection.destination.node_id != target_node_id:
                continue
            if target_port_name not in {connection.destination.port_name, connection.destination.port_ref}:
                continue
            if target_source not in {connection.source.port_name, connection.source.port_ref, connection.source.endpoint_id()}:
                continue
            return connection
        return None

    def _schedule_coroutine(self, coroutine: "asyncio.Future[Any]") -> None:
        if self._loop is not None and self._loop.is_running():
            self._loop.call_soon_threadsafe(lambda: self._loop.create_task(coroutine))
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            asyncio.run(coroutine)
        else:
            loop.create_task(coroutine)

    async def _publish_node_event(
        self,
        kind: str,
        node_id: str,
        *,
        severity: Severity = Severity.INFO,
    ) -> None:
        await self._event_bus.emit(
            make_midi_cluster_event(
                kind=kind,
                severity=severity,
                source_node=self._local_node_id,
                source_service="midi_cluster_router",
                title="MIDI cluster node event",
                message=f"MIDI node {node_id}",
                node_id=str(node_id),
                remote_node_id=str(node_id),
                transport=self._transport_mode(),
                affected_nodes=[str(node_id)],
            )
        )

    async def _publish_connection_event(
        self,
        kind: str,
        connection: MidiClusterConnection,
        *,
        latency_ms: Optional[float],
        severity: Severity = Severity.INFO,
        extra_details: Optional[Dict[str, Any]] = None,
    ) -> None:
        details = {
            "node_id": connection.source.node_id,
            "port_name": connection.source.port_name,
            "remote_node_id": connection.destination.node_id,
            "transport": connection.transport,
            "latency_ms": latency_ms,
            "destination_port": connection.destination.port_name,
            "connection_id": connection.connection_id,
        }
        if extra_details:
            details.update(extra_details)
        await self._event_bus.emit(
            make_midi_cluster_event(
                kind=kind,
                severity=severity,
                source_node=self._local_node_id,
                source_service="midi_cluster_router",
                title="MIDI cluster connection",
                message=f"Cluster MIDI connection {connection.connection_id}",
                node_id=connection.source.node_id,
                remote_node_id=connection.destination.node_id,
                port_name=connection.source.port_name,
                destination_port=connection.destination.port_name,
                transport=connection.transport,
                latency_ms=latency_ms,
                connection_id=connection.connection_id,
                affected_nodes=[connection.source.node_id, connection.destination.node_id],
                context=details,
                dedupe_key=midi_connection_dedupe_key(connection.connection_id),
            )
        )

    def _transport_mode(self) -> str:
        mode = str(config_get("midi.cluster.transport", "rtp-midi") or "rtp-midi").strip().lower()
        return self._normalize_transport(mode)

    @staticmethod
    def _normalize_transport(mode: str) -> str:
        mode = str(mode or "rtp-midi").strip().lower()
        if mode not in {"rtp-midi", "http-mesh", "udp-raw"}:
            return "rtp-midi"
        return mode

    def _transport_port(self) -> int:
        return int(config_get("midi.cluster.rtp_midi_port", 5004))

    def _backend_port(self) -> int:
        return int(config_get("backend.port", 8080))

    def _connected_remote_count(self) -> int:
        return sum(1 for connection in self._connections.values() if connection.state == "connected")

    def _max_remote_connections(self) -> int:
        return int(config_get("midi.cluster.max_remote_connections", 32))

    def _is_failover_enabled(self) -> bool:
        return bool(config_get("midi.cluster.failover_enabled", True))

    def _alias_by_port_name(self) -> Dict[str, str]:
        mapping: Dict[str, str] = {}
        try:
            snapshot = self._device_registry.snapshot()
        except Exception:
            return mapping
        for device in snapshot.get("devices", []):
            alias = str(device.get("profile_name") or "").strip()
            if not alias:
                continue
            for port_name in device.get("port_names", []):
                normalized = str(port_name).strip()
                if normalized:
                    mapping.setdefault(normalized, alias)
        return mapping

    @staticmethod
    def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
        text = str(value or "").strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text)
        except Exception:
            return None


_midi_cluster_router_singleton: Optional[MidiClusterRouter] = None
_midi_cluster_router_singleton_lock = threading.Lock()


def get_midi_cluster_router() -> MidiClusterRouter:
    global _midi_cluster_router_singleton
    if _midi_cluster_router_singleton is None:
        with _midi_cluster_router_singleton_lock:
            if _midi_cluster_router_singleton is None:
                _midi_cluster_router_singleton = MidiClusterRouter()
    return _midi_cluster_router_singleton
