from pathlib import Path

from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.network import MidiNetworkBridge
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_hub.router import MidiRouter


class _FakeClusterRouter:
    def __init__(self):
        self.forward_calls = []

    def forward(self, **kwargs):
        self.forward_calls.append(dict(kwargs))
        return True


class _FakeDiscoveryNode:
    def __init__(self, node_id: str, address: str, port: int = 8080):
        self.node_id = node_id
        self.addresses = [address]
        self.hostname = node_id
        self.port = port


class _FakeDiscoveryService:
    def __init__(self, nodes):
        self._nodes = list(nodes)

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self._nodes)


def test_hub_send_delegates_remote_cluster_destinations():
    hub = MidiHub(auto_discover_alsa=False)
    hub._local_node_id = "node-a"
    cluster_router = _FakeClusterRouter()
    hub.cluster_router = cluster_router

    assert hub.send(
        source_port="src",
        destination_port="node-b:Remote Rack In",
        data=bytes([0x90, 60, 100]),
    ) is True

    assert len(cluster_router.forward_calls) == 1
    call = cluster_router.forward_calls[0]
    assert call["destination_node_id"] == "node-b"
    assert call["destination_port_name"] == "Remote Rack In"
    assert call["metadata"]["origin_node_id"] == "node-a"
    assert call["metadata"]["origin_port"] == "src"
    assert hub.stats().outbound_queue == 0


def test_hub_send_keeps_local_ports_with_colons_local():
    hub = MidiHub(auto_discover_alsa=False)
    hub._local_node_id = "node-a"
    hub.cluster_router = _FakeClusterRouter()
    port = VirtualMidiPort(port_id="tesira:unit-1", name="Tesira Unit 1", direction="output")
    hub.register_port(port, open_now=False)

    assert hub.send(
        source_port="src",
        destination_port="tesira:unit-1",
        data=bytes([0x90, 60, 100]),
    ) is True

    assert hub.cluster_router.forward_calls == []
    queued = hub._outbound.drain(1)
    assert len(queued) == 1
    assert queued[0].destination_port == "tesira:unit-1"


def test_hub_inject_remote_adds_origin_metadata_and_destination():
    hub = MidiHub(auto_discover_alsa=False)

    assert hub.inject_remote(
        "node-b",
        "Remote Keys",
        bytes([0x90, 60, 100]),
        {"destination_port": "dst", "custom": "value"},
    ) is True

    message = hub._inbound.drain(1)[0]
    assert message.source_port == "node-b:Remote Keys"
    assert message.destination_port == "dst"
    assert message.metadata["origin_node_id"] == "node-b"
    assert message.metadata["origin_port"] == "Remote Keys"
    assert message.metadata["cluster_remote_injected"] is True
    assert message.metadata["custom"] == "value"


def test_router_applies_node_filters_and_reports_cluster_routes(tmp_path: Path):
    hub = MidiHub(auto_discover_alsa=False)
    hub._local_node_id = "node-a"
    cluster_router = _FakeClusterRouter()
    hub.cluster_router = cluster_router
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json")
    router._local_node_id = "node-a"

    created = router.add_route(
        {
            "route_id": "cluster-route",
            "source_port": "node-b:Remote Keys",
            "source_node_id": "node-b",
            "destination_ports": ["node-c:Remote Rack"],
            "destination_node_id": "node-c",
            "enabled": True,
            "priority": 120,
        }
    )
    assert created["route_id"] == "cluster-route"
    assert [route["route_id"] for route in router.get_cluster_routes()] == ["cluster-route"]

    router.start()
    router._on_message(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=123,
            source_port="node-b:Remote Keys",
            destination_port="dst",
            metadata={
                "origin_node_id": "node-b",
                "origin_port": "Remote Keys",
                "cluster_remote_injected": True,
            },
        )
    )
    router.stop()

    assert len(cluster_router.forward_calls) == 1
    call = cluster_router.forward_calls[0]
    assert call["destination_node_id"] == "node-c"
    assert call["destination_port_name"] == "Remote Rack"
    assert call["metadata"]["origin_node_id"] == "node-b"
    assert call["metadata"]["origin_port"] == "Remote Keys"


def test_router_directly_delivers_unmatched_remote_injection(tmp_path: Path):
    hub = MidiHub(auto_discover_alsa=False)
    hub._local_node_id = "node-a"
    hub.register_port(VirtualMidiPort(port_id="dst", name="Destination", direction="output"), open_now=False)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json")
    router._local_node_id = "node-a"

    router.start()
    router._on_message(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=123,
            source_port="node-b:Remote Keys",
            destination_port="dst",
            metadata={
                "origin_node_id": "node-b",
                "origin_port": "Remote Keys",
                "cluster_remote_injected": True,
            },
        )
    )
    router.stop()

    queued = hub._outbound.drain(1)
    assert len(queued) == 1
    assert queued[0].destination_port == "dst"
    assert queued[0].metadata["route_id"] == "cluster_remote_direct"
    assert queued[0].metadata["origin_node_id"] == "node-b"
    assert queued[0].metadata["origin_port"] == "Remote Keys"


def test_network_bridge_auto_populates_mesh_peers_from_discovery(monkeypatch):
    import app.services.midi_hub.midi_discovery as midi_discovery_module
    import app.services.midi_hub.network as network_module

    monkeypatch.setattr(network_module, "config_get", lambda key, default=None: {"midi.cluster.enabled": True, "backend.port": 8080}.get(key, default))
    monkeypatch.setattr(
        midi_discovery_module,
        "get_midi_discovery_service",
        lambda: _FakeDiscoveryService([_FakeDiscoveryNode("node-b", "10.0.0.2")]),
    )

    bridge = MidiNetworkBridge(hub=MidiHub(auto_discover_alsa=False))
    bridge._local_node_id = "node-a"

    peers = bridge.list_mesh_peers()
    assert len(peers) == 1
    assert peers[0]["peer_id"] == "node-b"
    assert peers[0]["base_url"] == "http://10.0.0.2:8080"


def test_network_bridge_delegates_remote_destinations_to_cluster_router():
    hub = MidiHub(auto_discover_alsa=False)
    bridge_router = _FakeClusterRouter()
    bridge = MidiNetworkBridge(hub=hub, cluster_router=bridge_router)
    bridge._local_node_id = "node-a"
    bridge.set_mesh_forwarding(True)

    bridge._on_hub_message(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=1,
            source_port="src",
            destination_port="node-b:Remote Rack In",
            metadata={"origin_node_id": "node-a", "origin_port": "src"},
        )
    )

    assert len(bridge_router.forward_calls) == 1
    assert bridge_router.forward_calls[0]["destination_node_id"] == "node-b"
    assert bridge_router.forward_calls[0]["destination_port_name"] == "Remote Rack In"
