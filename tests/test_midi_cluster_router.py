import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from types import SimpleNamespace

import app.services.midi_hub.cluster_router as cluster_router_module
from app.services.cluster.distributed_event_bus import EventType
from app.services.midi_hub.cluster_router import MidiClusterConnection, MidiClusterRouter
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_hub.rtp_transport import RtpMidiSession


def _utcnow():
    return datetime.now(timezone.utc)


@dataclass
class _FakeDiscoveryNode:
    node_id: str
    address: str
    input_ports: list[str]
    output_ports: list[str]
    online: bool = True

    @property
    def hostname(self) -> str:
        return self.node_id

    @property
    def addresses(self) -> list[str]:
        return [self.address]

    @property
    def port(self) -> int:
        return 8080

    @property
    def last_seen(self):
        return _utcnow()

    @property
    def midi_capabilities(self):
        return SimpleNamespace(
            input_ports=list(self.input_ports),
            output_ports=list(self.output_ports),
        )

    def is_online(self, timeout_seconds: int = 120) -> bool:
        return self.online


class _FakeDiscoveryService:
    def __init__(self, nodes):
        self.nodes = list(nodes)

    def get_discovered_nodes(self, online_only: bool = True):
        if online_only:
            return [node for node in self.nodes if node.online]
        return list(self.nodes)


class _FakeEventBus:
    def __init__(self):
        self.events = []

    async def publish_event(self, event):
        self.events.append(event)
        return True


class _FakeRegistry:
    def __init__(self, *, equivalent=None):
        self._equivalent = equivalent

    def snapshot(self):
        return {"devices": [], "profiles": []}

    def find_equivalent_port(self, port_name, exclude_node_id):
        return self._equivalent


class _FakeTransport:
    def __init__(self, *, timeout: bool = False):
        self.timeout = timeout
        self.started = 0
        self.closed = []
        self.invites = []
        self._stats = {}

    async def start(self):
        self.started += 1

    async def invite(self, host, port, **kwargs):
        self.invites.append({"host": host, "port": port, **kwargs})
        if self.timeout:
            raise TimeoutError("rtp timeout")
        session = RtpMidiSession(
            session_id="rtp-session-1",
            remote_node_id=str(kwargs.get("remote_node_id") or "node-b"),
            remote_host=host,
            remote_port=int(port),
            local_port=5004,
            state="connected",
            initiator=True,
            ssrc=1234,
            sequence_number=0,
            timestamp_offset=0,
            source_port=str(kwargs.get("source_port") or ""),
            destination_port=str(kwargs.get("destination_port") or ""),
            source_node_id=str(kwargs.get("source_node_id") or "node-a"),
        )
        self._stats[session.session_id] = {
            "latency_ms": 1.25,
            "last_activity": _utcnow().isoformat().replace("+00:00", "Z"),
        }
        return session

    async def close_session(self, session_id):
        self.closed.append(session_id)
        return True

    def get_session_stats(self, session_id):
        return self._stats.get(session_id, {})


class _FakeNetworkBridge:
    def __init__(self, *, forward_result=None):
        self.forward_result = forward_result or {"ok": True, "latency_ms": 0.75}
        self.transport = None
        self.mode = None
        self.mesh_peers = []
        self.forward_calls = []
        self.sessions = []
        self.removed_sessions = []

    def register_rtp_transport(self, transport):
        self.transport = transport

    def set_transport_mode(self, mode):
        self.mode = mode
        return mode

    def upsert_mesh_peer(self, *, peer_id, base_url, active=True):
        self.mesh_peers.append({"peer_id": peer_id, "base_url": base_url, "active": active})
        return self.mesh_peers[-1]

    async def create_session(self, **kwargs):
        self.sessions.append(kwargs)
        return kwargs

    async def remove_session(self, session_id):
        self.removed_sessions.append(session_id)
        return True

    async def forward_to_peer(self, **kwargs):
        self.forward_calls.append(kwargs)
        return dict(self.forward_result)


def _make_hub():
    hub = MidiHub(auto_discover_alsa=False)
    output_port = VirtualMidiPort(port_id="out-a", name="Keys Out", direction="output")
    input_port = VirtualMidiPort(port_id="in-a", name="Rack In", direction="input")
    output_port.open()
    input_port.open()
    hub.register_port(output_port, open_now=False)
    hub.register_port(input_port, open_now=False)
    return hub


