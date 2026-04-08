from __future__ import annotations

import asyncio

import app.main as main_module
from app.main import create_app
from app.middleware.api_auth import APIAuthMiddleware
from app.middleware.cluster_proxy import ClusterProxyMiddleware
from app.middleware.request_logging import RequestLoggingMiddleware
from app.middleware.traffic_capture import TrafficCaptureMiddleware

from tests.test_cluster_proxy_middleware import _FakeDiscovery, _FakeNode, _make_request


def test_create_app_orders_auth_outside_proxy():
    app = create_app()
    middleware_names = [mw.cls.__name__ for mw in app.user_middleware[:4]]

    assert middleware_names == [
        APIAuthMiddleware.__name__,
        RequestLoggingMiddleware.__name__,
        TrafficCaptureMiddleware.__name__,
        ClusterProxyMiddleware.__name__,
    ]


def test_cluster_proxy_forwards_existing_request_id(monkeypatch):
    middleware = ClusterProxyMiddleware(lambda scope, receive, send: None)
    middleware.discovery = _FakeDiscovery([_FakeNode("local-node"), _FakeNode("remote-node", host="10.0.0.9", port=8090)])
    middleware.local_node_id = "local-node"
    recorded: dict[str, object] = {}

    class _FakeClient:
        async def request(self, method, path, params, headers, body):
            recorded["headers"] = headers
            return type(
                "_Resp",
                (),
                {
                    "content": b'{"ok":true}',
                    "status_code": 200,
                    "headers": {"content-type": "application/json"},
                    "is_success": True,
                },
            )()

    async def _fake_get_client(node):
        return _FakeClient()

    monkeypatch.setattr(middleware, "_get_client", _fake_get_client)

    request = _make_request("/api/audio/status", query_string=b"node_id=remote-node")
    request.state.request_id = "req-123"
    asyncio.run(middleware._proxy_single("remote-node", request, [], b""))

    assert recorded["headers"]["X-Request-ID"] == "req-123"


def test_create_app_uses_configured_cors_origins(monkeypatch):
    monkeypatch.setattr(main_module, "_resolve_cors_settings", lambda: (["https://map2.local"], True))

    app = create_app()
    cors = next(mw for mw in app.user_middleware if mw.cls.__name__ == "CORSMiddleware")

    assert cors.kwargs["allow_origins"] == ["https://map2.local"]
    assert cors.kwargs["allow_credentials"] is True


def test_create_app_disables_credentials_for_wildcard_cors(monkeypatch):
    monkeypatch.setattr(main_module, "_resolve_cors_settings", lambda: (["*"], False))

    app = create_app()
    cors = next(mw for mw in app.user_middleware if mw.cls.__name__ == "CORSMiddleware")

    assert cors.kwargs["allow_origins"] == ["*"]
    assert cors.kwargs["allow_credentials"] is False
