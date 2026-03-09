"""Network MIDI (UDP transport) and OSC bridge services."""

from __future__ import annotations

import asyncio
import socket
import struct
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib import error as urllib_error
from urllib import request as urllib_request

from app.services.midi_hub.hub import MidiHub, get_midi_hub


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
    def __init__(self, hub: Optional[MidiHub] = None) -> None:
        self._hub = hub or get_midi_hub()
        self._sessions: Dict[str, NetworkSession] = {}
        self._session_transports: Dict[str, asyncio.DatagramTransport] = {}
        self._osc_transport: Optional[asyncio.DatagramTransport] = None
        self._osc_listen_port: Optional[int] = None
        self._osc_mappings: List[OscMapping] = []
        self._mesh_peers: Dict[str, MeshPeer] = {}
        self._mesh_routes: Dict[str, Any] = {"source_instance": "local", "routes": [], "updated_at": time.time()}
        self._mesh_forwarding_enabled = False
        self._mesh_subscriber_id = "midi_network_mesh_forward"
        self._hub.subscribe(self._mesh_subscriber_id, self._on_hub_message)

    def list_sessions(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._sessions.values()]

    def list_osc_mappings(self) -> List[Dict[str, Any]]:
        return [row.to_dict() for row in self._osc_mappings]

    def list_mesh_peers(self) -> List[Dict[str, Any]]:
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
        return {
            "forwarding_enabled": self._mesh_forwarding_enabled,
            "peer_count": len(self._mesh_peers),
            "peers": self.list_mesh_peers(),
            "route_table": dict(self._mesh_routes),
        }

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
        ok = self._hub.send(
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
        if not self._mesh_forwarding_enabled:
            return
        metadata = dict((getattr(message, "metadata", None) or {}))
        if metadata.get("mesh_forwarded"):
            return
        source_port = str(getattr(message, "source_port", "") or "")
        destination_port = str(getattr(message, "destination_port", "") or "")
        data = bytes(getattr(message, "data", b""))
        if not source_port or not destination_port or not data:
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

    def _handle_udp_midi(self, session_id: str, data: bytes, addr: Tuple[str, int]) -> None:
        source_port = f"network:{session_id}:{addr[0]}:{addr[1]}"
        for mapping in self._osc_mappings:
            if mapping.destination_port:
                self._hub.send(source_port=source_port, destination_port=mapping.destination_port, data=bytes(data))

    def _handle_osc_packet(self, data: bytes, addr: Tuple[str, int]) -> None:
        address, value = _decode_osc_packet(data)
        if not address:
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


# Minimal OSC encode/decode for single float value payloads.
def _pad4(data: bytes) -> bytes:
    padding = (4 - (len(data) % 4)) % 4
    return data + (b"\x00" * padding)


def _encode_osc_packet(address: str, value: float) -> bytes:
    address_bytes = _pad4(address.encode("utf-8") + b"\x00")
    tags = _pad4(b",f\x00")
    payload = struct.pack(">f", float(value))
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
        return address, 0.0
    except Exception:
        return "", 0.0


def _encode_json_bytes(payload: Dict[str, Any]) -> bytes:
    import json

    return json.dumps(payload, sort_keys=True).encode("utf-8")


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
