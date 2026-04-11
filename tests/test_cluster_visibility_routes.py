import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.routes import cluster_admin, cluster_health, peer_discovery
from app.services.cluster.heartbeat_monitor import HeartbeatMonitor, NodeHealthStatus
from app.services.lcd_manager import set_lcd_manager


class _FakeMDNSDiscovery:
    def __init__(self, peers):
        self._peers = dict(peers)
        self.discovery_uptime = "12m 0s"

    def get_discovered_peers(self):
        return dict(self._peers)


class _FakeEventRouter:
    def get_connected_peers(self):
        return []


class _FakeLCDManager:
    def __init__(self, *, peers=None):
        self.node_id = "local-node"
        self.node_label = "local-node"
        self.mdns_discovery = _FakeMDNSDiscovery(peers or {})
        self.event_router = _FakeEventRouter()


class _FakeRegistry:
    def __init__(self, nodes):
        self._nodes = list(nodes)

    def get_all_nodes(self):
        return list(self._nodes)


class _FakeHeartbeatMonitor:
    def __init__(self, health_by_node):
        self._health_by_node = dict(health_by_node)

    def get_all_health(self):
        return dict(self._health_by_node)

    def get_node_health(self, node_id):
        return self._health_by_node.get(node_id)


@dataclass
class _FakeCapabilities:
    cpu_cores: int
    memory_gb: int
    audio_interfaces: list[str]


class _FakeEnhancedNode:
    def __init__(self, *, node_id, hostname, addresses, port, role, health_score, capabilities, online=True):
        self.node_id = node_id
        self.hostname = hostname
        self.addresses = list(addresses)
        self.port = port
        self.role = role
        self.health_score = health_score
        self.capabilities = capabilities
        self.last_seen = datetime.now(timezone.utc)
        self._online = online

    def is_online(self, timeout_seconds=60):
        return self._online


class _FakeEnhancedDiscovery:
    def __init__(self, nodes):
        self._nodes = list(nodes)

    def get_discovered_nodes(self, online_only=True):
        if online_only:
            return [node for node in self._nodes if node.is_online()]
        return list(self._nodes)


def setup_function():
    set_lcd_manager(None)


def teardown_function():
    set_lcd_manager(None)


def _install_visibility_fakes(monkeypatch, *, peers, registry_nodes, heartbeat_nodes, enhanced_nodes):
    set_lcd_manager(_FakeLCDManager(peers=peers))
    registry = _FakeRegistry(registry_nodes)
    heartbeat = _FakeHeartbeatMonitor(heartbeat_nodes)
    enhanced = _FakeEnhancedDiscovery(enhanced_nodes)

    monkeypatch.setattr("app.services.cluster.registry.get_cluster_registry", lambda: registry)
    monkeypatch.setattr("app.services.cluster.heartbeat_monitor.get_heartbeat_monitor", lambda: heartbeat)
    monkeypatch.setattr("app.services.cluster.mdns_discovery_enhanced.get_enhanced_mdns_discovery", lambda: enhanced)
    monkeypatch.setattr(cluster_health, "get_heartbeat_monitor", lambda: heartbeat)


