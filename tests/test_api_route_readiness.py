import asyncio

import pytest
from fastapi import HTTPException

from app.routes import audio as audio_routes
from app.routes import chains as chains_routes
from app.routes import plugins as plugins_routes
from app.services import api_readiness


class _FakeOrchestrator:
    def __init__(self, status):
        self._status = status

    def get_all_status(self):
        return self._status


def _orchestrator_status(*, running=True, database_state="running", database_healthy=True,
                         plugin_loader_state="running", plugin_scan_state="ready",
                         juce_state="running", juce_healthy=True,
                         juce_running=True, juce_available=True):
    return {
        "orchestrator": {"running": running},
        "services": {
            "database": {
                "state": database_state,
                "health": {
                    "healthy": database_healthy,
                    "message": "Database responding" if database_healthy else "DB unavailable",
                    "metrics": {},
                },
            },
            "plugin_loader": {
                "state": plugin_loader_state,
                "health": {
                    "healthy": plugin_scan_state != "error",
                    "message": "",
                    "metrics": {
                        "plugin_count": 12,
                        "scan_state": plugin_scan_state,
                    },
                },
            },
            "juce_engine": {
                "state": juce_state,
                "health": {
                    "healthy": juce_healthy,
                    "message": "JUCE ok" if juce_healthy else "JUCE unavailable",
                    "metrics": {
                        "running": juce_running,
                        "available": juce_available,
                    },
                },
            },
        },
    }


def test_chain_readiness_raises_structured_503_when_database_is_starting(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(database_state="starting", database_healthy=False)
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        api_readiness.ensure_chain_route_ready("/api/chains/")

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["reason"] == "chain_store_warming"
    assert "Database service state is starting" in excinfo.value.detail["issues"]


def test_plugin_readiness_raises_structured_503_when_loader_is_warming(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(plugin_scan_state="warming")
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        api_readiness.ensure_plugin_route_ready("/api/plugins/discover")

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["reason"] == "plugin_inventory_warming"
    assert "Plugin loader scan state is warming" in excinfo.value.detail["issues"]


def test_audio_readiness_raises_structured_503_when_juce_engine_not_running(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(juce_running=False, juce_healthy=False)
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        api_readiness.ensure_audio_route_ready("/api/audio/status")

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["reason"] == "audio_engine_warming"
    assert "JUCE engine reports not running" in excinfo.value.detail["issues"]


def test_audio_status_route_uses_readiness_guard(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(juce_state="starting", juce_running=False)
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(audio_routes.get_audio_status_route())

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["route"] == "/api/audio/status"


def test_chain_activate_route_uses_readiness_guard(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(running=False, database_state="starting", database_healthy=False)
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(chains_routes.activate_chain(7))

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["route"] == "/api/chains/{id}/activate"


def test_plugin_load_route_uses_readiness_guard(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(
            _orchestrator_status(plugin_loader_state="starting", plugin_scan_state="starting")
        ),
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(plugins_routes.load_plugin("map2://juce/dynamics/compressor"))

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["route"] == "/api/plugins/load"


def test_chain_get_route_returns_structured_503_when_lookup_times_out_without_cache(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(_orchestrator_status()),
    )

    class _TimeoutSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def rollback(self):
            return None

    async def _timeout_get_chain(_chain_id):
        raise asyncio.TimeoutError

    class _FakeChainService:
        def __init__(self, _session):
            pass

        get_chain = _timeout_get_chain

    monkeypatch.setattr("app.database.get_session", lambda read_only=True: _TimeoutSession())
    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr(chains_routes, "_get_cached_chain_details", lambda chain_id: None)
    monkeypatch.setattr(chains_routes, "_get_stale_chain_details", lambda chain_id: None)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(chains_routes.get_chain(7))

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["reason"] == "chain_lookup_temporarily_unavailable"
    assert excinfo.value.detail["route"] == "/api/chains/{id}"


def test_chain_activate_route_returns_structured_503_when_operation_times_out(monkeypatch):
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(_orchestrator_status()),
    )

    class _TimeoutSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def rollback(self):
            return None

    async def _timeout_activate_chain(_chain_id):
        raise asyncio.TimeoutError

    class _FakeChainService:
        def __init__(self, _session):
            pass

        activate_chain = _timeout_activate_chain

    monkeypatch.setattr("app.database.get_session", lambda: _TimeoutSession())
    monkeypatch.setattr(chains_routes, "ChainService", _FakeChainService)
    monkeypatch.setattr(chains_routes, "_allow_chain_toggle", lambda chain_id: True)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(chains_routes.activate_chain(7))

    assert excinfo.value.status_code == 503
    assert excinfo.value.detail["reason"] == "chain_activation_temporarily_unavailable"
    assert excinfo.value.detail["route"] == "/api/chains/{id}/activate"
