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
