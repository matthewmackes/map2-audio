"""
Plugin Route Handlers
API endpoints for plugin management.
"""

import time
import logging
import inspect
import json
import threading
import asyncio
import os
import math
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.response_models import PluginLoadResponse, PluginUnloadResponse
from app.exceptions import PluginNotFoundException, PluginLoadException
from app.services.plugin_resource_manager import get_resource_manager, ResourceLimits
from app.services.plugin_instance_id import (
    call_legacy_instance_id_resolver,
    get_legacy_instance_id_resolver,
    resolve_legacy_instance_id,
)
from app.services.plugin_key_parameter_registry import attach_plugin_key_parameter_metadata
from app.services.plugin_uris import build_lexicon_mpx1_plugin_descriptor

logger = logging.getLogger(__name__)


def _coerce_finite_float(value: Any, fallback: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return fallback
    return numeric if math.isfinite(numeric) else fallback


def _normalize_parameter_unit(value: Any) -> str:
    return str(value or "").strip()


async def _refresh_live_snapshot_controller_display(
    parameter_updates: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    normalized_updates: list[dict[str, Any]] = []
    for update in parameter_updates or []:
        if not isinstance(update, dict):
            continue
        plugin_uri = str(update.get("plugin_uri") or "").strip()
        parameter_symbol = str(update.get("parameter_symbol") or "").strip()
        if not plugin_uri or not parameter_symbol:
            continue
        normalized_updates.append(
            {
                "plugin_uri": plugin_uri,
                "parameter_symbol": parameter_symbol,
                "value": update.get("value"),
                "plugin_position": update.get("plugin_position"),
            }
        )

    if not normalized_updates:
        return None

    try:
        from app.database import get_session
        from app.services.snapshot_controller_display_push_service import (
            refresh_live_snapshot_controller_display_for_parameter_updates,
        )

        async with get_session() as session:
            return await refresh_live_snapshot_controller_display_for_parameter_updates(
                session=session,
                parameter_updates=normalized_updates,
            )
    except Exception as exc:
        logger.debug("Live controller-display refresh skipped: %s", exc)
        return None


def _normalize_juce_parameter_definition(
    definition: Dict[str, Any],
    index: int,
    *,
    band_index: Optional[int] = None,
) -> Dict[str, Any]:
    param_type = str(definition.get("type") or "").strip().lower()
    is_toggled = param_type == "toggle"
    is_enum = param_type == "enum"
    options = [str(option) for option in definition.get("options", [])] if isinstance(definition.get("options"), list) else []

    if is_toggled:
        minimum = 0.0
        maximum = 1.0
        default_value = 1.0 if bool(definition.get("default", False)) else 0.0
    elif is_enum:
        minimum = _coerce_finite_float(definition.get("min", 0.0), 0.0)
        fallback_maximum = float(len(options) - 1) if options else 1.0
        maximum = _coerce_finite_float(definition.get("max", fallback_maximum), fallback_maximum)
        raw_default = definition.get("default", minimum)
        if isinstance(raw_default, str) and options:
            try:
                default_value = float(options.index(raw_default))
            except ValueError:
                default_value = minimum
        else:
            default_value = _coerce_finite_float(raw_default, minimum)
    else:
        minimum = _coerce_finite_float(definition.get("min", 0.0), 0.0)
        maximum = _coerce_finite_float(definition.get("max", 1.0), 1.0)
        default_value = _coerce_finite_float(definition.get("default", minimum), minimum)

    if maximum < minimum:
        minimum, maximum = maximum, minimum

    default_value = min(max(default_value, minimum), maximum)
    base_name = str(definition.get("name", "")).strip()
    base_symbol = str(definition.get("symbol", "")).strip()
    name = base_name if band_index is None else f"Band {band_index + 1} {base_name}".strip()
    symbol = base_symbol if band_index is None else f"band{band_index}_{base_symbol}"

    parameter = {
        "index": index,
        "name": name,
        "symbol": symbol,
        "min": minimum,
        "max": maximum,
        "default": default_value,
        "is_toggled": is_toggled,
        "is_log": bool(definition.get("logarithmic", False)) and not (is_toggled or is_enum),
        "unit": _normalize_parameter_unit(definition.get("unit")),
    }

    if options:
        parameter["options"] = options

    return parameter


def _load_juce_processors() -> List[Dict[str, Any]]:
    """Load JUCE native processors from configuration file.

    These are high-performance processors built into the JUCE C++ engine:
    - Compressor, Limiter, Noise Gate (DynamicsProcessor)
    - 8-Band Parametric EQ (FilterProcessor)
    - Cabinet IR, Reverb IR (ConvolutionProcessor)
    - Neural Amp Modeler (NAMProcessor)

    Returns:
        List of processor definitions in plugin format
    """
    config_path = Path(__file__).parent.parent / "deployment" / "juce_processors.json"

    if not config_path.exists():
        logger.warning(f"JUCE processors config not found: {config_path}")
        return []

    try:
        with open(config_path, 'r') as f:
            config = json.load(f)

        processors = []
        for proc in config.get("processors", []):
            # Build parameters list from config
            parameters = []
            param_index = 0

            for param in proc.get("parameters", []):
                parameters.append(_normalize_juce_parameter_definition(param, param_index))
                param_index += 1

            multi_tap = proc.get("multi_tap")
            if isinstance(multi_tap, dict):
                for tap_param in multi_tap.get("taps", []):
                    parameters.append(_normalize_juce_parameter_definition(tap_param, param_index))
                    param_index += 1

            # Add band parameters for EQ
            if "band_parameters" in proc:
                band_config = proc["band_parameters"]
                for band_idx in range(band_config.get("count", 0)):
                    for band_param in band_config.get("per_band", []):
                        parameters.append(
                            _normalize_juce_parameter_definition(
                                band_param,
                                param_index,
                                band_index=band_idx,
                            )
                        )
                        param_index += 1

            processors.append(attach_plugin_key_parameter_metadata({
                "uri": proc["uri"],
                "name": proc["name"],
                "author": proc.get("author", "MAP2 Audio"),
                "category": proc["category"],
                "class_label": "JUCE Native",
                "version": "1.0",
                "license": proc.get("license", "AGPL-3.0-only"),
                "has_ui": False,
                "in_ports": proc["audio_ports"]["inputs"],
                "out_ports": proc["audio_ports"]["outputs"],
                "format": "JUCE",
                "is_native": True,
                "api_base": proc.get("api_base"),
                "features": proc.get("features", []),
                "parameters": parameters,
                "priority": proc.get("priority", 10),
            }))

        logger.info(f"Loaded {len(processors)} JUCE native processors")
        return processors

    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JUCE processors config: {e}")
        return []
    except Exception as e:
        logger.error(f"Error loading JUCE processors: {e}")
        return []


# Cache for JUCE processors (loaded once at startup)
_juce_processors_cache: List[Dict[str, Any]] = []


def _get_juce_processors() -> List[Dict[str, Any]]:
    """Get JUCE processors with caching."""
    global _juce_processors_cache
    if not _juce_processors_cache:
        _juce_processors_cache = _load_juce_processors()
    return _juce_processors_cache


_ENABLE_ENGINE_PLUGIN_OPS = os.getenv("MAP2_ENABLE_ENGINE_PLUGIN_OPS", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_ENABLE_SYNC_ENGINE_PLUGIN_OPS = os.getenv("MAP2_ENABLE_SYNC_ENGINE_PLUGIN_OPS", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_ENGINE_OP_QUEUE_MAX = max(32, int(os.getenv("MAP2_ENGINE_OP_QUEUE_MAX", "2048")))
_ENGINE_OP_MAX_RETRIES = max(0, int(os.getenv("MAP2_ENGINE_OP_MAX_RETRIES", "6")))
_ENGINE_OP_RETRY_BASE_DELAY = max(0.01, float(os.getenv("MAP2_ENGINE_OP_RETRY_BASE_DELAY", "0.05")))


def _get_hardware_plugins() -> List[Dict[str, Any]]:
    """Return hardware effect plugins (Lexicon MPX-1 via S/PDIF)."""
    return [attach_plugin_key_parameter_metadata(build_lexicon_mpx1_plugin_descriptor())]

try:
    from fastapi import APIRouter, HTTPException, Query, Response, Body
    from pydantic import BaseModel
    from app.services.api_readiness import ensure_plugin_route_ready
    from app.services.event_publisher import event_publisher, EventType
    from app.services.plugin_loader_unified import get_plugin_loader

    router = APIRouter(prefix="/api/plugins", tags=["plugins"])

    # Batch parameter update model
    class ParameterUpdate(BaseModel):
        """Single parameter update in a batch."""
        plugin_uri: str
        param_index: int
        value: float
        instance_id: Optional[int] = None
        plugin_position: Optional[int] = None

    class BatchParameterRequest(BaseModel):
        """Batch parameter update request."""
        updates: List[ParameterUpdate]

    # In-memory cache of discovered and loaded plugins with TTL
    _discovered_plugins = []
    _loaded_plugins = {}
    _resident_plugins = {}
    _cache_timestamp = 0
    _cache_ttl = 300  # 5 minutes cache TTL
    _plugin_cache_lock = threading.RLock()
    _plugin_discovery_lock = None
    _engine_op_queue: Optional[asyncio.Queue] = None
    _engine_op_worker_task: Optional[asyncio.Task] = None
    _engine_op_stats: Dict[str, Any] = {
        "enqueued": 0,
        "processed": 0,
        "failed": 0,
        "retries": 0,
        "dropped": 0,
        "last_error": None,
    }
    _residency_stats: Dict[str, int] = {
        "parked": 0,
        "reused": 0,
        "destroyed": 0,
    }

    def _runtime_profile_status() -> Dict[str, Any]:
        try:
            from app.services.runtime_profiles import get_runtime_profile_status

            return get_runtime_profile_status()
        except Exception:
            return {
                "node_type": "ALL-IN-ONE",
                "current_profile": "Edit",
                "profile_policy": {"effect_residency_default": False},
            }

    def _is_effect_residency_enabled() -> bool:
        status = _runtime_profile_status()
        current_profile = str(status.get("current_profile", "Edit"))
        profile_policy = status.get("profile_policy", {})
        default_enabled = bool(profile_policy.get("effect_residency_default", False))

        try:
            from app.config import config_get

            configured = config_get("plugins.effect_residency", default_enabled)
            return bool(configured) and current_profile == "Performance"
        except Exception:
            return default_enabled and current_profile == "Performance"

    def _get_plugin_discovery_lock() -> asyncio.Lock:
        global _plugin_discovery_lock
        if _plugin_discovery_lock is None:
            _plugin_discovery_lock = asyncio.Lock()
        return _plugin_discovery_lock

    def _get_engine_op_queue() -> asyncio.Queue:
        global _engine_op_queue
        if _engine_op_queue is None:
            _engine_op_queue = asyncio.Queue(maxsize=_ENGINE_OP_QUEUE_MAX)
        return _engine_op_queue

    def _capture_engine_op_stats() -> Dict[str, Any]:
        queue = _get_engine_op_queue()
        snapshot = dict(_engine_op_stats)
        snapshot["queue_depth"] = queue.qsize()
        worker = _engine_op_worker_task
        snapshot["worker_running"] = bool(worker and not worker.done())
        snapshot["queue_max"] = _ENGINE_OP_QUEUE_MAX
        snapshot["max_retries"] = _ENGINE_OP_MAX_RETRIES
        return snapshot

    def _get_plugin_bucket(store: Dict[str, Any], uri: str) -> List[Dict[str, Any]]:
        existing = store.get(uri)
        if isinstance(existing, list):
            return existing
        if isinstance(existing, dict):
            normalized = [existing]
            store[uri] = normalized
            return normalized
        return []

    def _flatten_plugin_store(store: Dict[str, Any]) -> List[tuple[str, Dict[str, Any]]]:
        flattened: List[tuple[str, Dict[str, Any]]] = []
        for uri in list(store.keys()):
            for entry in _get_plugin_bucket(store, uri):
                if isinstance(entry, dict):
                    flattened.append((uri, entry))
        return flattened

    def _plugin_store_entry_count(store: Dict[str, Any]) -> int:
        return sum(len(_get_plugin_bucket(store, uri)) for uri in list(store.keys()))

    def _append_plugin_entry(store: Dict[str, Any], uri: str, entry: Dict[str, Any]) -> None:
        bucket = _get_plugin_bucket(store, uri)
        instance_id = _normalize_positive_int(entry.get("instance_id"))
        if instance_id is not None:
            for index, existing in enumerate(bucket):
                if _normalize_positive_int(existing.get("instance_id")) == instance_id:
                    bucket[index] = dict(entry)
                    break
            else:
                bucket.append(dict(entry))
        else:
            bucket.append(dict(entry))
        if bucket:
            store[uri] = bucket

    def _remove_plugin_bucket_entry(
        store: Dict[str, Any],
        uri: str,
        *,
        instance_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        bucket = _get_plugin_bucket(store, uri)
        if not bucket:
            return None

        normalized_instance_id = _normalize_positive_int(instance_id)
        remove_index: Optional[int] = None
        if normalized_instance_id is not None:
            for index in range(len(bucket) - 1, -1, -1):
                if _normalize_positive_int(bucket[index].get("instance_id")) == normalized_instance_id:
                    remove_index = index
                    break
            if remove_index is None:
                return None
        else:
            remove_index = len(bucket) - 1

        removed = dict(bucket.pop(remove_index))
        if bucket:
            store[uri] = bucket
        else:
            store.pop(uri, None)
        return removed

    def _select_plugin_bucket_entry(
        store: Dict[str, Any],
        uri: str,
        *,
        instance_id: Optional[int] = None,
        prefer_pending: bool = False,
    ) -> Optional[Dict[str, Any]]:
        bucket = _get_plugin_bucket(store, uri)
        if not bucket:
            return None

        normalized_instance_id = _normalize_positive_int(instance_id)
        if normalized_instance_id is not None:
            for entry in reversed(bucket):
                if _normalize_positive_int(entry.get("instance_id")) == normalized_instance_id:
                    return entry
            return None

        if prefer_pending:
            for entry in reversed(bucket):
                if bool(entry.get("engine_deferred")) and _normalize_positive_int(entry.get("instance_id")) is None:
                    return entry

        return bucket[-1]

    def _schedule_engine_op_worker() -> None:
        global _engine_op_worker_task
        worker = _engine_op_worker_task
        if worker is not None and not worker.done():
            return
        _engine_op_worker_task = asyncio.create_task(_run_engine_op_worker(), name="plugins-engine-ops")

    def _mark_loaded_plugin_engine_error(uri: str, error: str) -> None:
        with _plugin_cache_lock:
            loaded = _select_plugin_bucket_entry(_loaded_plugins, uri, prefer_pending=True)
            if loaded is None:
                return
            loaded["engine_loaded"] = False
            loaded["engine_deferred"] = False
            loaded["engine_last_error"] = error

    def _mark_loaded_plugin_engine_loaded(uri: str, instance_id: int) -> None:
        with _plugin_cache_lock:
            loaded = _select_plugin_bucket_entry(_loaded_plugins, uri, prefer_pending=True)
            if loaded is None:
                return
            loaded["instance_id"] = instance_id
            loaded["engine_loaded"] = instance_id > 0
            loaded["engine_deferred"] = False
            loaded["engine_last_error"] = None

    async def _get_running_audio_engine():
        from app.services.juce_engine_service import get_audio_engine

        engine = get_audio_engine()
        if not (engine and engine.is_available and engine.is_running):
            return None
        return engine

    def _normalize_positive_int(value: Any) -> Optional[int]:
        try:
            numeric = int(value)
        except (TypeError, ValueError):
            return None
        return numeric if numeric > 0 else None

    def _normalize_non_negative_int(value: Any) -> Optional[int]:
        try:
            numeric = int(value)
        except (TypeError, ValueError):
            return None
        return numeric if numeric >= 0 else None

    def _find_plugin_info_in_snapshot(
        plugin_uri: str,
        discovered_snapshot: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        plugin_info = next(
            (plugin for plugin in discovered_snapshot if isinstance(plugin, dict) and plugin.get("uri") == plugin_uri),
            None,
        )
        return dict(plugin_info or {})

    async def _get_plugin_info_for_uri(
        plugin_uri: str,
        *,
        allow_refresh: bool = False,
    ) -> Dict[str, Any]:
        with _plugin_cache_lock:
            loaded_entry = dict(_select_plugin_bucket_entry(_loaded_plugins, plugin_uri) or {})
            discovered_snapshot = list(_discovered_plugins)

        if loaded_entry:
            return loaded_entry

        discovered_entry = _find_plugin_info_in_snapshot(plugin_uri, discovered_snapshot)
        if discovered_entry or not allow_refresh:
            return discovered_entry

        discovery = await discover_plugins(response=Response(), refresh=not _is_cache_valid())
        plugins = discovery.get("plugins", []) if isinstance(discovery, dict) else []
        if not isinstance(plugins, list):
            return {}
        return _find_plugin_info_in_snapshot(plugin_uri, plugins)

    async def _resolve_instance_id_for_uri(
        engine,
        plugin_uri: str,
        fallback_instance_id: Optional[int] = None,
        plugin_position: Optional[int] = None,
    ) -> Optional[int]:
        explicit_instance_id = _normalize_positive_int(fallback_instance_id)
        resolver = getattr(engine, "resolve_instance_id", None)
        if callable(resolver):
            try:
                resolved_instance_id = await resolver(
                    plugin_uri,
                    plugin_position,
                    fallback_instance_id=explicit_instance_id,
                )
            except TypeError:
                # Defensive signature-probe: the await above failed
                # with TypeError on the kwargs-form, so try positional
                # variants. The coroutine that comes back is awaited at
                # the bottom via inspect.isawaitable().
                try:
                    # audit-allow: unawaited-async-engine-call
                    resolved_instance_id = resolver(plugin_uri, plugin_position)
                except TypeError:
                    # audit-allow: unawaited-async-engine-call
                    resolved_instance_id = resolver(plugin_uri)
                if inspect.isawaitable(resolved_instance_id):
                    resolved_instance_id = await resolved_instance_id
                if explicit_instance_id is not None and not (
                    isinstance(resolved_instance_id, int) and resolved_instance_id > 0
                ):
                    resolved_instance_id = explicit_instance_id
            return resolved_instance_id if isinstance(resolved_instance_id, int) and resolved_instance_id > 0 else None

        if explicit_instance_id is not None:
            return explicit_instance_id

        if plugin_position is None:
            with _plugin_cache_lock:
                loaded_bucket = _get_plugin_bucket(_loaded_plugins, plugin_uri)
                if len(loaded_bucket) == 1:
                    cached_instance = _normalize_positive_int(loaded_bucket[0].get("instance_id"))
                    if cached_instance is not None:
                        return cached_instance

        return await resolve_legacy_instance_id(engine, plugin_uri, plugin_position)

    async def _apply_engine_parameter_batch(engine, updates: List[Dict[str, Any]]) -> int:
        if not updates:
            return 0

        resolver = get_legacy_instance_id_resolver(engine)
        instance_id_cache: Dict[tuple[str, int], Optional[int]] = {}
        direct_updates: List[tuple[int, str, float]] = []

        for update in updates:
            plugin_uri = str(update.get("plugin_uri", ""))
            symbol = str(update.get("symbol", ""))
            value = float(update.get("value", 0.0))
            if not plugin_uri or not symbol:
                continue

            plugin_position = _normalize_non_negative_int(update.get("plugin_position"))
            instance_id = _normalize_positive_int(update.get("instance_id"))
            if instance_id is None:
                cache_key = (plugin_uri, plugin_position if plugin_position is not None else -1)
                if cache_key in instance_id_cache:
                    instance_id = instance_id_cache[cache_key]
                else:
                    instance_id = await _resolve_instance_id_for_uri(
                        engine,
                        plugin_uri,
                        plugin_position=plugin_position,
                    )
                    if instance_id is None:
                        instance_id = await call_legacy_instance_id_resolver(resolver, plugin_uri, plugin_position)
                    instance_id_cache[cache_key] = instance_id

            if isinstance(instance_id, int) and instance_id > 0:
                direct_updates.append((instance_id, symbol, value))

        if not direct_updates:
            return 0

        return await engine.set_parameter_batch_direct(direct_updates)

    async def _process_engine_op(op: Dict[str, Any]) -> None:
        op_type = op.get("type")
        engine = await _get_running_audio_engine()
        if engine is None:
            raise RuntimeError("Audio engine not running")

        if op_type == "load":
            uri = str(op.get("uri", ""))
            if not uri:
                return
            instance_id = await engine.load_plugin(uri)
            if not isinstance(instance_id, int) or instance_id <= 0:
                raise RuntimeError(f"Engine failed to load plugin: {uri}")
            _mark_loaded_plugin_engine_loaded(uri, instance_id)
            return

        if op_type == "unload":
            uri = str(op.get("uri", ""))
            if not uri:
                return
            instance_id = await _resolve_instance_id_for_uri(
                engine,
                uri,
                op.get("instance_id"),
            )
            if not isinstance(instance_id, int) or instance_id <= 0:
                # Treat unknown instance as idempotent success.
                return
            unloaded = await engine.unload_plugin(instance_id)
            if not unloaded:
                raise RuntimeError(f"Engine failed to unload plugin: {uri}")
            return

        if op_type == "parameter_batch":
            updates = op.get("updates") or []
            if not isinstance(updates, list):
                return
            applied = await _apply_engine_parameter_batch(engine, updates)
            expected = sum(1 for update in updates if update.get("symbol"))
            if applied < expected:
                logger.warning(
                    "Deferred engine parameter batch partial apply: applied=%s expected=%s",
                    applied,
                    expected,
                )
            return

        raise RuntimeError(f"Unsupported engine op type: {op_type}")

    async def _run_engine_op_worker() -> None:
        global _engine_op_worker_task
        queue = _get_engine_op_queue()
        try:
            while True:
                try:
                    op = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

                try:
                    await _process_engine_op(op)
                    _engine_op_stats["processed"] += 1
                except Exception as e:
                    retries = int(op.get("retries", 0))
                    uri = str(op.get("uri", ""))
                    if retries < _ENGINE_OP_MAX_RETRIES:
                        op["retries"] = retries + 1
                        _engine_op_stats["retries"] += 1
                        retry_delay = min(1.0, _ENGINE_OP_RETRY_BASE_DELAY * (2 ** retries))
                        await asyncio.sleep(retry_delay)
                        try:
                            queue.put_nowait(op)
                        except asyncio.QueueFull:
                            _engine_op_stats["dropped"] += 1
                            _engine_op_stats["failed"] += 1
                            _engine_op_stats["last_error"] = f"Queue full while retrying op: {op.get('type')}"
                            if uri:
                                _mark_loaded_plugin_engine_error(uri, str(e))
                    else:
                        _engine_op_stats["failed"] += 1
                        _engine_op_stats["last_error"] = str(e)
                        if uri:
                            _mark_loaded_plugin_engine_error(uri, str(e))
                        logger.warning(
                            "Deferred engine op failed after retries (type=%s uri=%s): %s",
                            op.get("type"),
                            uri,
                            e,
                        )
                finally:
                    queue.task_done()
        finally:
            _engine_op_worker_task = None
            if not queue.empty():
                _schedule_engine_op_worker()

    def _enqueue_engine_op(op: Dict[str, Any]) -> bool:
        queue = _get_engine_op_queue()
        try:
            queue.put_nowait(dict(op))
        except asyncio.QueueFull:
            _engine_op_stats["dropped"] += 1
            _engine_op_stats["last_error"] = f"Queue full while enqueuing op: {op.get('type')}"
            return False

        _engine_op_stats["enqueued"] += 1
        _schedule_engine_op_worker()
        return True

    def _discover_plugins_sync(loader, refresh: bool):
        """Run loader discovery in a worker thread with compatibility fallbacks."""
        if hasattr(loader, "discover_plugins_sync"):
            discover_sync = loader.discover_plugins_sync
            try:
                return discover_sync(force_refresh=refresh)
            except TypeError:
                try:
                    return discover_sync(refresh=refresh)
                except TypeError:
                    return discover_sync()

        discover = loader.discover_plugins
        try:
            return discover(force_refresh=refresh)
        except TypeError:
            try:
                return discover(refresh=refresh)
            except TypeError:
                return discover()

    def _is_cache_valid() -> bool:
        """Check if plugin cache is still valid."""
        with _plugin_cache_lock:
            if not _discovered_plugins:
                return False
            return (time.time() - _cache_timestamp) < _cache_ttl

    def invalidate_plugin_cache():
        """Invalidate the plugin cache. Call this after installing/uninstalling plugins."""
        global _discovered_plugins, _cache_timestamp
        with _plugin_cache_lock:
            count = len(_discovered_plugins)
            _discovered_plugins = []
            _cache_timestamp = 0
        logger.info(f"Plugin cache invalidated ({count} plugins cleared)")

        # Refresh the plugin loader's lilv world to pick up new/removed plugins
        try:
            from app.services.plugin_loader_unified import UnifiedPluginLoader
            loader = UnifiedPluginLoader.get_instance()
            loader.refresh_lilv_world()
            logger.info("Plugin loader lilv world refreshed")
        except Exception as e:
            logger.warning(f"Could not refresh plugin loader: {e}")

        return count

    def _transform_plugin(p) -> dict:
        """Transform a plugin object to API response format."""
        return attach_plugin_key_parameter_metadata({
            "uri": p.uri,
            "name": p.name,
            "author": p.author,
            "category": p.category,
            "class_label": p.class_label,
            "version": p.version,
            "license": p.license,
            "has_ui": p.has_ui,
            "in_ports": p.in_port_count,
            "out_ports": p.out_port_count,
            "format": "LV2",
            "parameters": [
                {
                    "index": param.index,
                    "name": param.name,
                    "symbol": param.symbol,
                    "min": param.min_value,
                    "max": param.max_value,
                    "default": param.default_value,
                    "is_toggled": param.is_toggled,
                    "is_log": param.is_logarithmic,
                    "unit": _normalize_parameter_unit(getattr(param, "unit", "")),
                }
                for param in p.parameters
            ] if hasattr(p, 'parameters') else []
        })

    def _set_plugins_cache_header(response: Response, refresh: bool) -> None:
        if refresh:
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Cache-Control"] = "public, max-age=60"

    def _native_inventory_snapshot(plugins: List[Dict[str, Any]]) -> Dict[str, Any]:
        try:
            from app.config import config_get
            from app.services.native_inventory import filter_native_uris, load_native_catalog

            catalog = load_native_catalog()
            discovered = filter_native_uris([str(p.get("uri", "")) for p in plugins if isinstance(p, dict)])
            missing = [uri for uri in catalog if uri not in set(discovered)]
            minimum = int(config_get("plugins.native_inventory_min_loadable", 1))
            required = bool(config_get("plugins.native_inventory_required", True))
            ready = len(discovered) >= max(1, minimum)
            return {
                "catalog_count": len(catalog),
                "discovered_count": len(discovered),
                "missing_count": len(missing),
                "missing_uris": missing,
                "required": required,
                "minimum_loadable": minimum,
                "ready": ready,
                "gate_pass": ready or not required,
            }
        except Exception as exc:
            return {
                "catalog_count": 0,
                "discovered_count": 0,
                "missing_count": 0,
                "missing_uris": [],
                "required": True,
                "minimum_loadable": 1,
                "ready": False,
                "gate_pass": False,
                "error": str(exc),
            }

    def _is_integral_value(value: Any) -> bool:
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return False
        return math.isfinite(numeric) and abs(numeric - round(numeric)) < 1e-9

    def _infer_parameter_profile(
        name: str,
        symbol: str,
        is_toggled: bool,
        minimum: float,
        maximum: float,
        default_value: float,
    ) -> tuple[str, str]:
        token = f"{name} {symbol}".strip().lower()
        integer_hints = (
            "bank",
            "channel",
            "count",
            "index",
            "mode",
            "octave",
            "preset",
            "program",
            "quality",
            "root",
            "voice",
            "voices",
            "zone",
        )
        if is_toggled:
            return "", "integer"
        if minimum == 0.0 and maximum == 1.0:
            return "", "normalized_0_1"
        if any(hint in token for hint in ("hz", "freq", "frequency", "cutoff")):
            return "Hz", "frequency"
        if any(hint in token for hint in ("db", "gain", "trim", "threshold", "level")):
            return "dB", "gain-db"
        if any(hint in token for hint in ("ms", "delay", "attack", "release", "time", "predelay", "pre-delay", "decay", "hold")):
            return "ms", "time-ms"
        if all(_is_integral_value(value) for value in (minimum, maximum, default_value)) and any(
            hint in token for hint in integer_hints
        ):
            return "", "integer"
        return "", "default"

    def _infer_parameter_step(
        minimum: float,
        maximum: float,
        default_value: float,
        profile: str,
        is_toggled: bool,
    ) -> float:
        span = max(0.0, maximum - minimum)
        if is_toggled:
            return 1.0
        if all(_is_integral_value(value) for value in (minimum, maximum, default_value)) and span <= 2048:
            return 1.0
        if profile == "gain-db":
            return 0.1
        if profile == "frequency":
            return 1.0
        if profile == "time-ms":
            return 1.0 if span >= 10 else 0.1
        if profile == "normalized_0_1":
            return 0.01
        if span <= 1:
            return 0.01
        if span <= 10:
            return 0.1
        if span <= 100:
            return 0.5
        return 1.0

    def _precision_from_step(step: float) -> Optional[int]:
        if not math.isfinite(step) or step <= 0:
            return None
        normalized = f"{step:.12f}".rstrip("0").rstrip(".")
        if "." not in normalized:
            return 0
        return len(normalized.split(".", 1)[1])

    def _normalize_parameter_key(raw_value: str, fallback: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", raw_value.strip().lower()).strip("-")
        return normalized or fallback

    def _plugin_parameter_source(plugin: Dict[str, Any]) -> str:
        format_name = str(plugin.get("format") or "").upper()
        if format_name == "JUCE":
            return "native"
        if format_name == "LV2":
            return "lv2"
        if format_name == "HARDWARE":
            return "hardware"
        return "plugin"

    def _build_parameter_schema_payload(plugins: List[Dict[str, Any]]) -> Dict[str, Any]:
        schema: Dict[str, Dict[str, Any]] = {}
        plugin_entries: List[Dict[str, Any]] = []

        for plugin in plugins:
            source = _plugin_parameter_source(plugin)
            if source not in {"native", "lv2"}:
                continue

            plugin_id = str(plugin.get("uri") or "").strip()
            if not plugin_id:
                continue

            parameter_entries: List[Dict[str, Any]] = []
            for parameter in plugin.get("parameters", []):
                try:
                    minimum = float(parameter.get("min", 0.0))
                    maximum = float(parameter.get("max", 1.0))
                    default_value = float(parameter.get("default", minimum))
                except (TypeError, ValueError):
                    continue

                if not (math.isfinite(minimum) and math.isfinite(maximum) and minimum < maximum):
                    continue

                default_value = min(max(default_value, minimum), maximum)
                name = str(parameter.get("name") or "").strip()
                symbol = str(parameter.get("symbol") or "").strip()
                index = int(parameter.get("index", len(parameter_entries)))
                is_toggled = bool(parameter.get("is_toggled", False))
                is_log = bool(parameter.get("is_log", False))
                explicit_unit = _normalize_parameter_unit(parameter.get("unit"))
                param_key = _normalize_parameter_key(symbol or name, f"param-{index}")
                inferred_unit, profile = _infer_parameter_profile(name, symbol, is_toggled, minimum, maximum, default_value)
                unit = explicit_unit or inferred_unit
                step = _infer_parameter_step(minimum, maximum, default_value, profile, is_toggled)
                precision = _precision_from_step(step)

                descriptor: Dict[str, Any] = {
                    "min": minimum,
                    "max": maximum,
                    "step": step,
                    "unit": unit,
                    "defaultValue": default_value,
                    "profile": profile,
                }
                if precision is not None and precision > 0:
                    descriptor["precision"] = precision

                schema[f"{plugin_id}:{param_key}"] = descriptor
                parameter_entries.append({
                    "pluginId": plugin_id,
                    "paramKey": param_key,
                    "index": index,
                    "name": name or param_key,
                    "symbol": symbol,
                    "descriptor": descriptor,
                    "isLog": is_log,
                    "isToggled": is_toggled,
                    "source": source,
                    "format": plugin.get("format"),
                })

            plugin_entries.append({
                "pluginId": plugin_id,
                "name": plugin.get("name", plugin_id),
                "format": plugin.get("format"),
                "source": source,
                "parameterCount": len(parameter_entries),
                "parameters": parameter_entries,
            })

        return {
            "schema": schema,
            "plugins": plugin_entries,
            "count": len(schema),
        }

    @router.get("/discover")
    async def discover_plugins(
        response: Response,
        refresh: bool = Query(False, description="Force refresh of plugin cache"),
    ):
        """Discover available plugins (JUCE native + LV2).

        Args:
            refresh: If True, forces a fresh scan of plugins instead of using cache.

        Returns:
            Combined list of JUCE native processors and LV2 plugins.
            JUCE processors are listed first as they are the best-in-class options.
        """
        ensure_plugin_route_ready("/api/plugins/discover")
        global _discovered_plugins, _cache_timestamp

        _set_plugins_cache_header(response, refresh)

        # Return cached plugins if valid and not forcing refresh
        if not refresh and _is_cache_valid():
            with _plugin_cache_lock:
                cached_plugins = list(_discovered_plugins)
            logger.debug(f"Returning {len(cached_plugins)} cached plugins")
            logger.debug(f"Cached plugins: {[p.get('uri') for p in cached_plugins]}")
            return {
                "plugins": cached_plugins,
                "count": len(cached_plugins),
                "cached": True,
                "native_inventory": _native_inventory_snapshot(cached_plugins),
            }

        discovery_lock = _get_plugin_discovery_lock()
        # Avoid stampeding on startup: concurrent callers return current cache/fallback
        # while the first discovery request is still in-flight.
        if not refresh and discovery_lock.locked():
            with _plugin_cache_lock:
                warm_plugins = list(_discovered_plugins)
            if warm_plugins:
                return {
                    "plugins": warm_plugins,
                    "count": len(warm_plugins),
                    "cached": True,
                    "stale": True,
                    "native_inventory": _native_inventory_snapshot(warm_plugins),
                }

            fallback_plugins = _get_juce_processors()
            if fallback_plugins:
                return {
                    "plugins": fallback_plugins,
                    "count": len(fallback_plugins),
                    "cached": False,
                    "deferred_scan": True,
                    "native_inventory": _native_inventory_snapshot(fallback_plugins),
                }

        # Collapse concurrent discovery refreshes to one in-flight scan.
        async with discovery_lock:
            # Re-check cache after waiting for any active discovery.
            if not refresh and _is_cache_valid():
                with _plugin_cache_lock:
                    cached_plugins = list(_discovered_plugins)
                logger.debug(f"Returning {len(cached_plugins)} cached plugins after single-flight wait")
                return {
                    "plugins": cached_plugins,
                    "count": len(cached_plugins),
                    "cached": True,
                    "native_inventory": _native_inventory_snapshot(cached_plugins),
                }

            # Always include JUCE native processors (best-in-class built-in effects)
            # Clear JUCE cache on refresh to pick up config changes
            if refresh:
                global _juce_processors_cache
                _juce_processors_cache = []
            juce_processors = _get_juce_processors()
            logger.info("Including %s JUCE native processors in generic plugin discovery", len(juce_processors))

            loader = get_plugin_loader()
            if not loader:
                # If loader not available, return JUCE + hardware plugins only.
                # T2517-2 — hardware-FX bridges live in `plugin_uris.py` and are
                # not loader-dependent; surface them even when LV2 is offline.
                fallback_plugins = juce_processors + _get_hardware_plugins()
                if fallback_plugins:
                    with _plugin_cache_lock:
                        _discovered_plugins = list(fallback_plugins)
                        _cache_timestamp = time.time()
                    logger.warning("Plugin loader not available, returning JUCE + hardware plugins only")
                    return {
                        "plugins": fallback_plugins,
                        "count": len(fallback_plugins),
                        "cached": False,
                        "warning": "LV2 loader not available, showing JUCE + hardware-bridge plugins only",
                        "native_inventory": _native_inventory_snapshot(fallback_plugins),
                    }
                # If we have cached data, return it anyway
                with _plugin_cache_lock:
                    stale_plugins = list(_discovered_plugins)
                if stale_plugins:
                    logger.warning("Plugin loader not available, returning stale cache")
                    return {
                        "plugins": stale_plugins,
                        "count": len(stale_plugins),
                        "cached": True,
                        "warning": "Plugin loader not available, showing cached data",
                        "native_inventory": _native_inventory_snapshot(stale_plugins),
                    }
                return {"plugins": [], "count": 0, "error": "Plugin loader not available"}

            try:
                discover_fn = getattr(loader, "discover_plugins", None)
                if discover_fn and inspect.iscoroutinefunction(discover_fn):
                    try:
                        plugins = await discover_fn(force_refresh=refresh)
                    except TypeError:
                        try:
                            plugins = await discover_fn(refresh=refresh)
                        except TypeError:
                            plugins = await discover_fn()
                else:
                    plugins = await asyncio.to_thread(_discover_plugins_sync, loader, refresh)

                logger.debug(f"Raw plugins from loader: {[(p.uri if hasattr(p, 'uri') else str(p)) for p in plugins]}")
                lv2_plugins = [_transform_plugin(p) for p in plugins]

                # T2517-2 — surface hardware-FX bridges (Lexicon MPX-1 et al.)
                # alongside JUCE-native + LV2 plugins. The descriptor carries
                # `singleton: true` + `requires_interface_capability` so the
                # chooser can gate availability per current rig.
                hw_plugins = _get_hardware_plugins()

                combined_plugins = juce_processors + lv2_plugins + hw_plugins
                with _plugin_cache_lock:
                    _discovered_plugins = combined_plugins
                    _cache_timestamp = time.time()

                logger.info(f"Discovered {len(combined_plugins)} total plugins ({len(juce_processors)} JUCE + {len(lv2_plugins)} LV2 + {len(hw_plugins)} hardware, refresh={refresh})")
                logger.info(f"Plugin URIs: {[p.get('uri') for p in combined_plugins]}")
                return {
                    "plugins": combined_plugins,
                    "count": len(combined_plugins),
                    "cached": False,
                    "native_inventory": _native_inventory_snapshot(combined_plugins),
                }
            except Exception as e:
                logger.error(f"Error discovering plugins: {e}")
                # Return JUCE processors + cached data on error if available
                with _plugin_cache_lock:
                    cached_plugins = list(_discovered_plugins)
                if juce_processors or cached_plugins:
                    fallback = juce_processors if juce_processors else cached_plugins
                    return {
                        "plugins": fallback,
                        "count": len(fallback),
                        "cached": True,
                        "error": str(e),
                        "native_inventory": _native_inventory_snapshot(fallback),
                    }
                return {"plugins": [], "count": 0, "error": str(e)}

    @router.post("/refresh")
    async def refresh_plugins(response: Response):
        """Force refresh of plugin cache and return updated list."""
        return await discover_plugins(response=response, refresh=True)

    @router.get("/parameter-schema")
    async def get_parameter_schema(
        response: Response,
        refresh: bool = Query(False, description="Force refresh of plugin cache before serialising schema"),
    ):
        """Serialise discovered native and LV2 plugin parameter descriptors for frontend hydration."""
        _set_plugins_cache_header(response, refresh)
        discovery = await discover_plugins(response=Response(), refresh=refresh)
        plugins = discovery.get("plugins", []) if isinstance(discovery, dict) else []
        payload = _build_parameter_schema_payload(plugins)
        if isinstance(discovery, dict):
            for key in ("cached", "warning", "error"):
                if key in discovery:
                    payload[key] = discovery[key]
        return payload

    @router.delete("/cache")
    async def clear_plugin_cache():
        """Clear the plugin cache, forcing next discovery to rescan."""
        global _discovered_plugins, _cache_timestamp
        with _plugin_cache_lock:
            count = len(_discovered_plugins)
            _discovered_plugins = []
            _cache_timestamp = 0
        logger.info("Plugin cache cleared")
        return {"status": "cleared", "plugins_cleared": count}

    @router.get("/list")
    async def list_plugins(response: Response):
        """List currently loaded plugins."""
        ensure_plugin_route_ready("/api/plugins/list")
        response.headers["Cache-Control"] = "public, max-age=60"
        with _plugin_cache_lock:
            loaded_entries = _flatten_plugin_store(_loaded_plugins)
            parked_entries = _flatten_plugin_store(_resident_plugins)
        loaded = [
            {
                "uri": uri,
                "name": info.get("name", uri),
                "category": info.get("category", "Unknown"),
                "instance_id": _normalize_positive_int(info.get("instance_id")),
            }
            for uri, info in loaded_entries
        ]
        parked = [
            {
                "uri": uri,
                "name": info.get("name", uri),
                "category": info.get("category", "Unknown"),
                "instance_id": _normalize_positive_int(info.get("instance_id")),
            }
            for uri, info in parked_entries
        ]
        return {
            "loaded": loaded,
            "count": len(loaded),
            "parked": parked,
            "parked_count": len(parked),
        }

    @router.get("/engine-ops/status")
    async def get_engine_ops_status():
        """Return current deferred engine-op queue state."""
        return _capture_engine_op_stats()

    @router.get("/residency/status")
    async def get_residency_status():
        status = _runtime_profile_status()
        with _plugin_cache_lock:
            parked_count = _plugin_store_entry_count(_resident_plugins)
            loaded_count = _plugin_store_entry_count(_loaded_plugins)
        return {
            "enabled": _is_effect_residency_enabled(),
            "current_profile": status.get("current_profile"),
            "node_type": status.get("node_type"),
            "loaded_count": loaded_count,
            "parked_count": parked_count,
            "stats": dict(_residency_stats),
        }

    @router.post("/load")
    async def load_plugin(uri: str):
        """Load a plugin by URI."""
        ensure_plugin_route_ready("/api/plugins/load")
        global _loaded_plugins

        # In performance mode, reuse parked plugin instances to avoid churn.
        if _is_effect_residency_enabled():
            with _plugin_cache_lock:
                parked_entry = _remove_plugin_bucket_entry(_resident_plugins, uri)
                if parked_entry is not None:
                    parked_entry.pop("engine_parked", None)
                    parked_entry["engine_deferred"] = False
                    parked_entry["engine_last_error"] = None
                    _append_plugin_entry(_loaded_plugins, uri, parked_entry)
                    _residency_stats["reused"] += 1
                    return {
                        "status": "loaded",
                        "plugin": parked_entry,
                        "engine_loaded": bool(parked_entry.get("engine_loaded", True)),
                        "engine_deferred": False,
                        "engine_resident_reused": True,
                    }

        # Find plugin in discovered list
        with _plugin_cache_lock:
            discovered_snapshot = list(_discovered_plugins)
        plugin_info = next((p for p in discovered_snapshot if p["uri"] == uri), None)
        if plugin_info is None:
            discovery = await discover_plugins(response=Response(), refresh=not _is_cache_valid())
            discovered_snapshot = discovery.get("plugins", []) if isinstance(discovery, dict) else []
            plugin_info = next((p for p in discovered_snapshot if p["uri"] == uri), None)
        if not plugin_info:
            raise HTTPException(status_code=404, detail="Plugin not found in discovered list")

        # Instantiate the plugin in the audio engine
        engine_loaded = False
        engine_deferred = False
        instance_id = None
        if _ENABLE_ENGINE_PLUGIN_OPS and _ENABLE_SYNC_ENGINE_PLUGIN_OPS:
            try:
                from app.services.juce_engine_service import get_audio_engine
                engine = get_audio_engine()
                if engine.is_available and engine.is_running:
                    instance_id = await engine.load_plugin(uri)
                    engine_loaded = instance_id > 0
                    if not engine_loaded:
                        logger.warning(f"Failed to load plugin in audio engine: {uri}")
            except Exception as e:
                logger.error(f"Error loading plugin in audio engine: {e}")
        elif _ENABLE_ENGINE_PLUGIN_OPS:
            engine_deferred = _enqueue_engine_op({"type": "load", "uri": uri, "retries": 0})
            if not engine_deferred:
                raise HTTPException(status_code=503, detail="Engine operation queue is saturated")
        else:
            logger.debug("Skipping engine plugin load (MAP2_ENABLE_ENGINE_PLUGIN_OPS disabled)")

        loaded_plugin = dict(plugin_info)
        loaded_plugin["instance_id"] = instance_id
        loaded_plugin["engine_loaded"] = engine_loaded
        loaded_plugin["engine_deferred"] = engine_deferred
        loaded_plugin["engine_last_error"] = None

        with _plugin_cache_lock:
            _append_plugin_entry(_loaded_plugins, uri, loaded_plugin)
        return {
            "status": "loaded",
            "plugin": loaded_plugin,
            "engine_loaded": engine_loaded,
            "engine_deferred": engine_deferred,
        }

    @router.post("/unload")
    async def unload_plugin(
        uri: str,
        destroy_instance: bool = Query(
            False,
            description="Force plugin destruction instead of residency parking.",
        ),
        instance_id: Optional[int] = Query(
            None,
            description="Specific instance to unload when duplicate URI instances are loaded.",
        ),
    ):
        """Unload a plugin."""
        ensure_plugin_route_ready("/api/plugins/unload")
        global _loaded_plugins

        with _plugin_cache_lock:
            selected_loaded_entry = _select_plugin_bucket_entry(_loaded_plugins, uri, instance_id=instance_id)
            loaded_entry = dict(selected_loaded_entry) if isinstance(selected_loaded_entry, dict) else None
        if loaded_entry is None:
            # Idempotent unload keeps high-frequency churn from surfacing benign 404 races.
            return {"status": "not_loaded", "uri": uri, "engine_unloaded": False}

        if _is_effect_residency_enabled() and not destroy_instance:
            loaded_entry["engine_parked"] = True
            loaded_entry["engine_deferred"] = False
            with _plugin_cache_lock:
                removed = _remove_plugin_bucket_entry(
                    _loaded_plugins,
                    uri,
                    instance_id=_normalize_positive_int(loaded_entry.get("instance_id")) or instance_id,
                )
                if removed is not None:
                    loaded_entry = removed
                _append_plugin_entry(_resident_plugins, uri, loaded_entry)
                _residency_stats["parked"] += 1
            return {
                "status": "parked",
                "uri": uri,
                "instance_id": _normalize_positive_int(loaded_entry.get("instance_id")),
                "engine_unloaded": False,
                "engine_deferred": False,
                "engine_parked": True,
            }

        # Remove from audio engine
        engine_unloaded = False
        engine_deferred = False
        if _ENABLE_ENGINE_PLUGIN_OPS and _ENABLE_SYNC_ENGINE_PLUGIN_OPS:
            try:
                from app.services.juce_engine_service import get_audio_engine
                engine = get_audio_engine()
                if engine.is_available and engine.is_running:
                    instance_id = loaded_entry.get("instance_id")

                    if not isinstance(instance_id, int) or instance_id <= 0:
                        instance_id = await resolve_legacy_instance_id(engine, uri)

                    if isinstance(instance_id, int) and instance_id > 0:
                        engine_unloaded = await engine.unload_plugin(instance_id)
                    else:
                        logger.warning(f"No instance_id found for loaded plugin {uri}; skipping engine unload")

                    if not engine_unloaded:
                        logger.warning(f"Failed to unload plugin from audio engine: {uri}")
            except Exception as e:
                logger.error(f"Error unloading plugin from audio engine: {e}")
        elif _ENABLE_ENGINE_PLUGIN_OPS:
            engine_deferred = _enqueue_engine_op(
                {
                    "type": "unload",
                    "uri": uri,
                    "instance_id": loaded_entry.get("instance_id"),
                    "retries": 0,
                }
            )
            if not engine_deferred:
                raise HTTPException(status_code=503, detail="Engine operation queue is saturated")
        else:
            logger.debug("Skipping engine plugin unload (MAP2_ENABLE_ENGINE_PLUGIN_OPS disabled)")

        with _plugin_cache_lock:
            normalized_loaded_instance_id = _normalize_positive_int(loaded_entry.get("instance_id"))
            _remove_plugin_bucket_entry(
                _loaded_plugins,
                uri,
                instance_id=normalized_loaded_instance_id,
            )
            _remove_plugin_bucket_entry(
                _resident_plugins,
                uri,
                instance_id=normalized_loaded_instance_id,
            )
            _residency_stats["destroyed"] += 1
        return {
            "status": "unloaded",
            "uri": uri,
            "instance_id": _normalize_positive_int(loaded_entry.get("instance_id")),
            "engine_unloaded": engine_unloaded,
            "engine_deferred": engine_deferred,
        }

    @router.delete("/{uri:path}")
    async def delete_plugin(uri: str):
        """Delete an LV2 plugin from the system.
        
        This removes the plugin package/bundle from the LV2 paths.
        For LV2 plugins, it removes the .lv2 directory.
        If the plugin doesn't exist on the filesystem, it removes it from the database.
        
        Args:
            uri: Plugin URI identifier
            
        Returns:
            Status and count of removed plugins
        """
        import shutil
        from pathlib import Path
        
        logger.info(f"Delete request for plugin: {uri}")
        
        # Define standard LV2 paths
        lv2_paths = [
            Path.home() / ".lv2",
            Path("/usr/lib/lv2"),
            Path("/usr/lib64/lv2"),  # 64-bit lib path
            Path("/usr/local/lib/lv2"),
            Path("/usr/local/lib64/lv2"),  # 64-bit local lib path
            Path("/opt/lv2"),
        ]
        
        bundle_path = None
        removed_from_fs = False
        
        # Search through LV2 directories for the plugin
        for lv2_dir in lv2_paths:
            if not lv2_dir.exists():
                continue
                
            # Scan all .lv2 bundles in this directory
            for bundle in lv2_dir.glob("*.lv2"):
                # Check if this is the plugin we're looking for
                # by examining the manifest.ttl file
                manifest = bundle / "manifest.ttl"
                if manifest.exists():
                    try:
                        with open(manifest, 'r') as f:
                            content = f.read()
                            # Check if the URI is in the manifest
                            if uri.replace(":", "\\:") in content or uri in content:
                                bundle_path = bundle
                                logger.info(f"Found plugin bundle at: {bundle_path}")
                                break
                    except Exception as e:
                        logger.debug(f"Error reading manifest {manifest}: {e}")
                        continue
            
            if bundle_path:
                break
        
        # Also check non-.lv2 bundles (some plugins install as regular directories)
        if not bundle_path:
            for lv2_dir in lv2_paths:
                if not lv2_dir.exists():
                    continue
                    
                for item in lv2_dir.iterdir():
                    if item.is_dir() and not item.name.endswith('.lv2'):
                        manifest = item / "manifest.ttl"
                        if manifest.exists():
                            try:
                                with open(manifest, 'r') as f:
                                    content = f.read()
                                    if uri.replace(":", "\\:") in content or uri in content:
                                        bundle_path = item
                                        logger.info(f"Found plugin bundle at: {bundle_path}")
                                        break
                            except Exception as e:
                                logger.debug(f"Error reading manifest {manifest}: {e}")
                                continue
                
                if bundle_path:
                    break
        
        # If found on filesystem, try to delete it
        if bundle_path:
            logger.info(f"Deleting plugin bundle: {bundle_path}")
            try:
                if bundle_path.exists():
                    if bundle_path.is_dir():
                        shutil.rmtree(bundle_path)
                        removed_from_fs = True
                        logger.info(f"Successfully deleted LV2 plugin directory: {bundle_path}")
                    else:
                        bundle_path.unlink()
                        removed_from_fs = True
                        logger.info(f"Successfully deleted LV2 plugin file: {bundle_path}")
                else:
                    logger.warning(f"Plugin path does not exist: {bundle_path}")
                    # Continue - we'll remove from database below
            except PermissionError as e:
                logger.error(f"Permission denied deleting {bundle_path}: {e}")
                raise HTTPException(status_code=403, detail=f"Permission denied: {str(e)}")
            except Exception as e:
                logger.error(f"Error removing plugin files: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to delete plugin files: {str(e)}")
        else:
            logger.info(f"Plugin not found on filesystem: {uri}")
        
        # Always invalidate plugin cache to remove from database
        invalidate_plugin_cache()
        
        # Try to remove from plugin loader's cache if it has one
        try:
            loader = get_plugin_loader()
            if loader and hasattr(loader, 'plugins') and isinstance(loader.plugins, dict):
                if uri in loader.plugins:
                    del loader.plugins[uri]
                    logger.info(f"Removed plugin from loader cache: {uri}")
        except Exception as e:
            logger.debug(f"Could not remove from loader cache: {e}")
        
        return {
            "status": "deleted",
            "uri": uri,
            "path": str(bundle_path) if bundle_path else None,
            "removed_from_filesystem": removed_from_fs,
            "removed_from_database": True
        }

    @router.get("/{uri:path}/parameters")
    async def get_parameters(
        uri: str,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Get plugin parameters."""
        normalized_instance_id = _normalize_positive_int(instance_id)
        normalized_plugin_position = _normalize_non_negative_int(plugin_position)
        with _plugin_cache_lock:
            loaded_bucket = list(_get_plugin_bucket(_loaded_plugins, uri))
            selected_loaded_entry = _select_plugin_bucket_entry(
                _loaded_plugins,
                uri,
                instance_id=normalized_instance_id,
            )
            discovered_snapshot = list(_discovered_plugins)
        if not loaded_bucket:
            raise HTTPException(status_code=404, detail="Plugin not loaded")
        if (
            normalized_instance_id is not None
            and selected_loaded_entry is None
            and normalized_plugin_position is None
        ):
            raise HTTPException(status_code=404, detail=f"Plugin instance not loaded: {normalized_instance_id}")

        # Find full plugin info from discovered list
        plugin_info = _find_plugin_info_in_snapshot(uri, discovered_snapshot)
        if not plugin_info:
            plugin_info = dict(selected_loaded_entry or loaded_bucket[-1])
        if not plugin_info:
            return {"uri": uri, "parameters": []}

        # Get actual parameter values from running instance
        parameters = [
            dict(parameter)
            for parameter in plugin_info.get("parameters", [])
            if isinstance(parameter, dict)
        ]

        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running:
                scoped_instance_id = await _resolve_instance_id_for_uri(
                    engine,
                    uri,
                    fallback_instance_id=normalized_instance_id,
                    plugin_position=normalized_plugin_position,
                )
                if normalized_plugin_position is not None and scoped_instance_id is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Plugin instance not found at position: {normalized_plugin_position}",
                    )
                if normalized_instance_id is not None and scoped_instance_id is None:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Plugin instance not found: {normalized_instance_id}",
                    )
                for param in parameters:
                    symbol = param.get("symbol", "")
                    if symbol:
                        value = await engine.get_parameter(
                            uri,
                            symbol,
                            instance_id=scoped_instance_id,
                            plugin_position=normalized_plugin_position,
                        )
                        if value is not None:
                            param["value"] = value
                        else:
                            param["value"] = param.get("default", 0.0)
                    else:
                        param["value"] = param.get("default", 0.0)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting parameter values: {e}")
            for param in parameters:
                param["value"] = param.get("default", 0.0)

        return {"uri": uri, "parameters": parameters}

    @router.post("/{uri:path}/parameters/{param_index}")
    async def set_parameter(
        uri: str,
        param_index: int,
        value: float,
        instance_id: Optional[int] = Query(None),
        plugin_position: Optional[int] = Query(None),
    ):
        """Set a plugin parameter value."""
        if param_index < 0:
            raise HTTPException(status_code=400, detail="Parameter index must be >= 0")
        plugin_info = await _get_plugin_info_for_uri(uri, allow_refresh=True)
        if not plugin_info:
            raise HTTPException(status_code=404, detail="Plugin not found")

        # Set parameter in running plugin instance
        engine_set = False
        parameters = plugin_info.get("parameters", [])
        symbol = None

        # Get parameter symbol from index
        if param_index < len(parameters):
            symbol = parameters[param_index].get("symbol", "")

        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            if engine.is_available and engine.is_running and symbol:
                engine_set = await engine.set_parameter(
                    uri,
                    symbol,
                    value,
                    instance_id=_normalize_positive_int(instance_id),
                    plugin_position=_normalize_non_negative_int(plugin_position),
                )
                if not engine_set:
                    logger.warning(f"Failed to set parameter in audio engine: {uri}:{symbol}={value}")
        except Exception as e:
            logger.error(f"Error setting parameter in audio engine: {e}")

        event_payload = {"plugin_uri": uri, "param_index": param_index, "value": value}
        normalized_instance_id = _normalize_positive_int(instance_id)
        normalized_plugin_position = _normalize_non_negative_int(plugin_position)
        if normalized_instance_id is not None:
            event_payload["instance_id"] = normalized_instance_id
        if normalized_plugin_position is not None:
            event_payload["plugin_position"] = normalized_plugin_position

        # Publish parameter change event
        await event_publisher.publish(
            "plugin_params",
            EventType.PLUGIN_PARAMETER_CHANGED,
            event_payload
        )
        await _refresh_live_snapshot_controller_display(
            [
                {
                    "plugin_uri": uri,
                    "parameter_symbol": symbol,
                    "value": value,
                    "plugin_position": normalized_plugin_position,
                }
            ]
        )

        return {
            "uri": uri,
            "param": param_index,
            "value": value,
            "instance_id": normalized_instance_id,
            "plugin_position": normalized_plugin_position,
            "engine_set": engine_set,
        }

    @router.post("/batch/parameters")
    async def batch_set_parameters(payload: Dict[str, Any] = Body(...)):
        """Set multiple plugin parameters in a single request.

        This endpoint reduces network overhead for real-time parameter updates
        by batching multiple parameter changes into a single API call.

        Args:
            payload: JSON body with `updates` list

        Returns:
            Summary of applied updates and any errors
        """
        ensure_plugin_route_ready("/api/plugins/batch/parameters")
        updates_raw = payload.get("updates")
        if not isinstance(updates_raw, list):
            raise HTTPException(status_code=400, detail="updates must be a list")

        requested_count = len(updates_raw)
        results = []
        errors = []

        deduped_updates: Dict[tuple[str, int, int, int], Dict[str, Any]] = {}
        for raw in updates_raw:
            if not isinstance(raw, dict):
                continue
            plugin_uri = raw.get("plugin_uri")
            param_index_raw = raw.get("param_index")
            value_raw = raw.get("value")
            instance_id = _normalize_positive_int(raw.get("instance_id"))
            plugin_position = _normalize_non_negative_int(raw.get("plugin_position"))

            if not isinstance(plugin_uri, str) or not plugin_uri:
                continue
            try:
                param_index = int(param_index_raw)
            except Exception:
                continue
            try:
                value = float(value_raw)
            except Exception:
                continue

            deduped_updates[
                (
                    plugin_uri,
                    instance_id if instance_id is not None else -1,
                    plugin_position if plugin_position is not None else -1,
                    param_index,
                )
            ] = {
                "plugin_uri": plugin_uri,
                "param_index": param_index,
                "value": value,
                "instance_id": instance_id,
                "plugin_position": plugin_position,
            }

        unique_updates = list(deduped_updates.values())

        with _plugin_cache_lock:
            loaded_snapshot = {
                uri: dict(entries[-1])
                for uri in list(_loaded_plugins.keys())
                if (entries := _get_plugin_bucket(_loaded_plugins, uri))
            }
            discovered_snapshot = list(_discovered_plugins)

        discovered_lookup = {
            str(plugin.get("uri")): dict(plugin)
            for plugin in discovered_snapshot
            if isinstance(plugin, dict) and plugin.get("uri")
        }
        if any(
            update["plugin_uri"] not in loaded_snapshot and update["plugin_uri"] not in discovered_lookup
            for update in unique_updates
        ):
            discovery = await discover_plugins(response=Response(), refresh=not _is_cache_valid())
            plugins = discovery.get("plugins", []) if isinstance(discovery, dict) else []
            if isinstance(plugins, list):
                discovered_lookup = {
                    str(plugin.get("uri")): dict(plugin)
                    for plugin in plugins
                    if isinstance(plugin, dict) and plugin.get("uri")
                }

        sync_engine_ops = _ENABLE_ENGINE_PLUGIN_OPS and _ENABLE_SYNC_ENGINE_PLUGIN_OPS
        engine = None
        instance_id_cache: Dict[tuple[str, int], Optional[int]] = {}
        sync_engine_updates: List[tuple[int, str, float]] = []
        deferred_engine_updates: List[Dict[str, Any]] = []
        controller_display_updates: List[Dict[str, Any]] = []
        if sync_engine_ops:
            try:
                from app.services.juce_engine_service import get_audio_engine
                engine = get_audio_engine()
            except Exception:
                engine = None

        for update in unique_updates:
            plugin_uri = update["plugin_uri"]
            param_index = update["param_index"]
            value = update["value"]
            explicit_instance_id = _normalize_positive_int(update.get("instance_id"))
            plugin_position = _normalize_non_negative_int(update.get("plugin_position"))
            try:
                if param_index < 0:
                    errors.append({
                        "plugin_uri": plugin_uri,
                        "param_index": param_index,
                        "error": "Parameter index must be >= 0"
                    })
                    continue

                plugin_info = dict(loaded_snapshot.get(plugin_uri) or discovered_lookup.get(plugin_uri) or {})
                if not plugin_info:
                    errors.append({
                        "plugin_uri": plugin_uri,
                        "param_index": param_index,
                        "error": "Plugin not found"
                    })
                    continue

                # Set parameter in running plugin instance
                parameters = plugin_info.get("parameters", [])
                symbol = None

                if param_index < len(parameters):
                    symbol = parameters[param_index].get("symbol", "")

                if symbol and _ENABLE_ENGINE_PLUGIN_OPS:
                    if sync_engine_ops and engine and engine.is_available and engine.is_running:
                        instance_id = explicit_instance_id
                        if instance_id is None:
                            cache_key = (plugin_uri, plugin_position if plugin_position is not None else -1)
                            if cache_key not in instance_id_cache:
                                instance_id_cache[cache_key] = await _resolve_instance_id_for_uri(
                                    engine,
                                    plugin_uri,
                                    fallback_instance_id=plugin_info.get("instance_id"),
                                    plugin_position=plugin_position,
                                )
                            instance_id = instance_id_cache.get(cache_key)
                        if isinstance(instance_id, int) and instance_id > 0:
                            sync_engine_updates.append((instance_id, symbol, value))
                    elif not sync_engine_ops:
                        deferred_engine_updates.append(
                            {
                                "plugin_uri": plugin_uri,
                                "symbol": symbol,
                                "value": value,
                                "instance_id": explicit_instance_id or _normalize_positive_int(plugin_info.get("instance_id")),
                                "plugin_position": plugin_position,
                            }
                        )

                result_payload: Dict[str, Any] = {
                    "plugin_uri": plugin_uri,
                    "param_index": param_index,
                    "value": value,
                }
                if explicit_instance_id is not None:
                    result_payload["instance_id"] = explicit_instance_id
                if plugin_position is not None:
                    result_payload["plugin_position"] = plugin_position
                results.append(result_payload)
                if symbol:
                    controller_display_updates.append(
                        {
                            "plugin_uri": plugin_uri,
                            "parameter_symbol": symbol,
                            "value": value,
                            "plugin_position": plugin_position,
                        }
                    )

            except Exception as e:
                error_payload: Dict[str, Any] = {
                    "plugin_uri": plugin_uri,
                    "param_index": param_index,
                    "error": str(e),
                }
                if explicit_instance_id is not None:
                    error_payload["instance_id"] = explicit_instance_id
                if plugin_position is not None:
                    error_payload["plugin_position"] = plugin_position
                errors.append(error_payload)

        engine_applied = 0
        engine_deferred = False
        if sync_engine_updates and sync_engine_ops:
            if engine and engine.is_available and engine.is_running:
                try:
                    engine_applied = await engine.set_parameter_batch_direct(sync_engine_updates)
                except Exception as e:
                    logger.warning(f"Error applying sync batch parameters: {e}")
            else:
                logger.warning("Sync plugin engine ops enabled but engine is unavailable")
        elif deferred_engine_updates and _ENABLE_ENGINE_PLUGIN_OPS and not sync_engine_ops:
            engine_deferred = _enqueue_engine_op(
                {
                    "type": "parameter_batch",
                    "updates": deferred_engine_updates,
                    "retries": 0,
                }
            )
            if not engine_deferred:
                errors.append(
                    {
                        "plugin_uri": None,
                        "param_index": None,
                        "error": "Engine operation queue is saturated",
                    }
                )

        # Publish batch parameter change event (single event for all changes)
        if results:
            async def _publish_batch_event(batch_updates: List[Dict[str, Any]]) -> None:
                try:
                    await event_publisher.publish(
                        "plugin_params",
                        EventType.PLUGIN_PARAMETER_CHANGED,
                        {"batch": True, "updates": batch_updates},
                    )
                except Exception:
                    pass

            asyncio.create_task(_publish_batch_event(list(results)))
            await _refresh_live_snapshot_controller_display(controller_display_updates)

        return {
            "status": "batch_complete",
            "requested": requested_count,
            "deduplicated": len(unique_updates),
            "applied": len(results),
            "engine_applied": engine_applied,
            "engine_deferred": engine_deferred,
            "errors": len(errors),
            "results": results,
            "error_details": errors if errors else None
        }

    # ============================================
    # Multi-Format Plugin Endpoints (JUCE)
    # ============================================

    class PluginInfoResponse(BaseModel):
        """Plugin information response"""
        uri: str
        name: str
        author: str
        brand: str
        category: str
        version: str
        format: str
        formatName: str
        filePath: str
        audioInputs: int
        audioOutputs: int
        hasMidiInput: bool
        hasMidiOutput: bool
        latencySamples: int
        supportsDoublePrecision: bool = False
        numSidechainBuses: int = 0

    class ScanStatusResponse(BaseModel):
        """Plugin scan status response"""
        isScanning: bool
        progress: float
        currentPath: str
        totalFound: int
        errors: List[str]

    def _transform_juce_plugin(p: dict) -> dict:
        """Transform a JUCE plugin info to API response format."""
        uri = p.get("uri", "")
        raw_format = p.get("format") or p.get("format_name") or ""
        # Infer format from URI prefix when JUCE doesn't report it
        if not raw_format or raw_format == "Unknown":
            if uri.startswith("LV2-") or "lv2" in uri.lower():
                raw_format = "LV2"
            elif uri.startswith("VST3-") or "vst3" in uri.lower():
                raw_format = "VST3"
            elif p.get("is_hardware"):
                raw_format = "Hardware"
            else:
                raw_format = "LV2"
        return {
            "uri": uri,
            "name": p.get("name", "Unknown"),
            "author": p.get("author", "Unknown"),
            "brand": p.get("brand", p.get("author", "")),
            "category": p.get("category", "Uncategorized"),
            "version": p.get("version", "1.0"),
            "format": raw_format,
            "formatName": p.get("format_name", raw_format),
            "filePath": p.get("file_path", ""),
            "audioInputs": p.get("audio_inputs", 0),
            "audioOutputs": p.get("audio_outputs", 0),
            "hasMidiInput": p.get("has_midi_input", False),
            "hasMidiOutput": p.get("has_midi_output", False),
            "latencySamples": p.get("latency_samples", 0),
            "supportsDoublePrecision": p.get("supports_double", False),
            "numSidechainBuses": p.get("sidechain_buses", 0)
        }

    @router.get("/all")
    async def get_all_plugins():
        """Get all available plugins across all formats (AU, LV2, LADSPA)"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_all_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting all plugins: {e}")
            return []

    @router.get("/summary")
    async def get_plugin_summary():
        """Lightweight plugin summary for cluster aggregation."""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_all_plugins()
            summary = []
            for p in plugins:
                summary.append({
                    "uri": p.get("uri"),
                    "name": p.get("name", p.get("uri", "")),
                    "category": p.get("category", "Unknown"),
                    "version": p.get("version", "unknown"),
                    "format": p.get("format", "Unknown"),
                })
            return summary
        except Exception as e:
            logger.error(f"Error getting plugin summary: {e}")
            return []

    @router.get("/au")
    async def get_au_plugins():
        """Get all AudioUnit plugins"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            plugins = await engine.list_au_plugins()
            return [_transform_juce_plugin(p) for p in plugins]
        except Exception as e:
            logger.error(f"Error getting AU plugins: {e}")
            return []

    @router.get("/scan-status")
    async def get_scan_status():
        """Get current plugin scan status"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            status = await engine.get_plugin_scan_status()
            return ScanStatusResponse(
                isScanning=status.get("is_scanning", False),
                progress=status.get("progress", 0.0),
                currentPath=status.get("current_path", ""),
                totalFound=status.get("total_found", 0),
                errors=status.get("errors", [])
            )
        except Exception as e:
            logger.error(f"Error getting scan status: {e}")
            return ScanStatusResponse(
                isScanning=False,
                progress=0.0,
                currentPath="",
                totalFound=0,
                errors=[str(e)]
            )

    @router.post("/scan")
    async def scan_all_plugins(format: str = Query(None, description="Plugin format to scan (AU, LV2, All)")):
        """Trigger a plugin scan for all formats or a specific format"""
        try:
            from app.services.juce_engine_service import get_audio_engine
            engine = get_audio_engine()
            await engine.scan_plugins(format=format)
            return {"success": True, "message": f"Plugin scan started for format: {format or 'All'}"}
        except Exception as e:
            logger.error(f"Error starting plugin scan: {e}")
            raise HTTPException(status_code=500, detail=str(e))

except ImportError:
    router = None
