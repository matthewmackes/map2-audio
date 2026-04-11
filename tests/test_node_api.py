import asyncio
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.node import (
    NodeAudioEdge,
    NodeHealth,
    NodeIdentity,
    NodeRole,
    NodeServices,
    NodeSummary,
    NodeTopology,
)
from app.routes import nodes as node_routes
from app.services.node_discovery_service import NodeDiscoveryService, PeerRecord
from app.services.node_health_service import (
    NodeHealthService,
    get_node_health_service,
    reset_node_health_service,
)


class _FakeDiscoveryService:
    def __init__(self):
        self.identity = NodeIdentity(
            hostname="map2-local",
            display_label=None,
            role=NodeRole.all_in_one,
            node_id="node-local",
        )
        self.topology = NodeTopology(
            nodes=[
                NodeSummary(
                    hostname="map2-local",
                    display_label=None,
                    role=NodeRole.all_in_one,
                    node_id="node-local",
                    status="ok",
                    cpu_percent=12.5,
                    memory_percent=30.0,
                    xrun_count=0,
                    audio_latency_ms=1.333,
                    services=NodeServices(backend=True, juce_engine=True, pipewire=True),
                    last_seen=datetime.utcnow(),
                    is_local=True,
                    is_viewed=True,
                )
            ],
            audio_edges=[],
            network_edges=[],
        )
        self.saved_labels: list[str] = []

    async def get_local_identity(self) -> NodeIdentity:
        return self.identity

    async def get_topology(self) -> NodeTopology:
        return self.topology

    async def set_display_label(self, label: str) -> NodeIdentity:
        self.saved_labels.append(label)
        normalized = label.strip() or None
        self.identity = self.identity.model_copy(update={"display_label": normalized})
        return self.identity

    async def resolve_known_node(self, node_id: str):
        return None


class _FakeHealthService:
    def __init__(self, status: str = "ok"):
        self.health = NodeHealth(
            status=status,
            cpu_percent=9.0,
            memory_percent=41.0,
            xrun_count=0,
            audio_latency_ms=1.333,
            services=NodeServices(backend=True, juce_engine=True, pipewire=True),
        )

    async def get_local_health(self) -> NodeHealth:
        return self.health

    async def get_remote_health(self, host: str) -> NodeHealth:
        return self.health


def _build_client(monkeypatch, discovery_service=None, health_service=None) -> TestClient:
    app = FastAPI()
    app.include_router(node_routes.router)
    monkeypatch.setattr(node_routes, "get_node_discovery_service", lambda: discovery_service or _FakeDiscoveryService())
    monkeypatch.setattr(node_routes, "get_node_health_service", lambda: health_service or _FakeHealthService())
    return TestClient(app)


