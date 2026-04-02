import asyncio
from contextlib import suppress

import pytest

from app.routes import plugins as plugins_routes
from app.services import juce_engine_service


class _FakeEngine:
    def __init__(self) -> None:
        self.is_available = True
        self.is_running = True
        self._uri_to_instance: dict[str, int] = {}
        self._uri_position_to_instance: dict[tuple[str, int], int] = {}
        self.loaded_uris: list[str] = []
        self.unloaded_ids: list[int] = []
        self.parameter_batches: list[list[tuple[int, str, float]]] = []
        self.parameter_sets: list[tuple[str, str, float, int | None, int | None]] = []
        self._next_instance = 100

    async def load_plugin(self, uri: str) -> int:
        self.loaded_uris.append(uri)
        self._next_instance += 1
        self._uri_to_instance[uri] = self._next_instance
        return self._next_instance

    async def unload_plugin(self, instance_id: int) -> bool:
        self.unloaded_ids.append(instance_id)
        to_remove = None
        for uri, current in self._uri_to_instance.items():
            if current == instance_id:
                to_remove = uri
                break
        if to_remove:
            self._uri_to_instance.pop(to_remove, None)
        return True

    async def set_parameter_batch_direct(self, updates: list[tuple[int, str, float]]) -> int:
        self.parameter_batches.append(list(updates))
        return len(updates)

    async def set_parameter(
        self,
        uri: str,
        symbol: str,
        value: float,
        *,
        instance_id: int | None = None,
        plugin_position: int | None = None,
    ) -> bool:
        self.parameter_sets.append((uri, symbol, value, instance_id, plugin_position))
        return True

    def _get_instance_id_for_uri(self, uri: str, plugin_position: int | None = None):
        if isinstance(plugin_position, int):
            positioned = self._uri_position_to_instance.get((uri, plugin_position))
            if isinstance(positioned, int):
                return positioned
        return self._uri_to_instance.get(uri)


def _bucket(store, uri: str):
    bucket = store.get(uri, [])
    if isinstance(bucket, dict):
        return [bucket]
    return list(bucket)


async def _await_worker() -> None:
    worker = getattr(plugins_routes, "_engine_op_worker_task", None)
    if worker is not None:
        with suppress(asyncio.CancelledError):
            await worker


@pytest.fixture(autouse=True)
async def _reset_plugin_routes_state(monkeypatch):
    # Isolate module globals used by route-level worker tests.
    async def _noop_refresh(_updates):
        return None

    monkeypatch.setattr(plugins_routes, "ensure_plugin_route_ready", lambda _route: None)
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])
    monkeypatch.setattr(plugins_routes, "_loaded_plugins", {})
    monkeypatch.setattr(plugins_routes, "_engine_op_queue", None)
    monkeypatch.setattr(plugins_routes, "_engine_op_worker_task", None)
    monkeypatch.setattr(plugins_routes, "_refresh_live_snapshot_controller_display", _noop_refresh)
    monkeypatch.setattr(
        plugins_routes,
        "_engine_op_stats",
        {
            "enqueued": 0,
            "processed": 0,
            "failed": 0,
            "retries": 0,
            "dropped": 0,
            "last_error": None,
        },
    )
    monkeypatch.setattr(plugins_routes, "_ENABLE_ENGINE_PLUGIN_OPS", True)
    monkeypatch.setattr(plugins_routes, "_ENABLE_SYNC_ENGINE_PLUGIN_OPS", False)
    monkeypatch.setattr(plugins_routes, "_ENGINE_OP_MAX_RETRIES", 0)
    monkeypatch.setattr(plugins_routes, "_ENGINE_OP_QUEUE_MAX", 128)

    yield

    worker = getattr(plugins_routes, "_engine_op_worker_task", None)
    if worker is not None and not worker.done():
        worker.cancel()
    await _await_worker()


def _plugin_definition(uri: str) -> dict:
    return {
        "uri": uri,
        "name": "Unit Test Plugin",
        "author": "MAP2",
        "category": "Utility",
        "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
    }


@pytest.mark.asyncio
async def test_deferred_load_runs_via_engine_worker(monkeypatch):
    uri = "urn:test:plugin:load"
    fake_engine = _FakeEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])

    payload = await plugins_routes.load_plugin(uri=uri)
    assert payload["engine_loaded"] is False
    assert payload["engine_deferred"] is True

    await _await_worker()

    assert fake_engine.loaded_uris == [uri]
    loaded = _bucket(plugins_routes._loaded_plugins, uri)[-1]
    assert loaded["instance_id"] > 0
    assert loaded["engine_loaded"] is True
    assert loaded["engine_deferred"] is False


@pytest.mark.asyncio
async def test_deferred_duplicate_loads_preserve_multiple_instances(monkeypatch):
    uri = "urn:test:plugin:duplicate-load"
    fake_engine = _FakeEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])

    first = await plugins_routes.load_plugin(uri=uri)
    second = await plugins_routes.load_plugin(uri=uri)
    assert first["engine_deferred"] is True
    assert second["engine_deferred"] is True

    await _await_worker()

    bucket = _bucket(plugins_routes._loaded_plugins, uri)
    assert len(bucket) == 2
    assert len({entry["instance_id"] for entry in bucket}) == 2
    assert all(entry["engine_loaded"] is True for entry in bucket)


