from __future__ import annotations

import json

import pytest

import app.services.maschine_lcd_service as maschine_lcd_service_module
from app.services.maschine_lcd_service import (
    MaschineLCDRenderService,
    get_maschine_lcd_render_service,
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

    def get_status(self):
        return {
            "connected": True,
            "status": "connected",
            "virtual_port_name": "MAP2:Maschine-MK1",
            "transport": {"status": "running"},
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


def test_maschine_lcd_render_service_singleton_reset():
    reset_maschine_lcd_render_service()
    first = get_maschine_lcd_render_service()
    second = get_maschine_lcd_render_service()
    assert first is second

    reset_maschine_lcd_render_service()
    replacement = get_maschine_lcd_render_service()
    assert replacement is not first


@pytest.mark.asyncio
async def test_render_phase2_monitor_help_profiles_and_menu_metadata(monkeypatch, tmp_path):
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    incident_log = tmp_path / "maschine_incident_log.jsonl"
    incident_log.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "timestamp": "2026-04-18T14:20:00Z",
                        "severity": "warn",
                        "source": "backend",
                        "message": "Audio CPU high",
                        "detail": "95 percent for 3 seconds",
                    }
                ),
                json.dumps(
                    {
                        "timestamp": "2026-04-18T14:21:00Z",
                        "severity": "error",
                        "source": "maschine-daemon",
                        "message": "USB reconnect",
                        "detail": "Recovered without operator action",
                    }
                ),
            ]
        ),
        encoding="utf-8",
    )

    async def _fake_health():
        return {
            "overall_status": "degraded",
            "status": "degraded",
            "cpu_percent": 91.2,
            "memory_percent": 44.0,
            "audio_running": True,
            "issues": ["CPU high"],
        }

    async def _fake_audio():
        return {
            "running": True,
            "cpu_load": 0.52,
            "sample_rate": 48000,
            "buffer_size": 128,
        }

    async def _fake_midi():
        return {
            "route_count": 6,
            "traffic": {"captured_total": 12},
        }

    class _FakeRuntimeConfig:
        def get(self, key: str, default=None):
            values = {
                "maschine.transport_preference": "pyusb-bulk",
                "maschine.allow_kernel_detach": True,
            }
            return values.get(key, default)

    monkeypatch.setattr(service, "_get_health_payload", _fake_health)
    monkeypatch.setattr(service, "_get_audio_payload", _fake_audio)
    monkeypatch.setattr(service, "_get_midi_payload", _fake_midi)
    monkeypatch.setattr(maschine_lcd_service_module, "_INCIDENT_LOG_PATH", incident_log)
    monkeypatch.setattr(maschine_lcd_service_module, "get_runtime_config_manager", lambda: _FakeRuntimeConfig())

    rendered_profiles = {}
    for profile_id in (
        "t13_incident_log",
        "t17_system_health",
        "t21_diagnostics",
        "t22_log_viewer",
        "t23_preferences",
        "t24_help_manual",
        "t25_reference_card",
    ):
        rendered_profiles[profile_id] = await service.render(
            session=None,
            maschine_service=_FakeMaschineService(),
            context="audio_grid",
            profile_id=profile_id,
        )

    assert rendered_profiles["t13_incident_log"]["profile_name"] == "T13 INCIDENT LOG"
    assert rendered_profiles["t13_incident_log"]["meta"]["category"] == "Admin"
    assert any(
        item["profile_id"] == "t9_effect_chain_editor" and item["category"] == "Chain"
        for item in rendered_profiles["t13_incident_log"]["meta"]["menu_items"]
    )
    assert any(item["profile_id"] == "t24_help_manual" and item["category"] == "Help" for item in rendered_profiles["t24_help_manual"]["meta"]["menu_items"])
    assert rendered_profiles["t17_system_health"]["meta"]["category"] == "Monitor"
    assert rendered_profiles["t23_preferences"]["meta"]["category"] == "Admin"
    assert len(rendered_profiles["t25_reference_card"]["left"]["data"]) > 100


