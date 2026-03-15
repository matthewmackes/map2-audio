from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

import httpx

from app.routes import nodes as node_routes


class _KnownNode:
    def __init__(self, *, node_id: str, host: str, hostname: str, is_local: bool = False):
        self.node_id = node_id
        self.host = host
        self.hostname = hostname
        self.is_local = is_local


class _FakeDiscoveryService:
    def __init__(self, known_node=None):
        self.known_node = known_node

    async def get_local_identity(self):
        raise AssertionError("not used")

    async def get_topology(self):
        raise AssertionError("not used")

    async def set_display_label(self, label: str):
        raise AssertionError("not used")

    async def resolve_known_node(self, node_id: str):
        if self.known_node and node_id == self.known_node.node_id:
            return self.known_node
        if self.known_node and node_id == "local-node" and self.known_node.is_local:
            return self.known_node
        return None


def _build_client(monkeypatch, discovery_service) -> TestClient:
    app = FastAPI()

    @app.get("/api/echo")
    async def echo():
        return {"ok": True, "source": "local"}

    app.include_router(node_routes.router)
    monkeypatch.setattr(node_routes, "get_node_discovery_service", lambda: discovery_service)
    return TestClient(app)


def test_proxy_to_local_node_routes_without_remote_hop(monkeypatch):
    discovery = _FakeDiscoveryService(_KnownNode(node_id="local-node", host="127.0.0.1", hostname="map2-local", is_local=True))
    client = _build_client(monkeypatch, discovery)

    response = client.get("/api/node/local-node/proxy/echo")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "source": "local"}


def test_proxy_to_known_peer_forwards_request(monkeypatch):
    discovery = _FakeDiscoveryService(_KnownNode(node_id="node-peer", host="10.0.0.22", hostname="map2-peer", is_local=False))
    client = _build_client(monkeypatch, discovery)

    async def _fake_forward_remote_proxy(**kwargs):
        request = httpx.Request("GET", "http://peer/api/echo")
        return httpx.Response(200, json={"ok": True, "source": kwargs["host"]}, request=request)

    monkeypatch.setattr(node_routes, "_forward_remote_proxy", _fake_forward_remote_proxy)

    response = client.get("/api/node/node-peer/proxy/echo")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "source": "10.0.0.22"}


def test_proxy_unknown_node_returns_404(monkeypatch):
    client = _build_client(monkeypatch, _FakeDiscoveryService())

    response = client.get("/api/node/missing-node/proxy/echo")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "node_not_found"


def test_proxy_timeout_returns_504(monkeypatch):
    discovery = _FakeDiscoveryService(_KnownNode(node_id="node-peer", host="10.0.0.22", hostname="map2-peer", is_local=False))
    client = _build_client(monkeypatch, discovery)

    async def _timeout(**kwargs):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(node_routes, "_forward_remote_proxy", _timeout)

    response = client.get("/api/node/node-peer/proxy/echo")

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "node_unreachable"


def test_proxy_path_traversal_is_rejected(monkeypatch):
    discovery = _FakeDiscoveryService(_KnownNode(node_id="node-peer", host="10.0.0.22", hostname="map2-peer", is_local=False))
    client = _build_client(monkeypatch, discovery)

    response = client.get("/api/node/node-peer/proxy/%2E%2E/%2E%2E/etc/passwd")

    assert response.status_code == 400


def test_proxy_rate_limit_returns_429_on_61st_request(monkeypatch):
    discovery = _FakeDiscoveryService(_KnownNode(node_id="local-node", host="127.0.0.1", hostname="map2-local", is_local=True))
    client = _build_client(monkeypatch, discovery)

    node_routes._proxy_buckets.clear()

    for _ in range(60):
        response = client.get("/api/node/local-node/proxy/echo")
        assert response.status_code == 200

    limited = client.get("/api/node/local-node/proxy/echo")

    assert limited.status_code == 429
