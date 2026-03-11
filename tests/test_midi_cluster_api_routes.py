from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_cluster as midi_cluster_routes
from app.services.cluster.distributed_event_bus import ClusterEvent, EventSeverity, EventType
from app.services.midi_hub.cluster_router import MidiClusterConnection, MidiEndpoint
from app.services.midi_hub.midi_discovery import MidiCapabilities, MidiNode


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class _FakeDiscovery:
    def __init__(self) -> None:
        self.nodes = [
            MidiNode(
                node_id="node-a",
                hostname="alpha",
                addresses=["10.0.0.1"],
                port=8080,
                midi_capabilities=MidiCapabilities(
                    input_ports=["Rack In"],
                    output_ports=["Keys Out"],
                    virtual_ports=["Virtual Bus"],
                    hub_running=True,
                    clock_source="internal",
                    clock_bpm=128.0,
                    protocol_version="2.0",
                    supports_midi2=True,
                    sysex_enabled=True,
                ),
                last_seen=_utcnow(),
            ),
            MidiNode(
                node_id="node-b",
                hostname="beta",
                addresses=["10.0.0.2"],
                port=8081,
                midi_capabilities=MidiCapabilities(
                    input_ports=["Remote Rack In"],
                    output_ports=["Remote Keys Out"],
                    virtual_ports=[],
                    hub_running=True,
                    clock_source="external",
                    clock_bpm=128.0,
                    protocol_version="1.0",
                    supports_midi2=False,
                    sysex_enabled=False,
                ),
                last_seen=_utcnow(),
            ),
        ]

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self.nodes)

    def get_discovery_summary(self):
        return {
            "total_nodes": len(self.nodes),
            "input_port_count": 2,
            "output_port_count": 2,
            "virtual_port_count": 1,
        }


class _FakeClock:
    def __init__(self) -> None:
        self.manual_master = None
        self.strategy = "leader-node"
        self.force_sync_calls = 0
        self.state = SimpleNamespace(
            master_node_id="node-a",
            master_bpm=128.0,
            strategy=SimpleNamespace(value="leader-node"),
            is_master=True,
            sync_offset_ms=0.0,
            drift_ms=0.4,
            last_sync=_utcnow(),
            followers=["node-b"],
        )

    def get_state(self):
        return self.state

    def set_manual_master(self, node_id: str):
        self.manual_master = node_id or None

    def set_strategy(self, strategy: str):
        self.strategy = strategy
        self.state.strategy = SimpleNamespace(value=strategy)

    def get_drift_report(self):
        return {
            "master_node_id": self.state.master_node_id,
            "strategy": self.state.strategy.value,
            "generated_at": _utcnow().isoformat().replace("+00:00", "Z"),
            "measurements": [
                {
                    "node_id": "node-b",
                    "role": "follower",
                    "drift_ms": 0.4,
                    "sync_offset_ms": 0.1,
                    "last_sync": self.state.last_sync.isoformat().replace("+00:00", "Z"),
                    "available": True,
                }
            ],
        }

    async def force_resync(self):
        self.force_sync_calls += 1
        return self.get_drift_report()


