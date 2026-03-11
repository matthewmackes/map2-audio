"""RTP-MIDI cluster transport for low-latency inter-node forwarding."""

from __future__ import annotations

import asyncio
import json
import logging
import random
import socket
import struct
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.config import config_get
from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage

logger = logging.getLogger(__name__)

_APPLE_MIDI_PREFIX = b"\xff\xff"
_RTP_MIDI_PAYLOAD_TYPE = 97
_JOURNAL_LIMIT = 32


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def _coerce_node_id(value: Optional[str], fallback: str) -> str:
    normalized = str(value or "").strip()
    return normalized or fallback


def _resolve_local_node_id() -> str:
    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

        return get_enhanced_node_identity().get_node_id()
    except Exception:
        return "local"


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

    candidate_names: List[str] = []
    for device in snapshot.get("devices", []):
        profile_name = str(device.get("profile_name") or "").strip()
        device_id = str(device.get("device_id") or "").strip()
        port_names = [str(name).strip() for name in device.get("port_names", []) if str(name).strip()]
        if target == profile_name or target == device_id or target in port_names:
            candidate_names.extend(port_names)

    for candidate in candidate_names:
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
) -> None:
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
            hub.inject_remote(remote_node_id, source_port, data, injected_metadata)
            return
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
            return
    hub.inject(
        MidiMessage(
            data=bytes(data),
            timestamp_ns=time.time_ns(),
            source_port=source_port,
            destination_port=resolved_destination,
            metadata=metadata,
        )
    )


@dataclass
class RtpMidiSession:
    session_id: str
    remote_node_id: str
    remote_host: str
    remote_port: int
    local_port: int
    state: str
    initiator: bool
    ssrc: int
    sequence_number: int
    timestamp_offset: int
    created_at: datetime = field(default_factory=_utcnow)
    last_activity: datetime = field(default_factory=_utcnow)
    latency_ms: float = 0.0
    packets_sent: int = 0
    packets_received: int = 0
    packets_lost: int = 0
    source_port: str = ""
    destination_port: str = ""
    source_node_id: str = ""
    remote_ssrc: Optional[int] = None
    last_sequence_received: Optional[int] = None


