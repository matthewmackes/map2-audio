from __future__ import annotations

import pytest

from app.services.maschine_lcd_service import (
    MaschineLCDRenderService,
    reset_maschine_lcd_render_service,
)


class _FakeMaschineService:
    async def get_audio_grid_projection(self, _session):
        return {
            "blocks": [
                {
                    "block_id": "path-a:0",
                    "plugin_name": "EQ",
                    "chain_name": "Clean",
                    "bypassed": False,
                    "top_parameters": [{"param_id": "GAIN", "value": "+3.5"}],
                },
                {
                    "block_id": "path-a:1",
                    "plugin_name": "DELAY",
                    "chain_name": "Clean",
                    "bypassed": True,
                    "top_parameters": [{"param_id": "MIX", "value": "24"}],
                },
            ],
            "selected_block_id": "path-a:1",
            "page_index": 0,
            "updated_at": "2026-04-01T12:00:00Z",
        }


@pytest.mark.asyncio
async def test_render_audio_grid_produces_xbm_payloads():
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    render = await service.render(
        session=None,
        maschine_service=_FakeMaschineService(),
        context="audio_grid",
    )

    assert render["context"] == "audio_grid"
    assert render["meta"]["selected_block_id"] == "path-a:1"
    assert render["left"]["format"] == "xbm"
    assert render["right"]["format"] == "xbm"
    assert len(render["left"]["data"]) > 100
    assert len(render["right"]["data"]) > 100


@pytest.mark.asyncio
async def test_render_stats_tracks_metric_history(monkeypatch):
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    async def _fake_health():
        return {"uptime_seconds": 12.0, "cpu_percent": 5.0}

    async def _fake_audio():
        return {"cpu_load": 0.12, "sample_rate": 48000}

    async def _fake_midi():
        return {"route_count": 4, "traffic": {"captured_total": 9}}

    monkeypatch.setattr(service, "_get_health_payload", _fake_health)
    monkeypatch.setattr(service, "_get_audio_payload", _fake_audio)
    monkeypatch.setattr(service, "_get_midi_payload", _fake_midi)

    first = await service.render(session=None, maschine_service=_FakeMaschineService(), context="stats")
    second = await service.render(
        session=None,
        maschine_service=_FakeMaschineService(),
        context="stats",
        focus_metric="audio.cpu_load",
    )

    assert first["context"] == "stats"
    assert second["meta"]["focus_metric"] == "audio.cpu_load"
    assert second["meta"]["history_points"] >= 1
    assert second["stats"]["metric_count"] >= 4
    assert len(second["right"]["data"]) > 100
