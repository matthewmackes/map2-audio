import asyncio

from app.routes import chains_ab_mode as routes
from app.services import juce_engine_service


class _FakeSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeChainService:
    def __init__(self, _session, chains):
        self._chains = chains

    async def get_chain(self, chain_id: int):
        return self._chains.get(chain_id)


class _FakeMorphEngine:
    is_running = True

    def __init__(self) -> None:
        self.parameter_sets: list[tuple[str, str, float, int | None]] = []

    async def set_parameter(
        self,
        plugin_uri: str,
        symbol: str,
        value: float,
        *,
        plugin_position: int | None = None,
        instance_id: int | None = None,
    ) -> bool:
        del instance_id
        self.parameter_sets.append((plugin_uri, symbol, value, plugin_position))
        return True


def test_compare_chains_preserves_duplicate_plugin_positions(monkeypatch):
    chains = {
        1: {
            "id": 1,
            "name": "Source",
            "plugins": [
                {"uri": "urn:test:duplicate", "position": 0, "name": "Duplicate A", "latency_samples": 3},
                {"uri": "urn:test:duplicate", "position": 1, "name": "Duplicate B", "latency_samples": 5},
            ],
        },
        2: {
            "id": 2,
            "name": "Target",
            "plugins": [
                {"uri": "urn:test:duplicate", "position": 0, "name": "Duplicate A", "latency_samples": 3},
            ],
        },
    }

    monkeypatch.setattr(
        routes,
        "ChainService",
        lambda session: _FakeChainService(session, chains),
    )
    monkeypatch.setattr("app.database.get_session", lambda: _FakeSessionContext())

    payload = asyncio.run(routes.compare_chains(1, 2))

    assert payload["differences"]["common_plugins"] == 1
    assert payload["differences"]["plugin_count_diff"] == 1
    assert payload["differences"]["common_plugin_refs"] == [
        {"uri": "urn:test:duplicate", "plugin_position": 0}
    ]
    assert payload["differences"]["only_in_a"] == [
        {"uri": "urn:test:duplicate", "position": 1, "name": "Duplicate B", "latency_samples": 5}
    ]
    assert payload["differences"]["only_in_b"] == []


def test_morph_chain_parameters_targets_duplicate_plugins_by_position(monkeypatch):
    chains = {
        1: {
            "id": 1,
            "name": "Source",
            "plugins": [
                {
                    "uri": "urn:test:duplicate",
                    "position": 0,
                    "name": "Duplicate A",
                    "parameters": [{"symbol": "gain", "name": "Gain", "value": 0.0}],
                },
                {
                    "uri": "urn:test:duplicate",
                    "position": 1,
                    "name": "Duplicate B",
                    "parameters": [{"symbol": "gain", "name": "Gain", "value": 1.0}],
                },
            ],
        },
        2: {
            "id": 2,
            "name": "Target",
            "plugins": [
                {
                    "uri": "urn:test:duplicate",
                    "position": 0,
                    "name": "Duplicate A",
                    "parameters": [{"symbol": "gain", "name": "Gain", "value": 1.0}],
                },
                {
                    "uri": "urn:test:duplicate",
                    "position": 1,
                    "name": "Duplicate B",
                    "parameters": [{"symbol": "gain", "name": "Gain", "value": 0.0}],
                },
            ],
        },
    }
    fake_engine = _FakeMorphEngine()

    async def _fake_publish(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        routes,
        "ChainService",
        lambda session: _FakeChainService(session, chains),
    )
    monkeypatch.setattr("app.database.get_session", lambda: _FakeSessionContext())
    monkeypatch.setattr(routes.event_publisher, "publish", _fake_publish)
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)

    payload = asyncio.run(routes.morph_chain_parameters(1, 2, progress=0.25))

    assert payload["common_plugins"] == 2
    assert payload["common_plugin_refs"] == [
        {"uri": "urn:test:duplicate", "plugin_position": 0},
        {"uri": "urn:test:duplicate", "plugin_position": 1},
    ]
    assert payload["applied_to_engine"] is True
    assert payload["morphed_plugins"] == [
        {
            "uri": "urn:test:duplicate",
            "plugin_position": 0,
            "name": "Duplicate A",
            "parameters": [
                {
                    "symbol": "gain",
                    "name": "Gain",
                    "source_value": 0.0,
                    "target_value": 1.0,
                    "morphed_value": 0.25,
                }
            ],
            "param_count": 1,
        },
        {
            "uri": "urn:test:duplicate",
            "plugin_position": 1,
            "name": "Duplicate B",
            "parameters": [
                {
                    "symbol": "gain",
                    "name": "Gain",
                    "source_value": 1.0,
                    "target_value": 0.0,
                    "morphed_value": 0.75,
                }
            ],
            "param_count": 1,
        },
    ]
    assert fake_engine.parameter_sets == [
        ("urn:test:duplicate", "gain", 0.25, 0),
        ("urn:test:duplicate", "gain", 0.75, 1),
    ]
