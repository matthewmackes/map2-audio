from __future__ import annotations

from typing import Any

NOVATION_LED_OFF = 0x0C
NOVATION_LED_RED_LOW = 0x0D
NOVATION_LED_RED_FULL = 0x0F
NOVATION_LED_GREEN_LOW = 0x1C
NOVATION_LED_AMBER_LOW = 0x1D
NOVATION_LED_GREEN_FULL = 0x3C
NOVATION_LED_YELLOW_FULL = 0x3E
NOVATION_LED_AMBER_FULL = 0x3F

DEVICE_LED_VELOCITY_BY_NAME = {
    "off": NOVATION_LED_OFF,
    "red_low": NOVATION_LED_RED_LOW,
    "red": NOVATION_LED_RED_FULL,
    "red_full": NOVATION_LED_RED_FULL,
    "green_low": NOVATION_LED_GREEN_LOW,
    "green": NOVATION_LED_GREEN_FULL,
    "green_full": NOVATION_LED_GREEN_FULL,
    "amber_low": NOVATION_LED_AMBER_LOW,
    "amber": NOVATION_LED_AMBER_FULL,
    "amber_full": NOVATION_LED_AMBER_FULL,
    "yellow": NOVATION_LED_YELLOW_FULL,
    "yellow_full": NOVATION_LED_YELLOW_FULL,
}

CARBON_FAMILY_BY_EFFECT = {
    "delay": "blue",
    "echo": "blue",
    "drive": "green",
    "distortion": "green",
    "overdrive": "green",
    "fuzz": "green",
    "reverb": "purple",
    "spatial": "purple",
    "pitch": "purple",
    "modulation": "orange",
    "chorus": "orange",
    "flanger": "orange",
    "phaser": "orange",
    "tremolo": "orange",
    "vibrato": "orange",
    "amplifier": "red",
    "amp": "red",
    "preamp": "red",
    "cabinet": "teal",
    "ir": "teal",
    "convolution": "teal",
    "compressor": "cyan",
    "dynamics": "cyan",
    "limiter": "cyan",
    "gate": "cyan",
    "expander": "cyan",
    "utility": "gray",
    "eq": "gray",
    "equalizer": "gray",
    "equaliser": "gray",
    "filter": "gray",
    "mixer": "gray",
    "nam": "magenta",
    "guitar": "magenta",
    "simulator": "magenta",
}

DEVICE_LED_NAME_BY_CARBON_FAMILY = {
    "blue": "yellow_full",
    "green": "green_full",
    "purple": "red_low",
    "orange": "amber_full",
    "red": "red_full",
    "teal": "green_low",
    "cyan": "amber_low",
    "gray": "off",
    "magenta": "red_full",
}


def _normalize_effect_type(effect_type: str | None) -> str:
    return str(effect_type or "").strip().lower().replace("-", " ")


def _resolve_carbon_family(effect_type: str | None) -> str:
    normalized = _normalize_effect_type(effect_type)
    if not normalized:
        return "gray"
    if normalized in CARBON_FAMILY_BY_EFFECT:
        return CARBON_FAMILY_BY_EFFECT[normalized]
    for key, family in CARBON_FAMILY_BY_EFFECT.items():
        if key in normalized:
            return family
    return "gray"


def resolve_led_feedback(effect_type: str | None, override: str | dict[str, Any] | None = None) -> dict[str, Any]:
    carbon_family = _resolve_carbon_family(effect_type)
    device_led_name = DEVICE_LED_NAME_BY_CARBON_FAMILY.get(carbon_family, "off")
    source = "effect_type_default"

    if isinstance(override, str):
        normalized = override.strip().lower()
        if normalized in DEVICE_LED_VELOCITY_BY_NAME:
            device_led_name = normalized
            source = "device_override"
        elif normalized in DEVICE_LED_NAME_BY_CARBON_FAMILY:
            carbon_family = normalized
            device_led_name = DEVICE_LED_NAME_BY_CARBON_FAMILY[normalized]
            source = "carbon_family_override"
    elif isinstance(override, dict):
        device_name = str(override.get("device_color") or "").strip().lower()
        family_name = str(override.get("carbon_family") or "").strip().lower()
        velocity_value = override.get("velocity")
        if device_name in DEVICE_LED_VELOCITY_BY_NAME:
            device_led_name = device_name
            source = "device_override"
        elif family_name in DEVICE_LED_NAME_BY_CARBON_FAMILY:
            carbon_family = family_name
            device_led_name = DEVICE_LED_NAME_BY_CARBON_FAMILY[family_name]
            source = "carbon_family_override"
        elif velocity_value is not None:
            try:
                velocity = max(0, min(0x7F, int(velocity_value)))
                return {
                    "effect_type": effect_type,
                    "carbon_family": carbon_family,
                    "device_color": "custom_velocity",
                    "velocity": velocity,
                    "source": "velocity_override",
                }
            except (TypeError, ValueError):
                pass

    return {
        "effect_type": effect_type,
        "carbon_family": carbon_family,
        "device_color": device_led_name,
        "velocity": DEVICE_LED_VELOCITY_BY_NAME[device_led_name],
        "source": source,
    }
