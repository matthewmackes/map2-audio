from __future__ import annotations

from types import SimpleNamespace

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_cluster_proxy as proxy_routes


class _FakeDiscovery:
    def __init__(self, nodes: dict[str, object] | None = None, fallback_nodes: list[object] | None = None) -> None:
        self.discovered_midi_nodes = nodes or {}
        self._fallback_nodes = fallback_nodes or []

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self._fallback_nodes)


class _FakeAsyncClient:
    def __init__(self, *args, **kwargs) -> None:
        self.recorded = kwargs.pop("recorded")
        self.response = kwargs.pop("response")
        self.error = kwargs.pop("error", None)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def request(self, method, url, *, params, headers, content):
        self.recorded["method"] = method
        self.recorded["url"] = url
        self.recorded["params"] = list(params.multi_items()) if hasattr(params, "multi_items") else list(params.items())
        self.recorded["headers"] = dict(headers)
        self.recorded["content"] = content
        if self.error is not None:
            raise self.error
        return self.response


def _build_client(monkeypatch, discovery: _FakeDiscovery, *, response=None, error=None):
    recorded: dict[str, object] = {}

    def _client_factory(*args, **kwargs):
        return _FakeAsyncClient(*args, recorded=recorded, response=response, error=error, **kwargs)

    app = FastAPI()
    app.include_router(proxy_routes.router)
    monkeypatch.setattr(proxy_routes, "get_midi_discovery_service", lambda: discovery)
    monkeypatch.setattr(proxy_routes.httpx, "AsyncClient", _client_factory)
    return TestClient(app), recorded


def test_resolve_node_base_url_uses_fallback_and_default_port(monkeypatch):
    discovery = _FakeDiscovery(
        nodes={},
        fallback_nodes=[SimpleNamespace(node_id="node-b", addresses=["10.0.0.8"], port=None)],
    )
    monkeypatch.setattr(proxy_routes, "get_midi_discovery_service", lambda: discovery)

    base_url = __import__("asyncio").run(proxy_routes._resolve_node_base_url("node-b"))

    assert base_url == "http://10.0.0.8:8000"


def test_proxy_route_forwards_body_query_and_headers(monkeypatch):
    discovery = _FakeDiscovery(
        nodes={"node-a": SimpleNamespace(node_id="node-a", addresses=["10.0.0.9"], port=8090)},
    )
    upstream = httpx.Response(
        200,
        headers={"content-type": "application/json", "x-upstream-node": "node-a"},
        json={"ok": True, "source": "upstream"},
        request=httpx.Request("POST", "http://10.0.0.9:8090/api/hub/status"),
    )
    client, recorded = _build_client(monkeypatch, discovery, response=upstream)

    response = client.post(
        "/api/midi/cluster/proxy/nodes/node-a/hub/hub/status?detail=full",
        headers={"X-Trace-Id": "trace-1"},
        content=b'{"payload":true}',
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "source": "upstream"}
    assert response.headers["x-upstream-node"] == "node-a"
    assert recorded["method"] == "POST"
    assert recorded["url"] == "http://10.0.0.9:8090/api/hub/status"
    assert recorded["params"] == [("detail", "full")]
    assert recorded["headers"]["X-MAP2-Proxy-Origin"] == "node-a"
    assert recorded["headers"]["x-trace-id"] == "trace-1"
    assert recorded["content"] == b'{"payload":true}'


def test_proxy_route_returns_404_for_unknown_node(monkeypatch):
    client, _recorded = _build_client(monkeypatch, _FakeDiscovery(), response=httpx.Response(200))

    response = client.get("/api/midi/cluster/proxy/nodes/missing/hub/status")

    assert response.status_code == 404
    assert response.json()["detail"] == "Node missing not found"


def test_proxy_route_returns_504_on_timeout(monkeypatch):
    discovery = _FakeDiscovery(
        nodes={"node-a": SimpleNamespace(node_id="node-a", addresses=["10.0.0.9"], port=8090)},
    )
    request = httpx.Request("GET", "http://10.0.0.9:8090/api/status")
    timeout = httpx.TimeoutException("timed out", request=request)
    client, _recorded = _build_client(monkeypatch, discovery, response=httpx.Response(200), error=timeout)

    response = client.get("/api/midi/cluster/proxy/nodes/node-a/hub/status")

    assert response.status_code == 504
    assert "Timeout contacting node node-a" in response.json()["detail"]
