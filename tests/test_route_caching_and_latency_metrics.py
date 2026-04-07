import asyncio
import time
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from fastapi import Response
from fastapi import HTTPException
from starlette.requests import Request

from app.routes import chains as chains_routes
from app.routes import health as health_routes
from app.routes import history as history_routes
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
    plugins_routes.ensure_plugin_route_ready = lambda _route: None
    response = Response()
    payload = asyncio.run(plugins_routes.list_plugins(response))

    assert payload["count"] >= 0
    assert response.headers["Cache-Control"] == "public, max-age=60"


def test_chains_list_supports_etag_304(monkeypatch):
    monkeypatch.setattr(chains_routes, "ensure_chain_route_ready", lambda _route: None)
    monkeypatch.setattr(chains_routes, "ChainService", lambda session: _FakeChainService())
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session_ctx())

    response = Response()
    request = _make_request("/api/chains/")
    payload = asyncio.run(chains_routes.list_chains(request, response))

    assert payload["count"] == 1
    assert response.headers["Cache-Control"] == "no-store"
    etag = response.headers["ETag"]

    conditional_request = _make_request("/api/chains/", if_none_match=etag)
    conditional_response = Response()
    not_modified = asyncio.run(chains_routes.list_chains(conditional_request, conditional_response))

    assert isinstance(not_modified, Response)
    assert not_modified.status_code == 304
    assert not_modified.headers["ETag"] == etag


def test_chain_cache_invalidation_clears_list_and_detail_entries(monkeypatch):
    monkeypatch.setattr(chains_routes, "_chain_list_cache", {"chains": [{"id": 7, "name": "Grid"}], "count": 1})
    monkeypatch.setattr(chains_routes, "_chain_list_cache_etag", '"etag"')
    monkeypatch.setattr(chains_routes, "_chain_list_cache_at", 123.0)
    monkeypatch.setattr(chains_routes, "_chain_details_cache", {
        7: (456.0, {"id": 7, "name": "Grid", "plugins": []}),
        8: (789.0, {"id": 8, "name": "Keep", "plugins": []}),
    })

    chains_routes._invalidate_chain_cache(7)

    assert chains_routes._chain_list_cache is None
    assert chains_routes._chain_list_cache_etag is None
    assert chains_routes._chain_list_cache_at == 0.0
    assert 7 not in chains_routes._chain_details_cache
    assert 8 in chains_routes._chain_details_cache


def test_remove_plugin_route_passes_position_to_service(monkeypatch):
    captured: dict[str, int | str | None] = {}

    class _FakeChainService:
        def __init__(self, session) -> None:
            self.session = session

        async def remove_plugin_from_chain(self, chain_id, plugin_uri, plugin_position=None):
            captured["chain_id"] = chain_id
            captured["plugin_uri"] = plugin_uri
            captured["plugin_position"] = plugin_position
            return True

    @asynccontextmanager
    async def _fake_session():
        yield object()

    async def _fake_publish(channel, event_type, payload):
        captured["event_payload"] = payload

    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session())
    monkeypatch.setattr(chains_routes.event_publisher, "publish", _fake_publish)

    payload = asyncio.run(
        chains_routes.remove_plugin_from_chain(
            chain_id=12,
            plugin_uri="map2://juce/dynamics/limiter",
            plugin_position=3,
        )
    )

    assert payload["status"] == "plugin_removed"
    assert payload["plugin_position"] == 3
    assert captured["chain_id"] == 12
    assert captured["plugin_uri"] == "map2://juce/dynamics/limiter"
    assert captured["plugin_position"] == 3
    assert captured["event_payload"] == {
        "chain_id": 12,
        "plugin_uri": "map2://juce/dynamics/limiter",
        "plugin_position": 3,
    }


