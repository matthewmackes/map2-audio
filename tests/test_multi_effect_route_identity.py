import math

import pytest
from fastapi import HTTPException

from app.routes import h3000 as h3000_routes
from app.routes import lexi_love as lexi_routes
from app.routes import shoegaze as shoegaze_routes
from app.routes.scoped_plugin_utils import actual_to_normalized


H3000_URI = "map2://juce/pitch/h3000"
LEXI_URI = "map2://juce/reverb/pcm70"
SHOEGAZE_URI = "map2://juce/multieffect/shoegaze"


H3000_ALGORITHMS = [
    {"index": 0, "id": "micropitch", "name": "MicroPitch", "short_name": "MICRO"},
    {"index": 1, "id": "dual_shift", "name": "Dual Shift", "short_name": "DUAL"},
    {"index": 2, "id": "crystal_echoes", "name": "Crystal Echoes", "short_name": "CRYST"},
    {"index": 3, "id": "stereo_shift", "name": "Stereo Shift", "short_name": "STERE"},
    {"index": 4, "id": "layered_shift", "name": "Layered Shift", "short_name": "LAYER"},
    {"index": 5, "id": "swept_combs", "name": "Swept Combs", "short_name": "COMB"},
    {"index": 6, "id": "stutter_shift", "name": "Stutter Shift", "short_name": "STUTT"},
    {"index": 7, "id": "reverse_pitch", "name": "Reverse Pitch", "short_name": "REVRS"},
    {"index": 8, "id": "band_delays", "name": "Band Delays", "short_name": "BAND"},
    {"index": 9, "id": "patch_factory", "name": "Patch Factory", "short_name": "PATCH"},
]

LEXI_ALGORITHMS = [
    {"index": 0, "id": "tiled_room", "name": "Tiled Room V2.0", "short_name": "TILED"},
    {"index": 1, "id": "rich_plate", "name": "Rich Plate", "short_name": "PLATE"},
    {"index": 2, "id": "concert_hall", "name": "Concert Hall", "short_name": "HALL"},
    {"index": 3, "id": "small_room", "name": "Small Room", "short_name": "SMALL"},
    {"index": 4, "id": "rich_chamber", "name": "Rich Chamber", "short_name": "CHAMB"},
    {"index": 5, "id": "gymnasium", "name": "Gymnasium", "short_name": "GYM"},
    {"index": 6, "id": "long_hall", "name": "Long Hall", "short_name": "LONG"},
    {"index": 7, "id": "gated_plate", "name": "Gated Plate", "short_name": "GATED"},
    {"index": 8, "id": "infinite", "name": "Infinite", "short_name": "INF"},
]


def _build_normalized_state(plugin_uri: str, actual_values: dict[str, float | bool]) -> dict[str, float]:
    return {
        symbol: actual_to_normalized(plugin_uri, symbol, value)
        for symbol, value in actual_values.items()
    }


