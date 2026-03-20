"""Network MIDI (UDP transport), cluster forwarding, and OSC bridge services."""

from __future__ import annotations

import asyncio
import json
import socket
import struct
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

from app.config import config_get
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.osc_namespace import OscNamespaceRouter, get_osc_namespace_router
from app.services.midi_hub.ports import MidiMessage


_CLUSTER_UDP_PREFIX = b"MAP2MID0"


def _resolve_local_node_id() -> str:
    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        return get_enhanced_node_identity().get_node_id()
    except Exception:
        return "local"


@dataclass
class NetworkSession:
    session_id: str
    host: str
    port: int
    mode: str
    active: bool
    created_at: float
    latency_ms: Optional[float] = None
    jitter_ms: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "host": self.host,
            "port": self.port,
            "mode": self.mode,
            "active": self.active,
            "created_at": self.created_at,
            "latency_ms": self.latency_ms,
            "jitter_ms": self.jitter_ms,
        }


@dataclass
class OscMapping:
    address: str
    destination_port: str
    message_type: str
    channel: int = 1
    cc: int = 1
    note: int = 60

    def to_dict(self) -> Dict[str, Any]:
        return {
            "address": self.address,
            "destination_port": self.destination_port,
            "message_type": self.message_type,
            "channel": self.channel,
            "cc": self.cc,
            "note": self.note,
        }


@dataclass
class MeshPeer:
    peer_id: str
    base_url: str
    active: bool = True
    created_at: float = field(default_factory=time.time)
    last_sync_at: Optional[float] = None
    last_forward_at: Optional[float] = None
    forward_count: int = 0
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "peer_id": self.peer_id,
            "base_url": self.base_url,
            "active": self.active,
            "created_at": self.created_at,
            "last_sync_at": self.last_sync_at,
            "last_forward_at": self.last_forward_at,
            "forward_count": self.forward_count,
            "error": self.error,
        }


class _UdpMidiProtocol(asyncio.DatagramProtocol):
    def __init__(self, bridge: "MidiNetworkBridge", session_id: str):
        self._bridge = bridge
        self._session_id = session_id

    def datagram_received(self, data: bytes, addr: Tuple[str, int]) -> None:
        self._bridge._handle_udp_midi(self._session_id, data, addr)


class _OscProtocol(asyncio.DatagramProtocol):
    def __init__(self, bridge: "MidiNetworkBridge"):
        self._bridge = bridge

    def datagram_received(self, data: bytes, addr: Tuple[str, int]) -> None:
        self._bridge._handle_osc_packet(data, addr)


