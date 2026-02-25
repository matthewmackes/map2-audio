import asyncio

import pytest
from fastapi import HTTPException

from app.routes import synthforge as synthforge_routes


class _DummySynthForgeService:
    async def get_synthforge_parts_config(self):
        return [
            {
                "part_index": idx,
                "midi_channel": idx + 1,
                "output_bus": "main",
                "level": 1.0,
                "pan": 0.0,
                "mute": False,
                "solo": False,
            }
            for idx in range(16)
        ]

    async def set_synthforge_part_config(self, _part_index, _config):
        return True

    async def get_synthforge_patches(self, _category=None):
        return [
            {
                "bank": 0,
                "program": 0,
                "name": "Init Multi",
                "category": "factory",
                "author": "MAP2 Audio",
                "description": "Default patch",
            }
        ]

    async def load_synthforge_patch(self, _part_index, _bank, _program):
        return True

    async def save_synthforge_patch(self, _part_index, _bank, _program, _name):
        return True

    async def get_synthforge_voice_metrics(self):
        return {
            "active_voices": 3,
            "peak_voices": 5,
            "voices_per_part": [3] + [0] * 15,
            "cpu_percent": 0.0,
        }

    async def get_synthforge_part_parameters(self, part_index):
        return {"part_index": float(part_index), "osc1.level": 0.5}

    async def set_synthforge_parameter(self, _part_index, _param, _value):
        return True

    async def get_synthforge_metering(self):
        return {
            "voice_metrics": {
                "active_voices": 0,
                "peak_voices": 0,
                "voices_per_part": [0] * 16,
                "cpu_percent": 0.0,
            },
            "part_levels": [1.0] * 16,
        }


def test_get_parts_returns_16_entries(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    payload = asyncio.run(synthforge_routes.get_parts())
    assert len(payload) == 16
    assert payload[0]["midi_channel"] == 1
    assert payload[15]["midi_channel"] == 16


def test_update_part_rejects_mismatched_part_index(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    config = synthforge_routes.PartConfig(
        part_index=0,
        midi_channel=1,
        output_bus="main",
        level=1.0,
        pan=0.0,
        mute=False,
        solo=False,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.update_part_config(1, config))

    assert exc.value.status_code == 400
    assert "must match" in str(exc.value.detail)


def test_list_patches_returns_patch_models(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    patches = asyncio.run(synthforge_routes.list_patches())
    assert len(patches) == 1
    assert patches[0].name == "Init Multi"
    assert patches[0].category == "factory"


def test_get_part_parameters_rejects_invalid_part():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.get_part_parameters(16))
    assert exc.value.status_code == 400


def test_set_part_parameter_success(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    request = synthforge_routes.ParameterUpdateRequest(param="osc1.level", value=0.7)
    payload = asyncio.run(synthforge_routes.set_part_parameter(0, request))

    assert payload["status"] == "ok"
    assert payload["part_index"] == 0
    assert payload["param"] == "osc1.level"