def test_peer_discovery_status_merges_mdns_registry_and_enhanced_sources(monkeypatch):
    _install_visibility_fakes(
        monkeypatch,
        peers={
            "peer-a": {
                "host": "10.0.0.20",
                "port": 9000,
                "mode": "AUDIO-NODE",
                "discovered_at": "2026-03-23T09:00:00+00:00",
                "last_seen": "2026-03-23T09:01:00+00:00",
            }
        },
        registry_nodes=[
            {
                "id": "peer-a",
                "hostname": "rack-a",
                "ip_address": "10.0.0.20",
                "role": "AUDIO-NODE",
                "status": "online",
                "health_score": 88.0,
                "metadata": {"api_port": 8080},
            },
            {
                "id": "peer-b",
                "hostname": "rack-b",
                "ip_address": "10.0.0.21",
                "role": "MANAGEMENT-NODE",
                "status": "online",
                "health_score": 93.0,
                "metadata": {"api_port": 8081},
            },
        ],
        heartbeat_nodes={
            "peer-b": NodeHealthStatus(
                node_id="peer-b",
                is_online=True,
                last_seen=datetime.now(timezone.utc),
                response_time_ms=3.5,
                metadata={"source": "heartbeat"},
            )
        },
        enhanced_nodes=[
            _FakeEnhancedNode(
                node_id="peer-a",
                hostname="rack-a",
                addresses=["10.0.0.20"],
                port=9000,
                role="AUDIO-NODE",
                health_score=90.0,
                capabilities=_FakeCapabilities(cpu_cores=8, memory_gb=16, audio_interfaces=["Hotone Jogg"]),
            ),
            _FakeEnhancedNode(
                node_id="peer-c",
                hostname="rack-c",
                addresses=["10.0.0.22"],
                port=8000,
                role="AUDIO-NODE",
                health_score=75.0,
                capabilities=_FakeCapabilities(cpu_cores=4, memory_gb=8, audio_interfaces=["Built-in Audio"]),
            ),
        ],
    )

    async def _fake_ping(host: str, peer_port: int = 8000):
        return {
            ("10.0.0.20", 9000): 2.5,
            ("10.0.0.21", 8081): 3.5,
            ("10.0.0.22", 8000): 4.5,
        }[(host, peer_port)]

    monkeypatch.setattr(peer_discovery, "_ping_peer", _fake_ping)

    payload = asyncio.run(peer_discovery.get_peer_discovery_status())

    assert payload.peers_discovered == 3
    peers = {peer.node_id: peer for peer in payload.peers}
    assert peers["peer-a"].port == 9000
    assert peers["peer-a"].api_url == "http://10.0.0.20:9000"
    assert peers["peer-a"].is_online is True
    assert set(peers["peer-a"].discovery_sources) == {"enhanced_mdns", "mdns", "registry"}
    assert peers["peer-a"].visibility_state == "managed-discovered"
    assert peers["peer-a"].registration_required is False
    assert peers["peer-a"].routing_ready is True
    assert peers["peer-b"].registered is True
    assert peers["peer-b"].is_online is True
    assert peers["peer-b"].api_url == "http://10.0.0.21:8081"
    assert peers["peer-b"].visibility_state == "managed-online"
    assert peers["peer-b"].routing_ready is True
    assert peers["peer-c"].registered is False
    assert peers["peer-c"].hostname == "rack-c"
    assert peers["peer-c"].visibility_state == "discovered-unmanaged"
    assert peers["peer-c"].registration_required is True
    assert peers["peer-c"].routing_ready is False
    assert peers["peer-c"].discovered_via_cluster_mdns is True


