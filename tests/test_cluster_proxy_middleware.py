import asyncio
import json

import httpx
from starlette.requests import Request
from starlette.responses import Response

from app.middleware.cluster_proxy import ClusterProxyMiddleware


class _FakeNode:
    def __init__(self, node_id: str, host: str = "127.0.0.1", port: int = 8080) -> None:
        self.node_id = node_id
        self.addresses = [host]
        self.port = port

    def is_online(self, cache_timeout: float) -> bool:
        return True


class _FakeDiscovery:
    def __init__(self, nodes: list[_FakeNode] | None = None) -> None:
        self.nodes = nodes or [_FakeNode("local-node"), _FakeNode("remote-node")]
        self.cache_timeout = 30.0

    def get_discovered_nodes(self, online_only: bool = True):
        return list(self.nodes)

    def get_discovered_node(self, node_id: str):
        for node in self.nodes:
            if node.node_id == node_id:
                return node
        return None


def _make_request(
    path: str,
    *,
    query_string: bytes = b"",
    headers: list[tuple[bytes, bytes]] | None = None,
) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": headers or [],
        "query_string": query_string,
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }
    return Request(scope)


async def _invoke_middleware(middleware: ClusterProxyMiddleware, scope: dict) -> tuple[int, bytes]:
    messages: list[dict] = []

    async def _receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def _send(message):
        messages.append(message)

    await middleware(scope, _receive, _send)

    start = next(message for message in messages if message["type"] == "http.response.start")
    body = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return start["status"], body


def test_fanout_includes_local_node(monkeypatch):
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware.discovery = _FakeDiscovery()
    middleware.local_node_id = "local-node"

    async def _fake_local(request, params, body):
        return Response(content='{"source":"local"}', media_type="application/json")

    async def _fake_single(node_id, request, params, body):
        return Response(content=json.dumps({"source": node_id}), media_type="application/json")

    monkeypatch.setattr(middleware, "_proxy_local", _fake_local)
    monkeypatch.setattr(middleware, "_proxy_single", _fake_single)

    response = asyncio.run(middleware._fanout(_make_request("/api/audio/status"), [], b""))
    payload = json.loads(response.body.decode("utf-8"))

    assert response.status_code == 200
    assert payload["nodes"]["local-node"]["body"] == {"source": "local"}
    assert payload["nodes"]["remote-node"]["body"] == {"source": "remote-node"}


def test_proxy_single_returns_404_when_node_is_unknown():
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware.discovery = _FakeDiscovery([_FakeNode("local-node")])
    middleware.local_node_id = "local-node"

    response = asyncio.run(
        middleware._proxy_single(
            "missing-node",
            _make_request("/api/audio/status"),
            [],
            b"",
        )
    )

    assert response.status_code == 404
    assert response.body.decode("utf-8") == "Node missing-node not found or offline"


def test_proxy_single_strips_node_id_and_adds_proxy_headers(monkeypatch):
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware.discovery = _FakeDiscovery([_FakeNode("local-node"), _FakeNode("remote-node", host="10.0.0.9", port=8090)])
    middleware.local_node_id = "local-node"
    recorded: dict[str, object] = {}

    class _FakeClient:
        async def request(self, method, path, params, headers, body):
            recorded["method"] = method
            recorded["path"] = path
            recorded["params"] = params
            recorded["headers"] = headers
            recorded["body"] = body
            return type(
                "_Resp",
                (),
                {
                    "content": b'{"ok":true}',
                    "status_code": 200,
                    "headers": {"content-type": "application/json", "x-test": "ok"},
                    "is_success": True,
                },
            )()

    async def _fake_get_client(node):
        recorded["node_id"] = node.node_id
        return _FakeClient()

    monkeypatch.setattr(middleware, "_get_client", _fake_get_client)

    request = _make_request(
        "/api/audio/status",
        query_string=b"node_id=remote-node&detail=full",
        headers=[(b"x-extra", b"1")],
    )
    response = asyncio.run(
        middleware._proxy_single(
            "remote-node",
            request,
            [("detail", "full")],
            b'{"payload":true}',
        )
    )

    assert recorded["node_id"] == "remote-node"
    assert recorded["method"] == "GET"
    assert recorded["path"] == "/api/audio/status"
    assert recorded["params"] == [("detail", "full")]
    assert recorded["body"] == b'{"payload":true}'
    assert recorded["headers"]["X-MAP2-Proxy-Origin"] == "local-node"
    assert recorded["headers"]["x-extra"] == "1"
    assert response.headers["X-MAP2-Proxy-Source"] == "remote-node"
    assert response.body.decode("utf-8") == '{"ok":true}'


def test_get_client_reuses_cached_client():
    async def _run():
        middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
        node = _FakeNode("remote-node", host="10.2.3.4", port=8181)

        client_a = await middleware._get_client(node)
        client_b = await middleware._get_client(node)

        assert client_a is client_b
        assert client_a.base_url == "http://10.2.3.4:8181"

        await client_a.aclose()

    asyncio.run(_run())


def test_fanout_marks_failed_nodes_as_502_and_uses_multi_status(monkeypatch):
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware.discovery = _FakeDiscovery()
    middleware.local_node_id = "local-node"

    async def _fake_local(request, params, body):
        return Response(content='{"source":"local"}', media_type="application/json")

    async def _fake_single(node_id, request, params, body):
        raise RuntimeError(f"{node_id} unavailable")

    monkeypatch.setattr(middleware, "_proxy_local", _fake_local)
    monkeypatch.setattr(middleware, "_proxy_single", _fake_single)

    response = asyncio.run(middleware._fanout(_make_request("/api/audio/status"), [], b""))
    payload = json.loads(response.body.decode("utf-8"))

    assert response.status_code == 207
    assert payload["nodes"]["local-node"] == {
        "status_code": 200,
        "body": {"source": "local"},
    }
    assert payload["nodes"]["remote-node"]["status_code"] == 502
    assert "unavailable" in payload["nodes"]["remote-node"]["body"]


def test_call_rejects_proxy_loop_header():
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/audio/status",
        "headers": [(b"x-map2-proxy-origin", b"peer-node")],
        "query_string": b"node_id=remote-node",
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }

    status, body = asyncio.run(_invoke_middleware(middleware, scope))

    assert status == 400
    assert body.decode("utf-8") == "Proxy loop detected"


def test_call_returns_504_when_remote_proxy_times_out(monkeypatch):
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)

    async def _fake_proxy_single(node_id, request, params, body):
        raise httpx.TimeoutException("simulated timeout")

    monkeypatch.setattr(middleware, "_proxy_single", _fake_proxy_single)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/audio/status",
        "headers": [],
        "query_string": b"node_id=remote-node",
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }

    status, body = asyncio.run(_invoke_middleware(middleware, scope))

    assert status == 504
    assert "Timeout contacting node remote-node" in body.decode("utf-8")