@pytest.mark.asyncio
async def test_deferred_unload_runs_via_engine_worker(monkeypatch):
    uri = "urn:test:plugin:unload"
    fake_engine = _FakeEngine()
    fake_engine._uri_to_instance[uri] = 321

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [{
                "uri": uri,
                "name": "Unit Test Plugin",
                "category": "Utility",
                "instance_id": 321,
                "engine_loaded": True,
                "engine_deferred": False,
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }]
        },
    )

    payload = await plugins_routes.unload_plugin(uri=uri)
    assert payload["engine_unloaded"] is False
    assert payload["engine_deferred"] is True

    await _await_worker()

    assert fake_engine.unloaded_ids == [321]
    assert uri not in plugins_routes._loaded_plugins


@pytest.mark.asyncio
async def test_batch_parameters_deferred_queue_applies_updates(monkeypatch):
    uri = "urn:test:plugin:batch-deferred"
    fake_engine = _FakeEngine()
    fake_engine._uri_to_instance[uri] = 654

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [{
                "uri": uri,
                "name": "Unit Test Plugin",
                "category": "Utility",
                "instance_id": 654,
                "engine_loaded": True,
                "engine_deferred": False,
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }]
        },
    )

    payload = await plugins_routes.batch_set_parameters(
        {"updates": [{"plugin_uri": uri, "param_index": 0, "value": 0.42}]}
    )
    assert payload["engine_deferred"] is True
    assert payload["engine_applied"] == 0

    await _await_worker()

    assert fake_engine.parameter_batches == [[(654, "gain", 0.42)]]


@pytest.mark.asyncio
async def test_batch_parameters_sync_mode_applies_inline(monkeypatch):
    uri = "urn:test:plugin:batch-sync"
    fake_engine = _FakeEngine()
    fake_engine._uri_to_instance[uri] = 777
    refresh_calls = []

    async def _fake_refresh(updates):
        refresh_calls.append(list(updates))
        return {"updated": True}

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(plugins_routes, "_ENABLE_SYNC_ENGINE_PLUGIN_OPS", True)
    monkeypatch.setattr(plugins_routes, "_refresh_live_snapshot_controller_display", _fake_refresh)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [{
                "uri": uri,
                "name": "Unit Test Plugin",
                "category": "Utility",
                "instance_id": 777,
                "engine_loaded": True,
                "engine_deferred": False,
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }]
        },
    )

    payload = await plugins_routes.batch_set_parameters(
        {"updates": [{"plugin_uri": uri, "param_index": 0, "value": 0.9}]}
    )
    assert payload["engine_deferred"] is False
    assert payload["engine_applied"] == 1
    assert fake_engine.parameter_batches == [[(777, "gain", 0.9)]]
    assert refresh_calls == [[
        {
            "plugin_uri": uri,
            "parameter_symbol": "gain",
            "value": 0.9,
            "plugin_position": None,
        }
    ]]


@pytest.mark.asyncio
async def test_batch_parameters_keeps_duplicate_uri_instances_separate(monkeypatch):
    uri = "urn:test:plugin:duplicate-uri"
    fake_engine = _FakeEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(plugins_routes, "_ENABLE_SYNC_ENGINE_PLUGIN_OPS", True)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [{
                "uri": uri,
                "name": "Duplicate Plugin",
                "category": "Utility",
                "instance_id": 1001,
                "engine_loaded": True,
                "engine_deferred": False,
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }]
        },
    )

    payload = await plugins_routes.batch_set_parameters(
        {
            "updates": [
                {"plugin_uri": uri, "param_index": 0, "value": 0.11, "instance_id": 1001, "plugin_position": 0},
                {"plugin_uri": uri, "param_index": 0, "value": 0.82, "instance_id": 1002, "plugin_position": 1},
            ]
        }
    )

    assert payload["deduplicated"] == 2
    assert payload["applied"] == 2
    assert payload["engine_applied"] == 2
    assert fake_engine.parameter_batches == [[(1001, "gain", 0.11), (1002, "gain", 0.82)]]


@pytest.mark.asyncio
async def test_single_parameter_write_supports_discovered_plugin_with_position(monkeypatch):
    uri = "urn:test:plugin:discovered-only"
    fake_engine = _FakeEngine()
    refresh_calls = []

    async def _fake_refresh(updates):
        refresh_calls.append(list(updates))
        return {"updated": True}

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(plugins_routes, "_loaded_plugins", {})
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])
    monkeypatch.setattr(plugins_routes, "_refresh_live_snapshot_controller_display", _fake_refresh)

    payload = await plugins_routes.set_parameter(
        uri=uri,
        param_index=0,
        value=0.67,
        plugin_position=3,
    )

    assert payload["engine_set"] is True
    assert payload["plugin_position"] == 3
    assert fake_engine.parameter_sets == [(uri, "gain", 0.67, None, 3)]
    assert refresh_calls == [[
        {
            "plugin_uri": uri,
            "parameter_symbol": "gain",
            "value": 0.67,
            "plugin_position": 3,
        }
    ]]