class _FakeRouter:
    def __init__(self) -> None:
        now = _utcnow()
        self.local_output = MidiEndpoint(
            node_id="node-a",
            port_name="Keys Out",
            direction="output",
            device_name="Keys Out",
            node_address="10.0.0.1",
            available=True,
            last_seen=now,
            port_ref="out-a",
        )
        self.remote_input = MidiEndpoint(
            node_id="node-b",
            port_name="Remote Rack In",
            direction="input",
            device_name="Remote Rack In",
            node_address="10.0.0.2",
            available=True,
            last_seen=now,
            port_ref="in-b",
        )
        self.remote_output = MidiEndpoint(
            node_id="node-b",
            port_name="Remote Keys Out",
            direction="output",
            device_name="Remote Keys Out",
            node_address="10.0.0.2",
            available=True,
            last_seen=now,
            port_ref="out-b",
        )
        self.local_input = MidiEndpoint(
            node_id="node-a",
            port_name="Rack In",
            direction="input",
            device_name="Rack In",
            node_address="10.0.0.1",
            available=True,
            last_seen=now,
            port_ref="in-a",
        )
        self.connections = {
            "node-a:Keys Out→node-b:Remote Rack In": MidiClusterConnection(
                connection_id="node-a:Keys Out→node-b:Remote Rack In",
                source=self.local_output,
                destination=self.remote_input,
                state="connected",
                transport="rtp-midi",
                session_id="rtp-1",
                established_at=now,
                latency_ms=1.25,
                messages_forwarded=42,
            )
        }
        self.auto_connect_status = {
            "reason": "startup",
            "last_run_at": now.isoformat().replace("+00:00", "Z"),
            "pair_count": 1,
            "created_count": 1,
            "failed_count": 0,
            "created_connections": list(self.connections.keys()),
            "failed_connections": [],
            "transport": "rtp-midi",
        }

    def get_endpoints(self):
        return [self.local_output, self.local_input, self.remote_output, self.remote_input]

    def get_endpoints_for_node(self, node_id: str):
        return [endpoint for endpoint in self.get_endpoints() if endpoint.node_id == node_id]

    def get_connections(self):
        return list(self.connections.values())

    def get_connection(self, connection_id: str):
        return self.connections.get(connection_id)

    async def connect(self, source_endpoint_id: str, destination_endpoint_id: str, *, transport=None):
        connection = MidiClusterConnection(
            connection_id=f"{source_endpoint_id}→{destination_endpoint_id}",
            source=self.local_output,
            destination=self.remote_input,
            state="connected",
            transport=transport or "rtp-midi",
            session_id="rtp-new",
            established_at=_utcnow(),
            latency_ms=2.0,
            messages_forwarded=0,
        )
        self.connections[connection.connection_id] = connection
        return connection

    async def disconnect(self, connection_id: str):
        return self.connections.pop(connection_id, None) is not None

    async def trigger_auto_connect(self, *, reason: str = "manual"):
        self.auto_connect_status["reason"] = reason
        return dict(self.auto_connect_status)

    def get_auto_connect_status(self):
        return dict(self.auto_connect_status)

    async def failover_port(self, port_name: str):
        return MidiClusterConnection(
            connection_id="node-a:Keys Out→node-c:Backup Rack In",
            source=self.local_output,
            destination=MidiEndpoint(
                node_id="node-c",
                port_name="Backup Rack In",
                direction="input",
                device_name="Backup Rack In",
                node_address="10.0.0.3",
                available=True,
                last_seen=_utcnow(),
                port_ref="in-c",
            ),
            state="connected",
            transport="http-mesh",
            session_id="mesh-1",
            established_at=_utcnow(),
            latency_ms=4.5,
            messages_forwarded=1,
        )


class _FakeDeviceRegistry:
    def __init__(self) -> None:
        self.devices_by_node = {
            "node-a": [{"device_id": "keys-1", "profile_name": "Controller", "port_names": ["Keys Out"]}],
            "node-b": [{"device_id": "rack-1", "profile_name": "Rack", "port_names": ["Remote Rack In"]}],
        }

    def get_node_devices(self, node_id: str):
        return list(self.devices_by_node.get(node_id, []))

    def get_global_snapshot(self):
        return {
            "count": 2,
            "node_count": 2,
            "nodes": [
                {"node_id": "node-a", "remote": False, "device_count": 1, "devices": self.devices_by_node["node-a"]},
                {"node_id": "node-b", "remote": True, "device_count": 1, "devices": self.devices_by_node["node-b"]},
            ],
            "by_node": dict(self.devices_by_node),
            "profiles": [{"profile_id": "rack", "name": "Rack"}],
        }


class _FakeEventBus:
    def __init__(self) -> None:
        self.events = [
            ClusterEvent(
                event_type=EventType.MIDI_CONNECTION_ESTABLISHED,
                severity=EventSeverity.INFO,
                source_node_id="node-a",
                affected_nodes=["node-a", "node-b"],
                message="Connection established",
                details={"connection_id": "node-a:Keys Out→node-b:Remote Rack In"},
            ),
            ClusterEvent(
                event_type=EventType.MIDI_CLOCK_DRIFT_DETECTED,
                severity=EventSeverity.WARNING,
                source_node_id="node-b",
                affected_nodes=["node-b"],
                message="Clock drift warning",
                details={"drift_ms": 0.4},
            ),
            ClusterEvent(
                event_type=EventType.NODE_JOINED,
                severity=EventSeverity.INFO,
                source_node_id="node-z",
                affected_nodes=["node-z"],
                message="Not MIDI",
                details={},
            ),
        ]

    def get_events(self, event_type=None, severity=None, hours=24, limit=100):
        rows = list(self.events)
        if event_type is not None:
            rows = [event for event in rows if event.event_type == event_type]
        if severity is not None:
            rows = [event for event in rows if event.severity == severity]
        return rows[:limit]

    def get_events_by_node(self, node_id: str, hours=24, limit=100):
        rows = [
            event
            for event in self.events
            if event.source_node_id == node_id or node_id in event.affected_nodes
        ]
        return rows[:limit]


