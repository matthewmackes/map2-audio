"""
Shared helpers for duplicate-safe runtime-scoped plugin routes.

JUCE runtime parameter access uses normalized 0..1 values under the hood.
These helpers resolve the live instance, translate normalized values to the
route contract defined in app/deployment/juce_processors.json, and provide a
small fallback metering surface from per-instance VU levels when a route has
no dedicated scoped metering API yet.
"""

from __future__ import annotations

import inspect
import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException

from app.services.plugin_instance_id import resolve_legacy_instance_id


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_JUCE_PROCESSORS_PATH = _PROJECT_ROOT / "app" / "deployment" / "juce_processors.json"

# Route compatibility overrides where the legacy REST contract intentionally
# differs from the catalog display range.
_RANGE_OVERRIDES: dict[tuple[str, str], tuple[float, float]] = {
    ("map2://juce/pitch/boss-xs1", "feedback"): (0.0, 0.7),
}


def _has_plugin_position(plugin_position: Optional[int]) -> bool:
    return isinstance(plugin_position, int) and plugin_position >= 0


def _has_explicit_instance_id(instance_id: Optional[int]) -> bool:
    return isinstance(instance_id, int) and instance_id > 0


def is_scoped_request(instance_id: Optional[int], plugin_position: Optional[int]) -> bool:
    return _has_explicit_instance_id(instance_id) or _has_plugin_position(plugin_position)


def raise_scoped_not_found(
    label: str,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> None:
    if _has_plugin_position(plugin_position):
        raise HTTPException(status_code=404, detail=f"{label} instance not found at position: {plugin_position}")
    if _has_explicit_instance_id(instance_id):
        raise HTTPException(status_code=404, detail=f"{label} instance not found: {instance_id}")
    raise HTTPException(status_code=404, detail=f"{label} instance not found")


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def resolve_scoped_instance_id(
    engine: Any,
    plugin_uri: str,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    explicit_instance_id = instance_id if _has_explicit_instance_id(instance_id) else None
    resolver = getattr(engine, "resolve_instance_id", None)
    if callable(resolver):
        try:
            resolved_instance_id = await _maybe_await(
                resolver(
                    plugin_uri,
                    plugin_position,
                    fallback_instance_id=explicit_instance_id,
                )
            )
        except TypeError:
            resolved_instance_id = await _maybe_await(resolver(plugin_uri, plugin_position))
            if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
                resolved_instance_id = explicit_instance_id
        return resolved_instance_id if isinstance(resolved_instance_id, int) and resolved_instance_id > 0 else None

    if explicit_instance_id is not None:
        return explicit_instance_id
    if not _has_plugin_position(plugin_position):
        return None

    return await resolve_legacy_instance_id(engine, plugin_uri, plugin_position)


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
    for (uri, symbol), (minimum, maximum) in _RANGE_OVERRIDES.items():
        if uri != plugin_uri:
            continue
        spec = dict(specs.get(symbol, {}))
        spec["min"] = minimum
        spec["max"] = maximum
        specs[symbol] = spec
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

    if spec.get("type") == "toggle":
        return 1.0 if value >= 0.5 else 0.0

    options = spec.get("options")
    if isinstance(options, list) and options:
        last_index = max(0, len(options) - 1)
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
    value = _coerce_float(actual_value, 0.0)
    spec = get_parameter_specs(plugin_uri).get(symbol)
    if not spec:
        return value

    if spec.get("type") == "toggle":
        return 1.0 if value >= 0.5 else 0.0

    options = spec.get("options")
    if isinstance(options, list) and options:
        last_index = max(0, len(options) - 1)
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


async def read_scoped_actual_parameter(
    engine: Any,
    plugin_uri: str,
    symbol: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
    default: float,
) -> float:
    normalized_value = await _maybe_await(
        engine.get_parameter(
            plugin_uri,
            symbol,
            instance_id=scoped_instance_id,
            plugin_position=plugin_position,
        )
    )
    return normalized_to_actual(plugin_uri, symbol, normalized_value, default)


async def set_scoped_actual_parameter(
    engine: Any,
    plugin_uri: str,
    symbol: str,
    value: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> None:
    normalized_value = actual_to_normalized(plugin_uri, symbol, value)
    updated = await _maybe_await(
        engine.set_parameter(
            plugin_uri,
            symbol,
            normalized_value,
            instance_id=scoped_instance_id,
            plugin_position=plugin_position,
        )
    )
    if not updated:
        raise HTTPException(status_code=500, detail=f"Failed to update {symbol}")


def actual_to_bool(value: Any, default: bool = False) -> bool:
    try:
        return float(value) >= 0.5
    except (TypeError, ValueError):
        return default


def linear_peak_to_db(value: Any, floor_db: float = -100.0) -> float:
    linear = _coerce_float(value, 0.0)
    if linear <= 0.0:
        return floor_db
    return max(floor_db, 20.0 * math.log10(linear))


async def get_scoped_vu_levels(
    engine: Any,
    plugin_uri: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Optional[dict[str, Any]]:
    getter = getattr(engine, "get_plugin_vu_levels", None)
    if not callable(getter):
        return None

    levels = await _maybe_await(getter())
    if not isinstance(levels, list):
        return None

    for entry in levels:
        if not isinstance(entry, dict):
            continue
        if entry.get("uri") != plugin_uri:
            continue
        entry_instance_id = entry.get("instance_id")
        entry_position = entry.get("plugin_position", entry.get("position"))
        if isinstance(entry_instance_id, int) and entry_instance_id == scoped_instance_id:
            return dict(entry)
        if _has_plugin_position(plugin_position) and entry_position == plugin_position:
            return dict(entry)

    return None