def _config_values(**overrides):
    values = {
        "midi.cluster.auto_connect": False,
        "midi.cluster.transport": "rtp-midi",
        "midi.cluster.rtp_midi_port": 5004,
        "midi.cluster.discovery_timeout_s": 120,
        "midi.cluster.max_remote_connections": 32,
        "midi.cluster.failover_enabled": True,
        "midi.cluster.failover_timeout_ms": 3000,
        "backend.port": 8080,
    }
    values.update(overrides)
    return values


def test_auto_connect_pairs_are_deterministic_and_local_source_only(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    discovery = _FakeDiscoveryService(
        [
            _FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"]),
            _FakeDiscoveryNode("node-c", "10.0.0.3", ["Another Rack In"], ["Another Keys Out"]),
        ]
    )

    router = MidiClusterRouter(
        discovery=discovery,
        transport=_FakeTransport(),
        hub=hub,
        event_bus=_FakeEventBus(),
        network_bridge=_FakeNetworkBridge(),
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )

    pairs = router._build_auto_connect_pairs()
    assert [(source.node_id, destination.node_id) for source, destination in pairs] == [
        ("node-a", "node-b"),
    ]
    assert pairs[0][0].port_ref == "out-a"


def test_connect_establishes_rtp_session_and_publishes_events(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    event_bus = _FakeEventBus()
    transport = _FakeTransport()
    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=transport,
        hub=hub,
        event_bus=event_bus,
        network_bridge=_FakeNetworkBridge(),
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )

    async def _run():
        await router.start()
        connection = await router.connect("node-a:Keys Out", "node-b:Remote Rack In")
        snapshot = {
            "state": connection.state,
            "session_id": connection.session_id,
        }
        await router.stop()
        return snapshot

    connection = asyncio.run(_run())

    assert connection["state"] == "connected"
    assert connection["session_id"] == "rtp-session-1"
    assert transport.invites[0]["source_port"] == "Keys Out"
    event_types = [event.event_type for event in event_bus.events]
    assert EventType.MIDI_CONNECTION_REQUESTED in event_types
    assert EventType.MIDI_CONNECTION_ESTABLISHED in event_types


def test_connect_falls_back_to_http_mesh_after_rtp_timeout(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    event_bus = _FakeEventBus()
    network_bridge = _FakeNetworkBridge()
    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=_FakeTransport(timeout=True),
        hub=hub,
        event_bus=event_bus,
        network_bridge=network_bridge,
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )

    async def _run():
        await router.start()
        connection = await router.connect("node-a:Keys Out", "node-b:Remote Rack In")
        snapshot = {
            "state": connection.state,
            "transport": connection.transport,
        }
        await router.stop()
        return snapshot

    connection = asyncio.run(_run())

    assert connection["state"] == "connected"
    assert connection["transport"] == "http-mesh"
    assert network_bridge.mesh_peers[0]["peer_id"] == "node-b"
    failure_events = [event for event in event_bus.events if event.event_type == EventType.MIDI_CONNECTION_FAILED]
    assert failure_events
    assert failure_events[0].details["reason"] == "rtp_timeout_fallback_http"


def test_forward_message_uses_network_bridge_transport(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    network_bridge = _FakeNetworkBridge(forward_result={"ok": True, "latency_ms": 2.5})
    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=_FakeTransport(),
        hub=hub,
        event_bus=_FakeEventBus(),
        network_bridge=network_bridge,
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )
    local_output = next(endpoint for endpoint in router.get_endpoints_for_node("node-a") if endpoint.direction == "output")
    remote_input = next(endpoint for endpoint in router.get_endpoints_for_node("node-b") if endpoint.direction == "input")
    router._connections["node-a:Keys Out→node-b:Remote Rack In"] = MidiClusterConnection(
        connection_id="node-a:Keys Out→node-b:Remote Rack In",
        source=local_output,
        destination=remote_input,
        state="connected",
        transport="rtp-midi",
        session_id="rtp-session-1",
    )

    async def _run():
        await router.start()
        router._on_hub_message(
            MidiMessage(
                data=bytes([0x90, 60, 100]),
                timestamp_ns=1,
                source_port="out-a",
                metadata={},
            )
        )
        await asyncio.sleep(0.05)
        await router.stop()

    asyncio.run(_run())

    assert network_bridge.forward_calls
    assert network_bridge.forward_calls[0]["transport_mode"] == "rtp-midi"
    assert network_bridge.forward_calls[0]["source_port"] == "Keys Out"


def test_public_forward_establishes_connection_and_forwards(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    network_bridge = _FakeNetworkBridge(forward_result={"ok": True, "latency_ms": 1.5})
    transport = _FakeTransport()
    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=transport,
        hub=hub,
        event_bus=_FakeEventBus(),
        network_bridge=network_bridge,
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )

    async def _run():
        await router.start()
        ok = router.forward(
            source_port="out-a",
            destination_node_id="node-b",
            destination_port_name="Remote Rack In",
            data=bytes([0x90, 60, 100]),
            metadata={"origin_node_id": "node-a", "origin_port": "out-a"},
        )
        await asyncio.sleep(0.05)
        await router.stop()
        return ok

    ok = asyncio.run(_run())

    assert ok is True
    assert transport.invites
    assert transport.invites[0]["destination_port"] == "Remote Rack In"
    assert network_bridge.forward_calls
    assert network_bridge.forward_calls[0]["destination_port"] == "Remote Rack In"


def test_trigger_auto_connect_reports_summary(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=_FakeTransport(),
        hub=_make_hub(),
        event_bus=_FakeEventBus(),
        network_bridge=_FakeNetworkBridge(),
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )

    async def _run():
        await router.start()
        summary = await router.trigger_auto_connect(reason="manual")
        await router.stop()
        return summary

    summary = asyncio.run(_run())

    assert summary["reason"] == "manual"
    assert summary["pair_count"] == 1
    assert summary["created_count"] == 1
    assert summary["created_connections"] == ["node-a:Keys Out→node-b:Remote Rack In"]


def test_start_ignores_auto_connect_discovery_errors(monkeypatch):
    values = _config_values(**{"midi.cluster.auto_connect": True})
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"])]),
        transport=_FakeTransport(),
        hub=_make_hub(),
        event_bus=_FakeEventBus(),
        network_bridge=_FakeNetworkBridge(),
        device_registry=_FakeRegistry(),
        local_node_id="node-a",
    )
    monkeypatch.setattr(router, "_build_auto_connect_pairs", lambda: (_ for _ in ()).throw(RuntimeError("invalid endpoint cache")))

    async def _run():
        await router.start()
        summary = router.get_auto_connect_status()
        await router.stop()
        return summary

    summary = asyncio.run(_run())

    assert summary["reason"] == "node_discovered"
    assert summary["failed_count"] == 1
    assert summary["failed_connections"][0]["error"] == "invalid endpoint cache"


