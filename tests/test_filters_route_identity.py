import pytest
from fastapi import HTTPException

from app.routes import filters as filters_routes


EQ_URI = "map2://juce/eq/parametric"


def _build_eq_state(
    *,
    first_band_frequency: float,
    first_band_type: float,
    output_gain: float,
    bypass: float,
) -> dict[str, float]:
    values: dict[str, float] = {
        "outputGain": output_gain,
        "bypass": bypass,
    }
    default_frequencies = [80.0, 160.0, 320.0, 640.0, 1280.0, 2560.0, 5120.0, 10240.0]
    for index, default_frequency in enumerate(default_frequencies, start=1):
        values[f"band{index}_freq"] = default_frequency
        values[f"band{index}_gain"] = 0.0
        values[f"band{index}_q"] = 1.0
        values[f"band{index}_type"] = 4.0
        values[f"band{index}_enabled"] = 1.0

    values["band1_freq"] = first_band_frequency
    values["band1_gain"] = 6.0
    values["band1_q"] = 1.5
    values["band1_type"] = first_band_type
    values["band1_enabled"] = 1.0
    return values


class _FakeScopedEqEngine:
    def __init__(self) -> None:
        self.resolution_calls: list[tuple[str, int | None, int | None]] = []
        self.parameter_reads: list[tuple[str, str, int | None, int | None]] = []
        self.parameter_writes: list[tuple[str, str, float, int | None, int | None]] = []
        self.legacy_frequency_requests: list[list[float]] = []
        self._position_to_instance = {0: 101, 1: 202}
        self._instance_values = {
            101: _build_eq_state(
                first_band_frequency=125.0,
                first_band_type=4.0,
                output_gain=1.0,
                bypass=0.0,
            ),
            202: _build_eq_state(
                first_band_frequency=880.0,
                first_band_type=1.0,
                output_gain=3.0,
                bypass=1.0,
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
        if instance_id is None:
            return 0.0
        return self._instance_values[instance_id].get(symbol, 0.0)

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

    async def get_eq_frequency_response(self, frequencies: list[float]) -> list[float]:
        self.legacy_frequency_requests.append(list(frequencies))
        return [999.0] * len(frequencies)


@pytest.mark.asyncio
async def test_get_eq_parameters_reads_duplicate_instance_by_position(monkeypatch):
    fake_engine = _FakeScopedEqEngine()
    monkeypatch.setattr(filters_routes, "get_audio_engine", lambda: fake_engine)

    payload = await filters_routes.get_eq_parameters(instance_id=None, plugin_position=1)

    assert payload["output_gain"] == 3.0
    assert payload["bypass"] is True
    assert payload["bands"][0] == {
        "type": "highpass",
        "frequency": 880.0,
        "gain": 6.0,
        "q": 1.5,
        "enabled": True,
    }
    assert fake_engine.resolution_calls == [(EQ_URI, 1, None)]
    assert all(read[2] == 202 for read in fake_engine.parameter_reads)


@pytest.mark.asyncio
async def test_update_eq_band_recovers_stale_instance_id_via_plugin_position(monkeypatch):
    fake_engine = _FakeScopedEqEngine()
    monkeypatch.setattr(filters_routes, "get_audio_engine", lambda: fake_engine)

    payload = await filters_routes.update_eq_band(
        0,
        filters_routes.EQBandParams(frequency=777.0, type="notch", enabled=False),
        instance_id=999,
        plugin_position=1,
    )

    assert payload["band"] == {
        "type": "notch",
        "frequency": 777.0,
        "gain": 6.0,
        "q": 1.5,
        "enabled": False,
    }
    assert fake_engine.resolution_calls == [(EQ_URI, 1, 999)]
    assert fake_engine.parameter_writes == [
        (EQ_URI, "band1_freq", 777.0, 202, 1),
        (EQ_URI, "band1_type", 3.0, 202, 1),
        (EQ_URI, "band1_enabled", 0.0, 202, 1),
    ]


@pytest.mark.asyncio
async def test_get_default_frequency_response_uses_scoped_parameters_not_legacy_singleton(monkeypatch):
    fake_engine = _FakeScopedEqEngine()
    monkeypatch.setattr(filters_routes, "get_audio_engine", lambda: fake_engine)

    payload = await filters_routes.get_default_frequency_response(instance_id=None, plugin_position=1)

    assert len(payload["frequencies"]) == 64
    assert len(payload["response"]) == 64
    assert payload["response"][0] != 999.0
    assert fake_engine.legacy_frequency_requests == []
    assert fake_engine.resolution_calls == [(EQ_URI, 1, None)]


@pytest.mark.asyncio
async def test_get_eq_parameters_rejects_unknown_scoped_position(monkeypatch):
    fake_engine = _FakeScopedEqEngine()
    monkeypatch.setattr(filters_routes, "get_audio_engine", lambda: fake_engine)

    with pytest.raises(HTTPException) as excinfo:
        await filters_routes.get_eq_parameters(instance_id=None, plugin_position=9)

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "EQ instance not found at position: 9"
    assert fake_engine.resolution_calls == [(EQ_URI, 9, None)]
