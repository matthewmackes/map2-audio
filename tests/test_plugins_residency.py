import asyncio
import contextlib

import pytest
from fastapi import Response

from app.routes import plugins as plugins_routes


class _FakeOrchestrator:
    def get_all_status(self):
        return {
            "orchestrator": {"running": True},
            "services": {
                "database": {
                    "state": "running",
                    "health": {"healthy": True, "message": "Database responding", "metrics": {}},
                },
                "plugin_loader": {
                    "state": "running",
                    "health": {
                        "healthy": True,
                        "message": "ready",
                        "metrics": {"plugin_count": 1, "scan_state": "ready"},
                    },
                },
            },
        }


@pytest.fixture(autouse=True)
async def _reset_plugin_residency_state(monkeypatch):
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_loaded_plugins", {})
    monkeypatch.setattr(plugins_routes, "_resident_plugins", {})
    monkeypatch.setattr(
        plugins_routes,
        "_residency_stats",
        {"parked": 0, "reused": 0, "destroyed": 0},
    )
    monkeypatch.setattr(plugins_routes, "_ENABLE_ENGINE_PLUGIN_OPS", False)
    monkeypatch.setattr(plugins_routes, "_ENABLE_SYNC_ENGINE_PLUGIN_OPS", False)
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: _FakeOrchestrator(),
    )
    yield

    worker = getattr(plugins_routes, "_engine_op_worker_task", None)
    if worker is not None and not worker.done():
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


def _plugin(uri: str) -> dict:
    return {
        "uri": uri,
        "name": "Unit Test Plugin",
        "category": "Utility",
        "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
    }


def _bucket(store, uri: str):
    bucket = store.get(uri, [])
    if isinstance(bucket, dict):
        return [bucket]
    return list(bucket)


@pytest.mark.asyncio
async def test_unload_parks_plugin_when_residency_enabled(monkeypatch):
    uri = "map2://juce/dynamics/compressor"
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin(uri)])
    monkeypatch.setattr(plugins_routes, "_is_effect_residency_enabled", lambda: True)

    await plugins_routes.load_plugin(uri=uri)
    payload = await plugins_routes.unload_plugin(uri=uri, destroy_instance=False)

    assert payload["status"] == "parked"
    assert uri not in plugins_routes._loaded_plugins
    assert len(_bucket(plugins_routes._resident_plugins, uri)) == 1
    assert plugins_routes._residency_stats["parked"] == 1

    reloaded = await plugins_routes.load_plugin(uri=uri)
    assert reloaded["engine_resident_reused"] is True
    assert len(_bucket(plugins_routes._loaded_plugins, uri)) == 1
    assert uri not in plugins_routes._resident_plugins
    assert plugins_routes._residency_stats["reused"] == 1


@pytest.mark.asyncio
async def test_unload_destroy_instance_bypasses_residency(monkeypatch):
    uri = "map2://juce/dynamics/limiter"
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin(uri)])
    monkeypatch.setattr(plugins_routes, "_is_effect_residency_enabled", lambda: True)

    await plugins_routes.load_plugin(uri=uri)
    payload = await plugins_routes.unload_plugin(uri=uri, destroy_instance=True)

    assert payload["status"] == "unloaded"
    assert uri not in plugins_routes._loaded_plugins
    assert uri not in plugins_routes._resident_plugins
    assert plugins_routes._residency_stats["destroyed"] == 1


@pytest.mark.asyncio
async def test_load_plugin_refreshes_discovery_when_in_memory_cache_is_empty(monkeypatch):
    uri = "map2://juce/dynamics/compressor"
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_is_cache_valid", lambda: False)

    async def _fake_discover_plugins(response, refresh=False):
        return {"plugins": [_plugin(uri)], "count": 1, "cached": False}

    monkeypatch.setattr(plugins_routes, "discover_plugins", _fake_discover_plugins)

    payload = await plugins_routes.load_plugin(uri=uri)

    assert payload["status"] == "loaded"
    assert payload["plugin"]["uri"] == uri


@pytest.mark.asyncio
async def test_duplicate_uri_residency_moves_only_one_instance(monkeypatch):
    uri = "map2://juce/dynamics/compressor"
    monkeypatch.setattr(plugins_routes, "_is_effect_residency_enabled", lambda: True)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [
                {**_plugin(uri), "instance_id": 11, "engine_loaded": True, "engine_deferred": False},
                {**_plugin(uri), "instance_id": 22, "engine_loaded": True, "engine_deferred": False},
            ]
        },
    )

    parked = await plugins_routes.unload_plugin(
        uri=uri,
        destroy_instance=False,
        instance_id=22,
    )

    assert parked["status"] == "parked"
    assert len(_bucket(plugins_routes._loaded_plugins, uri)) == 1
    assert len(_bucket(plugins_routes._resident_plugins, uri)) == 1

    remaining_loaded = _bucket(plugins_routes._loaded_plugins, uri)[0]
    resident_entry = _bucket(plugins_routes._resident_plugins, uri)[0]
    assert remaining_loaded.get("instance_id") == 11
    assert resident_entry.get("instance_id") == 22


@pytest.mark.asyncio
async def test_duplicate_uri_destroy_unloads_only_selected_instance(monkeypatch):
    uri = "map2://juce/dynamics/limiter"
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [
                {**_plugin(uri), "instance_id": 31, "engine_loaded": False, "engine_deferred": False},
                {**_plugin(uri), "instance_id": 32, "engine_loaded": False, "engine_deferred": False},
            ]
        },
    )

    payload = await plugins_routes.unload_plugin(uri=uri, destroy_instance=True, instance_id=32)

    assert payload["status"] == "unloaded"
    assert payload["instance_id"] == 32
    assert [entry.get("instance_id") for entry in _bucket(plugins_routes._loaded_plugins, uri)] == [31]


@pytest.mark.asyncio
async def test_list_plugins_flattens_duplicate_uri_buckets(monkeypatch):
    loaded_uri = "map2://juce/nam"
    parked_uri = "map2://juce/convolution/cabinet"
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            loaded_uri: [
                {**_plugin(loaded_uri), "instance_id": 101},
                {**_plugin(loaded_uri), "instance_id": 202},
            ]
        },
    )
    monkeypatch.setattr(
        plugins_routes,
        "_resident_plugins",
        {
            parked_uri: [
                {**_plugin(parked_uri), "instance_id": 303},
            ]
        },
    )

    payload = await plugins_routes.list_plugins(Response())

    assert payload["count"] == 2
    assert payload["parked_count"] == 1
    assert [entry["instance_id"] for entry in payload["loaded"]] == [101, 202]
    assert payload["parked"][0]["instance_id"] == 303
