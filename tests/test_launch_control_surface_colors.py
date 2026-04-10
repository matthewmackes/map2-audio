from __future__ import annotations

from app.services.launch_control_surface.colors import (
    NOVATION_LED_AMBER_FULL,
    NOVATION_LED_GREEN_FULL,
    NOVATION_LED_OFF,
    NOVATION_LED_RED_LOW,
    resolve_led_feedback,
)
from app.services.launch_control_surface.protocol import build_led_note_message


def test_launch_control_led_feedback_uses_effect_type_defaults() -> None:
    assert resolve_led_feedback("delay") == {
        "effect_type": "delay",
        "carbon_family": "blue",
        "device_color": "yellow_full",
        "velocity": 0x3E,
        "source": "effect_type_default",
    }
    assert resolve_led_feedback("drive")["velocity"] == NOVATION_LED_GREEN_FULL
    assert resolve_led_feedback("reverb")["velocity"] == NOVATION_LED_RED_LOW
    assert resolve_led_feedback("modulation")["velocity"] == NOVATION_LED_AMBER_FULL
    assert resolve_led_feedback("utility")["velocity"] == NOVATION_LED_OFF


def test_launch_control_led_feedback_honors_color_and_velocity_overrides() -> None:
    assert resolve_led_feedback("delay", "green_full")["velocity"] == NOVATION_LED_GREEN_FULL
    assert resolve_led_feedback("delay", {"carbon_family": "purple"})["velocity"] == NOVATION_LED_RED_LOW
    assert resolve_led_feedback("delay", {"velocity": 45}) == {
        "effect_type": "delay",
        "carbon_family": "blue",
        "device_color": "custom_velocity",
        "velocity": 45,
        "source": "velocity_override",
    }


def test_launch_control_led_note_message_uses_novation_velocity_values() -> None:
    assert build_led_note_message(note=0x29, velocity=NOVATION_LED_GREEN_FULL, channel=1) == bytes([0x90, 0x29, 0x3C])
