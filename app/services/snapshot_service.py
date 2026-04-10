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
    get_or_create_system_config,
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
from app.services.snapshot_footswitch_label_service import push_snapshot_footswitch_labels
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


class SnapshotService:
    """CRUD and workflow service for unified snapshots."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.chain_service = ChainService(session)
        self.state_authority_documents = StateAuthorityDocumentService(
            session,
            normalize_controls_payload=self._normalize_controls_payload,
            normalize_detail_payload=self._normalize_detail_payload,
            safe_float=_safe_float,
            safe_int=_safe_int,
            default_snapshot_tempo_bpm=DEFAULT_SNAPSHOT_TEMPO_BPM,
        )
        self.state_authority_revisions = StateAuthorityRevisionService(
            session,
            document_service=self.state_authority_documents,
            get_snapshot_model=self._get_snapshot_model,
            update_snapshot=self.update_snapshot,
            normalize_detail_payload=self._normalize_detail_payload,
            safe_float=_safe_float,
            default_snapshot_tempo_bpm=DEFAULT_SNAPSHOT_TEMPO_BPM,
            utcnow=_utcnow,
            max_snapshot_revisions=MAX_SNAPSHOT_REVISIONS,
            unset=UNSET,
        )
        self.state_authority_activation = StateAuthorityActivationService(
            session,
            owner=self,
            chain_service=self.chain_service,
            runtime_service_module=snapshot_runtime_service,
            midi_service=midi_service,
            get_audio_engine=get_audio_engine,
            push_snapshot_footswitch_labels=push_snapshot_footswitch_labels,
            push_snapshot_ground_control_pro_assignments=push_snapshot_ground_control_pro_assignments,
            push_snapshot_launch_control_assignments=push_snapshot_launch_control_assignments,
            push_snapshot_midi_commander_assignments=push_snapshot_midi_commander_assignments,
            push_snapshot_controller_display_preview=push_snapshot_controller_display_preview,
            schedule_snapshot_preload_for_live_snapshot=schedule_snapshot_preload_for_live_snapshot,
            get_activation_hook_plan=self.get_activation_hook_plan,
            build_snapshot_controller_display_preview=build_snapshot_controller_display_preview,
            utcnow=_utcnow,
            safe_int=_safe_int,
            safe_float=_safe_float,
            normalize_topology_mutation_stats=_normalize_topology_mutation_stats,
            build_activation_topology_metrics=_build_activation_topology_metrics,
            snapshot_spillover_native_uris=_SNAPSHOT_SPILLOVER_NATIVE_URIS,
            canonical_transient_keys=_CANONICAL_TRANSIENT_KEYS,
            canonical_effects_loop_keys=_CANONICAL_EFFECTS_LOOP_KEYS,
        )

    async def list_snapshots(
        self,
        *,
        include_shared_only: bool = False,
        tags: Optional[Iterable[str]] = None,
        document_type: str = "snapshot",
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        index_stmt = (
            select(Snapshot.id, Snapshot.tags, Snapshot.document)
            .order_by(Snapshot.is_favorite.desc(), Snapshot.display_order.asc(), Snapshot.created_at.asc())
        )
        if include_shared_only:
            index_stmt = index_stmt.where(Snapshot.community_shared.is_(True))

        index_rows = (await self.session.execute(index_stmt)).all()
        live_snapshot_id: int | None = None
        live_activated_at: str | None = None
        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
            runtime_payload = runtime_state.get("live_snapshot_payload")
            if (
                runtime_state.get("state") == "live"
                and runtime_state.get("snapshot_id") is not None
                and isinstance(runtime_payload, dict)
            ):
                live_snapshot_id = int(runtime_state["snapshot_id"])
                live_state_payload = runtime_payload.get("live_state")
                if isinstance(live_state_payload, dict):
                    live_activated_at = str(
                        live_state_payload.get("activated_at") or runtime_state.get("emitted_at") or ""
                    ).strip() or None
                else:
                    live_activated_at = str(runtime_state.get("emitted_at") or "").strip() or None
        except Exception as exc:
            logger.debug("Snapshot list runtime-state lookup skipped: %s", exc)

        normalized_document_type = str(document_type or "snapshot").strip().lower()
        tag_set = {str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}
        filtered_snapshot_ids: list[int] = []
        for snapshot_id, snapshot_tags, snapshot_document in index_rows:
            snapshot_type = self._snapshot_document_type_from_document(snapshot_document)
            if normalized_document_type == "template" and snapshot_type != "template":
                continue
            if normalized_document_type not in {"all", "template"} and snapshot_type == "template":
                continue
            normalized_tags = {str(tag).strip().lower() for tag in (snapshot_tags or []) if str(tag).strip()}
            if tag_set and not tag_set.issubset(normalized_tags):
                continue
            filtered_snapshot_ids.append(int(snapshot_id))

        bounded_offset = max(0, int(offset or 0))
        paged_snapshot_ids = filtered_snapshot_ids[bounded_offset:]
        if limit is not None:
            paged_snapshot_ids = paged_snapshot_ids[: max(0, int(limit))]
        if not paged_snapshot_ids:
            return []

        snapshot_stmt = (
            select(Snapshot)
            .options(selectinload(Snapshot.channels), selectinload(Snapshot.chains))
            .where(Snapshot.id.in_(paged_snapshot_ids))
        )
        snapshots = (await self.session.execute(snapshot_stmt)).scalars().all()
        snapshots_by_id = {int(snapshot.id): snapshot for snapshot in snapshots}
        ordered_snapshots = [snapshots_by_id[snapshot_id] for snapshot_id in paged_snapshot_ids if snapshot_id in snapshots_by_id]
        return [
            self._serialize_snapshot_summary(
                snapshot,
                live_snapshot_id=live_snapshot_id,
                live_activated_at=live_activated_at,
            )
            for snapshot in ordered_snapshots
        ]

    async def list_templates(
        self,
        *,
        include_shared_only: bool = False,
        tags: Optional[Iterable[str]] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        return await self.list_snapshots(
            include_shared_only=include_shared_only,
            tags=tags,
            document_type="template",
            limit=limit,
            offset=offset,
        )

    async def list_snapshot_tags(
        self,
        *,
        include_shared_only: bool = False,
        document_type: str = "snapshot",
    ) -> list[str]:
        stmt = select(Snapshot.tags, Snapshot.document)
        if include_shared_only:
            stmt = stmt.where(Snapshot.community_shared.is_(True))
        rows = (await self.session.execute(stmt)).all()
        normalized_document_type = str(document_type or "snapshot").strip().lower()
        available_tags: set[str] = set()
        for snapshot_tags, snapshot_document in rows:
            snapshot_type = self._snapshot_document_type_from_document(snapshot_document)
            if normalized_document_type == "template" and snapshot_type != "template":
                continue
            if normalized_document_type not in {"all", "template"} and snapshot_type == "template":
                continue
            for tag in snapshot_tags or []:
                normalized_tag = str(tag).strip()
                if normalized_tag:
                    available_tags.add(normalized_tag)
        return sorted(available_tags)

    @staticmethod
    def _extract_preload_state(runtime_metrics: Any) -> dict[str, Any]:
        if not isinstance(runtime_metrics, dict):
            return {}
        preload = runtime_metrics.get("preload")
        return dict(preload) if isinstance(preload, dict) else {}

    async def _sync_live_snapshot_preload_state(
        self,
        *,
        runtime_state_service: Any,
        live_state: dict[str, Any],
        preload_state: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        live_payload = live_state.get("live_snapshot_payload")
        snapshot_id = _safe_int(live_state.get("snapshot_id"))
        if snapshot_id is None or not isinstance(live_payload, dict):
            return None

        runtime_metrics = (
            copy.deepcopy(live_state.get("runtime_metrics"))
            if isinstance(live_state.get("runtime_metrics"), dict)
            else {}
        )
        runtime_metrics["preload"] = copy.deepcopy(preload_state)
        return await runtime_state_service.sync_live_snapshot_payload(
            snapshot_id=snapshot_id,
            live_snapshot_payload=copy.deepcopy(live_payload),
            snapshot_revision=live_state.get("snapshot_revision"),
            runtime_metrics=runtime_metrics,
        )

    async def _load_current_audio_state_extensions(self) -> dict[str, Any]:
        try:
            from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService
            from app.services.audio_state_snapshot_compiler import merge_audio_state_extensions

            authority = AudioStateAuthorityService()
            preserved_extensions: dict[str, Any] = {}
            try:
                committed = await authority.get_committed_state()
                preserved_extensions = merge_audio_state_extensions(
                    preserved_extensions,
                    committed.value.desired.extensions,
                    committed.value.extensions,
                )
            except AudioStateAuthorityError as exc:
                if "No committed authoritative audio state exists" not in str(exc):
                    raise
            try:
                desired = await authority.get_desired_state()
                preserved_extensions = merge_audio_state_extensions(
                    preserved_extensions,
                    desired.value.extensions,
                )
            except AudioStateAuthorityError as exc:
                if "No desired audio state exists" not in str(exc):
                    raise
            return preserved_extensions
        except Exception as exc:
            logger.debug("Snapshot authority extension load skipped: %s", exc)
            return {}

    async def _resolve_snapshot_persisted_extensions(
        self,
        detail_payload: dict[str, Any] | None,
        *,
        capture_current_authority_extensions: bool,
    ) -> dict[str, Any]:
        from app.services.audio_state_snapshot_compiler import merge_audio_state_extensions

        explicit_extensions = detail_payload.get("extensions") if isinstance(detail_payload, dict) else None
        if isinstance(explicit_extensions, dict):
            return merge_audio_state_extensions(explicit_extensions)
        if not capture_current_authority_extensions:
            return {}
        return await self._load_current_audio_state_extensions()

    async def _publish_snapshot_desired_state(self, detail: dict[str, Any]) -> None:
        try:
            from app.services.audio_state_authority import AudioStateAuthorityService
            from app.services.audio_state_snapshot_compiler import (
                compile_snapshot_detail_to_intent,
                overlay_audio_state_extensions,
            )

            authority = AudioStateAuthorityService()
            preserved_extensions = await self._load_current_audio_state_extensions()

            await authority.put_desired_state(
                compile_snapshot_detail_to_intent(
                    detail,
                    extensions=overlay_audio_state_extensions(
                        preserved_extensions,
                        detail.get("extensions") if isinstance(detail.get("extensions"), dict) else None,
                    ),
                )
            )
        except Exception as exc:
            logger.debug(
                "Snapshot desired-state publish skipped for %s: %s",
                detail.get("id"),
                exc,
            )

    async def _reconcile_snapshot_brain_runtime_extensions(
        self,
        *,
        current_extensions: dict[str, Any] | None,
        snapshot_extensions: dict[str, Any] | None,
    ) -> dict[str, Any]:
        try:
            from app.services.performance_brain_authority_sync import PerformanceBrainAuthoritySyncService

            reconcile_result = PerformanceBrainAuthoritySyncService().reconcile_runtime_with_extensions(
                current_extensions=current_extensions,
                next_extensions=snapshot_extensions,
            )
            return {
                "reconciled": bool(reconcile_result.get("reconciled", False)),
                "reason": reconcile_result.get("reason") or "snapshot_brain_namespace_applied",
                "restored": [dict(item) for item in reconcile_result.get("restored", []) if isinstance(item, dict)],
                "reset": [dict(item) for item in reconcile_result.get("reset", []) if isinstance(item, dict)],
                "broadcast_count": 0,
            }
        except Exception as exc:
            logger.debug("Snapshot Brain runtime reconcile skipped: %s", exc)
            return {
                "reconciled": False,
                "reason": f"reconcile_failed:{exc}",
                "restored": [],
                "reset": [],
                "broadcast_count": 0,
            }

    async def _broadcast_snapshot_brain_runtime_updates(self, reconcile_result: dict[str, Any]) -> int:
        if not bool(reconcile_result.get("reconciled", False)):
            return 0

        try:
            from app.services.performance_brain_service import BRAIN_RUNTIME_TOPIC, get_performance_brain_service
            from app.services.websocket_manager import ws_manager

            brain_service = get_performance_brain_service()
            timestamp = _utcnow().isoformat()
            broadcast_count = 0
            for entry in [
                *[item for item in reconcile_result.get("restored", []) if isinstance(item, dict)],
                *[item for item in reconcile_result.get("reset", []) if isinstance(item, dict)],
            ]:
                payload = brain_service.get_runtime_event(
                    "state",
                    instance_id=entry.get("instance_id"),
                    plugin_position=entry.get("plugin_position"),
                )
                await ws_manager.broadcast_json(
                    {
                        "type": "brain_runtime_update",
                        "topic": BRAIN_RUNTIME_TOPIC,
                        "data": payload,
                        "timestamp": timestamp,
                    },
                    topic=BRAIN_RUNTIME_TOPIC,
                )
                broadcast_count += 1
            return broadcast_count
        except Exception as exc:
            logger.debug("Snapshot Brain runtime broadcast skipped: %s", exc)
            return 0

    async def _resolve_next_preload_snapshot(
        self,
        current_snapshot: Snapshot,
    ) -> tuple[Optional[Snapshot], Optional[str]]:
        candidates, reason = await self._resolve_preload_candidate_snapshots(current_snapshot, limit=1)
        return (candidates[0], reason) if candidates else (None, None)

    async def _resolve_preload_candidate_snapshots(
        self,
        current_snapshot: Snapshot,
        *,
        limit: int = 3,
    ) -> tuple[list[Snapshot], Optional[str]]:
        bounded_limit = max(1, int(limit))
        current_program_number = (
            int(current_snapshot.program_number)
            if current_snapshot.program_number is not None
            else None
        )
        if current_program_number is not None:
            result = await self.session.execute(
                select(Snapshot)
                .where(
                    Snapshot.id != current_snapshot.id,
                    Snapshot.program_number.is_not(None),
                )
                .order_by(Snapshot.program_number.asc(), Snapshot.created_at.asc(), Snapshot.id.asc())
            )
            candidates = result.scalars().all()
            if candidates:
                ordered: list[Snapshot] = []
                for candidate in candidates:
                    if candidate.program_number is not None and int(candidate.program_number) > current_program_number:
                        ordered.append(candidate)
                ordered.extend(candidate for candidate in candidates if candidate not in ordered)
                return ordered[:bounded_limit], "program_number"

        current_display_order = int(current_snapshot.display_order or 0)
        result = await self.session.execute(
            select(Snapshot)
            .where(Snapshot.id != current_snapshot.id)
            .order_by(Snapshot.display_order.asc(), Snapshot.created_at.asc(), Snapshot.id.asc())
        )
        candidates = result.scalars().all()
        if not candidates:
            return [], None
        ordered = [
            candidate
            for candidate in candidates
            if int(candidate.display_order or 0) > current_display_order
        ]
        ordered.extend(candidate for candidate in candidates if candidate not in ordered)
        return ordered[:bounded_limit], "display_order"

    async def plan_preload_candidates_for_snapshot(
        self,
        snapshot_id: int,
        *,
        limit: int = 3,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        candidates, reason = await self._resolve_preload_candidate_snapshots(snapshot, limit=limit)
        return {
            "source_snapshot_id": int(snapshot.id),
            "source_snapshot_name": str(snapshot.name or f"Snapshot {snapshot.id}"),
            "candidate_reason": reason,
            "candidates": [
                {
                    "snapshot_id": int(candidate.id),
                    "snapshot_name": str(candidate.name or f"Snapshot {candidate.id}"),
                    "program_number": int(candidate.program_number) if candidate.program_number is not None else None,
                    "display_order": int(candidate.display_order or 0),
                }
                for candidate in candidates
            ],
        }

    async def get_activation_hook_plan(self) -> list[str]:
        default_hooks = [
            "push_footswitch_labels",
            "push_ground_control_pro_assignments",
            "push_launch_control_assignments",
            "push_midi_commander_assignments",
            "push_controller_display_preview",
            "schedule_preload",
        ]
        raw_value = await get_or_create_system_config(
            self.session,
            "state_authority.activation_hooks",
            default_value=json.dumps(default_hooks),
        )
        try:
            parsed = json.loads(raw_value or "[]")
        except Exception:
            parsed = default_hooks
        hooks = [
            str(item).strip()
            for item in parsed
            if isinstance(item, str) and str(item).strip()
        ]
        hooks = hooks or list(default_hooks)
        if "push_ground_control_pro_assignments" not in hooks:
            if "push_footswitch_labels" in hooks:
                insert_index = hooks.index("push_footswitch_labels") + 1
                hooks.insert(insert_index, "push_ground_control_pro_assignments")
            else:
                hooks.insert(0, "push_ground_control_pro_assignments")
        if "push_launch_control_assignments" not in hooks:
            if "push_ground_control_pro_assignments" in hooks:
                insert_index = hooks.index("push_ground_control_pro_assignments") + 1
                hooks.insert(insert_index, "push_launch_control_assignments")
            elif "push_footswitch_labels" in hooks:
                insert_index = hooks.index("push_footswitch_labels") + 1
                hooks.insert(insert_index, "push_launch_control_assignments")
            else:
                hooks.insert(0, "push_launch_control_assignments")
        if "push_midi_commander_assignments" not in hooks:
            if "push_launch_control_assignments" in hooks:
                insert_index = hooks.index("push_launch_control_assignments") + 1
                hooks.insert(insert_index, "push_midi_commander_assignments")
            elif "push_ground_control_pro_assignments" in hooks:
                insert_index = hooks.index("push_ground_control_pro_assignments") + 1
                hooks.insert(insert_index, "push_midi_commander_assignments")
            elif "push_footswitch_labels" in hooks:
                insert_index = hooks.index("push_footswitch_labels") + 1
                hooks.insert(insert_index, "push_midi_commander_assignments")
            else:
                hooks.insert(0, "push_midi_commander_assignments")
        return hooks

    def _snapshot_preload_stage_plugins(self, snapshot: Snapshot) -> list[Any]:
        chain_by_id = {chain.id: chain for chain in snapshot.chains}
        stage_plugins: list[Any] = []
        for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index)):
            source_chain = chain_by_id.get(channel.chain_id) if channel.chain_id is not None else None
            if source_chain is None:
                continue
            for plugin in sorted(source_chain.plugins, key=lambda item: int(item.position)):
                loader_state = dict(plugin.loader_state or {}) if isinstance(plugin.loader_state, dict) else {}
                stage_plugins.append(
                    ChainService.build_detached_stage_plugin(
                        plugin_uri=str(plugin.plugin_uri or ""),
                        position=int(plugin.position or 0),
                        bypass=bool(plugin.bypass),
                        loader_state=loader_state,
                    )
                )
        return stage_plugins

    async def preload_next_snapshot_for_live_snapshot(self, live_snapshot_id: int) -> Optional[dict[str, Any]]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state_service = SnapshotRuntimeStateService(self.session)
        live_state = await runtime_state_service.get_live_state()
        if str(live_state.get("state") or "").lower() != "live":
            return None
        if _safe_int(live_state.get("snapshot_id")) != int(live_snapshot_id):
            return None

        current_snapshot = await self._get_snapshot_model(live_snapshot_id)
        if current_snapshot is None:
            return None

        existing_preload = self._extract_preload_state(live_state.get("runtime_metrics"))
        existing_target_snapshot_id = _safe_int(existing_preload.get("target_snapshot_id"))
        existing_instance_ids = [
            int(instance_id)
            for instance_id in existing_preload.get("staged_instance_ids", [])
            if _safe_int(instance_id) is not None
        ]

        next_snapshot, reason = await self._resolve_next_preload_snapshot(current_snapshot)
        if next_snapshot is None:
            if existing_instance_ids:
                await self.chain_service.release_detached_instance_ids(existing_instance_ids)
            preload_state = {
                "status": "idle",
                "source_snapshot_id": int(live_snapshot_id),
                "target_snapshot_id": None,
                "target_snapshot_name": None,
                "candidate_reason": None,
                "staged_instance_ids": [],
                "warnings": [],
                "prepared_at": None,
            }
            await self._sync_live_snapshot_preload_state(
                runtime_state_service=runtime_state_service,
                live_state=live_state,
                preload_state=preload_state,
            )
            return preload_state

        if existing_target_snapshot_id == int(next_snapshot.id) and existing_instance_ids:
            return existing_preload

        if existing_instance_ids:
            await self.chain_service.release_detached_instance_ids(existing_instance_ids)

        warming_state = {
            "status": "warming",
            "source_snapshot_id": int(live_snapshot_id),
            "target_snapshot_id": int(next_snapshot.id),
            "target_snapshot_name": str(next_snapshot.name or f"Snapshot {next_snapshot.id}"),
            "candidate_reason": reason,
            "staged_instance_ids": [],
            "warnings": [],
            "prepared_at": None,
        }
        await self._sync_live_snapshot_preload_state(
            runtime_state_service=runtime_state_service,
            live_state=live_state,
            preload_state=warming_state,
        )

        next_snapshot = await self._get_snapshot_model(next_snapshot.id)
        if next_snapshot is None:
            return None

        stage_plugins = self._snapshot_preload_stage_plugins(next_snapshot)
        staged = await self.chain_service.stage_detached_chain_plugins(stage_plugins)
        staged_instance_ids = [
            int(instance_id)
            for instance_id in staged.get("staged_instance_ids", [])
            if _safe_int(instance_id) is not None
        ]

        refreshed_live_state = await runtime_state_service.get_live_state()
        if (
            str(refreshed_live_state.get("state") or "").lower() != "live"
            or _safe_int(refreshed_live_state.get("snapshot_id")) != int(live_snapshot_id)
        ):
            if staged_instance_ids:
                await self.chain_service.release_detached_instance_ids(staged_instance_ids)
            return None

        ready_state = {
            "status": staged.get("status", "ready"),
            "source_snapshot_id": int(live_snapshot_id),
            "target_snapshot_id": int(next_snapshot.id),
            "target_snapshot_name": str(next_snapshot.name or f"Snapshot {next_snapshot.id}"),
            "candidate_reason": reason,
            "staged_instance_ids": staged_instance_ids,
            "warnings": list(staged.get("warnings") or []),
            "prepared_at": _utcnow().isoformat(),
        }
        await self._sync_live_snapshot_preload_state(
            runtime_state_service=runtime_state_service,
            live_state=refreshed_live_state,
            preload_state=ready_state,
        )
        return ready_state

    def _derive_snapshot_tags_from_plugins(self, plugins: Iterable[dict[str, Any]]) -> list[str]:
        haystacks = [
            _plugin_tag_haystack(
                plugin.get("uri"),
                plugin.get("name"),
                plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else {},
            )
            for plugin in plugins
        ]
        return [
            tag
            for tag, patterns in SNAPSHOT_AUTO_TAG_RULES
            if any(haystack and any(pattern in haystack for pattern in patterns) for haystack in haystacks)
        ]

    def _derive_snapshot_tags_from_normalized(self, normalized: dict[str, Any]) -> list[str]:
        plugins: list[dict[str, Any]] = []
        for chain in normalized.get("chains", []):
            if isinstance(chain, dict):
                plugins.extend(
                    plugin for plugin in chain.get("plugins", []) or []
                    if isinstance(plugin, dict)
                )
        return self._derive_snapshot_tags_from_plugins(plugins)

    def _derive_snapshot_tags_from_snapshot(self, snapshot: Snapshot) -> list[str]:
        plugins = [
            {
                "uri": plugin.plugin_uri,
                "name": plugin.plugin_name,
                "loader_state": dict(plugin.loader_state or {}),
            }
            for chain in snapshot.chains
            for plugin in sorted(chain.plugins, key=lambda item: int(item.position))
        ]
        return self._derive_snapshot_tags_from_plugins(plugins)

    async def _sync_snapshot_tags(self, snapshot_id: int) -> None:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        snapshot.tags = self._derive_snapshot_tags_from_snapshot(snapshot)
        await self.session.flush()

    @staticmethod
    def _snapshot_chain_plugin_is_system_noise_gate(plugin: SnapshotChainPlugin) -> bool:
        return is_system_noise_gate_loader_state(plugin.loader_state)

    def _apply_default_system_blocks_to_normalized(
        self,
        normalized: dict[str, Any],
        *,
        apply_defaults: bool,
    ) -> dict[str, Any]:
        next_normalized = copy.deepcopy(normalized)
        next_chains: list[dict[str, Any]] = []
        for chain in next_normalized.get("chains", []):
            if not isinstance(chain, dict):
                continue
            next_chain = dict(chain)
            next_chain["plugins"] = ensure_system_noise_gate_at_chain_head(
                [
                    dict(plugin)
                    for plugin in (chain.get("plugins") or [])
                    if isinstance(plugin, dict)
                ],
                apply_defaults=apply_defaults,
            )
            next_chains.append(next_chain)
        next_normalized["chains"] = next_chains
        return next_normalized

    @staticmethod
    def _collect_device_name_candidates(value: Any) -> set[str]:
        names: set[str] = set()
        if isinstance(value, str):
            trimmed = value.strip()
            if trimmed:
                names.add(trimmed)
            return names
        if isinstance(value, dict):
            for key in (
                "name",
                "device",
                "device_name",
                "audio_device",
                "alsa_device",
                "input_device",
                "output_device",
            ):
                names.update(SnapshotService._collect_device_name_candidates(value.get(key)))
            return names
        if isinstance(value, (list, tuple, set)):
            for item in value:
                names.update(SnapshotService._collect_device_name_candidates(item))
        return names

    def _get_audio_device_inventory(self) -> dict[str, Any]:
        try:
            from app.services.engine_runtime_facade import get_engine_service

            service = get_engine_service()
        except Exception:
            return {
                "current_aliases": set(),
                "input_names": set(),
                "output_names": set(),
                "has_explicit_input_inventory": False,
                "has_explicit_output_inventory": False,
            }

        if service is None or not getattr(service, "is_available", False):
            return {
                "current_aliases": set(),
                "input_names": set(),
                "output_names": set(),
                "has_explicit_input_inventory": False,
                "has_explicit_output_inventory": False,
            }

        try:
            info = dict(service.get_system_info() or {})
        except Exception:
            info = {}

        current_aliases: set[str] = set()
        for key in ("audio_device", "alsa_device", "input_device", "output_device", "device"):
            current_aliases.update(self._collect_device_name_candidates(info.get(key)))

        explicit_input_names: set[str] = set()
        for key in (
            "available_input_devices",
            "input_devices",
            "input_device_names",
            "inputs",
            "input_ports",
            "audio_inputs",
        ):
            explicit_input_names.update(self._collect_device_name_candidates(info.get(key)))

        explicit_output_names: set[str] = set()
        for key in (
            "available_output_devices",
            "output_devices",
            "output_device_names",
            "outputs",
            "output_ports",
            "audio_outputs",
        ):
            explicit_output_names.update(self._collect_device_name_candidates(info.get(key)))

        generic_inventory: set[str] = set()
        for key in ("available_devices", "devices", "audio_interfaces"):
            generic_inventory.update(self._collect_device_name_candidates(info.get(key)))

        if not explicit_input_names and generic_inventory:
            explicit_input_names = set(generic_inventory)
        if not explicit_output_names and generic_inventory:
            explicit_output_names = set(generic_inventory)

        return {
            "current_aliases": current_aliases,
            "input_names": explicit_input_names,
            "output_names": explicit_output_names,
            "has_explicit_input_inventory": bool(explicit_input_names),
            "has_explicit_output_inventory": bool(explicit_output_names),
        }

    def _get_snapshot_io_defaults(self) -> dict[str, Any]:
        manager = get_config()
        return {
            "input_device": _normalize_device_name(manager.get(SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY)),
            "output_device": _normalize_device_name(manager.get(SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY)),
            "monitoring_output_index": _normalize_monitoring_output_index(
                manager.get(SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY)
            ),
        }

    def _resolve_snapshot_io_bindings(
        self,
        *,
        input_device: Any,
        output_device: Any,
        use_defaults: bool = True,
    ) -> tuple[Optional[str], Optional[str]]:
        resolved_input = _normalize_device_name(input_device)
        resolved_output = _normalize_device_name(output_device)
        if not use_defaults:
            return resolved_input, resolved_output

        defaults = self._get_snapshot_io_defaults()
        return (
            resolved_input or defaults["input_device"],
            resolved_output or defaults["output_device"],
        )

    async def _apply_snapshot_audio_device_bindings(self, detail: dict[str, Any]) -> dict[str, Any]:
        resolved_input, resolved_output = self._resolve_snapshot_io_bindings(
            input_device=detail.get("input_device"),
            output_device=detail.get("output_device"),
        )
        requested_device = resolved_output or resolved_input
        if not requested_device:
            return {
                "requested_input_device": resolved_input,
                "requested_output_device": resolved_output,
                "applied_audio_device": None,
                "applied": False,
                "reason": "not_configured",
            }

        service = get_audio_engine()
        if service is None:
            return {
                "requested_input_device": resolved_input,
                "requested_output_device": resolved_output,
                "applied_audio_device": None,
                "applied": False,
                "reason": "engine_unavailable",
            }

        if resolved_input and resolved_output and resolved_input != resolved_output:
            logger.info(
                "Snapshot requested distinct input/output devices (%s, %s); applying shared engine device %s",
                resolved_input,
                resolved_output,
                requested_device,
            )

        applied = await service.set_audio_device(requested_device)
        return {
            "requested_input_device": resolved_input,
            "requested_output_device": resolved_output,
            "applied_audio_device": requested_device if applied else None,
            "applied": bool(applied),
            "reason": "applied" if applied else "set_audio_device_failed",
        }

    async def _apply_snapshot_monitoring_output_binding(self, detail: dict[str, Any]) -> dict[str, Any]:
        controls = detail.get("controls") if isinstance(detail.get("controls"), dict) else {}
        monitoring_output_index = _normalize_monitoring_output_index(
            controls.get("monitoring_output_index")
        )
        result = {
            "monitoring_output_index": monitoring_output_index,
            "applied": False,
            "reason": "not_configured",
        }

        if monitoring_output_index is None:
            return result

        service = get_audio_engine()
        if service is None:
            result["reason"] = "engine_unavailable"
            return result

        set_monitoring_output_index = getattr(service, "set_monitoring_output_index", None)
        if not callable(set_monitoring_output_index):
            result["reason"] = "monitoring_output_unsupported"
            return result

        applied = await set_monitoring_output_index(int(monitoring_output_index))
        result["applied"] = bool(applied)
        result["reason"] = "applied" if applied else "set_monitoring_output_index_failed"
        return result

    async def _apply_snapshot_output_safety_settings(self, detail: dict[str, Any]) -> dict[str, Any]:
        reference_dbfs = detail.get("output_level_reference_dbfs")
        warning_threshold_db = detail.get("output_level_warning_threshold_db")
        result = {
            "output_level_reference_dbfs": None if reference_dbfs is None else float(reference_dbfs),
            "output_warning_threshold_db": None if warning_threshold_db is None else float(warning_threshold_db),
            "reference_applied": False,
            "warning_threshold_applied": False,
            "reason": "not_configured",
        }

        service = get_audio_engine()
        if reference_dbfs is not None:
            if service is None:
                result["reason"] = "engine_unavailable"
            else:
                await service.set_limiter_threshold(float(reference_dbfs))
                result["reference_applied"] = True
                result["reason"] = "applied"

        if reference_dbfs is None and warning_threshold_db is None:
            return result

        if warning_threshold_db is not None:
            try:
                from app.services.performance_metrics import get_metrics_collector

                collector = await get_metrics_collector()
                collector.set_output_safety_settings(
                    output_level_reference_dbfs=(
                        None if reference_dbfs is None else float(reference_dbfs)
                    ),
                    output_warning_threshold_db=float(warning_threshold_db),
                )
                result["warning_threshold_applied"] = True
                if result["reason"] == "not_configured":
                    result["reason"] = "applied"
            except Exception as exc:
                logger.debug(
                    "Snapshot output warning threshold update skipped for %s: %s",
                    detail.get("id"),
                    exc,
                )
                if not result["reference_applied"]:
                    result["reason"] = "warning_threshold_update_failed"

        return result

    @staticmethod
    def _snapshot_midi_command_id(snapshot_id: int, index: int) -> int:
        return 1_000_000_000 + (int(snapshot_id) * 1000) + int(index)

    @staticmethod
    def _snapshot_midi_entry_to_command(
        snapshot_id: int,
        index: int,
        entry: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        action = str(entry.get("action") or "").strip()
        if not action or action == "footswitch_label_map":
            return None

        command_type: str
        data1: int
        data2: int | None = None
        if entry.get("program_number") is not None:
            program_number = _safe_int(entry.get("program_number"))
            if program_number is None or program_number < 0:
                return None
            command_type = "program_change"
            data1 = program_number
        else:
            note_number = _safe_int(
                entry.get("start_note", entry.get("startNote", entry.get("note", entry.get("note_number"))))
            )
            if note_number is not None and note_number >= 0:
                command_type = "note_on"
                data1 = note_number
            else:
                cc_number = _safe_int(
                    entry.get("cc", entry.get("cc_number", entry.get("ccNumber", entry.get("control_number"))))
                )
                if cc_number is None or cc_number < 0:
                    return None
                command_type = "cc_toggle"
                data1 = cc_number
                data2 = _safe_int(entry.get("data2", entry.get("value_threshold")))

        channel = _safe_int(entry.get("midi_channel", entry.get("midiChannel", entry.get("channel"))))
        normalized_entry = dict(entry)
        normalized_entry.setdefault("snapshot_id", int(snapshot_id))
        return {
            "id": SnapshotService._snapshot_midi_command_id(snapshot_id, index),
            "command_type": command_type,
            "channel": channel if channel is not None and channel > 0 else 0,
            "data1": data1,
            "data2": data2,
            "action_type": action,
            "target_chain_id": _safe_int(entry.get("target_chain_id", entry.get("targetChainId"))),
            "target_plugin_uri": str(entry.get("target_plugin_uri", entry.get("targetPluginUri")) or ""),
            "target_plugin_position": _safe_int(entry.get("target_plugin_position", entry.get("targetPluginPosition"))),
            "action_data": normalized_entry,
            "is_enabled": _normalize_bool(entry.get("is_enabled", entry.get("enabled")), True),
        }

    async def _sync_snapshot_midi_map_to_engine(
        self,
        snapshot_id: int,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None:
            return {
                "synced": False,
                "reason": "engine_unavailable",
                "global_command_count": 0,
                "snapshot_command_count": 0,
            }

        global_commands = await midi_service.get_all_commands(self.session)
        snapshot_commands = [
            command
            for index, raw_entry in enumerate(entries or [])
            if isinstance(raw_entry, dict)
            for command in [self._snapshot_midi_entry_to_command(snapshot_id, index, raw_entry)]
            if command is not None
        ]
        synced = await engine.set_all_midi_commands([*global_commands, *snapshot_commands])
        return {
            "synced": bool(synced),
            "reason": "applied" if synced else "set_all_midi_commands_failed",
            "global_command_count": len(global_commands),
            "snapshot_command_count": len(snapshot_commands),
        }

    async def _sync_snapshot_expression_mappings_to_runtime(
        self,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        normalized_entries = _normalize_expression_mappings_payload(entries)
        flattened_entries = _flatten_snapshot_expression_mappings(normalized_entries)
        try:
            service = get_expression_service()
        except Exception as exc:
            return {
                "synced": False,
                "reason": f"expression_service_unavailable:{exc}",
                "mapping_count": len(normalized_entries),
                "target_count": len(flattened_entries),
                "cleared_count": 0,
                "applied_count": 0,
                "active_snapshot_count": 0,
            }

        result = service.replace_snapshot_assignments(flattened_entries)
        return {
            "synced": True,
            "reason": "applied",
            "mapping_count": len(normalized_entries),
            "target_count": len(flattened_entries),
            **result,
        }

    async def _sync_snapshot_automation_lanes_to_runtime(
        self,
        entries: list[dict[str, Any]] | None,
    ) -> dict[str, Any]:
        if automation_engine is None:
            return {
                "synced": False,
                "reason": "automation_engine_unavailable",
                "cleared_count": 0,
                "applied_count": 0,
                "invalid_count": 0,
                "active_snapshot_count": 0,
            }

        result = automation_engine.replace_snapshot_lanes(
            [dict(entry) for entry in entries or [] if isinstance(entry, dict)]
        )
        return {
            "synced": True,
            "reason": "applied",
            **result,
        }

    async def _sync_snapshot_loop_insertions_to_runtime(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None or not hasattr(engine, "set_chain_loop_insertions"):
            return {
                "synced": False,
                "reason": "engine_missing_loop_api",
                "chain_count": 0,
                "applied_count": 0,
            }

        live_state = detail.get("live_state") if isinstance(detail.get("live_state"), dict) else {}
        runtime_chain_id_by_snapshot_chain_id = {
            int(path.get("snapshot_chain_id")): int(path.get("runtime_chain_id"))
            for path in live_state.get("paths", [])
            if isinstance(path, dict)
            and isinstance(path.get("snapshot_chain_id"), int)
            and isinstance(path.get("runtime_chain_id"), int)
        }
        source_chains = {
            int(chain.get("id")): dict(chain)
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and isinstance(chain.get("id"), int)
        }

        chain_count = 0
        applied_count = 0
        for snapshot_chain_id, chain_id in runtime_chain_id_by_snapshot_chain_id.items():
            source_chain = source_chains.get(snapshot_chain_id, {})
            payload = [
                {
                    "insertion_id": str(entry.get("insertion_id") or ""),
                    "loop_id": str(entry.get("loop_id") or ""),
                    "slot_index": int(entry.get("slot_index", 0)),
                    "enabled": bool(entry.get("enabled", True)),
                    "mode": str(entry.get("mode") or "serial_insert"),
                    "blend_pct": _safe_float(entry.get("blend_pct"), 100.0),
                    "send_gain_db": _safe_float(entry.get("send_gain_db"), 0.0),
                    "return_gain_db": _safe_float(entry.get("return_gain_db"), 0.0),
                    "crossfade_ms": int(_safe_int(entry.get("crossfade_ms")) or 12),
                    "band_split_hz": list(entry.get("band_split_hz") or []),
                }
                for entry in source_chain.get("loop_insertions", [])
                if isinstance(entry, dict)
            ]
            applied = await engine.set_chain_loop_insertions(chain_id, payload)
            chain_count += 1
            if applied:
                applied_count += len(payload)

        return {
            "synced": True,
            "reason": "applied",
            "chain_count": chain_count,
            "applied_count": applied_count,
        }

    async def _sync_snapshot_channel_state_to_runtime(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any]:
        engine = get_audio_engine()
        if engine is None:
            return {
                "synced": False,
                "reason": "engine_unavailable",
                "channel_count": 0,
                "applied_count": 0,
            }

        live_state = detail.get("live_state") if isinstance(detail.get("live_state"), dict) else {}
        runtime_chain_id_by_snapshot_chain_id = {
            int(path.get("snapshot_chain_id")): int(path.get("runtime_chain_id"))
            for path in live_state.get("paths", [])
            if isinstance(path, dict)
            and isinstance(path.get("snapshot_chain_id"), int)
            and isinstance(path.get("runtime_chain_id"), int)
        }
        channels = [
            dict(channel)
            for channel in detail.get("channels", [])
            if isinstance(channel, dict) and isinstance(channel.get("chain_id"), int)
        ]
        if not channels:
            return {
                "synced": True,
                "reason": "no_channels",
                "channel_count": 0,
                "applied_count": 0,
            }

        method_names = ("set_chain_mute", "set_chain_solo", "set_chain_dry_wet_mix")
        if not all(hasattr(engine, method_name) for method_name in method_names):
            return {
                "synced": False,
                "reason": "engine_missing_channel_state_api",
                "channel_count": len(channels),
                "applied_count": 0,
            }

        applied_count = 0
        for channel in channels:
            runtime_chain_id = runtime_chain_id_by_snapshot_chain_id.get(int(channel["chain_id"]))
            if runtime_chain_id is None:
                continue
            await engine.set_chain_mute(runtime_chain_id, _normalize_bool(channel.get("muted"), False))
            await engine.set_chain_solo(runtime_chain_id, _normalize_bool(channel.get("solo"), False))
            await engine.set_chain_dry_wet_mix(
                runtime_chain_id,
                _safe_float(channel.get("dry_wet_mix", channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
            )
            applied_count += 1

        return {
            "synced": True,
            "reason": "applied",
            "channel_count": len(channels),
            "applied_count": applied_count,
        }

    @staticmethod
    def _preflight_asset_label(
        loader_state: dict[str, Any],
        asset_path: str,
        *,
        fallback: str,
    ) -> str:
        return str(
            loader_state.get("selected_asset_name")
            or loader_state.get("selected_model")
            or loader_state.get("selected_ir")
            or os.path.basename(asset_path)
            or fallback
        ).strip() or fallback

    @staticmethod
    def _preflight_repair_action(
        *,
        action: str,
        message: str,
        **metadata: Any,
    ) -> dict[str, Any]:
        payload = {
            "action": action,
            "message": message,
        }
        for key, value in metadata.items():
            if value is not None:
                payload[key] = value
        return payload

    async def _validate_snapshot_activation_preflight(self, detail: dict[str, Any]) -> None:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and chain.get("id") is not None
        }
        failures: list[str] = []
        issues: list[dict[str, Any]] = []
        repair_actions: list[dict[str, Any]] = []

        for channel_index, channel in enumerate(detail.get("channels", [])):
            if not isinstance(channel, dict):
                continue

            channel_label = str(
                channel.get("label")
                or channel.get("channel_key")
                or _stable_channel_label(channel_index)
            ).strip() or _stable_channel_label(channel_index)
            chain_id = channel.get("chain_id")
            source_chain = chain_by_id.get(chain_id) if chain_id is not None else None
            if not isinstance(source_chain, dict):
                continue

            for plugin in source_chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue

                plugin_uri = str(plugin.get("uri") or "").strip()
                if not plugin_uri:
                    continue

                plugin_name = str(plugin.get("name") or plugin_uri).strip() or plugin_uri
                plugin_missing = bool(plugin.get("is_placeholder", False)) or not _plugin_available(plugin_uri)
                if plugin_missing:
                    message = (
                        f"Cannot go live: Channel {channel_label} - plugin {plugin_name} is not installed on this node."
                    )
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_plugin",
                            "category": "plugin",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "plugin_name": plugin_name,
                            "message": message,
                            "auto_repair": False,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="install_plugin",
                            message=f"Install or redeploy plugin {plugin_name} on this node.",
                            channel_label=channel_label,
                            plugin_uri=plugin_uri,
                            plugin_name=plugin_name,
                        )
                    )
                    continue

                loader_state = plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else {}
                asset_path = str(loader_state.get("selected_asset_path") or "").strip()
                if not asset_path:
                    continue
                if os.path.isfile(asset_path):
                    continue

                if plugin_uri in _NAM_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="NAM model")
                    message = f"Cannot go live: Channel {channel_label} - NAM model {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "nam_model",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy NAM model {asset_name} on this node.",
                            asset_type="nam_model",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                if plugin_uri in _CABINET_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="cabinet IR")
                    message = f"Cannot go live: Channel {channel_label} - cabinet IR {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "cabinet_ir",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy cabinet IR {asset_name} on this node.",
                            asset_type="cabinet_ir",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                if plugin_uri in _REVERB_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="reverb IR")
                    message = f"Cannot go live: Channel {channel_label} - reverb IR {asset_name} not found on this node."
                    failures.append(message)
                    issues.append(
                        {
                            "code": "missing_asset",
                            "category": "asset",
                            "asset_type": "reverb_ir",
                            "channel_label": channel_label,
                            "plugin_uri": plugin_uri,
                            "asset_name": asset_name,
                            "asset_path": asset_path,
                            "message": message,
                            "auto_repair": True,
                        }
                    )
                    repair_actions.append(
                        self._preflight_repair_action(
                            action="restore_asset",
                            message=f"Restore or redeploy reverb IR {asset_name} on this node.",
                            asset_type="reverb_ir",
                            asset_name=asset_name,
                            asset_path=asset_path,
                            channel_label=channel_label,
                        )
                    )
                    continue

                asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="plugin asset")
                message = f"Cannot go live: Channel {channel_label} - plugin asset {asset_name} not found on this node."
                failures.append(message)
                issues.append(
                    {
                        "code": "missing_asset",
                        "category": "asset",
                        "asset_type": "plugin_asset",
                        "channel_label": channel_label,
                        "plugin_uri": plugin_uri,
                        "asset_name": asset_name,
                        "asset_path": asset_path,
                        "message": message,
                        "auto_repair": True,
                    }
                )
                repair_actions.append(
                    self._preflight_repair_action(
                        action="restore_asset",
                        message=f"Restore or redeploy plugin asset {asset_name} on this node.",
                        asset_type="plugin_asset",
                        asset_name=asset_name,
                        asset_path=asset_path,
                        channel_label=channel_label,
                    )
                )

        inventory = self._get_audio_device_inventory()
        input_device, output_device = self._resolve_snapshot_io_bindings(
            input_device=detail.get("input_device"),
            output_device=detail.get("output_device"),
        )

        if (
            input_device
            and inventory["has_explicit_input_inventory"]
            and input_device not in inventory["input_names"]
        ):
            message = f"Cannot go live: Input device {input_device} is not available on this node."
            failures.append(message)
            issues.append(
                {
                    "code": "missing_input_device",
                    "category": "device",
                    "device_role": "input",
                    "requested_device": input_device,
                    "message": message,
                    "auto_repair": False,
                }
            )
            repair_actions.append(
                self._preflight_repair_action(
                    action="select_available_device",
                    message=f"Select an available input device instead of {input_device}.",
                    device_role="input",
                    requested_device=input_device,
                )
            )

        if (
            output_device
            and inventory["has_explicit_output_inventory"]
            and output_device not in inventory["output_names"]
        ):
            message = f"Cannot go live: Output device {output_device} is not available on this node."
            failures.append(message)
            issues.append(
                {
                    "code": "missing_output_device",
                    "category": "device",
                    "device_role": "output",
                    "requested_device": output_device,
                    "message": message,
                    "auto_repair": False,
                }
            )
            repair_actions.append(
                self._preflight_repair_action(
                    action="select_available_device",
                    message=f"Select an available output device instead of {output_device}.",
                    device_role="output",
                    requested_device=output_device,
                )
            )

        if failures:
            raise SnapshotActivationPreflightError(
                failures,
                issues=issues,
                repair_actions=repair_actions,
            )

    def _normalize_controls_payload(
        self,
        controls_payload: Optional[dict[str, Any]],
        detail_payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        payload = dict(controls_payload or {})
        midi_map = payload.get("midi_map")
        if not isinstance(midi_map, list):
            source = detail_payload or {}
            midi_map = source.get("midi_map", source.get("midiMap", [])) or []
        payload["midi_map"] = [dict(entry) for entry in midi_map if isinstance(entry, dict)]
        payload["automation_lanes"] = [dict(entry) for entry in payload.get("automation_lanes", []) if isinstance(entry, dict)]
        payload["expression_mappings"] = _normalize_expression_mappings_payload(payload.get("expression_mappings", []))
        monitoring_output_index = payload.get("monitoring_output_index")
        if monitoring_output_index is None and isinstance(detail_payload, dict):
            controls_source = detail_payload.get("controls")
            if isinstance(controls_source, dict):
                monitoring_output_index = controls_source.get("monitoring_output_index")
            else:
                io_source = detail_payload.get("io_bindings")
                if isinstance(io_source, dict):
                    monitoring_output_index = io_source.get("monitoring_output_index")
        payload["monitoring_output_index"] = _normalize_monitoring_output_index(monitoring_output_index)
        payload["maschine_encoder_map"] = normalize_maschine_encoder_map(payload.get("maschine_encoder_map"))
        return payload

    async def get_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return await self._serialize_snapshot_detail(snapshot)

    async def get_template(self, template_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(template_id)
        if snapshot is None or self._snapshot_document_type(snapshot) != "template":
            return None
        return await self._serialize_snapshot_detail(snapshot)

    async def get_control_plane_snapshot_id(self) -> Optional[int]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if runtime_state.get("state") == "live":
            snapshot_id = _safe_int(runtime_state.get("snapshot_id"))
            if snapshot_id is None and isinstance(runtime_payload, dict):
                snapshot_id = _safe_int(runtime_payload.get("id"))
            if snapshot_id is not None:
                return snapshot_id

        try:
            from app.services.audio_state_authority import AudioStateAuthorityError, AudioStateAuthorityService

            committed = await AudioStateAuthorityService().get_committed_state()
            snapshot_id = committed.value.source_snapshot.snapshot_id if committed.value.source_snapshot else None
            if snapshot_id is not None:
                return int(snapshot_id)
        except Exception as exc:
            if exc.__class__.__name__ != "AudioStateAuthorityError":
                logger.debug("Control-plane snapshot lookup fell back to runtime compatibility path: %s", exc)
        return None

    async def get_control_plane_snapshot(self) -> Optional[dict[str, Any]]:
        snapshot_id = await self.get_control_plane_snapshot_id()
        if snapshot_id is None:
            return None
        return await self.get_snapshot(snapshot_id)

    async def get_live_snapshot(self) -> Optional[dict[str, Any]]:
        live_detail = await self.get_control_plane_snapshot()
        if live_detail is None:
            return None

        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if runtime_state.get("state") == "live" and isinstance(runtime_payload, dict):
            snapshot_id = _safe_int(runtime_payload.get("id"))
            if snapshot_id == live_detail.get("id"):
                live_detail["snapshot_revision"] = (
                    runtime_state.get("snapshot_revision")
                    or runtime_payload.get("snapshot_revision")
                    or live_detail.get("snapshot_revision")
                )
                controller_display_preview = runtime_payload.get("controller_display_preview")
                if isinstance(controller_display_preview, dict):
                    live_detail["controller_display_preview"] = copy.deepcopy(controller_display_preview)
        return live_detail

    async def create_snapshot(
        self,
        *,
        name: str,
        description: str = "",
        tags: Optional[list[str]] = None,
        program_number: Optional[int] = None,
        tempo_bpm: float = DEFAULT_SNAPSHOT_TEMPO_BPM,
        derived_from_snapshot_id: Optional[int] = None,
        output_level_reference_dbfs: Optional[float] = None,
        output_level_warning_threshold_db: Optional[float] = 3.0,
        input_device: Optional[str] = None,
        output_device: Optional[str] = None,
        controls_payload: Optional[dict[str, Any]] = None,
        detail_payload: Optional[dict[str, Any]] = None,
        is_favorite: bool = False,
        is_locked: bool = False,
        apply_default_system_blocks: bool = True,
        capture_current_authority_extensions: bool = True,
        document_type: str = "snapshot",
    ) -> dict[str, Any]:
        normalized_name = validate_snapshot_name(name)
        await self._validate_program_number(program_number)
        max_order = await self._get_max_display_order()
        resolved_input_device, resolved_output_device = self._resolve_snapshot_io_bindings(
            input_device=input_device,
            output_device=output_device,
        )
        resolved_controls_payload = self._normalize_controls_payload(controls_payload, detail_payload)
        if resolved_controls_payload.get("monitoring_output_index") is None:
            resolved_controls_payload["monitoring_output_index"] = self._get_snapshot_io_defaults().get("monitoring_output_index")
        resolved_controls_payload = self._normalize_controls_payload(resolved_controls_payload, detail_payload)

        snapshot = Snapshot(
            name=normalized_name,
            description=description,
            tags=[],
            program_number=program_number,
            is_favorite=is_favorite,
            is_locked=bool(is_locked),
            display_order=max_order + 1,
            tempo_bpm=_safe_float(tempo_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=derived_from_snapshot_id,
            output_level_reference_dbfs=output_level_reference_dbfs,
            output_level_warning_threshold_db=(
                float(output_level_warning_threshold_db)
                if output_level_warning_threshold_db is not None
                else 3.0
            ),
            input_device=resolved_input_device,
            output_device=resolved_output_device,
            controls_payload=resolved_controls_payload,
        )
        self.session.add(snapshot)
        await self.session.flush()

        normalized = self._normalize_detail_payload(detail_payload or {})
        normalized["extensions"] = await self._resolve_snapshot_persisted_extensions(
            detail_payload,
            capture_current_authority_extensions=capture_current_authority_extensions,
        )
        normalized = await self._resolve_template_linked_normalized(normalized)
        normalized = self._apply_default_system_blocks_to_normalized(
            normalized,
            apply_defaults=apply_default_system_blocks,
        )
        normalized = await self._enrich_normalized_payload(normalized)
        await self._replace_snapshot_state(snapshot, normalized)
        snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
        await self._persist_snapshot_document(snapshot, normalized, document_type=document_type)
        await self.session.flush()

        detail = await self.get_snapshot(snapshot.id)
        assert detail is not None
        return detail

    async def update_snapshot(
        self,
        snapshot_id: int,
        *,
        name: Any = UNSET,
        description: Any = UNSET,
        tags: Any = UNSET,
        program_number: Any = UNSET,
        tempo_bpm: Any = UNSET,
        derived_from_snapshot_id: Any = UNSET,
        output_level_reference_dbfs: Any = UNSET,
        output_level_warning_threshold_db: Any = UNSET,
        input_device: Any = UNSET,
        output_device: Any = UNSET,
        controls_payload: Any = UNSET,
        is_favorite: Any = UNSET,
        is_locked: Any = UNSET,
        display_order: Any = UNSET,
        detail_payload: Any = UNSET,
        create_revision: bool = False,
        capture_current_authority_extensions: bool = True,
        document_type: str = "snapshot",
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        revision_source = await self.get_snapshot(snapshot_id) if create_revision else None
        previous_input_device = snapshot.input_device
        previous_output_device = snapshot.output_device
        previous_monitoring_output_index = self._normalize_controls_payload(
            snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
            None,
        ).get("monitoring_output_index")

        if program_number is not UNSET and program_number != snapshot.program_number:
            await self._validate_program_number(program_number, exclude_snapshot_id=snapshot_id)

        if name is not UNSET:
            snapshot.name = validate_snapshot_name(name)
        if description is not UNSET:
            snapshot.description = description
        if program_number is not UNSET:
            snapshot.program_number = program_number
        if tempo_bpm is not UNSET:
            snapshot.tempo_bpm = _safe_float(tempo_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM)
        if derived_from_snapshot_id is not UNSET:
            snapshot.derived_from_snapshot_id = derived_from_snapshot_id
        if output_level_reference_dbfs is not UNSET:
            snapshot.output_level_reference_dbfs = (
                None if output_level_reference_dbfs is None else float(output_level_reference_dbfs)
            )
        if output_level_warning_threshold_db is not UNSET:
            snapshot.output_level_warning_threshold_db = (
                float(output_level_warning_threshold_db)
                if output_level_warning_threshold_db is not None
                else 3.0
            )
        if input_device is not UNSET:
            snapshot.input_device = input_device
        if output_device is not UNSET:
            snapshot.output_device = output_device
        if controls_payload is not UNSET:
            merged_controls_payload = dict(snapshot.controls_payload or {})
            merged_controls_payload.update(dict(controls_payload or {}))
            snapshot.controls_payload = self._normalize_controls_payload(
                merged_controls_payload,
                detail_payload if detail_payload is not UNSET else None,
            )
        if is_favorite is not UNSET:
            snapshot.is_favorite = bool(is_favorite)
        if is_locked is not UNSET:
            snapshot.is_locked = bool(is_locked)
        if display_order is not UNSET:
            snapshot.display_order = int(display_order)
        snapshot.updated_at = _utcnow()

        if detail_payload is not UNSET:
            normalized = self._normalize_detail_payload(detail_payload)
            normalized["extensions"] = await self._resolve_snapshot_persisted_extensions(
                detail_payload if isinstance(detail_payload, dict) else None,
                capture_current_authority_extensions=capture_current_authority_extensions,
            )
            normalized = await self._resolve_template_linked_normalized(
                normalized,
                existing_snapshot=snapshot,
            )
            normalized = await self._enrich_normalized_payload(normalized)
            await self._replace_snapshot_state(snapshot, normalized)
            snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
        else:
            snapshot.tags = self._derive_snapshot_tags_from_snapshot(snapshot)
            normalized = await self._snapshot_to_normalized(snapshot)

        await self._persist_snapshot_document(snapshot, normalized, document_type=document_type)

        await self.session.flush()
        if create_revision and revision_source is not None:
            await self._append_snapshot_revision(snapshot_id, revision_source)

        detail = await self.get_snapshot(snapshot.id)
        if detail is None:
            return None

        current_runtime_payload: dict[str, Any] | None = None
        is_current_live_snapshot = False
        device_binding_changed = (
            (input_device is not UNSET and _normalize_device_name(previous_input_device) != _normalize_device_name(snapshot.input_device))
            or (output_device is not UNSET and _normalize_device_name(previous_output_device) != _normalize_device_name(snapshot.output_device))
        )
        monitoring_output_changed = (
            previous_monitoring_output_index
            != _normalize_monitoring_output_index(
                (detail.get("controls") or {}).get("monitoring_output_index")
            )
        )
        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            current_runtime_payload = await SnapshotRuntimeStateService(self.session).get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
        except Exception as exc:
            logger.debug("Snapshot runtime live-state lookup skipped for %s: %s", snapshot.id, exc)

        if is_current_live_snapshot:
            try:
                await SnapshotRuntimeStateService(self.session).sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                if device_binding_changed:
                    await self._apply_snapshot_audio_device_bindings(detail)
                if monitoring_output_changed:
                    await self._apply_snapshot_monitoring_output_binding(detail)
            except Exception as exc:
                logger.debug("Snapshot runtime live-state sync skipped for %s: %s", snapshot.id, exc)

        if tempo_bpm is not UNSET:
            try:
                from app.services.snapshot_tempo_service import get_snapshot_tempo_service

                legacy_payload = None
                if is_current_live_snapshot:
                    legacy_payload = copy.deepcopy(self.to_legacy_snapshot_data(detail))
                await get_snapshot_tempo_service().update_stored_tempo(
                    snapshot.id,
                    snapshot.tempo_bpm,
                    snapshot_data=legacy_payload,
                )
            except Exception as exc:
                logger.debug("Snapshot tempo runtime update skipped for %s: %s", snapshot.id, exc)
        return detail

    async def create_template(
        self,
        *,
        name: str,
        description: str = "",
        tags: Optional[list[str]] = None,
        input_device: Optional[str] = None,
        output_device: Optional[str] = None,
        controls_payload: Optional[dict[str, Any]] = None,
        detail_payload: Optional[dict[str, Any]] = None,
        is_favorite: bool = False,
        is_locked: bool = False,
    ) -> dict[str, Any]:
        return await self.create_snapshot(
            name=name,
            description=description,
            tags=tags,
            input_device=input_device,
            output_device=output_device,
            controls_payload=controls_payload,
            detail_payload=detail_payload,
            is_favorite=is_favorite,
            is_locked=is_locked,
            capture_current_authority_extensions=False,
            document_type="template",
        )

    async def update_template(
        self,
        template_id: int,
        **kwargs: Any,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(template_id)
        if snapshot is None or self._snapshot_document_type(snapshot) != "template":
            return None
        kwargs["document_type"] = "template"
        kwargs.setdefault("capture_current_authority_extensions", False)
        updated = await self.update_snapshot(template_id, **kwargs)
        if updated is None:
            return None
        await self._cascade_live_linked_snapshots(template_id)
        return updated

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return False

        control_plane_snapshot_id = await self.get_control_plane_snapshot_id()
        if control_plane_snapshot_id == snapshot_id:
            raise ValueError("Cannot delete a live snapshot.")

        await self.session.delete(snapshot)
        await self.session.flush()
        return True

    async def list_revisions(self, snapshot_id: int) -> Optional[list[dict[str, Any]]]:
        return await self.state_authority_revisions.list_revisions(snapshot_id)

    async def restore_revision(
        self,
        snapshot_id: int,
        revision_number: int,
    ) -> Optional[dict[str, Any]]:
        return await self.state_authority_revisions.restore_revision(snapshot_id, revision_number)

    async def duplicate_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        duplicate_name = await self._build_duplicate_snapshot_name(snapshot.get("name"))
        duplicate_controls_payload = _clear_snapshot_program_assignments(copy.deepcopy(snapshot.get("controls") or {}))
        duplicate_detail_payload = _clear_snapshot_program_assignments(copy.deepcopy(snapshot))
        return await self.create_snapshot(
            name=duplicate_name,
            description=snapshot.get("description", ""),
            tags=list(snapshot.get("tags", [])),
            program_number=None,
            tempo_bpm=_safe_float(snapshot.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=snapshot_id,
            input_device=snapshot.get("input_device"),
            output_device=snapshot.get("output_device"),
            controls_payload=duplicate_controls_payload,
            detail_payload=duplicate_detail_payload,
            is_favorite=bool(snapshot.get("is_favorite", False)),
            is_locked=False,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )

    async def save_snapshot_as_new(
        self,
        snapshot_id: int,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        next_name = name if name is not None else sanitize_snapshot_name_seed(snapshot.get("name"))
        return await self.create_snapshot(
            name=next_name,
            description=snapshot.get("description", "") if description is None else description,
            tags=list(snapshot.get("tags", [])),
            program_number=None,
            tempo_bpm=_safe_float(snapshot.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            derived_from_snapshot_id=snapshot_id,
            input_device=snapshot.get("input_device"),
            output_device=snapshot.get("output_device"),
            controls_payload=snapshot.get("controls"),
            detail_payload=snapshot,
            is_favorite=bool(snapshot.get("is_favorite", False)),
            is_locked=False,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )

    @staticmethod
    def _snapshot_spillover_candidate_counts(detail: dict[str, Any] | None) -> dict[str, int]:
        counts = {uri: 0 for uri in _SNAPSHOT_SPILLOVER_NATIVE_URIS}
        if not isinstance(detail, dict):
            return counts
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                if bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri in counts:
                    counts[uri] += 1
        return counts

    @staticmethod
    def _snapshot_spillover_candidate_signatures(detail: dict[str, Any] | None) -> dict[str, list[str]]:
        signatures = {uri: [] for uri in _SNAPSHOT_SPILLOVER_NATIVE_URIS}
        if not isinstance(detail, dict):
            return signatures
        for chain in detail.get("chains", []):
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                if bool(plugin.get("bypass", False)):
                    continue
                uri = str(plugin.get("uri") or "")
                if uri not in signatures:
                    continue
                signature = {
                    "parameters": plugin.get("parameters", {}),
                    "loader_state": plugin.get("loader_state", {}),
                    "mix": plugin.get("mix"),
                    "plugin_position": plugin.get("plugin_position", plugin.get("position")),
                }
                signatures[uri].append(json.dumps(signature, sort_keys=True, default=str))
        for uri in signatures:
            signatures[uri].sort()
        return signatures

    async def _arm_live_spillover_processors(
        self,
        *,
        current_live_detail: dict[str, Any] | None,
        target_detail: dict[str, Any],
    ) -> None:
        await self.state_authority_activation.arm_live_spillover_processors(
            current_live_detail=current_live_detail,
            target_detail=target_detail,
        )

    async def activate_snapshot(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> Optional[dict[str, Any]]:
        return await self.state_authority_activation.activate_snapshot(
            snapshot_id,
            triggered_by=triggered_by,
        )

    async def preview_snapshot(self, detail_payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_detail_payload(detail_payload)
        normalized = await self._enrich_normalized_payload(normalized)
        detail = self._normalized_to_detail(normalized, snapshot_row=None)

        params_applied = 0
        bypass_applied = 0
        try:
            params_applied, bypass_applied = await snapshot_runtime_service.apply_snapshot_to_engine(
                copy.deepcopy(self.to_legacy_snapshot_data(detail))
            )
        except Exception as exc:
            logger.debug("Snapshot preview skipped runtime apply: %s", exc)

        return {
            "status": "success",
            "snapshot_data": detail,
            "chains_created": 0,
            "params_applied": params_applied,
            "bypass_applied": bypass_applied,
        }

    async def add_channel(self, snapshot_id: int, payload: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        next_index = len(snapshot.channels)
        payload = payload or {}
        channel = SnapshotChannel(
            snapshot_id=snapshot.id,
            chain_id=_safe_int(payload.get("chain_id", payload.get("chainId"))),
            channel_key=str(payload.get("channel_key") or payload.get("id") or f"channel-{next_index}"),
            label=str(payload.get("label") or _stable_channel_label(next_index)),
            color=str(payload.get("color") or DEFAULT_CHANNEL_COLOR),
            muted=_normalize_bool(payload.get("muted"), False),
            solo=_normalize_bool(payload.get("solo"), False),
            dry_wet_mix=_safe_float(payload.get("dry_wet_mix", payload.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
            order_index=next_index,
        )
        self.session.add(channel)
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def update_channel(
        self,
        snapshot_id: int,
        channel_id: int,
        payload: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        channel = await self._get_channel(snapshot_id, channel_id)
        if channel is None:
            return None

        if "chain_id" in payload or "chainId" in payload:
            channel.chain_id = _safe_int(payload.get("chain_id", payload.get("chainId")))
        if "channel_key" in payload or "id" in payload:
            channel.channel_key = str(payload.get("channel_key") or payload.get("id") or channel.channel_key)
        if "label" in payload:
            channel.label = str(payload.get("label") or channel.label)
        if "color" in payload:
            channel.color = str(payload.get("color") or channel.color)
        if "muted" in payload:
            channel.muted = _normalize_bool(payload.get("muted"), channel.muted)
        if "solo" in payload:
            channel.solo = _normalize_bool(payload.get("solo"), channel.solo)
        if "dry_wet_mix" in payload or "dryWetMix" in payload:
            channel.dry_wet_mix = _safe_float(payload.get("dry_wet_mix", payload.get("dryWetMix")), channel.dry_wet_mix)
        if "order_index" in payload or "order" in payload:
            channel.order_index = _safe_int(payload.get("order_index", payload.get("order"))) or channel.order_index

        channel.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot_id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot_id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                detail["channel_state_apply"] = await self._sync_snapshot_channel_state_to_runtime(detail)
                await self._publish_snapshot_desired_state(detail)
        except Exception as exc:
            logger.debug("Snapshot channel live-state/authority sync skipped for %s: %s", snapshot_id, exc)

        return detail

    async def remove_channel(self, snapshot_id: int, channel_id: int) -> Optional[dict[str, Any]]:
        channel = await self._get_channel(snapshot_id, channel_id)
        if channel is None:
            return None
        await self.session.delete(channel)
        await self.session.flush()
        await self._resequence_channels(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def create_chain(self, snapshot_id: int, name: str) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        next_index = len(snapshot.chains)
        chain = SnapshotChain(snapshot_id=snapshot.id, name=name.strip() or f"Chain {next_index + 1}", order_index=next_index)
        self.session.add(chain)
        await self.session.flush()
        system_gate = build_system_noise_gate_plugin(position=0)
        self.session.add(
            SnapshotChainPlugin(
                snapshot_chain_id=chain.id,
                plugin_uri=system_gate["uri"],
                plugin_name=system_gate["name"],
                position=0,
                bypass=bool(system_gate.get("bypass", False)),
                parameters=dict(system_gate.get("parameters") or {}),
                loader_state=dict(system_gate.get("loader_state") or {}),
                is_placeholder=bool(system_gate.get("is_placeholder", False)),
            )
        )
        await self.session.flush()
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def rename_chain(self, snapshot_id: int, chain_id: int, name: str) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        chain.name = name.strip() or chain.name
        chain.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def add_plugin(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_uri: str,
        *,
        plugin_name: Optional[str] = None,
        loader_state: Optional[dict[str, Any]] = None,
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        next_position = len(chain.plugins)
        loader_state = loader_state or {}
        plugin = SnapshotChainPlugin(
            snapshot_chain_id=chain.id,
            plugin_uri=plugin_uri,
            plugin_name=plugin_name,
            position=next_position,
            bypass=False,
            parameters={},
            loader_state=loader_state,
            is_placeholder=not _plugin_available(plugin_uri),
        )
        self.session.add(plugin)
        await self.session.flush()
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def remove_plugin(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        if self._snapshot_chain_plugin_is_system_noise_gate(plugin):
            raise ValueError("The system noise gate cannot be removed from a snapshot chain.")
        await self.session.delete(plugin)
        await self.session.flush()
        await self._resequence_plugins(chain_id)
        await self._sync_snapshot_tags(snapshot_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def reorder_plugins(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_ids: list[int],
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        plugin_map = {plugin.id: plugin for plugin in chain.plugins}
        system_gate_plugin = next(
            (plugin for plugin in chain.plugins if self._snapshot_chain_plugin_is_system_noise_gate(plugin)),
            None,
        )
        if system_gate_plugin is not None:
            if not plugin_ids or plugin_ids[0] != system_gate_plugin.id:
                raise ValueError("The system noise gate must stay in the first position.")
        for index, plugin_id in enumerate(plugin_ids):
            plugin = plugin_map.get(plugin_id)
            if plugin is not None:
                plugin.position = index
        await self.session.flush()
        await self._resequence_plugins(chain_id)
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def set_plugin_bypass(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
        bypass: bool,
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        plugin.bypass = bool(bypass)
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def set_plugin_parameters(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_id: int,
        parameters: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        plugin = await self._get_plugin(snapshot_id, chain_id, plugin_id)
        if plugin is None:
            return None
        next_parameters: dict[str, float] = {}
        for key, value in dict(parameters).items():
            try:
                next_parameters[str(key)] = float(value)
            except (TypeError, ValueError):
                continue
        plugin.parameters = next_parameters
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def update_plugin_parameter_by_position(
        self,
        snapshot_id: int,
        chain_id: int,
        plugin_position: int,
        parameter_key: str,
        value: float,
    ) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        plugin = next(
            (
                item
                for item in chain.plugins
                if int(getattr(item, "position", -1)) == int(plugin_position)
            ),
            None,
        )
        if plugin is None:
            return None
        parameters = dict(plugin.parameters or {})
        parameters[str(parameter_key)] = float(value)
        plugin.parameters = parameters
        plugin.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot_id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot_id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
        except Exception as exc:
            logger.debug("Snapshot parameter live sync skipped for %s: %s", snapshot_id, exc)
        return detail

    async def update_routing(self, snapshot_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        routing = snapshot.routing
        if routing is None:
            routing = SnapshotRouting(snapshot_id=snapshot.id)
            self.session.add(routing)
            await self.session.flush()
        previous_mode = _normalize_mode(routing.mode)

        if "mode" in payload:
            routing.mode = _normalize_mode(payload.get("mode"))
        if "active_channel_key" in payload or "activeChannelId" in payload or "activeSlotId" in payload:
            routing.active_channel_key = str(
                payload.get("active_channel_key")
                or payload.get("activeChannelId")
                or payload.get("activeSlotId")
                or ""
            ) or None
        if "blend_positions" in payload or "blendPositions" in payload:
            blend_positions = payload.get("blend_positions", payload.get("blendPositions")) or {}
            routing.blend_positions = dict(blend_positions) if isinstance(blend_positions, dict) else {}
        if "morph_position" in payload or "morphProgress" in payload:
            routing.morph_position = _safe_float(payload.get("morph_position", payload.get("morphProgress")), routing.morph_position)
        if "morph_source_channel_key" in payload or "morphSourceChannelId" in payload or "morphSourceSlotId" in payload:
            routing.morph_source_channel_key = str(
                payload.get("morph_source_channel_key")
                or payload.get("morphSourceChannelId")
                or payload.get("morphSourceSlotId")
                or ""
            ) or None
        if "morph_target_channel_key" in payload or "morphTargetChannelId" in payload or "morphTargetSlotId" in payload:
            routing.morph_target_channel_key = str(
                payload.get("morph_target_channel_key")
                or payload.get("morphTargetChannelId")
                or payload.get("morphTargetSlotId")
                or ""
            ) or None
        if "series_order" in payload or "seriesOrder" in payload:
            series_order = payload.get("series_order", payload.get("seriesOrder")) or []
            routing.series_order = list(series_order) if isinstance(series_order, list) else []
        routing.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                requested_mode = _normalize_mode(detail.get("routing", {}).get("mode"))
                routing_requires_reactivation = False
                detail["routing_requires_reactivation"] = routing_requires_reactivation
                detail["routing_mode_changed_live"] = requested_mode != previous_mode
                detail["routing_apply"] = await snapshot_runtime_service.apply_snapshot_routing_to_engine(detail)
                detail["morph_apply"] = await snapshot_runtime_service.apply_snapshot_morph_to_engine(detail)
                await self._publish_snapshot_desired_state(detail)
        except Exception as exc:
            logger.debug("Snapshot routing live-state/authority sync skipped for %s: %s", snapshot.id, exc)

        return detail

    async def set_morph_position(self, snapshot_id: int, morph_position: float) -> Optional[dict[str, Any]]:
        return await self.update_routing(snapshot_id, {"morph_position": morph_position})

    async def replace_midi_map(self, snapshot_id: int, entries: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        midi_map = snapshot.midi_map
        if midi_map is None:
            midi_map = SnapshotMidiMap(snapshot_id=snapshot.id, entries=[])
            self.session.add(midi_map)
            await self.session.flush()

        normalized_entries = [dict(entry) for entry in entries]
        midi_map.entries = normalized_entries
        midi_map.updated_at = _utcnow()
        merged_controls_payload = dict(snapshot.controls_payload or {})
        merged_controls_payload["midi_map"] = normalized_entries
        snapshot.controls_payload = self._normalize_controls_payload(
            merged_controls_payload,
            {"midi_map": normalized_entries},
        )
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        await self._sync_snapshot_document_from_relational_projection(snapshot_id)
        detail = await self._reload_snapshot_detail(snapshot_id)
        if detail is None:
            return None

        try:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state_service = SnapshotRuntimeStateService(self.session)
            current_runtime_payload = await runtime_state_service.get_live_snapshot_payload()
            is_current_live_snapshot = (
                isinstance(current_runtime_payload, dict)
                and int(current_runtime_payload.get("id") or 0) == int(snapshot.id)
            )
            if is_current_live_snapshot:
                await runtime_state_service.sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
                await self._sync_snapshot_midi_map_to_engine(snapshot.id, normalized_entries)
        except Exception as exc:
            logger.debug("Snapshot MIDI-map live sync skipped for %s: %s", snapshot.id, exc)

        return detail

    async def export_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None
        payload = {
            "version": SNAPSHOT_BUNDLE_FORMAT_VERSION,
            "exported_at": _utcnow().isoformat(),
            "snapshot": detail,
            "asset_manifest": self._build_asset_manifest(detail),
        }
        gcp_payload = await self._build_ground_control_pro_bundle_payload(detail)
        if gcp_payload is not None:
            payload[_GROUND_CONTROL_PRO_EXTENSION_KEY] = gcp_payload
        return payload

    async def export_template(self, template_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_template(template_id)
        if detail is None:
            return None
        payload = {
            "version": SNAPSHOT_BUNDLE_FORMAT_VERSION,
            "exported_at": _utcnow().isoformat(),
            "template": detail,
            "asset_manifest": self._build_asset_manifest(detail),
        }
        gcp_payload = await self._build_ground_control_pro_bundle_payload(detail)
        if gcp_payload is not None:
            payload[_GROUND_CONTROL_PRO_EXTENSION_KEY] = gcp_payload
        return payload

    async def export_template_bundle(self, template_id: int) -> Optional[dict[str, Any]]:
        payload = await self.export_template(template_id)
        if payload is None:
            return None
        template_name = str(payload.get("template", {}).get("name") or f"template-{template_id}").strip() or f"template-{template_id}"
        return self._build_document_bundle(
            payload,
            name=template_name,
            extension=".map2template",
        )

    async def export_snapshot_bundle(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        payload = await self.export_snapshot(snapshot_id)
        if payload is None:
            return None
        snapshot_name = str(payload.get("snapshot", {}).get("name") or f"snapshot-{snapshot_id}").strip() or f"snapshot-{snapshot_id}"
        return self._build_document_bundle(
            payload,
            name=snapshot_name,
            extension=".map2snapshot",
        )

    async def import_snapshot(self, payload: dict[str, Any] | bytes | bytearray) -> dict[str, Any]:
        if isinstance(payload, (bytes, bytearray)):
            detail_payload = await self._extract_snapshot_bundle_payload(bytes(payload))
        elif "snapshot" in payload and isinstance(payload["snapshot"], dict):
            detail_payload = payload["snapshot"]
        else:
            detail_payload = payload

        name = str(detail_payload.get("name") or "Imported Snapshot")
        imported = await self.create_snapshot(
            name=name,
            description=str(detail_payload.get("description") or ""),
            tags=list(detail_payload.get("tags") or []),
            tempo_bpm=_safe_float(detail_payload.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            input_device=detail_payload.get("input_device"),
            output_device=detail_payload.get("output_device"),
            detail_payload=detail_payload,
            apply_default_system_blocks=False,
            capture_current_authority_extensions=False,
        )
        return imported

    async def import_template(self, payload: dict[str, Any] | bytes | bytearray) -> dict[str, Any]:
        if isinstance(payload, (bytes, bytearray)):
            detail_payload = await self._extract_snapshot_bundle_payload(bytes(payload))
        elif "template" in payload and isinstance(payload["template"], dict):
            detail_payload = payload["template"]
        else:
            detail_payload = payload

        name = str(detail_payload.get("name") or "Imported Template")
        return await self.create_template(
            name=name,
            description=str(detail_payload.get("description") or ""),
            tags=list(detail_payload.get("tags") or []),
            input_device=detail_payload.get("input_device"),
            output_device=detail_payload.get("output_device"),
            detail_payload=detail_payload,
            is_locked=bool(detail_payload.get("is_locked", False)),
        )

    async def _resolve_template_linked_normalized(
        self,
        normalized: dict[str, Any],
        *,
        existing_snapshot: Snapshot | None = None,
    ) -> dict[str, Any]:
        extensions = copy.deepcopy(normalized.get("extensions") or {})
        template_link = self._extract_template_link_metadata(extensions)
        if template_link is None and existing_snapshot is not None:
            existing_extensions = (
                copy.deepcopy(existing_snapshot.extensions_payload)
                if isinstance(existing_snapshot.extensions_payload, dict)
                else {}
            )
            existing_link = self._extract_template_link_metadata(existing_extensions)
            if existing_link is not None:
                extensions = self._set_template_link_metadata(extensions, existing_link)
                normalized = copy.deepcopy(normalized)
                normalized["extensions"] = extensions
                template_link = existing_link
        if template_link is None:
            return normalized

        template_id = _safe_int(template_link.get("template_id"))
        if template_id is None:
            raise ValueError("Template live-link metadata requires a valid template_id.")

        template_snapshot = await self._get_snapshot_model(template_id)
        if template_snapshot is None or self._snapshot_document_type(template_snapshot) != "template":
            raise ValueError(f"Template {template_id} not found.")

        base_normalized = await self._snapshot_to_normalized(template_snapshot)
        base_for_overlay = self._strip_template_link_namespace(base_normalized)
        current_for_overlay = self._strip_template_link_namespace(normalized)
        overlay = template_link.get("overlay")
        if not isinstance(overlay, dict):
            overlay = self._build_template_overlay(base_for_overlay, current_for_overlay)

        merged = self._merge_template_overlay(base_for_overlay, overlay)
        merged_extensions = copy.deepcopy(merged.get("extensions") or {})
        merged_extensions = self._set_template_link_metadata(
            merged_extensions,
            {
                "template_id": int(template_id),
                "live_link": bool(template_link.get("live_link", True)),
                "overlay": overlay,
            },
        )
        merged["extensions"] = merged_extensions
        return merged

    async def _cascade_live_linked_snapshots(self, template_id: int) -> None:
        result = await self.session.execute(select(Snapshot.id))
        snapshot_ids = [int(snapshot_id) for snapshot_id in result.scalars().all()]
        for snapshot_id in snapshot_ids:
            snapshot = await self._get_snapshot_model(snapshot_id)
            if snapshot is None:
                continue
            if self._snapshot_document_type(snapshot) == "template":
                continue
            template_link = self._extract_template_link_metadata(snapshot.extensions_payload or {})
            if not isinstance(template_link, dict):
                continue
            if not bool(template_link.get("live_link", True)):
                continue
            if _safe_int(template_link.get("template_id")) != int(template_id):
                continue

            linked_normalized = await self._snapshot_to_normalized(snapshot)
            resolved = await self._resolve_template_linked_normalized(
                linked_normalized,
                existing_snapshot=snapshot,
            )
            resolved = await self._enrich_normalized_payload(resolved)
            await self._replace_snapshot_state(snapshot, resolved)
            snapshot.tags = self._derive_snapshot_tags_from_normalized(resolved)
            await self._persist_snapshot_document(snapshot, resolved, document_type="snapshot")
        await self.session.flush()

    @staticmethod
    def _template_link_path(extensions: dict[str, Any]) -> dict[str, Any] | None:
        namespace = extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if not isinstance(namespace, dict):
            return None
        template_link = namespace.get(_TEMPLATE_LINK_KEY)
        return template_link if isinstance(template_link, dict) else None

    @classmethod
    def _extract_template_link_metadata(cls, extensions: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(extensions, dict):
            return None
        template_link = cls._template_link_path(extensions)
        if not isinstance(template_link, dict):
            return None
        template_id = _safe_int(template_link.get("template_id"))
        if template_id is None:
            return None
        return {
            "template_id": int(template_id),
            "live_link": bool(template_link.get("live_link", True)),
            "overlay": (
                copy.deepcopy(template_link.get("overlay"))
                if isinstance(template_link.get("overlay"), dict)
                else None
            ),
        }

    @staticmethod
    def _set_template_link_metadata(extensions: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
        next_extensions = copy.deepcopy(extensions or {})
        namespace = next_extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if not isinstance(namespace, dict):
            namespace = {}
        namespace[_TEMPLATE_LINK_KEY] = {
            "template_id": int(metadata["template_id"]),
            "live_link": bool(metadata.get("live_link", True)),
            "overlay": copy.deepcopy(metadata.get("overlay") or {}),
        }
        next_extensions[_TEMPLATE_LINK_NAMESPACE] = namespace
        return next_extensions

    @classmethod
    def _strip_template_link_namespace(cls, normalized: dict[str, Any]) -> dict[str, Any]:
        cleaned = copy.deepcopy(normalized)
        extensions = cleaned.get("extensions")
        if not isinstance(extensions, dict):
            cleaned["extensions"] = {}
            return cleaned
        namespace = extensions.get(_TEMPLATE_LINK_NAMESPACE)
        if isinstance(namespace, dict):
            namespace = dict(namespace)
            namespace.pop(_TEMPLATE_LINK_KEY, None)
            if namespace:
                extensions[_TEMPLATE_LINK_NAMESPACE] = namespace
            else:
                extensions.pop(_TEMPLATE_LINK_NAMESPACE, None)
        cleaned["extensions"] = extensions
        return cleaned

    def _build_template_overlay(
        self,
        base: dict[str, Any],
        current: dict[str, Any],
    ) -> dict[str, Any]:
        overlay: dict[str, Any] = {}

        channel_overlay = self._build_template_channel_overlay(
            base.get("channels") or [],
            current.get("channels") or [],
        )
        if channel_overlay:
            overlay["channels"] = channel_overlay

        chain_overlay = self._build_template_chain_overlay(
            base.get("chains") or [],
            current.get("chains") or [],
        )
        if chain_overlay:
            overlay["chains"] = chain_overlay

        routing_overlay = self._deep_diff_mapping(
            base.get("routing") or {},
            current.get("routing") or {},
        )
        if routing_overlay:
            overlay["routing"] = routing_overlay

        if self._canonicalize_json_value_for_templates(base.get("midi_map") or []) != self._canonicalize_json_value_for_templates(current.get("midi_map") or []):
            overlay["midi_map"] = copy.deepcopy(current.get("midi_map") or [])

        extensions_overlay = self._deep_diff_mapping(
            base.get("extensions") or {},
            current.get("extensions") or {},
        )
        if extensions_overlay:
            overlay["extensions"] = extensions_overlay

        return overlay

    def _merge_template_overlay(
        self,
        base: dict[str, Any],
        overlay: dict[str, Any],
    ) -> dict[str, Any]:
        merged = copy.deepcopy(base)
        merged["channels"] = self._merge_template_channels(
            base.get("channels") or [],
            overlay.get("channels") or [],
        )
        merged["chains"] = self._merge_template_chains(
            base.get("chains") or [],
            overlay.get("chains") or [],
        )
        if "routing" in overlay:
            merged["routing"] = self._deep_merge_mapping(
                base.get("routing") or {},
                overlay.get("routing") or {},
            )
        if "midi_map" in overlay:
            merged["midi_map"] = copy.deepcopy(overlay.get("midi_map") or [])
        if "extensions" in overlay:
            merged["extensions"] = self._deep_merge_mapping(
                base.get("extensions") or {},
                overlay.get("extensions") or {},
            )
        return merged

    @staticmethod
    def _canonicalize_json_value_for_templates(value: Any) -> Any:
        return _canonicalize_json_value(value)

    def _build_template_channel_overlay(
        self,
        base_channels: list[dict[str, Any]],
        current_channels: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        base_by_key = {
            str(channel.get("channel_key")): channel
            for channel in base_channels
            if isinstance(channel, dict) and channel.get("channel_key") is not None
        }
        overlay: list[dict[str, Any]] = []
        for channel in current_channels:
            if not isinstance(channel, dict) or channel.get("channel_key") is None:
                continue
            channel_key = str(channel.get("channel_key"))
            base_channel = base_by_key.get(channel_key)
            if base_channel is None:
                overlay.append(copy.deepcopy(channel))
                continue
            diff = self._deep_diff_mapping(base_channel, channel)
            if diff:
                diff["channel_key"] = channel_key
                overlay.append(diff)
        return overlay

    def _merge_template_channels(
        self,
        base_channels: list[dict[str, Any]],
        overlay_channels: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_by_key = {
            str(channel.get("channel_key")): copy.deepcopy(channel)
            for channel in base_channels
            if isinstance(channel, dict) and channel.get("channel_key") is not None
        }
        ordered_keys = [str(channel.get("channel_key")) for channel in base_channels if isinstance(channel, dict) and channel.get("channel_key") is not None]
        for channel in overlay_channels:
            if not isinstance(channel, dict) or channel.get("channel_key") is None:
                continue
            channel_key = str(channel.get("channel_key"))
            if channel_key in merged_by_key:
                merged_by_key[channel_key] = self._deep_merge_mapping(merged_by_key[channel_key], channel)
            else:
                merged_by_key[channel_key] = copy.deepcopy(channel)
                ordered_keys.append(channel_key)
        return [merged_by_key[key] for key in ordered_keys if key in merged_by_key]

    def _build_template_chain_overlay(
        self,
        base_chains: list[dict[str, Any]],
        current_chains: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        base_by_key = {
            self._template_chain_overlay_key(chain, index): chain
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        }
        overlay: list[dict[str, Any]] = []
        for index, chain in enumerate(current_chains):
            if not isinstance(chain, dict):
                continue
            chain_key = self._template_chain_overlay_key(chain, index)
            base_chain = base_by_key.get(chain_key)
            if base_chain is None:
                overlay.append(copy.deepcopy(chain))
                continue
            chain_diff: dict[str, Any] = {
                "source_key": str(chain.get("source_key") or ""),
                "template_chain_name": str(chain.get("name") or ""),
            }
            if chain.get("name") != base_chain.get("name"):
                chain_diff["name"] = chain.get("name")
            plugin_overlay = self._build_template_plugin_overlay(
                base_chain.get("plugins") or [],
                chain.get("plugins") or [],
            )
            if plugin_overlay:
                chain_diff["plugins"] = plugin_overlay
            if self._canonicalize_json_value_for_templates(base_chain.get("loop_insertions") or []) != self._canonicalize_json_value_for_templates(chain.get("loop_insertions") or []):
                chain_diff["loop_insertions"] = copy.deepcopy(chain.get("loop_insertions") or [])
            if self._canonicalize_json_value_for_templates(base_chain.get("effects_loops") or []) != self._canonicalize_json_value_for_templates(chain.get("effects_loops") or []):
                chain_diff["effects_loops"] = copy.deepcopy(chain.get("effects_loops") or [])
            if len(chain_diff) > 1:
                overlay.append(chain_diff)
        return overlay

    def _merge_template_chains(
        self,
        base_chains: list[dict[str, Any]],
        overlay_chains: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_by_key = {
            self._template_chain_overlay_key(chain, index): copy.deepcopy(chain)
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        }
        ordered_keys = [
            self._template_chain_overlay_key(chain, index)
            for index, chain in enumerate(base_chains)
            if isinstance(chain, dict)
        ]
        for index, chain in enumerate(overlay_chains):
            if not isinstance(chain, dict):
                continue
            chain_key = self._template_chain_overlay_key(chain, index)
            if chain_key not in merged_by_key:
                merged_by_key[chain_key] = copy.deepcopy(chain)
                ordered_keys.append(chain_key)
                continue
            merged_chain = merged_by_key[chain_key]
            if "name" in chain:
                merged_chain["name"] = chain.get("name")
            if "plugins" in chain:
                merged_chain["plugins"] = self._merge_template_plugins(
                    merged_chain.get("plugins") or [],
                    chain.get("plugins") or [],
                )
            if "loop_insertions" in chain:
                merged_chain["loop_insertions"] = copy.deepcopy(chain.get("loop_insertions") or [])
            if "effects_loops" in chain:
                merged_chain["effects_loops"] = copy.deepcopy(chain.get("effects_loops") or [])
            merged_by_key[chain_key] = merged_chain
        return [merged_by_key[key] for key in ordered_keys if key in merged_by_key]

    @staticmethod
    def _template_chain_overlay_key(chain: dict[str, Any], index: int) -> str:
        template_name = str(chain.get("template_chain_name") or "").strip()
        if template_name:
            return f"name:{template_name}"
        name = str(chain.get("name") or "").strip()
        if name:
            return f"name:{name}"
        source_key = str(chain.get("source_key") or "").strip()
        if source_key:
            return f"source:{source_key}"
        return f"index:{index}"

    def _build_template_plugin_overlay(
        self,
        base_plugins: list[dict[str, Any]],
        current_plugins: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        overlay: list[dict[str, Any]] = []
        max_length = max(len(base_plugins), len(current_plugins))
        for index in range(max_length):
            current_plugin = current_plugins[index] if index < len(current_plugins) and isinstance(current_plugins[index], dict) else None
            base_plugin = base_plugins[index] if index < len(base_plugins) and isinstance(base_plugins[index], dict) else None
            if current_plugin is None:
                continue
            if base_plugin is None:
                overlay.append(copy.deepcopy(current_plugin))
                continue
            diff = self._deep_diff_mapping(base_plugin, current_plugin)
            if diff:
                diff["position"] = int(current_plugin.get("position", index))
                overlay.append(diff)
        return overlay

    def _merge_template_plugins(
        self,
        base_plugins: list[dict[str, Any]],
        overlay_plugins: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        merged_plugins = [copy.deepcopy(plugin) for plugin in base_plugins if isinstance(plugin, dict)]
        for index, plugin in enumerate(overlay_plugins):
            if not isinstance(plugin, dict):
                continue
            position = _safe_int(plugin.get("position"))
            if position is None:
                position = index
            while len(merged_plugins) <= position:
                merged_plugins.append({})
            if merged_plugins[position]:
                merged_plugins[position] = self._deep_merge_mapping(merged_plugins[position], plugin)
            else:
                merged_plugins[position] = copy.deepcopy(plugin)
        return merged_plugins

    def _deep_diff_mapping(self, base: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
        diff: dict[str, Any] = {}
        for key, current_value in current.items():
            base_value = base.get(key)
            if isinstance(current_value, dict) and isinstance(base_value, dict):
                nested = self._deep_diff_mapping(base_value, current_value)
                if nested:
                    diff[key] = nested
                continue
            if self._canonicalize_json_value_for_templates(base_value) != self._canonicalize_json_value_for_templates(current_value):
                diff[key] = copy.deepcopy(current_value)
        return diff

    def _deep_merge_mapping(self, base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
        merged = copy.deepcopy(base)
        for key, value in override.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge_mapping(merged[key], value)
            else:
                merged[key] = copy.deepcopy(value)
        return merged

    async def get_snapshot_by_program(self, program_number: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.program_number == program_number))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None
        loaded = await self._get_snapshot_model(snapshot.id)
        return self._serialize_snapshot_summary(loaded) if loaded is not None else None

    async def share_snapshot(self, snapshot_id: int, *, author_name: str = "Anonymous") -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        if self._snapshot_document_type(snapshot) == "template":
            return None
        snapshot.community_shared = True
        snapshot.community_author = author_name.strip() or "Anonymous"
        if not snapshot.community_uuid:
            snapshot.community_uuid = uuid4().hex
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def share_template(self, template_id: int, *, author_name: str = "Anonymous") -> Optional[dict[str, Any]]:
        template = await self._get_snapshot_model(template_id)
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        template.community_shared = True
        template.community_author = author_name.strip() or "Anonymous"
        if not template.community_uuid:
            template.community_uuid = uuid4().hex
        template.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(template.id)

    async def browse_community_snapshots(
        self,
        *,
        query: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
        author: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        summaries = await self.list_snapshots(include_shared_only=True)
        query = (query or "").strip().lower()
        tag_set = {tag.strip().lower() for tag in (tags or []) if tag and tag.strip()}
        author = (author or "").strip().lower()

        results: list[dict[str, Any]] = []
        for summary in summaries:
            haystack = " ".join(
                [
                    str(summary.get("name", "")),
                    str(summary.get("description", "")),
                    " ".join(summary.get("tags", [])),
                    str(summary.get("community_author", "")),
                ]
            ).lower()
            if query and query not in haystack:
                continue
            if author and author not in str(summary.get("community_author", "")).lower():
                continue
            if tag_set:
                summary_tags = {tag.lower() for tag in summary.get("tags", [])}
                if not tag_set.issubset(summary_tags):
                    continue
            results.append(summary)
        return results

    async def browse_community_templates(
        self,
        *,
        query: Optional[str] = None,
        tags: Optional[Iterable[str]] = None,
        author: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        templates = await self.list_templates(include_shared_only=True)
        query = (query or "").strip().lower()
        tag_set = {tag.strip().lower() for tag in (tags or []) if tag and tag.strip()}
        author = (author or "").strip().lower()

        results: list[dict[str, Any]] = []
        for template in templates:
            haystack = " ".join(
                [
                    str(template.get("name", "")),
                    str(template.get("description", "")),
                    " ".join(template.get("tags", [])),
                    str(template.get("community_author", "")),
                ]
            ).lower()
            if query and query not in haystack:
                continue
            if author and author not in str(template.get("community_author", "")).lower():
                continue
            if tag_set:
                template_tags = {tag.lower() for tag in template.get("tags", [])}
                if not tag_set.issubset(template_tags):
                    continue
            results.append(template)
        return results

    async def rate_community_snapshot(self, community_uuid: str, rating: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None or self._snapshot_document_type(snapshot) == "template":
            return None
        rating = max(1, min(5, int(rating)))
        snapshot.community_rating_sum = float(snapshot.community_rating_sum or 0.0) + rating
        snapshot.community_rating_count = int(snapshot.community_rating_count or 0) + 1
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def rate_community_template(self, community_uuid: str, rating: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        template = result.scalar_one_or_none()
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        rating = max(1, min(5, int(rating)))
        template.community_rating_sum = float(template.community_rating_sum or 0.0) + rating
        template.community_rating_count = int(template.community_rating_count or 0) + 1
        template.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(template.id)

    async def record_community_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None or self._snapshot_document_type(snapshot) == "template":
            return None
        snapshot_id = snapshot.id
        snapshot.community_download_count = int(snapshot.community_download_count or 0) + 1
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        self.session.expire_all()
        export_payload = await self.export_snapshot(snapshot_id)
        if export_payload is None:
            return None
        export_payload["community_uuid"] = community_uuid
        return export_payload

    async def record_community_template_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        template = result.scalar_one_or_none()
        if template is None or self._snapshot_document_type(template) != "template":
            return None
        template_id = template.id
        template.community_download_count = int(template.community_download_count or 0) + 1
        template.updated_at = _utcnow()
        await self.session.flush()
        self.session.expire_all()
        export_payload = await self.export_template_bundle(template_id)
        if export_payload is None:
            return None
        export_payload["community_uuid"] = community_uuid
        return export_payload

    async def create_deployment(
        self,
        snapshot_id: int,
        *,
        primary_node_id: str,
        standby_node_ids: Optional[list[str]] = None,
        assignment_strategy: str = "manual",
        redundancy_enabled: bool = False,
        deployment_status: str = "deploying",
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        deployment = SnapshotDeployment(
            snapshot_id=snapshot.id,
            primary_node_id=primary_node_id,
            standby_node_ids=list(standby_node_ids or []),
            assignment_strategy=assignment_strategy,
            redundancy_enabled=redundancy_enabled,
            deployment_status=deployment_status,
            error_message=error_message,
        )
        self.session.add(deployment)
        await self.session.flush()
        return self._serialize_deployment(deployment)

    async def add_deployment_history(
        self,
        deployment_id: int,
        *,
        snapshot_id: int,
        to_node_id: str,
        action: str,
        from_node_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        deployment = await self.session.get(SnapshotDeployment, deployment_id)
        if deployment is None:
            return None
        history = SnapshotDeploymentHistory(
            snapshot_deployment_id=deployment.id,
            snapshot_id=snapshot_id,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            action=action,
            notes=notes,
        )
        self.session.add(history)
        await self.session.flush()
        return {
            "id": history.id,
            "snapshot_deployment_id": history.snapshot_deployment_id,
            "snapshot_id": history.snapshot_id,
            "from_node_id": history.from_node_id,
            "to_node_id": history.to_node_id,
            "action": history.action,
            "notes": history.notes,
            "created_at": history.created_at.isoformat() if history.created_at else None,
        }

    async def list_deployments(self, snapshot_id: Optional[int] = None) -> list[dict[str, Any]]:
        stmt = select(SnapshotDeployment).options(selectinload(SnapshotDeployment.history)).order_by(SnapshotDeployment.deployed_at.desc())
        if snapshot_id is not None:
            stmt = stmt.where(SnapshotDeployment.snapshot_id == snapshot_id)
        result = await self.session.execute(stmt)
        deployments = result.scalars().all()
        return [self._serialize_deployment(item) for item in deployments]

    def to_legacy_snapshot_data(self, detail: dict[str, Any]) -> dict[str, Any]:
        """Compatibility adapter for legacy runtime/MIDI bridges, not new authority work."""
        chains = detail.get("chains", [])
        chain_map = {
            str(chain["id"]): {
                "name": chain.get("name") or f"Chain {chain['id']}",
                "plugins": [
                    {
                        "uri": plugin["uri"],
                        "position": plugin.get("position", index),
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "loader_state": dict(plugin.get("loader_state") or {}),
                    }
                    for index, plugin in enumerate(chain.get("plugins", []))
                ],
            }
            for chain in chains
        }
        routing = detail.get("routing") or {}
        return {
            "flowSlots": [
                {
                    "id": channel.get("channel_key") or channel.get("id"),
                    "chainId": channel.get("chain_id"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dryWetMix": _safe_float(channel.get("dry_wet_mix", channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                }
                for channel in detail.get("channels", [])
            ],
            "routing": {
                "mode": _legacy_mode(str(routing.get("mode") or "parallel_blend")),
                "activeSlotId": routing.get("active_channel_key") or routing.get("activeChannelId"),
                "blendPositions": dict(routing.get("blend_positions") or routing.get("blendPositions") or {}),
                "morphProgress": _safe_float(routing.get("morph_position", routing.get("morphProgress")), 0.5),
                "morphSourceSlotId": routing.get("morph_source_channel_key") or routing.get("morphSourceChannelId"),
                "morphTargetSlotId": routing.get("morph_target_channel_key") or routing.get("morphTargetChannelId"),
                "seriesOrder": list(routing.get("series_order") or routing.get("seriesOrder") or []),
            },
            "activeFlowIndex": int(detail.get("active_channel_index", 0) or 0),
            "chains": chain_map,
        }

    async def _get_snapshot_model(self, snapshot_id: int) -> Optional[Snapshot]:
        result = await self.session.execute(
            select(Snapshot)
            .options(
                selectinload(Snapshot.channels),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.plugins),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.loop_insertions),
                selectinload(Snapshot.routing),
                selectinload(Snapshot.midi_map),
                selectinload(Snapshot.deployments).selectinload(SnapshotDeployment.history),
            )
            .execution_options(populate_existing=True)
            .where(Snapshot.id == snapshot_id)
        )
        return result.scalar_one_or_none()

    async def _reload_snapshot_detail(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        self.session.expire_all()
        return await self.get_snapshot(snapshot_id)

    async def _reload_snapshot_summary(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        self.session.expire_all()
        snapshot = await self._get_snapshot_model(snapshot_id)
        return self._serialize_snapshot_summary(snapshot) if snapshot is not None else None

    async def _get_channel(self, snapshot_id: int, channel_id: int) -> Optional[SnapshotChannel]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return next((item for item in snapshot.channels if item.id == channel_id), None)

    async def _get_chain(self, snapshot_id: int, chain_id: int) -> Optional[SnapshotChain]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return next((item for item in snapshot.chains if item.id == chain_id), None)

    async def _get_plugin(self, snapshot_id: int, chain_id: int, plugin_id: int) -> Optional[SnapshotChainPlugin]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        return next((item for item in chain.plugins if item.id == plugin_id), None)

    async def _validate_program_number(
        self,
        program_number: Optional[int],
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> None:
        if program_number is None:
            return
        if program_number < 0 or program_number > 127:
            raise ValueError("Program number must be 0-127")

        stmt = select(Snapshot).where(Snapshot.program_number == program_number)
        if exclude_snapshot_id is not None:
            stmt = stmt.where(Snapshot.id != exclude_snapshot_id)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise ValueError(f"Program number {program_number} already mapped")

    async def _get_max_display_order(self) -> int:
        result = await self.session.execute(select(Snapshot.display_order).order_by(Snapshot.display_order.desc()).limit(1))
        return int(result.scalar_one_or_none() or 0)

    @staticmethod
    def _snapshot_document_type(snapshot: Snapshot) -> str:
        document = snapshot.document if isinstance(snapshot.document, dict) else {}
        return SnapshotService._snapshot_document_type_from_document(document)

    @staticmethod
    def _snapshot_document_type_from_document(document: Any) -> str:
        document = document if isinstance(document, dict) else {}
        meta = document.get("meta") if isinstance(document.get("meta"), dict) else {}
        document_type = str(meta.get("type") or "snapshot").strip().lower()
        return "template" if document_type == "template" else "snapshot"

    async def _persist_snapshot_document(
        self,
        snapshot: Snapshot,
        normalized: dict[str, Any],
        *,
        document_type: str = "snapshot",
    ) -> None:
        await self.state_authority_documents.persist_snapshot_document(
            snapshot,
            normalized,
            document_type=document_type,
        )

    async def _replace_snapshot_state(self, snapshot: Snapshot, normalized: dict[str, Any]) -> None:
        snapshot.extensions_payload = copy.deepcopy(normalized.get("extensions") or {})
        await self.session.execute(delete(SnapshotChannel).where(SnapshotChannel.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotRouting).where(SnapshotRouting.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotMidiMap).where(SnapshotMidiMap.snapshot_id == snapshot.id))
        await self.session.execute(delete(SnapshotChain).where(SnapshotChain.snapshot_id == snapshot.id))
        await self.session.flush()

        chain_rows: dict[str, SnapshotChain] = {}
        for index, chain_payload in enumerate(normalized["chains"]):
            chain = SnapshotChain(
                snapshot_id=snapshot.id,
                name=chain_payload["name"],
                order_index=index,
            )
            self.session.add(chain)
            await self.session.flush()
            chain_rows[chain_payload["source_key"]] = chain

            for plugin_index, plugin_payload in enumerate(chain_payload["plugins"]):
                self.session.add(
                    SnapshotChainPlugin(
                        snapshot_chain_id=chain.id,
                        plugin_uri=plugin_payload["uri"],
                        plugin_name=plugin_payload.get("name"),
                        position=plugin_index,
                        bypass=bool(plugin_payload.get("bypass", False)),
                        parameters=dict(plugin_payload.get("parameters") or {}),
                        loader_state=dict(plugin_payload.get("loader_state") or {}),
                        is_placeholder=bool(plugin_payload.get("is_placeholder", False)),
                    )
                )

            for loop_payload in chain_payload["loop_insertions"]:
                self.session.add(
                    SnapshotLoopInsertion(
                        snapshot_chain_id=chain.id,
                        insertion_id=loop_payload.get("insertion_id"),
                        loop_id=loop_payload.get("loop_id"),
                        slot_index=int(loop_payload.get("slot_index", 0)),
                        enabled=bool(loop_payload.get("enabled", True)),
                        mode=str(loop_payload.get("mode") or "serial_insert"),
                        blend_pct=_safe_float(loop_payload.get("blend_pct"), 100.0),
                        send_gain_db=_safe_float(loop_payload.get("send_gain_db"), 0.0),
                        return_gain_db=_safe_float(loop_payload.get("return_gain_db"), 0.0),
                        crossfade_ms=int(_safe_int(loop_payload.get("crossfade_ms")) or 12),
                        band_split_hz=list(loop_payload.get("band_split_hz") or []),
                    )
                )

        for index, channel_payload in enumerate(normalized["channels"]):
            channel = SnapshotChannel(
                snapshot_id=snapshot.id,
                chain_id=chain_rows.get(channel_payload["chain_ref"]).id if channel_payload["chain_ref"] in chain_rows else None,
                channel_key=channel_payload["channel_key"],
                label=channel_payload["label"],
                color=channel_payload["color"],
                muted=channel_payload["muted"],
                solo=channel_payload["solo"],
                dry_wet_mix=channel_payload["dry_wet_mix"],
                order_index=index,
            )
            self.session.add(channel)

        routing_payload = normalized["routing"]
        self.session.add(
            SnapshotRouting(
                snapshot_id=snapshot.id,
                mode=routing_payload["mode"],
                active_channel_key=routing_payload["active_channel_key"],
                blend_positions=dict(routing_payload["blend_positions"]),
                morph_position=routing_payload["morph_position"],
                morph_source_channel_key=routing_payload["morph_source_channel_key"],
                morph_target_channel_key=routing_payload["morph_target_channel_key"],
                series_order=list(routing_payload["series_order"]),
            )
        )
        self.session.add(
            SnapshotMidiMap(
                snapshot_id=snapshot.id,
                entries=[dict(entry) for entry in normalized["midi_map"]],
            )
        )
        await self.session.flush()

    def _normalize_detail_payload(self, detail_payload: dict[str, Any]) -> dict[str, Any]:
        payload = copy.deepcopy(detail_payload or {})

        raw_chains = payload.get("chains", [])
        normalized_chains: list[dict[str, Any]] = []
        chain_by_ref: dict[str, dict[str, Any]] = {}
        if isinstance(raw_chains, dict):
            chain_items = list(raw_chains.items())
        elif isinstance(raw_chains, list):
            chain_items = [
                (
                    str(item.get("source_key") or item.get("id") or f"chain-{index}"),
                    item,
                )
                for index, item in enumerate(raw_chains)
                if isinstance(item, dict)
            ]
        else:
            chain_items = []

        seen_chain_refs: set[str] = set()
        for index, (source_key, raw_chain) in enumerate(chain_items):
            if not isinstance(raw_chain, dict):
                continue
            chain_key = str(source_key)
            seen_chain_refs.add(chain_key)
            plugins: list[dict[str, Any]] = []
            for plugin_index, raw_plugin in enumerate(raw_chain.get("plugins", []) or []):
                if not isinstance(raw_plugin, dict):
                    continue
                uri = str(raw_plugin.get("uri") or raw_plugin.get("plugin_uri") or "").strip()
                if not uri:
                    continue
                plugins.append(
                    {
                        "uri": uri,
                        "name": raw_plugin.get("name"),
                        "position": plugin_index,
                        "bypass": bool(raw_plugin.get("bypass", raw_plugin.get("bypassed", False))),
                        "parameters": {
                            str(key): float(value)
                            for key, value in dict(raw_plugin.get("parameters") or {}).items()
                            if isinstance(key, str) and isinstance(value, (int, float))
                        },
                        "loader_state": dict(raw_plugin.get("loader_state") or {}),
                        "is_placeholder": bool(raw_plugin.get("is_placeholder", False)) or not _plugin_available(uri),
                    }
                )

            loop_insertions = [
                dict(item)
                for item in (raw_chain.get("loop_insertions") or [])
                if isinstance(item, dict)
            ]
            normalized_chains.append(
                {
                    "source_key": chain_key,
                    "name": str(raw_chain.get("name") or f"Chain {index + 1}"),
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                }
            )
            chain_by_ref[chain_key] = normalized_chains[-1]

        raw_paths = payload.get("paths", []) or []
        normalized_paths: list[dict[str, Any]] = []
        next_path_chain_ref = len(normalized_chains)
        for index, raw_path in enumerate(raw_paths):
            if not isinstance(raw_path, dict):
                continue

            path_plugins: list[dict[str, Any]] = []
            for plugin_index, raw_plugin in enumerate(raw_path.get("plugins", []) or []):
                if not isinstance(raw_plugin, dict):
                    continue
                uri = str(raw_plugin.get("uri") or raw_plugin.get("plugin_uri") or "").strip()
                if not uri:
                    continue
                path_plugins.append(
                    {
                        "uri": uri,
                        "name": raw_plugin.get("name"),
                        "position": plugin_index,
                        "bypass": bool(raw_plugin.get("bypass", raw_plugin.get("bypassed", False))),
                        "parameters": {
                            str(key): float(value)
                            for key, value in dict(raw_plugin.get("parameters") or {}).items()
                            if isinstance(key, str) and isinstance(value, (int, float))
                        },
                        "loader_state": dict(raw_plugin.get("loader_state") or {}),
                        "is_placeholder": bool(raw_plugin.get("is_placeholder", False)) or not _plugin_available(uri),
                    }
                )

            path_chain_ref_value = (
                raw_path.get("snapshot_chain_id")
                if raw_path.get("snapshot_chain_id") is not None
                else raw_path.get("runtime_chain_id")
            )
            if path_chain_ref_value is None:
                next_path_chain_ref += 1
                path_chain_ref = f"path:{raw_path.get('id') or index}:{next_path_chain_ref}"
            else:
                path_chain_ref = str(path_chain_ref_value)

            normalized_paths.append(
                {
                    "channel_key": str(raw_path.get("id") or f"path-{index}"),
                    "label": str(raw_path.get("label") or raw_path.get("name") or _stable_channel_label(index)),
                    "color": str(raw_path.get("color") or DEFAULT_CHANNEL_COLOR),
                    "muted": _normalize_bool(raw_path.get("muted"), False),
                    "solo": _normalize_bool(raw_path.get("solo"), False),
                    "dry_wet_mix": _safe_float(raw_path.get("dry_wet_mix", raw_path.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                    "chain_ref": path_chain_ref,
                    "chain_name": str(raw_path.get("name") or raw_path.get("label") or f"Path {index + 1}"),
                    "plugins": path_plugins,
                    "loop_insertions": [
                        dict(item)
                        for item in (raw_path.get("loop_insertions") or [])
                        if isinstance(item, dict)
                    ],
                }
            )

            if path_chain_ref not in seen_chain_refs:
                normalized_chains.append(
                    {
                        "source_key": path_chain_ref,
                        "name": normalized_paths[-1]["chain_name"],
                        "plugins": path_plugins,
                        "loop_insertions": normalized_paths[-1]["loop_insertions"],
                    }
                )
                seen_chain_refs.add(path_chain_ref)
                chain_by_ref[path_chain_ref] = normalized_chains[-1]
            else:
                existing_chain = chain_by_ref.get(path_chain_ref)
                if existing_chain is not None:
                    if not existing_chain.get("plugins") and path_plugins:
                        existing_chain["plugins"] = path_plugins
                    if not existing_chain.get("loop_insertions") and normalized_paths[-1]["loop_insertions"]:
                        existing_chain["loop_insertions"] = normalized_paths[-1]["loop_insertions"]
                    if existing_chain.get("name", "").startswith("Chain "):
                        existing_chain["name"] = normalized_paths[-1]["chain_name"]

        raw_channels = payload.get("channels", payload.get("flowSlots", [])) or []
        normalized_channels: list[dict[str, Any]] = []
        for index, raw_channel in enumerate(raw_channels):
            if not isinstance(raw_channel, dict):
                continue
            chain_ref_value = raw_channel.get("chain_ref")
            if chain_ref_value is None:
                chain_ref_value = raw_channel.get("chain_id", raw_channel.get("chainId"))
            chain_ref = str(chain_ref_value) if chain_ref_value is not None else None
            if chain_ref is not None and chain_ref not in seen_chain_refs:
                normalized_chains.append(
                    {
                        "source_key": chain_ref,
                        "name": f"Chain {chain_ref}",
                        "plugins": [],
                        "loop_insertions": [],
                    }
                )
                seen_chain_refs.add(chain_ref)

            normalized_channels.append(
                {
                    "channel_key": str(raw_channel.get("channel_key") or raw_channel.get("id") or f"channel-{index}"),
                    "label": str(raw_channel.get("label") or _stable_channel_label(index)),
                    "color": str(raw_channel.get("color") or DEFAULT_CHANNEL_COLOR),
                    "muted": _normalize_bool(raw_channel.get("muted"), False),
                    "solo": _normalize_bool(raw_channel.get("solo"), False),
                    "dry_wet_mix": _safe_float(raw_channel.get("dry_wet_mix", raw_channel.get("dryWetMix")), DEFAULT_DRY_WET_MIX),
                    "chain_ref": chain_ref,
                }
            )

        path_by_channel_key = {
            path["channel_key"]: path
            for path in normalized_paths
        }
        if normalized_channels:
            for channel in normalized_channels:
                matching_path = path_by_channel_key.get(channel["channel_key"])
                if matching_path is None:
                    continue
                if channel["chain_ref"] is None:
                    channel["chain_ref"] = matching_path["chain_ref"]
                if not channel.get("label"):
                    channel["label"] = matching_path["label"]
        else:
            normalized_channels = [
                {
                    "channel_key": path["channel_key"],
                    "label": path["label"],
                    "color": path["color"],
                    "muted": path["muted"],
                    "solo": path["solo"],
                    "dry_wet_mix": path["dry_wet_mix"],
                    "chain_ref": path["chain_ref"],
                }
                for path in normalized_paths
            ]

        if not normalized_channels:
            normalized_channels.append(
                {
                    "channel_key": "channel-0",
                    "label": "A",
                    "color": DEFAULT_CHANNEL_COLOR,
                    "muted": False,
                    "solo": False,
                    "dry_wet_mix": DEFAULT_DRY_WET_MIX,
                    "chain_ref": None,
                }
            )

        raw_routing = payload.get("routing") if isinstance(payload.get("routing"), dict) else {}
        active_channel_key = (
            raw_routing.get("active_channel_key")
            or raw_routing.get("activeChannelId")
            or raw_routing.get("activeSlotId")
            or normalized_channels[0]["channel_key"]
        )
        normalized_routing = {
            "mode": _normalize_mode(raw_routing.get("mode")),
            "active_channel_key": str(active_channel_key) if active_channel_key else None,
            "blend_positions": dict(raw_routing.get("blend_positions") or raw_routing.get("blendPositions") or {}),
            "morph_position": _safe_float(raw_routing.get("morph_position", raw_routing.get("morphProgress")), 0.5),
            "morph_source_channel_key": (
                raw_routing.get("morph_source_channel_key")
                or raw_routing.get("morphSourceChannelId")
                or raw_routing.get("morphSourceSlotId")
            ),
            "morph_target_channel_key": (
                raw_routing.get("morph_target_channel_key")
                or raw_routing.get("morphTargetChannelId")
                or raw_routing.get("morphTargetSlotId")
            ),
            "series_order": list(raw_routing.get("series_order") or raw_routing.get("seriesOrder") or []),
        }

        midi_map = payload.get("midi_map", payload.get("midiMap", [])) or []
        normalized_midi_map = [dict(entry) for entry in midi_map if isinstance(entry, dict)]

        return {
            "channels": normalized_channels,
            "chains": normalized_chains,
            "routing": normalized_routing,
            "midi_map": normalized_midi_map,
            "extensions": copy.deepcopy(payload.get("extensions") or {})
            if isinstance(payload.get("extensions"), dict)
            else {},
        }

    async def _enrich_normalized_payload(self, normalized: dict[str, Any]) -> dict[str, Any]:
        detail = self._normalized_to_detail(normalized, snapshot_row=None)
        try:
            legacy_payload = self.to_legacy_snapshot_data(detail)
            enriched = await snapshot_runtime_service.enrich_snapshot_data(copy.deepcopy(legacy_payload))
            enriched_normalized = self._normalize_detail_payload(enriched)
            preserved_chain_state = {
                str(chain.get("source_key")): {
                    "loop_insertions": [dict(item) for item in chain.get("loop_insertions", []) if isinstance(item, dict)],
                    "effects_loops": [dict(item) for item in chain.get("effects_loops", []) if isinstance(item, dict)],
                }
                for chain in normalized.get("chains", [])
                if isinstance(chain, dict) and chain.get("source_key") is not None
            }
            for chain in enriched_normalized.get("chains", []):
                if not isinstance(chain, dict):
                    continue
                preserved = preserved_chain_state.get(str(chain.get("source_key")))
                if not isinstance(preserved, dict):
                    continue
                if preserved.get("loop_insertions"):
                    chain["loop_insertions"] = [dict(item) for item in preserved["loop_insertions"]]
                if preserved.get("effects_loops"):
                    chain["effects_loops"] = [dict(item) for item in preserved["effects_loops"]]
            enriched_normalized["midi_map"] = [dict(entry) for entry in normalized.get("midi_map", [])]
            enriched_normalized["extensions"] = copy.deepcopy(normalized.get("extensions") or {})
            return enriched_normalized
        except Exception as exc:
            logger.debug("Snapshot enrichment skipped runtime refresh: %s", exc)
            return normalized

    async def _serialize_snapshot_detail(
        self,
        snapshot: Snapshot,
        *,
        compatibility_live_state_payload: dict[str, Any] | None = None,
        compatibility_is_live: bool = False,
        compatibility_activated_at: datetime | None = None,
    ) -> dict[str, Any]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        normalized = await self._snapshot_to_normalized(snapshot)
        detail = self._normalized_to_detail(normalized, snapshot)
        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        runtime_live_paths: list[dict[str, Any]] = []
        if (
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
            and isinstance(runtime_payload, dict)
        ):
            live_state_payload = runtime_payload.get("live_state")
            if isinstance(live_state_payload, dict):
                runtime_live_paths = [
                    dict(item)
                    for item in live_state_payload.get("paths", [])
                    if isinstance(item, dict)
                ]
            elif isinstance(runtime_payload.get("paths"), list):
                runtime_live_paths = [
                    {
                        "path_id": item.get("id"),
                        "runtime_chain_id": item.get("runtime_chain_id"),
                    }
                    for item in runtime_payload.get("paths", [])
                    if isinstance(item, dict) and item.get("id") is not None
                ]
        detail["snapshot_revision"] = self._snapshot_revision_from_normalized(normalized)
        detail["controls"] = self._normalize_controls_payload(
            snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
            detail,
        )
        detail["io_bindings"] = {
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "monitoring_output_index": detail["controls"].get("monitoring_output_index"),
            "remap_required": False,
        }
        detail["lineage"] = {
            "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
        }
        detail["is_locked"] = bool(snapshot.is_locked)
        detail["assets"] = self._build_asset_manifest(detail)
        detail["paths"] = self._build_snapshot_paths(
            detail,
            runtime_live_paths,
            compatibility_live_state_payload=compatibility_live_state_payload,
        )
        detail["live_state"] = await self._build_live_state(
            snapshot,
            runtime_state=runtime_state,
            compatibility_live_state_payload=compatibility_live_state_payload,
            compatibility_is_live=compatibility_is_live,
            compatibility_activated_at=compatibility_activated_at,
        )
        is_runtime_live_snapshot = bool(
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
        )
        if is_runtime_live_snapshot:
            runtime_activated_at = None
            if isinstance(runtime_payload, dict):
                live_state_payload = runtime_payload.get("live_state")
                if isinstance(live_state_payload, dict):
                    runtime_activated_at = str(live_state_payload.get("activated_at") or "").strip() or None
            detail["activated_at"] = runtime_activated_at or str(runtime_state.get("emitted_at") or "").strip() or None
            tempo_status = self._tempo_status_for_snapshot(snapshot, is_active=True)
            detail["tempo_bpm"] = tempo_status["stored_tempo_bpm"]
            detail["live_tempo_bpm"] = tempo_status["live_tempo_bpm"]
            detail["active_tempo_bpm"] = tempo_status["active_tempo_bpm"]
            detail["tempo_source"] = tempo_status["tempo_source"]
            detail["tempo_updated_at"] = tempo_status["updated_at"]
        return detail

    async def _snapshot_name_exists(
        self,
        name: str,
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> bool:
        statement = select(Snapshot.id).where(func.lower(Snapshot.name) == name.lower())
        if exclude_snapshot_id is not None:
            statement = statement.where(Snapshot.id != exclude_snapshot_id)
        result = await self.session.execute(statement.limit(1))
        return result.scalar_one_or_none() is not None

    async def _build_duplicate_snapshot_name(
        self,
        source_name: Any,
        *,
        exclude_snapshot_id: Optional[int] = None,
    ) -> str:
        base_name = f"{sanitize_snapshot_name_seed(source_name)}copy"
        candidate = base_name
        suffix = 2
        while await self._snapshot_name_exists(candidate, exclude_snapshot_id=exclude_snapshot_id):
            candidate = f"{base_name}{suffix}"
            suffix += 1
        return candidate

    def _build_snapshot_paths(
        self,
        detail: dict[str, Any],
        runtime_live_paths: list[dict[str, Any]] | None = None,
        *,
        compatibility_live_state_payload: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if chain.get("id") is not None
        }
        if not runtime_live_paths and isinstance(compatibility_live_state_payload, dict):
            runtime_live_paths = [
                dict(item)
                for item in compatibility_live_state_payload.get("paths", [])
                if isinstance(item, dict)
            ]
        live_paths = {
            str(item.get("path_id")): item
            for item in (runtime_live_paths or [])
            if isinstance(item, dict) and item.get("path_id") is not None
        }

        paths: list[dict[str, Any]] = []
        for channel in detail.get("channels", []):
            chain_id = channel.get("chain_id")
            chain = chain_by_id.get(chain_id)
            live_path = live_paths.get(str(channel.get("channel_key")))
            paths.append(
                {
                    "id": channel.get("channel_key"),
                    "name": chain.get("name") if isinstance(chain, dict) else f"Path {channel.get('label') or channel.get('channel_key')}",
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dry_wet_mix": _safe_float(channel.get("dry_wet_mix"), DEFAULT_DRY_WET_MIX),
                    "order_index": channel.get("order_index", 0),
                    "snapshot_chain_id": chain_id,
                    "runtime_chain_id": live_path.get("runtime_chain_id") if isinstance(live_path, dict) else None,
                    "plugins": list(chain.get("plugins", [])) if isinstance(chain, dict) else [],
                    "loop_insertions": list(chain.get("loop_insertions", [])) if isinstance(chain, dict) else [],
                    "effects_loops": list(chain.get("effects_loops", [])) if isinstance(chain, dict) else [],
                }
            )
        return paths

    async def _build_live_state(
        self,
        snapshot: Snapshot,
        *,
        runtime_state: dict[str, Any] | None = None,
        compatibility_live_state_payload: dict[str, Any] | None = None,
        compatibility_is_live: bool = False,
        compatibility_activated_at: datetime | None = None,
    ) -> dict[str, Any]:
        if runtime_state is None:
            from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

            runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if (
            runtime_state.get("state") == "live"
            and int(runtime_state.get("snapshot_id") or 0) == int(snapshot.id)
            and isinstance(runtime_payload, dict)
        ):
            live_state_payload = runtime_payload.get("live_state")
            if isinstance(live_state_payload, dict):
                return {
                    "is_live": not bool(runtime_state.get("is_offline", False)),
                    "activated_at": live_state_payload.get("activated_at") or runtime_state.get("emitted_at"),
                    "paths": [dict(item) for item in live_state_payload.get("paths", []) if isinstance(item, dict)],
                    "runtime_chains": [dict(item) for item in live_state_payload.get("runtime_chains", []) if isinstance(item, dict)],
                    "display_state": runtime_state.get("display_state"),
                    "display_label": runtime_state.get("display_label"),
                    "is_warning": bool(runtime_state.get("is_warning", False)),
                    "is_offline": bool(runtime_state.get("is_offline", False)),
                    "last_runtime_event_at": runtime_state.get("emitted_at"),
                    "node_id": runtime_state.get("node_id"),
                }
        if compatibility_is_live and isinstance(compatibility_live_state_payload, dict):
            runtime_paths = [
                dict(item)
                for item in compatibility_live_state_payload.get("paths", [])
                if isinstance(item, dict)
            ]
            runtime_chain_ids = [
                int(item["runtime_chain_id"])
                for item in runtime_paths
                if item.get("runtime_chain_id") is not None
            ]
            runtime_chains: list[dict[str, Any]] = []
            for runtime_chain_id in runtime_chain_ids:
                chain = await self.chain_service.get_chain(runtime_chain_id)
                if chain is not None:
                    runtime_chains.append(chain)
            return {
                "is_live": True,
                "activated_at": compatibility_activated_at.isoformat() if compatibility_activated_at else None,
                "paths": runtime_paths,
                "runtime_chains": runtime_chains,
                "display_state": "live",
                "display_label": "Live",
                "is_warning": False,
                "is_offline": False,
                "last_runtime_event_at": compatibility_activated_at.isoformat() if compatibility_activated_at else None,
            }
        return {
            "is_live": False,
            "activated_at": None,
            "paths": [],
            "runtime_chains": [],
            "display_state": "stopped",
            "display_label": "Stopped",
            "is_warning": False,
            "is_offline": False,
            "last_runtime_event_at": None,
        }

    async def _clear_compatibility_live_projections(self) -> None:
        await self.session.execute(
            update(Snapshot).values(
                activated_at=None,
            )
        )
        await self.session.flush()

    def _ordered_detail_channels(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        channels = [channel for channel in detail.get("channels", []) if isinstance(channel, dict)]
        return sorted(
            channels,
            key=lambda item: (
                int(item.get("order_index", 0)),
                str(item.get("channel_key") or ""),
            ),
        )

    def _runtime_chain_name_for_channel(
        self,
        source_chain: dict[str, Any] | None,
        channel: dict[str, Any],
    ) -> str:
        source_name = (
            source_chain.get("name")
            if isinstance(source_chain, dict) and source_chain.get("name")
            else "Path"
        )
        channel_name = channel.get("label") or channel.get("channel_key")
        return f"{source_name} ({channel_name})"

    def _snapshot_runtime_topology_signature(self, detail: dict[str, Any]) -> dict[str, Any]:
        chain_index_by_id: dict[int, int] = {}
        canonical_chains: list[dict[str, Any]] = []
        ordered_chains = [chain for chain in detail.get("chains", []) if isinstance(chain, dict)]

        for chain_index, chain in enumerate(ordered_chains):
            chain_id = _safe_int(chain.get("id"))
            if chain_id is not None:
                chain_index_by_id[chain_id] = chain_index

            plugins = [
                {
                    "uri": str(plugin.get("uri") or ""),
                    "position": int(plugin.get("position", index)),
                }
                for index, plugin in enumerate(chain.get("plugins", []))
                if isinstance(plugin, dict)
            ]
            plugins.sort(key=lambda item: (int(item["position"]), item["uri"]))

            loop_insertions = [
                {
                    key: _canonicalize_json_value(value)
                    for key, value in sorted(loop.items())
                    if key not in (_CANONICAL_TRANSIENT_KEYS | {"insertion_id"})
                }
                for loop in chain.get("loop_insertions", [])
                if isinstance(loop, dict)
            ]

            effects_loops = [
                {
                    key: _canonicalize_json_value(loop.get(key))
                    for key in sorted(_CANONICAL_EFFECTS_LOOP_KEYS)
                    if key in loop
                }
                for loop in chain.get("effects_loops", [])
                if isinstance(loop, dict)
            ]

            canonical_chains.append(
                {
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                    "effects_loops": effects_loops,
                }
            )

        canonical_channels = [
            {
                "chain_index": chain_index_by_id.get(_safe_int(channel.get("chain_id")) or -1),
            }
            for channel in self._ordered_detail_channels(detail)
        ]

        return {
            "channels": canonical_channels,
            "chains": canonical_chains,
        }

    async def _reuse_live_runtime_chains(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        current_live_detail: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return await self.state_authority_activation.reuse_live_runtime_chains(
            snapshot,
            detail,
            current_live_detail=current_live_detail,
        )

    async def _clear_materialized_runtime_chains(self) -> None:
        await self.state_authority_activation.clear_materialized_runtime_chains()

    async def _materialize_live_state(
        self,
        snapshot: Snapshot,
        detail: dict[str, Any],
        *,
        preloaded_instance_ids: Optional[list[int]] = None,
    ) -> dict[str, Any]:
        return await self.state_authority_activation.materialize_live_state(
            snapshot,
            detail,
            preloaded_instance_ids=preloaded_instance_ids,
        )

    async def _snapshot_to_normalized(
        self,
        snapshot: Snapshot,
        *,
        prefer_document: bool = True,
    ) -> dict[str, Any]:
        if (
            prefer_document
            and isinstance(snapshot.document, dict)
            and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
        ):
            return await self.state_authority_documents.document_to_normalized(snapshot.document)

        has_relational_projection = bool(snapshot.chains or snapshot.channels or snapshot.routing or snapshot.midi_map)
        if (
            not has_relational_projection
            and isinstance(snapshot.document, dict)
            and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
        ):
            return await self.state_authority_documents.document_to_normalized(snapshot.document)

        loop_ids = {
            loop.loop_id
            for chain in snapshot.chains
            for loop in chain.loop_insertions
            if loop.loop_id
        }
        effects_loop_map: dict[str, dict[str, Any]] = {}
        if loop_ids:
            result = await self.session.execute(select(EffectsLoop).where(EffectsLoop.loop_id.in_(sorted(loop_ids))))
            effects_loops = result.scalars().all()
            effects_loop_map = {
                loop.loop_id: ChainService._serialize_effects_loop(loop)
                for loop in effects_loops
            }

        chains: list[dict[str, Any]] = []
        for chain in snapshot.chains:
            plugins: list[dict[str, Any]] = []
            for plugin in sorted(chain.plugins, key=lambda item: int(item.position)):
                metadata = self.chain_service._get_plugin_metadata(plugin.plugin_uri)
                plugins.append(
                    {
                        "uri": plugin.plugin_uri,
                        "name": plugin.plugin_name or metadata.get("name", plugin.plugin_uri),
                        "position": int(plugin.position),
                        "bypass": bool(plugin.bypass),
                        "parameters": dict(plugin.parameters or {}),
                        "loader_state": dict(plugin.loader_state or {}),
                        "is_placeholder": bool(plugin.is_placeholder),
                    }
                )

            chains.append(
                {
                    "source_key": str(chain.id),
                    "id": chain.id,
                    "name": chain.name,
                    "plugins": plugins,
                    "loop_insertions": [
                        ChainService._serialize_loop_insertion(loop)
                        for loop in sorted(chain.loop_insertions, key=lambda item: int(item.slot_index))
                    ],
                    "effects_loops": [
                        effects_loop_map[loop.loop_id]
                        for loop in sorted(chain.loop_insertions, key=lambda item: int(item.slot_index))
                        if loop.loop_id in effects_loop_map
                    ],
                }
            )

        routing = snapshot.routing or SnapshotRouting(
            snapshot_id=snapshot.id,
            mode="parallel_blend",
            active_channel_key=snapshot.channels[0].channel_key if snapshot.channels else None,
            blend_positions={},
            morph_position=0.5,
            morph_source_channel_key=None,
            morph_target_channel_key=None,
            series_order=[],
        )

        return {
            "channels": [
                {
                    "id": channel.id,
                    "channel_key": channel.channel_key,
                    "label": channel.label,
                    "color": channel.color,
                    "muted": bool(channel.muted),
                    "solo": bool(channel.solo),
                    "dry_wet_mix": float(channel.dry_wet_mix),
                    "order_index": int(channel.order_index),
                    "chain_ref": str(channel.chain_id) if channel.chain_id is not None else None,
                }
                for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index))
            ],
            "chains": chains,
            "routing": {
                "mode": routing.mode,
                "active_channel_key": routing.active_channel_key,
                "blend_positions": dict(routing.blend_positions or {}),
                "morph_position": float(routing.morph_position),
                "morph_source_channel_key": routing.morph_source_channel_key,
                "morph_target_channel_key": routing.morph_target_channel_key,
                "series_order": list(routing.series_order or []),
            },
            "midi_map": [dict(entry) for entry in (snapshot.midi_map.entries if snapshot.midi_map else [])],
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "extensions": (
                copy.deepcopy(snapshot.extensions_payload)
                if isinstance(snapshot.extensions_payload, dict)
                else {}
            ),
        }

    async def _sync_snapshot_document_from_relational_projection(
        self,
        snapshot_id: int,
    ) -> None:
        """Rebuild the canonical document from compatibility rows after legacy mutations."""
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        normalized = await self._snapshot_to_normalized(snapshot, prefer_document=False)
        await self._persist_snapshot_document(
            snapshot,
            normalized,
            document_type=self._snapshot_document_type(snapshot),
        )
        await self.session.flush()

    def _canonicalize_snapshot_normalized(self, normalized: dict[str, Any]) -> dict[str, Any]:
        chain_index_by_source_key = {
            str(chain.get("source_key") or index): index
            for index, chain in enumerate(normalized.get("chains", []))
        }

        canonical_chains: list[dict[str, Any]] = []
        for chain in normalized.get("chains", []):
            plugins = []
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                plugins.append(
                    {
                        "uri": str(plugin.get("uri") or ""),
                        "name": plugin.get("name"),
                        "position": int(plugin.get("position", 0)),
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": _canonicalize_json_value(plugin.get("parameters") or {}),
                        "loader_state": _canonicalize_json_value(plugin.get("loader_state") or {}),
                        "is_placeholder": bool(plugin.get("is_placeholder", False)),
                    }
                )

            loop_insertions = []
            for loop in chain.get("loop_insertions", []):
                if not isinstance(loop, dict):
                    continue
                loop_insertions.append(
                    {
                        key: _canonicalize_json_value(value)
                        for key, value in sorted(loop.items())
                        if key not in (_CANONICAL_TRANSIENT_KEYS | {"insertion_id"})
                    }
                )

            effects_loops = []
            for loop in chain.get("effects_loops", []):
                if not isinstance(loop, dict):
                    continue
                effects_loops.append(
                    {
                        key: _canonicalize_json_value(loop.get(key))
                        for key in sorted(_CANONICAL_EFFECTS_LOOP_KEYS)
                        if key in loop
                    }
                )

            canonical_chains.append(
                {
                    "name": chain.get("name"),
                    "plugins": plugins,
                    "loop_insertions": loop_insertions,
                    "effects_loops": effects_loops,
                }
            )

        canonical_channels = []
        for index, channel in enumerate(normalized.get("channels", [])):
            if not isinstance(channel, dict):
                continue
            canonical_channels.append(
                {
                    "channel_key": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "muted": bool(channel.get("muted", False)),
                    "solo": bool(channel.get("solo", False)),
                    "dry_wet_mix": _safe_float(channel.get("dry_wet_mix"), DEFAULT_DRY_WET_MIX),
                    "order_index": int(channel.get("order_index", index)),
                    "chain_index": (
                        chain_index_by_source_key.get(str(channel.get("chain_ref")))
                        if channel.get("chain_ref") is not None
                        else None
                    ),
                }
            )

        return {
            "channels": canonical_channels,
            "chains": canonical_chains,
            "routing": _canonicalize_json_value(normalized.get("routing") or {}),
            "midi_map": _canonicalize_json_value(normalized.get("midi_map") or []),
            "input_device": normalized.get("input_device"),
            "output_device": normalized.get("output_device"),
            "extensions": _canonicalize_json_value(normalized.get("extensions") or {}),
        }

    def _snapshot_revision_from_normalized(self, normalized: dict[str, Any]) -> str:
        canonical = self._canonicalize_snapshot_normalized(normalized)
        encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        return hashlib.sha256(encoded.encode("ascii")).hexdigest()

    def _tempo_status_for_snapshot(
        self,
        snapshot_row: Optional[Snapshot],
        *,
        snapshot_id: Optional[int] = None,
        stored_tempo_bpm: Any = DEFAULT_SNAPSHOT_TEMPO_BPM,
        is_active: Optional[bool] = None,
    ) -> dict[str, Any]:
        resolved_snapshot_id = snapshot_row.id if snapshot_row is not None else snapshot_id
        resolved_stored_bpm = (
            snapshot_row.tempo_bpm
            if snapshot_row is not None and snapshot_row.tempo_bpm is not None
            else stored_tempo_bpm
        )
        resolved_is_active = bool(is_active) if is_active is not None else False
        try:
            from app.services.snapshot_tempo_service import get_snapshot_tempo_service

            return get_snapshot_tempo_service().get_status(
                snapshot_id=resolved_snapshot_id,
                stored_tempo_bpm=resolved_stored_bpm,
                is_active=resolved_is_active,
            )
        except Exception as exc:
            logger.debug("Snapshot tempo status lookup skipped for %s: %s", resolved_snapshot_id, exc)
            fallback_bpm = _safe_float(resolved_stored_bpm, DEFAULT_SNAPSHOT_TEMPO_BPM)
            return {
                "snapshot_id": resolved_snapshot_id,
                "stored_tempo_bpm": fallback_bpm,
                "live_tempo_bpm": None,
                "active_tempo_bpm": fallback_bpm,
                "tempo_source": "stored",
                "is_live_override_active": False,
                "updated_at": None,
                "tap_count": 0,
            }

    def _normalized_to_detail(
        self,
        normalized: dict[str, Any],
        snapshot_row: Optional[Snapshot],
    ) -> dict[str, Any]:
        chain_entries = normalized["chains"]
        channels = normalized["channels"]
        ordered_snapshot_chains = (
            sorted(snapshot_row.chains, key=lambda item: int(item.order_index))
            if snapshot_row is not None
            else []
        )
        ordered_snapshot_channels = (
            sorted(snapshot_row.channels, key=lambda item: int(item.order_index))
            if snapshot_row is not None
            else []
        )
        channel_key_to_index = {
            channel["channel_key"]: index
            for index, channel in enumerate(channels)
        }

        chain_ids_by_ref: dict[str, Optional[int]] = {}
        chains_payload: list[dict[str, Any]] = []
        next_generated_chain_id = max(
            [int(chain.get("id")) for chain in chain_entries if chain.get("id") is not None] or [0]
        )
        for index, chain in enumerate(chain_entries):
            chain_id = (
                ordered_snapshot_chains[index].id
                if index < len(ordered_snapshot_chains)
                else chain.get("id")
            )
            if chain_id is None:
                next_generated_chain_id += 1
                chain_id = next_generated_chain_id
            chain_ids_by_ref[chain["source_key"]] = chain_id
            chains_payload.append(
                {
                    "id": chain_id,
                    "name": chain["name"],
                    "plugins": [
                        {
                            "id": plugin.get("id"),
                            "uri": plugin["uri"],
                            "name": plugin.get("name"),
                            "position": plugin.get("position", plugin_index),
                            "bypass": bool(plugin.get("bypass", False)),
                            "parameters": dict(plugin.get("parameters") or {}),
                            "loader_state": dict(plugin.get("loader_state") or {}),
                            "is_placeholder": bool(plugin.get("is_placeholder", False)),
                        }
                        for plugin_index, plugin in enumerate(chain["plugins"])
                    ],
                    "loop_insertions": [dict(item) for item in chain.get("loop_insertions", [])],
                    "effects_loops": [dict(item) for item in chain.get("effects_loops", [])],
                }
            )

        snapshot_id = snapshot_row.id if snapshot_row is not None else None
        detail_channels: list[dict[str, Any]] = []
        for index, channel in enumerate(channels):
            detail_channels.append(
                {
                    "id": (
                        ordered_snapshot_channels[index].id
                        if index < len(ordered_snapshot_channels)
                        else channel.get("id")
                    ),
                    "snapshot_id": snapshot_id,
                    "channel_key": channel["channel_key"],
                    "label": channel["label"],
                    "color": channel["color"],
                    "muted": bool(channel["muted"]),
                    "solo": bool(channel["solo"]),
                    "dry_wet_mix": float(channel["dry_wet_mix"]),
                    "order_index": index,
                    "chain_id": chain_ids_by_ref.get(channel["chain_ref"]) if channel.get("chain_ref") is not None else None,
                }
            )

        routing = normalized["routing"]
        average_rating = None
        if snapshot_row is not None and snapshot_row.community_rating_count:
            average_rating = float(snapshot_row.community_rating_sum or 0.0) / float(snapshot_row.community_rating_count)
        tempo_status = self._tempo_status_for_snapshot(snapshot_row)
        persisted_extensions = (
            snapshot_row.extensions_payload
            if snapshot_row is not None and isinstance(snapshot_row.extensions_payload, dict)
            else {}
        )

        return {
            "id": snapshot_id,
            "name": snapshot_row.name if snapshot_row is not None else "Unsaved Snapshot",
            "description": snapshot_row.description if snapshot_row is not None else "",
            "tags": list(snapshot_row.tags or []) if snapshot_row is not None else [],
            "program_number": snapshot_row.program_number if snapshot_row is not None else None,
            "tempo_bpm": tempo_status["stored_tempo_bpm"],
            "live_tempo_bpm": tempo_status["live_tempo_bpm"],
            "active_tempo_bpm": tempo_status["active_tempo_bpm"],
            "tempo_source": tempo_status["tempo_source"],
            "tempo_updated_at": tempo_status["updated_at"],
            "output_level_reference_dbfs": (
                float(snapshot_row.output_level_reference_dbfs)
                if snapshot_row is not None and snapshot_row.output_level_reference_dbfs is not None
                else None
            ),
            "output_level_warning_threshold_db": (
                float(snapshot_row.output_level_warning_threshold_db)
                if snapshot_row is not None and snapshot_row.output_level_warning_threshold_db is not None
                else 3.0
            ),
            "input_device": snapshot_row.input_device if snapshot_row is not None else None,
            "output_device": snapshot_row.output_device if snapshot_row is not None else None,
            "is_favorite": bool(snapshot_row.is_favorite) if snapshot_row is not None else False,
            "is_locked": bool(snapshot_row.is_locked) if snapshot_row is not None else False,
            "display_order": int(snapshot_row.display_order) if snapshot_row is not None else 0,
            "channels": detail_channels,
            "chains": chains_payload,
            "routing": {
                "mode": routing["mode"],
                "active_channel_key": routing["active_channel_key"],
                "blend_positions": dict(routing["blend_positions"]),
                "morph_position": float(routing["morph_position"]),
                "morph_source_channel_key": routing["morph_source_channel_key"],
                "morph_target_channel_key": routing["morph_target_channel_key"],
                "series_order": list(routing["series_order"]),
            },
            "midi_map": [dict(entry) for entry in normalized["midi_map"]],
            "extensions": copy.deepcopy(normalized.get("extensions") or persisted_extensions),
            "active_channel_index": channel_key_to_index.get(routing["active_channel_key"], 0),
            "channel_count": len(detail_channels),
            "chain_count": len(chains_payload),
            "document_type": self._snapshot_document_type(snapshot_row) if snapshot_row is not None else "snapshot",
            "community_uuid": snapshot_row.community_uuid if snapshot_row is not None else None,
            "community_shared": bool(snapshot_row.community_shared) if snapshot_row is not None else False,
            "community_author": snapshot_row.community_author if snapshot_row is not None else "Anonymous",
            "community_download_count": int(snapshot_row.community_download_count or 0) if snapshot_row is not None else 0,
            "community_rating": average_rating,
            "community_rating_count": int(snapshot_row.community_rating_count or 0) if snapshot_row is not None else 0,
            "activated_at": snapshot_row.activated_at.isoformat() if snapshot_row is not None and snapshot_row.activated_at else None,
            "created_at": snapshot_row.created_at.isoformat() if snapshot_row is not None and snapshot_row.created_at else None,
            "updated_at": snapshot_row.updated_at.isoformat() if snapshot_row is not None and snapshot_row.updated_at else None,
            "deployments": [self._serialize_deployment(item) for item in (snapshot_row.deployments if snapshot_row is not None else [])],
        }

    def _serialize_snapshot_summary(
        self,
        snapshot: Snapshot,
        *,
        live_snapshot_id: int | None = None,
        live_activated_at: str | None = None,
    ) -> dict[str, Any]:
        document_graph = (
            snapshot.document.get("graph")
            if isinstance(snapshot.document, dict) and snapshot.document.get("version") == SNAPSHOT_GRAPH_VERSION
            else None
        )
        if isinstance(document_graph, dict):
            graph_channels = [
                channel
                for channel in (document_graph.get("channels") or [])
                if isinstance(channel, dict)
            ]
            channel_rows = sorted(snapshot.channels, key=lambda item: int(item.order_index))
            channel_summaries = [
                {
                    "id": channel_rows[index].id if index < len(channel_rows) else channel.get("id"),
                    "channel_key": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "chain_id": (
                        channel_rows[index].chain_id
                        if index < len(channel_rows)
                        else channel.get("chain_id", channel.get("chainId", channel.get("chain_ref")))
                    ),
                }
                for index, channel in enumerate(graph_channels)
            ]
            chain_count = len(
                [chain for chain in (document_graph.get("chains") or []) if isinstance(chain, dict)]
            )
        else:
            channel_summaries = [
                {
                    "id": channel.id,
                    "channel_key": channel.channel_key,
                    "label": channel.label,
                    "color": channel.color,
                    "chain_id": channel.chain_id,
                }
                for channel in sorted(snapshot.channels, key=lambda item: int(item.order_index))
            ]
            chain_count = len(snapshot.chains)
        average_rating = None
        if snapshot.community_rating_count:
            average_rating = float(snapshot.community_rating_sum or 0.0) / float(snapshot.community_rating_count)
        is_live_snapshot = live_snapshot_id is not None and int(snapshot.id) == int(live_snapshot_id)
        tempo_status = self._tempo_status_for_snapshot(
            snapshot,
            is_active=is_live_snapshot if live_snapshot_id is not None else None,
        )
        return {
            "id": snapshot.id,
            "name": snapshot.name,
            "description": snapshot.description or "",
            "tags": list(snapshot.tags or []),
            "program_number": snapshot.program_number,
            "tempo_bpm": tempo_status["stored_tempo_bpm"],
            "live_tempo_bpm": tempo_status["live_tempo_bpm"],
            "active_tempo_bpm": tempo_status["active_tempo_bpm"],
            "tempo_source": tempo_status["tempo_source"],
            "tempo_updated_at": tempo_status["updated_at"],
            "output_level_reference_dbfs": (
                float(snapshot.output_level_reference_dbfs)
                if snapshot.output_level_reference_dbfs is not None
                else None
            ),
            "output_level_warning_threshold_db": (
                float(snapshot.output_level_warning_threshold_db)
                if snapshot.output_level_warning_threshold_db is not None
                else 3.0
            ),
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "io_bindings": {
                "input_device": snapshot.input_device,
                "output_device": snapshot.output_device,
                "monitoring_output_index": self._normalize_controls_payload(
                    snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
                    None,
                ).get("monitoring_output_index"),
                "remap_required": False,
            },
            "lineage": {
                "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
            },
            "is_favorite": bool(snapshot.is_favorite),
            "is_locked": bool(snapshot.is_locked),
            "display_order": int(snapshot.display_order),
            "channels": channel_summaries,
            "channel_count": len(channel_summaries),
            "chain_count": chain_count,
            "document_type": self._snapshot_document_type(snapshot),
            "community_uuid": snapshot.community_uuid,
            "community_shared": bool(snapshot.community_shared),
            "community_author": snapshot.community_author,
            "community_download_count": int(snapshot.community_download_count or 0),
            "community_rating": average_rating,
            "community_rating_count": int(snapshot.community_rating_count or 0),
            "activated_at": (
                live_activated_at
                if is_live_snapshot and live_activated_at is not None
                else (snapshot.activated_at.isoformat() if snapshot.activated_at else None)
            ),
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        }

    async def _append_snapshot_revision(self, snapshot_id: int, detail: dict[str, Any]) -> dict[str, Any]:
        return await self.state_authority_revisions.append_revision(snapshot_id, detail)

    def _serialize_deployment(self, deployment: SnapshotDeployment) -> dict[str, Any]:
        state = inspect(deployment)
        history_items = [] if "history" in state.unloaded else list(deployment.history)
        return {
            "id": deployment.id,
            "snapshot_id": deployment.snapshot_id,
            "primary_node_id": deployment.primary_node_id,
            "standby_node_ids": list(deployment.standby_node_ids or []),
            "deployment_status": deployment.deployment_status,
            "assignment_strategy": deployment.assignment_strategy,
            "redundancy_enabled": bool(deployment.redundancy_enabled),
            "deployed_at": deployment.deployed_at.isoformat() if deployment.deployed_at else None,
            "last_failover_time": deployment.last_failover_time.isoformat() if deployment.last_failover_time else None,
            "error_message": deployment.error_message,
            "history": [
                {
                    "id": item.id,
                    "snapshot_deployment_id": item.snapshot_deployment_id,
                    "snapshot_id": item.snapshot_id,
                    "from_node_id": item.from_node_id,
                    "to_node_id": item.to_node_id,
                    "action": item.action,
                    "notes": item.notes,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in history_items
            ],
        }

    def _build_asset_manifest(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        manifest: list[dict[str, Any]] = []
        for chain in detail.get("chains", []):
            for plugin in chain.get("plugins", []):
                loader_state = plugin.get("loader_state") or {}
                asset_path = str(loader_state.get("selected_asset_path") or "").strip() or None
                asset_name = (
                    loader_state.get("selected_asset_name")
                    or loader_state.get("selected_model")
                    or loader_state.get("selected_ir")
                )
                if not asset_path and not asset_name:
                    continue
                kind = "plugin_asset"
                plugin_uri = str(plugin.get("uri", ""))
                if "nam" in plugin_uri:
                    kind = "nam"
                elif "cabinet" in plugin_uri:
                    kind = "cabinet_ir"
                elif "reverb" in plugin_uri:
                    kind = "reverb_ir"
                manifest.append(
                    {
                        "kind": kind,
                        "chain_id": chain.get("id"),
                        "plugin_uri": plugin_uri,
                        "plugin_position": plugin.get("position"),
                        "asset_name": asset_name,
                        "asset_path": asset_path,
                        "filename": Path(asset_path).name if asset_path else None,
                        "checksum": hashlib.sha256(Path(asset_path).read_bytes()).hexdigest()
                        if asset_path and os.path.isfile(asset_path)
                        else None,
                        "available": bool(asset_path and os.path.isfile(asset_path) and not bool(plugin.get("is_placeholder", False))),
                    }
                )
        return manifest

    def _build_bundle_asset_manifest(self, manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
        used_paths: set[str] = set()
        bundle_manifest: list[dict[str, Any]] = []

        for index, raw_asset in enumerate(manifest):
            asset = dict(raw_asset)
            asset_path = str(asset.get("asset_path") or "").strip()
            if asset_path and os.path.isfile(asset_path):
                bundle_path = self._build_bundle_asset_path(asset, index=index, used_paths=used_paths)
                asset["bundle_path"] = bundle_path
                asset["filename"] = Path(bundle_path).name
                asset["available"] = True
                if not asset.get("checksum"):
                    asset["checksum"] = hashlib.sha256(Path(asset_path).read_bytes()).hexdigest()
            else:
                asset["bundle_path"] = None
                asset["available"] = False
            bundle_manifest.append(asset)

        return bundle_manifest

    def _build_document_bundle(
        self,
        payload: dict[str, Any],
        *,
        name: str,
        extension: str,
    ) -> dict[str, Any]:
        bundle_payload = copy.deepcopy(payload)
        asset_manifest = self._build_bundle_asset_manifest(bundle_payload.get("asset_manifest", []))
        bundle_payload["asset_manifest"] = asset_manifest

        archive_buffer = io.BytesIO()
        with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                SNAPSHOT_BUNDLE_MANIFEST_FILENAME,
                json.dumps(bundle_payload, indent=2).encode("utf-8"),
            )
            for asset in asset_manifest:
                bundle_path = str(asset.get("bundle_path") or "").strip()
                asset_path = str(asset.get("asset_path") or "").strip()
                if not bundle_path or not asset_path or not os.path.isfile(asset_path):
                    continue
                archive.write(asset_path, bundle_path)

        response_payload = {
            "filename": f"{name}{extension}",
            "content": archive_buffer.getvalue(),
            "asset_manifest": asset_manifest,
        }
        response_payload.update(
            {
                key: bundle_payload.get(key)
                for key in ("snapshot", "template")
                if key in bundle_payload
            }
        )
        return response_payload

    async def _build_ground_control_pro_bundle_payload(
        self,
        detail: dict[str, Any],
    ) -> dict[str, Any] | None:
        try:
            from app.services.ground_control_pro import get_ground_control_pro_service

            extensions = detail.get("extensions") if isinstance(detail, dict) else {}
            gcp_extension = extensions.get(_GROUND_CONTROL_PRO_EXTENSION_KEY) if isinstance(extensions, dict) else None
            session_id = None
            if isinstance(gcp_extension, dict):
                session_id = str(gcp_extension.get("session_id") or "").strip() or None
            return await get_ground_control_pro_service().export_bundle_payload(session_id=session_id)
        except Exception as exc:
            logger.debug("Ground Control Pro bundle export skipped: %s", exc)
            return None

    def _build_bundle_asset_path(
        self,
        asset: dict[str, Any],
        *,
        index: int,
        used_paths: set[str],
    ) -> str:
        raw_name = str(
            asset.get("filename")
            or asset.get("asset_name")
            or asset.get("asset_path")
            or f"asset-{index + 1}"
        ).strip()
        file_name = Path(raw_name).name or f"asset-{index + 1}"
        stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(file_name).stem).strip(".-") or f"asset-{index + 1}"
        suffix = Path(file_name).suffix or Path(str(asset.get("asset_path") or "")).suffix or ".bin"
        kind = re.sub(r"[^A-Za-z0-9_-]+", "-", str(asset.get("kind") or "plugin_asset")).strip("-") or "plugin_asset"
        plugin_position = _safe_int(asset.get("plugin_position"))
        chain_id = _safe_int(asset.get("chain_id"))
        candidate = f"assets/{kind}/{stem}{suffix}"
        collision_bits = [stem]
        if chain_id is not None:
            collision_bits.append(f"c{chain_id}")
        if plugin_position is not None:
            collision_bits.append(f"p{plugin_position}")
        collision_base = "-".join(collision_bits) + suffix
        collision_index = 1
        while candidate in used_paths:
            suffix_index = "" if collision_index == 1 else f"-{collision_index}"
            candidate = f"assets/{kind}/{collision_base.removesuffix(suffix)}{suffix_index}{suffix}"
            collision_index += 1
        used_paths.add(candidate)
        return candidate

    @staticmethod
    def _asset_manifest_key(asset: dict[str, Any]) -> tuple[Any, ...]:
        return (
            _safe_int(asset.get("chain_id")),
            str(asset.get("plugin_uri") or ""),
            _safe_int(asset.get("plugin_position")),
        )

    @staticmethod
    def _asset_upload_type(asset: dict[str, Any]) -> AssetType | None:
        kind = str(asset.get("kind") or "").strip().lower()
        if kind == "nam":
            return AssetType.NAM
        if kind == "cabinet_ir":
            return AssetType.CABINET_IR
        if kind == "reverb_ir":
            return AssetType.REVERB_IR

        suffix = Path(str(asset.get("asset_path") or asset.get("filename") or "")).suffix.lower()
        if suffix == ".nam":
            return AssetType.NAM
        if suffix in {".wav", ".aif", ".aiff", ".flac"}:
            plugin_uri = str(asset.get("plugin_uri") or "").lower()
            if "reverb" in plugin_uri:
                return AssetType.REVERB_IR
            return AssetType.CABINET_IR
        return None

    async def _extract_snapshot_bundle_payload(self, bundle_bytes: bytes) -> dict[str, Any]:
        with zipfile.ZipFile(io.BytesIO(bundle_bytes), "r") as archive:
            try:
                export_payload = json.loads(archive.read(SNAPSHOT_BUNDLE_MANIFEST_FILENAME).decode("utf-8"))
            except KeyError as exc:
                raise ValueError(f"Snapshot bundle missing {SNAPSHOT_BUNDLE_MANIFEST_FILENAME}") from exc
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("Snapshot bundle manifest is invalid JSON") from exc

            if "snapshot" in export_payload and isinstance(export_payload["snapshot"], dict):
                detail_payload = copy.deepcopy(export_payload["snapshot"])
            elif "template" in export_payload and isinstance(export_payload["template"], dict):
                detail_payload = copy.deepcopy(export_payload["template"])
            elif isinstance(export_payload, dict):
                detail_payload = copy.deepcopy(export_payload)
            else:
                raise ValueError("Snapshot bundle payload is invalid")

            asset_manifest = export_payload.get("asset_manifest") or []
            imported_assets = await self._import_bundle_assets(archive, asset_manifest)
            self._apply_imported_asset_paths(detail_payload, asset_manifest, imported_assets)
            await self._restore_ground_control_pro_bundle_payload(detail_payload, export_payload)
            return detail_payload

    async def _import_bundle_assets(
        self,
        archive: zipfile.ZipFile,
        asset_manifest: list[dict[str, Any]],
    ) -> dict[tuple[Any, ...], dict[str, Any]]:
        stored_assets: dict[tuple[Any, ...], dict[str, Any]] = {}
        upload_service = get_upload_service()

        for asset in asset_manifest:
            bundle_path = str(asset.get("bundle_path") or "").strip()
            if not bundle_path:
                continue

            upload_type = self._asset_upload_type(asset)
            if upload_type is None:
                continue

            try:
                content = archive.read(bundle_path)
            except KeyError:
                logger.warning("Snapshot bundle asset missing from archive: %s", bundle_path)
                continue

            filename = str(asset.get("filename") or Path(bundle_path).name or f"{upload_type.value}.bin").strip() or f"{upload_type.value}.bin"
            result = await upload_service.save_upload(filename, content, upload_type)
            if not result.success:
                raise ValueError(result.error or result.message or f"Failed to import asset {filename}")

            if upload_type == AssetType.NAM:
                await self._ensure_nam_asset_record(
                    file_path=result.file_path,
                    file_hash=result.file_hash,
                    file_size=result.file_size,
                    display_name=str(asset.get("asset_name") or Path(result.file_path).stem),
                )

            stored_assets[self._asset_manifest_key(asset)] = {
                "file_path": result.file_path,
                "asset_name": str(asset.get("asset_name") or Path(result.file_path).stem),
                "upload_type": upload_type,
            }

        return stored_assets

    async def _restore_ground_control_pro_bundle_payload(
        self,
        detail_payload: dict[str, Any],
        export_payload: dict[str, Any],
    ) -> None:
        gcp_payload = export_payload.get(_GROUND_CONTROL_PRO_EXTENSION_KEY)
        if not isinstance(gcp_payload, dict):
            return
        try:
            from app.services.ground_control_pro import get_ground_control_pro_service

            restored = await get_ground_control_pro_service().import_bundle_payload(gcp_payload)
        except Exception as exc:
            logger.warning("Ground Control Pro bundle restore skipped: %s", exc)
            return
        if not isinstance(restored, dict):
            return

        extensions = copy.deepcopy(detail_payload.get("extensions") or {})
        if not isinstance(extensions, dict):
            extensions = {}
        extensions[_GROUND_CONTROL_PRO_EXTENSION_KEY] = restored
        detail_payload["extensions"] = extensions

    async def _ensure_nam_asset_record(
        self,
        *,
        file_path: str,
        file_hash: str,
        file_size: int,
        display_name: str,
    ) -> None:
        existing_result = await self.session.execute(
            select(NAMModel).where(NAMModel.file_hash == file_hash)
        )
        existing = existing_result.scalar_one_or_none()
        if existing is not None:
            return

        self.session.add(
            NAMModel(
                name=display_name or Path(file_path).stem,
                file_path=file_path,
                file_hash=file_hash,
                file_size=file_size,
                model_type="unknown",
                category="User",
                license="Snapshot bundle import",
            )
        )
        await self.session.flush()

    def _apply_imported_asset_paths(
        self,
        detail_payload: dict[str, Any],
        asset_manifest: list[dict[str, Any]],
        imported_assets: dict[tuple[Any, ...], dict[str, Any]],
    ) -> None:
        manifest_by_key = {
            self._asset_manifest_key(asset): asset
            for asset in asset_manifest
        }

        for chain in detail_payload.get("chains", []):
            chain_id = _safe_int(chain.get("id"))
            for plugin in chain.get("plugins", []):
                key = (
                    chain_id,
                    str(plugin.get("uri") or ""),
                    _safe_int(plugin.get("position")),
                )
                manifest_entry = manifest_by_key.get(key)
                if manifest_entry is None:
                    continue

                loader_state = dict(plugin.get("loader_state") or {})
                imported_asset = imported_assets.get(key)
                asset_name = str(manifest_entry.get("asset_name") or "").strip() or None

                if imported_asset is None:
                    loader_state["selected_asset_path"] = None
                    if asset_name:
                        loader_state["selected_asset_name"] = asset_name
                        if manifest_entry.get("kind") == "nam":
                            loader_state["selected_model"] = asset_name
                        if manifest_entry.get("kind") in {"cabinet_ir", "reverb_ir"}:
                            loader_state["selected_ir"] = asset_name
                    plugin["loader_state"] = loader_state
                    continue

                loader_state["selected_asset_path"] = imported_asset["file_path"]
                if imported_asset.get("asset_name"):
                    loader_state["selected_asset_name"] = imported_asset["asset_name"]
                upload_type = imported_asset.get("upload_type")
                if upload_type == AssetType.NAM:
                    loader_state["selected_model"] = imported_asset["asset_name"]
                if upload_type in {AssetType.CABINET_IR, AssetType.REVERB_IR}:
                    loader_state["selected_ir"] = imported_asset["asset_name"]
                plugin["loader_state"] = loader_state

    async def _resequence_channels(self, snapshot_id: int) -> None:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return
        for index, channel in enumerate(sorted(snapshot.channels, key=lambda item: int(item.order_index))):
            channel.order_index = index
        await self.session.flush()

    async def _resequence_plugins(self, chain_id: int) -> None:
        result = await self.session.execute(
            select(SnapshotChainPlugin)
            .where(SnapshotChainPlugin.snapshot_chain_id == chain_id)
            .order_by(SnapshotChainPlugin.position.asc(), SnapshotChainPlugin.id.asc())
        )
        plugins = result.scalars().all()
        for index, plugin in enumerate(plugins):
            plugin.position = index
        await self.session.flush()
