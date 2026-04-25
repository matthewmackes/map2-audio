"""
Unified snapshot service.

The State Authority graph document is the canonical snapshot representation.
This service still maintains the legacy `snapshot_*` relational rows as a
compatibility projection so older routes and runtime surfaces can keep
operating during the cutover.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import io
import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import uuid4
import zipfile

from sqlalchemy import delete, func, inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_config
from app.database import (
    Chain,
    ChainPlugin,
    EffectsLoop,
    EffectsLoopInsertion,
    NAMModel,
    Snapshot,
    SnapshotChannel,
    SnapshotChain,
    SnapshotChainPlugin,
    SnapshotDeployment,
    SnapshotDeploymentHistory,
    SnapshotLoopInsertion,
    SnapshotMidiMap,
    SnapshotRevision,
    SnapshotRouting,
    get_session,
)
from app.services.juce_engine_service import get_audio_engine
from app.services.maschine_encoder_map_service import normalize_maschine_encoder_map
from app.services import snapshot_runtime_service
from app.services.automation_engine import automation_engine
from app.services.chain_service import ChainService
from app.services.expression_service import get_expression_service
from app.services.midi_service import midi_service
from app.services.plugin_loader_unified import get_plugin_loader
from app.services.snapshot_controller_display_preview_service import (
    build_snapshot_controller_display_preview,
)
from app.services.snapshot_controller_display_push_service import (
    push_snapshot_controller_display_preview,
)
from app.services.snapshot_system_blocks import (
    build_system_noise_gate_plugin,
    ensure_system_noise_gate_at_chain_head,
    extract_chain_system_blocks,
    is_system_noise_gate_loader_state,
)
from app.services.snapshot_footswitch_label_service import (
    extract_snapshot_footswitch_label_map,
    push_snapshot_footswitch_labels,
    replace_snapshot_footswitch_label_map,
)
from app.services.state_authority_document_service import (
    StateAuthorityDocumentService,
)
from app.services.state_authority_activation_service import (
    StateAuthorityActivationService,
)
from app.services.state_authority_revision_service import (
    StateAuthorityRevisionService,
)
from app.services.state_authority_graph import SNAPSHOT_GRAPH_VERSION
from app.services.upload_service import AssetType, get_upload_service
from app.utils.time import utc_now

logger = logging.getLogger(__name__)

DEFAULT_CHANNEL_COLOR = "#2563eb"
DEFAULT_DRY_WET_MIX = 100.0
DEFAULT_SNAPSHOT_TEMPO_BPM = 120.0
MAX_SNAPSHOT_REVISIONS = 100
SNAPSHOT_NAME_PATTERN = re.compile(r"^[A-Za-z0-9]+$")
SNAPSHOT_AUTO_TAG_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("nam", ("map2://juce/nam", "urn:map2:nam-player", " neural amp")),
    ("cabinet-ir", ("map2://juce/convolution/cabinet", "urn:map2:ir-cabinet", "\"ir_type\": \"cabinet\"", "cabinet ir", "cabinet-ir")),
    ("reverb", ("map2://juce/convolution/reverb", "urn:map2:ir-reverb", "\"ir_type\": \"reverb\"", "reverb ir", "reverb-ir", "reverb")),
    ("delay", ("delay", "echo")),
    ("compressor", ("compressor", "compression", "limiter")),
    ("drive", ("distortion", "overdrive", " drive", "fuzz", "saturation")),
    ("modulation", ("modulation", "chorus", "flanger", "flange", "phaser", "vibrato", "tremolo")),
)
_NAM_PLUGIN_URIS = {"map2://juce/nam", "urn:map2:nam-player"}
_CABINET_IR_PLUGIN_URIS = {"map2://juce/convolution/cabinet", "urn:map2:ir-cabinet"}
_REVERB_IR_PLUGIN_URIS = {"map2://juce/convolution/reverb", "urn:map2:ir-reverb"}
_SNAPSHOT_SPILLOVER_NATIVE_URIS = (
    "map2://juce/delay",
    "map2://juce/multieffect/shoegaze",
    "map2://juce/reverb/pcm70",
)
UNSET = object()
SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY = "snapshots.default_input_device"
SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY = "snapshots.default_output_device"
SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY = "snapshots.default_monitoring_output_index"
SNAPSHOT_BUNDLE_MANIFEST_FILENAME = "snapshot.json"
SNAPSHOT_BUNDLE_FORMAT_VERSION = 2
_GROUND_CONTROL_PRO_EXTENSION_KEY = "ground_control_pro"
_LAUNCH_CONTROL_EXTENSION_KEY = "launch_control"
_MIDI_COMMANDER_EXTENSION_KEY = "midi_commander"
_snapshot_preload_tasks: dict[str, asyncio.Task[None]] = {}
_TEMPLATE_LINK_NAMESPACE = "state_authority"
_TEMPLATE_LINK_KEY = "template_link"


def _normalize_controller_mappings_payload(
    value: Any,
    *,
    fallback_midi_map: list[dict[str, Any]],
    fallback_maschine_encoder_map: dict[str, Any],
) -> dict[str, Any]:
    payload = dict(value or {}) if isinstance(value, dict) else {}
    maschine_payload = payload.get("maschine") if isinstance(payload.get("maschine"), dict) else {}
    footswitch_payload = payload.get("footswitches") if isinstance(payload.get("footswitches"), dict) else {}

    normalized_encoder_map = normalize_maschine_encoder_map(
        maschine_payload.get("encoder_map", fallback_maschine_encoder_map)
    )
    if isinstance(footswitch_payload.get("label_map"), dict):
        normalized_label_map = extract_snapshot_footswitch_label_map(
            [{"action": "footswitch_label_map", "label_map": footswitch_payload.get("label_map")}]
        )
    else:
        normalized_label_map = extract_snapshot_footswitch_label_map(
            footswitch_payload.get("midi_map")
            if isinstance(footswitch_payload.get("midi_map"), list)
            else fallback_midi_map
        )

    return {
        "maschine": {
            "encoder_map": normalized_encoder_map,
        },
        "footswitches": {
            "label_map": normalized_label_map,
        },
    }


def _stable_channel_label(index: int) -> str:
    return chr(65 + index) if 0 <= index < 26 else f"Ch{index + 1}"


def _normalize_mode(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"parameter_morph", "morph"}:
        return "morph"
    if normalized in {"parallel_blend", "series", "sidechain", "ab_switch"}:
        return normalized
    return "parallel_blend"


def _legacy_mode(value: str) -> str:
    if value == "morph":
        return "parameter_morph"
    return value


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_int(value: Any) -> Optional[int]:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed


def _normalize_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.lower() in {"true", "1", "yes", "on"}:
            return True
        if value.lower() in {"false", "0", "no", "off"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return fallback


def _enforce_single_solo_channel(
    channels: list[dict[str, Any]],
    *,
    preferred_channel_key: str | None = None,
) -> list[dict[str, Any]]:
    """Ensure at most one channel is marked solo within a snapshot payload."""
    solo_indices = [
        index
        for index, channel in enumerate(channels)
        if isinstance(channel, dict) and _normalize_bool(channel.get("solo"), False)
    ]
    if len(solo_indices) <= 1:
        return channels

    winning_index = solo_indices[-1]
    if preferred_channel_key:
        for index in solo_indices:
            if str(channels[index].get("channel_key")) == preferred_channel_key:
                winning_index = index
                break

    for index in solo_indices:
        channels[index]["solo"] = index == winning_index
    return channels


def _clamp_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    parsed = _safe_int(value)
    if parsed is None:
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def _normalize_expression_curve(value: Any) -> str:
    normalized = str(value or "linear").strip().lower()
    if normalized in {"linear"}:
        return "linear"
    if normalized in {"log", "logarithmic"}:
        return "logarithmic"
    if normalized in {"exp", "exponential"}:
        return "exponential"
    if normalized in {"scurve", "s_curve"}:
        return "s_curve"
    if normalized == "custom":
        return "custom"
    return "linear"


def _normalize_expression_custom_curve(value: Any) -> list[dict[str, float]]:
    if not isinstance(value, list):
        return []
    points: list[dict[str, float]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        x = _safe_float(item.get("x"), 0.0)
        y = _safe_float(item.get("y"), 0.0)
        points.append(
            {
                "x": max(0.0, min(1.0, x)),
                "y": max(0.0, min(1.0, y)),
            }
        )
    return points[:2]


def _normalize_expression_target(
    mapping_id: str,
    target_payload: dict[str, Any],
    *,
    target_index: int,
) -> dict[str, Any] | None:
    param_id = str(target_payload.get("param_id") or "").strip()
    if not param_id:
        return None
    target_id = str(target_payload.get("id") or f"{mapping_id}-target-{target_index + 1}").strip()
    if not target_id:
        target_id = f"{mapping_id}-target-{target_index + 1}"
    return {
        "id": target_id,
        "param_id": param_id,
        "param_label": str(target_payload.get("param_label") or param_id),
        "target_plugin_uri": str(target_payload.get("target_plugin_uri") or target_payload.get("targetPluginUri") or ""),
        "target_plugin_position": _safe_int(
            target_payload.get("target_plugin_position", target_payload.get("targetPluginPosition"))
        ),
        "param_index": _safe_int(target_payload.get("param_index", target_payload.get("paramIndex"))),
        "parameter_symbol": str(target_payload.get("parameter_symbol") or target_payload.get("parameterSymbol") or ""),
        "out_min": _safe_float(target_payload.get("out_min"), 0.0),
        "out_max": _safe_float(target_payload.get("out_max"), 1.0),
        "curve": _normalize_expression_curve(target_payload.get("curve")),
        "custom_curve": _normalize_expression_custom_curve(target_payload.get("custom_curve")),
        "active": _normalize_bool(target_payload.get("active"), True),
    }


async def push_snapshot_ground_control_pro_assignments(
    *,
    snapshot_id: int,
    snapshot_name: str,
    detail_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(detail_payload, dict):
        return {
            "status": "skipped",
            "reason": "missing_detail_payload",
            "snapshot_id": int(snapshot_id),
        }

    extensions = detail_payload.get("extensions")
    if not isinstance(extensions, dict):
        return {
            "status": "skipped",
            "reason": "missing_extensions",
            "snapshot_id": int(snapshot_id),
        }

    extension_payload = extensions.get(_GROUND_CONTROL_PRO_EXTENSION_KEY)
    if not isinstance(extension_payload, dict):
        return {
            "status": "skipped",
            "reason": "missing_ground_control_pro_extension",
            "snapshot_id": int(snapshot_id),
        }

    activation_push = extension_payload.get("activation_push")
    if not isinstance(activation_push, dict):
        return {
            "status": "skipped",
            "reason": "missing_activation_push",
            "snapshot_id": int(snapshot_id),
        }

    from app.services.ground_control_pro import get_ground_control_pro_service

    return await get_ground_control_pro_service().push_snapshot_activation(
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
        extension_payload=extension_payload,
    )


async def push_snapshot_launch_control_assignments(
    *,
    snapshot_id: int,
    snapshot_name: str,
    detail_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(detail_payload, dict):
        return {
            "status": "skipped",
            "reason": "missing_detail_payload",
            "snapshot_id": int(snapshot_id),
        }

    extensions = detail_payload.get("extensions")
    if not isinstance(extensions, dict):
        return {
            "status": "skipped",
            "reason": "missing_extensions",
            "snapshot_id": int(snapshot_id),
        }

    extension_payload = extensions.get(_LAUNCH_CONTROL_EXTENSION_KEY)
    if not isinstance(extension_payload, dict):
        return {
            "status": "skipped",
            "reason": "missing_launch_control_extension",
            "snapshot_id": int(snapshot_id),
        }

    from app.services.launch_control_surface import get_launch_control_surface_service

    return await get_launch_control_surface_service().push_snapshot_activation(
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
        extension_payload=extension_payload,
    )


async def push_snapshot_midi_commander_assignments(
    *,
    snapshot_id: int,
    snapshot_name: str,
    detail_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    if not isinstance(detail_payload, dict):
        return {
            "status": "skipped",
            "reason": "missing_detail_payload",
            "snapshot_id": int(snapshot_id),
        }

    extensions = detail_payload.get("extensions")
    if not isinstance(extensions, dict):
        return {
            "status": "skipped",
            "reason": "missing_extensions",
            "snapshot_id": int(snapshot_id),
        }

    extension_payload = extensions.get(_MIDI_COMMANDER_EXTENSION_KEY)
    if not isinstance(extension_payload, dict):
        extension_payload = {}

    from app.services.midi_commander_surface import get_midi_commander_surface_service

    return await get_midi_commander_surface_service().push_snapshot_activation(
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
        extension_payload=extension_payload,
    )


async def push_snapshot_maschine_assignments(
    *,
    session: AsyncSession,
    snapshot_id: int,
    snapshot_name: str,
    controls_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    from app.services.maschine_service import get_maschine_service

    return await get_maschine_service().push_snapshot_activation(
        session,
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
        controls_payload=controls_payload,
    )


async def push_snapshot_push_surface_state(
    *,
    snapshot_id: int,
    snapshot_name: str,
) -> dict[str, Any]:
    from app.services.push_surface import get_push_surface_manager

    return await get_push_surface_manager().push_snapshot_activation(
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
    )


async def push_snapshot_mcu_surface_state(
    *,
    snapshot_id: int,
    snapshot_name: str,
) -> dict[str, Any]:
    from app.services.mcu_surface import get_mcu_surface_service

    return await get_mcu_surface_service().push_snapshot_activation(
        snapshot_id=snapshot_id,
        snapshot_name=snapshot_name,
    )


def _normalize_expression_mapping_entry(
    entry: dict[str, Any],
    *,
    mapping_index: int,
) -> dict[str, Any] | None:
    mapping_id = str(entry.get("id") or f"snapshot-expression-{mapping_index + 1}").strip()
    if not mapping_id:
        mapping_id = f"snapshot-expression-{mapping_index + 1}"
    targets_payload = entry.get("targets")
    normalized_targets: list[dict[str, Any]] = []
    if isinstance(targets_payload, list):
        for index, target_payload in enumerate(targets_payload):
            if not isinstance(target_payload, dict):
                continue
            normalized_target = _normalize_expression_target(mapping_id, target_payload, target_index=index)
            if normalized_target is not None:
                normalized_targets.append(normalized_target)
    else:
        normalized_target = _normalize_expression_target(mapping_id, entry, target_index=0)
        if normalized_target is not None:
            normalized_targets.append(normalized_target)

    if not normalized_targets:
        return None

    return {
        "id": mapping_id,
        "label": str(entry.get("label") or entry.get("name") or f"Expression {mapping_index + 1}"),
        "cc": _clamp_int(entry.get("cc"), 0, 0, 127),
        "channel": _clamp_int(entry.get("channel"), 0, 0, 16),
        "cc_min": _clamp_int(entry.get("cc_min"), 0, 0, 127),
        "cc_max": _clamp_int(entry.get("cc_max"), 127, 0, 127),
        "active": _normalize_bool(entry.get("active"), True),
        "targets": normalized_targets,
    }


def _normalize_expression_mappings_payload(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict):
            continue
        normalized_entry = _normalize_expression_mapping_entry(entry, mapping_index=index)
        if normalized_entry is not None:
            normalized.append(normalized_entry)
    return normalized


def _flatten_snapshot_expression_mappings(entries: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for mapping_index, mapping in enumerate(_normalize_expression_mappings_payload(entries)):
        mapping_id = str(mapping.get("id") or f"snapshot-expression-{mapping_index + 1}")
        for target_index, target in enumerate(mapping.get("targets") or []):
            if not isinstance(target, dict):
                continue
            target_id = str(target.get("id") or f"{mapping_id}-target-{target_index + 1}")
            flattened.append(
                {
                    "id": f"{mapping_id}:{target_id}",
                    "cc": mapping.get("cc", 0),
                    "channel": mapping.get("channel", 0),
                    "cc_min": mapping.get("cc_min", 0),
                    "cc_max": mapping.get("cc_max", 127),
                    "param_id": target.get("param_id", ""),
                    "param_label": target.get("param_label") or target.get("param_id") or "",
                    "target_plugin_uri": target.get("target_plugin_uri") or "",
                    "target_plugin_position": _safe_int(target.get("target_plugin_position")),
                    "param_index": _safe_int(target.get("param_index")),
                    "parameter_symbol": target.get("parameter_symbol") or "",
                    "out_min": target.get("out_min", 0.0),
                    "out_max": target.get("out_max", 1.0),
                    "curve": target.get("curve", "linear"),
                    "custom_curve": list(target.get("custom_curve") or []),
                    "active": _normalize_bool(mapping.get("active"), True) and _normalize_bool(target.get("active"), True),
                }
            )
    return flattened


def _discard_snapshot_preload_task(node_id: str, task: asyncio.Task[None]) -> None:
    current = _snapshot_preload_tasks.get(node_id)
    if current is task:
        _snapshot_preload_tasks.pop(node_id, None)


def schedule_snapshot_preload_for_live_snapshot(snapshot_id: int) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    from app.services.snapshot_runtime_state_service import resolve_local_node_id

    node_id = resolve_local_node_id()
    current_task = _snapshot_preload_tasks.get(node_id)
    if current_task is not None and not current_task.done():
        current_task.cancel()

    async def _runner() -> None:
        try:
            from app.services.snapshot import SnapshotService

            async with get_session() as session:
                await SnapshotService(session).preload_next_snapshot_for_live_snapshot(snapshot_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.debug("Snapshot preload task failed for live snapshot %s: %s", snapshot_id, exc)

    task = loop.create_task(_runner())
    _snapshot_preload_tasks[node_id] = task
    task.add_done_callback(lambda finished, node_id=node_id: _discard_snapshot_preload_task(node_id, finished))


def _normalize_device_name(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_monitoring_output_index(value: Any) -> Optional[int]:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized >= 0 else None


def _utcnow() -> datetime:
    return utc_now()


def _safe_int_metric(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _safe_float_metric(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_topology_mutation_stats(payload: Any) -> dict[str, Any]:
    stats = payload if isinstance(payload, dict) else {}
    return {
        "mutation_count": _safe_int_metric(stats.get("mutation_count")),
        "no_op_skip_count": _safe_int_metric(stats.get("no_op_skip_count")),
        "last_mutation_duration_ms": _safe_float_metric(stats.get("last_mutation_duration_ms")),
        "peak_mutation_duration_ms": _safe_float_metric(stats.get("peak_mutation_duration_ms")),
        "avg_mutation_duration_ms": _safe_float_metric(stats.get("avg_mutation_duration_ms")),
        "last_removed_connection_count": _safe_int_metric(stats.get("last_removed_connection_count")),
        "last_added_connection_count": _safe_int_metric(stats.get("last_added_connection_count")),
        "last_chain_size": _safe_int_metric(stats.get("last_chain_size")),
        "last_parallel_group_count": _safe_int_metric(stats.get("last_parallel_group_count")),
    }


def _build_activation_topology_metrics(before: Any, after: Any) -> dict[str, Any]:
    before_stats = _normalize_topology_mutation_stats(before)
    after_stats = _normalize_topology_mutation_stats(after)
    return {
        "before": before_stats,
        "after": after_stats,
        "delta": {
            "mutation_count": max(0, after_stats["mutation_count"] - before_stats["mutation_count"]),
            "no_op_skip_count": max(0, after_stats["no_op_skip_count"] - before_stats["no_op_skip_count"]),
        },
    }


def normalize_snapshot_name(value: Any) -> str:
    return str(value or "").strip()


def validate_snapshot_name(value: Any) -> str:
    normalized = normalize_snapshot_name(value)
    if not normalized:
        raise ValueError("Snapshot name is required.")
    if not SNAPSHOT_NAME_PATTERN.fullmatch(normalized):
        raise ValueError("Snapshot names may only contain letters and numbers, with no spaces or special characters.")
    return normalized


def sanitize_snapshot_name_seed(value: Any, *, fallback: str = "Snapshot") -> str:
    sanitized = "".join(character for character in normalize_snapshot_name(value) if character.isalnum())
    return sanitized or fallback


def _clear_snapshot_program_assignments(payload: Any) -> Any:
    if isinstance(payload, dict):
        normalized: dict[str, Any] = {}
        action = payload.get("action")
        is_snapshot_recall_entry = action in {None, "load_snapshot"}
        for key, value in payload.items():
            if key == "program_number" and is_snapshot_recall_entry:
                normalized[key] = None
            else:
                normalized[key] = _clear_snapshot_program_assignments(value)
        return normalized
    if isinstance(payload, list):
        return [_clear_snapshot_program_assignments(item) for item in payload]
    return payload


_CANONICAL_TRANSIENT_KEYS = {
    "id",
    "source_key",
    "chain_ref",
    "created_at",
    "updated_at",
    "activated_at",
    "runtime_chain_id",
    "runtime_chain_name",
    "snapshot_chain_id",
    "snapshot_id",
    "activation_status",
    "request_id",
    "last_successful_request_id",
    "seq",
    "timestamp",
    "emitted_at",
    "last_runtime_event_at",
    "last_transition_at",
}

_CANONICAL_EFFECTS_LOOP_KEYS = {
    "loop_id",
    "name",
    "channels",
    "topology",
    "tesira_device_id",
    "template_id",
    "send_endpoint_id",
    "return_endpoint_id",
    "target_added_latency_ms",
    "compensation_samples",
}


def _canonicalize_json_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _canonicalize_json_value(subvalue)
            for key, subvalue in sorted(value.items(), key=lambda item: str(item[0]))
            if str(key) not in _CANONICAL_TRANSIENT_KEYS
        }
    if isinstance(value, list):
        return [_canonicalize_json_value(item) for item in value]
    return value


def _plugin_available(plugin_uri: str) -> bool:
    if plugin_uri.startswith("map2://juce/"):
        return True
    loader = get_plugin_loader()
    if loader is None:
        return False
    try:
        if hasattr(loader, "get_plugin_by_uri"):
            return loader.get_plugin_by_uri(plugin_uri) is not None
        plugins = getattr(loader, "plugins", {})
        return plugin_uri in plugins
    except Exception:
        return False


def _plugin_tag_haystack(plugin_uri: Any, plugin_name: Any = None, loader_state: Optional[dict[str, Any]] = None) -> str:
    try:
        serialized_loader_state = json.dumps(loader_state or {}, sort_keys=True)
    except TypeError:
        serialized_loader_state = str(loader_state or {})
    return " ".join(
        part.strip().lower()
        for part in (str(plugin_uri or ""), str(plugin_name or ""), serialized_loader_state)
        if part and str(part).strip()
    )


class PreconditionFailedError(Exception):
    """T2449: optimistic-concurrency mismatch on a snapshot write.

    Raised by `update_snapshot` (and any future write path that takes
    `if_match_version`) when the caller's expected version does not match
    the row's current version. The route layer maps this to HTTP 412 with a
    structured envelope so the UI can re-fetch and prompt the operator
    before retrying.
    """

    def __init__(
        self,
        *,
        snapshot_id: int,
        current_version: int,
        expected_version: int,
        message: Optional[str] = None,
    ):
        self.snapshot_id = int(snapshot_id)
        self.current_version = int(current_version)
        self.expected_version = int(expected_version)
        super().__init__(
            message
            or (
                f"Snapshot {snapshot_id} version mismatch: "
                f"expected {expected_version}, got {current_version}."
            )
        )

    @property
    def detail_payload(self) -> dict[str, Any]:
        return {
            "code": "snapshot_version_conflict",
            "message": str(self),
            "snapshot_id": self.snapshot_id,
            "expected_version": self.expected_version,
            "current_version": self.current_version,
        }


class SnapshotActivationPreflightError(ValueError):
    """Activation failed before any runtime mutation because the snapshot is incomplete."""

    def __init__(
        self,
        failures: Iterable[str],
        *,
        issues: Optional[Iterable[dict[str, Any]]] = None,
        repair_actions: Optional[Iterable[dict[str, Any]]] = None,
    ):
        normalized_failures = [
            str(failure).strip()
            for failure in failures
            if str(failure).strip()
        ]
        if not normalized_failures:
            normalized_failures = ["Cannot go live: Snapshot pre-flight validation failed."]
        self.failures = normalized_failures
        self.issues = [dict(issue) for issue in issues or [] if isinstance(issue, dict)]
        self.repair_actions = [dict(action) for action in repair_actions or [] if isinstance(action, dict)]
        super().__init__("\n".join(normalized_failures))

    @property
    def detail_payload(self) -> dict[str, Any]:
        return {
            "message": self.failures[0],
            "phase": "VALIDATING",
            "blocking": True,
            "failures": list(self.failures),
            "issues": [dict(issue) for issue in self.issues],
            "repair_actions": [dict(action) for action in self.repair_actions],
        }

__all__ = [name for name in globals() if not name.startswith("__")]
