"""AvbBindingAuthority — the single writer for the canonical AvbBinding table.

T2490-2. Mirrors `app/services/midi/authority.py` semantics. Every
operator-visible AVB binding read/write goes through this service.
T2490-3 will refactor `avb_router.py` to consume this authority instead
of maintaining a separate routing-matrix store.

See `docs/architecture/AVB_SERVICES.md` for the four-services discipline
that mandates the single-writer pattern.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.avb.binding_models import AvbBinding
from app.services.avb.binding_schemas import (
    AvbBindingConsumerType,
    AvbBindingCreate,
    AvbBindingRead,
    AvbBindingScope,
    AvbBindingUpdate,
)

logger = logging.getLogger(__name__)


class AvbBindingNotFound(Exception):
    """Raised when a binding_id is not present in the table."""


class AvbBindingAuthority:
    """Async service. One instance per request session.

    Construction takes the AsyncSession; every method is awaited; the
    caller owns the session lifecycle (commits, rollbacks, close).

    Usage from a route:

        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(payload)
            await session.commit()
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---------- create ----------

    async def create(self, payload: AvbBindingCreate) -> AvbBindingRead:
        """Insert a new binding. Authority assigns binding_id + timestamps."""
        binding_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        row = AvbBinding(
            binding_id=binding_id,
            consumer_type=payload.consumer_type,
            consumer_id=payload.consumer_id,
            consumer_label=payload.consumer_label,
            source_type=payload.source_type,
            source_descriptor=dict(payload.source_descriptor),
            target_type=payload.target_type,
            target_descriptor=dict(payload.target_descriptor),
            stream_id=payload.stream_id,
            stream_format=payload.stream_format,
            srp_class=payload.srp_class,
            talker_node_id=payload.talker_node_id,
            listener_node_id=payload.listener_node_id,
            scope=payload.scope,
            scope_id=payload.scope_id,
            enabled=payload.enabled,
            created_at=now,
            created_by=payload.created_by,
            modified_at=now,
            modified_by=payload.created_by,
            source=payload.source,
            metadata_json=dict(payload.metadata),
        )
        self._session.add(row)
        await self._session.flush()
        return self._row_to_read(row)

    async def create_many(
        self,
        payloads: Iterable[AvbBindingCreate],
    ) -> list[AvbBindingRead]:
        """Bulk insert. Useful for projection-adapter migrations."""
        results: list[AvbBindingRead] = []
        for p in payloads:
            results.append(await self.create(p))
        return results

    # ---------- read ----------

    async def get(self, binding_id: str) -> AvbBindingRead:
        row = await self._session.scalar(
            select(AvbBinding).where(AvbBinding.binding_id == binding_id)
        )
        if row is None:
            raise AvbBindingNotFound(binding_id)
        return self._row_to_read(row)

    async def list_for_consumer(
        self,
        consumer_type: AvbBindingConsumerType,
        consumer_id: str,
        *,
        enabled_only: bool = False,
    ) -> list[AvbBindingRead]:
        """All bindings owned by a single consumer."""
        stmt = select(AvbBinding).where(
            AvbBinding.consumer_type == consumer_type,
            AvbBinding.consumer_id == consumer_id,
        )
        if enabled_only:
            stmt = stmt.where(AvbBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_for_stream(
        self,
        stream_id: str,
        *,
        enabled_only: bool = True,
    ) -> list[AvbBindingRead]:
        """All bindings carrying a given AVTP stream id."""
        stmt = select(AvbBinding).where(AvbBinding.stream_id == stream_id)
        if enabled_only:
            stmt = stmt.where(AvbBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_for_cluster_pair(
        self,
        talker_node_id: Optional[str],
        listener_node_id: Optional[str],
        *,
        enabled_only: bool = True,
    ) -> list[AvbBindingRead]:
        """All bindings between a talker node and listener node.

        T2490-7 cluster-matrix endpoint queries this. Either node can be
        None to match any peer (e.g., 'all bindings into <listener>')."""
        clauses = []
        if talker_node_id is not None:
            clauses.append(AvbBinding.talker_node_id == talker_node_id)
        if listener_node_id is not None:
            clauses.append(AvbBinding.listener_node_id == listener_node_id)
        stmt = select(AvbBinding)
        if clauses:
            stmt = stmt.where(and_(*clauses))
        if enabled_only:
            stmt = stmt.where(AvbBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_in_scope(
        self,
        scope: AvbBindingScope,
        scope_id: Optional[str],
        *,
        enabled_only: bool = True,
    ) -> list[AvbBindingRead]:
        """All bindings active in a given scope."""
        if scope == "global":
            stmt = select(AvbBinding).where(AvbBinding.scope == "global")
        else:
            stmt = select(AvbBinding).where(
                and_(AvbBinding.scope == scope, AvbBinding.scope_id == scope_id)
            )
        if enabled_only:
            stmt = stmt.where(AvbBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def count(self) -> int:
        n = await self._session.scalar(select(func.count(AvbBinding.binding_id)))
        return int(n or 0)

    # ---------- update ----------

    async def update(
        self,
        binding_id: str,
        patch: AvbBindingUpdate,
    ) -> AvbBindingRead:
        row = await self._session.scalar(
            select(AvbBinding).where(AvbBinding.binding_id == binding_id)
        )
        if row is None:
            raise AvbBindingNotFound(binding_id)

        changes = patch.model_dump(exclude_unset=True)
        modified_by = changes.pop("modified_by", "unknown")
        for field_name, value in changes.items():
            if field_name == "metadata":
                row.metadata_json = dict(value) if value is not None else {}
            else:
                setattr(row, field_name, value)
        row.modified_by = modified_by
        await self._session.flush()
        return self._row_to_read(row)

    async def disable(self, binding_id: str, *, modified_by: str = "unknown") -> AvbBindingRead:
        return await self.update(binding_id, AvbBindingUpdate(enabled=False, modified_by=modified_by))

    async def enable(self, binding_id: str, *, modified_by: str = "unknown") -> AvbBindingRead:
        return await self.update(binding_id, AvbBindingUpdate(enabled=True, modified_by=modified_by))

    # ---------- delete ----------

    async def delete(self, binding_id: str) -> bool:
        result = await self._session.execute(
            delete(AvbBinding).where(AvbBinding.binding_id == binding_id)
        )
        return bool(result.rowcount)

    async def delete_for_consumer(
        self,
        consumer_type: AvbBindingConsumerType,
        consumer_id: str,
    ) -> int:
        result = await self._session.execute(
            delete(AvbBinding).where(
                AvbBinding.consumer_type == consumer_type,
                AvbBinding.consumer_id == consumer_id,
            )
        )
        return int(result.rowcount or 0)

    # ---------- internal ----------

    @staticmethod
    def _row_to_read(row: AvbBinding) -> AvbBindingRead:
        return AvbBindingRead(
            binding_id=row.binding_id,
            consumer_type=row.consumer_type,
            consumer_id=row.consumer_id,
            consumer_label=row.consumer_label,
            source_type=row.source_type,
            source_descriptor=dict(row.source_descriptor or {}),
            target_type=row.target_type,
            target_descriptor=dict(row.target_descriptor or {}),
            stream_id=row.stream_id,
            stream_format=row.stream_format,
            srp_class=row.srp_class,
            talker_node_id=row.talker_node_id,
            listener_node_id=row.listener_node_id,
            scope=row.scope,
            scope_id=row.scope_id,
            enabled=bool(row.enabled),
            created_at=row.created_at,
            created_by=row.created_by,
            modified_at=row.modified_at,
            modified_by=row.modified_by,
            source=row.source,
            metadata=dict(row.metadata_json or {}),
        )
