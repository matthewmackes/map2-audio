"""
Helpers for interpreting JUCE native processor parameter schemas.

The catalog in ``app/deployment/juce_processors.json`` defines the operator-
facing ranges for MAP2 native processors. Service-layer helpers use these
functions when they need to translate between JUCE's normalized 0..1 values
and the actual values expected by the fixed native processor setters/getters.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_JUCE_PROCESSORS_PATH = _PROJECT_ROOT / "app" / "deployment" / "juce_processors.json"
_INSTANCE_SCOPED_NATIVE_URIS = frozenset(
    {
        "map2://juce/nam",
        "map2://juce/convolution/cabinet",
        "map2://juce/convolution/reverb",
    }
)
_NATIVE_URI_SLUG_OVERRIDES = {
    "map2://juce/eq/parametric": "eq",
    "map2://juce/pitch/shifter": "pitch_shifter",
    "map2://juce/reverb/pcm70": "lexilove",
    "map2://juce/pitch/boss-xs1": "boss_xs1",
}


def is_instance_scoped_native_processor_uri(plugin_uri: str) -> bool:
    return plugin_uri in _INSTANCE_SCOPED_NATIVE_URIS


def is_fixed_native_processor_uri(plugin_uri: str) -> bool:
    return plugin_uri.startswith("map2://juce/") and not is_instance_scoped_native_processor_uri(plugin_uri)


def native_fixed_processor_slug(plugin_uri: str) -> str:
    override = _NATIVE_URI_SLUG_OVERRIDES.get(plugin_uri)
    if override:
        return override
    return plugin_uri.rstrip("/").rsplit("/", 1)[-1].replace("-", "_")


@lru_cache(maxsize=1)
def _juce_processors_catalog() -> dict[str, dict[str, Any]]:
    with _JUCE_PROCESSORS_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    processors = payload.get("processors", []) if isinstance(payload, dict) else []
    by_uri: dict[str, dict[str, Any]] = {}
    for processor in processors:
        if not isinstance(processor, dict):
            continue
        uri = processor.get("uri")
        if isinstance(uri, str) and uri:
            by_uri[uri] = processor
    return by_uri


@lru_cache(maxsize=None)
def get_parameter_specs(plugin_uri: str) -> dict[str, dict[str, Any]]:
    processor = _juce_processors_catalog().get(plugin_uri, {})
    specs: dict[str, dict[str, Any]] = {}
    for parameter in processor.get("parameters", []):
        if not isinstance(parameter, dict):
            continue
        symbol = parameter.get("symbol")
        if not isinstance(symbol, str) or not symbol:
            continue
        specs[symbol] = dict(parameter)
    multi_tap = processor.get("multi_tap")
    if isinstance(multi_tap, dict):
        for parameter in multi_tap.get("taps", []):
            if not isinstance(parameter, dict):
                continue
            symbol = parameter.get("symbol")
            if not isinstance(symbol, str) or not symbol:
                continue
            specs[symbol] = dict(parameter)
    return specs


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp_normalized(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalized_to_actual(
    plugin_uri: str,
    symbol: str,
    normalized_value: Any,
    default: float,
) -> float:
    value = _coerce_float(normalized_value, float(default))
    spec = get_parameter_specs(plugin_uri).get(symbol)
    if not spec:
        return value

    param_type = str(spec.get("type") or "").strip().lower()
    if param_type == "toggle":
        return 1.0 if value >= 0.5 else 0.0

    options = spec.get("options")
    choices = spec.get("choices")
    enumerated = options if isinstance(options, list) and options else choices if isinstance(choices, list) else None
    if enumerated:
        last_index = max(0, len(enumerated) - 1)
        if last_index == 0:
            return 0.0
        return float(int(round(_clamp_normalized(value) * last_index)))

    minimum = _coerce_float(spec.get("min"), 0.0)
    maximum = _coerce_float(spec.get("max"), 1.0)
    if math.isclose(maximum, minimum):
        return minimum

    normalized = _clamp_normalized(value)
    if spec.get("logarithmic") and minimum > 0.0 and maximum > 0.0:
        return float(minimum * ((maximum / minimum) ** normalized))
    return float(minimum + ((maximum - minimum) * normalized))


def actual_to_normalized(
    plugin_uri: str,
    symbol: str,
    actual_value: Any,
) -> float:
    spec = get_parameter_specs(plugin_uri).get(symbol)
    if not spec:
        return _coerce_float(actual_value, 0.0)

    param_type = str(spec.get("type") or "").strip().lower()
    options = spec.get("options")
    choices = spec.get("choices")
    enumerated = options if isinstance(options, list) and options else choices if isinstance(choices, list) else None
    if enumerated and isinstance(actual_value, str):
        normalized_value = actual_value.strip()
        for index, option in enumerate(enumerated):
            if normalized_value.lower() == str(option).strip().lower():
                actual_value = float(index)
                break

    value = _coerce_float(actual_value, 0.0)
    if param_type == "toggle":
        return 1.0 if value >= 0.5 else 0.0

    if enumerated:
        last_index = max(0, len(enumerated) - 1)
        if last_index == 0:
            return 0.0
        return _clamp_normalized(value / last_index)

    minimum = _coerce_float(spec.get("min"), 0.0)
    maximum = _coerce_float(spec.get("max"), 1.0)
    clamped = max(minimum, min(maximum, value))
    if math.isclose(maximum, minimum):
        return 0.0

    if spec.get("logarithmic") and minimum > 0.0 and maximum > 0.0:
        return _clamp_normalized(math.log(clamped / minimum) / math.log(maximum / minimum))
    return _clamp_normalized((clamped - minimum) / (maximum - minimum))


def coerce_actual_parameter_value(plugin_uri: str, symbol: str, actual_value: Any) -> bool | int | float:
    spec = get_parameter_specs(plugin_uri).get(symbol, {})
    value = _coerce_float(actual_value, 0.0)
    param_type = str(spec.get("type") or "").strip().lower()
    if param_type == "toggle":
        return value >= 0.5
    if param_type in {"enum", "choice", "integer", "int"}:
        return int(round(value))
    if isinstance(spec.get("options"), list) or isinstance(spec.get("choices"), list):
        return int(round(value))
    return float(value)
