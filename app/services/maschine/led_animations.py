"""Maschine MK1 LED brightness tiers, animation catalog, and profile signatures."""

from __future__ import annotations

import math
from typing import Any


BRIGHTNESS_LEVELS: dict[str, int] = {
    "off": 0,
    "dim": 48,
    "mid": 96,
    "bright": 176,
    "full": 255,
}

ANIMATION_CATALOG: tuple[str, ...] = (
    "steady",
    "blink_slow",
    "blink_fast",
    "pulse_slow",
    "pulse_fast",
    "breathe",
    "heartbeat",
    "double_pulse",
    "strobe_triplet",
    "saw_up_slow",
    "saw_up_fast",
    "saw_down_slow",
    "saw_down_fast",
    "triangle_slow",
    "triangle_fast",
    "shimmer",
    "shimmer_fast",
    "ripple",
    "ripple_fast",
    "swing",
    "swing_fast",
    "snap",
    "snap_fast",
    "ping_pong",
    "bloom",
)

PROFILE_SIGNATURES: dict[str, dict[str, str]] = {
    "t1_ctrl": {"animation": "steady", "level": "full"},
    "t2_step": {"animation": "triangle_fast", "level": "full"},
    "t3_brws": {"animation": "shimmer", "level": "bright"},
    "t4_smpl": {"animation": "saw_down_fast", "level": "bright"},
    "t5_snap": {"animation": "pulse_slow", "level": "full"},
    "t6_auto": {"animation": "double_pulse", "level": "full"},
    "t7_b_l": {"animation": "ripple", "level": "bright"},
    "t8_b_r": {"animation": "ripple_fast", "level": "bright"},
    "t9_effect_chain_editor": {"animation": "swing", "level": "full"},
    "t10_brain_seq": {"animation": "ping_pong", "level": "bright"},
    "t11_tuner": {"animation": "blink_slow", "level": "mid"},
    "t12_metronome": {"animation": "heartbeat", "level": "full"},
    "t13_incident_log": {"animation": "blink_fast", "level": "bright"},
    "t14_kit_browser": {"animation": "shimmer_fast", "level": "bright"},
    "t15_quad_morph_editor": {"animation": "bloom", "level": "full"},
    "t16_monitor": {"animation": "heartbeat", "level": "bright"},
    "t17_system_health": {"animation": "pulse_fast", "level": "bright"},
    "t18_admin_console": {"animation": "snap", "level": "full"},
    "t19_midi_learn": {"animation": "snap_fast", "level": "full"},
    "t20_macro_recorder": {"animation": "double_pulse", "level": "bright"},
    "t21_diagnostics": {"animation": "strobe_triplet", "level": "bright"},
    "t22_log_viewer": {"animation": "saw_up_slow", "level": "mid"},
    "t23_preferences": {"animation": "saw_down_slow", "level": "mid"},
    "t24_help_manual": {"animation": "triangle_slow", "level": "bright"},
    "t25_reference_card": {"animation": "breathe", "level": "bright"},
}

_DEFAULT_SIGNATURE = {"animation": "pulse_slow", "level": "bright"}


def resolve_brightness_level(level: str | None) -> int:
    return BRIGHTNESS_LEVELS.get(str(level or "off").strip().lower(), BRIGHTNESS_LEVELS["off"])


def _normalized_phase(now: float, period: float, phase_offset: float = 0.0) -> float:
    if period <= 0.0:
        return 0.0
    return ((now / period) + phase_offset) % 1.0


def _triangle(phase: float) -> float:
    return 1.0 - abs((phase * 2.0) - 1.0)


def _pulse(phase: float) -> float:
    return 0.5 + (0.5 * math.sin(phase * math.tau))


