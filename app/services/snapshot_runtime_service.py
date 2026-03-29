"""
Runtime helpers for unified snapshots.

These helpers were originally embedded in the legacy flow snapshot route module.
They now live in a service module so snapshot activation/enrichment no longer
depends on deprecated HTTP route files.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.services.chain_service import (
    _CABINET_IR_PLUGIN_URIS,
    _NAM_PLUGIN_URIS,
    _REVERB_IR_PLUGIN_URIS,
    _default_loader_state_for_plugin,
)

logger = logging.getLogger(__name__)


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
                if instance_id is not None:
                    loader_state = snapshot_loader_state(plugin)
                    if plugin_uri in _NAM_PLUGIN_URIS:
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
                    elif plugin_uri in _CABINET_IR_PLUGIN_URIS or plugin_uri in _REVERB_IR_PLUGIN_URIS:
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
                    else:
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
