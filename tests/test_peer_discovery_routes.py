import asyncio

import pytest
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.routes import peer_discovery
from app.services.lcd_manager import set_lcd_manager


class _FakeMDNSDiscovery:
    def __init__(self, peers):
        self._peers = dict(peers)
        self.discovery_uptime = "5m 0s"

    def get_discovered_peers(self):
        return dict(self._peers)


class _FakeEventRouter:
    def __init__(self, connected=None):
        self._connected = list(connected or [])
        self.connect_calls = []

    def get_connected_peers(self):
        return list(self._connected)

    async def connect_to_peer(self, node_id: str, node_url: str):
        self.connect_calls.append((node_id, node_url))


class _FakeLCDManager:
    def __init__(self, *, peers=None, connected=None):
        self.node_id = "local-node"
        self.node_label = "local-node"
        self.mdns_discovery = _FakeMDNSDiscovery(peers or {})
        self.event_router = _FakeEventRouter(connected=connected or [])


@pytest.fixture(autouse=True)
def _reset_lcd_manager():
    peer_discovery.LATENCY_HISTORY.clear()
    set_lcd_manager(None)
    yield
    peer_discovery.LATENCY_HISTORY.clear()
    set_lcd_manager(None)


def test_get_peer_discovery_status_uses_registered_lcd_manager(monkeypatch):
    manager = _FakeLCDManager(
        peers={
            "peer-a": {
                "host": "10.0.0.2",
                "port": 8080,
                "mode": "CONTROL-NODE",
                "discovered_at": "2026-03-23T09:00:00",
                "last_seen": "2026-03-23T09:01:00",
            }
        },
        connected=["peer-a"],
    )
    set_lcd_manager(manager)

    async def _fake_ping(host: str, peer_port: int = 8000):
        assert host == "10.0.0.2"
        assert peer_port == 8080
        return 12.5

    monkeypatch.setattr(peer_discovery, "_ping_peer", _fake_ping)

    payload = asyncio.run(peer_discovery.get_peer_discovery_status())

    assert payload.local_node_id == "local-node"
    assert payload.discovery_enabled is True
    assert payload.peers_discovered == 1
    assert payload.peers_connected == 1
    assert payload.peers[0].node_id == "peer-a"
    assert payload.peers[0].api_url == "http://10.0.0.2:8080"
    assert payload.peers[0].latency_ms == 12.5
    assert "peer-a" in peer_discovery.LATENCY_HISTORY


def test_get_peer_discovery_status_http_route_returns_structured_payload(monkeypatch):
    manager = _FakeLCDManager(
        peers={
            "peer-a": {
                "host": "10.0.0.2",
                "port": 8080,
                "mode": "CONTROL-NODE",
            }
        }
    )
    set_lcd_manager(manager)

    async def _fake_ping(host: str, peer_port: int = 8000):
        return 3.5

    monkeypatch.setattr(peer_discovery, "_ping_peer", _fake_ping)

    app = FastAPI()
    app.include_router(peer_discovery.router)
    with TestClient(app) as client:
        response = client.get("/api/peers")

    assert response.status_code == 200
    payload = response.json()
    assert payload["local_node_id"] == "local-node"
    assert payload["peers_discovered"] == 1
    assert payload["peers"][0]["node_id"] == "peer-a"
    assert payload["peers"][0]["ws_url"] == "ws://10.0.0.2:8080/api/lcd/ws/events"


def test_ping_peer_uses_registered_lcd_manager(monkeypatch):
    manager = _FakeLCDManager(
        peers={
            "peer-b": {
                "host": "10.0.0.3",
                "port": 9090,
                "mode": "AUDIO-NODE",
            }
        }
    )
    set_lcd_manager(manager)

    async def _fake_ping(host: str, peer_port: int = 8000):
        assert host == "10.0.0.3"
        assert peer_port == 9090
        return 7.25

    monkeypatch.setattr(peer_discovery, "_ping_peer", _fake_ping)

    payload = asyncio.run(peer_discovery.ping_peer("peer-b"))

    assert payload["success"] is True
    assert payload["latency_ms"] == 7.25
    assert "peer-b" in peer_discovery.LATENCY_HISTORY


def test_link_peer_uses_event_router_connect_to_peer():
    manager = _FakeLCDManager()
    set_lcd_manager(manager)

    response = asyncio.run(
        peer_discovery.link_peer(
            "peer-c",
            peer_discovery.LinkPeerRequest(
                peer_id="peer-c",
                peer_host="10.0.0.9",
                setup_ssh=False,
                setup_lcd_routing=True,
            ),
        )
    )

    assert response.peer_id == "peer-c"
    assert response.lcd_routing is True
    assert manager.event_router.connect_calls == [
        ("peer-c", "ws://10.0.0.9:8000/api/lcd/ws/events")
    ]


def test_get_peer_discovery_status_requires_lcd_manager():
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(peer_discovery.get_peer_discovery_status())

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "LCD Manager not initialized"