def _gain(animation: str, *, now: float, phase_offset: float = 0.0) -> float:
    phase_slow = _normalized_phase(now, 1.4, phase_offset)
    phase_fast = _normalized_phase(now, 0.55, phase_offset)
    if animation == "steady":
        return 1.0
    if animation == "blink_slow":
        return 1.0 if phase_slow < 0.5 else 0.0
    if animation == "blink_fast":
        return 1.0 if phase_fast < 0.5 else 0.0
    if animation == "pulse_slow":
        return _pulse(phase_slow)
    if animation == "pulse_fast":
        return _pulse(phase_fast)
    if animation == "breathe":
        return 0.2 + (0.8 * _pulse(phase_slow))
    if animation == "heartbeat":
        return 1.0 if phase_slow < 0.18 or 0.22 < phase_slow < 0.32 else 0.18
    if animation == "double_pulse":
        return 1.0 if phase_slow < 0.18 or 0.4 < phase_slow < 0.58 else 0.15
    if animation == "strobe_triplet":
        return 1.0 if phase_fast < 0.12 or 0.18 < phase_fast < 0.3 or 0.36 < phase_fast < 0.48 else 0.0
    if animation == "saw_up_slow":
        return phase_slow
    if animation == "saw_up_fast":
        return phase_fast
    if animation == "saw_down_slow":
        return 1.0 - phase_slow
    if animation == "saw_down_fast":
        return 1.0 - phase_fast
    if animation == "triangle_slow":
        return _triangle(phase_slow)
    if animation == "triangle_fast":
        return _triangle(phase_fast)
    if animation == "shimmer":
        return 0.55 + (0.45 * math.sin((phase_slow + (phase_offset * 0.3)) * math.tau * 2.0))
    if animation == "shimmer_fast":
        return 0.45 + (0.55 * math.sin((phase_fast + (phase_offset * 0.5)) * math.tau * 3.0))
    if animation == "ripple":
        return max(0.0, math.sin((phase_slow - phase_offset) * math.pi))
    if animation == "ripple_fast":
        return max(0.0, math.sin((phase_fast - phase_offset) * math.pi))
    if animation == "swing":
        return 0.25 if phase_slow < 0.25 else 1.0
    if animation == "swing_fast":
        return 0.2 if phase_fast < 0.25 else 1.0
    if animation == "snap":
        return 1.0 if phase_slow < 0.1 else 0.12
    if animation == "snap_fast":
        return 1.0 if phase_fast < 0.1 else 0.1
    if animation == "ping_pong":
        return 1.0 if abs(_triangle(phase_slow) - phase_offset) < 0.25 else 0.2
    if animation == "bloom":
        return min(1.0, 0.25 + (phase_slow * phase_slow * 1.4))
    return 1.0


def resolve_led_value(
    *,
    level: str | None,
    animation: str | None,
    now: float,
    phase_offset: float = 0.0,
) -> int:
    base = resolve_brightness_level(level)
    gain = _gain(str(animation or "steady"), now=now, phase_offset=phase_offset)
    return max(0, min(255, int(round(base * gain))))


def profile_signature(profile_id: str) -> dict[str, str]:
    return PROFILE_SIGNATURES.get(profile_id, _DEFAULT_SIGNATURE)


def build_profile_signature_overlay(profile_id: str, *, now: float, pad_count: int = 16) -> list[int]:
    signature = profile_signature(profile_id)
    animation = str(signature.get("animation") or _DEFAULT_SIGNATURE["animation"])
    level = str(signature.get("level") or _DEFAULT_SIGNATURE["level"])
    values: list[int] = []
    for index in range(max(0, pad_count)):
        phase_offset = index / max(1, pad_count)
        values.append(resolve_led_value(level=level, animation=animation, now=now, phase_offset=phase_offset))
    return values


def normalize_pad_led_entry(entry: dict[str, Any], *, now: float, phase_offset: float = 0.0) -> int:
    state = str(entry.get("state") or "off")
    level = str(entry.get("brightness_level") or "").strip().lower()
    animation = str(entry.get("animation") or "").strip().lower()
    if not level:
        level = {
            "off": "off",
            "dim": "dim",
            "mid": "mid",
            "bright": "bright",
            "full": "full",
            "pulsing": "full",
        }.get(state, "off")
    if not animation:
        animation = "pulse_fast" if state == "pulsing" else "steady"
    return resolve_led_value(level=level, animation=animation, now=now, phase_offset=phase_offset)
