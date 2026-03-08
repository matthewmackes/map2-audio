import asyncio
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

from fastapi import Response
from starlette.requests import Request

from app.routes import chains as chains_routes
from app.routes import health as health_routes
from app.routes import metrics as metrics_routes
from app.routes import plugins as plugins_routes
from app.services.request_latency_metrics import get_request_latency_collector


class _FakeChainService:
    async def list_chains(self):
        return [{"id": 1, "name": "Main"}]


@asynccontextmanager
async def _fake_session_ctx():
    yield object()


def _make_request(path: str, if_none_match: str | None = None) -> Request:
    headers = []
    if if_none_match is not None:
        headers.append((b"if-none-match", if_none_match.encode("utf-8")))
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": headers,
        "query_string": b"",
        "server": ("testserver", 80),
        "client": ("127.0.0.1", 1234),
        "scheme": "http",
        "http_version": "1.1",
    }
    return Request(scope)


def test_health_version_and_config_set_cache_headers():
    version_response = Response()
    config_response = Response()

    version_payload = asyncio.run(health_routes.get_version(version_response))
    config_payload = asyncio.run(health_routes.get_config(config_response))

    assert version_payload["version"]
    assert config_payload["sample_rates"]
    assert version_response.headers["Cache-Control"] == "public, max-age=60"
    assert config_response.headers["Cache-Control"] == "public, max-age=60"


def test_plugins_list_sets_cache_header():
    response = Response()
    payload = asyncio.run(plugins_routes.list_plugins(response))

    assert payload["count"] >= 0
    assert response.headers["Cache-Control"] == "public, max-age=60"


def test_chains_list_supports_etag_304(monkeypatch):
    monkeypatch.setattr(chains_routes, "ChainService", lambda session: _FakeChainService())
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session_ctx())

    response = Response()
    request = _make_request("/api/chains/")
    payload = asyncio.run(chains_routes.list_chains(request, response))

    assert payload["count"] == 1
    assert response.headers["Cache-Control"] == "public, max-age=60"
    etag = response.headers["ETag"]

    conditional_request = _make_request("/api/chains/", if_none_match=etag)
    conditional_response = Response()
    not_modified = asyncio.run(chains_routes.list_chains(conditional_request, conditional_response))

    assert isinstance(not_modified, Response)
    assert not_modified.status_code == 304
    assert not_modified.headers["ETag"] == etag


def test_metrics_latency_includes_route_group_percentiles(monkeypatch):
    collector = get_request_latency_collector()
    collector.record("/api/health", 2.0)
    collector.record("/api/chains", 4.0)
    collector.record("/api/plugins/discover", 6.0)

    class _FakeMetricsCollector:
        def get_metrics_history(self, metric_type, limit):
            assert metric_type == "latency"
            return [{"timestamp": "2026-03-07T00:00:00Z", "value": 1.5}]

    async def _fake_get_metrics_collector():
        return _FakeMetricsCollector()

    monkeypatch.setattr(metrics_routes, "get_metrics_collector", _fake_get_metrics_collector)

    payload = asyncio.run(metrics_routes.get_latency_history(limit=10))

    assert "history" in payload
    assert "routes" in payload
    assert "health" in payload["routes"]
    assert "chains" in payload["routes"]
    assert "plugins" in payload["routes"]


def test_plugins_discover_uses_singleflight_under_concurrency(monkeypatch):
    class _SlowLoader:
        def __init__(self) -> None:
            self.calls = 0

        def discover_plugins(self, force_refresh: bool = False):
            self.calls += 1
            time.sleep(0.03)
            return [
                SimpleNamespace(
                    uri="urn:test:plugin",
                    name="Test Plugin",
                    author="MAP2",
                    category="Utility",
                    class_label="Utility",
                    version="1.0",
                    license="AGPL-3.0-only",
                    has_ui=False,
                    in_port_count=2,
                    out_port_count=2,
                    parameters=[],
                )
            ]

    loader = _SlowLoader()

    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_cache_timestamp", 0)
    monkeypatch.setattr(plugins_routes, "_juce_processors_cache", [])
    monkeypatch.setattr(plugins_routes, "_plugin_discovery_lock", None)
    monkeypatch.setattr(plugins_routes, "_get_juce_processors", lambda: [])
    monkeypatch.setattr(plugins_routes, "_get_hardware_plugins", lambda: [])
    monkeypatch.setattr(plugins_routes.service_manager, "get_plugin_loader", lambda: loader)

    async def _run_concurrent_discover():
        return await asyncio.gather(
            plugins_routes.discover_plugins(Response(), refresh=False),
            plugins_routes.discover_plugins(Response(), refresh=False),
            plugins_routes.discover_plugins(Response(), refresh=False),
            plugins_routes.discover_plugins(Response(), refresh=False),
        )

    payloads = asyncio.run(_run_concurrent_discover())

    assert loader.calls == 1
    assert all(payload["count"] == 1 for payload in payloads)
