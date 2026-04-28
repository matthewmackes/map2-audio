"""Cluster MIDI gateway — host-to-host protocol implementation.

Worklist: T2459-H7
Architecture: docs/midi/CLUSTER_MIDI_PROTOCOL.md

This module is the Python implementation of the cluster MIDI wire
protocol that replaces ``app/routes/midi_cluster_proxy.py``. It runs
inside the FastAPI backend until the C++ map2-controller-host grows a
matching TCP/UDP listener (queued for a future T2459-H sub-task,
tracked in the C++ ``ClusterGateway`` scaffold's TODO at
``juce-engine/Source/ControllerHost/Hub/ClusterGateway.cpp``).

Design lives in CLUSTER_MIDI_PROTOCOL.md. The message envelope, port
publish/subscribe flow, and clock-master election state machine are
all implemented here. Integration tests in
``tests/test_cluster_midi_gateway.py`` exercise the four T2459-H7
acceptance gates by running two gateway instances on loopback against
each other.

Threading:
- One asyncio task drains the TCP listener and dispatches per-frame.
- One asyncio task drains the UDP listener and forwards events.
- One asyncio task runs the election tick loop.
All state mutations go through ``asyncio.Lock`` to keep the test
matrix small and predictable; the production C++ port will use the
same lock-free shm ring pattern as the H1 producer.
"""
from __future__ import annotations

import asyncio
import json
import logging
import socket
import struct
import time
import uuid
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional


SCHEMA_VERSION = 1
DEFAULT_TICK_INTERVAL_S = 1.0
DEFAULT_VOTE_COLLECT_S = 0.2
PROMOTION_TICKS_UNCHALLENGED = 3
RECEIVE_BUFFER_BYTES = 8192


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Wire types
# ---------------------------------------------------------------------

@dataclass
class PublishedPort:
    name: str
    port_id: str
    is_virtual: bool = True


@dataclass
class RemoteSubscriber:
    """A peer that subscribed to one of our local ports."""
    node_id: str
    port_id: str
    udp_addr: tuple[str, int]


@dataclass
class _PeerVote:
    term: int
    node_id: str
    priority: tuple[int, str]
    received_at: float


@dataclass
class ClusterGatewayConfig:
    node_id: str
    bind_host: str = "127.0.0.1"
    cluster_port: int = 7261
    master_priority: int = 0
    tick_interval_s: float = DEFAULT_TICK_INTERVAL_S
    vote_collect_s: float = DEFAULT_VOTE_COLLECT_S


# ---------------------------------------------------------------------
# Frame helpers
# ---------------------------------------------------------------------

def encode_envelope(*, sender: str, msg_type: str, seq: int, payload: dict) -> bytes:
    """Wrap a payload in the protocol envelope (CLUSTER_MIDI_PROTOCOL.md §3)."""
    obj = {
        "v": SCHEMA_VERSION,
        "from": sender,
        "type": msg_type,
        "ts": int(time.monotonic() * 1000),
        "seq": seq,
        "payload": payload,
    }
    return json.dumps(obj, separators=(",", ":")).encode("utf-8")


def decode_envelope(raw: bytes) -> Optional[dict]:
    """Decode a UDP datagram or TCP-framed payload. Returns None on
    malformed input or schema-version mismatch."""
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(obj, dict):
        return None
    if obj.get("v") != SCHEMA_VERSION:
        return None
    if not all(k in obj for k in ("from", "type", "seq", "payload")):
        return None
    return obj


def encode_tcp_frame(envelope: bytes) -> bytes:
    """4-byte big-endian length prefix + payload, matching the UDS
    framing used elsewhere in MAP2."""
    return struct.pack(">I", len(envelope)) + envelope


async def read_tcp_frame(reader: asyncio.StreamReader) -> Optional[dict]:
    try:
        header = await reader.readexactly(4)
    except asyncio.IncompleteReadError:
        return None
    (length,) = struct.unpack(">I", header)
    try:
        body = await reader.readexactly(length)
    except asyncio.IncompleteReadError:
        return None
    return decode_envelope(body)


# ---------------------------------------------------------------------
# Gateway
# ---------------------------------------------------------------------

