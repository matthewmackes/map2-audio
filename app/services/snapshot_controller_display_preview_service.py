"""Snapshot controller-display preview planning for activation-time summaries."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.controller_display_assignment_service import build_controller_display_assignments
from app.services.plugin_key_parameter_registry import attach_plugin_key_parameter_metadata
from app.services.plugin_loader_unified import get_plugin_loader


_JUCE_PROCESSORS_CONFIG = Path(__file__).resolve().parents[1] / "deployment" / "juce_processors.json"


def _normalize_unit(value: Any) -> str:
    return str(value or "").strip()


def _coerce_finite_float(value: Any) -> float | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _humanize_symbol(value: Any) -> str:
    symbol = str(value or "").strip().replace("_", " ")
    return " ".join(token.capitalize() for token in symbol.split()) or "Parameter"


def _normalize_juce_parameter_definition(
    definition: Mapping[str, Any],
    index: int,
    *,
    band_index: int | None = None,
) -> dict[str, Any]:
    param_type = str(definition.get("type") or "").strip().lower()
    is_toggled = param_type == "toggle"
    is_enum = param_type == "enum"
    options = [
        str(option)
        for option in definition.get("options", [])
        if isinstance(option, (str, int, float))
    ] if isinstance(definition.get("options"), list) else []

    if is_toggled:
        minimum = 0.0
        maximum = 1.0
        default_value = 1.0 if bool(definition.get("default", False)) else 0.0
    elif is_enum:
        minimum = _coerce_finite_float(definition.get("min"))
        if minimum is None:
            minimum = 0.0
        fallback_maximum = float(len(options) - 1) if options else 1.0
        maximum = _coerce_finite_float(definition.get("max"))
        if maximum is None:
            maximum = fallback_maximum
        raw_default = definition.get("default", minimum)
        if isinstance(raw_default, str) and options:
            try:
                default_value = float(options.index(raw_default))
            except ValueError:
                default_value = minimum
        else:
            default_value = _coerce_finite_float(raw_default)
            if default_value is None:
                default_value = minimum
    else:
        minimum = _coerce_finite_float(definition.get("min"))
        if minimum is None:
            minimum = 0.0
        maximum = _coerce_finite_float(definition.get("max"))
        if maximum is None:
            maximum = 1.0
        default_value = _coerce_finite_float(definition.get("default"))
        if default_value is None:
            default_value = minimum

    if maximum < minimum:
        minimum, maximum = maximum, minimum

    default_value = min(max(default_value, minimum), maximum)
    base_name = str(definition.get("name") or "").strip()
    base_symbol = str(definition.get("symbol") or "").strip()
    name = base_name if band_index is None else f"Band {band_index + 1} {base_name}".strip()
    symbol = base_symbol if band_index is None else f"band{band_index}_{base_symbol}"

    payload = {
        "index": index,
        "name": name,
        "symbol": symbol,
        "min": minimum,
        "max": maximum,
        "default": default_value,
        "is_toggled": is_toggled,
        "is_log": bool(definition.get("logarithmic", False)) and not (is_toggled or is_enum),
        "unit": _normalize_unit(definition.get("unit")),
    }
    if options:
        payload["options"] = options
    return payload


@lru_cache(maxsize=1)
def _load_juce_controller_display_catalog() -> dict[str, dict[str, Any]]:
    if not _JUCE_PROCESSORS_CONFIG.exists():
        return {}

    try:
        with _JUCE_PROCESSORS_CONFIG.open("r", encoding="utf-8") as handle:
            config = json.load(handle)
    except Exception:
        return {}

    catalog: dict[str, dict[str, Any]] = {}
    for processor in config.get("processors", []):
        if not isinstance(processor, Mapping):
            continue

        parameters: list[dict[str, Any]] = []
        next_index = 0

        for parameter in processor.get("parameters", []):
            if not isinstance(parameter, Mapping):
                continue
            parameters.append(_normalize_juce_parameter_definition(parameter, next_index))
            next_index += 1

        band_parameters = processor.get("band_parameters")
        if isinstance(band_parameters, Mapping):
            count = _coerce_int(band_parameters.get("count")) or 0
            per_band = band_parameters.get("per_band")
            if isinstance(per_band, list):
                for band_index in range(max(0, count)):
                    for parameter in per_band:
                        if not isinstance(parameter, Mapping):
                            continue
                        parameters.append(
                            _normalize_juce_parameter_definition(
                                parameter,
                                next_index,
                                band_index=band_index,
                            )
                        )
                        next_index += 1

        payload = attach_plugin_key_parameter_metadata(
            {
                "uri": str(processor.get("uri") or "").strip(),
                "name": str(processor.get("name") or "").strip(),
                "category": str(processor.get("category") or "").strip(),
                "class_label": "JUCE Native",
                "parameters": parameters,
            }
        )
        plugin_uri = str(payload.get("uri") or "").strip()
        if plugin_uri:
            catalog[plugin_uri] = payload
    return catalog


def _load_lv2_controller_display_catalog() -> dict[str, dict[str, Any]]:
    loader = get_plugin_loader()
    if loader is None:
        return {}

    try:
        plugins = loader.discover_sync()
    except Exception:
        return {}

    catalog: dict[str, dict[str, Any]] = {}
    for plugin in plugins:
        parameters = []
        for parameter in getattr(plugin, "parameters", []) or []:
            parameters.append(
                {
                    "index": int(getattr(parameter, "index", len(parameters))),
                    "name": str(getattr(parameter, "name", "")).strip(),
                    "symbol": str(getattr(parameter, "symbol", "")).strip(),
                    "min": float(getattr(parameter, "min_value", 0.0)),
                    "max": float(getattr(parameter, "max_value", 1.0)),
                    "default": float(getattr(parameter, "default_value", 0.0)),
                    "is_toggled": bool(getattr(parameter, "is_toggled", False)),
                    "is_log": bool(getattr(parameter, "is_logarithmic", False)),
                    "unit": _normalize_unit(getattr(parameter, "unit", "")),
                }
            )

        payload = attach_plugin_key_parameter_metadata(
            {
                "uri": str(getattr(plugin, "uri", "")).strip(),
                "name": str(getattr(plugin, "name", "")).strip(),
                "category": str(getattr(plugin, "category", "")).strip(),
                "class_label": str(getattr(plugin, "class_label", "")).strip(),
                "parameters": parameters,
            }
        )
        plugin_uri = str(payload.get("uri") or "").strip()
        if plugin_uri:
            catalog[plugin_uri] = payload
    return catalog


def build_controller_display_plugin_catalog() -> dict[str, dict[str, Any]]:
    """Build a metadata catalog suitable for controller-display preview planning."""

    catalog = _load_juce_controller_display_catalog().copy()
    catalog.update(_load_lv2_controller_display_catalog())
    return catalog


def _collect_snapshot_plugins(snapshot_detail: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    if not isinstance(snapshot_detail, Mapping):
        return collected

    for chain_order, chain in enumerate(snapshot_detail.get("chains", [])):
        if not isinstance(chain, Mapping):
            continue
        chain_id = chain.get("id")
        chain_name = str(chain.get("name") or f"Chain {chain_order + 1}").strip()
        for plugin_order, plugin in enumerate(chain.get("plugins", [])):
            if not isinstance(plugin, Mapping):
                continue
            payload = dict(plugin)
            payload["chain_id"] = chain_id
            payload["chain_name"] = chain_name
            payload["chain_order"] = chain_order
            payload["plugin_order"] = plugin_order
            payload["position"] = _coerce_int(plugin.get("position"))
            collected.append(payload)

    collected.sort(
        key=lambda plugin: (
            int(plugin.get("chain_order", 0)),
            int(plugin.get("position") if plugin.get("position") is not None else plugin.get("plugin_order", 0)),
            int(plugin.get("plugin_order", 0)),
            str(plugin.get("uri") or ""),
        )
    )
    return collected


def _resolve_snapshot_plugin(
    snapshot_plugins: list[dict[str, Any]],
    *,
    plugin_uri: str,
    plugin_position: int | None,
) -> dict[str, Any] | None:
    matches = [plugin for plugin in snapshot_plugins if str(plugin.get("uri") or "").strip() == plugin_uri]
    if not matches:
        return None
    if plugin_position is None:
        return matches[0]

    for plugin in matches:
        if _coerce_int(plugin.get("position")) == plugin_position:
            return plugin
    return None


def _fallback_catalog_entry(snapshot_plugin: Mapping[str, Any]) -> dict[str, Any]:
    parameter_entries: list[dict[str, Any]] = []
    parameters = snapshot_plugin.get("parameters")
    if isinstance(parameters, Mapping):
        for index, symbol in enumerate(sorted(str(key) for key in parameters.keys())):
            parameter_entries.append(
                {
                    "index": index,
                    "name": _humanize_symbol(symbol),
                    "symbol": symbol,
                    "unit": "",
                    "is_toggled": False,
                }
            )

    return attach_plugin_key_parameter_metadata(
        {
            "uri": str(snapshot_plugin.get("uri") or "").strip(),
            "name": str(snapshot_plugin.get("name") or "").strip(),
            "category": str(snapshot_plugin.get("category") or "").strip(),
            "class_label": str(snapshot_plugin.get("class_label") or "").strip(),
            "parameters": parameter_entries,
        }
    )


def _find_parameter_descriptor(
    plugin_catalog_entry: Mapping[str, Any],
    parameter_symbol: str,
) -> dict[str, Any] | None:
    parameters = plugin_catalog_entry.get("parameters")
    if not isinstance(parameters, list):
        return None
    for parameter in parameters:
        if not isinstance(parameter, Mapping):
            continue
        if str(parameter.get("symbol") or "").strip() == parameter_symbol:
            return dict(parameter)
    return None


def _format_numeric_text(value: float, *, preferred_precision: int | None = None) -> str:
    if preferred_precision is None:
        if abs(value - round(value)) < 1e-9:
            preferred_precision = 0
        elif abs(value) >= 100:
            preferred_precision = 1
        elif abs(value) >= 10:
            preferred_precision = 1
        else:
            preferred_precision = 2

    text = f"{value:.{preferred_precision}f}"
    if preferred_precision > 0:
        text = text.rstrip("0").rstrip(".")
    return text


def _format_parameter_value(
    value: Any,
    *,
    unit: str,
    is_toggled: bool,
) -> str | None:
    numeric = _coerce_finite_float(value)
    if numeric is None:
        return None
    if is_toggled:
        return "On" if numeric >= 0.5 else "Off"

    normalized_unit = _normalize_unit(unit)
    if normalized_unit == "ratio":
        return f"{numeric:.2f}"

    precision = None
    if normalized_unit in {"dB"}:
        precision = 1
    elif normalized_unit in {"ms", "Hz", "BPM", "cents", ":1"}:
        precision = 1 if abs(numeric - round(numeric)) >= 1e-9 else 0
    elif normalized_unit == "%":
        precision = 1 if abs(numeric - round(numeric)) >= 1e-9 else 0

    text = _format_numeric_text(numeric, preferred_precision=precision)
    if not normalized_unit:
        return text
    if normalized_unit in {"%", ":1"}:
        return f"{text}{normalized_unit}"
    return f"{text} {normalized_unit}"


def _resolve_snapshot_midi_map(snapshot_detail: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(snapshot_detail, Mapping):
        return []

    controls = snapshot_detail.get("controls")
    if isinstance(controls, Mapping) and isinstance(controls.get("midi_map"), list):
        return [dict(entry) for entry in controls.get("midi_map", []) if isinstance(entry, Mapping)]

    if isinstance(snapshot_detail.get("midi_map"), list):
        return [dict(entry) for entry in snapshot_detail.get("midi_map", []) if isinstance(entry, Mapping)]
    return []


def build_snapshot_controller_display_preview(
    snapshot_detail: Mapping[str, Any] | None,
    commands: list[dict[str, Any]] | None,
    *,
    plugin_catalog: Mapping[str, Mapping[str, Any]] | None = None,
    max_slots: int | None = None,
) -> dict[str, Any]:
    """Plan deterministic controller-display slot previews for a snapshot payload."""

    assignment_payload = build_controller_display_assignments(
        commands or [],
        snapshot_midi_map_entries=_resolve_snapshot_midi_map(snapshot_detail),
        max_slots=max_slots,
    )
    snapshot_plugins = _collect_snapshot_plugins(snapshot_detail)
    catalog = {
        str(uri): dict(metadata)
        for uri, metadata in (plugin_catalog or build_controller_display_plugin_catalog()).items()
    }

    slots: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for assignment in assignment_payload.get("assignments", []):
        target_plugin_uri = str(assignment.get("target_plugin_uri") or "").strip()
        target_plugin_position = _coerce_int(assignment.get("target_plugin_position"))
        snapshot_plugin = _resolve_snapshot_plugin(
            snapshot_plugins,
            plugin_uri=target_plugin_uri,
            plugin_position=target_plugin_position,
        )

        display_label = str(
            assignment.get("label_override")
            or (snapshot_plugin or {}).get("name")
            or target_plugin_uri.rsplit("/", 1)[-1]
            or f"Slot {int(assignment.get('slot_number', 0) or 0)}"
        ).strip()

        if snapshot_plugin is None:
            unresolved.append(
                {
                    "slot_index": assignment.get("slot_index"),
                    "slot_number": assignment.get("slot_number"),
                    "command_id": assignment.get("command_id"),
                    "target_plugin_uri": target_plugin_uri,
                    "target_plugin_position": target_plugin_position,
                    "reason": "target_plugin_missing_in_snapshot",
                }
            )
            slots.append(
                {
                    **dict(assignment),
                    "display_label": display_label,
                    "summary_text": f"{display_label} - Unavailable",
                    "status_text": "Unavailable",
                    "slot_state": "unresolved",
                    "chain_id": None,
                    "chain_name": None,
                    "plugin_name": None,
                    "bypass": None,
                    "key_parameter": None,
                }
            )
            continue

        metadata = catalog.get(target_plugin_uri) or _fallback_catalog_entry(snapshot_plugin)
        key_parameter_metadata = metadata.get("key_parameter")
        if isinstance(key_parameter_metadata, Mapping):
            key_parameter = dict(key_parameter_metadata)
        else:
            key_parameter = None

        parameter_descriptor = (
            _find_parameter_descriptor(metadata, str(key_parameter.get("parameter_symbol") or "").strip())
            if key_parameter is not None
            else None
        )
        parameter_values = snapshot_plugin.get("parameters")
        current_value = None
        if key_parameter is not None and isinstance(parameter_values, Mapping):
            current_value = parameter_values.get(key_parameter.get("parameter_symbol"))
        if current_value is None and isinstance(parameter_descriptor, Mapping):
            current_value = parameter_descriptor.get("default")

        formatted_value = None
        if isinstance(parameter_descriptor, Mapping):
            formatted_value = _format_parameter_value(
                current_value,
                unit=str(parameter_descriptor.get("unit") or ""),
                is_toggled=bool(parameter_descriptor.get("is_toggled", False)),
            )
        else:
            formatted_value = _format_parameter_value(current_value, unit="", is_toggled=False)

        is_bypassed = bool(snapshot_plugin.get("bypass", False))
        if is_bypassed:
            status_text = "Bypassed"
            slot_state = "bypassed"
        elif key_parameter is not None and formatted_value:
            parameter_name = str(
                (parameter_descriptor or {}).get("name")
                or key_parameter.get("parameter_name")
                or key_parameter.get("parameter_symbol")
                or "Parameter"
            ).strip()
            status_text = f"{parameter_name} {formatted_value}".strip()
            slot_state = "active"
        else:
            status_text = "Active"
            slot_state = "active"

        resolved_key_parameter = None
        if key_parameter is not None:
            resolved_key_parameter = {
                **key_parameter,
                "unit": str((parameter_descriptor or {}).get("unit") or ""),
                "current_value": current_value,
                "formatted_value": formatted_value,
            }

        slots.append(
            {
                **dict(assignment),
                "display_label": display_label,
                "summary_text": f"{display_label} - {status_text}".strip(),
                "status_text": status_text,
                "slot_state": slot_state,
                "chain_id": snapshot_plugin.get("chain_id"),
                "chain_name": snapshot_plugin.get("chain_name"),
                "plugin_name": str(snapshot_plugin.get("name") or "").strip(),
                "bypass": is_bypassed,
                "key_parameter": resolved_key_parameter,
            }
        )

    return {
        "slots": slots,
        "assignments": assignment_payload.get("assignments", []),
        "conflicts": assignment_payload.get("conflicts", []),
        "skipped": assignment_payload.get("skipped", []),
        "label_map": assignment_payload.get("label_map", {}),
        "unresolved": unresolved,
    }