@pytest.mark.asyncio
async def test_render_phase2_browser_sampler_profiles(monkeypatch):
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    async def _fake_health():
        return {"overall_status": "healthy", "status": "healthy", "issues": []}

    async def _fake_audio():
        return {"running": True, "cpu_load": 0.2}

    async def _fake_midi():
        return {"route_count": 2}

    monkeypatch.setattr(service, "_get_health_payload", _fake_health)
    monkeypatch.setattr(service, "_get_audio_payload", _fake_audio)
    monkeypatch.setattr(service, "_get_midi_payload", _fake_midi)
    monkeypatch.setattr(
        service,
        "_collect_browser_state",
        lambda: {
            "library": {
                "collections": [
                    {
                        "collection_id": "factory-kits",
                        "label": "Factory Kits",
                        "asset_count": 3,
                        "assets": [
                            {
                                "asset_id": "kit-a",
                                "name": "Studio Kit",
                                "source": "factory",
                            }
                        ],
                    }
                ],
                "featured_assets": ["kit-a"],
            },
            "sample_editor": {
                "slot_id": 2,
                "waveform_available": True,
                "duration_seconds": 1.25,
                "start_sample": 0,
                "end_sample": 60000,
                "asset_path": "/tmp/studio-kit/kick.wav",
            },
            "sample_waveform": {"sample_count": 60000},
            "kits": [
                {
                    "kit_id": "studio-kit",
                    "name": "Studio Kit",
                    "source": "factory",
                    "category": "hybrid",
                    "instruments": [{"name": "Kick"}],
                },
                {
                    "kit_id": "broken-kit",
                    "name": "Broken Kit",
                    "source": "user",
                    "category": "hybrid",
                    "instruments": [{"name": "Snare"}],
                },
            ],
            "active_kit": {
                "kit_id": "studio-kit",
                "name": "Studio Kit",
                "source": "factory",
                "category": "hybrid",
                "instruments": [{"name": "Kick"}],
            },
        },
    )

    rendered = {}
    for profile_id in ("t3_brws", "t4_smpl", "t14_kit_browser"):
        rendered[profile_id] = await service.render(
            session=None,
            maschine_service=_FakeMaschineService(),
            context="audio_grid",
            profile_id=profile_id,
        )

    assert rendered["t3_brws"]["profile_name"] == "T3 BRWS"
    assert rendered["t3_brws"]["meta"]["category"] == "Sampler"
    assert rendered["t4_smpl"]["profile_name"] == "T4 SMPL"
    assert rendered["t14_kit_browser"]["profile_name"] == "T14 KIT BROWSER"
    assert any(item["profile_id"] == "t14_kit_browser" for item in rendered["t14_kit_browser"]["meta"]["menu_items"])
    assert len(rendered["t4_smpl"]["right"]["data"]) > 100