def test_get_node_identity_returns_hostname(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/node/identity")

    assert response.status_code == 200
    payload = response.json()
    assert payload["hostname"] == "map2-local"
    assert payload["node_id"] == "node-local"


def test_get_node_health_returns_valid_status(monkeypatch):
    client = _build_client(monkeypatch, health_service=_FakeHealthService(status="warn"))

    response = client.get("/api/node/health")

    assert response.status_code == 200
    assert response.json()["status"] in {"ok", "warn", "critical", "offline"}


def test_get_node_topology_returns_at_least_local_node(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/node/topology")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["nodes"]) >= 1
    assert payload["nodes"][0]["node_id"] == "node-local"


def test_patch_node_identity_persists_display_label(monkeypatch):
    discovery = _FakeDiscoveryService()
    client = _build_client(monkeypatch, discovery_service=discovery)

    response = client.patch("/api/node/identity", json={"display_label": "Stage Left"})

    assert response.status_code == 200
    assert response.json()["display_label"] == "Stage Left"
    assert discovery.saved_labels == ["Stage Left"]


def test_patch_node_identity_rejects_overlong_label(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.patch("/api/node/identity", json={"display_label": "x" * 65})

    assert response.status_code == 422


def test_node_health_service_derives_warn_when_xruns_present(monkeypatch):
    service = NodeHealthService()

    class _FakeAudioService:
        is_available = True

        def is_audio_running(self):
            return True

        async def get_xrun_count(self):
            return 3

        def get_system_info(self):
            return {"buffer_size": 64, "sample_rate": 48000}

    monkeypatch.setattr(service, "_get_audio_service", lambda: _FakeAudioService())
    monkeypatch.setattr(service, "_check_pipewire_running", lambda: asyncio.sleep(0, result=True))
    monkeypatch.setattr("app.services.node_health_service.psutil.cpu_percent", lambda interval=None: 20.0)
    monkeypatch.setattr(
        "app.services.node_health_service.psutil.virtual_memory",
        lambda: type("_Memory", (), {"percent": 44.0})(),
    )

    health = asyncio.run(service.get_local_health())

    assert health.status == "warn"
    assert health.xrun_count == 3


def test_node_health_service_derives_critical_when_juce_offline(monkeypatch):
    service = NodeHealthService()

    class _FakeAudioService:
        is_available = True

        def is_audio_running(self):
            return False

        async def get_xrun_count(self):
            return 0

        def get_system_info(self):
            return {"buffer_size": 64, "sample_rate": 48000}

    monkeypatch.setattr(service, "_get_audio_service", lambda: _FakeAudioService())
    monkeypatch.setattr(service, "_check_pipewire_running", lambda: asyncio.sleep(0, result=True))
    monkeypatch.setattr("app.services.node_health_service.psutil.cpu_percent", lambda interval=None: 10.0)
    monkeypatch.setattr(
        "app.services.node_health_service.psutil.virtual_memory",
        lambda: type("_Memory", (), {"percent": 38.0})(),
    )

    health = asyncio.run(service.get_local_health())

    assert health.status == "critical"
    assert health.services.juce_engine is False


def test_topology_derives_audio_edges_from_avb_streams(monkeypatch):
    health_service = _FakeHealthService()
    discovery = NodeDiscoveryService(health_service=health_service)

    local_identity = NodeIdentity(
        hostname="map2-local",
        display_label=None,
        role=NodeRole.all_in_one,
        node_id="node-local",
    )
    remote_identity = NodeIdentity(
        hostname="map2-peer",
        display_label="Stage Right",
        role=NodeRole.audio_node,
        node_id="node-peer",
    )
    remote_health = NodeHealth(
        status="ok",
        cpu_percent=18.0,
        memory_percent=52.0,
        xrun_count=0,
        audio_latency_ms=1.333,
        services=NodeServices(backend=True, juce_engine=True, pipewire=True),
    )
    peer_record = PeerRecord(
        node_id="node-peer",
        host="10.0.0.22",
        hostname="map2-peer",
        node_mode="AUDIO-NODE",
        last_seen=datetime.utcnow() - timedelta(seconds=3),
        latency_ms=2.1,
    )

    monkeypatch.setattr(discovery, "get_local_identity", lambda: asyncio.sleep(0, result=local_identity))
    monkeypatch.setattr(discovery, "_load_peer_records", lambda: asyncio.sleep(0, result=[peer_record]))
    monkeypatch.setattr(discovery, "_refresh_peer_index", lambda **kwargs: asyncio.sleep(0, result=None))
    monkeypatch.setattr(discovery, "_fetch_remote_identity", lambda peer: asyncio.sleep(0, result=remote_identity))
    monkeypatch.setattr(health_service, "get_local_health", lambda: asyncio.sleep(0, result=_FakeHealthService().health))
    monkeypatch.setattr(health_service, "get_remote_health", lambda host: asyncio.sleep(0, result=remote_health))
    monkeypatch.setattr(
        discovery,
        "_build_audio_edges",
        lambda known_node_ids: [
            NodeAudioEdge(
                source_node_id="node-local",
                dest_node_id="node-peer",
                stream_type="avb",
                active=True,
            )
        ],
    )

    topology = asyncio.run(discovery.get_topology())

    assert len(topology.audio_edges) == 1
    assert topology.audio_edges[0].source_node_id == "node-local"
    assert topology.audio_edges[0].dest_node_id == "node-peer"


def test_node_health_service_singleton_reset():
    reset_node_health_service()
    first = get_node_health_service()
    second = get_node_health_service()
    assert first is second

    reset_node_health_service()
    replacement = get_node_health_service()
    assert replacement is not first
