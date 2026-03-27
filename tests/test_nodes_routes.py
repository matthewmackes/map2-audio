from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.node import NodeHealth, NodeIdentity, NodeRole, NodeServices, NodeSummary, NodeTopology
from app.routes import nodes as node_routes


class _FakeDiscoveryService:
    def __init__(self, target=None) -> None:
        self.target = target
        self.saved_labels: list[str] = []

    async def get_local_identity(self) -> NodeIdentity:
        return NodeIdentity(
            hostname="map2-local",
            display_label=None,
            role=NodeRole.all_in_one,
            node_id="node-local",
        )

    async def get_topology(self) -> NodeTopology:
        return NodeTopology(
            nodes=[
                NodeSummary(
                    hostname="map2-local",
                    display_label=None,
                    role=NodeRole.all_in_one,
                    node_id="node-local",
                    status="ok",
                    cpu_percent=10.0,
                    memory_percent=25.0,
                    xrun_count=0,
                    audio_latency_ms=1.2,
                    services=NodeServices(backend=True, juce_engine=True, pipewire=True),
                    last_seen=datetime(2026, 3, 26, 21, 40, 0),
                    is_local=True,
                    is_viewed=True,
                )
            ],
            audio_edges=[],
            network_edges=[],
        )

    async def set_display_label(self, label: str) -> NodeIdentity:
        self.saved_labels.append(label)
        return NodeIdentity(
            hostname="map2-local",
            display_label=label,
            role=NodeRole.all_in_one,
            node_id="node-local",
        )

    async def resolve_known_node(self, node_id: str):
        return self.target


class _FakeHealthService:
    async def get_local_health(self) -> NodeHealth:
        return NodeHealth(
            status="ok",
            cpu_percent=8.0,
            memory_percent=30.0,
            xrun_count=0,
            audio_latency_ms=1.0,
            services=NodeServices(backend=True, juce_engine=True, pipewire=True),
        )


def _build_client(monkeypatch, discovery: _FakeDiscoveryService) -> TestClient:
    app = FastAPI()
    app.include_router(node_routes.router)
    monkeypatch.setattr(node_routes, "get_node_discovery_service", lambda: discovery)
    monkeypatch.setattr(node_routes, "get_node_health_service", lambda: _FakeHealthService())
    node_routes._proxy_buckets.clear()
    return TestClient(app)


def test_nodes_routes_expose_identity_update_and_local_proxy_forwarding(monkeypatch):
    discovery = _FakeDiscoveryService(target=SimpleNamespace(is_local=True, host="127.0.0.1"))
    forwarded: dict[str, object] = {}

    async def _fake_forward_local_proxy(*, app, method, path, headers, query_params, body):
        forwarded.update(
            method=method,
            path=path,
            headers=headers,
            query_params=query_params,
            body=body,
        )
        return httpx.Response(
            201,
            headers={"x-proxied": "local"},
            json={"ok": True},
            request=httpx.Request(method, f"http://map2.local{path}"),
        )

    client = _build_client(monkeypatch, discovery)
    monkeypatch.setattr(node_routes, "_forward_local_proxy", _fake_forward_local_proxy)

    patch_response = client.patch("/api/node/identity", json={"display_label": "Stage Left"})
    proxy_response = client.post(
        "/api/node/node-a/proxy/status?detail=full",
        headers={"Authorization": "secret", "X-Trace-Id": "trace-1"},
        content=b'{"payload":true}',
    )

    assert patch_response.status_code == 200
    assert patch_response.json()["display_label"] == "Stage Left"
    assert discovery.saved_labels == ["Stage Left"]
    assert proxy_response.status_code == 201
    assert proxy_response.json() == {"ok": True}
    assert proxy_response.headers["x-proxied"] == "local"
    assert forwarded["method"] == "POST"
    assert forwarded["path"] == "/api/status"
    assert forwarded["query_params"] == [("detail", "full")]
    assert forwarded["body"] == b'{"payload":true}'
    assert forwarded["headers"]["x-trace-id"] == "trace-1"
    assert "authorization" not in forwarded["headers"]


def test_node_proxy_returns_rate_limit_and_nested_proxy_errors(monkeypatch):
    discovery = _FakeDiscoveryService(target=SimpleNamespace(is_local=True, host="127.0.0.1"))
    client = _build_client(monkeypatch, discovery)

    monkeypatch.setattr(node_routes, "_check_proxy_rate_limit", lambda _node_id: 7)
    limited = client.get("/api/node/node-a/proxy/status")

    monkeypatch.setattr(node_routes, "_check_proxy_rate_limit", lambda _node_id: None)
    nested = client.get("/api/node/node-a/proxy/api/node/other/proxy/status")

    assert limited.status_code == 429
    assert limited.json() == {
        "error": {
            "code": "rate_limited",
            "message": "Proxy rate limit exceeded for node node-a",
            "retry_after_seconds": 7,
        }
    }
    assert limited.headers["Retry-After"] == "7"
    assert nested.status_code == 400
    assert nested.json() == {"detail": "Nested node proxy requests are not allowed"}


def test_node_proxy_returns_404_for_unknown_target(monkeypatch):
    client = _build_client(monkeypatch, _FakeDiscoveryService(target=None))
    monkeypatch.setattr(node_routes, "_check_proxy_rate_limit", lambda _node_id: None)

    response = client.get("/api/node/missing/proxy/health")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "node_not_found",
            "message": "Unknown node 'missing'",
        }
    }