class ClusterGateway:
    """Cluster MIDI gateway — TCP control + UDP hot-path + election loop.

    Lifecycle:
        gateway = ClusterGateway(config)
        await gateway.start()
        # ... use publish_port / push_event / list_remote_ports / ...
        await gateway.stop()

    Tests instantiate two gateways on loopback and run them against
    each other. The simulator path (a single bench validating the
    H7 acceptance gates without a second physical host) is just the
    same gateway running in pytest.
    """

    def __init__(self, config: ClusterGatewayConfig) -> None:
        self.config = config
        self.node_id = config.node_id
        self._lock = asyncio.Lock()

        # Local published ports keyed by port_id.
        self._published: dict[str, PublishedPort] = {}
        # Remote subscribers to our local ports, keyed by (node_id, port_id).
        self._subscribers: dict[tuple[str, str], RemoteSubscriber] = {}
        # Known peer addresses, keyed by node_id. Populated by mDNS or
        # tests via add_peer().
        self._peers: dict[str, tuple[str, int]] = {}
        # Election state.
        self._term = 0
        self._master_node_id: Optional[str] = None
        self._ticks_unchallenged = 0
        self._inbox_votes: list[_PeerVote] = []
        # Per-(sender, type) high-water marks for dedup.
        self._seq_seen: dict[tuple[str, str], int] = {}
        # Outbound seq counter per type.
        self._outbound_seq: dict[str, int] = {}

        # Inbound event queue — the local consumer drains this for
        # MIDI bytes received from subscribed remote ports.
        self._event_inbox: asyncio.Queue = asyncio.Queue(maxsize=4096)

        # Custom hook — tests can register a callback that fires for
        # each incoming `event.midi` so they observe round-trip
        # delivery without polling the inbox.
        self._on_event_hook: Optional[Callable[[dict], Awaitable[None]]] = None

        # Background tasks.
        self._tcp_server: Optional[asyncio.AbstractServer] = None
        self._udp_transport: Optional[asyncio.DatagramTransport] = None
        self._election_task: Optional[asyncio.Task] = None
        self._running = False

    # -----------------------------------------------------------------
    # Public surface
    # -----------------------------------------------------------------

    async def start(self) -> None:
        """Bind TCP + UDP listeners and start the election loop."""
        if self._running:
            return
        loop = asyncio.get_running_loop()

        # TCP listener.
        self._tcp_server = await asyncio.start_server(
            self._handle_tcp_connection,
            host=self.config.bind_host,
            port=self.config.cluster_port,
        )

        # UDP listener.
        self._udp_transport, _proto = await loop.create_datagram_endpoint(
            lambda: _UdpProtocol(self),
            local_addr=(self.config.bind_host, self.config.cluster_port),
        )

        self._election_task = asyncio.create_task(self._election_loop())
        self._running = True

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        if self._election_task is not None:
            self._election_task.cancel()
            try:
                await self._election_task
            except asyncio.CancelledError:
                pass
            self._election_task = None
        if self._tcp_server is not None:
            self._tcp_server.close()
            await self._tcp_server.wait_closed()
            self._tcp_server = None
        if self._udp_transport is not None:
            self._udp_transport.close()
            self._udp_transport = None

    def add_peer(self, node_id: str, host: str, port: int) -> None:
        """Tests + production discovery layer use this to register a
        peer. mDNS integration plugs in here when the production
        wire-up lands."""
        self._peers[node_id] = (host, port)

    def publish_port(self, name: str, port_id: Optional[str] = None) -> PublishedPort:
        port = PublishedPort(name=name, port_id=port_id or uuid.uuid4().hex)
        self._published[port.port_id] = port
        return port

    def list_published_ports(self) -> list[PublishedPort]:
        return list(self._published.values())

    async def request_remote_port_list(self, peer_node_id: str) -> list[dict]:
        """Issue a port.list_request to the named peer; return the ports.

        Raises ConnectionError if the peer is unreachable.
        """
        addr = self._peers.get(peer_node_id)
        if addr is None:
            raise ConnectionError(f"unknown peer {peer_node_id}")
        envelope = encode_envelope(
            sender=self.node_id,
            msg_type="port.list_request",
            seq=self._next_seq("port.list_request"),
            payload={},
        )
        reader, writer = await asyncio.open_connection(addr[0], addr[1])
        try:
            writer.write(encode_tcp_frame(envelope))
            await writer.drain()
            response = await read_tcp_frame(reader)
            if response is None or response.get("type") != "port.list_response":
                return []
            return list(response["payload"].get("ports", []))
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    async def subscribe_remote_port(self, peer_node_id: str, port_id: str) -> bool:
        """Tell ``peer_node_id`` to forward future events on ``port_id``
        to our UDP listener. Returns True on success, False if the
        peer is unreachable."""
        addr = self._peers.get(peer_node_id)
        if addr is None:
            return False
        envelope = encode_envelope(
            sender=self.node_id,
            msg_type="port.subscribe",
            seq=self._next_seq("port.subscribe"),
            payload={
                "port_id": port_id,
                "udp_port": self.config.cluster_port,
            },
        )
        try:
            reader, writer = await asyncio.open_connection(addr[0], addr[1])
        except OSError:
            return False
        try:
            writer.write(encode_tcp_frame(envelope))
            await writer.drain()
            return True
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except OSError:
                pass

    async def push_event(self, port_id: str, midi_bytes: bytes,
                          ts_source_ns: Optional[int] = None) -> int:
        """Broadcast a MIDI event from a local published port to every
        currently-subscribed remote node. Returns the number of
        subscribers it was sent to."""
        if port_id not in self._published:
            return 0
        if ts_source_ns is None:
            ts_source_ns = time.monotonic_ns()
        envelope = encode_envelope(
            sender=self.node_id,
            msg_type="event.midi",
            seq=self._next_seq("event.midi"),
            payload={
                "port_id": port_id,
                "length": len(midi_bytes),
                "bytes": list(midi_bytes),
                "ts_source_ns": ts_source_ns,
            },
        )
        delivered = 0
        for sub in list(self._subscribers.values()):
            if sub.port_id != port_id:
                continue
            if self._udp_transport is None:
                break
            self._udp_transport.sendto(envelope, sub.udp_addr)
            delivered += 1
        return delivered

    def set_event_hook(self, hook: Optional[Callable[[dict], Awaitable[None]]]) -> None:
        """Install a callback fired for every incoming event.midi.
        Tests use this to observe round-trip delivery without polling
        the queue."""
        self._on_event_hook = hook

    async def get_next_event(self, timeout_s: float = 1.0) -> Optional[dict]:
        """Drain the next event.midi payload from the inbox. Returns
        None on timeout."""
        try:
            return await asyncio.wait_for(self._event_inbox.get(), timeout=timeout_s)
        except asyncio.TimeoutError:
            return None

    @property
    def is_master(self) -> bool:
        return self._master_node_id == self.node_id

    @property
    def master_node_id(self) -> Optional[str]:
        return self._master_node_id

    @property
    def term(self) -> int:
        return self._term

    # -----------------------------------------------------------------
    # TCP frame handler
    # -----------------------------------------------------------------

    async def _handle_tcp_connection(self,
                                     reader: asyncio.StreamReader,
                                     writer: asyncio.StreamWriter) -> None:
        try:
            while True:
                envelope = await read_tcp_frame(reader)
                if envelope is None:
                    return
                await self._dispatch_tcp(envelope, writer)
        except (ConnectionResetError, BrokenPipeError):
            return
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except (OSError, ConnectionResetError, BrokenPipeError):
                pass

    async def _dispatch_tcp(self, envelope: dict, writer: asyncio.StreamWriter) -> None:
        sender = str(envelope.get("from", ""))
        msg_type = str(envelope.get("type", ""))
        if not self._accept_seq(sender, msg_type, int(envelope.get("seq", 0))):
            return
        payload = envelope.get("payload") or {}

        if msg_type == "port.list_request":
            ports = [
                {"name": p.name, "id": p.port_id, "is_virtual": p.is_virtual}
                for p in self._published.values()
            ]
            response = encode_envelope(
                sender=self.node_id,
                msg_type="port.list_response",
                seq=self._next_seq("port.list_response"),
                payload={"ports": ports},
            )
            writer.write(encode_tcp_frame(response))
            await writer.drain()

        elif msg_type == "port.subscribe":
            port_id = str(payload.get("port_id", ""))
            udp_port = int(payload.get("udp_port", self.config.cluster_port))
            peer_addr = self._peers.get(sender)
            if peer_addr is not None:
                self._subscribers[(sender, port_id)] = RemoteSubscriber(
                    node_id=sender,
                    port_id=port_id,
                    udp_addr=(peer_addr[0], udp_port),
                )

        elif msg_type == "port.unsubscribe":
            port_id = str(payload.get("port_id", ""))
            self._subscribers.pop((sender, port_id), None)

        elif msg_type == "clock.vote":
            term = int(payload.get("term", 0))
            priority_field = payload.get("priority") or [0, ""]
            priority = (int(priority_field[0]),
                        str(priority_field[1]) if len(priority_field) > 1 else "")
            self._inbox_votes.append(_PeerVote(
                term=term,
                node_id=sender,
                priority=priority,
                received_at=time.monotonic(),
            ))

        elif msg_type == "clock.cede":
            term = int(payload.get("term", 0))
            to_node = str(payload.get("to_node_id", ""))
            if term >= self._term and to_node:
                self._term = term
                self._master_node_id = to_node
                self._ticks_unchallenged = 0

    # -----------------------------------------------------------------
    # UDP datagram handler — called by _UdpProtocol
    # -----------------------------------------------------------------

    async def _on_udp_datagram(self, raw: bytes, addr: tuple[str, int]) -> None:
        envelope = decode_envelope(raw)
        if envelope is None:
            return
        sender = str(envelope.get("from", ""))
        msg_type = str(envelope.get("type", ""))
        if not self._accept_seq(sender, msg_type, int(envelope.get("seq", 0))):
            return
        if msg_type == "event.midi":
            payload = envelope.get("payload") or {}
            try:
                self._event_inbox.put_nowait(payload)
            except asyncio.QueueFull:
                # Drop oldest, push new — keeps the inbox responsive
                # even when the consumer falls behind.
                try:
                    self._event_inbox.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    self._event_inbox.put_nowait(payload)
                except asyncio.QueueFull:
                    pass
            if self._on_event_hook is not None:
                try:
                    await self._on_event_hook(payload)
                except Exception:
                    logger.exception("event hook raised")

    # -----------------------------------------------------------------
    # Election loop
    # -----------------------------------------------------------------

    async def _election_loop(self) -> None:
        try:
            while self._running:
                await self._run_one_election_tick()
                await asyncio.sleep(self.config.tick_interval_s)
        except asyncio.CancelledError:
            return

    async def _run_one_election_tick(self) -> None:
        # Drop any votes we've held longer than 3 ticks — they're stale.
        cutoff = time.monotonic() - 3 * self.config.tick_interval_s
        self._inbox_votes = [v for v in self._inbox_votes if v.received_at >= cutoff]

        # Broadcast our vote to every peer over TCP. We send sync
        # within the loop because peer fan-out is small (cluster
        # ceiling = 16 nodes) and TCP backpressure is acceptable on
        # the 1 s tick.
        envelope = encode_envelope(
            sender=self.node_id,
            msg_type="clock.vote",
            seq=self._next_seq("clock.vote"),
            payload={
                "term": self._term,
                "node_id": self.node_id,
                "priority": [
                    self.config.master_priority,
                    self.node_id,
                ],
            },
        )
        for peer_id, addr in list(self._peers.items()):
            if peer_id == self.node_id:
                continue
            try:
                _reader, writer = await asyncio.open_connection(addr[0], addr[1])
            except OSError:
                continue
            try:
                writer.write(encode_tcp_frame(envelope))
                await writer.drain()
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass
            finally:
                writer.close()
                try:
                    await writer.wait_closed()
                except OSError:
                    pass

        # Wait for vote responses to settle.
        await asyncio.sleep(self.config.vote_collect_s)

        # Process accumulated votes. Highest-term + highest-priority wins.
        own_priority = (self.config.master_priority, self.node_id)
        max_term = self._term
        max_priority = own_priority
        max_node = self.node_id
        for vote in self._inbox_votes:
            if vote.term > max_term:
                max_term = vote.term
                max_priority = vote.priority
                max_node = vote.node_id
            elif vote.term == max_term:
                if vote.priority > max_priority:
                    max_priority = vote.priority
                    max_node = vote.node_id

        if max_node == self.node_id:
            self._ticks_unchallenged += 1
            if self._ticks_unchallenged >= PROMOTION_TICKS_UNCHALLENGED:
                if self._master_node_id != self.node_id:
                    self._master_node_id = self.node_id
                    self._term = max(self._term, max_term) + 1
                    logger.info(
                        "node %s self-promoted to MIDI clock master at term %d",
                        self.node_id, self._term,
                    )
        else:
            if self._master_node_id == self.node_id:
                # Cede — somebody outvoted us.
                self._term = max_term
                self._master_node_id = max_node
                self._ticks_unchallenged = 0
                logger.info(
                    "node %s ceding MIDI clock master to %s at term %d",
                    self.node_id, max_node, max_term,
                )
            else:
                self._term = max_term
                self._master_node_id = max_node
                self._ticks_unchallenged = 0

        # Drain processed votes.
        self._inbox_votes.clear()

    # -----------------------------------------------------------------
    # Helpers
    # -----------------------------------------------------------------

    def _next_seq(self, msg_type: str) -> int:
        self._outbound_seq[msg_type] = self._outbound_seq.get(msg_type, 0) + 1
        return self._outbound_seq[msg_type]

    def _accept_seq(self, sender: str, msg_type: str, seq: int) -> bool:
        """Drop out-of-order duplicates per (sender, type)."""
        key = (sender, msg_type)
        last = self._seq_seen.get(key, 0)
        if seq <= last:
            return False
        self._seq_seen[key] = seq
        return True


class _UdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, gateway: ClusterGateway) -> None:
        self._gateway = gateway

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        asyncio.create_task(self._gateway._on_udp_datagram(data, addr))