def test_add_plugin_route_returns_plugin_position(monkeypatch):
    captured: dict[str, object] = {}

    class _FakeExecuteResult:
        def __init__(self, *, scalar_value=None, scalar_one_value=None, scalar_items=None):
            self._scalar_value = scalar_value
            self._scalar_one_value = scalar_one_value
            self._scalar_items = scalar_items or []

        def scalar_one_or_none(self):
            return self._scalar_value

        def scalar_one(self):
            return self._scalar_one_value

        def scalars(self):
            return SimpleNamespace(first=lambda: self._scalar_items[0] if self._scalar_items else None)

    class _FakeSession:
        async def execute(self, statement):
            sql_text = str(statement)
            if "count(*)" in sql_text.lower():
                return _FakeExecuteResult(scalar_one_value=3)
            if "chain_plugins.position" in sql_text.lower():
                return _FakeExecuteResult(scalar_items=[4])
            return _FakeExecuteResult(scalar_value=SimpleNamespace(name="Test Chain"))

    class _FakeChainService:
        def __init__(self, session) -> None:
            self.session = session

        async def add_plugin_to_chain(self, chain_id, plugin_uri):
            captured["chain_id"] = chain_id
            captured["plugin_uri"] = plugin_uri
            return True

    @asynccontextmanager
    async def _fake_session():
        yield _FakeSession()

    async def _fake_publish(channel, event_type, payload):
        captured["event_payload"] = payload

    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session())
    monkeypatch.setattr(chains_routes.event_publisher, "publish", _fake_publish)

    payload = asyncio.run(
        chains_routes.add_plugin_to_chain(
            chain_id=21,
            plugin_uri="map2://juce/modulation/chorus",
        )
    )

    assert payload["status"] == "plugin_added"
    assert payload["chain_id"] == 21
    assert payload["plugin"] == "map2://juce/modulation/chorus"
    assert payload["plugins_count"] == 3
    assert payload["plugin_position"] == 4
    assert captured["event_payload"] == {
        "chain_id": 21,
        "plugin_uri": "map2://juce/modulation/chorus",
        "plugin_position": 4,
    }


def test_reorder_plugins_route_passes_positioned_plugin_refs_to_service(monkeypatch):
    captured: dict[str, object] = {}

    class _FakeChainService:
        def __init__(self, session) -> None:
            self.session = session

        async def reorder_plugins(self, chain_id, plugin_order):
            captured["chain_id"] = chain_id
            captured["plugin_order"] = plugin_order
            return True

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session())

    payload = asyncio.run(
        chains_routes.reorder_plugins(
            44,
            [
                {"uri": "map2://juce/modulation/chorus", "position": 2},
                {"plugin_uri": "map2://juce/dynamics/compressor", "plugin_position": 0},
            ],
        )
    )

    assert payload == {
        "status": "reordered",
        "chain_id": 44,
        "plugins": [
            {"plugin_uri": "map2://juce/modulation/chorus", "plugin_position": 2},
            {"plugin_uri": "map2://juce/dynamics/compressor", "plugin_position": 0},
        ],
    }
    assert captured["chain_id"] == 44
    assert captured["plugin_order"] == payload["plugins"]


def test_update_touchscreen_stomps_route_passes_assignments_to_service(monkeypatch):
    captured: dict[str, object] = {}

    class _FakeChainService:
        def __init__(self, session) -> None:
            self.session = session

        async def set_touchscreen_stomp_assignments(self, chain_id, assignments):
            captured["chain_id"] = chain_id
            captured["assignments"] = assignments
            return {"chain_id": chain_id, "stomp_assignments": assignments}

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session())

    payload = asyncio.run(
        chains_routes.update_chain_touchscreen_stomps(
            9,
            chains_routes.TouchscreenStompAssignmentsRequest(
                assignments=[
                    chains_routes.TouchscreenStompAssignment(
                        slot=1,
                        plugin_uri="map2://juce/dynamics/compressor",
                        plugin_position=0,
                    ),
                    chains_routes.TouchscreenStompAssignment(
                        slot=2,
                        plugin_uri="map2://juce/delay",
                        plugin_position=3,
                    ),
                ]
            ),
        )
    )

    assert payload["chain_id"] == 9
    assert payload["stomp_assignments"] == [
        {"slot": 1, "plugin_uri": "map2://juce/dynamics/compressor", "plugin_position": 0},
        {"slot": 2, "plugin_uri": "map2://juce/delay", "plugin_position": 3},
    ]
    assert captured["chain_id"] == 9
    assert captured["assignments"] == payload["stomp_assignments"]


