"""
Signal Chain Service with Database Persistence
Manages signal chains with full CRUD operations and database storage.

REAL-TIME SAFETY:
- Database operations run in background via command queue
- Non-blocking API returns immediately
- State updates via lock-free mechanisms

Performance optimizations:
- Pre-populated plugin metadata cache for O(1) lookups
- Class-level shared cache across all instances
"""

import asyncio
import json
import logging
import os
import time
from collections import Counter, defaultdict, deque
from types import SimpleNamespace
from typing import List, Dict, Any, Optional, ClassVar
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from .command_queue import CommandQueue, CommandType
from .default_effects_manifest import load_default_effects_manifest
from app.services.plugin_loader_unified import get_plugin_loader
from app.services.snapshot_system_blocks import (
    NOISE_GATE_PLUGIN_URI,
    build_system_noise_gate_loader_state,
    build_system_noise_gate_parameters,
    chain_system_block_descriptor_for_plugin,
    default_chain_system_blocks,
    is_system_noise_gate_descriptor,
)

logger = logging.getLogger(__name__)

_ENABLE_ENGINE_CHAIN_DEPLOY = os.getenv("MAP2_ENABLE_ENGINE_CHAIN_DEPLOY", "true").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_CHAIN_DEPLOY_API_WARNING_EMITTED = False


def _warn_chain_deploy_api_once(missing_methods: List[str]) -> None:
    """Emit chain-deploy API incompatibility warning only once per process."""
    global _CHAIN_DEPLOY_API_WARNING_EMITTED
    if _CHAIN_DEPLOY_API_WARNING_EMITTED:
        return
    _CHAIN_DEPLOY_API_WARNING_EMITTED = True
    logger.warning(
        "Skipping JUCE chain deployment: engine missing required APIs (%s).",
        ", ".join(missing_methods),
    )


def _load_default_chain_templates() -> List[Dict[str, Any]]:
    """Load default chain templates from the canonical deployment manifest."""
    config = load_default_effects_manifest()
    return list(config.get("default_chains", []))


_NAM_PLUGIN_URIS = {"map2://juce/nam", "urn:map2:nam-player"}
_CABINET_IR_PLUGIN_URIS = {"map2://juce/convolution/cabinet", "urn:map2:ir-cabinet"}
_REVERB_IR_PLUGIN_URIS = {"map2://juce/convolution/reverb", "urn:map2:ir-reverb"}


def _default_loader_state_for_plugin(plugin_uri: str) -> Dict[str, Any]:
    if plugin_uri in _NAM_PLUGIN_URIS:
        return {
            "selected_asset_name": None,
            "selected_asset_path": None,
            "input_gain": 0.0,
            "output_gain": 0.0,
            "normalize": True,
            "bypass": False,
        }
    if plugin_uri in _CABINET_IR_PLUGIN_URIS:
        return {
            "selected_asset_name": None,
            "selected_asset_path": None,
            "mix": 100.0,
            "bypass": False,
            "ir_type": "cabinet",
        }
    if plugin_uri in _REVERB_IR_PLUGIN_URIS:
        return {
            "selected_asset_name": None,
            "selected_asset_path": None,
            "mix": 30.0,
            "bypass": False,
            "ir_type": "reverb",
        }
    return {}