def test_failover_port_switches_to_equivalent_input(monkeypatch):
    values = _config_values()
    monkeypatch.setattr(cluster_router_module, "config_get", lambda key, default=None: values.get(key, default))

    hub = _make_hub()
    event_bus = _FakeEventBus()
    transport = _FakeTransport()
    router = MidiClusterRouter(
        discovery=_FakeDiscoveryService(
            [
                _FakeDiscoveryNode("node-b", "10.0.0.2", ["Remote Rack In"], ["Remote Keys Out"]),
                _FakeDiscoveryNode("node-c", "10.0.0.3", ["Backup Rack In"], ["Backup Keys Out"]),
            ]
        ),
        transport=transport,
        hub=hub,
        event_bus=event_bus,
        network_bridge=_FakeNetworkBridge(),
        device_registry=_FakeRegistry(equivalent={"node_id": "node-c", "port_names": ["Backup Rack In"]}),
        local_node_id="node-a",
    )

    async def _run():
        await router.start()
        original = await router.connect("node-a:Keys Out", "node-b:Remote Rack In")
        replacement = await router.failover_port("Remote Rack In")
        snapshot = {
            "original_state": original.state,
            "replacement_id": replacement.connection_id if replacement else None,
            "connection_ids": sorted(connection.connection_id for connection in router.get_connections()),
        }
        await router.stop()
        return snapshot

    snapshot = asyncio.run(_run())

    assert snapshot["original_state"] == "disconnected"
    assert snapshot["replacement_id"] == "node-a:Keys Out→node-c:Backup Rack In"
    assert "node-a:Keys Out→node-c:Backup Rack In" in snapshot["connection_ids"]
    assert "node-a:Keys Out→node-b:Remote Rack In" in snapshot["connection_ids"]
    failover_events = [event.event_type for event in event_bus.events]
    assert EventType.MIDI_FAILOVER_TRIGGERED in failover_events
    assert EventType.MIDI_FAILOVER_COMPLETED in failover_events