@pytest.mark.asyncio
async def test_render_phase2_brain_and_morph_profiles(monkeypatch):
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    async def _fake_health():
        return {"overall_status": "healthy", "status": "healthy", "issues": []}

    async def _fake_audio():
        return {"running": True, "cpu_load": 0.2}

    async def _fake_midi():
        return {"route_count": 2}

    monkeypatch.setattr(service, "_get_health_payload", _fake_health)
    monkeypatch.setattr(service, "_get_audio_payload", _fake_audio)
    monkeypatch.setattr(service, "_get_midi_payload", _fake_midi)
    monkeypatch.setattr(
        service,
        "_collect_brain_morph_state",
        lambda _snapshot_state: __import__("asyncio").sleep(
            0,
            result={
                "brain_state": {
                    "active_slot": 1,
                    "slots": [
                        {"slot_id": 0, "name": "Kick", "mode": "drum"},
                        {"slot_id": 1, "name": "Snare", "mode": "drum"},
                        {"slot_id": 8, "name": "Bass", "mode": "chromatic"},
                        {"slot_id": 9, "name": "Lead", "mode": "hybrid"},
                    ],
                },
                "brain_sequence": {
                    "current_pattern": 1,
                    "fill_mode": "manual+auto",
                    "song_entry_count": 3,
                    "patterns": [
                        {"pattern_id": 0, "active_lane_count": 4, "length": 16},
                        {"pattern_id": 1, "active_lane_count": 6, "length": 32},
                    ],
                },
                "morph_routing": {
                    "morph_position": 0.25,
                    "morph_source_channel_key": "a-left",
                    "morph_target_channel_key": "b-right",
                },
                "morph_engine": {
                    "engine_mode": "quad_morph",
                },
            },
        ),
    )

    rendered = {}
    for profile_id in ("t7_b_l", "t8_b_r", "t10_brain_seq", "t15_quad_morph_editor"):
        rendered[profile_id] = await service.render(
            session=None,
            maschine_service=_FakeMaschineService(),
            context="audio_grid",
            profile_id=profile_id,
        )

    assert rendered["t7_b_l"]["meta"]["category"] == "Brain"
    assert rendered["t8_b_r"]["profile_name"] == "T8 B-R"
    assert rendered["t10_brain_seq"]["profile_name"] == "T10 BRAIN SEQ"
    assert rendered["t15_quad_morph_editor"]["profile_name"] == "T15 QUAD MORPH"
    assert any(item["profile_id"] == "t15_quad_morph_editor" for item in rendered["t15_quad_morph_editor"]["meta"]["menu_items"])
    assert len(rendered["t10_brain_seq"]["left"]["data"]) > 100


@pytest.mark.asyncio
async def test_render_phase2_tool_and_admin_profiles(monkeypatch):
    reset_maschine_lcd_render_service()
    service = MaschineLCDRenderService()

    async def _fake_health():
        return {"overall_status": "degraded", "status": "degraded", "issues": ["xrun"]}

    async def _fake_audio():
        return {"running": True, "cpu_load": 0.2}

    async def _fake_midi():
        return {"route_count": 2}

    monkeypatch.setattr(service, "_get_health_payload", _fake_health)
    monkeypatch.setattr(service, "_get_audio_payload", _fake_audio)
    monkeypatch.setattr(service, "_get_midi_payload", _fake_midi)
    monkeypatch.setattr(
        service,
        "_collect_tool_state",
        lambda **_kwargs: __import__("asyncio").sleep(
            0,
            result={
                "tuner_available": False,
                "engine_midi_learn": {"active": True, "target": {"parameter_id": "plugin:eq:mix"}},
                "drum_midi_learn": {"active": False},
                "macros": [{"macro_id": "macro-1", "name": "Scene Jump"}],
                "sessions": [{"session_id": "take-1", "name": "Take 1", "started_at": 1.0, "stopped_at": None, "event_count": 12}],
                "deployment_mode": "ALL-IN-ONE",
                "session_unlocked": False,
                "daemon_status": {"status": "connected"},
                "health": {"overall_status": "degraded"},
            },
        ),
    )
    monkeypatch.setattr(
        maschine_lcd_service_module.midi_learn_manager,
        "get_learn_status",
        lambda: {"active": True, "target_parameter": "plugin:eq:mix"},
    )

    rendered = {}
    for profile_id in ("t11_tuner", "t18_admin_console", "t19_midi_learn", "t20_macro_recorder"):
        rendered[profile_id] = await service.render(
            session=None,
            maschine_service=_FakeMaschineService(),
            context="audio_grid",
            profile_id=profile_id,
        )

    admin_menu_item = next(
        item for item in rendered["t18_admin_console"]["meta"]["menu_items"] if item["profile_id"] == "t18_admin_console"
    )
    assert rendered["t11_tuner"]["profile_name"] == "T11 TUNER"
    assert rendered["t18_admin_console"]["meta"]["category"] == "Admin"
    assert admin_menu_item["hidden_from_cycle"] is True
    assert admin_menu_item["admin_only"] is True
    assert rendered["t19_midi_learn"]["profile_name"] == "T19 MIDI LEARN"
    assert rendered["t20_macro_recorder"]["profile_name"] == "T20 MACRO RECORDER"
    assert len(rendered["t18_admin_console"]["left"]["data"]) > 100
