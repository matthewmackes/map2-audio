"""
Unified snapshot service.

The snapshot schema is the new source of truth for editor state, but this
service also emits legacy flow-snapshot payloads/events during the cutover so
existing clients can keep operating while the frontend migrates.
"""

from __future__ import annotations

import copy
import logging
from datetime import datetime
from typing import Any, Iterable, Optional
from uuid import uuid4

from sqlalchemy import delete, inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import (
    EffectsLoop,
    Snapshot,
    SnapshotChannel,
    SnapshotChain,
    SnapshotChainPlugin,
    SnapshotDeployment,
    SnapshotDeploymentHistory,
    SnapshotLoopInsertion,
    SnapshotMidiMap,
    SnapshotRouting,
)
from app.services import snapshot_runtime_service
from app.services.chain_service import ChainService
from app.services.plugin_loader_unified import get_plugin_loader

logger = logging.getLogger(__name__)

DEFAULT_CHANNEL_COLOR = "#2563eb"
DEFAULT_DRY_WET_MIX = 100.0
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


class SnapshotService:
    """CRUD and workflow service for unified snapshots."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.chain_service = ChainService(session)

    async def list_snapshots(self, *, include_shared_only: bool = False) -> list[dict[str, Any]]:
        stmt = (
            select(Snapshot)
            .options(selectinload(Snapshot.channels), selectinload(Snapshot.chains))
            .order_by(Snapshot.display_order.asc(), Snapshot.created_at.asc())
        )
        if include_shared_only:
            stmt = stmt.where(Snapshot.community_shared.is_(True))

        result = await self.session.execute(stmt)
        snapshots = result.scalars().all()
        return [self._serialize_snapshot_summary(snapshot) for snapshot in snapshots]

    async def get_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
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
        input_device: Optional[str] = None,
        output_device: Optional[str] = None,
        detail_payload: Optional[dict[str, Any]] = None,
        is_favorite: bool = False,
    ) -> dict[str, Any]:
        await self._validate_program_number(program_number)
        max_order = await self._get_max_display_order()

        snapshot = Snapshot(
            name=name.strip() or "Snapshot",
            description=description,
            tags=list(tags or []),
            program_number=program_number,
            is_favorite=is_favorite,
            display_order=max_order + 1,
            input_device=input_device,
            output_device=output_device,
        )
        self.session.add(snapshot)
        await self.session.flush()

        normalized = self._normalize_detail_payload(detail_payload or {})
        normalized = await self._enrich_normalized_payload(normalized)
        await self._replace_snapshot_state(snapshot, normalized)
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
        input_device: Any = UNSET,
        output_device: Any = UNSET,
        is_favorite: Any = UNSET,
        display_order: Any = UNSET,
        detail_payload: Any = UNSET,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        if program_number is not UNSET and program_number != snapshot.program_number:
            await self._validate_program_number(program_number, exclude_snapshot_id=snapshot_id)

        if name is not UNSET:
            snapshot.name = name.strip() or snapshot.name
        if description is not UNSET:
            snapshot.description = description
        if tags is not UNSET:
            snapshot.tags = list(tags)
        if program_number is not UNSET:
            snapshot.program_number = program_number
        if input_device is not UNSET:
            snapshot.input_device = input_device
        if output_device is not UNSET:
            snapshot.output_device = output_device
        if is_favorite is not UNSET:
            snapshot.is_favorite = bool(is_favorite)
        if display_order is not UNSET:
            snapshot.display_order = int(display_order)
        snapshot.updated_at = datetime.utcnow()

        if detail_payload is not UNSET:
            normalized = self._normalize_detail_payload(detail_payload)
            normalized = await self._enrich_normalized_payload(normalized)
            await self._replace_snapshot_state(snapshot, normalized)

        await self.session.flush()
        return await self.get_snapshot(snapshot.id)

    async def delete_snapshot(self, snapshot_id: int) -> bool:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return False
        await self.session.delete(snapshot)
        await self.session.flush()
        return True

    async def duplicate_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        snapshot = await self.get_snapshot(snapshot_id)
        if snapshot is None:
            return None
        return await self.create_snapshot(
            name=f"{snapshot['name']} (Copy)",
            description=snapshot.get("description", ""),
            tags=list(snapshot.get("tags", [])),
            input_device=snapshot.get("input_device"),
            output_device=snapshot.get("output_device"),
            detail_payload=snapshot,
        )

    async def activate_snapshot(
        self,
        snapshot_id: int,
        *,
        triggered_by: str = "ui",
    ) -> Optional[dict[str, Any]]:
        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None

        await self.session.execute(update(Snapshot).values(is_active=False))
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None
        snapshot.is_active = True
        snapshot.updated_at = datetime.utcnow()

        params_applied = 0
        bypass_applied = 0
        legacy_payload = self.to_legacy_snapshot_data(detail)
        try:
            params_applied, bypass_applied = await snapshot_runtime_service.apply_snapshot_to_engine(
                copy.deepcopy(legacy_payload)
            )
        except Exception as exc:
            logger.debug("Snapshot activation skipped runtime apply: %s", exc)

        try:
            from app.services.websocket_manager import ws_manager

            timestamp = datetime.utcnow().isoformat()
            await ws_manager.broadcast_json(
                {
                    "type": "snapshot_loaded",
                    "topic": "snapshots",
                    "data": {
                        "snapshot_id": snapshot.id,
                        "snapshot_name": snapshot.name,
                        "snapshot_data": detail,
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
            "snapshot_data": detail,
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

        channel.updated_at = datetime.utcnow()
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
        return await self._reload_snapshot_detail(snapshot_id)

    async def rename_chain(self, snapshot_id: int, chain_id: int, name: str) -> Optional[dict[str, Any]]:
        chain = await self._get_chain(snapshot_id, chain_id)
        if chain is None:
            return None
        chain.name = name.strip() or chain.name
        chain.updated_at = datetime.utcnow()
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
        plugin.updated_at = datetime.utcnow()
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
        plugin.updated_at = datetime.utcnow()
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
        routing.updated_at = datetime.utcnow()
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

        midi_map.entries = [dict(entry) for entry in entries]
        midi_map.updated_at = datetime.utcnow()
        await self.session.flush()
        return await self._reload_snapshot_detail(snapshot_id)

    async def export_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        detail = await self.get_snapshot(snapshot_id)
        if detail is None:
            return None
        return {
            "version": 1,
            "exported_at": datetime.utcnow().isoformat(),
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
        snapshot.updated_at = datetime.utcnow()
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
        snapshot.updated_at = datetime.utcnow()
        await self.session.flush()
        return await self._reload_snapshot_summary(snapshot.id)

    async def record_community_download(self, community_uuid: str) -> Optional[dict[str, Any]]:
        result = await self.session.execute(select(Snapshot).where(Snapshot.community_uuid == community_uuid))
        snapshot = result.scalar_one_or_none()
        if snapshot is None:
            return None
        snapshot_id = snapshot.id
        snapshot.community_download_count = int(snapshot.community_download_count or 0) + 1
        snapshot.updated_at = datetime.utcnow()
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
        return self._normalized_to_detail(await self._snapshot_to_normalized(snapshot), snapshot)

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
        for index, chain in enumerate(chain_entries):
            chain_id = chain.get("id")
            if chain_id is None and snapshot_row is not None and index < len(snapshot_row.chains):
                chain_id = snapshot_row.chains[index].id
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

        return {
            "id": snapshot_id,
            "name": snapshot_row.name if snapshot_row is not None else "Unsaved Snapshot",
            "description": snapshot_row.description if snapshot_row is not None else "",
            "tags": list(snapshot_row.tags or []) if snapshot_row is not None else [],
            "program_number": snapshot_row.program_number if snapshot_row is not None else None,
            "input_device": snapshot_row.input_device if snapshot_row is not None else None,
            "output_device": snapshot_row.output_device if snapshot_row is not None else None,
            "is_active": bool(snapshot_row.is_active) if snapshot_row is not None else False,
            "is_favorite": bool(snapshot_row.is_favorite) if snapshot_row is not None else False,
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
            "created_at": snapshot_row.created_at.isoformat() if snapshot_row is not None and snapshot_row.created_at else None,
            "updated_at": snapshot_row.updated_at.isoformat() if snapshot_row is not None and snapshot_row.updated_at else None,
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
        return {
            "id": snapshot.id,
            "name": snapshot.name,
            "description": snapshot.description or "",
            "tags": list(snapshot.tags or []),
            "program_number": snapshot.program_number,
            "input_device": snapshot.input_device,
            "output_device": snapshot.output_device,
            "is_active": bool(snapshot.is_active),
            "is_favorite": bool(snapshot.is_favorite),
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
            "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
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
