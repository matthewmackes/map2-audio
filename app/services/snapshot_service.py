"""
Unified snapshot service.

The snapshot schema is the new source of truth for editor state, but this
service also emits legacy flow-snapshot payloads/events during the cutover so
existing clients can keep operating while the frontend migrates.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Optional
from uuid import uuid4

from sqlalchemy import delete, func, inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import (
    Chain,
    ChainPlugin,
    EffectsLoop,
    EffectsLoopInsertion,
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
    SnapshotSessionNote,
)
from app.services.maschine_encoder_map_service import normalize_maschine_encoder_map
from app.services import snapshot_runtime_service
from app.services.chain_service import ChainService
from app.services.plugin_loader_unified import get_plugin_loader

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
UNSET = object()


def _stable_channel_label(index: int) -> str:
    return chr(65 + index) if 0 <= index < 26 else f"Ch{index + 1}"


def _normalize_mode(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"parameter_morph", "morph", "ab_switch"}:
        return "morph"
    if normalized in {"parallel_blend", "series", "sidechain"}:
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


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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

    def __init__(self, failures: Iterable[str]):
        normalized_failures = [
            str(failure).strip()
            for failure in failures
            if str(failure).strip()
        ]
        if not normalized_failures:
            normalized_failures = ["Cannot go live: Snapshot pre-flight validation failed."]
        self.failures = normalized_failures
        super().__init__("\n".join(normalized_failures))


class SnapshotService:
    """CRUD and workflow service for unified snapshots."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.chain_service = ChainService(session)

    async def list_snapshots(
        self,
        *,
        include_shared_only: bool = False,
        tags: Optional[Iterable[str]] = None,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(Snapshot)
            .options(selectinload(Snapshot.channels), selectinload(Snapshot.chains))
            .order_by(Snapshot.is_favorite.desc(), Snapshot.display_order.asc(), Snapshot.created_at.asc())
        )
        if include_shared_only:
            stmt = stmt.where(Snapshot.community_shared.is_(True))

        result = await self.session.execute(stmt)
        snapshots = result.scalars().all()
        summaries = [self._serialize_snapshot_summary(snapshot) for snapshot in snapshots]
        tag_set = {str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()}
        if not tag_set:
            return summaries
        return [
            summary
            for summary in summaries
            if tag_set.issubset({tag.lower() for tag in summary.get("tags", [])})
        ]

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

    async def _validate_snapshot_activation_preflight(self, detail: dict[str, Any]) -> None:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if isinstance(chain, dict) and chain.get("id") is not None
        }
        failures: list[str] = []

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
                    failures.append(
                        f"Cannot go live: Channel {channel_label} - plugin {plugin_name} is not installed on this node."
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
                    failures.append(
                        f"Cannot go live: Channel {channel_label} - NAM model {asset_name} not found on this node."
                    )
                    continue

                if plugin_uri in _CABINET_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="cabinet IR")
                    failures.append(
                        f"Cannot go live: Channel {channel_label} - cabinet IR {asset_name} not found on this node."
                    )
                    continue

                if plugin_uri in _REVERB_IR_PLUGIN_URIS:
                    asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="reverb IR")
                    failures.append(
                        f"Cannot go live: Channel {channel_label} - reverb IR {asset_name} not found on this node."
                    )
                    continue

                asset_name = self._preflight_asset_label(loader_state, asset_path, fallback="plugin asset")
                failures.append(
                    f"Cannot go live: Channel {channel_label} - plugin asset {asset_name} not found on this node."
                )

        inventory = self._get_audio_device_inventory()
        input_device = str(detail.get("input_device") or "").strip()
        output_device = str(detail.get("output_device") or "").strip()

        if (
            input_device
            and inventory["has_explicit_input_inventory"]
            and input_device not in inventory["input_names"]
        ):
            failures.append(
                f"Cannot go live: Input device {input_device} is not available on this node."
            )

        if (
            output_device
            and inventory["has_explicit_output_inventory"]
            and output_device not in inventory["output_names"]
        ):
            failures.append(
                f"Cannot go live: Output device {output_device} is not available on this node."
            )

        if failures:
            raise SnapshotActivationPreflightError(failures)

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
        payload["expression_mappings"] = [dict(entry) for entry in payload.get("expression_mappings", []) if isinstance(entry, dict)]
        payload["maschine_encoder_map"] = normalize_maschine_encoder_map(payload.get("maschine_encoder_map"))
        return payload

    async def get_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return await self._serialize_snapshot_detail(snapshot)

    async def get_live_snapshot(self) -> Optional[dict[str, Any]]:
        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        runtime_payload = runtime_state.get("live_snapshot_payload")
        if runtime_state.get("state") == "live" and isinstance(runtime_payload, dict):
            snapshot_id = _safe_int(runtime_payload.get("id"))
            if snapshot_id is not None:
                live_detail = await self.get_snapshot(snapshot_id)
                if live_detail is not None:
                    live_detail["snapshot_revision"] = (
                        runtime_state.get("snapshot_revision")
                        or runtime_payload.get("snapshot_revision")
                        or live_detail.get("snapshot_revision")
                    )
                    return live_detail
            return runtime_payload

        result = await self.session.execute(
            select(Snapshot)
            .options(
                selectinload(Snapshot.channels),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.plugins),
                selectinload(Snapshot.chains).selectinload(SnapshotChain.loop_insertions),
                selectinload(Snapshot.routing),
                selectinload(Snapshot.midi_map),
                selectinload(Snapshot.deployments).selectinload(SnapshotDeployment.history),
                selectinload(Snapshot.session_notes),
            )
            .where(Snapshot.is_active.is_(True))
            .order_by(Snapshot.updated_at.desc(), Snapshot.id.desc())
            .limit(1)
        )
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None
        return await self._serialize_snapshot_detail(snapshot)

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
    ) -> dict[str, Any]:
        normalized_name = validate_snapshot_name(name)
        await self._validate_program_number(program_number)
        max_order = await self._get_max_display_order()

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
            input_device=input_device,
            output_device=output_device,
            controls_payload=self._normalize_controls_payload(controls_payload, detail_payload),
            live_state_payload={},
        )
        self.session.add(snapshot)
        await self.session.flush()

        normalized = self._normalize_detail_payload(detail_payload or {})
        normalized = await self._enrich_normalized_payload(normalized)
        await self._replace_snapshot_state(snapshot, normalized)
        snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
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
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        revision_source = await self.get_snapshot(snapshot_id) if create_revision else None

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
            normalized = await self._enrich_normalized_payload(normalized)
            await self._replace_snapshot_state(snapshot, normalized)
            snapshot.tags = self._derive_snapshot_tags_from_normalized(normalized)
        else:
            snapshot.tags = self._derive_snapshot_tags_from_snapshot(snapshot)

        await self.session.flush()
        if create_revision and revision_source is not None:
            await self._append_snapshot_revision(snapshot_id, revision_source)

        detail = await self.get_snapshot(snapshot.id)
        if detail is None:
            return None

        if snapshot.is_active:
            try:
                from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

                await SnapshotRuntimeStateService(self.session).sync_live_snapshot_payload(
                    snapshot_id=snapshot.id,
                    live_snapshot_payload=detail,
                    snapshot_revision=detail.get("snapshot_revision"),
                )
            except Exception as exc:
                logger.debug("Snapshot runtime live-state sync skipped for %s: %s", snapshot.id, exc)

        if tempo_bpm is not UNSET:
            try:
                from app.services.snapshot_tempo_service import get_snapshot_tempo_service

                legacy_payload = None
                if snapshot.is_active:
                    legacy_payload = copy.deepcopy(self.to_legacy_snapshot_data(detail))
                await get_snapshot_tempo_service().update_stored_tempo(
                    snapshot.id,
                    snapshot.tempo_bpm,
                    snapshot_data=legacy_payload,
                )
            except Exception as exc:
                logger.debug("Snapshot tempo runtime update skipped for %s: %s", snapshot.id, exc)
        return detail

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return False

        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        runtime_state = await SnapshotRuntimeStateService(self.session).get_live_state()
        live_snapshot_id = runtime_state.get("snapshot_id")
        live_snapshot_payload = runtime_state.get("live_snapshot_payload") or {}
        if live_snapshot_id == snapshot_id or live_snapshot_payload.get("id") == snapshot_id:
            raise ValueError("Cannot delete a live snapshot.")

        await self.session.delete(snapshot)
        await self.session.flush()
        return True

    async def list_session_notes(self, snapshot_id: int) -> Optional[list[dict[str, Any]]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        return [self._serialize_session_note(note) for note in snapshot.session_notes]

    async def add_session_note(self, snapshot_id: int, body: str) -> Optional[list[dict[str, Any]]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        normalized_body = str(body or "").strip()
        if not normalized_body:
            raise ValueError("Session note text is required")

        self.session.add(
            SnapshotSessionNote(
                snapshot_id=snapshot.id,
                body=normalized_body,
                created_at=_utcnow(),
            )
        )
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        await self.session.refresh(snapshot, attribute_names=["session_notes"])
        return [self._serialize_session_note(note) for note in snapshot.session_notes]

    async def list_revisions(self, snapshot_id: int) -> Optional[list[dict[str, Any]]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        result = await self.session.execute(
            select(SnapshotRevision)
            .where(SnapshotRevision.snapshot_id == snapshot_id)
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
        )
        revisions = result.scalars().all()
        return [self._serialize_snapshot_revision(revision) for revision in revisions]

    async def restore_revision(
        self,
        snapshot_id: int,
        revision_number: int,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        result = await self.session.execute(
            select(SnapshotRevision).where(
                SnapshotRevision.snapshot_id == snapshot_id,
                SnapshotRevision.revision_number == revision_number,
            )
        )
        revision = result.scalar_one_or_none()
        if revision is None:
            return None

        payload = dict(revision.payload or {})
        restored = await self.update_snapshot(
            snapshot_id,
            tempo_bpm=payload["tempo_bpm"] if "tempo_bpm" in payload else UNSET,
            output_level_reference_dbfs=(
                payload["output_level_reference_dbfs"]
                if "output_level_reference_dbfs" in payload
                else UNSET
            ),
            output_level_warning_threshold_db=(
                payload["output_level_warning_threshold_db"]
                if "output_level_warning_threshold_db" in payload
                else UNSET
            ),
            input_device=payload["input_device"] if "input_device" in payload else UNSET,
            output_device=payload["output_device"] if "output_device" in payload else UNSET,
            controls_payload=payload["controls"] if "controls" in payload else UNSET,
            detail_payload=payload,
            create_revision=True,
        )
        return restored

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
        )

    async def activate_snapshot(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService

        normalized = await self._snapshot_to_normalized(snapshot)
        snapshot_revision = self._snapshot_revision_from_normalized(normalized)
        runtime_state_service = SnapshotRuntimeStateService(self.session)
        intent = await runtime_state_service.create_activation_intent(
            snapshot_id=snapshot.id,
            snapshot_name=snapshot.name,
            snapshot_revision=snapshot_revision,
            normalized_snapshot_payload=self._canonicalize_snapshot_normalized(normalized),
            triggered_by=triggered_by,
        )

        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None

        params_applied = 0
        bypass_applied = 0
        try:
            await self._validate_snapshot_activation_preflight(detail)
        except Exception as exc:
            await runtime_state_service.fail_intent(
                intent=intent,
                failure_reason=str(exc),
                runtime_metrics={},
            )
            raise

        try:
            await self._clear_materialized_runtime_chains()
            live_state_payload = await self._materialize_live_state(snapshot, detail)
            snapshot.live_state_payload = live_state_payload
            await self.session.flush()

            refreshed_detail = await self.get_snapshot(snapshot_id)
            if refreshed_detail is None:
                return None

            channel_health = await runtime_state_service.assert_snapshot_channels_active(
                live_snapshot_payload=refreshed_detail,
            )
            refreshed_detail = channel_health["snapshot_payload"]

            legacy_payload = self.to_legacy_snapshot_data(refreshed_detail)
            params_applied, bypass_applied = await snapshot_runtime_service.apply_snapshot_to_engine(
                copy.deepcopy(legacy_payload)
            )

            activated_at = _utcnow()
            await self._clear_compatibility_live_projections()
            snapshot.is_active = True
            snapshot.updated_at = activated_at
            snapshot.activated_at = activated_at
            snapshot.live_state_payload = live_state_payload
            await self.session.flush()

            try:
                from app.services.snapshot_tempo_service import get_snapshot_tempo_service

                await get_snapshot_tempo_service().activate_snapshot(
                    snapshot.id,
                    snapshot.tempo_bpm,
                    snapshot_data=copy.deepcopy(legacy_payload),
                )
            except Exception as exc:
                logger.debug("Snapshot tempo activation skipped for %s: %s", snapshot.id, exc)

            refreshed_detail = await self.get_snapshot(snapshot_id)
            if refreshed_detail is None:
                return None
            refreshed_detail["snapshot_revision"] = snapshot_revision

            runtime_metrics = {
                "params_applied": params_applied,
                "bypass_applied": bypass_applied,
                "runtime_chain_count": len(refreshed_detail.get("live_state", {}).get("runtime_chains", [])),
                "channel_activity": {
                    "active_count": channel_health["active_count"],
                    "total_count": channel_health["total_count"],
                    "inactive_channels": channel_health["inactive_channels"],
                },
            }
            live_runtime_state = await runtime_state_service.confirm_live_intent(
                intent=intent,
                live_snapshot_payload=refreshed_detail,
                runtime_metrics=runtime_metrics,
            )
            try:
                from app.services.snapshot_runtime_state_service import schedule_post_activation_health_check

                schedule_post_activation_health_check(
                    snapshot_id=snapshot.id,
                    request_id=str(intent["request_id"]),
                )
            except Exception as exc:
                logger.debug("Post-activation health check scheduling skipped for %s: %s", snapshot.id, exc)
        except Exception as exc:
            await self._clear_compatibility_live_projections()
            await self.session.flush()
            await runtime_state_service.fail_intent(
                intent=intent,
                failure_reason=str(exc),
                runtime_metrics={},
            )
            raise

        try:
            from app.services.websocket_manager import ws_manager

            timestamp = _utcnow().isoformat()
            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_loaded",
                    "topic": "snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": refreshed_detail,
                        "triggered_by": triggered_by,
                        "program_number": snapshot.program_number,
                    },
                    "timestamp": timestamp,
                },
                topic="snapshots",
            )
            await ws_manager.broadcast_json(
                {
                    "type": "flow_snapshot_loaded",
                    "topic": "flow_snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": legacy_payload,
                        "triggered_by": triggered_by,
                        "program_number": snapshot.program_number,
                    },
                    "timestamp": timestamp,
                },
                topic="flow_snapshots",
            )
        except Exception as exc:
            logger.debug("Snapshot activation websocket broadcast failed: %s", exc)

        return {
            "status": "success",
            "snapshot_id": snapshot.id,
            "name": snapshot.name,
            "snapshot_data": refreshed_detail,
            "snapshot_revision": snapshot_revision,
            "activation_intent": intent,
            "runtime_live_state": live_runtime_state,
            "params_applied": params_applied,
            "bypass_applied": bypass_applied,
        }

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
        return await self._reload_snapshot_detail(snapshot_id)

    async def remove_channel(self, snapshot_id: int, channel_id: int) -> Optional[dict[str, Any]]:
        channel = await self._get_channel(snapshot_id, channel_id)
        if channel is None:
            return None
        await self.session.delete(channel)
        await self.session.flush()
        await self._resequence_channels(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def create_chain(self, snapshot_id: int, name: str) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        next_index = len(snapshot.chains)
        chain = SnapshotChain(snapshot_id=snapshot.id, name=name.strip() or f"Chain {next_index + 1}", order_index=next_index)
        self.session.add(chain)
        await self.session.flush()
        await self._sync_snapshot_tags(snapshot_id)
        return await self._reload_snapshot_detail(snapshot_id)

    async def rename_chain(self, snapshot_id: int, chain_id: int, name: str) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        chain.name = name.strip() or chain.name
        chain.updated_at = _utcnow()
        await self.session.flush()
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
        await self.session.delete(plugin)
        await self.session.flush()
        await self._resequence_plugins(chain_id)
        await self._sync_snapshot_tags(snapshot_id)
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
        for index, plugin_id in enumerate(plugin_ids):
            plugin = plugin_map.get(plugin_id)
            if plugin is not None:
                plugin.position = index
        await self.session.flush()
        await self._resequence_plugins(chain_id)
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
        return await self._reload_snapshot_detail(snapshot_id)

    async def update_routing(self, snapshot_id: int, payload: dict[str, Any]) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        routing = snapshot.routing
        if routing is None:
            routing = SnapshotRouting(snapshot_id=snapshot.id)
            self.session.add(routing)
            await self.session.flush()

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
        return await self._reload_snapshot_detail(snapshot_id)

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
        return await self._reload_snapshot_detail(snapshot_id)

    async def export_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None
        return {
            "version": 1,
            "exported_at": _utcnow().isoformat(),
            "snapshot": detail,
            "asset_manifest": self._build_asset_manifest(detail),
        }

    async def import_snapshot(self, payload: dict[str, Any]) -> dict[str, Any]:
        if "snapshot" in payload and isinstance(payload["snapshot"], dict):
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
        )
        return imported

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
        snapshot.community_shared = True
        snapshot.community_author = author_name.strip() or "Anonymous"
        if not snapshot.community_uuid:
            snapshot.community_uuid = uuid4().hex
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

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

    async def rate_community_snapshot(self, community_uuid: str, rating: int) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None
        rating = max(1, min(5, int(rating)))
        snapshot.community_rating_sum = float(snapshot.community_rating_sum or 0.0) + rating
        snapshot.community_rating_count = int(snapshot.community_rating_count or 0) + 1
        snapshot.updated_at = _utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def record_community_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
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
                selectinload(Snapshot.session_notes),
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

    async def _replace_snapshot_state(self, snapshot: Snapshot, normalized: dict[str, Any]) -> None:
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

    def _normalize_detail_payload(self, detail_payload: dict[str, Any]) -> dict[str, Any]:
        payload = copy.deepcopy(detail_payload or {})

        raw_chains = payload.get("chains", [])
        normalized_chains: list[dict[str, Any]] = []
        chain_by_ref: dict[str, dict[str, Any]] = {}
        if isinstance(raw_chains, dict):
            chain_items = list(raw_chains.items())
        elif isinstance(raw_chains, list):
            chain_items = [(str(item.get("id", f"chain-{index}")), item) for index, item in enumerate(raw_chains) if isinstance(item, dict)]
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
        }

    async def _enrich_normalized_payload(self, normalized: dict[str, Any]) -> dict[str, Any]:
        detail = self._normalized_to_detail(normalized, snapshot_row=None)
        try:
            legacy_payload = self.to_legacy_snapshot_data(detail)
            enriched = await snapshot_runtime_service.enrich_snapshot_data(copy.deepcopy(legacy_payload))
            enriched_normalized = self._normalize_detail_payload(enriched)
            enriched_normalized["midi_map"] = [dict(entry) for entry in normalized.get("midi_map", [])]
            return enriched_normalized
        except Exception as exc:
            logger.debug("Snapshot enrichment skipped runtime refresh: %s", exc)
            return normalized

    async def _serialize_snapshot_detail(self, snapshot: Snapshot) -> dict[str, Any]:
        normalized = await self._snapshot_to_normalized(snapshot)
        detail = self._normalized_to_detail(normalized, snapshot)
        detail["snapshot_revision"] = self._snapshot_revision_from_normalized(normalized)
        detail["io_bindings"] = {
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "remap_required": False,
        }
        detail["controls"] = self._normalize_controls_payload(
            snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
            detail,
        )
        detail["lineage"] = {
            "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
        }
        detail["is_locked"] = bool(snapshot.is_locked)
        detail["session_notes"] = [self._serialize_session_note(note) for note in snapshot.session_notes]
        detail["assets"] = self._build_asset_manifest(detail)
        detail["paths"] = self._build_snapshot_paths(detail, snapshot.live_state_payload)
        detail["live_state"] = await self._build_live_state(snapshot)
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
        live_state_payload: Any,
    ) -> list[dict[str, Any]]:
        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if chain.get("id") is not None
        }
        live_paths = {
            str(item.get("path_id")): item
            for item in (live_state_payload or {}).get("paths", [])
            if isinstance(item, dict) and item.get("path_id") is not None
        } if isinstance(live_state_payload, dict) else {}

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

    async def _build_live_state(self, snapshot: Snapshot) -> dict[str, Any]:
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

        payload = dict(snapshot.live_state_payload or {}) if isinstance(snapshot.live_state_payload, dict) else {}
        runtime_paths = [dict(item) for item in payload.get("paths", []) if isinstance(item, dict)]
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
            "is_live": bool(snapshot.is_active),
            "activated_at": snapshot.activated_at.isoformat() if snapshot.activated_at else None,
            "paths": runtime_paths,
            "runtime_chains": runtime_chains,
            "display_state": "live" if snapshot.is_active else "stopped",
            "display_label": "Live" if snapshot.is_active else "Stopped",
            "is_warning": False,
            "is_offline": False,
            "last_runtime_event_at": snapshot.activated_at.isoformat() if snapshot.activated_at else None,
        }

    async def _clear_compatibility_live_projections(self) -> None:
        await self.session.execute(
            update(Snapshot).values(
                is_active=False,
                live_state_payload={},
                activated_at=None,
            )
        )
        await self.session.flush()

    async def _clear_materialized_runtime_chains(self) -> None:
        result = await self.session.execute(select(Chain))
        for chain in result.scalars().all():
            config = self.chain_service._parse_chain_config(chain.config)
            if not isinstance(config, dict):
                continue
            if config.get("source_kind") == "snapshot_path" or (
                config.get("snapshot_id") is not None and config.get("path_id") is not None
            ):
                await self.session.delete(chain)
        await self.session.flush()

    async def _materialize_live_state(self, snapshot: Snapshot, detail: dict[str, Any]) -> dict[str, Any]:
        await self.session.execute(update(Chain).values(is_active=False))
        await self.session.flush()

        chain_by_id = {
            chain.get("id"): chain
            for chain in detail.get("chains", [])
            if chain.get("id") is not None
        }
        runtime_paths: list[dict[str, Any]] = []
        activated_runtime_chain_ids: list[int] = []

        for channel in detail.get("channels", []):
            snapshot_chain_id = channel.get("chain_id")
            source_chain = chain_by_id.get(snapshot_chain_id) if snapshot_chain_id is not None else None
            runtime_chain = Chain(
                name=f"{source_chain.get('name') if isinstance(source_chain, dict) and source_chain.get('name') else 'Path'} ({channel.get('label') or channel.get('channel_key')})",
                is_active=False,
                config=json.dumps(
                    {
                        "source_kind": "snapshot_path",
                        "snapshot_id": snapshot.id,
                        "snapshot_chain_id": snapshot_chain_id,
                        "path_id": channel.get("channel_key"),
                    }
                ),
            )
            self.session.add(runtime_chain)
            await self.session.flush()

            if isinstance(source_chain, dict):
                for plugin in source_chain.get("plugins", []):
                    if not isinstance(plugin, dict):
                        continue
                    self.session.add(
                        ChainPlugin(
                            chain_id=runtime_chain.id,
                            plugin_uri=str(plugin.get("uri") or ""),
                            position=int(plugin.get("position", 0)),
                            bypass=bool(plugin.get("bypass", False)),
                            **self.chain_service._chain_plugin_loader_columns(
                                str(plugin.get("uri") or ""),
                                plugin.get("loader_state") if isinstance(plugin.get("loader_state"), dict) else None,
                            ),
                        )
                    )

                for loop in source_chain.get("loop_insertions", []):
                    if not isinstance(loop, dict):
                        continue
                    self.session.add(
                        EffectsLoopInsertion(
                            insertion_id=f"snapshot-{snapshot.id}-{uuid4().hex[:12]}",
                            chain_id=runtime_chain.id,
                            loop_id=str(loop.get("loop_id") or ""),
                            slot_index=int(loop.get("slot_index", 0)),
                            enabled=bool(loop.get("enabled", True)),
                            mode=str(loop.get("mode") or "serial_insert"),
                            blend_pct=_safe_float(loop.get("blend_pct"), 100.0),
                            send_gain_db=_safe_float(loop.get("send_gain_db"), 0.0),
                            return_gain_db=_safe_float(loop.get("return_gain_db"), 0.0),
                            crossfade_ms=int(_safe_int(loop.get("crossfade_ms")) or 12),
                            band_split_hz=list(loop.get("band_split_hz") or []),
                        )
                    )

            await self.session.flush()
            activated = await self.chain_service.activate_chain(runtime_chain.id)
            runtime_chain_id = runtime_chain.id
            runtime_chain_name = runtime_chain.name
            activation_status = "active" if activated else "degraded"
            activated_runtime_chain_ids.append(runtime_chain.id)

            runtime_paths.append(
                {
                    "path_id": channel.get("channel_key"),
                    "label": channel.get("label"),
                    "color": channel.get("color"),
                    "snapshot_chain_id": snapshot_chain_id,
                    "runtime_chain_id": runtime_chain_id,
                    "runtime_chain_name": runtime_chain_name,
                    "activation_status": activation_status,
                }
            )

        return {
            "activated_at": snapshot.activated_at.isoformat() if snapshot.activated_at else _utcnow().isoformat(),
            "paths": runtime_paths,
            "active_runtime_chain_ids": activated_runtime_chain_ids,
        }

    async def _snapshot_to_normalized(self, snapshot: Snapshot) -> dict[str, Any]:
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
        }

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
        is_active: bool = False,
    ) -> dict[str, Any]:
        resolved_snapshot_id = snapshot_row.id if snapshot_row is not None else snapshot_id
        resolved_stored_bpm = (
            snapshot_row.tempo_bpm
            if snapshot_row is not None and snapshot_row.tempo_bpm is not None
            else stored_tempo_bpm
        )
        resolved_is_active = bool(snapshot_row.is_active) if snapshot_row is not None else bool(is_active)
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
            chain_id = chain.get("id")
            if chain_id is None and snapshot_row is not None and index < len(snapshot_row.chains):
                chain_id = snapshot_row.chains[index].id
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
                    "id": channel.get("id"),
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
            "is_active": bool(snapshot_row.is_active) if snapshot_row is not None else False,
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
            "active_channel_index": channel_key_to_index.get(routing["active_channel_key"], 0),
            "channel_count": len(detail_channels),
            "chain_count": len(chains_payload),
            "community_uuid": snapshot_row.community_uuid if snapshot_row is not None else None,
            "community_shared": bool(snapshot_row.community_shared) if snapshot_row is not None else False,
            "community_author": snapshot_row.community_author if snapshot_row is not None else "Anonymous",
            "community_download_count": int(snapshot_row.community_download_count or 0) if snapshot_row is not None else 0,
            "community_rating": average_rating,
            "community_rating_count": int(snapshot_row.community_rating_count or 0) if snapshot_row is not None else 0,
            "activated_at": snapshot_row.activated_at.isoformat() if snapshot_row is not None and snapshot_row.activated_at else None,
            "created_at": snapshot_row.created_at.isoformat() if snapshot_row is not None and snapshot_row.created_at else None,
            "updated_at": snapshot_row.updated_at.isoformat() if snapshot_row is not None and snapshot_row.updated_at else None,
            "session_notes": [self._serialize_session_note(item) for item in (snapshot_row.session_notes if snapshot_row is not None else [])],
            "deployments": [self._serialize_deployment(item) for item in (snapshot_row.deployments if snapshot_row is not None else [])],
        }

    def _serialize_snapshot_summary(self, snapshot: Snapshot) -> dict[str, Any]:
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
        average_rating = None
        if snapshot.community_rating_count:
            average_rating = float(snapshot.community_rating_sum or 0.0) / float(snapshot.community_rating_count)
        tempo_status = self._tempo_status_for_snapshot(snapshot)
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
                "remap_required": False,
            },
            "lineage": {
                "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
            },
            "is_active": bool(snapshot.is_active),
            "is_favorite": bool(snapshot.is_favorite),
            "is_locked": bool(snapshot.is_locked),
            "display_order": int(snapshot.display_order),
            "channels": channel_summaries,
            "channel_count": len(channel_summaries),
            "chain_count": len(snapshot.chains),
            "community_uuid": snapshot.community_uuid,
            "community_shared": bool(snapshot.community_shared),
            "community_author": snapshot.community_author,
            "community_download_count": int(snapshot.community_download_count or 0),
            "community_rating": average_rating,
            "community_rating_count": int(snapshot.community_rating_count or 0),
            "activated_at": snapshot.activated_at.isoformat() if snapshot.activated_at else None,
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        }

    def _serialize_session_note(self, note: SnapshotSessionNote) -> dict[str, Any]:
        return {
            "id": note.id,
            "snapshot_id": note.snapshot_id,
            "body": note.body,
            "created_at": note.created_at.isoformat() if note.created_at else None,
        }

    async def _append_snapshot_revision(self, snapshot_id: int, detail: dict[str, Any]) -> dict[str, Any]:
        result = await self.session.execute(
            select(SnapshotRevision)
            .where(SnapshotRevision.snapshot_id == snapshot_id)
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
            .limit(1)
        )
        latest = result.scalar_one_or_none()
        next_revision_number = int(latest.revision_number if latest is not None else 0) + 1
        revision = SnapshotRevision(
            snapshot_id=snapshot_id,
            revision_number=next_revision_number,
            snapshot_revision=str(detail.get("snapshot_revision") or "").strip() or None,
            summary=self._build_snapshot_revision_summary(detail),
            payload=self._build_snapshot_revision_payload(detail),
            saved_at=_utcnow(),
        )
        self.session.add(revision)
        await self.session.flush()
        await self._prune_snapshot_revisions(snapshot_id)
        return self._serialize_snapshot_revision(revision)

    async def _prune_snapshot_revisions(self, snapshot_id: int) -> None:
        result = await self.session.execute(
            select(SnapshotRevision)
            .where(SnapshotRevision.snapshot_id == snapshot_id)
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
        )
        revisions = result.scalars().all()
        for revision in revisions[MAX_SNAPSHOT_REVISIONS:]:
            await self.session.delete(revision)
        if len(revisions) > MAX_SNAPSHOT_REVISIONS:
            await self.session.flush()

    def _build_snapshot_revision_payload(self, detail: dict[str, Any]) -> dict[str, Any]:
        return {
            "tempo_bpm": _safe_float(detail.get("tempo_bpm"), DEFAULT_SNAPSHOT_TEMPO_BPM),
            "output_level_reference_dbfs": detail.get("output_level_reference_dbfs"),
            "output_level_warning_threshold_db": detail.get("output_level_warning_threshold_db"),
            "input_device": detail.get("input_device"),
            "output_device": detail.get("output_device"),
            "controls": copy.deepcopy(detail.get("controls") or {}),
            "channels": copy.deepcopy(detail.get("channels") or []),
            "chains": copy.deepcopy(detail.get("chains") or []),
            "routing": copy.deepcopy(detail.get("routing") or {}),
            "midi_map": copy.deepcopy(detail.get("midi_map") or []),
        }

    def _build_snapshot_revision_summary(self, detail: dict[str, Any]) -> str:
        block_count = self._count_snapshot_blocks(detail)
        channel_count = len([item for item in detail.get("channels", []) if isinstance(item, dict)])
        routing_mode = str((detail.get("routing") or {}).get("mode") or "parallel_blend").replace("_", " ")
        block_label = "block" if block_count == 1 else "blocks"
        channel_label = "channel" if channel_count == 1 else "channels"
        return f"{block_count} {block_label}, {channel_count} {channel_label}, {routing_mode} routing"

    def _count_snapshot_blocks(self, detail: dict[str, Any]) -> int:
        chains = [item for item in detail.get("chains", []) if isinstance(item, dict)]
        block_count = sum(len([plugin for plugin in chain.get("plugins", []) if isinstance(plugin, dict)]) for chain in chains)
        if block_count > 0:
            return block_count
        paths = [item for item in detail.get("paths", []) if isinstance(item, dict)]
        return sum(len([plugin for plugin in path.get("plugins", []) if isinstance(plugin, dict)]) for path in paths)

    def _serialize_snapshot_revision(self, revision: SnapshotRevision) -> dict[str, Any]:
        return {
            "id": revision.id,
            "snapshot_id": revision.snapshot_id,
            "revision_number": int(revision.revision_number),
            "snapshot_revision": revision.snapshot_revision,
            "summary": revision.summary,
            "saved_at": revision.saved_at.isoformat() if revision.saved_at else None,
        }

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
                asset_path = loader_state.get("selected_asset_path")
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
                        "available": not bool(plugin.get("is_placeholder", False)),
                    }
                )
        return manifest

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