def test_get_chain_touchscreen_state_raises_404_when_chain_missing(monkeypatch):
    class _FakeChainService:
        def __init__(self, session) -> None:
            self.session = session

        async def get_touchscreen_state(self, chain_id):
            assert chain_id == 99
            return None

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr("app.database.get_session", lambda: _fake_session())

    with pytest.raises(HTTPException) as exc:
        asyncio.run(chains_routes.get_chain_touchscreen_state(99))

    assert exc.value.status_code == 404


def test_history_status_route_awaits_service(monkeypatch):
    async def _fake_get_status():
        return {
            "can_undo": True,
            "can_redo": False,
            "next_undo": "Add plugin",
            "next_redo": None,
            "session_id": "test-session",
            "max_history": 100,
        }

    monkeypatch.setattr(history_routes.command_history, "get_status", _fake_get_status)

    payload = asyncio.run(history_routes.get_status())

    assert payload["can_undo"] is True
    assert payload["can_redo"] is False
    assert payload["next_undo"] == "Add plugin"


def test_history_undo_route_checks_can_undo_async(monkeypatch):
    async def _fake_can_undo():
        return False

    async def _fake_undo():
        raise AssertionError("undo() should not be called when can_undo is false")

    monkeypatch.setattr(history_routes.command_history, "can_undo", _fake_can_undo)
    monkeypatch.setattr(history_routes.command_history, "undo", _fake_undo)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(history_routes.undo())

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Nothing to undo"


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
    monkeypatch.setattr(plugins_routes, "ensure_plugin_route_ready", lambda _route: None)
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


def test_plugins_discover_excludes_hardware_from_generic_catalog(monkeypatch):
    monkeypatch.setattr(plugins_routes, "ensure_plugin_route_ready", lambda _route: None)
    class _Loader:
        def discover_plugins(self, force_refresh: bool = False):
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

    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_cache_timestamp", 0)
    monkeypatch.setattr(plugins_routes, "_juce_processors_cache", [])
    monkeypatch.setattr(plugins_routes, "_plugin_discovery_lock", None)
    monkeypatch.setattr(
        plugins_routes,
        "_get_juce_processors",
        lambda: [{"uri": "map2://juce/delay", "name": "Delay", "format": "JUCE"}],
    )
    monkeypatch.setattr(
        plugins_routes,
        "_get_hardware_plugins",
        lambda: [{"uri": "hardware://lexicon-mpx1-spdif", "name": "Lexicon MPX-1", "is_hardware": True}],
    )
    monkeypatch.setattr(plugins_routes.service_manager, "get_plugin_loader", lambda: _Loader())

    payload = asyncio.run(plugins_routes.discover_plugins(Response(), refresh=False))

    assert [plugin["uri"] for plugin in payload["plugins"]] == [
        "map2://juce/delay",
        "urn:test:plugin",
    ]


def test_plugins_discover_loader_unavailable_fallback_excludes_hardware(monkeypatch):
    monkeypatch.setattr(plugins_routes, "ensure_plugin_route_ready", lambda _route: None)
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_cache_timestamp", 0)
    monkeypatch.setattr(plugins_routes, "_juce_processors_cache", [])
    monkeypatch.setattr(plugins_routes, "_plugin_discovery_lock", None)
    monkeypatch.setattr(
        plugins_routes,
        "_get_juce_processors",
        lambda: [{"uri": "map2://juce/delay", "name": "Delay", "format": "JUCE"}],
    )
    monkeypatch.setattr(
        plugins_routes,
        "_get_hardware_plugins",
        lambda: [{"uri": "hardware://lexicon-mpx1-spdif", "name": "Lexicon MPX-1", "is_hardware": True}],
    )
    monkeypatch.setattr(plugins_routes.service_manager, "get_plugin_loader", lambda: None)

    payload = asyncio.run(plugins_routes.discover_plugins(Response(), refresh=False))

    assert payload["count"] == 1
    assert [plugin["uri"] for plugin in payload["plugins"]] == ["map2://juce/delay"]
    assert "hardware" not in payload["warning"].lower()
