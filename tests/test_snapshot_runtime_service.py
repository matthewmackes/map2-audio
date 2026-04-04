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