class ChainService:
    """Service for managing signal chains with RT-safe database operations.

    Uses command queue to decouple database I/O from request handling.
    All database operations are async and non-blocking.

    Performance features:
    - Pre-populated plugin metadata cache for O(1) lookups
    - Class-level shared cache to avoid redundant initialization
    """

    # Class-level cache shared across all instances
    _plugin_meta_cache: ClassVar[Dict[str, Dict[str, Any]]] = {}
    _cache_initialized: ClassVar[bool] = False
    _cache_init_time: ClassVar[float] = 0

    def __init__(self, session: Optional[AsyncSession] = None):
        """Initialize chain service with optional database session."""
        self.session = session
        self.command_queue = CommandQueue(max_size=100)
        # In-memory cache for fast reads
        self._chain_cache: Dict[int, Dict[str, Any]] = {}

        # Initialize class-level plugin cache if not already done
        if not ChainService._cache_initialized:
            self._initialize_plugin_cache()

    @classmethod
    def _initialize_plugin_cache(cls) -> None:
        """
        Pre-populate the plugin metadata cache for O(1) lookups.

        This runs once per application lifecycle and populates the
        class-level cache with all available plugin metadata.
        """
        start_time = time.time()
        loader = get_plugin_loader()

        if not loader:
            logger.warning("Plugin loader not available for cache initialization")
            return

        try:
            # Use the loader's internal plugin dict for direct access
            if hasattr(loader, 'plugins') and isinstance(loader.plugins, dict):
                for uri, plugin_data in loader.plugins.items():
                    if isinstance(plugin_data, dict):
                        cls._plugin_meta_cache[uri] = {
                            "name": plugin_data.get("name", uri.split("/")[-1]),
                            "author": plugin_data.get("author", ""),
                            "category": plugin_data.get("category", ""),
                            "in_port_count": plugin_data.get("audio_inputs", 2),
                            "out_port_count": plugin_data.get("audio_outputs", 2),
                        }
                    else:
                        # Object-style plugin
                        cls._plugin_meta_cache[uri] = {
                            "name": getattr(plugin_data, "name", uri.split("/")[-1]),
                            "author": getattr(plugin_data, "author", ""),
                            "category": getattr(plugin_data, "category", ""),
                            "in_port_count": getattr(plugin_data, "in_port_count", 2),
                            "out_port_count": getattr(plugin_data, "out_port_count", 2),
                        }

            # Add NAM plugin to cache
            try:
                from app.services.nam_processor import NAM_AVAILABLE
                if NAM_AVAILABLE:
                    cls._plugin_meta_cache["urn:map2:nam-player"] = {
                        "name": "Neural Amp Modeler",
                        "author": "Shapeoko",
                        "category": "Amplifier",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_nam_plugin": True
                    }
                    logger.info("Added NAM plugin to metadata cache")
            except Exception as e:
                logger.debug(f"Failed to add NAM to cache: {e}")

            # Add IR plugins to cache
            try:
                from app.services.ir_processor import IRProcessor
                if IRProcessor:
                    # Cabinet IR
                    cls._plugin_meta_cache["urn:map2:ir-cabinet"] = {
                        "name": "Cabinet IR",
                        "author": "MAP2 Audio",
                        "category": "Amplifier",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_ir_plugin": True,
                        "ir_type": "cabinet"
                    }
                    # Reverb IR
                    cls._plugin_meta_cache["urn:map2:ir-reverb"] = {
                        "name": "Reverb IR",
                        "author": "MAP2 Audio",
                        "category": "Reverb",
                        "in_port_count": 1,
                        "out_port_count": 1,
                        "is_ir_plugin": True,
                        "ir_type": "reverb"
                    }
                    logger.info("Added IR plugins to metadata cache")
            except Exception as e:
                logger.debug(f"Failed to add IR plugins to cache: {e}")

            cls._cache_initialized = True
            cls._cache_init_time = time.time() - start_time

            logger.info(
                f"Plugin metadata cache initialized with {len(cls._plugin_meta_cache)} "
                f"plugins in {cls._cache_init_time * 1000:.1f}ms"
            )

        except Exception as e:
            logger.warning(f"Failed to initialize plugin cache: {e}")

    @classmethod
    def invalidate_cache(cls) -> None:
        """Invalidate the plugin metadata cache."""
        cls._plugin_meta_cache.clear()
        cls._cache_initialized = False
        logger.info("Plugin metadata cache invalidated")

    def _get_plugin_metadata(self, plugin_uri: str) -> Dict[str, Any]:
        """
        Lookup plugin metadata (name, ports) with O(1) cache access.

        Falls back to on-demand lookup if not in cache.

        Args:
            plugin_uri: Plugin URI

        Returns:
            Plugin metadata dict
        """
        # Fast path: cache hit
        if plugin_uri in self._plugin_meta_cache:
            return self._plugin_meta_cache[plugin_uri]

        # Slow path: try direct lookup from loader
        loader = get_plugin_loader()
        if not loader:
            return {}

        try:
            # Try the new O(1) lookup method if available
            if hasattr(loader, 'get_plugin_by_uri'):
                plugin = loader.get_plugin_by_uri(plugin_uri)
                if plugin:
                    meta = {
                        "name": plugin.get("name", plugin_uri.split("/")[-1]),
                        "author": plugin.get("author", ""),
                        "category": plugin.get("category", ""),
                        "in_port_count": plugin.get("audio_inputs", 2),
                        "out_port_count": plugin.get("audio_outputs", 2),
                    }
                    self._plugin_meta_cache[plugin_uri] = meta
                    return meta

            # Fallback: check loader's plugins dict directly
            if hasattr(loader, 'plugins') and plugin_uri in loader.plugins:
                plugin_data = loader.plugins[plugin_uri]
                if isinstance(plugin_data, dict):
                    meta = {
                        "name": plugin_data.get("name", plugin_uri.split("/")[-1]),
                        "author": plugin_data.get("author", ""),
                        "category": plugin_data.get("category", ""),
                        "in_port_count": plugin_data.get("audio_inputs", 2),
                        "out_port_count": plugin_data.get("audio_outputs", 2),
                    }
                    self._plugin_meta_cache[plugin_uri] = meta
                    return meta

        except Exception as e:
            logger.debug(f"Plugin lookup failed for {plugin_uri}: {e}")

        return {}

    @staticmethod
    def _serialize_effects_loop(loop: Any) -> Dict[str, Any]:
        return {
            "loop_id": loop.loop_id,
            "name": loop.name,
            "channels": loop.channels,
            "topology": loop.topology,
            "tesira_device_id": loop.tesira_device_id,
            "template_id": loop.template_id,
            "send_endpoint_id": loop.send_endpoint_id,
            "return_endpoint_id": loop.return_endpoint_id,
            "state_desired": loop.state_desired,
            "state_actual": loop.state_actual,
            "health_status": loop.health_status,
            "health_reason": loop.health_reason,
            "target_added_latency_ms": loop.target_added_latency_ms,
            "measured_added_latency_ms": loop.measured_added_latency_ms,
            "compensation_samples": loop.compensation_samples,
            "calibration_status": loop.calibration_status,
            "created_at": loop.created_at.isoformat() if loop.created_at else None,
            "updated_at": loop.updated_at.isoformat() if loop.updated_at else None,
        }

    @staticmethod
    def _serialize_loop_insertion(insertion: Any) -> Dict[str, Any]:
        return {
            "insertion_id": insertion.insertion_id,
            "chain_id": insertion.chain_id,
            "loop_id": insertion.loop_id,
            "slot_index": insertion.slot_index,
            "enabled": insertion.enabled,
            "mode": insertion.mode,
            "blend_pct": insertion.blend_pct,
            "send_gain_db": insertion.send_gain_db,
            "return_gain_db": insertion.return_gain_db,
            "crossfade_ms": insertion.crossfade_ms,
            "band_split_hz": insertion.band_split_hz or [],
            "created_at": insertion.created_at.isoformat() if insertion.created_at else None,
            "updated_at": insertion.updated_at.isoformat() if insertion.updated_at else None,
        }

    @staticmethod
    def _runtime_item_position(item: Dict[str, Any], fallback_index: int) -> Optional[int]:
        for key in ("position", "chain_position", "plugin_position", "slot_index", "order", "index"):
            raw = item.get(key)
            try:
                position = int(raw)
            except (TypeError, ValueError):
                continue
            if position >= 0:
                return position
        return fallback_index if fallback_index >= 0 else None

    @staticmethod
    def _runtime_item_latency_samples(item: Dict[str, Any]) -> Optional[int]:
        for key in ("latency_samples", "reported_latency_samples", "latency"):
            raw = item.get(key)
            try:
                latency = int(raw)
            except (TypeError, ValueError):
                continue
            if latency >= 0:
                return latency
        return None

    @classmethod
    def _match_runtime_plugin_items(
        cls,
        chain_plugins: List[Any],
        pedalboard_items: List[Dict[str, Any]],
    ) -> Dict[int, Dict[str, Any]]:
        """Best-effort match DB chain plugins to live engine items."""
        matches: Dict[int, Dict[str, Any]] = {}
        remaining_items: List[tuple[int, Dict[str, Any]]] = [
            (index, item)
            for index, item in enumerate(pedalboard_items or [])
            if isinstance(item, dict)
        ]

        for plugin in sorted(chain_plugins, key=lambda entry: int(getattr(entry, "position", 0))):
            plugin_uri = str(getattr(plugin, "plugin_uri", ""))
            plugin_position = int(getattr(plugin, "position", -1))
            matched_index: Optional[int] = None

            for index, (fallback_index, item) in enumerate(remaining_items):
                if item.get("uri") != plugin_uri:
                    continue
                item_position = cls._runtime_item_position(item, fallback_index)
                if item_position == plugin_position:
                    matched_index = index
                    break

            if matched_index is None:
                for index, (fallback_index, item) in enumerate(remaining_items):
                    if item.get("uri") != plugin_uri:
                        continue
                    if fallback_index == plugin_position:
                        matched_index = index
                        break

            if matched_index is None:
                for index, (_fallback_index, item) in enumerate(remaining_items):
                    if item.get("uri") == plugin_uri:
                        matched_index = index
                        break

            if matched_index is None:
                continue

            _fallback_index, matched_item = remaining_items.pop(matched_index)
            matches[plugin_position] = matched_item

        return matches

    @staticmethod
    def _resolve_reorder_chain_plugins(
        chain_plugins: List[Any],
        plugin_order: List[Any],
    ) -> Optional[List[Any]]:
        if not plugin_order or len(plugin_order) != len(chain_plugins):
            return None

        ordered_chain_plugins = sorted(chain_plugins, key=lambda entry: int(getattr(entry, "position", 0)))

        if all(isinstance(item, dict) for item in plugin_order):
            plugins_by_position = {
                int(getattr(plugin, "position", -1)): plugin
                for plugin in ordered_chain_plugins
            }
            seen_positions: set[int] = set()
            resolved: List[Any] = []

            for raw in plugin_order:
                plugin_uri = str(raw.get("plugin_uri") or raw.get("uri") or "").strip()
                if not plugin_uri:
                    return None

                try:
                    plugin_position = int(raw.get("plugin_position", raw.get("position")))
                except (TypeError, ValueError):
                    return None

                if plugin_position < 0 or plugin_position in seen_positions:
                    return None

                plugin = plugins_by_position.get(plugin_position)
                if plugin is None or str(getattr(plugin, "plugin_uri", "")) != plugin_uri:
                    return None

                seen_positions.add(plugin_position)
                resolved.append(plugin)

            return resolved

        if all(isinstance(item, str) for item in plugin_order):
            normalized_uris = [str(item).strip() for item in plugin_order]
            if any(not uri for uri in normalized_uris):
                return None

            current_counts = Counter(str(getattr(plugin, "plugin_uri", "")) for plugin in ordered_chain_plugins)
            requested_counts = Counter(normalized_uris)
            if requested_counts != current_counts:
                return None

            plugins_by_uri: dict[str, deque[Any]] = defaultdict(deque)
            for plugin in ordered_chain_plugins:
                plugins_by_uri[str(getattr(plugin, "plugin_uri", ""))].append(plugin)

            resolved = []
            for plugin_uri in normalized_uris:
                bucket = plugins_by_uri.get(plugin_uri)
                if not bucket:
                    return None
                resolved.append(bucket.popleft())

            return resolved

        return None

    async def _get_runtime_plugin_match_map(self, chain_plugins: List[Any]) -> Dict[int, Dict[str, Any]]:
        if not chain_plugins:
            return {}

        try:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            if not engine_service or not engine_service.is_available or not engine_service.is_running:
                return {}

            pedalboard = await engine_service.get_current_pedalboard()
            if not isinstance(pedalboard, dict):
                return {}

            items = pedalboard.get("items", [])
            if not isinstance(items, list):
                return {}

            return self._match_runtime_plugin_items(chain_plugins, items)
        except Exception as e:
            logger.debug(f"Unable to resolve runtime chain plugin identities: {e}")
            return {}

    @staticmethod
    def _chain_plugin_loader_state(plugin: Any) -> Optional[Dict[str, Any]]:
        plugin_uri = getattr(plugin, "plugin_uri", None)
        if not isinstance(plugin_uri, str):
            return None

        defaults = _default_loader_state_for_plugin(plugin_uri)
        if not defaults:
            return None

        if plugin_uri in _NAM_PLUGIN_URIS:
            return {
                "selected_model": getattr(plugin, "selected_asset_name", None),
                "selected_asset_name": getattr(plugin, "selected_asset_name", None),
                "selected_asset_path": getattr(plugin, "selected_asset_path", None),
                "input_gain": float(getattr(plugin, "nam_input_gain", defaults["input_gain"]) or 0.0),
                "output_gain": float(getattr(plugin, "nam_output_gain", defaults["output_gain"]) or 0.0),
                "normalize": bool(
                    defaults["normalize"]
                    if getattr(plugin, "nam_normalize", None) is None
                    else getattr(plugin, "nam_normalize")
                ),
                "bypass": bool(getattr(plugin, "bypass", defaults["bypass"])),
            }

        return {
            "selected_ir": getattr(plugin, "selected_asset_name", None),
            "selected_asset_name": getattr(plugin, "selected_asset_name", None),
            "selected_asset_path": getattr(plugin, "selected_asset_path", None),
            "mix": float(
                defaults["mix"]
                if getattr(plugin, "ir_mix", None) is None
                else getattr(plugin, "ir_mix")
            ),
            "bypass": bool(getattr(plugin, "bypass", defaults["bypass"])),
            "ir_type": defaults["ir_type"],
        }

    @staticmethod
    def _chain_plugin_loader_columns(plugin_uri: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = payload or {}
        defaults = _default_loader_state_for_plugin(plugin_uri)
        if not defaults:
            return {}

        selected_asset_name = (
            payload.get("selected_asset_name")
            or payload.get("selected_model")
            or payload.get("selected_ir")
        )

        columns: Dict[str, Any] = {
            "selected_asset_name": selected_asset_name,
            "selected_asset_path": payload.get("selected_asset_path"),
        }

        if plugin_uri in _NAM_PLUGIN_URIS:
            columns.update(
                {
                    "nam_input_gain": float(payload.get("input_gain", defaults["input_gain"]) or 0.0),
                    "nam_output_gain": float(payload.get("output_gain", defaults["output_gain"]) or 0.0),
                    "nam_normalize": bool(payload.get("normalize", defaults["normalize"])),
                }
            )
        else:
            columns["ir_mix"] = float(payload.get("mix", defaults["mix"]) or defaults["mix"])

        return columns

    def _serialize_chain_plugin_entry(
        self,
        plugin: Any,
        runtime_item: Optional[Dict[str, Any]] = None,
        system_blocks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        plugin_uri = str(plugin.plugin_uri)
        plugin_position = int(plugin.position)
        system_descriptor = chain_system_block_descriptor_for_plugin(
            system_blocks,
            plugin_uri=plugin_uri,
            plugin_position=plugin_position,
        )
        meta = self._get_plugin_metadata(plugin.plugin_uri)
        payload: Dict[str, Any] = {
            "uri": plugin_uri,
            "name": meta.get("name", plugin.plugin_uri),
            "author": meta.get("author", ""),
            "category": meta.get("category", ""),
            "position": plugin_position,
            "bypassed": plugin.bypass,
            "in_ports": meta.get("in_port_count", 0),
            "out_ports": meta.get("out_port_count", 0),
            "parameters": (
                build_system_noise_gate_parameters()
                if is_system_noise_gate_descriptor(system_descriptor)
                else {}
            ),
        }

        if isinstance(runtime_item, dict):
            instance_id = runtime_item.get("instance_id")
            if isinstance(instance_id, int) and instance_id > 0:
                payload["instance_id"] = instance_id

            latency_samples = self._runtime_item_latency_samples(runtime_item)
            if latency_samples is not None:
                payload["latency_samples"] = latency_samples

        loader_state = self._chain_plugin_loader_state(plugin)
        if is_system_noise_gate_descriptor(system_descriptor):
            payload["loader_state"] = build_system_noise_gate_loader_state(loader_state)
        elif loader_state is not None:
            payload["loader_state"] = loader_state

        return payload

    @staticmethod
    def _parse_chain_config(raw_config: Any) -> Dict[str, Any]:
        if isinstance(raw_config, dict):
            return dict(raw_config)
        if isinstance(raw_config, str) and raw_config.strip():
            try:
                parsed = json.loads(raw_config)
            except Exception:
                return {}
            return parsed if isinstance(parsed, dict) else {}
        return {}

    @classmethod
    def _build_runtime_sync_payload(
        cls,
        *,
        enabled: bool,
        status: str,
        reason: Optional[str] = None,
        warnings: Optional[List[str]] = None,
        runtime_items: int = 0,
        restored_positions: Optional[List[int]] = None,
        missing_positions: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "enabled": bool(enabled),
            "status": status,
            "runtime_items": int(runtime_items),
            "warnings": list(warnings or []),
            "restored_positions": list(restored_positions or []),
            "missing_positions": list(missing_positions or []),
        }
        if reason:
            payload["reason"] = reason
        return payload

    async def _apply_persisted_loader_state(self, engine_service: Any, chain_plugin: Any, instance_id: int) -> List[str]:
        warnings: List[str] = []
        plugin_uri = getattr(chain_plugin, "plugin_uri", "")

        if plugin_uri in _NAM_PLUGIN_URIS:
            model_path = getattr(chain_plugin, "selected_asset_path", None)
            if isinstance(model_path, str) and model_path.strip():
                loaded = await engine_service.load_nam_model_instance(instance_id, model_path)
                if not loaded:
                    warnings.append(f"Failed to load NAM model for position {chain_plugin.position}")
            await engine_service.set_nam_input_gain_instance(instance_id, float(chain_plugin.nam_input_gain or 0.0))
            await engine_service.set_nam_output_gain_instance(instance_id, float(chain_plugin.nam_output_gain or 0.0))
            await engine_service.set_nam_normalize_instance(
                instance_id,
                True if chain_plugin.nam_normalize is None else bool(chain_plugin.nam_normalize),
            )
            await engine_service.set_nam_bypass_instance(instance_id, bool(chain_plugin.bypass))
            return warnings

        if plugin_uri in _CABINET_IR_PLUGIN_URIS:
            ir_path = getattr(chain_plugin, "selected_asset_path", None)
            if isinstance(ir_path, str) and ir_path.strip():
                loaded = await engine_service.load_cabinet_ir_instance(instance_id, ir_path)
                if not loaded:
                    warnings.append(f"Failed to load cabinet IR for position {chain_plugin.position}")
            await engine_service.set_ir_mix_instance(
                instance_id,
                100.0 if chain_plugin.ir_mix is None else float(chain_plugin.ir_mix),
            )
            await engine_service.set_ir_bypass_instance(instance_id, bool(chain_plugin.bypass))
            return warnings

        if plugin_uri in _REVERB_IR_PLUGIN_URIS:
            ir_path = getattr(chain_plugin, "selected_asset_path", None)
            if isinstance(ir_path, str) and ir_path.strip():
                loaded = await engine_service.load_reverb_ir_instance(instance_id, ir_path)
                if not loaded:
                    warnings.append(f"Failed to load reverb IR for position {chain_plugin.position}")
            await engine_service.set_ir_mix_instance(
                instance_id,
                30.0 if chain_plugin.ir_mix is None else float(chain_plugin.ir_mix),
            )
            await engine_service.set_ir_bypass_instance(instance_id, bool(chain_plugin.bypass))
            return warnings

        return warnings

    @staticmethod
    def _runtime_instance_id(payload: Dict[str, Any]) -> Optional[int]:
        raw_value = payload.get("instance_id", payload.get("id"))
        try:
            instance_id = int(raw_value)
        except (TypeError, ValueError):
            return None
        return instance_id if instance_id > 0 else None

    async def _stage_runtime_chain_instances(
        self,
        engine_service: Any,
        chain_plugins: List[Any],
        *,
        allow_active_reuse: bool = True,
    ) -> tuple[List[tuple[Any, int]], List[str]]:
        loaded_plugins = await engine_service.get_loaded_plugins()
        pedalboard = await engine_service.get_current_pedalboard()

        active_instance_ids = {
            instance_id
            for item in pedalboard.get("items", []) if isinstance(item, dict)
            for instance_id in [self._runtime_instance_id(item)]
            if instance_id is not None
        }
        active_by_uri: Dict[str, deque[int]] = defaultdict(deque)
        for item in pedalboard.get("items", []):
            if not isinstance(item, dict):
                continue
            instance_id = self._runtime_instance_id(item)
            plugin_uri = str(item.get("uri") or "")
            if instance_id is None or not plugin_uri:
                continue
            active_by_uri[plugin_uri].append(instance_id)

        detached_by_uri: Dict[str, deque[int]] = defaultdict(deque)
        for plugin in loaded_plugins:
            if not isinstance(plugin, dict):
                continue
            instance_id = self._runtime_instance_id(plugin)
            plugin_uri = str(plugin.get("uri") or "")
            if instance_id is None or not plugin_uri or instance_id in active_instance_ids:
                continue
            detached_by_uri[plugin_uri].append(instance_id)

        staged_instances: List[tuple[Any, int]] = []
        warnings: List[str] = []

        for chain_plugin in chain_plugins:
            plugin_uri = str(getattr(chain_plugin, "plugin_uri", "") or "")
            if not plugin_uri:
                warnings.append(f"Missing plugin URI at position {chain_plugin.position}")
                continue

            instance_id: Optional[int] = None
            reused_active_instance = False
            bucket = detached_by_uri.get(plugin_uri)
            if bucket:
                instance_id = bucket.popleft()
            if instance_id is None and allow_active_reuse:
                active_bucket = active_by_uri.get(plugin_uri)
                if active_bucket:
                    instance_id = active_bucket.popleft()
                    reused_active_instance = True

            if instance_id is None:
                instance_id = await engine_service.load_plugin(plugin_uri)
                if instance_id < 0:
                    warnings.append(f"Failed to load plugin {plugin_uri} at position {chain_plugin.position}")
                    continue

            if not reused_active_instance and not await engine_service.prewarm_plugin_node(instance_id):
                warnings.append(f"Failed to prewarm plugin {plugin_uri} at position {chain_plugin.position}")

            warnings.extend(await self._apply_persisted_loader_state(engine_service, chain_plugin, instance_id))
            staged_instances.append((chain_plugin, instance_id))

        return staged_instances, warnings

    @classmethod
    def build_detached_stage_plugin(
        cls,
        *,
        plugin_uri: str,
        position: int,
        bypass: bool = False,
        loader_state: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Build a lightweight plugin object for detached preload staging."""
        normalized_uri = str(plugin_uri or "").strip()
        payload = (
            dict(loader_state)
            if isinstance(loader_state, dict)
            else {}
        )
        return SimpleNamespace(
            plugin_uri=normalized_uri,
            position=int(position),
            bypass=bool(bypass),
            **cls._chain_plugin_loader_columns(normalized_uri, payload),
        )

    async def stage_detached_chain_plugins(self, chain_plugins: List[Any]) -> Dict[str, Any]:
        """Load and prewarm plugins without mutating the live pedalboard topology."""
        if not _ENABLE_ENGINE_CHAIN_DEPLOY:
            return self._build_runtime_sync_payload(
                enabled=False,
                status="capability_gap",
                reason="engine_chain_deploy_disabled",
                warnings=["MAP2_ENABLE_ENGINE_CHAIN_DEPLOY is disabled"],
            ) | {"staged_instance_ids": []}

        try:
            from app.services.juce_engine_service import JuceEngineService

            engine_service = JuceEngineService.get_instance()
        except Exception as e:
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_service_unavailable",
                warnings=[f"JUCE engine service unavailable: {e}"],
            ) | {"staged_instance_ids": []}

        engine = getattr(engine_service, "_engine", None) if engine_service else None
        if engine is None:
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_not_initialized",
                warnings=["JUCE engine is not initialized"],
            ) | {"staged_instance_ids": []}

        required_methods = [
            "get_loaded_plugins",
            "prewarm_plugin_node",
        ]
        missing_methods = [
            method
            for method in required_methods
            if not hasattr(engine_service, method)
        ]
        if missing_methods:
            _warn_chain_deploy_api_once(missing_methods)
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_missing_chain_apis",
                warnings=[f"Engine missing required preload APIs: {', '.join(missing_methods)}"],
            ) | {"staged_instance_ids": []}

        staged_instances, warnings = await self._stage_runtime_chain_instances(
            engine_service,
            list(chain_plugins or []),
            allow_active_reuse=False,
        )
        staged_instance_ids = [instance_id for _, instance_id in staged_instances]
        staged_positions = [
            int(getattr(chain_plugin, "position", 0))
            for chain_plugin, _ in staged_instances
        ]
        return self._build_runtime_sync_payload(
            enabled=True,
            status="ready",
            warnings=warnings,
            runtime_items=0,
            restored_positions=staged_positions,
            missing_positions=[],
        ) | {"staged_instance_ids": staged_instance_ids}

    async def release_detached_instance_ids(self, instance_ids: List[int]) -> Dict[str, Any]:
        """Unload detached preloaded instances while leaving active topology intact."""
        normalized_ids = []
        for raw_value in instance_ids or []:
            try:
                instance_id = int(raw_value)
            except (TypeError, ValueError):
                continue
            if instance_id > 0 and instance_id not in normalized_ids:
                normalized_ids.append(instance_id)

        if not normalized_ids:
            return {
                "released_instance_ids": [],
                "skipped_active_instance_ids": [],
                "missing_instance_ids": [],
                "warnings": [],
            }

        try:
            from app.services.juce_engine_service import JuceEngineService

            engine_service = JuceEngineService.get_instance()
        except Exception as e:
            return {
                "released_instance_ids": [],
                "skipped_active_instance_ids": [],
                "missing_instance_ids": normalized_ids,
                "warnings": [f"JUCE engine service unavailable: {e}"],
            }

        if not hasattr(engine_service, "get_current_pedalboard") or not hasattr(engine_service, "unload_plugin"):
            return {
                "released_instance_ids": [],
                "skipped_active_instance_ids": [],
                "missing_instance_ids": normalized_ids,
                "warnings": ["Engine missing detached-release APIs"],
            }

        pedalboard = await engine_service.get_current_pedalboard()
        active_instance_ids = {
            instance_id
            for item in (pedalboard.get("items", []) if isinstance(pedalboard, dict) else [])
            if isinstance(item, dict)
            for instance_id in [self._runtime_instance_id(item)]
            if instance_id is not None
        }

        loaded_plugins = (
            await engine_service.get_loaded_plugins()
            if hasattr(engine_service, "get_loaded_plugins")
            else []
        )
        loaded_instance_ids = {
            instance_id
            for item in loaded_plugins if isinstance(item, dict)
            for instance_id in [self._runtime_instance_id(item)]
            if instance_id is not None
        }

        released_instance_ids: list[int] = []
        skipped_active_instance_ids: list[int] = []
        missing_instance_ids: list[int] = []
        warnings: list[str] = []

        for instance_id in normalized_ids:
            if instance_id in active_instance_ids:
                skipped_active_instance_ids.append(instance_id)
                continue
            if instance_id not in loaded_instance_ids:
                missing_instance_ids.append(instance_id)
                continue
            try:
                released = await engine_service.unload_plugin(instance_id)
            except Exception as exc:
                warnings.append(f"Failed to unload detached instance {instance_id}: {exc}")
                continue
            if released:
                released_instance_ids.append(instance_id)
            else:
                warnings.append(f"Engine rejected detached unload for instance {instance_id}")

        return {
            "released_instance_ids": released_instance_ids,
            "skipped_active_instance_ids": skipped_active_instance_ids,
            "missing_instance_ids": missing_instance_ids,
            "warnings": warnings,
        }

    async def _deploy_chain_to_engine(
        self,
        chain_plugins: List[Any],
        *,
        enable_snapshot_spillover: bool = False,
    ) -> Dict[str, Any]:
        if not _ENABLE_ENGINE_CHAIN_DEPLOY:
            return self._build_runtime_sync_payload(
                enabled=False,
                status="capability_gap",
                reason="engine_chain_deploy_disabled",
                warnings=["MAP2_ENABLE_ENGINE_CHAIN_DEPLOY is disabled"],
            )

        try:
            from app.services.juce_engine_service import JuceEngineService

            engine_service = JuceEngineService.get_instance()
        except Exception as e:
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_service_unavailable",
                warnings=[f"JUCE engine service unavailable: {e}"],
            )

        engine = getattr(engine_service, "_engine", None) if engine_service else None
        if engine is None:
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_not_initialized",
                warnings=["JUCE engine is not initialized"],
            )

        required_methods = [
            "get_current_pedalboard",
            "get_loaded_plugins",
            "prewarm_plugin_node",
        ]
        if hasattr(engine, "replace_chain"):
            required_methods.append("replace_chain")
        else:
            required_methods.extend(("clear_chain", "add_to_chain"))

        missing_methods = [
            method
            for method in required_methods
            if not hasattr(engine, method)
        ]
        if missing_methods:
            _warn_chain_deploy_api_once(missing_methods)
            return self._build_runtime_sync_payload(
                enabled=True,
                status="capability_gap",
                reason="engine_missing_chain_apis",
                warnings=[f"Engine missing required APIs: {', '.join(missing_methods)}"],
            )

        staged_instances, warnings = await self._stage_runtime_chain_instances(engine_service, chain_plugins)

        ordered_staged_instances = sorted(
            staged_instances,
            key=lambda pair: int(getattr(pair[0], "position", 0)),
        )
        restored_positions = [int(chain_plugin.position) for chain_plugin, _ in ordered_staged_instances]
        ordered_instance_ids = [instance_id for _, instance_id in ordered_staged_instances]

        replace_chain = getattr(engine_service, "replace_chain", None) if hasattr(engine, "replace_chain") else None
        replace_chain_with_spillover = (
            getattr(engine_service, "replace_chain_with_spillover", None)
            if hasattr(engine, "replace_chain_with_spillover")
            else None
        )
        replaced_in_one_call = False
        if enable_snapshot_spillover and callable(replace_chain_with_spillover):
            replaced_in_one_call = bool(await replace_chain_with_spillover(ordered_instance_ids))
            if not replaced_in_one_call and ordered_instance_ids:
                warnings.append(
                    "Engine replace_chain_with_spillover returned false; falling back to clear/add runtime rebuild"
                )
        elif callable(replace_chain):
            replaced_in_one_call = bool(await replace_chain(ordered_instance_ids))
            if not replaced_in_one_call and ordered_instance_ids:
                warnings.append("Engine replace_chain returned false; falling back to clear/add runtime rebuild")

        if not replaced_in_one_call:
            restored_positions = []
            begin_topology_update = getattr(engine, "begin_topology_update", None)
            end_topology_update = getattr(engine, "end_topology_update", None)
            topology_batch_started = False

            if callable(begin_topology_update):
                await asyncio.to_thread(begin_topology_update)
                topology_batch_started = True

            try:
                await engine_service.clear_chain()

                for chain_plugin, instance_id in ordered_staged_instances:
                    await asyncio.to_thread(engine.add_to_chain, instance_id, chain_plugin.position)
                    restored_positions.append(int(chain_plugin.position))
            finally:
                if topology_batch_started and callable(end_topology_update):
                    await asyncio.to_thread(end_topology_update)

        pedalboard = await engine_service.get_current_pedalboard()
        runtime_items = pedalboard.get("items", []) if isinstance(pedalboard, dict) else []
        runtime_map = self._match_runtime_plugin_items(
            chain_plugins,
            runtime_items if isinstance(runtime_items, list) else [],
        )
        missing_positions = [
            int(chain_plugin.position)
            for chain_plugin in chain_plugins
            if int(chain_plugin.position) not in runtime_map
        ]

        status = "active"
        reason = None
        if missing_positions:
            status = "partial"
            reason = "runtime_identity_incomplete"

        return self._build_runtime_sync_payload(
            enabled=True,
            status=status,
            reason=reason,
            warnings=warnings,
            runtime_items=len(runtime_items) if isinstance(runtime_items, list) else 0,
            restored_positions=restored_positions,
            missing_positions=missing_positions,
        )

    @staticmethod
    def _touchscreen_config_key(chain_id: int) -> str:
        return f"chain_touchscreen_{chain_id}"

    @staticmethod
    def _normalize_touchscreen_stomp_assignments(assignments: List[Dict[str, Any]] | None) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        seen_slots: set[int] = set()
        for raw in assignments or []:
            if not isinstance(raw, dict):
                continue

            try:
                slot = int(raw.get("slot"))
                plugin_position = int(raw.get("plugin_position"))
            except (TypeError, ValueError):
                continue

            plugin_uri = raw.get("plugin_uri")
            if slot < 1 or slot > 8 or slot in seen_slots:
                continue
            if not isinstance(plugin_uri, str) or not plugin_uri.strip():
                continue

            normalized.append(
                {
                    "slot": slot,
                    "plugin_uri": plugin_uri.strip(),
                    "plugin_position": plugin_position,
                }
            )
            seen_slots.add(slot)

        normalized.sort(key=lambda assignment: assignment["slot"])
        return normalized

    async def _load_touchscreen_stomp_assignments(self, chain_id: int) -> List[Dict[str, Any]]:
        if not self.session:
            return []

        from app.database import SystemConfig

        result = await self.session.execute(
            select(SystemConfig).filter(SystemConfig.key == self._touchscreen_config_key(chain_id))
        )
        record = result.scalar_one_or_none()
        if not record:
            return []

        try:
            payload = json.loads(record.value)
        except Exception:
            return []

        if isinstance(payload, dict):
            assignments = payload.get("stomp_assignments", [])
        elif isinstance(payload, list):
            assignments = payload
        else:
            assignments = []

        return self._normalize_touchscreen_stomp_assignments(assignments)

    async def get_touchscreen_state(self, chain_id: int) -> Optional[Dict[str, Any]]:
        if not self.session:
            return None

        from app.database import Chain

        result = await self.session.execute(select(Chain).filter(Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if not chain:
            return None

        assignments = await self._load_touchscreen_stomp_assignments(chain_id)
        return {
            "chain_id": chain_id,
            "stomp_assignments": assignments,
        }

    async def set_touchscreen_stomp_assignments(
        self,
        chain_id: int,
        assignments: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not self.session:
            return None

        from app.database import Chain, ChainPlugin, SystemConfig

        chain_result = await self.session.execute(select(Chain).filter(Chain.id == chain_id))
        chain = chain_result.scalar_one_or_none()
        if not chain:
            return None

        plugin_result = await self.session.execute(
            select(ChainPlugin)
            .filter(ChainPlugin.chain_id == chain_id)
            .order_by(ChainPlugin.position)
        )
        valid_plugins = {
            (plugin.plugin_uri, int(plugin.position))
            for plugin in plugin_result.scalars().all()
        }

        normalized = self._normalize_touchscreen_stomp_assignments(assignments)
        persisted = [
            assignment
            for assignment in normalized
            if (assignment["plugin_uri"], assignment["plugin_position"]) in valid_plugins
        ]

        payload = {
            "version": 1,
            "chain_id": chain_id,
            "stomp_assignments": persisted,
        }
        config_key = self._touchscreen_config_key(chain_id)
        config_result = await self.session.execute(
            select(SystemConfig).filter(SystemConfig.key == config_key)
        )
        record = config_result.scalar_one_or_none()
        if record is None:
            record = SystemConfig(key=config_key, value=json.dumps(payload))
            self.session.add(record)
        else:
            record.value = json.dumps(payload)

        await self.session.flush()
        return {
            "chain_id": chain_id,
            "stomp_assignments": persisted,
        }

    async def create_chain(self, name: str) -> Optional[Dict[str, Any]]:
        """Create a new signal chain.
        
        Args:
            name: Chain name (1-256 characters)
            
        Returns:
            Chain dict with id, name, is_active, plugins, or None on error
        """
        try:
            if not name or len(name) > 256:
                logger.error(f"Invalid chain name: {name}")
                return None
            
            from app.database import Chain

            chain = Chain(
                name=name,
                is_active=False,
                config=json.dumps({"system_blocks": default_chain_system_blocks()}),
            )
            if self.session:
                self.session.add(chain)
                await self.session.flush()
                await self.session.refresh(chain)
                # Note: commit is handled by route's get_session context manager

            from app.database import ChainPlugin

            self.session.add(
                ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri=NOISE_GATE_PLUGIN_URI,
                    position=0,
                    bypass=False,
                )
            )
            await self.session.flush()

            return await self.get_chain(chain.id)
        except Exception as e:
            logger.error(f"Error creating chain: {e}")
            return None

    async def get_chain(self, chain_id: int) -> Optional[Dict[str, Any]]:
        """Get chain details by ID.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            Chain dict or None if not found
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, EffectsLoop, EffectsLoopInsertion
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return None
            chain_config = self._parse_chain_config(chain.config)
            system_blocks = chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else []
            
            # Get plugins in chain
            plugins_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            plugins = plugins_result.scalars().all()
            runtime_plugin_map = await self._get_runtime_plugin_match_map(plugins) if chain.is_active else {}
            
            # Build plugins list with single metadata lookup per plugin
            plugins_list = []
            for p in plugins:
                plugins_list.append(
                    self._serialize_chain_plugin_entry(
                        p,
                        runtime_plugin_map.get(int(p.position)),
                        system_blocks,
                    )
                )

            insertion_result = await self.session.execute(
                select(EffectsLoopInsertion)
                .filter(EffectsLoopInsertion.chain_id == chain_id)
                .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
            )
            insertions = list(insertion_result.scalars().all())
            loop_ids = sorted({ins.loop_id for ins in insertions if ins.loop_id})

            effects_loops: Dict[str, Dict[str, Any]] = {}
            if loop_ids:
                loops_result = await self.session.execute(
                    select(EffectsLoop).filter(EffectsLoop.loop_id.in_(loop_ids))
                )
                for loop in loops_result.scalars().all():
                    effects_loops[loop.loop_id] = self._serialize_effects_loop(loop)

            return {
                "id": chain.id,
                "name": chain.name,
                "is_active": chain.is_active,
                "plugins": plugins_list,
                "plugin_count": len(plugins_list),
                "loop_insertions": [self._serialize_loop_insertion(ins) for ins in insertions],
                "effects_loops": [effects_loops[loop_id] for loop_id in loop_ids if loop_id in effects_loops],
                "touchscreen": {
                    "stomp_assignments": await self._load_touchscreen_stomp_assignments(chain_id),
                },
                "runtime_sync": chain_config.get("runtime_sync"),
                "created_at": chain.created_at.isoformat() if chain.created_at else None,
                "updated_at": chain.updated_at.isoformat() if chain.updated_at else None
            }
        except Exception as e:
            logger.error(f"Error getting chain {chain_id}: {e}")
            return None

    async def list_chains(self) -> List[Dict[str, Any]]:
        """List all signal chains with their plugins.

        Returns:
            List of chain dicts with plugins array
        """
        try:
            if not self.session:
                return []

            from app.database import Chain, ChainPlugin, EffectsLoop, EffectsLoopInsertion

            # Get all chains
            result = await self.session.execute(select(Chain))
            chains = result.scalars().all()

            chains_list = []
            for chain in chains:
                chain_config = self._parse_chain_config(chain.config)
                system_blocks = chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else []
                # Get plugins for this chain
                plugins_result = await self.session.execute(
                    select(ChainPlugin)
                    .filter(ChainPlugin.chain_id == chain.id)
                    .order_by(ChainPlugin.position)
                )
                plugins = plugins_result.scalars().all()
                runtime_plugin_map = await self._get_runtime_plugin_match_map(plugins) if chain.is_active else {}

                chain_data = {
                    "id": chain.id,
                    "name": chain.name,
                    "is_active": chain.is_active,
                    "plugins": [],
                    "loop_insertions": [],
                    "effects_loops": [],
                    "plugin_count": len(plugins),
                    "runtime_sync": chain_config.get("runtime_sync"),
                    "created_at": chain.created_at.isoformat() if chain.created_at else None
                }

                for p in plugins:
                    chain_data["plugins"].append(
                        self._serialize_chain_plugin_entry(
                            p,
                            runtime_plugin_map.get(int(p.position)),
                            system_blocks,
                        )
                    )

                insertion_result = await self.session.execute(
                    select(EffectsLoopInsertion)
                    .filter(EffectsLoopInsertion.chain_id == chain.id)
                    .order_by(EffectsLoopInsertion.slot_index.asc(), EffectsLoopInsertion.id.asc())
                )
                insertions = list(insertion_result.scalars().all())
                chain_data["loop_insertions"] = [self._serialize_loop_insertion(ins) for ins in insertions]

                loop_ids = sorted({ins.loop_id for ins in insertions if ins.loop_id})
                if loop_ids:
                    loops_result = await self.session.execute(
                        select(EffectsLoop).filter(EffectsLoop.loop_id.in_(loop_ids))
                    )
                    loop_map = {loop.loop_id: self._serialize_effects_loop(loop) for loop in loops_result.scalars().all()}
                    chain_data["effects_loops"] = [loop_map[loop_id] for loop_id in loop_ids if loop_id in loop_map]

                chains_list.append(chain_data)

            return chains_list
        except Exception as e:
            logger.error(f"Error listing chains: {e}")
            return []

    async def delete_chain(self, chain_id: int) -> bool:
        """Delete a chain by ID.

        Args:
            chain_id: Chain ID

        Returns:
            True if deleted, False otherwise
        """
        try:
            if not self.session:
                return False

            from app.database import Chain, PluginPerformanceLog

            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()

            if not chain:
                return False

            # Delete related performance logs first (FK constraint workaround for existing DBs)
            await self.session.execute(
                delete(PluginPerformanceLog).where(PluginPerformanceLog.chain_id == chain_id)
            )

            # Delete and commit immediately (don't just flush)
            await self.session.delete(chain)
            await self.session.commit()

            # Verify deletion persisted
            verify_result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if verify_result.scalar_one_or_none() is not None:
                logger.error(f"Chain {chain_id} still exists after delete+commit!")
                return False

            logger.info(f"Chain {chain_id} deleted and verified")
            return True
        except Exception as e:
            logger.error(f"Error deleting chain {chain_id}: {e}")
            return False

    def _is_instrument_plugin(self, plugin_uri: str) -> bool:
        """Check if a plugin is an instrument (0 audio inputs, generates audio)."""
        meta = self._get_plugin_metadata(plugin_uri)
        return meta.get("in_port_count", 2) == 0

    async def add_plugin_to_chain(self, chain_id: int, plugin_uri: str) -> bool:
        """Add plugin to chain.

        Instruments (0 audio inputs) are auto-placed at position 0 (chain head)
        with existing plugins shifted right. Effects are appended at the end.

        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
        Returns:
            True if added, False otherwise
        """
        try:
            logger.debug(f"Adding plugin {plugin_uri} to chain {chain_id}")
            if not self.session:
                logger.error("No database session available")
                return False
            from app.database import Chain, ChainPlugin
            # Verify chain exists
            logger.debug(f"Checking if chain {chain_id} exists")
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            if not chain:
                logger.warning(f"Chain {chain_id} not found in database")
                return False
            logger.debug(f"Chain {chain_id} found: {chain.name}")
            chain_config = self._parse_chain_config(chain.config)
            system_blocks = chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else []
            has_system_noise_gate = any(is_system_noise_gate_descriptor(descriptor) for descriptor in system_blocks)

            is_instrument = self._is_instrument_plugin(plugin_uri)

            if is_instrument:
                # Instruments normally go at position 0, but the system gate remains fixed at the head.
                existing = await self.session.execute(
                    select(ChainPlugin)
                    .filter(ChainPlugin.chain_id == chain_id)
                    .order_by(ChainPlugin.position.asc())
                )
                insert_position = 1 if has_system_noise_gate else 0
                for plugin in existing.scalars().all():
                    if plugin.position >= insert_position:
                        plugin.position += 1
                logger.debug(
                    "Instrument detected — inserting at position %s while preserving the system gate at the head",
                    insert_position,
                )
            else:
                # Effects append at end
                pos_result = await self.session.execute(
                    select(ChainPlugin)
                    .filter(ChainPlugin.chain_id == chain_id)
                    .order_by(ChainPlugin.position.desc())
                )
                last_plugin = pos_result.scalars().first()
                insert_position = (last_plugin.position + 1) if last_plugin else 0

            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                position=insert_position,
                bypass=False,
                **self._chain_plugin_loader_columns(plugin_uri),
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            logger.info(f"Successfully added {'instrument' if is_instrument else 'effect'} {plugin_uri} to chain {chain_id} at position {insert_position}")
            return True
        except Exception as e:
            logger.error(f"Error adding plugin {plugin_uri} to chain {chain_id}: {e}", exc_info=True)
            return False

    async def _add_nam_to_chain(self, chain_id: int) -> bool:
        """Add NAM plugin to chain.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if added, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Verify chain exists
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if not result.scalar_one_or_none():
                logger.warning(f"Chain {chain_id} not found")
                return False
            
            # NAM service integration is optional; default to generic model label.
            active_model = "default"
            
            # Get max position
            pos_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position.desc())
            )
            last_plugin = pos_result.scalars().first()
            next_position = (last_plugin.position + 1) if last_plugin else 0
            
            # Add NAM plugin
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri="urn:map2:nam-player",
                position=next_position,
                bypass=False,
                **self._chain_plugin_loader_columns("urn:map2:nam-player"),
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            
            logger.info(f"Added NAM plugin to chain {chain_id} at position {next_position} with model '{active_model}'")
            
            # Publish event
            try:
                from .event_publisher import event_publisher, EventType
                await event_publisher.publish(
                    EventType.CHAIN_UPDATED,
                    {
                        "chain_id": chain_id,
                        "action": "plugin_added",
                        "plugin_uri": "urn:map2:nam-player",
                        "nam_model": active_model
                    }
                )
            except Exception as e:
                logger.debug(f"Failed to publish event: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding NAM to chain {chain_id}: {e}")
            return False

    async def _add_ir_to_chain(self, chain_id: int, ir_type: str) -> bool:
        """Add IR plugin to chain (cabinet or reverb).
        
        Args:
            chain_id: Chain ID
            ir_type: Type of IR ('cabinet' or 'reverb')
            
        Returns:
            True if added, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Verify chain exists
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            if not result.scalar_one_or_none():
                logger.warning(f"Chain {chain_id} not found")
                return False
            
            if ir_type == "cabinet":
                active_ir = "default"
                plugin_uri = "urn:map2:ir-cabinet"
            else:
                active_ir = "default"
                plugin_uri = "urn:map2:ir-reverb"
            
            # Get max position
            pos_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position.desc())
            )
            last_plugin = pos_result.scalars().first()
            next_position = (last_plugin.position + 1) if last_plugin else 0
            
            # Add IR plugin
            chain_plugin = ChainPlugin(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                position=next_position,
                bypass=False,
                **self._chain_plugin_loader_columns(plugin_uri),
            )
            self.session.add(chain_plugin)
            await self.session.flush()
            
            logger.info(f"Added {ir_type} IR plugin to chain {chain_id} at position {next_position} with IR '{active_ir}'")
            
            # Publish event
            try:
                from .event_publisher import event_publisher, EventType
                await event_publisher.publish(
                    EventType.CHAIN_UPDATED,
                    {
                        "chain_id": chain_id,
                        "action": "plugin_added",
                        "plugin_uri": plugin_uri,
                        "ir_type": ir_type,
                        "active_ir": active_ir
                    }
                )
            except Exception as e:
                logger.debug(f"Failed to publish event: {e}")
            
            return True
        except Exception as e:
            logger.error(f"Error adding {ir_type} IR to chain {chain_id}: {e}")
            return False

    async def remove_plugin_from_chain(
        self,
        chain_id: int,
        plugin_uri: str,
        plugin_position: Optional[int] = None,
    ) -> bool:
        """Remove plugin from chain.
        
        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            
        Returns:
            True if removed, False otherwise
        """
        try:
            if not self.session:
                logger.error("REMOVE_PLUGIN: No session available!")
                return False
            
            from app.database import Chain, ChainPlugin
            from sqlalchemy import delete

            logger.info(
                "REMOVE_PLUGIN: deleting %s from chain %s (position=%s)",
                plugin_uri,
                chain_id,
                plugin_position,
            )

            chain_result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = chain_result.scalar_one_or_none()
            if chain is None:
                logger.error("REMOVE_PLUGIN: chain %s not found", chain_id)
                return False
            chain_config = self._parse_chain_config(chain.config)
            system_blocks = chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else []

            filters = [
                ChainPlugin.chain_id == chain_id,
                ChainPlugin.plugin_uri == plugin_uri,
            ]
            if plugin_position is not None:
                filters.append(ChainPlugin.position == plugin_position)

            count_result = await self.session.execute(
                select(ChainPlugin).filter(*filters)
            )
            matching_plugins = count_result.scalars().all()

            if not matching_plugins:
                logger.error("REMOVE_PLUGIN: plugin not found in chain %s", chain_id)
                return False

            for plugin in matching_plugins:
                descriptor = chain_system_block_descriptor_for_plugin(
                    system_blocks,
                    plugin_uri=str(plugin.plugin_uri),
                    plugin_position=int(plugin.position),
                )
                if is_system_noise_gate_descriptor(descriptor):
                    logger.warning("REMOVE_PLUGIN: refused to remove system noise gate from chain %s", chain_id)
                    return False

            delete_stmt = delete(ChainPlugin).where(*filters)
            result = await self.session.execute(delete_stmt)
            deleted_count = result.rowcount if (result.rowcount or 0) > 0 else len(matching_plugins)
            if deleted_count == 0:
                logger.error("REMOVE_PLUGIN: delete returned 0 rows for chain %s", chain_id)
                return False

            await self.session.flush()
            logger.info(
                "REMOVE_PLUGIN: removed %s row(s) for %s from chain %s",
                deleted_count,
                plugin_uri,
                chain_id,
            )
            return True
            
        except Exception as e:
            logger.error(f"REMOVE_PLUGIN: Exception during removal: {e}", exc_info=True)
            return False

    async def activate_chain(self, chain_id: int) -> bool:
        """Activate a chain and deploy it to the JUCE audio engine.
        
        FIX #8: Bridge layer connecting SQLite chains to JUCE engine graph
        This method now:
        1. Updates chain metadata in database (is_active = True)
        2. Retrieves all plugins in the chain from the database
        3. Deploys each plugin to the JUCE audio engine
        4. Sets up the signal chain in the engine
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if activated and deployed, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Get the chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            # Mark as active in database
            chain.is_active = True
            await self.session.flush()
            
            # FIX #8: Get all plugins in this chain from the database
            plugins_result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            chain_plugins = plugins_result.scalars().all()
            chain_config = self._parse_chain_config(chain.config)
            runtime_sync = await self._deploy_chain_to_engine(
                chain_plugins,
                enable_snapshot_spillover=(
                    isinstance(chain_config, dict)
                    and chain_config.get("source_kind") == "snapshot_path"
                ),
            )
            chain_config["runtime_sync"] = runtime_sync
            chain.config = json.dumps(chain_config)
            await self.session.flush()

            snapshot_id: int | None = None
            if (
                isinstance(chain_config, dict)
                and chain_config.get("source_kind") == "snapshot_path"
                and chain_config.get("snapshot_id") is not None
            ):
                try:
                    snapshot_id = int(chain_config["snapshot_id"])
                except (TypeError, ValueError):
                    snapshot_id = None

                if snapshot_id is not None:
                    try:
                        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

                        runtime_state_service = SnapshotRuntimeStateService(self.session)
                        current_payload = await runtime_state_service.get_live_snapshot_payload()
                        if isinstance(current_payload, dict) and int(current_payload.get("id") or 0) == snapshot_id:
                            current_live_state = (
                                dict(current_payload.get("live_state"))
                                if isinstance(current_payload.get("live_state"), dict)
                                else {}
                            )
                            activated_at = current_live_state.get("activated_at")
                            path_id = chain_config.get("path_id")
                            runtime_paths = [
                                dict(item)
                                for item in current_live_state.get("paths", [])
                                if isinstance(item, dict)
                            ]
                            found = False
                            for item in runtime_paths:
                                if item.get("runtime_chain_id") == chain_id or (
                                    path_id is not None and str(item.get("path_id")) == str(path_id)
                                ):
                                    item.update(
                                        {
                                            "path_id": path_id,
                                            "snapshot_chain_id": chain_config.get("snapshot_chain_id"),
                                            "runtime_chain_id": chain_id,
                                            "runtime_chain_name": chain.name,
                                            "activation_status": (
                                                runtime_sync.get("status")
                                                if isinstance(runtime_sync, dict)
                                                else "active"
                                            ),
                                        }
                                    )
                                    found = True
                                    break
                            if not found:
                                runtime_paths.append(
                                    {
                                        "path_id": path_id,
                                        "snapshot_chain_id": chain_config.get("snapshot_chain_id"),
                                        "runtime_chain_id": chain_id,
                                        "runtime_chain_name": chain.name,
                                        "activation_status": (
                                            runtime_sync.get("status")
                                            if isinstance(runtime_sync, dict)
                                            else "active"
                                        ),
                                    }
                                )

                            active_runtime_chains = []
                            for runtime_path in runtime_paths:
                                runtime_chain_id = runtime_path.get("runtime_chain_id")
                                if runtime_chain_id is None:
                                    continue
                                runtime_chain = await self.get_chain(int(runtime_chain_id))
                                if runtime_chain is not None:
                                    active_runtime_chains.append(runtime_chain)

                            await runtime_state_service.sync_live_snapshot_paths(
                                snapshot_id=snapshot_id,
                                snapshot_live_state_payload={
                                    "activated_at": activated_at,
                                    "paths": runtime_paths,
                                },
                                runtime_chains=active_runtime_chains,
                            )

                            from app.services.snapshot_service import SnapshotService

                            snapshot_detail = await SnapshotService(self.session).get_snapshot(snapshot_id)
                            if snapshot_detail is not None:
                                await runtime_state_service.sync_live_snapshot_payload(
                                    snapshot_id=snapshot_id,
                                    live_snapshot_payload=snapshot_detail,
                                    snapshot_revision=snapshot_detail.get("snapshot_revision"),
                                )
                    except Exception as exc:
                        logger.debug("Snapshot runtime live-state sync after chain activation failed: %s", exc)
            
            logger.info(f"Activated chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error activating chain {chain_id}: {e}")
            return False

    async def deactivate_chain(self, chain_id: int) -> bool:
        """Deactivate a chain.
        
        Args:
            chain_id: Chain ID
            
        Returns:
            True if deactivated, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False

            chain_config = self._parse_chain_config(chain.config)
            runtime_sync = chain_config.get("runtime_sync") if isinstance(chain_config, dict) else None
            chain.is_active = False
            snapshot_id: int | None = None

            if not isinstance(chain_config, dict):
                chain_config = {}
            chain_config["runtime_sync"] = self._build_runtime_sync_payload(
                enabled=bool(runtime_sync.get("enabled", True)) if isinstance(runtime_sync, dict) else True,
                status="inactive",
                reason="chain_deactivated",
                runtime_items=int(runtime_sync.get("runtime_items", 0)) if isinstance(runtime_sync, dict) else 0,
                restored_positions=list(runtime_sync.get("restored_positions") or []) if isinstance(runtime_sync, dict) else [],
                missing_positions=list(runtime_sync.get("missing_positions") or []) if isinstance(runtime_sync, dict) else [],
            )
            chain.config = json.dumps(chain_config)

            if (
                chain_config.get("source_kind") == "snapshot_path"
                and chain_config.get("snapshot_id") is not None
            ):
                try:
                    snapshot_id = int(chain_config["snapshot_id"])
                except (TypeError, ValueError):
                    snapshot_id = None

            await self.session.flush()

            if snapshot_id is not None:
                try:
                    from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

                    runtime_state_service = SnapshotRuntimeStateService(self.session)
                    current_payload = await runtime_state_service.get_live_snapshot_payload()
                    if isinstance(current_payload, dict) and int(current_payload.get("id") or 0) == snapshot_id:
                        current_live_state = (
                            dict(current_payload.get("live_state"))
                            if isinstance(current_payload.get("live_state"), dict)
                            else {}
                        )
                        path_id = chain_config.get("path_id")
                        runtime_paths = [
                            dict(item)
                            for item in current_live_state.get("paths", [])
                            if isinstance(item, dict)
                        ]
                        runtime_paths = [
                            item
                            for item in runtime_paths
                            if not (
                                item.get("runtime_chain_id") == chain_id
                                or (
                                    path_id is not None
                                    and str(item.get("path_id")) == str(path_id)
                                )
                            )
                        ]

                        active_runtime_chains = []
                        for runtime_path in runtime_paths:
                            runtime_chain_id = runtime_path.get("runtime_chain_id")
                            if runtime_chain_id is None:
                                continue
                            runtime_chain = await self.get_chain(int(runtime_chain_id))
                            if runtime_chain is not None:
                                active_runtime_chains.append(runtime_chain)

                        await runtime_state_service.sync_live_snapshot_paths(
                            snapshot_id=snapshot_id,
                            snapshot_live_state_payload={
                                "activated_at": current_live_state.get("activated_at"),
                                "paths": runtime_paths,
                            },
                            runtime_chains=active_runtime_chains,
                        )
                except Exception as exc:
                    logger.debug("Snapshot runtime live-state sync after chain deactivation failed: %s", exc)
            
            logger.info(f"Deactivated chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error deactivating chain {chain_id}: {e}")
            return False

    async def rename_chain(self, chain_id: int, new_name: str) -> bool:
        """Rename a signal chain.
        
        Args:
            chain_id: Chain ID
            new_name: New name for the chain
            
        Returns:
            True if renamed, False otherwise
        """
        try:
            if not self.session or not new_name or len(new_name) > 256:
                return False
            
            from app.database import Chain
            
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            
            chain.name = new_name
            await self.session.flush()
            
            logger.info(f"Renamed chain {chain_id} to '{new_name}'")
            return True
        except Exception as e:
            logger.error(f"Error renaming chain {chain_id}: {e}")
            return False

    async def reorder_plugins(self, chain_id: int, plugin_order: List[Any]) -> bool:
        """Reorder plugins in a chain.
        
        Args:
            chain_id: Chain ID
            plugin_order: Ordered list of plugin URIs or plugin refs
            
        Returns:
            True if reordered, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import Chain, ChainPlugin
            
            # Get chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return False
            chain_config = self._parse_chain_config(chain.config)
            system_blocks = chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else []
            
            # Get existing chain plugins
            result = await self.session.execute(
                select(ChainPlugin).filter(ChainPlugin.chain_id == chain_id)
            )
            chain_plugins = result.scalars().all()
            
            resolved_order = self._resolve_reorder_chain_plugins(chain_plugins, plugin_order)
            if resolved_order is None:
                logger.error("Plugin reorder mismatch for chain %s", chain_id)
                return False

            system_noise_gate = next(
                (
                    plugin
                    for plugin in chain_plugins
                    if is_system_noise_gate_descriptor(
                        chain_system_block_descriptor_for_plugin(
                            system_blocks,
                            plugin_uri=str(plugin.plugin_uri),
                            plugin_position=int(plugin.position),
                        )
                    )
                ),
                None,
            )
            if system_noise_gate is not None and (not resolved_order or resolved_order[0].id != system_noise_gate.id):
                logger.warning(
                    "Refused reorder that moves the system noise gate away from the head of chain %s",
                    chain_id,
                )
                return False

            # Update positions
            for position, chain_plugin in enumerate(resolved_order):
                chain_plugin.position = position
            
            await self.session.flush()

            logger.info(f"Reordered plugins in chain {chain_id}")
            return True
        except Exception as e:
            logger.error(f"Error reordering plugins in chain {chain_id}: {e}")
            return False

    async def set_plugin_bypass(
        self,
        chain_id: int,
        plugin_uri: str,
        bypass: bool,
        plugin_position: Optional[int] = None,
    ) -> bool:
        """Set plugin bypass state in a chain.
        
        Args:
            chain_id: Chain ID
            plugin_uri: Plugin URI
            bypass: True to bypass, False to enable
            plugin_position: Optional plugin position to disambiguate duplicate URIs
            
        Returns:
            True if updated, False otherwise
        """
        try:
            if not self.session:
                return False
            
            from app.database import ChainPlugin
            
            query = select(ChainPlugin).filter(
                ChainPlugin.chain_id == chain_id,
                ChainPlugin.plugin_uri == plugin_uri,
            )
            if plugin_position is not None:
                query = query.filter(ChainPlugin.position == plugin_position)
            query = query.order_by(ChainPlugin.position.asc())

            result = await self.session.execute(query)
            chain_plugin = result.scalars().first()
            
            if not chain_plugin:
                return False
            
            chain_plugin.bypass = bypass
            await self.session.flush()

            try:
                from app.services.juce_engine_service import JuceEngineService
                from app.services.juce_parameter_schema import is_fixed_native_processor_uri

                engine_service = JuceEngineService.get_instance()
                plugin_position_value = (
                    int(plugin_position)
                    if plugin_position is not None
                    else int(getattr(chain_plugin, "position", 0))
                )

                if plugin_uri in _NAM_PLUGIN_URIS:
                    instance_id = engine_service._get_instance_id_for_uri(plugin_uri, plugin_position_value)
                    if isinstance(instance_id, int) and instance_id > 0:
                        await engine_service.set_nam_bypass_instance(instance_id, bool(bypass))
                elif plugin_uri in _CABINET_IR_PLUGIN_URIS or plugin_uri in _REVERB_IR_PLUGIN_URIS:
                    instance_id = engine_service._get_instance_id_for_uri(plugin_uri, plugin_position_value)
                    if isinstance(instance_id, int) and instance_id > 0:
                        await engine_service.set_ir_bypass_instance(instance_id, bool(bypass))
                elif is_fixed_native_processor_uri(plugin_uri):
                    await engine_service.set_parameter(
                        plugin_uri,
                        "bypass",
                        1.0 if bool(bypass) else 0.0,
                        plugin_position=plugin_position_value,
                    )
                else:
                    instance_id = engine_service._get_instance_id_for_uri(plugin_uri, plugin_position_value)
                    if isinstance(instance_id, int) and instance_id > 0:
                        await engine_service.set_bypass(instance_id, bool(bypass))
            except Exception as exc:
                logger.debug(
                    "Live bypass sync skipped for plugin %s in chain %s: %s",
                    plugin_uri,
                    chain_id,
                    exc,
                )
            
            logger.info(
                "Set bypass=%s for plugin %s in chain %s (position=%s)",
                bypass,
                plugin_uri,
                chain_id,
                plugin_position,
            )
            return True
        except Exception as e:
            logger.error(f"Error setting bypass for plugin {plugin_uri}: {e}")
            return False

    async def save_preset(self, chain_id: int, preset_name: str) -> Optional[int]:
        """Save chain configuration as preset.
        
        Args:
            chain_id: Chain ID to save
            preset_name: Name for the preset
            
        Returns:
            Preset ID if saved, None otherwise
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, SystemConfig

            # Get chain
            result = await self.session.execute(
                select(Chain).filter(Chain.id == chain_id)
            )
            chain = result.scalar_one_or_none()
            
            if not chain:
                return None
            chain_config = self._parse_chain_config(chain.config)
            
            # Get plugins
            result = await self.session.execute(
                select(ChainPlugin)
                .filter(ChainPlugin.chain_id == chain_id)
                .order_by(ChainPlugin.position)
            )
            chain_plugins = result.scalars().all()
            
            # Serialize preset
            preset_data = {
                "name": chain.name,
                "system_blocks": chain_config.get("system_blocks") if isinstance(chain_config.get("system_blocks"), list) else [],
                "plugins": [
                    {
                        "uri": cp.plugin_uri,
                        "position": cp.position,
                        "bypass": cp.bypass,
                        **(
                            {"loader_state": self._chain_plugin_loader_state(cp)}
                            if self._chain_plugin_loader_state(cp) is not None
                            else {}
                        ),
                    }
                    for cp in chain_plugins
                ]
            }

            preset_key = f"chain_preset_{preset_name}"
            preset_result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.key == preset_key)
            )
            preset = preset_result.scalar_one_or_none()
            if preset is None:
                preset = SystemConfig(
                    key=preset_key,
                    value=json.dumps(preset_data)
                )
                self.session.add(preset)
            else:
                preset.value = json.dumps(preset_data)

            await self.session.flush()
            await self.session.refresh(preset)
            
            logger.info(f"Saved preset '{preset_name}' from chain {chain_id}")
            return preset.id
        except Exception as e:
            logger.error(f"Error saving preset from chain {chain_id}: {e}")
            return None

    async def load_preset(self, preset_id: int) -> Optional[int]:
        """Load chain from preset.
        
        Args:
            preset_id: Preset ID to load
            
        Returns:
            New chain ID if loaded, None otherwise
        """
        try:
            if not self.session:
                return None
            
            from app.database import Chain, ChainPlugin, SystemConfig
            import json
            
            # Get preset
            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.id == preset_id)
            )
            preset = result.scalar_one_or_none()
            
            if not preset or not preset.key.startswith("chain_preset_"):
                return None
            
            # Parse preset data
            preset_data = json.loads(preset.value)
            
            # Create new chain
            chain = Chain(
                name=preset_data["name"],
                is_active=False,
                config=json.dumps({
                    "system_blocks": (
                        preset_data.get("system_blocks")
                        if isinstance(preset_data.get("system_blocks"), list)
                        else []
                    ),
                }),
            )
            self.session.add(chain)
            await self.session.flush()
            await self.session.refresh(chain)
            
            # Add plugins
            for plugin_data in preset_data["plugins"]:
                loader_state = plugin_data.get("loader_state") if isinstance(plugin_data, dict) else None
                cp = ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri=plugin_data["uri"],
                    position=plugin_data["position"],
                    bypass=plugin_data.get("bypass", False),
                    **self._chain_plugin_loader_columns(plugin_data["uri"], loader_state),
                )
                self.session.add(cp)
            
            await self.session.flush()
            
            logger.info(f"Loaded preset {preset_id} as chain {chain.id}")
            return chain.id
        except Exception as e:
            logger.error(f"Error loading preset {preset_id}: {e}")
            return None

    async def list_presets(self) -> List[Dict[str, Any]]:
        """List all saved presets.
        
        Returns:
            List of preset dicts with id, name, data
        """
        try:
            if not self.session:
                return []
            
            from app.database import SystemConfig
            import json
            
            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.key.like("chain_preset_%"))
            )
            presets = result.scalars().all()
            
            preset_list = []
            for preset in presets:
                try:
                    preset_data = json.loads(preset.value)
                    preset_list.append({
                        "id": preset.id,
                        "name": preset.key.replace("chain_preset_", ""),
                        "chain_name": preset_data.get("name", "Unknown"),
                        "plugin_count": len(preset_data.get("plugins", [])),
                        "created_at": preset.created_at.isoformat() if preset.created_at else None
                    })
                except Exception as e:
                    logger.error(f"Error parsing preset {preset.id}: {e}")
            
            return preset_list
        except Exception as e:
            logger.error(f"Error listing presets: {e}")
            return []

    async def delete_preset(self, preset_id: int) -> bool:
        """Delete a preset.

        Args:
            preset_id: Preset ID to delete

        Returns:
            True if deleted, False otherwise
        """
        try:
            if not self.session:
                return False

            from app.database import SystemConfig

            result = await self.session.execute(
                select(SystemConfig).filter(SystemConfig.id == preset_id)
            )
            preset = result.scalar_one_or_none()

            if not preset or not preset.key.startswith("chain_preset_"):
                return False

            self.session.delete(preset)
            await self.session.flush()

            logger.info(f"Deleted preset {preset_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting preset {preset_id}: {e}")
            return False

    async def create_chain_from_template(self, template_name: str) -> Optional[Dict[str, Any]]:
        """Create a chain from a default template (demo pedalboard).

        Loads default chains from app/deployment/default_lv2_effects.json

        Args:
            template_name: Name of the template chain (e.g., "Rock Distortion")

        Returns:
            Created chain dict or None on error
        """
        try:
            templates = _load_default_chain_templates()
            template = next(
                (t for t in templates if t["name"] == template_name),
                None
            )

            if not template:
                logger.error(f"Template not found: {template_name}")
                return None

            # Create chain
            chain = await self.create_chain(template["name"])
            if not chain:
                return None

            chain_id = chain["id"]

            # Add plugins from template
            for plugin_uri in template.get("plugins", []):
                await self.add_plugin_to_chain(chain_id, plugin_uri)

            # Get updated chain with plugins
            updated_chain = await self.get_chain(chain_id)

            logger.info(f"Created chain '{template_name}' from template with {len(template.get('plugins', []))} plugins")
            return updated_chain

        except Exception as e:
            logger.error(f"Error creating chain from template '{template_name}': {e}")
            return None

    async def list_templates(self) -> List[Dict[str, Any]]:
        """List available chain templates (demo pedalboards).

        Returns:
            List of template dicts with name, description, plugins
        """
        try:
            templates = []
            for chain in _load_default_chain_templates():
                templates.append({
                    "name": chain["name"],
                    "description": chain.get("description", ""),
                    "plugin_count": len(chain.get("plugins", [])),
                    "plugins": chain.get("plugins", [])
                })

            return templates

        except Exception as e:
            logger.error(f"Error listing templates: {e}")
            return []
