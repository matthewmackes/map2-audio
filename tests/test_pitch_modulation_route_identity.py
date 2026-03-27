import math

import pytest
from fastapi import HTTPException

from app.routes import modulation as modulation_routes
from app.routes import pitch as pitch_routes
from app.routes.scoped_plugin_utils import actual_to_normalized


CHORUS_URI = "map2://juce/modulation/chorus"
INTERVAL_URI = "map2://juce/pitch/interval"
BOSS_XS1_URI = "map2://juce/pitch/boss-xs1"


def _build_normalized_state(plugin_uri: str, actual_values: dict[str, float | bool]) -> dict[str, float]:
    return {
        symbol: actual_to_normalized(plugin_uri, symbol, value)
        for symbol, value in actual_values.items()
    }


class _FakeScopedPitchModulationEngine:
    def __init__(self) -> None:
        self.resolution_calls: list[tuple[str, int | None, int | None]] = []
        self.parameter_reads: list[tuple[str, str, int | None, int | None]] = []
        self.parameter_writes: list[tuple[str, str, float, int | None, int | None]] = []
        self._items = [
            {"uri": CHORUS_URI, "instance_id": 303, "position": 1},
            {"uri": INTERVAL_URI, "instance_id": 707, "position": 4},
            {"uri": BOSS_XS1_URI, "instance_id": 808, "position": 2},
        ]
        self._position_to_instance = {
            (CHORUS_URI, 1): 303,
            (INTERVAL_URI, 4): 707,
            (BOSS_XS1_URI, 2): 808,
        }
        self._instance_values = {
            303: _build_normalized_state(
                CHORUS_URI,
                {
                    "rate": 2.4,
                    "depth": 80.0,
                    "centre_delay": 11.0,
                    "feedback": 25.0,
                    "mix": 60.0,
                    "spread": 90.0,
                    "bypass": False,
                },
            ),
            707: _build_normalized_state(
                INTERVAL_URI,
                {
                    "semitones_l": 3.0,
                    "semitones_r": -4.0,
                    "mix": 45.0,
                    "bypass": False,
                },
            ),
            808: _build_normalized_state(
                BOSS_XS1_URI,
                {
                    "shift_amount": -2.0,
                    "balance": 65.0,
                    "detune_mode": False,
                    "detune_amount": 12.0,
                    "glide": 18.0,
                    "feedback": 0.2,
                    "pedal_enabled": True,
                    "pedal_position": 30.0,
                    "pedal_min": -7.0,
                    "pedal_max": 7.0,
                    "preset": 4,
                    "bypass": False,
                },
            ),
        }

    async def get_current_pedalboard(self) -> dict[str, list[dict[str, int | str]]]:
        return {"items": list(self._items)}

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ) -> int | None:
        self.resolution_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        if isinstance(plugin_position, int):
            return self._position_to_instance.get((plugin_uri, plugin_position))
        if isinstance(fallback_instance_id, int):
            for item in self._items:
                if item.get("instance_id") == fallback_instance_id and item.get("uri") == plugin_uri:
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
                "uri": CHORUS_URI,
                "instance_id": 303,
                "plugin_position": 1,
                "input_left": 0.45,
                "input_right": 0.5,
                "output_left": 0.55,
                "output_right": 0.6,
                "lfo_phase": 0.35,
            },
            {
                "uri": INTERVAL_URI,
                "instance_id": 707,
                "plugin_position": 4,
                "input_left": 0.3,
                "input_right": 0.25,
                "output_left": 0.2,
                "output_right": 0.18,
            },
            {
                "uri": BOSS_XS1_URI,
                "instance_id": 808,
                "plugin_position": 2,
                "input_left": 0.35,
                "input_right": 0.3,
                "output_left": 0.4,
                "output_right": 0.38,
            },
        ]