class _FakeScopedMultiEffectEngine:
    def __init__(self) -> None:
        self.resolution_calls: list[tuple[str, int | None, int | None]] = []
        self.parameter_reads: list[tuple[str, str, int | None, int | None]] = []
        self.parameter_writes: list[tuple[str, str, float, int | None, int | None]] = []
        self._position_to_instance = {
            (H3000_URI, 0): 901,
            (LEXI_URI, 3): 902,
            (SHOEGAZE_URI, 5): 903,
        }
        self._instance_values = {
            901: _build_normalized_state(
                H3000_URI,
                {
                    "algorithm": 3,
                    "pitch_l": 700.0,
                    "pitch_r": -900.0,
                    "delay_l": 40.0,
                    "delay_r": 55.0,
                    "feedback": 18.0,
                    "cross_feedback": 22.0,
                    "mod_depth": 35.0,
                    "mod_rate": 0.9,
                    "low_cut": 120.0,
                    "high_cut": 9000.0,
                    "mix": 48.0,
                    "level_l": 92.0,
                    "level_r": 88.0,
                    "glide": 14.0,
                    "bypass": False,
                },
            ),
            902: _build_normalized_state(
                LEXI_URI,
                {
                    "algorithm": 1,
                    "pre_delay": 55.0,
                    "decay_time": 3.5,
                    "diffusion": 82.0,
                    "mix": 38.0,
                    "high_cut": 11000.0,
                    "low_cut": 45.0,
                    "low_decay_mult": 1.1,
                    "high_decay_mult": 0.9,
                    "low_crossover": 450.0,
                    "high_crossover": 8000.0,
                    "early_level": 62.0,
                    "early_pattern": 58.0,
                    "mod_depth": 12.0,
                    "mod_rate": 0.7,
                    "spillover": True,
                    "bypass": False,
                },
            ),
            903: _build_normalized_state(
                SHOEGAZE_URI,
                {
                    "atmosphere": 55.0,
                    "decay": 4.5,
                    "shimmer": 20.0,
                    "shimmer_pitch": 12.0,
                    "modulation": 32.0,
                    "mod_rate": 0.7,
                    "drive": 18.0,
                    "delay_time": 210.0,
                    "delay_feedback": 28.0,
                    "delay_mod": 22.0,
                    "low_cut": 90.0,
                    "high_cut": 7500.0,
                    "mix": 52.0,
                    "stereo_width": 150.0,
                    "reverb_diffusion": 85.0,
                    "reverb_damping": 40.0,
                    "shimmer_feedback": 35.0,
                    "chorus_voices": 4,
                    "ducking": 20.0,
                    "spillover": True,
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
            for (uri, _), resolved_instance_id in self._position_to_instance.items():
                if resolved_instance_id == fallback_instance_id and uri == plugin_uri:
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
                "uri": H3000_URI,
                "instance_id": 901,
                "plugin_position": 0,
                "input_left": 0.45,
                "input_right": 0.5,
                "output_left": 0.35,
                "output_right": 0.4,
            },
            {
                "uri": LEXI_URI,
                "instance_id": 902,
                "plugin_position": 3,
                "input_left": 0.3,
                "input_right": 0.32,
                "output_left": 0.28,
                "output_right": 0.25,
            },
            {
                "uri": SHOEGAZE_URI,
                "instance_id": 903,
                "plugin_position": 5,
                "input_left": 0.4,
                "input_right": 0.38,
                "output_left": 0.36,
                "output_right": 0.34,
            },
        ]

    async def get_h3000_algorithms(self) -> list[dict[str, str | int]]:
        return list(H3000_ALGORITHMS)

    async def get_lexilove_algorithms(self) -> list[dict[str, str | int]]:
        return list(LEXI_ALGORITHMS)


@pytest.mark.asyncio
async def test_get_h3000_reads_duplicate_instance_by_position(monkeypatch):
    fake_engine = _FakeScopedMultiEffectEngine()
    monkeypatch.setattr(h3000_routes, "get_audio_engine", lambda: fake_engine)

    payload = await h3000_routes.get_h3000(instance_id=None, plugin_position=0)

    assert payload["parameters"]["algorithm_index"] == 3
    assert payload["parameters"]["algorithm"] == "stereo_shift"
    assert payload["parameters"]["pitch_l"] == 700.0
    assert payload["parameters"]["mix"] == 48.0
    assert payload["metering"]["input_level_l"] == pytest.approx(20.0 * math.log10(0.45), rel=1e-6)
    assert fake_engine.resolution_calls == [(H3000_URI, 0, None)]
    assert all(read[2] == 901 for read in fake_engine.parameter_reads)


@pytest.mark.asyncio
async def test_load_lexilove_algorithm_recovers_stale_instance_id_via_plugin_position(monkeypatch):
    fake_engine = _FakeScopedMultiEffectEngine()
    monkeypatch.setattr(lexi_routes, "get_audio_engine", lambda: fake_engine)

    payload = await lexi_routes.load_lexilove_algorithm(8, instance_id=999, plugin_position=3)

    assert payload["algorithm"] == 8
    assert payload["parameters"]["algorithm_index"] == 8
    assert payload["parameters"]["algorithm"] == "infinite"
    assert fake_engine.resolution_calls == [(LEXI_URI, 3, 999)]
    assert fake_engine.parameter_writes == [
        (LEXI_URI, "algorithm", actual_to_normalized(LEXI_URI, "algorithm", 8), 902, 3),
    ]


@pytest.mark.asyncio
async def test_load_shoegaze_preset_applies_to_scoped_instance_and_detects_preset(monkeypatch):
    fake_engine = _FakeScopedMultiEffectEngine()
    monkeypatch.setattr(shoegaze_routes, "get_audio_engine", lambda: fake_engine)

    payload = await shoegaze_routes.load_shoegaze_preset("loveless", instance_id=None, plugin_position=5)

    assert payload["preset"] == "loveless"
    assert payload["parameters"]["preset"] == "loveless"
    assert payload["parameters"]["atmosphere"] == 75.0
    assert payload["parameters"]["delay_feedback"] == 45.0
    assert payload["parameters"]["stereo_width"] == 180.0
    assert fake_engine.resolution_calls == [(SHOEGAZE_URI, 5, None)]
    assert len(fake_engine.parameter_writes) == len(shoegaze_routes.SHOEGAZE_PRESET_VALUES["loveless"])


@pytest.mark.asyncio
async def test_get_shoegaze_parameters_rejects_unknown_scoped_position(monkeypatch):
    fake_engine = _FakeScopedMultiEffectEngine()
    monkeypatch.setattr(shoegaze_routes, "get_audio_engine", lambda: fake_engine)

    with pytest.raises(HTTPException) as excinfo:
        await shoegaze_routes.get_shoegaze_parameters(instance_id=None, plugin_position=9)

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "ShoeGaze instance not found at position: 9"
    assert fake_engine.resolution_calls == [(SHOEGAZE_URI, 9, None)]
