"""
Runtime helpers for unified snapshots.

These helpers were originally embedded in the legacy flow snapshot route module.
They now live in a service module so snapshot activation/enrichment no longer
depends on deprecated HTTP route files.
"""

from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional

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


def _ordered_runtime_paths(snapshot_detail: Dict[str, Any]) -> List[Dict[str, Any]]:
    live_state = snapshot_detail.get("live_state")
    if not isinstance(live_state, dict):
        return []

    runtime_paths = [
        dict(item)
        for item in live_state.get("paths", [])
        if isinstance(item, dict)
    ]
    if not runtime_paths:
        return []

    runtime_paths_by_id = {
        str(path.get("path_id") or ""): path
        for path in runtime_paths
        if str(path.get("path_id") or "")
    }
    routing = snapshot_detail.get("routing") if isinstance(snapshot_detail.get("routing"), dict) else {}
    ordered_ids = [
        str(path_id)
        for path_id in routing.get("series_order", [])
        if str(path_id or "")
    ]
    if ordered_ids:
        ordered_paths = [runtime_paths_by_id[path_id] for path_id in ordered_ids if path_id in runtime_paths_by_id]
        if ordered_paths:
            remaining_paths = [path for path in runtime_paths if path not in ordered_paths]
            return [*ordered_paths, *remaining_paths]
    return runtime_paths


def _parallel_blend_value(snapshot_detail: Dict[str, Any], ordered_paths: List[Dict[str, Any]]) -> float:
    routing = snapshot_detail.get("routing") if isinstance(snapshot_detail.get("routing"), dict) else {}
    blend_positions = routing.get("blend_positions")
    if not isinstance(blend_positions, dict) or len(ordered_paths) < 2:
        return 0.5

    first_path_id = str(ordered_paths[0].get("path_id") or "")
    second_path_id = str(ordered_paths[1].get("path_id") or "")
    first_value = float(blend_positions.get(first_path_id, 100.0) or 0.0)
    second_value = float(blend_positions.get(second_path_id, 100.0) or 0.0)
    total = first_value + second_value
    if total <= 0.0:
        return 0.5
    return max(0.0, min(1.0, second_value / total))


def _plugin_parameter_symbols(plugin_uri: str) -> Dict[int, str]:
    try:
        from app.routes.plugins import _discovered_plugins
    except Exception:
        return {}

    plugin_info = next(
        (item for item in _discovered_plugins if item.get("uri") == plugin_uri),
        None,
    )
    if not isinstance(plugin_info, dict):
        return {}

    symbols: Dict[int, str] = {}
    for index, parameter in enumerate(plugin_info.get("parameters", [])):
        if not isinstance(parameter, dict):
            continue
        symbol = str(parameter.get("symbol") or "").strip()
        if symbol:
            symbols[index] = symbol
    return symbols


async def _set_interpolated_parameter(
    engine: Any,
    *,
    plugin_uri: str,
    plugin_position: Optional[int],
    param_index: int,
    value: float,
) -> bool:
    symbols = _plugin_parameter_symbols(plugin_uri)
    symbol = symbols.get(param_index)
    if symbol:
        try:
            applied = await engine.set_parameter(
                plugin_uri,
                symbol,
                value,
                plugin_position=plugin_position,
            )
            return bool(applied)
        except TypeError:
            pass
        except Exception as exc:
            logger.debug(
                "Morph parameter apply failed for %s[%s] via symbol %s: %s",
                plugin_uri,
                plugin_position,
                symbol,
                exc,
            )

    resolver = getattr(engine, "_get_instance_id_for_uri", None)
    instance_id = None
    if callable(resolver):
        try:
            instance_id = resolver(plugin_uri, plugin_position)
        except Exception as exc:
            logger.debug("Morph resolver failed for %s[%s]: %s", plugin_uri, plugin_position, exc)
            instance_id = None

    try:
        applied = await engine.set_parameter(instance_id, param_index, value)
        return bool(applied)
    except TypeError:
        logger.debug(
            "Morph parameter apply fallback signature unsupported for %s[%s] index %s",
            plugin_uri,
            plugin_position,
            param_index,
        )
        return False
    except Exception as exc:
        logger.debug(
            "Morph parameter apply failed for %s[%s] index %s: %s",
            plugin_uri,
            plugin_position,
            param_index,
            exc,
        )
        return False


