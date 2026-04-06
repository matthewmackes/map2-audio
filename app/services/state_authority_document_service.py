"""
State Authority graph-document persistence helpers.

This service owns document build/validation, asset-registry synchronization,
and document-backed read restoration so SnapshotService can delegate the
graph-native storage layer instead of embedding it inline.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Snapshot, StateAuthorityAsset
from app.services.state_authority_graph import (
    SNAPSHOT_GRAPH_VERSION,
    legacy_compatible_plugin_uri,
    normalize_and_validate_graph_document,
)


NormalizeControlsPayload = Callable[[dict[str, Any] | None, Any], dict[str, Any]]
NormalizeDetailPayload = Callable[[dict[str, Any]], dict[str, Any]]


class StateAuthorityDocumentService:
    """Owns graph-document persistence and restoration for snapshot workflows."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        normalize_controls_payload: NormalizeControlsPayload,
        normalize_detail_payload: NormalizeDetailPayload,
        safe_float: Callable[[Any, float], float],
        safe_int: Callable[[Any], int | None],
        default_snapshot_tempo_bpm: float,
    ) -> None:
        self.session = session
        self._normalize_controls_payload = normalize_controls_payload
        self._normalize_detail_payload = normalize_detail_payload
        self._safe_float = safe_float
        self._safe_int = safe_int
        self._default_snapshot_tempo_bpm = default_snapshot_tempo_bpm

    def build_document(
        self,
        snapshot: Snapshot,
        normalized: dict[str, Any],
    ) -> dict[str, Any]:
        routing = normalized.get("routing") if isinstance(normalized.get("routing"), dict) else {}
        document = {
            "version": SNAPSHOT_GRAPH_VERSION,
            "meta": {
                "name": snapshot.name,
                "description": snapshot.description or "",
                "tags": list(snapshot.tags or []),
                "program_number": snapshot.program_number,
                "type": "snapshot",
                "is_favorite": bool(snapshot.is_favorite),
                "is_locked": bool(snapshot.is_locked),
                "display_order": int(snapshot.display_order or 0),
                "derived_from_snapshot_id": snapshot.derived_from_snapshot_id,
                "io_bindings": {
                    "input_device": snapshot.input_device,
                    "output_device": snapshot.output_device,
                    "monitoring_output_index": self._normalize_controls_payload(
                        snapshot.controls_payload if isinstance(snapshot.controls_payload, dict) else None,
                        None,
                    ).get("monitoring_output_index"),
                },
                "community": {
                    "uuid": snapshot.community_uuid,
                    "shared": bool(snapshot.community_shared),
                    "author": snapshot.community_author,
                    "download_count": int(snapshot.community_download_count or 0),
                    "rating_sum": float(snapshot.community_rating_sum or 0.0),
                    "rating_count": int(snapshot.community_rating_count or 0),
                },
            },
            "graph": {
                "channels": copy.deepcopy(normalized.get("channels") or []),
                "chains": copy.deepcopy(normalized.get("chains") or []),
                "routing": copy.deepcopy(normalized.get("routing") or {}),
                "morph": self._build_morph_document_block(routing),
                "midi_map": copy.deepcopy(normalized.get("midi_map") or []),
                "tempo_bpm": self._safe_float(snapshot.tempo_bpm, self._default_snapshot_tempo_bpm),
                "output_level_reference_dbfs": snapshot.output_level_reference_dbfs,
                "output_level_warning_threshold_db": (
                    float(snapshot.output_level_warning_threshold_db)
                    if snapshot.output_level_warning_threshold_db is not None
                    else 3.0
                ),
                "nodes": [],
                "edges": [],
            },
            "controls": copy.deepcopy(snapshot.controls_payload or {}),
            "extensions": copy.deepcopy(normalized.get("extensions") or {}),
        }
        for chain in document["graph"]["chains"]:
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                document["graph"]["nodes"].append(
                    {
                        "id": f"{chain.get('source_key', 'chain')}:{plugin.get('position', 0)}",
                        "uri": plugin.get("uri"),
                        "name": plugin.get("name") or plugin.get("uri") or "Plugin",
                        "bypass": bool(plugin.get("bypass", False)),
                        "parameters": dict(plugin.get("parameters") or {}),
                        "state": dict(plugin.get("loader_state") or {}),
                    }
                )
        return document

    def build_validated_document(
        self,
        snapshot: Snapshot,
        normalized: dict[str, Any],
    ) -> dict[str, Any]:
        return normalize_and_validate_graph_document(self.build_document(snapshot, normalized))

    async def persist_snapshot_document(
        self,
        snapshot: Snapshot,
        normalized: dict[str, Any],
    ) -> None:
        snapshot.document = self.build_validated_document(snapshot, normalized)
        await self.sync_asset_registry(snapshot.document)

    async def sync_asset_registry(self, document: dict[str, Any]) -> None:
        assets = document.get("assets") if isinstance(document.get("assets"), list) else []
        for asset in assets:
            if not isinstance(asset, dict):
                continue
            asset_hash = str(asset.get("hash") or "").strip()
            source_path = str(asset.get("path") or "").strip()
            if not asset_hash or not source_path:
                continue
            result = await self.session.execute(
                select(StateAuthorityAsset).where(StateAuthorityAsset.asset_hash == asset_hash)
            )
            existing = result.scalar_one_or_none()
            if existing is None:
                self.session.add(
                    StateAuthorityAsset(
                        asset_hash=asset_hash,
                        source_path=source_path,
                        file_name=str(asset.get("name") or Path(source_path).name or asset_hash),
                        size_bytes=self._safe_int(asset.get("size_bytes")) or 0,
                        asset_type=str(asset.get("type") or "binary"),
                    )
                )
                continue
            existing.source_path = source_path
            existing.file_name = str(asset.get("name") or existing.file_name or Path(source_path).name or asset_hash)
            existing.size_bytes = self._safe_int(asset.get("size_bytes")) or existing.size_bytes or 0
            existing.asset_type = str(asset.get("type") or existing.asset_type or "binary")

    async def document_to_normalized(self, document: dict[str, Any]) -> dict[str, Any]:
        graph = document.get("graph") if isinstance(document.get("graph"), dict) else {}
        assets = document.get("assets") if isinstance(document.get("assets"), list) else []
        asset_paths: dict[str, str] = {
            str(item.get("hash")): str(item.get("path"))
            for item in assets
            if isinstance(item, dict) and item.get("hash") and item.get("path")
        }
        missing_hashes = sorted(
            hash_ref
            for hash_ref in self.extract_document_asset_hashes(document)
            if hash_ref not in asset_paths
        )
        if missing_hashes:
            result = await self.session.execute(
                select(StateAuthorityAsset).where(StateAuthorityAsset.asset_hash.in_(missing_hashes))
            )
            for asset in result.scalars():
                if asset.asset_hash and asset.source_path:
                    asset_paths[str(asset.asset_hash)] = str(asset.source_path)

        def _restore_loader_state(value: Any) -> Any:
            if isinstance(value, dict):
                restored: dict[str, Any] = {}
                for key, nested in value.items():
                    if isinstance(nested, str) and nested.startswith("sha256:") and nested in asset_paths:
                        restored[key] = asset_paths[nested]
                    else:
                        restored[key] = _restore_loader_state(nested)
                return restored
            if isinstance(value, list):
                return [_restore_loader_state(item) for item in value]
            return value

        graph_morph = graph.get("morph") if isinstance(graph.get("morph"), dict) else {}
        restored_routing = copy.deepcopy(graph.get("routing") or {})
        if graph_morph:
            restored_routing["morph_position"] = self._safe_float(graph_morph.get("position"), 0.5)
            restored_routing["morph_source_channel_key"] = graph_morph.get("source_channel_key")
            restored_routing["morph_target_channel_key"] = graph_morph.get("target_channel_key")
            morph_mode = self._routing_mode_from_graph_morph(str(graph_morph.get("mode") or ""))
            if morph_mode is not None:
                restored_routing["mode"] = morph_mode

        normalized = {
            "channels": copy.deepcopy(graph.get("channels") or []),
            "chains": copy.deepcopy(graph.get("chains") or []),
            "routing": restored_routing,
            "midi_map": copy.deepcopy(graph.get("midi_map") or []),
            "input_device": ((document.get("meta") or {}).get("io_bindings") or {}).get("input_device"),
            "output_device": ((document.get("meta") or {}).get("io_bindings") or {}).get("output_device"),
            "extensions": copy.deepcopy(document.get("extensions") or {}),
        }
        for chain in normalized["chains"]:
            if not isinstance(chain, dict):
                continue
            for plugin in chain.get("plugins", []):
                if not isinstance(plugin, dict):
                    continue
                plugin["uri"] = legacy_compatible_plugin_uri(str(plugin.get("uri") or ""))
                plugin["loader_state"] = _restore_loader_state(plugin.get("loader_state") or {})
        return self._normalize_detail_payload(normalized)

    @staticmethod
    def extract_document_asset_hashes(document: dict[str, Any]) -> set[str]:
        references: set[str] = set()

        def _walk(value: Any) -> None:
            if isinstance(value, dict):
                for nested in value.values():
                    _walk(nested)
                return
            if isinstance(value, list):
                for nested in value:
                    _walk(nested)
                return
            if isinstance(value, str) and value.startswith("sha256:"):
                references.add(value)

        _walk(document)
        return references

    def _build_morph_document_block(self, routing: dict[str, Any]) -> dict[str, Any]:
        route_mode = str(routing.get("mode") or "").strip().lower()
        if route_mode == "morph":
            morph_mode = "intra_snapshot"
        else:
            morph_mode = "off"
        return {
            "mode": morph_mode,
            "position": self._safe_float(routing.get("morph_position"), 0.5),
            "source_channel_key": self._optional_string(routing.get("morph_source_channel_key")),
            "target_channel_key": self._optional_string(routing.get("morph_target_channel_key")),
        }

    @staticmethod
    def _optional_string(value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _routing_mode_from_graph_morph(mode: str) -> str | None:
        normalized = str(mode or "").strip().lower()
        if normalized in {"snapshot", "intra_snapshot", "cross_snapshot"}:
            return "morph"
        if normalized == "off":
            return None
        return None
