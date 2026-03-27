import math

import pytest
from fastapi import HTTPException

from app.routes import dynamics as dynamics_routes
from app.routes.scoped_plugin_utils import actual_to_normalized


COMPRESSOR_URI = "map2://juce/dynamics/compressor"
LIMITER_URI = "map2://juce/dynamics/limiter"
GATE_URI = "map2://juce/dynamics/gate"


def _build_normalized_state(plugin_uri: str, actual_values: dict[str, float | bool]) -> dict[str, float]:
    return {
        symbol: actual_to_normalized(plugin_uri, symbol, value)
        for symbol, value in actual_values.items()
    }


class _FakeScopedDynamicsEngine:
    def __init__(self) -> None:
        self.resolution_calls: list[tuple[str, int | None, int | None]] = []
        self.parameter_reads: list[tuple[str, str, int | None, int | None]] = []
        self.parameter_writes: list[tuple[str, str, float, int | None, int | None]] = []
        self._position_to_instance = {
            (COMPRESSOR_URI, 0): 101,
            (COMPRESSOR_URI, 1): 202,
            (GATE_URI, 1): 404,
        }
        self._instance_values = {
            101: _build_normalized_state(
                COMPRESSOR_URI,
                {
                    "threshold": -24.0,
                    "ratio": 6.0,
                    "attack": 10.0,
                    "release": 220.0,
                    "knee": 4.0,
                    "makeup_gain": 1.5,
                    "auto_makeup": False,
                    "bypass": False,
                },
            ),
            202: _build_normalized_state(
                COMPRESSOR_URI,
                {
                    "threshold": -11.0,
                    "ratio": 3.5,
                    "attack": 7.0,
                    "release": 180.0,
                    "knee": 9.0,
                    "makeup_gain": 2.5,
                    "auto_makeup": True,
                    "bypass": False,
                },
            ),
            404: _build_normalized_state(
                GATE_URI,
                {
                    "threshold": -48.0,
                    "ratio": 7.0,
                    "attack": 4.0,
                    "release": 150.0,
                    "bypass": False,
                },
            ),
        }

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ) -> int | None:
        self.resolution_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        if isinstance(plugin_position, int):
            return self._position_to_instance.get((plugin_uri, plugin_position))
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
        return self._instance_values.get(instance_id or -1, {}).get(symbol, 0.0)

    async def set_parameter(
        self,
        plugin_uri: str,
        symbol: str,
        value: float,
        *,
        instance_id: int | None = None,
        plugin_position: int | None = None,
    ) -> bool:
        self.parameter_writes.append((plugin_uri, symbol, value, instance_id, plugin_position))
        if instance_id is None or instance_id not in self._instance_values:
            return False
        self._instance_values[instance_id][symbol] = value
        return True

    async def get_plugin_vu_levels(self) -> list[dict[str, float | int | str]]:
        return [
            {
                "uri": COMPRESSOR_URI,
                "instance_id": 101,
                "plugin_position": 0,
                "input_left": 0.2,
                "input_right": 0.25,
                "output_left": 0.4,
                "output_right": 0.5,
                "gain_reduction": 2.0,
            },
            {
                "uri": COMPRESSOR_URI,
                "instance_id": 202,
                "plugin_position": 1,
                "input_left": 0.5,
                "input_right": 0.6,
                "output_left": 0.4,
                "output_right": 0.5,
                "gain_reduction": 4.5,
            },
            {
                "uri": GATE_URI,
                "instance_id": 404,
                "plugin_position": 1,
                "input_left": 0.3,
                "input_right": 0.1,
                "output_left": 0.25,
                "output_right": 0.08,
                "gain_reduction": 12.0,
            },
        ]


@pytest.mark.asyncio
async def test_get_compressor_reads_duplicate_instance_by_position(monkeypatch):
    fake_engine = _FakeScopedDynamicsEngine()
    monkeypatch.setattr(dynamics_routes, "get_audio_engine", lambda: fake_engine)

    payload = await dynamics_routes.get_compressor(instance_id=None, plugin_position=1)

    assert payload["parameters"] == {
        "threshold": -11.0,
        "ratio": 3.5,
        "attack": pytest.approx(7.0, rel=1e-6),
        "release": pytest.approx(180.0, rel=1e-6),
        "knee": 9.0,
        "makeup_gain": 2.5,
        "auto_makeup": True,
        "bypass": False,
    }
    assert payload["metering"] == {
        "input_level": pytest.approx(20.0 * math.log10(0.6), rel=1e-6),
        "output_level": pytest.approx(20.0 * math.log10(0.5), rel=1e-6),
        "gain_reduction": 4.5,
        "input_rms": pytest.approx(20.0 * math.log10(0.6), rel=1e-6),
        "output_rms": pytest.approx(20.0 * math.log10(0.5), rel=1e-6),
    }
    assert fake_engine.resolution_calls == [(COMPRESSOR_URI, 1, None)]
    assert all(read[2] == 202 for read in fake_engine.parameter_reads)


@pytest.mark.asyncio
async def test_update_gate_recovers_stale_instance_id_via_plugin_position(monkeypatch):
    fake_engine = _FakeScopedDynamicsEngine()
    monkeypatch.setattr(dynamics_routes, "get_audio_engine", lambda: fake_engine)

    payload = await dynamics_routes.update_gate(
        dynamics_routes.GateParams(threshold=-60.0, attack=12.0, bypass=True),
        instance_id=999,
        plugin_position=1,
    )

    assert payload["parameters"] == {
        "threshold": -60.0,
        "ratio": 7.0,
        "attack": pytest.approx(12.0, rel=1e-6),
        "release": pytest.approx(150.0, rel=1e-6),
        "bypass": True,
    }
    assert fake_engine.resolution_calls == [(GATE_URI, 1, 999)]
    assert fake_engine.parameter_writes == [
        (GATE_URI, "threshold", actual_to_normalized(GATE_URI, "threshold", -60.0), 404, 1),
        (GATE_URI, "attack", actual_to_normalized(GATE_URI, "attack", 12.0), 404, 1),
        (GATE_URI, "bypass", actual_to_normalized(GATE_URI, "bypass", True), 404, 1),
    ]


@pytest.mark.asyncio
async def test_get_limiter_parameters_rejects_unknown_scoped_position(monkeypatch):
    fake_engine = _FakeScopedDynamicsEngine()
    monkeypatch.setattr(dynamics_routes, "get_audio_engine", lambda: fake_engine)

    with pytest.raises(HTTPException) as excinfo:
        await dynamics_routes.get_limiter_parameters(instance_id=None, plugin_position=9)

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "Limiter instance not found at position: 9"
    assert fake_engine.resolution_calls == [(LIMITER_URI, 9, None)]
