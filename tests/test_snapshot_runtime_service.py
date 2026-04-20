import asyncio

from app.routes import plugins as plugins_route
from app.services import juce_engine_service as juce_engine_service_module
from app.services import snapshot_runtime_service


class _FakeFixedNativeRuntimeEngine:
    is_available = True
    is_running = True

    def __init__(self):
        self.calls: list[tuple[str, str, float, int | None]] = []

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None):
        return None

    async def set_parameter(
        self,
        plugin_uri: str,
        param_name: str,
        value: float,
        *,
        plugin_position: int | None = None,
    ) -> bool:
        self.calls.append((plugin_uri, param_name, value, plugin_position))
        return True


class _FailingQuadMorphEngine(_FakeFixedNativeRuntimeEngine):
    async def clear_morph_endpoints(self) -> bool:
        raise RuntimeError("quad morph unavailable")

    async def set_morph_endpoint(self, corner_id: str, graph_document: dict[str, object]) -> bool:
        return True

    async def set_morph_position_2d(self, x: float, y: float) -> bool:
        return True


def test_apply_snapshot_to_engine_routes_fixed_native_bypass_without_instance(monkeypatch):
    engine = _FakeFixedNativeRuntimeEngine()
    monkeypatch.setattr(juce_engine_service_module, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        plugins_route,
        "_discovered_plugins",
        [
            {
                "uri": "map2://juce/delay",
                "parameters": [
                    {"symbol": "mix"},
                ],
            }
        ],
    )

    params_applied, bypass_applied = asyncio.run(
        snapshot_runtime_service.apply_snapshot_to_engine(
            {
                "chains": {
                    "chain-a": {
                        "plugins": [
                            {
                                "uri": "map2://juce/delay",
                                "position": 2,
                                "bypass": True,
                                "parameters": {"0": 0.25},
                            }
                        ]
                    }
                }
            }
        )
    )

    assert (params_applied, bypass_applied) == (1, 1)
    assert engine.calls == [
        ("map2://juce/delay", "bypass", 1.0, 2),
        ("map2://juce/delay", "mix", 0.25, 2),
    ]


def test_quad_morph_failure_counts_scalar_interpolation_fallback(monkeypatch):
    engine = _FailingQuadMorphEngine()
    snapshot_runtime_service.reset_quad_morph_scalar_fallback_count_for_tests()
    monkeypatch.setattr(juce_engine_service_module, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        plugins_route,
        "_discovered_plugins",
        [
            {
                "uri": "map2://juce/delay",
                "parameters": [
                    {"symbol": "mix"},
                ],
            }
        ],
    )

    result = asyncio.run(
        snapshot_runtime_service.apply_snapshot_morph_to_engine(
            {
                "id": 17,
                "routing": {
                    "mode": "morph",
                    "morph_position": 0.25,
                    "morph_source_channel_key": "channel-a",
                    "morph_target_channel_key": "channel-b",
                },
                "channels": [
                    {"channel_key": "channel-a", "chain_id": 1},
                    {"channel_key": "channel-b", "chain_id": 2},
                ],
                "chains": [
                    {
                        "id": 1,
                        "plugins": [
                            {
                                "uri": "map2://juce/delay",
                                "position": 2,
                                "parameters": {"0": 0.0},
                            }
                        ],
                    },
                    {
                        "id": 2,
                        "plugins": [
                            {
                                "uri": "map2://juce/delay",
                                "position": 2,
                                "parameters": {"0": 1.0},
                            }
                        ],
                    },
                ],
            }
        )
    )

    assert result["applied"] is True
    assert result["engine_mode"] == "scalar_interpolation"
    assert result["applied_count"] == 1
    assert engine.calls == [("map2://juce/delay", "mix", 0.25, 2)]
    assert snapshot_runtime_service.get_quad_morph_scalar_fallback_count() == 1