def test_cluster_visibility_routes_return_union_of_discovery_and_heartbeat_sources(monkeypatch):
    _install_visibility_fakes(
        monkeypatch,
        peers={
            "peer-mdns": {
                "host": "10.0.0.30",
                "port": 8000,
                "mode": "AUDIO-NODE",
                "last_seen": "2026-03-23T09:01:00+00:00",
            }
        },
        registry_nodes=[
            {
                "id": "peer-heartbeat",
                "hostname": "rack-heartbeat",
                "ip_address": "10.0.0.31",
                "role": "MANAGEMENT-NODE",
                "status": "online",
                "metadata": {"api_port": 8080},
            },
            {
                "id": "peer-offline",
                "hostname": "rack-offline",
                "ip_address": "10.0.0.32",
                "role": "AUDIO-NODE",
                "status": "offline",
                "metadata": {"api_port": 8080},
            },
        ],
        heartbeat_nodes={
            "peer-heartbeat": NodeHealthStatus(
                node_id="peer-heartbeat",
                is_online=True,
                last_seen=datetime.now(timezone.utc),
                response_time_ms=5.0,
                metadata={},
            ),
            "peer-offline": NodeHealthStatus(
                node_id="peer-offline",
                is_online=False,
                last_seen=datetime.now(timezone.utc) - timedelta(seconds=30),
                consecutive_failures=3,
                metadata={},
            ),
        },
        enhanced_nodes=[],
    )

    online_payload = asyncio.run(cluster_health.get_online_nodes())
    offline_payload = asyncio.run(cluster_health.get_offline_nodes())
    health_payload = asyncio.run(cluster_health.get_cluster_health())
    discovered_payload = asyncio.run(cluster_admin.get_discovered_nodes())

    assert online_payload["contract_version"] == "2026-03-23"
    assert online_payload["online_nodes"] == ["peer-heartbeat", "peer-mdns"]
    assert online_payload["nodes"]["peer-mdns"]["sources"] == ["mdns"]
    assert online_payload["nodes"]["peer-mdns"]["visibility_state"] == "discovered-unmanaged"
    assert online_payload["nodes"]["peer-mdns"]["registration_required"] is True
    assert online_payload["nodes"]["peer-mdns"]["routing_ready"] is False
    assert online_payload["nodes"]["peer-heartbeat"]["visibility_state"] == "managed-online"
    assert online_payload["nodes"]["peer-heartbeat"]["routing_ready"] is True
    assert offline_payload["offline_nodes"] == ["peer-offline"]
    assert health_payload["visibility_contract"].startswith("mDNS-only peers remain operator-visible")
    assert health_payload["nodes"]["peer-mdns"]["metadata"]["visibility_state"] == "discovered-unmanaged"
    assert health_payload["nodes"]["peer-offline"]["metadata"]["visibility_state"] == "managed-offline"
    assert discovered_payload["total_discovered"] == 3
    assert discovered_payload["counts"]["managed_online_nodes"] == 1
    assert discovered_payload["counts"]["managed_offline_nodes"] == 1
    assert discovered_payload["counts"]["discovered_unmanaged_nodes"] == 1
    assert discovered_payload["counts"]["routing_ready_nodes"] == 1
    discovered_by_id = {node["node_id"]: node for node in discovered_payload["nodes"]}
    assert discovered_by_id["peer-mdns"]["is_online"] is True
    assert discovered_by_id["peer-mdns"]["visibility_state"] == "discovered-unmanaged"
    assert discovered_by_id["peer-mdns"]["registration_required"] is True
    assert discovered_by_id["peer-mdns"]["routing_ready"] is False
    assert discovered_by_id["peer-heartbeat"]["registered"] is True
    assert discovered_by_id["peer-heartbeat"]["visibility_state"] == "managed-online"
    assert discovered_by_id["peer-heartbeat"]["routing_ready"] is True
    assert discovered_by_id["peer-offline"]["registry_status"] == "offline"
    assert discovered_by_id["peer-offline"]["visibility_state"] == "managed-offline"


def test_heartbeat_monitor_resolves_dict_registry_rows_to_api_urls():
    node_id, node_url = HeartbeatMonitor._resolve_registry_node_endpoint(
        {
            "id": "peer-reg",
            "hostname": "rack-reg",
            "ip_address": "10.0.0.40",
            "metadata": {"api_port": 8081},
        }
    )

    assert node_id == "peer-reg"
    assert node_url == "http://10.0.0.40:8081"


def test_cluster_admin_discovered_payload_uses_timezone_aware_timestamp(monkeypatch):
    monkeypatch.setattr(cluster_admin, "get_visible_cluster_summary", lambda: {"total_nodes": 0, "counts": {}, "nodes": []})

    payload = asyncio.run(cluster_admin.get_discovered_nodes())
    parsed = datetime.fromisoformat(payload["timestamp"])

    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)


def test_cluster_admin_certificate_status_uses_timezone_aware_timestamp(monkeypatch):
    monkeypatch.setattr(
        cluster_admin,
        "get_cluster_ca",
        lambda: type(
            "_FakeCA",
            (),
            {
                "get_certificate_expiry": lambda self, node_id: datetime(2026, 4, 12, 12, 0, tzinfo=timezone.utc),
                "should_renew_certificate": lambda self, node_id: node_id == "peer-a",
                "has_root_ca": lambda self: True,
            },
        )(),
    )
    monkeypatch.setattr(
        cluster_admin,
        "get_cluster_registry",
        lambda: type("_FakeRegistry", (), {"get_all_nodes": lambda self: [{"id": "peer-a"}]})(),
    )

    payload = asyncio.run(cluster_admin.get_certificate_status())
    parsed = datetime.fromisoformat(payload["timestamp"])

    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)
    assert payload["certificates"]["peer-a"]["expiry"].endswith("+00:00")
