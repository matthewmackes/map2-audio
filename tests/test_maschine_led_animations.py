from __future__ import annotations

import time

from app.services.maschine.led_animations import (
    ANIMATION_CATALOG,
    PROFILE_SIGNATURES,
    build_profile_signature_overlay,
    normalize_pad_led_entry,
    resolve_led_value,
)
from app.services.maschine.maschine_mk1_daemon import DaemonConfig, MaschineMK1Daemon
from app.services.maschine.mk1_protocol import LED_PAD_INDEX, Led


def test_profile_signature_catalog_covers_all_phase2_profiles() -> None:
    assert len(PROFILE_SIGNATURES) == 25
    assert PROFILE_SIGNATURES["t1_ctrl"]["animation"] == "steady"
    assert PROFILE_SIGNATURES["t18_admin_console"]["animation"] == "snap"


def test_animation_catalog_values_stay_in_bounds() -> None:
    now = time.monotonic()
    assert len(ANIMATION_CATALOG) == 25
    for index, animation in enumerate(ANIMATION_CATALOG):
        value = resolve_led_value(level="full", animation=animation, now=now, phase_offset=(index / 25.0))
        assert 0 <= value <= 255


def test_normalize_pad_led_entry_prefers_tier_and_animation_metadata() -> None:
    value = normalize_pad_led_entry(
        {
            "state": "bright",
            "brightness_level": "mid",
            "animation": "steady",
        },
        now=time.monotonic(),
        phase_offset=0.0,
    )
    assert value == 96


def test_daemon_build_led_array_applies_signature_overlay_and_heartbeat() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._state.backend_connected = True
    daemon._state.device_connected = True
    daemon._state.display_context = "t1_ctrl"
    daemon._state.profile_switch_osd_profile_id = "t15_quad_morph_editor"
    daemon._state.profile_switch_osd_until = time.monotonic() + 1.5

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.DisplayBacklight)] > 0
    assert led[int(Led.Navigate)] > 0
    assert led[int(Led.Control)] == 255
    assert led[int(Led.Step)] == 0
    assert any(led[index] > 0 for index in LED_PAD_INDEX)
    overlay = build_profile_signature_overlay("t15_quad_morph_editor", now=time.monotonic(), pad_count=16)
    assert len(overlay) == 16


def test_daemon_build_led_array_applies_menu_category_and_inspection_overlays(monkeypatch) -> None:
    monkeypatch.setattr(time, "monotonic", lambda: 10.0)

    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._state.backend_connected = True
    daemon._state.device_connected = True
    daemon._state.display_context = "menu"
    daemon._state.menu_return_context = "t3_brws"
    daemon._state.menu_category_index = 3
    daemon._state.inspection_mode = "assigned"
    daemon._state.encoder_map = {
        "enc2": {"block_id": "path-a:1", "param_id": "mix", "label": "Mix"},
        "enc3": {"block_id": "path-a:2", "param_id": "feedback", "label": "Feedback"},
    }
    daemon._state.audio_grid = {
        "selected_block_id": "path-a:1",
        "blocks": [
            {"block_id": "path-a:0", "plugin_uri": "urn:eq", "plugin_position": 0, "bypassed": False},
            {"block_id": "path-a:1", "plugin_uri": "urn:delay", "plugin_position": 1, "bypassed": True},
            {"block_id": "path-a:2", "plugin_uri": "urn:chorus", "plugin_position": 2, "bypassed": False},
        ],
    }
    daemon._state.automation_parameter_ids = ["urn:chorus:4@2"]

    led = daemon._build_led_array(
        {
            "pads": [
                {"index": 0, "block_id": "path-a:0", "state": "bright", "color": "active", "selected": False},
                {"index": 1, "block_id": "path-a:1", "state": "pulsing", "color": "bypassed", "selected": True},
                {"index": 2, "block_id": "path-a:2", "state": "bright", "color": "active", "selected": False},
            ]
        }
    )

    assert led[int(Led.GroupD)] > 0
    assert led[int(Led.Keyboard)] > 0
    assert led[int(Led.Pattern)] == 0
    assert led[int(Led.Scene)] == 0
    assert led[LED_PAD_INDEX[1]] > 0
    assert led[LED_PAD_INDEX[2]] > 0


def test_daemon_build_led_array_applies_audio_reactive_choreography() -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._state.backend_connected = True
    daemon._state.device_connected = True
    daemon._state.display_context = "t3_brws"
    daemon._state.audio_levels_state = {"output_left": -5.0, "output_right": -8.0}
    daemon._state.spectrum_state = {"peak_frequency": 8000.0, "spectral_centroid": 5600.0}
    daemon._state.true_peak_state = {"true_peak": -6.0}
    daemon._state.drum_transport_state = {"is_playing": True, "bpm": 120}
    daemon._state.beat_anchor_monotonic = time.monotonic() - 0.01

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.Grid)] > 0
    assert led[int(Led.Sampling)] > 0
    assert any(led[index] > 0 for index in LED_PAD_INDEX)


def test_daemon_build_led_array_applies_brain_choreography(monkeypatch) -> None:
    fixed_now = 10.0
    monkeypatch.setattr(time, "monotonic", lambda: fixed_now)

    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._state.backend_connected = True
    daemon._state.device_connected = True
    daemon._state.display_context = "t10_brain_seq"
    daemon._state.drum_transport_state = {"is_playing": True, "bpm": 124}
    daemon._state.beat_anchor_monotonic = fixed_now - 0.01
    daemon._state.brain_state = {
        "active_slot": 2,
        "slots": [{"slot_id": index, "mode": "drum"} for index in range(16)],
    }
    daemon._state.brain_sequence_state = {
        "current_pattern": 1,
        "lanes": [
            {"slot_id": 0, "active_steps": 2},
            {"slot_id": 2, "active_steps": 6},
        ],
        "patterns": [{"pattern_id": 1, "fill_enabled": True}],
        "fill_mode": "manual+auto",
    }

    led = daemon._build_led_array({"pads": [{"index": index, "state": "off"} for index in range(16)]})

    assert led[int(Led.GroupA)] > 0
    assert led[int(Led.GroupC)] > 0
    assert led[int(Led.Scene)] > 0
    assert led[LED_PAD_INDEX[2]] > 0
