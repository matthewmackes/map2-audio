"""
State Authority snapshot revision service.

Owns revision list/save/restore behavior so snapshot CRUD can delegate revision
responsibility directly instead of keeping it embedded in the monolith.
"""

from __future__ import annotations

import copy
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Snapshot, SnapshotRevision
from app.services.state_authority_document_service import StateAuthorityDocumentService
from app.services.state_authority_graph import SNAPSHOT_GRAPH_VERSION


GetSnapshotModel = Callable[[int], Awaitable[Snapshot | None]]
UpdateSnapshot = Callable[..., Awaitable[dict[str, Any] | None]]


class StateAuthorityRevisionService:
    """Owns snapshot revision persistence and restoration."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        document_service: StateAuthorityDocumentService,
        get_snapshot_model: GetSnapshotModel,
        update_snapshot: UpdateSnapshot,
        normalize_detail_payload: Callable[[dict[str, Any]], dict[str, Any]],
        safe_float: Callable[[Any, float], float],
        default_snapshot_tempo_bpm: float,
        utcnow: Callable[[], Any],
        max_snapshot_revisions: int,
        unset: object,
    ) -> None:
        self.session = session
        self.document_service = document_service
        self._get_snapshot_model = get_snapshot_model
        self._update_snapshot = update_snapshot
        self._normalize_detail_payload = normalize_detail_payload
        self._safe_float = safe_float
        self._default_snapshot_tempo_bpm = default_snapshot_tempo_bpm
        self._utcnow = utcnow
        self._max_snapshot_revisions = max_snapshot_revisions
        self._unset = unset

    async def list_revisions(self, snapshot_id: int) -> list[dict[str, Any]] | None:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            return None

        result = await self.session.execute(
            select(SnapshotRevision)
            .where(SnapshotRevision.snapshot_id == snapshot_id)
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
        )
        revisions = result.scalars().all()
        return [self.serialize_revision(revision) for revision in revisions]

    async def restore_revision(
        self,
        snapshot_id: int,
        revision_number: int,
    ) -> dict[str, Any] | None:
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

        if isinstance(revision.document, dict) and revision.document.get("version") == SNAPSHOT_GRAPH_VERSION:
            payload = await self.document_service.document_to_normalized(revision.document)
        else:
            payload = dict(revision.payload or {})

        return await self._update_snapshot(
            snapshot_id,
            tempo_bpm=payload["tempo_bpm"] if "tempo_bpm" in payload else self._unset,
            output_level_reference_dbfs=(
                payload["output_level_reference_dbfs"]
                if "output_level_reference_dbfs" in payload
                else self._unset
            ),
            output_level_warning_threshold_db=(
                payload["output_level_warning_threshold_db"]
                if "output_level_warning_threshold_db" in payload
                else self._unset
            ),
            input_device=payload["input_device"] if "input_device" in payload else self._unset,
            output_device=payload["output_device"] if "output_device" in payload else self._unset,
            detail_payload={
                "controls": copy.deepcopy(payload.get("controls") or {}),
                "channels": copy.deepcopy(payload.get("channels") or []),
                "chains": copy.deepcopy(payload.get("chains") or []),
                "routing": copy.deepcopy(payload.get("routing") or {}),
                "midi_map": copy.deepcopy(payload.get("midi_map") or []),
                "extensions": copy.deepcopy(payload.get("extensions") or {}),
            },
            create_revision=True,
        )

    async def append_revision(self, snapshot_id: int, detail: dict[str, Any]) -> dict[str, Any]:
        snapshot = await self._get_snapshot_model(snapshot_id)
        if snapshot is None:
            raise ValueError(f"Snapshot {snapshot_id} not found")

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
            summary=self.build_revision_summary(detail),
            payload=self.build_revision_payload(detail),
            document=self.document_service.build_validated_document(
                snapshot,
                self._normalize_detail_payload(detail),
            ),
            saved_at=self._utcnow(),
        )
        self.session.add(revision)
        await self.document_service.sync_asset_registry(revision.document)
        await self.session.flush()
        await self.prune_revisions(snapshot_id)
        return self.serialize_revision(revision)

    async def prune_revisions(self, snapshot_id: int) -> None:
        result = await self.session.execute(
            select(SnapshotRevision)
            .where(SnapshotRevision.snapshot_id == snapshot_id)
            .order_by(SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc())
        )
        revisions = result.scalars().all()
        for revision in revisions[self._max_snapshot_revisions :]:
            await self.session.delete(revision)
        if len(revisions) > self._max_snapshot_revisions:
            await self.session.flush()

    def build_revision_payload(self, detail: dict[str, Any]) -> dict[str, Any]:
        return {
            "tempo_bpm": self._safe_float(detail.get("tempo_bpm"), self._default_snapshot_tempo_bpm),
            "output_level_reference_dbfs": detail.get("output_level_reference_dbfs"),
            "output_level_warning_threshold_db": detail.get("output_level_warning_threshold_db"),
            "input_device": detail.get("input_device"),
            "output_device": detail.get("output_device"),
            "controls": copy.deepcopy(detail.get("controls") or {}),
            "channels": copy.deepcopy(detail.get("channels") or []),
            "chains": copy.deepcopy(detail.get("chains") or []),
            "routing": copy.deepcopy(detail.get("routing") or {}),
            "midi_map": copy.deepcopy(detail.get("midi_map") or []),
            "extensions": copy.deepcopy(detail.get("extensions") or {}),
        }

    def build_revision_summary(self, detail: dict[str, Any]) -> str:
        block_count = self.count_snapshot_blocks(detail)
        channel_count = len([item for item in detail.get("channels", []) if isinstance(item, dict)])
        routing_mode = str((detail.get("routing") or {}).get("mode") or "parallel_blend").replace("_", " ")
        block_label = "block" if block_count == 1 else "blocks"
        channel_label = "channel" if channel_count == 1 else "channels"
        return f"{block_count} {block_label}, {channel_count} {channel_label}, {routing_mode} routing"

    @staticmethod
    def count_snapshot_blocks(detail: dict[str, Any]) -> int:
        chains = [item for item in detail.get("chains", []) if isinstance(item, dict)]
        block_count = sum(
            len([plugin for plugin in chain.get("plugins", []) if isinstance(plugin, dict)])
            for chain in chains
        )
        if block_count > 0:
            return block_count
        paths = [item for item in detail.get("paths", []) if isinstance(item, dict)]
        return sum(
            len([plugin for plugin in path.get("plugins", []) if isinstance(plugin, dict)])
            for path in paths
        )

    @staticmethod
    def serialize_revision(revision: SnapshotRevision) -> dict[str, Any]:
        return {
            "id": revision.id,
            "snapshot_id": revision.snapshot_id,
            "revision_number": int(revision.revision_number),
            "snapshot_revision": revision.snapshot_revision,
            "summary": revision.summary,
            "saved_at": revision.saved_at.isoformat() if revision.saved_at else None,
        }
