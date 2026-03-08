import asyncio
import contextlib

import pytest

from app.routes import plugins as plugins_routes


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


@pytest.mark.asyncio
async def test_unload_parks_plugin_when_residency_enabled(monkeypatch):
    uri = "map2://juce/dynamics/compressor"
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin(uri)])
    monkeypatch.setattr(plugins_routes, "_is_effect_residency_enabled", lambda: True)

    await plugins_routes.load_plugin(uri=uri)
    payload = await plugins_routes.unload_plugin(uri=uri, destroy_instance=False)

    assert payload["status"] == "parked"
    assert uri not in plugins_routes._loaded_plugins
    assert uri in plugins_routes._resident_plugins
    assert plugins_routes._residency_stats["parked"] == 1

    reloaded = await plugins_routes.load_plugin(uri=uri)
    assert reloaded["engine_resident_reused"] is True
    assert uri in plugins_routes._loaded_plugins
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