def _build_client(monkeypatch):
    discovery = _FakeDiscovery()
    clock = _FakeClock()
    router = _FakeRouter()
    registry = _FakeDeviceRegistry()
    event_bus = _FakeEventBus()

    monkeypatch.setattr(midi_cluster_routes, "config_get", lambda key, default=None: {"midi.cluster.enabled": True}.get(key, default))
    monkeypatch.setattr(midi_cluster_routes, "get_midi_discovery_service", lambda: discovery)
    monkeypatch.setattr(midi_cluster_routes, "get_midi_cluster_clock", lambda: clock)
    monkeypatch.setattr(midi_cluster_routes, "get_midi_cluster_router", lambda: router)
    monkeypatch.setattr(midi_cluster_routes, "get_midi_device_registry", lambda: registry)
    monkeypatch.setattr(midi_cluster_routes, "get_event_bus", lambda: event_bus)

    app = FastAPI()
    app.include_router(midi_cluster_routes.router)
    return TestClient(app), clock


def test_cluster_api_lists_nodes_and_summary(monkeypatch):
    client, _clock = _build_client(monkeypatch)

    nodes = client.get("/api/midi/cluster/nodes")
    summary = client.get("/api/midi/cluster/summary")
    endpoints = client.get("/api/midi/cluster/endpoints")

    assert nodes.status_code == 200
    assert len(nodes.json()) == 2
    assert nodes.json()[0]["capabilities"]["supports_midi2"] is True
    assert summary.status_code == 200
    assert summary.json()["node_count"] == 2
    assert summary.json()["connection_count"] == 1
    assert summary.json()["auto_connect"]["created_count"] == 1
    assert endpoints.status_code == 200
    assert len(endpoints.json()) == 4


def test_cluster_api_connection_and_failover_routes(monkeypatch):
    client, _clock = _build_client(monkeypatch)

    created = client.post(
        "/api/midi/cluster/connections",
        json={
            "source_endpoint_id": "node-a:Keys Out",
            "destination_endpoint_id": "node-b:Remote Rack In",
            "transport": "http-mesh",
        },
    )
    auto_connect = client.post("/api/midi/cluster/connections/auto-connect")
    failover = client.post("/api/midi/cluster/devices/failover/Remote%20Rack%20In")
    deleted = client.delete(
        f"/api/midi/cluster/connections/{quote('node-a:Keys Out→node-b:Remote Rack In', safe='')}"
    )

    assert created.status_code == 200
    assert created.json()["transport"] == "http-mesh"
    assert auto_connect.status_code == 200
    assert auto_connect.json()["reason"] == "manual"
    assert failover.status_code == 200
    assert failover.json()["destination"]["node_id"] == "node-c"
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


def test_cluster_api_clock_health_and_events(monkeypatch):
    client, clock = _build_client(monkeypatch)

    strategy = client.put(
        "/api/midi/cluster/clock/strategy",
        json={"strategy": "manual", "manual_node_id": "node-b"},
    )
    sync = client.post("/api/midi/cluster/clock/sync")
    drift = client.get("/api/midi/cluster/clock/drift")
    health = client.get("/api/midi/cluster/health")
    events = client.get("/api/midi/cluster/events", params={"severity": "warning", "node_id": "node-b"})

    assert strategy.status_code == 200
    assert clock.manual_master == "node-b"
    assert strategy.json()["strategy"] == "manual"
    assert sync.status_code == 200
    assert clock.force_sync_calls == 1
    assert drift.status_code == 200
    assert drift.json()["measurements"][0]["node_id"] == "node-b"
    assert health.status_code == 200
    assert health.json()["clock_status"] == "master"
    assert events.status_code == 200
    assert events.json()["total"] == 1
    assert events.json()["events"][0]["event_type"] == EventType.MIDI_CLOCK_DRIFT_DETECTED.value
