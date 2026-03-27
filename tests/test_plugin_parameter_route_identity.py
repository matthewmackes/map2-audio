import pytest
from fastapi import HTTPException

from app.routes import plugins as plugins_routes
from app.services import juce_engine_service


class _FakeParameterEngine:
    is_available = True
    is_running = True

    def __init__(self) -> None:
        self.resolution_calls: list[tuple[str, int | None, int | None]] = []
        self.parameter_reads: list[tuple[str, str, int | None, int | None]] = []
        self._position_to_instance = {0: 101, 1: 202}
        self._instance_values = {101: 0.15, 202: 0.85}

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ) -> int | None:
        self.resolution_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        if isinstance(plugin_position, int):
            return self._position_to_instance.get(plugin_position)
        if isinstance(fallback_instance_id, int) and fallback_instance_id in self._instance_values:
            return fallback_instance_id
        return None

    async def get_parameter(
        self,
        plugin_uri: str,
        symbol: str,
        *,
        instance_id: int | None = None,
        plugin_position: int | None = None,
    ) -> float:
        self.parameter_reads.append((plugin_uri, symbol, instance_id, plugin_position))
        return self._instance_values.get(instance_id or -1, 0.0)


@pytest.fixture(autouse=True)
def _reset_plugin_routes_state(monkeypatch):
    monkeypatch.setattr(plugins_routes, "_loaded_plugins", {})
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [])


def _plugin_definition(uri: str) -> dict:
    return {
        "uri": uri,
        "name": "Duplicate Plugin",
        "author": "MAP2",
        "category": "Utility",
        "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
    }


@pytest.mark.asyncio
async def test_get_parameters_reads_duplicate_instance_by_position(monkeypatch):
    uri = "urn:test:duplicate-route"
    fake_engine = _FakeParameterEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [
                {"uri": uri, "instance_id": 101, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
                {"uri": uri, "instance_id": 202, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
            ]
        },
    )
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])

    payload = await plugins_routes.get_parameters(uri=uri, plugin_position=1)

    assert payload["parameters"] == [
        {"index": 0, "name": "Gain", "symbol": "gain", "value": 0.85}
    ]
    assert fake_engine.resolution_calls == [(uri, 1, None)]
    assert fake_engine.parameter_reads == [(uri, "gain", 202, 1)]


@pytest.mark.asyncio
async def test_get_parameters_recovers_stale_instance_id_via_plugin_position(monkeypatch):
    uri = "urn:test:duplicate-route"
    fake_engine = _FakeParameterEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [
                {"uri": uri, "instance_id": 101, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
                {"uri": uri, "instance_id": 202, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
            ]
        },
    )
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])

    payload = await plugins_routes.get_parameters(uri=uri, instance_id=999, plugin_position=1)

    assert payload["parameters"][0]["value"] == 0.85
    assert fake_engine.resolution_calls == [(uri, 1, 999)]
    assert fake_engine.parameter_reads == [(uri, "gain", 202, 1)]


@pytest.mark.asyncio
async def test_get_parameters_rejects_unknown_scoped_position(monkeypatch):
    uri = "urn:test:duplicate-route"
    fake_engine = _FakeParameterEngine()

    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_loaded_plugins",
        {
            uri: [
                {"uri": uri, "instance_id": 101, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
                {"uri": uri, "instance_id": 202, "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}]},
            ]
        },
    )
    monkeypatch.setattr(plugins_routes, "_discovered_plugins", [_plugin_definition(uri)])

    with pytest.raises(HTTPException) as excinfo:
        await plugins_routes.get_parameters(uri=uri, plugin_position=9)

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "Plugin instance not found at position: 9"
    assert fake_engine.resolution_calls == [(uri, 9, None)]
    assert fake_engine.parameter_reads == []