class MidiNetworkBridge:
    def __init__(
        self,
        hub: Optional[MidiHub] = None,
        cluster_router: Optional[Any] = None,
        osc_namespace: Optional[OscNamespaceRouter] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._sessions: Dict[str, NetworkSession] = {}
        self._session_transports: Dict[str, asyncio.DatagramTransport] = {}
        self._osc_transport: Optional[asyncio.DatagramTransport] = None
        self._osc_listen_port: Optional[int] = None
        self._osc_mappings: List[OscMapping] = []
        self._mesh_peers: Dict[str, MeshPeer] = {}
        self._mesh_routes: Dict[str, Any] = {"source_instance": "local", "routes": [], "updated_at": time.time()}
        self._mesh_forwarding_enabled = False
        self._rtp_transport: Optional[Any] = None
        self._cluster_router: Optional[Any] = cluster_router
        self._local_node_id = _resolve_local_node_id()
        self._transport_mode = self._normalize_transport_mode(config_get("midi.cluster.transport", "http-mesh"))
        self._mesh_subscriber_id = "midi_network_mesh_forward"
        self._osc_namespace = osc_namespace or get_osc_namespace_router()
        self._osc_clients: set[Tuple[str, int]] = set()
        self._hub.subscribe(self._mesh_subscriber_id, self._on_hub_message)

    def list_sessions(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._sessions.values()]

    def list_osc_mappings(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._osc_mappings]

    def osc_namespace_catalog(self) -> Dict[str, Any]:
        return self._osc_namespace.catalog()

    async def dispatch_osc_namespace(self, address: str, value: Any = None, *, source: str = "api") -> Dict[str, Any]:
        payload = await self._osc_namespace.dispatch(address, value, source=source)
        await self._broadcast_namespace_events(payload.get("events") or [])
        return payload

    def list_mesh_peers(self) -> List[Dict[str, Any]]:
        self._sync_discovered_mesh_peers()
        return [row.to_dict() for row in self._mesh_peers.values()]

    def upsert_mesh_peer(self, *, peer_id: str, base_url: str, active: bool = True) -> Dict[str, Any]:
        existing = self._mesh_peers.get(peer_id)
        self._mesh_peers[peer_id] = MeshPeer(
            peer_id=peer_id,
            base_url=base_url.rstrip("/"),
            active=bool(active),
            created_at=existing.created_at if existing else time.time(),
            last_sync_at=existing.last_sync_at if existing else None,
            last_forward_at=existing.last_forward_at if existing else None,
            forward_count=existing.forward_count if existing else 0,
            error=existing.error if existing else None,
        )
        return self._mesh_peers[peer_id].to_dict()

    def remove_mesh_peer(self, peer_id: str) -> bool:
        return self._mesh_peers.pop(peer_id, None) is not None

    def set_mesh_forwarding(self, enabled: bool) -> Dict[str, Any]:
        self._mesh_forwarding_enabled = bool(enabled)
        return {"forwarding_enabled": self._mesh_forwarding_enabled}

    def mesh_status(self) -> Dict[str, Any]:
        peers = self.list_mesh_peers()
        return {
            "forwarding_enabled": self._mesh_forwarding_enabled,
            "peer_count": len(peers),
            "peers": peers,
            "route_table": dict(self._mesh_routes),
            "transport_mode": self._transport_mode,
        }

    def register_rtp_transport(self, transport: Any) -> None:
        self._rtp_transport = transport

    def set_cluster_router(self, cluster_router: Optional[Any]) -> None:
        self._cluster_router = cluster_router

    def get_transport_mode(self) -> str:
        return self._transport_mode

    def set_transport_mode(self, mode: str) -> str:
        self._transport_mode = self._normalize_transport_mode(mode)
        return self._transport_mode

    @staticmethod
    def _normalize_transport_mode(mode: Any) -> str:
        normalized = str(mode or "http-mesh").strip().lower()
        if normalized not in {"rtp-midi", "http-mesh", "udp-raw"}:
            return "http-mesh"
        return normalized

    async def publish_routes(
        self,
        *,
        source_instance: str,
        routes: List[Dict[str, Any]],
        fanout: bool = True,
    ) -> Dict[str, Any]:
        self._mesh_routes = {
            "source_instance": str(source_instance or "local"),
            "routes": [dict(route) for route in routes],
            "updated_at": time.time(),
            "route_count": len(routes),
        }
        if fanout:
            await self._mesh_post_to_peers(
                path="/api/midi/hub/network/mesh/routes",
                payload=self._mesh_routes,
            )
        return dict(self._mesh_routes)

    async def receive_mesh_forward(
        self,
        *,
        source_instance: str,
        source_port: str,
        destination_port: str,
        data_hex: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            payload = bytes.fromhex(str(data_hex))
        except Exception:
            return {"ok": False, "reason": "invalid_hex"}
        ok = _deliver_cluster_message(
            self._hub,
            source_port=source_port,
            destination_port=destination_port,
            data=payload,
            metadata={
                **dict(metadata or {}),
                "mesh_forwarded": True,
                "mesh_origin": source_instance,
            },
        )
        return {"ok": ok}

    async def create_session(self, *, session_id: str, host: str, port: int, mode: str = "send") -> Dict[str, Any]:
        mode_normalized = "listen" if str(mode).strip().lower() == "listen" else "send"
        row = NetworkSession(
            session_id=session_id,
            host=host,
            port=int(port),
            mode=mode_normalized,
            active=True,
            created_at=time.time(),
        )
        self._sessions[session_id] = row

        if mode_normalized == "listen":
            await self._open_listener(session_id)

        return row.to_dict()

    async def remove_session(self, session_id: str) -> bool:
        removed = self._sessions.pop(session_id, None)
        transport = self._session_transports.pop(session_id, None)
        if transport is not None:
            try:
                transport.close()
            except RuntimeError:
                pass
        return removed is not None

    async def send_midi(self, session_id: str, data: bytes) -> bool:
        session = self._sessions.get(session_id)
        if session is None or not session.active:
            return False

        started = time.perf_counter_ns()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.5)
        try:
            sock.sendto(bytes(data), (session.host, int(session.port)))
            elapsed = (time.perf_counter_ns() - started) / 1_000_000.0
            if session.latency_ms is None:
                session.latency_ms = elapsed
            else:
                session.jitter_ms = abs(float(session.latency_ms) - elapsed)
                session.latency_ms = (float(session.latency_ms) + elapsed) / 2.0
            return True
        except Exception:
            return False
        finally:
            sock.close()

    async def send_cluster_udp(
        self,
        *,
        session_id: str,
        source_port: str,
        destination_port: str,
        data: bytes,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        session = self._sessions.get(session_id)
        if session is None or not session.active:
            return False

        packet = _encode_cluster_packet(
            source_port=source_port,
            destination_port=destination_port,
            data=data,
            metadata=metadata,
        )
        started = time.perf_counter_ns()
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.5)
        try:
            sock.sendto(packet, (session.host, int(session.port)))
            elapsed = (time.perf_counter_ns() - started) / 1_000_000.0
            if session.latency_ms is None:
                session.latency_ms = elapsed
            else:
                session.jitter_ms = abs(float(session.latency_ms) - elapsed)
                session.latency_ms = (float(session.latency_ms) + elapsed) / 2.0
            return True
        except Exception:
            return False
        finally:
            sock.close()

    async def forward_to_peer(
        self,
        *,
        peer_id: str,
        source_port: str,
        destination_port: str,
        data: bytes,
        metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        host: Optional[str] = None,
        port: Optional[int] = None,
        transport_mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        selected_mode = self._normalize_transport_mode(transport_mode or self._transport_mode)
        payload = {
            "source_instance": "cluster",
            "source_port": source_port,
            "destination_port": destination_port,
            "data_hex": bytes(data).hex(),
            "metadata": dict(metadata or {}),
        }

        if selected_mode == "rtp-midi":
            if self._rtp_transport is None or not session_id:
                return {"ok": False, "reason": "missing_rtp_session", "transport": selected_mode}
            ok = await self._rtp_transport.send_midi(session_id, bytes(data), time.time_ns(), metadata=metadata)
            stats = self._rtp_transport.get_session_stats(session_id) if ok else {}
            return {
                "ok": ok,
                "transport": selected_mode,
                "latency_ms": stats.get("latency_ms"),
            }

        if selected_mode == "udp-raw":
            if not session_id or not host or port is None:
                return {"ok": False, "reason": "missing_udp_target", "transport": selected_mode}
            if session_id not in self._sessions:
                await self.create_session(session_id=session_id, host=host, port=int(port), mode="send")
            ok = await self.send_cluster_udp(
                session_id=session_id,
                source_port=source_port,
                destination_port=destination_port,
                data=bytes(data),
                metadata=metadata,
            )
            session = self._sessions.get(session_id)
            return {
                "ok": ok,
                "transport": selected_mode,
                "latency_ms": session.latency_ms if session is not None else None,
            }

        self._sync_discovered_mesh_peers()
        if peer_id not in self._mesh_peers:
            if not host:
                return {"ok": False, "reason": "missing_mesh_peer", "transport": selected_mode}
            mesh_port = int(port if port is not None else config_get("backend.port", 8080))
            self.upsert_mesh_peer(peer_id=peer_id, base_url=f"http://{host}:{mesh_port}", active=True)

        result = await self._mesh_post_to_peer(
            peer_id=peer_id,
            path="/api/midi/hub/network/mesh/forward",
            payload=payload,
        )
        result["transport"] = selected_mode
        return result

    async def start_osc_server(self, listen_port: int) -> Dict[str, Any]:
        if self._osc_transport is not None:
            self._osc_transport.close()
            self._osc_transport = None

        loop = asyncio.get_running_loop()
        transport, _protocol = await loop.create_datagram_endpoint(
            lambda: _OscProtocol(self),
            local_addr=("0.0.0.0", int(listen_port)),
        )
        self._osc_transport = transport
        self._osc_listen_port = int(listen_port)
        return {"ok": True, "listen_port": self._osc_listen_port}

    async def stop_osc_server(self) -> Dict[str, Any]:
        if self._osc_transport is not None:
            try:
                self._osc_transport.close()
            except RuntimeError:
                pass
            self._osc_transport = None
        port = self._osc_listen_port
        self._osc_listen_port = None
        return {"ok": True, "listen_port": port}

    async def send_osc(self, *, host: str, port: int, address: str, value: float) -> Dict[str, Any]:
        packet = _encode_osc_packet(address, value)
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.5)
        try:
            sock.sendto(packet, (host, int(port)))
            return {"ok": True}
        finally:
            sock.close()

    def set_osc_mappings(self, mappings: List[Dict[str, Any]]) -> Dict[str, Any]:
        normalized: List[OscMapping] = []
        for mapping in mappings:
            try:
                row = OscMapping(
                    address=str(mapping.get("address") or "").strip() or "/midi",
                    destination_port=str(mapping.get("destination_port") or ""),
                    message_type=str(mapping.get("message_type") or "cc"),
                    channel=int(mapping.get("channel", 1)),
                    cc=int(mapping.get("cc", 1)),
                    note=int(mapping.get("note", 60)),
                )
            except Exception:
                continue
            normalized.append(row)
        self._osc_mappings = normalized
        return {"count": len(self._osc_mappings), "mappings": self.list_osc_mappings()}

    async def _open_listener(self, session_id: str) -> None:
        session = self._sessions.get(session_id)
        if session is None:
            return
        transport = self._session_transports.get(session_id)
        if transport is not None:
            transport.close()

        loop = asyncio.get_running_loop()
        transport, _protocol = await loop.create_datagram_endpoint(
            lambda: _UdpMidiProtocol(self, session_id),
            local_addr=("0.0.0.0", int(session.port)),
        )
        self._session_transports[session_id] = transport

    def _on_hub_message(self, message: Any) -> None:
        metadata = dict((getattr(message, "metadata", None) or {}))
        if metadata.get("mesh_forwarded") or metadata.get("cluster_transport_received") or metadata.get("cluster_remote_injected"):
            return
        source_port = str(getattr(message, "source_port", "") or "")
        destination_port = str(getattr(message, "destination_port", "") or "")
        data = bytes(getattr(message, "data", b""))
        if not source_port or not destination_port or not data:
            return

        remote_destination = self._split_cluster_endpoint(destination_port)
        if self._cluster_router is not None and remote_destination is not None:
            destination_node_id, remote_port_name = remote_destination
            self._cluster_router.forward(
                source_port=source_port,
                destination_node_id=destination_node_id,
                destination_port_name=remote_port_name,
                data=data,
                metadata=metadata,
            )
            return

        if not self._mesh_forwarding_enabled:
            return

        payload = {
            "source_instance": "local",
            "source_port": source_port,
            "destination_port": destination_port,
            "data_hex": data.hex(),
            "metadata": metadata,
        }
        self._schedule_coroutine(
            self._mesh_post_to_peers(
                path="/api/midi/hub/network/mesh/forward",
                payload=payload,
                mark_forward=True,
            )
        )

    def _schedule_coroutine(self, coroutine: "asyncio.Future[Any]") -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coroutine)
            return
        except RuntimeError:
            pass
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.call_soon_threadsafe(lambda: asyncio.create_task(coroutine))
                return
        except Exception:
            pass
        try:
            asyncio.run(coroutine)
        except Exception:
            return

    async def _mesh_post_to_peers(self, *, path: str, payload: Dict[str, Any], mark_forward: bool = False) -> Dict[str, Any]:
        self._sync_discovered_mesh_peers()
        successes = 0
        failures = 0
        for peer in self._mesh_peers.values():
            if not peer.active:
                continue
            url = f"{peer.base_url.rstrip('/')}{path}"
            request = urllib_request.Request(
                url=url,
                data=_encode_json_bytes(payload),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                await asyncio.to_thread(_send_request, request)
                peer.error = None
                peer.last_sync_at = time.time()
                if mark_forward:
                    peer.last_forward_at = time.time()
                    peer.forward_count += 1
                successes += 1
            except Exception as exc:
                peer.error = str(exc)
                failures += 1
        return {"ok": failures == 0, "successes": successes, "failures": failures}

    async def _mesh_post_to_peer(self, *, peer_id: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self._sync_discovered_mesh_peers()
        peer = self._mesh_peers.get(peer_id)
        if peer is None or not peer.active:
            return {"ok": False, "reason": "peer_inactive"}
        url = f"{peer.base_url.rstrip('/')}{path}"
        request = urllib_request.Request(
            url=url,
            data=_encode_json_bytes(payload),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            started = time.perf_counter_ns()
            await asyncio.to_thread(_send_request, request)
            elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000.0
            peer.error = None
            peer.last_sync_at = time.time()
            peer.last_forward_at = time.time()
            peer.forward_count += 1
            return {"ok": True, "latency_ms": elapsed_ms}
        except Exception as exc:
            peer.error = str(exc)
            return {"ok": False, "reason": str(exc)}

    def _handle_udp_midi(self, session_id: str, data: bytes, addr: Tuple[str, int]) -> None:
        cluster_packet = _decode_cluster_packet(data)
        if cluster_packet is not None:
            _deliver_cluster_message(
                self._hub,
                source_port=str(cluster_packet["source_port"]),
                destination_port=cluster_packet["destination_port"],
                data=bytes(cluster_packet["data"]),
                metadata={
                    **dict(cluster_packet.get("metadata") or {}),
                    "udp_raw_forwarded": True,
                    "udp_raw_session_id": session_id,
                },
            )
            return
        source_port = f"network:{session_id}:{addr[0]}:{addr[1]}"
        for mapping in self._osc_mappings:
            if mapping.destination_port:
                self._hub.send(source_port=source_port, destination_port=mapping.destination_port, data=bytes(data))

    def _handle_osc_packet(self, data: bytes, addr: Tuple[str, int]) -> None:
        address, value = _decode_osc_packet(data)
        if not address:
            return
        self._osc_clients.add((str(addr[0]), int(addr[1])))
        if address.startswith("/map2/"):
            self._schedule_coroutine(self._handle_namespace_packet(address, value, addr))
            return
        for mapping in self._osc_mappings:
            if mapping.address != address:
                continue
            channel = max(1, min(16, int(mapping.channel)))
            if mapping.message_type == "note":
                note = max(0, min(127, int(mapping.note)))
                velocity = max(0, min(127, int(round(float(value) * 127.0))))
                payload = bytes([0x90 | ((channel - 1) & 0x0F), note, velocity])
            else:
                cc = max(0, min(127, int(mapping.cc)))
                cc_value = max(0, min(127, int(round(float(value) * 127.0))))
                payload = bytes([0xB0 | ((channel - 1) & 0x0F), cc, cc_value])
            self._hub.send(source_port=f"osc:{addr[0]}:{addr[1]}", destination_port=mapping.destination_port, data=payload)

    async def _handle_namespace_packet(self, address: str, value: Any, addr: Tuple[str, int]) -> None:
        payload = await self._osc_namespace.dispatch(address, value, source=f"osc:{addr[0]}:{addr[1]}")
        await self._broadcast_namespace_events(payload.get("events") or [])

    async def _broadcast_namespace_events(self, events: List[Dict[str, Any]]) -> None:
        if not events or not self._osc_clients:
            return
        for host, port in list(self._osc_clients):
            for event in events:
                packet = _encode_osc_packet(str(event.get("address") or "/map2/out/event"), event.get("value"))
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.settimeout(0.2)
                try:
                    sock.sendto(packet, (host, int(port)))
                except Exception:
                    continue
                finally:
                    sock.close()

    def _sync_discovered_mesh_peers(self) -> None:
        if not bool(config_get("midi.cluster.enabled", False)):
            return
        try:
            from app.services.midi_hub.midi_discovery import get_midi_discovery_service
        except Exception:
            return

        backend_port = int(config_get("backend.port", 8080))
        for node in get_midi_discovery_service().get_discovered_nodes(online_only=True):
            if node.node_id == self._local_node_id:
                continue
            address = node.addresses[0] if node.addresses else node.hostname
            self.upsert_mesh_peer(
                peer_id=node.node_id,
                base_url=f"http://{address}:{int(getattr(node, 'port', backend_port) or backend_port)}",
                active=True,
            )

    def _split_cluster_endpoint(self, identifier: str) -> Optional[Tuple[str, str]]:
        target = str(identifier or "").strip()
        if not target or ":" not in target:
            return None
        for port in self._hub.list_ports():
            if target in {port.port_id, port.name}:
                return None
        node_id, port_name = target.split(":", 1)
        node_id = node_id.strip()
        port_name = port_name.strip()
        if not node_id or not port_name or node_id == self._local_node_id:
            return None
        return node_id, port_name


# Minimal OSC encode/decode for single float value payloads.
def _pad4(data: bytes) -> bytes:
    padding = (4 - (len(data) % 4)) % 4
    return data + (b"\x00" * padding)


def _encode_osc_packet(address: str, value: Any) -> bytes:
    address_bytes = _pad4(address.encode("utf-8") + b"\x00")
    if isinstance(value, str):
        tags = _pad4(b",s\x00")
        payload = _pad4(str(value).encode("utf-8") + b"\x00")
    elif isinstance(value, int) and not isinstance(value, bool):
        tags = _pad4(b",i\x00")
        payload = struct.pack(">i", int(value))
    else:
        tags = _pad4(b",f\x00")
        payload = struct.pack(">f", float(value if value is not None else 0.0))
    return address_bytes + tags + payload


def _decode_osc_packet(packet: bytes) -> Tuple[str, float]:
    try:
        address_end = packet.index(0)
        address = packet[:address_end].decode("utf-8", errors="ignore")
        offset = ((address_end // 4) + 1) * 4
        tag_end = packet.index(0, offset)
        tags = packet[offset:tag_end].decode("utf-8", errors="ignore")
        offset = ((tag_end // 4) + 1) * 4
        if tags == ",f" and len(packet) >= offset + 4:
            (value,) = struct.unpack(">f", packet[offset:offset + 4])
            return address, float(value)
        if tags == ",i" and len(packet) >= offset + 4:
            (value,) = struct.unpack(">i", packet[offset:offset + 4])
            return address, float(value)
        if tags == ",s":
            value_end = packet.index(0, offset)
            return address, packet[offset:value_end].decode("utf-8", errors="ignore")
        return address, 0.0
    except Exception:
        return "", 0.0


def _encode_json_bytes(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True).encode("utf-8")


def _resolve_destination_port(hub: MidiHub, identifier: Optional[str]) -> Optional[str]:
    target = str(identifier or "").strip()
    if not target:
        return None

    ports = hub.list_ports()
    for port in ports:
        if port.port_id == target or port.name == target:
            return port.port_id

    try:
        from app.services.midi_hub.device_registry import get_midi_device_registry

        snapshot = get_midi_device_registry().snapshot()
    except Exception:
        return target

    candidates: List[str] = []
    for device in snapshot.get("devices", []):
        profile_name = str(device.get("profile_name") or "").strip()
        device_id = str(device.get("device_id") or "").strip()
        port_names = [str(name).strip() for name in device.get("port_names", []) if str(name).strip()]
        if target == profile_name or target == device_id or target in port_names:
            candidates.extend(port_names)

    for candidate in candidates:
        for port in ports:
            if port.port_id == candidate or port.name == candidate:
                return port.port_id

    return target


def _deliver_cluster_message(
    hub: MidiHub,
    *,
    source_port: str,
    destination_port: Optional[str],
    data: bytes,
    metadata: Dict[str, Any],
) -> bool:
    resolved_destination = _resolve_destination_port(hub, destination_port)
    remote_node_id = str(
        metadata.get("origin_node_id")
        or metadata.get("cluster_remote_node_id")
        or metadata.get("cluster_source_node_id")
        or ""
    ).strip()
    if remote_node_id:
        injected_metadata = dict(metadata)
        if resolved_destination:
            injected_metadata["destination_port"] = resolved_destination
        try:
            return bool(hub.inject_remote(remote_node_id, source_port, data, injected_metadata))
        except AttributeError:
            pass
    if resolved_destination:
        delivered = hub.send(
            source_port=source_port,
            destination_port=resolved_destination,
            data=data,
            metadata=metadata,
        )
        if delivered:
            return True
    return hub.inject(
        MidiMessage(
            data=bytes(data),
            timestamp_ns=time.time_ns(),
            source_port=source_port,
            destination_port=resolved_destination,
            metadata=metadata,
        )
    )


def _encode_cluster_packet(
    *,
    source_port: str,
    destination_port: str,
    data: bytes,
    metadata: Optional[Dict[str, Any]] = None,
) -> bytes:
    payload = {
        "source_port": str(source_port),
        "destination_port": str(destination_port),
        "data_hex": bytes(data).hex(),
        "metadata": dict(metadata or {}),
    }
    body = json.dumps(payload, sort_keys=True).encode("utf-8")
    return _CLUSTER_UDP_PREFIX + struct.pack(">H", len(body)) + body


def _decode_cluster_packet(packet: bytes) -> Optional[Dict[str, Any]]:
    if not packet.startswith(_CLUSTER_UDP_PREFIX) or len(packet) < len(_CLUSTER_UDP_PREFIX) + 2:
        return None
    body_length = struct.unpack(">H", packet[len(_CLUSTER_UDP_PREFIX):len(_CLUSTER_UDP_PREFIX) + 2])[0]
    body = packet[len(_CLUSTER_UDP_PREFIX) + 2:len(_CLUSTER_UDP_PREFIX) + 2 + body_length]
    if not body:
        return None
    try:
        payload = json.loads(body.decode("utf-8"))
    except Exception:
        return None
    try:
        payload["data"] = bytes.fromhex(str(payload.get("data_hex") or ""))
    except Exception:
        return None
    return payload


def _send_request(request: urllib_request.Request) -> None:
    try:
        with urllib_request.urlopen(request, timeout=1.0):
            return
    except urllib_error.URLError as exc:
        raise RuntimeError(str(exc)) from exc


_midi_network_bridge_singleton: Optional[MidiNetworkBridge] = None


def get_midi_network_bridge() -> MidiNetworkBridge:
    global _midi_network_bridge_singleton
    if _midi_network_bridge_singleton is None:
        _midi_network_bridge_singleton = MidiNetworkBridge()
    return _midi_network_bridge_singleton