class MidiRtpTransport:
    """Async RTP-MIDI transport with AppleMIDI-style control packets."""

    def __init__(
        self,
        hub: Optional[MidiHub] = None,
        *,
        bind_host: str = "0.0.0.0",
        port: Optional[int] = None,
    ) -> None:
        self._hub = hub or get_midi_hub()
        self._bind_host = str(bind_host or "0.0.0.0")
        configured_port = port if port is not None else config_get("midi.cluster.rtp_midi_port", 5004)
        self._configured_port = max(0, int(configured_port))
        self._socket: Optional[socket.socket] = None
        self._receive_task: Optional[asyncio.Task[None]] = None
        self._running = False
        self._sessions: Dict[str, RtpMidiSession] = {}
        self._pending_invites: Dict[str, asyncio.Future[RtpMidiSession]] = {}
        self._session_journal: Dict[str, List[bytes]] = {}

    @property
    def local_port(self) -> int:
        if self._socket is not None:
            try:
                return int(self._socket.getsockname()[1])
            except Exception:
                return self._configured_port
        return self._configured_port

    async def start(self) -> None:
        if self._running:
            return

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((self._bind_host, self._configured_port))
        sock.setblocking(False)

        self._socket = sock
        self._running = True
        self._receive_task = asyncio.create_task(self._receive_loop())
        logger.info("MIDI RTP transport listening on %s:%s", self._bind_host, self.local_port)

    async def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self._receive_task is not None:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        self._receive_task = None

        for future in list(self._pending_invites.values()):
            if not future.done():
                future.cancel()
        self._pending_invites.clear()

        if self._socket is not None:
            try:
                self._socket.close()
            except Exception:
                pass
        self._socket = None
        self._sessions.clear()
        self._session_journal.clear()

    async def invite(
        self,
        remote_host: str,
        remote_port: int,
        *,
        remote_node_id: str = "",
        source_port: str = "",
        destination_port: str = "",
        source_node_id: Optional[str] = None,
    ) -> RtpMidiSession:
        await self.start()

        session_id = uuid.uuid4().hex
        session = RtpMidiSession(
            session_id=session_id,
            remote_node_id=str(remote_node_id or ""),
            remote_host=str(remote_host),
            remote_port=int(remote_port),
            local_port=self.local_port,
            state="invited",
            initiator=True,
            ssrc=random.getrandbits(32),
            sequence_number=0,
            timestamp_offset=random.getrandbits(32),
            source_port=str(source_port or ""),
            destination_port=str(destination_port or ""),
            source_node_id=_coerce_node_id(source_node_id, _resolve_local_node_id()),
        )
        self._sessions[session_id] = session

        loop = asyncio.get_running_loop()
        invite_future: asyncio.Future[RtpMidiSession] = loop.create_future()
        self._pending_invites[session_id] = invite_future

        payload = {
            "session_id": session.session_id,
            "ssrc": session.ssrc,
            "local_port": session.local_port,
            "source_port": session.source_port,
            "destination_port": session.destination_port,
            "source_node_id": session.source_node_id,
        }
        await self._sendto(self._build_control_packet("IN", payload), session.remote_host, session.remote_port)

        try:
            return await asyncio.wait_for(invite_future, timeout=2.0)
        except asyncio.TimeoutError as exc:
            self._sessions.pop(session_id, None)
            raise TimeoutError(f"RTP-MIDI invitation to {remote_host}:{remote_port} timed out") from exc
        finally:
            self._pending_invites.pop(session_id, None)

    async def accept_invitation(self, packet: bytes, addr: Tuple[str, int]) -> Optional[RtpMidiSession]:
        command, payload = self._parse_control_packet(packet)
        if command != "IN":
            return None

        session_id = str(payload.get("session_id") or "").strip() or uuid.uuid4().hex
        remote_host, remote_port = addr[0], int(payload.get("local_port") or addr[1])
        session = self._sessions.get(session_id)
        if session is None:
            session = RtpMidiSession(
                session_id=session_id,
                remote_node_id=_coerce_node_id(payload.get("source_node_id"), remote_host),
                remote_host=remote_host,
                remote_port=remote_port,
                local_port=self.local_port,
                state="connected",
                initiator=False,
                ssrc=random.getrandbits(32),
                sequence_number=0,
                timestamp_offset=random.getrandbits(32),
                source_port=str(payload.get("source_port") or ""),
                destination_port=str(payload.get("destination_port") or ""),
                source_node_id=_coerce_node_id(payload.get("source_node_id"), remote_host),
                remote_ssrc=int(payload.get("ssrc") or 0) or None,
            )
            self._sessions[session_id] = session
        else:
            session.remote_host = remote_host
            session.remote_port = remote_port
            session.remote_node_id = _coerce_node_id(payload.get("source_node_id"), session.remote_node_id or remote_host)
            session.source_port = str(payload.get("source_port") or session.source_port)
            session.destination_port = str(payload.get("destination_port") or session.destination_port)
            session.remote_ssrc = int(payload.get("ssrc") or session.remote_ssrc or 0) or session.remote_ssrc
            session.state = "connected"

        session.last_activity = _utcnow()
        response_payload = {
            "session_id": session.session_id,
            "ssrc": session.ssrc,
            "local_port": self.local_port,
            "source_node_id": _resolve_local_node_id(),
        }
        await self._sendto(self._build_control_packet("OK", response_payload), remote_host, remote_port)
        return session

    async def send_midi(
        self,
        session_id: str,
        midi_bytes: bytes,
        timestamp_ns: int,
        *,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        session = self._sessions.get(str(session_id))
        if session is None or session.state != "connected":
            return False

        payload = bytes(midi_bytes)
        if not payload:
            return False

        await self.start()
        started = time.perf_counter_ns()
        packet = self._build_rtp_packet(
            session,
            payload,
            timestamp_ns=int(timestamp_ns),
            metadata=metadata,
        )

        try:
            await self._sendto(packet, session.remote_host, session.remote_port)
        except Exception:
            return False

        elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000.0
        session.packets_sent += 1
        session.sequence_number = (session.sequence_number + 1) & 0xFFFF
        session.last_activity = _utcnow()
        session.latency_ms = elapsed_ms if session.latency_ms <= 0 else ((session.latency_ms * 3.0) + elapsed_ms) / 4.0
        self._update_journal(session.session_id, payload)
        return True

    async def close_session(self, session_id: str) -> bool:
        session = self._sessions.pop(str(session_id), None)
        if session is None:
            return False

        session.state = "closed"
        self._session_journal.pop(session.session_id, None)
        try:
            await self._sendto(
                self._build_control_packet("BY", {"session_id": session.session_id}),
                session.remote_host,
                session.remote_port,
            )
        except Exception:
            return True
        return True

    def get_sessions(self) -> List[RtpMidiSession]:
        return sorted(self._sessions.values(), key=lambda row: row.session_id)

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.get(str(session_id))
        if session is None:
            return {}
        return {
            "session_id": session.session_id,
            "remote_node_id": session.remote_node_id,
            "remote_host": session.remote_host,
            "remote_port": session.remote_port,
            "local_port": session.local_port,
            "state": session.state,
            "initiator": session.initiator,
            "latency_ms": session.latency_ms,
            "packets_sent": session.packets_sent,
            "packets_received": session.packets_received,
            "packets_lost": session.packets_lost,
            "created_at": _isoformat(session.created_at),
            "last_activity": _isoformat(session.last_activity),
            "source_port": session.source_port,
            "destination_port": session.destination_port,
        }

    async def _receive_loop(self) -> None:
        assert self._socket is not None
        loop = asyncio.get_running_loop()

        while self._running:
            try:
                packet, addr = await loop.sock_recvfrom(self._socket, 8192)
            except asyncio.CancelledError:
                raise
            except OSError:
                if self._running:
                    logger.debug("RTP receive loop stopped after socket close")
                return
            except Exception as exc:
                logger.debug("RTP receive loop error: %s", exc)
                continue

            if packet.startswith(_APPLE_MIDI_PREFIX):
                command, payload = self._parse_control_packet(packet)
                if command == "IN":
                    await self.accept_invitation(packet, addr)
                elif command == "OK":
                    await self._handle_invitation_ok(payload, addr)
                elif command == "BY":
                    self._handle_bye(payload)
                continue

            self._handle_rtp_packet(packet, addr)

    async def _handle_invitation_ok(self, payload: Dict[str, Any], addr: Tuple[str, int]) -> None:
        session_id = str(payload.get("session_id") or "").strip()
        future = self._pending_invites.get(session_id)
        session = self._sessions.get(session_id)
        if future is None or session is None:
            return

        session.state = "connected"
        session.remote_host = addr[0]
        session.remote_port = int(payload.get("local_port") or addr[1])
        session.remote_node_id = _coerce_node_id(payload.get("source_node_id"), session.remote_node_id or addr[0])
        session.remote_ssrc = int(payload.get("ssrc") or 0) or session.remote_ssrc
        session.last_activity = _utcnow()
        if not future.done():
            future.set_result(session)

    def _handle_bye(self, payload: Dict[str, Any]) -> None:
        session_id = str(payload.get("session_id") or "").strip()
        if not session_id:
            return
        session = self._sessions.pop(session_id, None)
        if session is not None:
            session.state = "closed"
        self._session_journal.pop(session_id, None)

    def _handle_rtp_packet(self, packet: bytes, addr: Tuple[str, int]) -> None:
        try:
            version_payload, payload_type, sequence, timestamp, _ssrc = struct.unpack(">BBHII", packet[:12])
        except Exception:
            return

        if ((version_payload >> 6) & 0x03) != 2 or (payload_type & 0x7F) != _RTP_MIDI_PAYLOAD_TYPE:
            return
        if len(packet) < 15:
            return

        session_id_length = packet[12]
        if len(packet) < 13 + session_id_length + 2:
            return

        session_id = packet[13:13 + session_id_length].decode("utf-8", errors="ignore")
        metadata_length_offset = 13 + session_id_length
        metadata_length = struct.unpack(">H", packet[metadata_length_offset:metadata_length_offset + 2])[0]
        metadata_start = metadata_length_offset + 2
        metadata_end = metadata_start + metadata_length
        if len(packet) < metadata_end + 2:
            return
        metadata_bytes = packet[metadata_start:metadata_end]
        midi_length_offset = metadata_end
        midi_length = struct.unpack(">H", packet[midi_length_offset:midi_length_offset + 2])[0]
        midi_payload = packet[midi_length_offset + 2:midi_length_offset + 2 + midi_length]
        if not midi_payload:
            return

        try:
            packet_metadata = json.loads(metadata_bytes.decode("utf-8")) if metadata_bytes else {}
        except Exception:
            packet_metadata = {}

        session = self._sessions.get(session_id)
        if session is None:
            return

        session.remote_host = addr[0]
        session.last_activity = _utcnow()
        session.packets_received += 1

        if session.last_sequence_received is not None:
            expected = (session.last_sequence_received + 1) & 0xFFFF
            if sequence != expected:
                gap = (sequence - expected) & 0xFFFF
                if gap:
                    session.packets_lost += gap
                    self._journal_recovery(session)
        session.last_sequence_received = sequence
        self._update_journal(session.session_id, midi_payload)

        _deliver_cluster_message(
            self._hub,
            source_port=session.source_port or f"rtp:{session.remote_node_id}",
            destination_port=session.destination_port,
            data=bytes(midi_payload),
            metadata={
                **packet_metadata,
                "cluster_transport_received": True,
                "cluster_transport": "rtp-midi",
                "cluster_remote_node_id": session.remote_node_id,
                "cluster_session_id": session.session_id,
                "cluster_latency_ms": session.latency_ms,
            },
        )

    def _journal_recovery(self, session: RtpMidiSession) -> None:
        journal = list(self._session_journal.get(session.session_id) or [])
        for midi_payload in journal[-4:]:
            _deliver_cluster_message(
                self._hub,
                source_port=session.source_port or f"rtp:{session.remote_node_id}",
                destination_port=session.destination_port,
                data=bytes(midi_payload),
                metadata={
                    "cluster_transport_received": True,
                    "cluster_transport": "rtp-midi",
                    "cluster_remote_node_id": session.remote_node_id,
                    "cluster_session_id": session.session_id,
                    "journal_recovery": True,
                },
            )

    async def _sendto(self, packet: bytes, host: str, port: int) -> None:
        await self.start()
        assert self._socket is not None
        loop = asyncio.get_running_loop()
        await loop.sock_sendto(self._socket, packet, (host, int(port)))

    @staticmethod
    def _build_control_packet(command: str, payload: Dict[str, Any]) -> bytes:
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        return _APPLE_MIDI_PREFIX + command.encode("ascii")[:2].ljust(2, b"_") + struct.pack(">H", len(body)) + body

    @staticmethod
    def _parse_control_packet(packet: bytes) -> Tuple[str, Dict[str, Any]]:
        if len(packet) < 6 or not packet.startswith(_APPLE_MIDI_PREFIX):
            return "", {}
        command = packet[2:4].decode("ascii", errors="ignore")
        body_length = struct.unpack(">H", packet[4:6])[0]
        body = packet[6:6 + body_length]
        if not body:
            return command, {}
        try:
            return command, json.loads(body.decode("utf-8"))
        except Exception:
            return command, {}

    def _build_rtp_packet(
        self,
        session: RtpMidiSession,
        midi_payload: bytes,
        *,
        timestamp_ns: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bytes:
        session_id_bytes = session.session_id.encode("utf-8")
        if len(session_id_bytes) > 255:
            session_id_bytes = session_id_bytes[:255]
        timestamp = ((timestamp_ns // 1_000_000) + session.timestamp_offset) & 0xFFFFFFFF
        header = struct.pack(
            ">BBHII",
            0x80,
            _RTP_MIDI_PAYLOAD_TYPE,
            session.sequence_number & 0xFFFF,
            timestamp,
            session.ssrc & 0xFFFFFFFF,
        )
        metadata_bytes = json.dumps(dict(metadata or {}), sort_keys=True).encode("utf-8")
        metadata_bytes = metadata_bytes[:1024]
        payload = (
            bytes([len(session_id_bytes)])
            + session_id_bytes
            + struct.pack(">H", len(metadata_bytes))
            + metadata_bytes
            + struct.pack(">H", len(midi_payload))
            + midi_payload
        )
        return header + payload

    def _update_journal(self, session_id: str, midi_payload: bytes) -> None:
        status = midi_payload[0] & 0xF0 if midi_payload else None
        if status not in {0x80, 0x90, 0xB0}:
            return
        journal = self._session_journal.setdefault(session_id, [])
        journal.append(bytes(midi_payload))
        if len(journal) > _JOURNAL_LIMIT:
            del journal[:-_JOURNAL_LIMIT]


_rtp_transport_singleton: Optional[MidiRtpTransport] = None


def get_rtp_transport() -> MidiRtpTransport:
    global _rtp_transport_singleton
    if _rtp_transport_singleton is None:
        _rtp_transport_singleton = MidiRtpTransport()
    return _rtp_transport_singleton