@pytest.mark.asyncio
async def test_get_chorus_reads_duplicate_instance_by_position(monkeypatch):
    fake_engine = _FakeScopedPitchModulationEngine()
    monkeypatch.setattr(modulation_routes, "get_audio_engine", lambda: fake_engine)

    payload = await modulation_routes.get_chorus(instance_id=None, plugin_position=1)

    assert payload["parameters"] == {
        "rate": pytest.approx(2.4, rel=1e-6),
        "depth": 80.0,
        "centre_delay": 11.0,
        "feedback": 25.0,
        "mix": 60.0,
        "spread": 90.0,
        "bypass": False,
    }
    assert payload["metering"] == {
        "input_level": pytest.approx(20.0 * math.log10(0.5), rel=1e-6),
        "output_level": pytest.approx(20.0 * math.log10(0.6), rel=1e-6),
        "lfo_phase": 0.35,
    }
    assert fake_engine.resolution_calls == [(CHORUS_URI, 1, None)]
    assert all(read[2] == 303 for read in fake_engine.parameter_reads)


@pytest.mark.asyncio
async def test_update_pitch_shifter_parameters_translates_interval_variant_by_position(monkeypatch):
    fake_engine = _FakeScopedPitchModulationEngine()
    monkeypatch.setattr(modulation_routes, "get_audio_engine", lambda: fake_engine)

    payload = await modulation_routes.update_pitch_shifter_parameters(
        modulation_routes.PitchShifterParams(pitch_l=500.0, pitch_r=-700.0, mix=60.0, bypass=True),
        instance_id=999,
        plugin_position=4,
        plugin_uri=None,
    )

    assert payload["parameters"] == {
        "pitch_l": 500.0,
        "pitch_r": -700.0,
        "delay_l": 0.0,
        "delay_r": 0.0,
        "feedback": 0.0,
        "mix": 60.0,
        "spread": 100.0,
        "preset": 0,
        "bypass": True,
    }
    assert fake_engine.resolution_calls == [(INTERVAL_URI, 4, 999)]
    assert fake_engine.parameter_writes == [
        (INTERVAL_URI, "semitones_l", actual_to_normalized(INTERVAL_URI, "semitones_l", 5.0), 707, 4),
        (INTERVAL_URI, "semitones_r", actual_to_normalized(INTERVAL_URI, "semitones_r", -7.0), 707, 4),
        (INTERVAL_URI, "mix", actual_to_normalized(INTERVAL_URI, "mix", 60.0), 707, 4),
        (INTERVAL_URI, "bypass", actual_to_normalized(INTERVAL_URI, "bypass", True), 707, 4),
    ]


@pytest.mark.asyncio
async def test_update_boss_xs1_recovers_stale_instance_id_via_plugin_position(monkeypatch):
    fake_engine = _FakeScopedPitchModulationEngine()
    monkeypatch.setattr(pitch_routes, "get_audio_engine", lambda: fake_engine)

    payload = await pitch_routes.update_boss_xs1_parameters(
        pitch_routes.BossXS1Params(feedback=0.35, pedal_min=-12.0, pedal_max=12.0),
        instance_id=999,
        plugin_position=2,
    )

    assert payload["parameters"]["feedback"] == pytest.approx(0.35, rel=1e-6)
    assert payload["parameters"]["pedal_min"] == -12.0
    assert payload["parameters"]["pedal_max"] == 12.0
    assert fake_engine.resolution_calls == [(BOSS_XS1_URI, 2, 999)]
    assert fake_engine.parameter_writes == [
        (BOSS_XS1_URI, "feedback", actual_to_normalized(BOSS_XS1_URI, "feedback", 0.35), 808, 2),
        (BOSS_XS1_URI, "pedal_min", actual_to_normalized(BOSS_XS1_URI, "pedal_min", -12.0), 808, 2),
        (BOSS_XS1_URI, "pedal_max", actual_to_normalized(BOSS_XS1_URI, "pedal_max", 12.0), 808, 2),
    ]


@pytest.mark.asyncio
async def test_get_boss_xs1_parameters_rejects_unknown_scoped_position(monkeypatch):
    fake_engine = _FakeScopedPitchModulationEngine()
    monkeypatch.setattr(pitch_routes, "get_audio_engine", lambda: fake_engine)

    with pytest.raises(HTTPException) as excinfo:
        await pitch_routes.get_boss_xs1_parameters(instance_id=None, plugin_position=9)

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "Boss XS-1 instance not found at position: 9"
    assert fake_engine.resolution_calls == [(BOSS_XS1_URI, 9, None)]
