"""
Runtime helpers for unified snapshots.

These helpers were originally embedded in the legacy flow snapshot route module.
They now live in a service module so snapshot activation/enrichment no longer
depends on deprecated HTTP route files.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, Optional

from app.services.chain_service import (
    _CABINET_IR_PLUGIN_URIS,
    _NAM_PLUGIN_URIS,
    _REVERB_IR_PLUGIN_URIS,
    _default_loader_state_for_plugin,
)
from app.services.juce_parameter_schema import is_fixed_native_processor_uri

logger = logging.getLogger(__name__)

_TEMPO_PARAMETER_SYMBOLS = {
    "tempo",
    "tempo_bpm",
    "bpm",
    "host_tempo",
}
_SYNC_PARAMETER_HINTS = (
    "tempo_sync",
    "sync_to_tempo",
    "beat_sync",
    "host_sync",
)


def snapshot_plugin_position(plugin: Dict[str, Any]) -> Optional[int]:
    raw_position = plugin.get("plugin_position", plugin.get("position"))
    try:
        position = int(raw_position)
    except (TypeError, ValueError):
        return None
    return position if position >= 0 else None


def snapshot_loader_state(plugin: Dict[str, Any]) -> Dict[str, Any]:
    loader_state = plugin.get("loader_state")
    return dict(loader_state) if isinstance(loader_state, dict) else {}


async def enrich_snapshot_data(snapshot_data: Dict[str, Any]) -> Dict[str, Any]:
    """Refresh plugin parameter snapshots from the running engine when available."""
    from app.routes.plugins import _discovered_plugins
    from app.services.juce_engine_service import get_audio_engine

    engine = get_audio_engine()
    if not engine.is_available or not engine.is_running:
        return snapshot_data

    for chain_data in snapshot_data.get("chains", {}).values():
        for plugin in chain_data.get("plugins", []):
            plugin_uri = plugin.get("uri", "")
            if not plugin_uri:
                continue
            plugin_position = snapshot_plugin_position(plugin)

            plugin_info = next(
                (item for item in _discovered_plugins if item["uri"] == plugin_uri),
                None,
            )
            if not plugin_info:
                continue

            param_values: Dict[str, float] = {}
            for idx, param in enumerate(plugin_info.get("parameters", [])):
                symbol = param.get("symbol", "")
                if not symbol:
                    continue
                try:
                    value = await engine.get_parameter(
                        plugin_uri,
                        symbol,
                        plugin_position=plugin_position,
                    )
                    param_values[str(idx)] = value
                except Exception as exc:
                    logger.debug("Could not get param %s for %s: %s", symbol, plugin_uri, exc)
            plugin["parameters"] = param_values

    return snapshot_data


async def apply_snapshot_to_engine(snapshot_data: Dict[str, Any]) -> tuple[int, int]:
    """Apply plugin parameter and bypass state to the engine."""
    from app.routes.plugins import _discovered_plugins
    from app.services.juce_engine_service import get_audio_engine

    engine = get_audio_engine()
    params_applied = 0
    bypass_applied = 0

    if not engine.is_available or not engine.is_running:
        return params_applied, bypass_applied

    for chain_data in snapshot_data.get("chains", {}).values():
        for plugin in chain_data.get("plugins", []):
            plugin_uri = plugin.get("uri", "")
            if not plugin_uri:
                continue
            plugin_position = snapshot_plugin_position(plugin)

            bypass = plugin.get("bypass", False)
            try:
                instance_id = engine._get_instance_id_for_uri(plugin_uri, plugin_position)
                loader_state = snapshot_loader_state(plugin)
                if plugin_uri in _NAM_PLUGIN_URIS and instance_id is not None:
                    defaults = _default_loader_state_for_plugin(plugin_uri)
                    model_path = loader_state.get("selected_asset_path")
                    if isinstance(model_path, str) and model_path.strip():
                        await engine.load_nam_model_instance(instance_id, model_path)
                    await engine.set_nam_input_gain_instance(
                        instance_id,
                        float(loader_state.get("input_gain", defaults.get("input_gain", 0.0)) or 0.0),
                    )
                    await engine.set_nam_output_gain_instance(
                        instance_id,
                        float(loader_state.get("output_gain", defaults.get("output_gain", 0.0)) or 0.0),
                    )
                    await engine.set_nam_normalize_instance(
                        instance_id,
                        bool(loader_state.get("normalize", defaults.get("normalize", True))),
                    )
                    await engine.set_nam_bypass_instance(
                        instance_id,
                        bool(loader_state.get("bypass", bypass)),
                    )
                    bypass_applied += 1
                elif (plugin_uri in _CABINET_IR_PLUGIN_URIS or plugin_uri in _REVERB_IR_PLUGIN_URIS) and instance_id is not None:
                    defaults = _default_loader_state_for_plugin(plugin_uri)
                    ir_path = loader_state.get("selected_asset_path")
                    if isinstance(ir_path, str) and ir_path.strip():
                        if plugin_uri in _CABINET_IR_PLUGIN_URIS:
                            await engine.load_cabinet_ir_instance(instance_id, ir_path)
                        else:
                            await engine.load_reverb_ir_instance(instance_id, ir_path)
                    await engine.set_ir_mix_instance(
                        instance_id,
                        float(loader_state.get("mix", defaults.get("mix", 100.0)) or defaults.get("mix", 100.0)),
                    )
                    await engine.set_ir_bypass_instance(
                        instance_id,
                        bool(loader_state.get("bypass", bypass)),
                    )
                    bypass_applied += 1
                elif is_fixed_native_processor_uri(plugin_uri):
                    await engine.set_parameter(
                        plugin_uri,
                        "bypass",
                        1.0 if bool(bypass) else 0.0,
                        plugin_position=plugin_position,
                    )
                    bypass_applied += 1
                elif instance_id is not None:
                    await engine.set_bypass(instance_id, bypass)
                    bypass_applied += 1
            except Exception as exc:
                logger.debug("Could not set bypass for %s: %s", plugin_uri, exc)

            params = plugin.get("parameters", {})
            if not params:
                continue

            plugin_info = next(
                (item for item in _discovered_plugins if item["uri"] == plugin_uri),
                None,
            )
            if not plugin_info:
                continue

            param_list = plugin_info.get("parameters", [])
            for idx_str, value in params.items():
                try:
                    idx = int(idx_str)
                    if idx < len(param_list):
                        symbol = param_list[idx].get("symbol", "")
                        if symbol:
                            await engine.set_parameter(
                                plugin_uri,
                                symbol,
                                value,
                                plugin_position=plugin_position,
                            )
                            params_applied += 1
                except (ValueError, IndexError, Exception) as exc:
                    logger.debug("Could not set param %s for %s: %s", idx_str, plugin_uri, exc)

    return params_applied, bypass_applied


def _parameter_lookup_keys(definition: Dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for raw_value in (definition.get("symbol"), definition.get("name")):
        if not isinstance(raw_value, str):
            continue
        normalized = raw_value.strip().lower().replace(" ", "_")
        if normalized:
            keys.add(normalized)
    return keys


def _is_tempo_parameter(definition: Dict[str, Any]) -> bool:
    keys = _parameter_lookup_keys(definition)
    return any(
        key in _TEMPO_PARAMETER_SYMBOLS
        or key.endswith("_tempo")
        or key.endswith("_bpm")
        for key in keys
    )


def _is_sync_parameter(definition: Dict[str, Any]) -> bool:
    keys = _parameter_lookup_keys(definition)
    return any(any(hint in key for hint in _SYNC_PARAMETER_HINTS) for key in keys)


def _coerce_snapshot_parameter_value(value: Any) -> Optional[float]:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def _snapshot_parameter_value(
    parameters: Dict[str, Any],
    *,
    index: int,
    definition: Dict[str, Any],
) -> Optional[float]:
    raw_candidates = [parameters.get(str(index)), parameters.get(index)]
    raw_candidates.extend(
        parameters.get(raw_key)
        for raw_key in (
            definition.get("symbol"),
            definition.get("name"),
        )
        if isinstance(raw_key, str) and raw_key
    )
    for candidate in raw_candidates:
        numeric = _coerce_snapshot_parameter_value(candidate)
        if numeric is not None:
            return numeric
    return None


async def apply_snapshot_tempo_to_engine(snapshot_data: Dict[str, Any], bpm: float) -> int:
    """Apply snapshot-scoped tempo to plugins that expose a dedicated BPM parameter."""
    from app.routes.plugins import _discovered_plugins
    from app.services.juce_engine_service import get_audio_engine

    engine = get_audio_engine()
    if not engine.is_available or not engine.is_running:
        return 0

    params_applied = 0
    discovered_by_uri = {
        str(item.get("uri")): item
        for item in _discovered_plugins
        if isinstance(item, dict) and item.get("uri")
    }

    for chain_data in snapshot_data.get("chains", {}).values():
        if not isinstance(chain_data, dict):
            continue
        for plugin in chain_data.get("plugins", []):
            if not isinstance(plugin, dict):
                continue
            plugin_uri = str(plugin.get("uri") or "")
            if not plugin_uri:
                continue

            plugin_info = discovered_by_uri.get(plugin_uri)
            if not plugin_info:
                continue

            param_defs = plugin_info.get("parameters", [])
            if not isinstance(param_defs, list) or len(param_defs) == 0:
                continue

            plugin_parameters = plugin.get("parameters", {})
            if not isinstance(plugin_parameters, dict):
                plugin_parameters = {}

            sync_indexes = [
                index
                for index, definition in enumerate(param_defs)
                if isinstance(definition, dict) and _is_sync_parameter(definition)
            ]
            sync_enabled = True
            if sync_indexes:
                sync_enabled = False
                for index in sync_indexes:
                    definition = param_defs[index]
                    current_value = _snapshot_parameter_value(
                        plugin_parameters,
                        index=index,
                        definition=definition,
                    )
                    if current_value is not None and current_value > 0.5:
                        sync_enabled = True
                        break

            if not sync_enabled:
                continue

            plugin_position = snapshot_plugin_position(plugin)
            for index, definition in enumerate(param_defs):
                if not isinstance(definition, dict) or not _is_tempo_parameter(definition):
                    continue
                symbol = str(definition.get("symbol") or "").strip()
                if not symbol:
                    continue
                try:
                    applied = await engine.set_parameter(
                        plugin_uri,
                        symbol,
                        float(bpm),
                        plugin_position=plugin_position,
                    )
                except Exception as exc:
                    logger.debug("Could not set tempo param %s for %s: %s", symbol, plugin_uri, exc)
                    continue
                if applied:
                    params_applied += 1

    return params_applied