async def apply_snapshot_morph_to_engine(snapshot_detail: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.juce_engine_service import get_audio_engine

    engine = get_audio_engine()
    if engine is None or not hasattr(engine, "set_parameter"):
        return {
            "applied": False,
            "reason": "engine_unavailable",
            "plugin_count": 0,
            "applied_count": 0,
        }

    routing = snapshot_detail.get("routing") if isinstance(snapshot_detail.get("routing"), dict) else {}
    if str(routing.get("mode") or "") != "morph":
        return {
            "applied": False,
            "reason": "non_morph_mode",
            "plugin_count": 0,
            "applied_count": 0,
        }

    source_key = str(routing.get("morph_source_channel_key") or "").strip()
    target_key = str(routing.get("morph_target_channel_key") or "").strip()
    if not source_key or not target_key:
        return {
            "applied": False,
            "reason": "missing_morph_channels",
            "plugin_count": 0,
            "applied_count": 0,
        }

    morph_position = max(0.0, min(1.0, float(routing.get("morph_position", 0.5) or 0.0)))
    channels_by_key = {
        str(channel.get("channel_key") or ""): dict(channel)
        for channel in snapshot_detail.get("channels", [])
        if isinstance(channel, dict)
    }
    source_channel = channels_by_key.get(source_key)
    target_channel = channels_by_key.get(target_key)
    if not isinstance(source_channel, dict) or not isinstance(target_channel, dict):
        return {
            "applied": False,
            "reason": "channel_not_found",
            "plugin_count": 0,
            "applied_count": 0,
        }

    chains_by_id = {
        int(chain.get("id")): dict(chain)
        for chain in snapshot_detail.get("chains", [])
        if isinstance(chain, dict) and isinstance(chain.get("id"), int)
    }
    source_chain = chains_by_id.get(int(source_channel.get("chain_id") or 0))
    target_chain = chains_by_id.get(int(target_channel.get("chain_id") or 0))
    if not isinstance(source_chain, dict) or not isinstance(target_chain, dict):
        return {
            "applied": False,
            "reason": "chain_not_found",
            "plugin_count": 0,
            "applied_count": 0,
        }

    target_plugins = {
        (str(plugin.get("uri") or ""), snapshot_plugin_position(plugin)): dict(plugin)
        for plugin in target_chain.get("plugins", [])
        if isinstance(plugin, dict)
    }

    plugin_count = 0
    applied_count = 0
    for source_plugin in source_chain.get("plugins", []):
        if not isinstance(source_plugin, dict):
            continue
        plugin_uri = str(source_plugin.get("uri") or "")
        plugin_position = snapshot_plugin_position(source_plugin)
        target_plugin = target_plugins.get((plugin_uri, plugin_position))
        if not isinstance(target_plugin, dict):
            continue

        plugin_count += 1
        source_params = source_plugin.get("parameters") if isinstance(source_plugin.get("parameters"), dict) else {}
        target_params = target_plugin.get("parameters") if isinstance(target_plugin.get("parameters"), dict) else {}
        for param_index_str, source_value in source_params.items():
            if param_index_str not in target_params:
                continue
            try:
                param_index = int(param_index_str)
                source_float = float(source_value)
                target_float = float(target_params[param_index_str])
            except (TypeError, ValueError):
                continue
            blended = source_float + ((target_float - source_float) * morph_position)
            if await _set_interpolated_parameter(
                engine,
                plugin_uri=plugin_uri,
                plugin_position=plugin_position,
                param_index=param_index,
                value=blended,
            ):
                applied_count += 1

    return {
        "applied": applied_count > 0,
        "reason": "applied" if applied_count > 0 else "no_matching_parameters",
        "plugin_count": plugin_count,
        "applied_count": applied_count,
        "morph_position": morph_position,
    }


async def apply_snapshot_routing_to_engine(snapshot_detail: Dict[str, Any]) -> Dict[str, Any]:
    """Apply snapshot routing mode and branch blend to the JUCE parallel-group runtime."""
    from app.services.juce_engine_service import get_audio_engine

    engine = get_audio_engine()
    if engine is None:
        return {
            "applied": False,
            "reason": "engine_unavailable",
            "removed_group_count": 0,
            "created_group_id": None,
            "branch_count": 0,
        }

    if not getattr(engine, "is_available", True) or not getattr(engine, "is_running", True):
        return {
            "applied": False,
            "reason": "engine_not_running",
            "removed_group_count": 0,
            "created_group_id": None,
            "branch_count": 0,
        }

    try:
        existing_groups = await engine.get_parallel_groups()
    except Exception as exc:
        logger.debug("Could not query existing parallel groups: %s", exc)
        existing_groups = []

    removed_group_count = 0
    for group in existing_groups if isinstance(existing_groups, list) else []:
        group_id = group.get("group_id", group.get("id")) if isinstance(group, dict) else None
        try:
            parsed_group_id = int(group_id)
        except (TypeError, ValueError):
            continue
        try:
            if await engine.remove_parallel_group(parsed_group_id):
                removed_group_count += 1
        except Exception as exc:
            logger.debug("Could not remove parallel group %s: %s", parsed_group_id, exc)

    routing = snapshot_detail.get("routing") if isinstance(snapshot_detail.get("routing"), dict) else {}
    routing_mode = str(routing.get("mode") or "").strip().lower()
    if routing_mode != "parallel_blend":
        return {
            "applied": True,
            "reason": "non_parallel_mode",
            "removed_group_count": removed_group_count,
            "created_group_id": None,
            "branch_count": 0,
        }

    ordered_paths = _ordered_runtime_paths(snapshot_detail)
    runtime_chains = {
        int(chain.get("id")): chain
        for chain in snapshot_detail.get("live_state", {}).get("runtime_chains", [])
        if isinstance(chain, dict) and isinstance(chain.get("id"), int)
    }
    branch_plugins: List[List[Dict[str, Any]]] = []
    for path in ordered_paths:
        runtime_chain_id = path.get("runtime_chain_id")
        if not isinstance(runtime_chain_id, int):
            continue
        runtime_chain = runtime_chains.get(runtime_chain_id)
        if not isinstance(runtime_chain, dict):
            continue
        plugins = [
            dict(plugin)
            for plugin in runtime_chain.get("plugins", [])
            if isinstance(plugin, dict)
        ]
        plugins.sort(key=lambda plugin: int(plugin.get("position", 0)))
        resolved_plugins: List[Dict[str, Any]] = []
        for plugin in plugins:
            instance_id = plugin.get("instance_id")
            if not isinstance(instance_id, int):
                resolver = getattr(engine, "_get_instance_id_for_uri", None)
                if callable(resolver):
                    try:
                        instance_id = resolver(
                            str(plugin.get("uri") or ""),
                            snapshot_plugin_position(plugin),
                        )
                    except Exception as exc:
                        logger.debug("Could not resolve runtime instance for %s: %s", plugin.get("uri"), exc)
                        instance_id = None
            if isinstance(instance_id, int) and instance_id > 0:
                resolved_plugin = dict(plugin)
                resolved_plugin["instance_id"] = instance_id
                resolved_plugins.append(resolved_plugin)
        if resolved_plugins:
            branch_plugins.append(resolved_plugins)

    if len(branch_plugins) < 2:
        return {
            "applied": False,
            "reason": "insufficient_runtime_branches",
            "removed_group_count": removed_group_count,
            "created_group_id": None,
            "branch_count": len(branch_plugins),
        }

    group_id = await engine.create_parallel_group(position=-1, num_branches=len(branch_plugins))
    if not isinstance(group_id, int) or group_id < 0:
        return {
            "applied": False,
            "reason": "create_parallel_group_failed",
            "removed_group_count": removed_group_count,
            "created_group_id": None,
            "branch_count": len(branch_plugins),
        }

    added_plugin_count = 0
    for branch_index, plugins in enumerate(branch_plugins):
        for plugin in plugins:
            instance_id = int(plugin["instance_id"])
            position = int(plugin.get("position", -1))
            await engine.add_to_parallel_branch(group_id, branch_index, instance_id, position)
            added_plugin_count += 1

    blend_value = _parallel_blend_value(snapshot_detail, ordered_paths)
    await engine.set_parallel_ab_blend(group_id, blend_value)
    return {
        "applied": True,
        "reason": "parallel_blend_applied",
        "removed_group_count": removed_group_count,
        "created_group_id": group_id,
        "branch_count": len(branch_plugins),
        "added_plugin_count": added_plugin_count,
        "blend_value": blend_value,
    }


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
