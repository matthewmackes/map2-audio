import asyncio
import json

import httpx
from starlette.requests import Request
from starlette.responses import Response

import app.middleware.cluster_proxy as cluster_proxy_module
from app.middleware.cluster_proxy import ClusterProxyMiddleware, close_all_cluster_proxy_clients


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


async def _app_204(scope, receive, send):
    await send(
        {
            "type": "http.response.start",
            "status": 204,
            "headers": [],
        }
    )
    await send(
        {
            "type": "http.response.body",
            "body": b"",
            "more_body": False,
        }
    )


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
        headers=[(b"host", b"map2.local"), (b"x-extra", b"1")],
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
    assert "host" not in recorded["headers"]
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


def test_get_client_serializes_concurrent_creation(monkeypatch):
    created: list[object] = []

    class _FakeClient:
        def __init__(self, node_id: str, base_url: str, timeout_s: float, max_connections: int) -> None:
            created.append((node_id, base_url, timeout_s, max_connections))
            self.node_id = node_id
            self.base_url = base_url

        async def aclose(self):
            return None

    monkeypatch.setattr(cluster_proxy_module, "_NodeClient", _FakeClient)

    async def _run():
        middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
        node = _FakeNode("remote-node", host="10.2.3.4", port=8181)

        client_a, client_b = await asyncio.gather(
            middleware._get_client(node),
            middleware._get_client(node),
        )

        assert client_a is client_b
        assert len(created) == 1
        await middleware.aclose()

    asyncio.run(_run())


def test_record_metric_tracks_request_count():
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)

    middleware._record_metric("node-a", success=True, latency_ms=12.0)
    middleware._record_metric("node-a", success=False, latency_ms=18.0)

    assert middleware.metrics["node-a"]["request_count"] == 2
    assert middleware.metrics["node-a"]["errors"] == 1
    assert middleware.metrics["node-a"]["p50_ms"] == 15.0


def test_close_all_cluster_proxy_clients_closes_registered_instances():
    class _Client:
        def __init__(self):
            self.closed = False

        async def aclose(self):
            self.closed = True

    middleware_a = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware_b = ClusterProxyMiddleware(lambda scope, receive, send: None)
    client_a = _Client()
    client_b = _Client()
    middleware_a.clients = {"a": client_a}  # type: ignore[assignment]
    middleware_b.clients = {"b": client_b}  # type: ignore[assignment]

    asyncio.run(close_all_cluster_proxy_clients())

    assert client_a.closed is True
    assert client_b.closed is True


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


def test_call_passthrough_without_node_id_uses_local_app():
    middleware = ClusterProxyMiddleware(_app_204)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/audio/status",
        "headers": [],
        "query_string": b"",
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }

    status, body = asyncio.run(_invoke_middleware(middleware, scope))

    assert status == 204
    assert body == b""


def test_call_skips_excluded_cluster_prefix_even_with_node_id():
    middleware = ClusterProxyMiddleware(_app_204)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/cluster/health",
        "headers": [],
        "query_string": b"node_id=remote-node",
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }

    status, body = asyncio.run(_invoke_middleware(middleware, scope))

    assert status == 204
    assert body == b""


def test_call_rejects_websocket_upgrade_requests():
    middleware = ClusterProxyMiddleware(_app_204)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/audio/status",
        "headers": [(b"upgrade", b"websocket")],
        "query_string": b"node_id=remote-node",
        "server": ("testserver", 8080),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }

    status, body = asyncio.run(_invoke_middleware(middleware, scope))

    assert status == 400
    assert body.decode("utf-8") == "WebSocket proxying not supported here"
