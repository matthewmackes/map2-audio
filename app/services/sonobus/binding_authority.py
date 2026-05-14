"""SonoBusBindingAuthority — the single writer for the canonical
`SonoBusBinding` table.

T2521-3. Mirrors `app/services/avb/binding_authority.py` semantics.
Every operator-visible SonoBus/AOO binding read/write goes through this
service.

See `docs/architecture/SONOBUS_AOO_TRANSPORT.md` for the four-services
discipline that mandates the single-writer pattern, and the locked
Q1-Q21 decisions in PROJECT_WORKLIST §T2521.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.sonobus.binding_models import SonoBusBinding
from app.services.sonobus.binding_schemas import (
    SonoBusBindingConsumerType,
    SonoBusBindingCreate,
    SonoBusBindingKind,
    SonoBusBindingRead,
    SonoBusBindingScope,
    SonoBusBindingUpdate,
)

logger = logging.getLogger(__name__)


class SonoBusBindingNotFound(Exception):
    """Raised when a binding_id is not present in the table."""


class SonoBusBindingAuthority:
    """Async service. One instance per request session.

    Construction takes the AsyncSession; every method is awaited; the
    caller owns the session lifecycle (commits, rollbacks, close).

    Usage from a route:

        async with get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(payload)
            await session.commit()
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---------- create ----------

    async def create(self, payload: SonoBusBindingCreate) -> SonoBusBindingRead:
        """Insert a new binding. Authority assigns binding_id + timestamps."""
        binding_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        row = SonoBusBinding(
            binding_id=binding_id,
            consumer_type=payload.consumer_type,
            consumer_id=payload.consumer_id,
            consumer_label=payload.consumer_label,
            binding_kind=payload.binding_kind,
            source_type=payload.source_type,
            source_descriptor=dict(payload.source_descriptor),
            target_type=payload.target_type,
            target_descriptor=dict(payload.target_descriptor),
            stream_format=payload.stream_format,
            codec_profile=payload.codec_profile,
            jitter_buffer_ms=payload.jitter_buffer_ms,
            resend_policy=payload.resend_policy,
            latency_target_ms=payload.latency_target_ms,
            channel_count=payload.channel_count,
            group_id=payload.group_id,
            session_label=payload.session_label,
            transport_protocol=payload.transport_protocol,
            bind_interface=payload.bind_interface,
            bind_port_local=payload.bind_port_local,
            server_endpoint=payload.server_endpoint,
            talker_node_id=payload.talker_node_id,
            listener_node_id=payload.listener_node_id,
            listener_capability=payload.listener_capability,
            cluster_role=payload.cluster_role,
            transport_priority=payload.transport_priority,
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
        payloads: Iterable[SonoBusBindingCreate],
    ) -> list[SonoBusBindingRead]:
        """Bulk insert. Useful for projection-adapter migrations."""
        results: list[SonoBusBindingRead] = []
        for p in payloads:
            results.append(await self.create(p))
        return results

    # ---------- read ----------

    async def get(self, binding_id: str) -> SonoBusBindingRead:
        row = await self._session.scalar(
            select(SonoBusBinding).where(SonoBusBinding.binding_id == binding_id)
        )
        if row is None:
            raise SonoBusBindingNotFound(binding_id)
        return self._row_to_read(row)

    async def list_for_consumer(
        self,
        consumer_type: SonoBusBindingConsumerType,
        consumer_id: str,
        *,
        enabled_only: bool = False,
    ) -> list[SonoBusBindingRead]:
        """All bindings owned by a single consumer."""
        stmt = select(SonoBusBinding).where(
            SonoBusBinding.consumer_type == consumer_type,
            SonoBusBinding.consumer_id == consumer_id,
        )
        if enabled_only:
            stmt = stmt.where(SonoBusBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_by_kind(
        self,
        binding_kind: SonoBusBindingKind,
        *,
        enabled_only: bool = True,
    ) -> list[SonoBusBindingRead]:
        """All bindings of a given kind (peer / group / stream / client_session)."""
        stmt = select(SonoBusBinding).where(SonoBusBinding.binding_kind == binding_kind)
        if enabled_only:
            stmt = stmt.where(SonoBusBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_for_group(
        self,
        group_id: str,
        *,
        enabled_only: bool = True,
    ) -> list[SonoBusBindingRead]:
        """All bindings within a SonoBus channel-group / session."""
        stmt = select(SonoBusBinding).where(SonoBusBinding.group_id == group_id)
        if enabled_only:
            stmt = stmt.where(SonoBusBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_for_cluster_pair(
        self,
        talker_node_id: Optional[str],
        listener_node_id: Optional[str],
        *,
        enabled_only: bool = True,
    ) -> list[SonoBusBindingRead]:
        """All bindings between a talker node and listener node.

        Mirrors the AVB cluster-matrix endpoint (T2490-7). Either node
        can be None to match any peer (e.g., 'all bindings into
        <listener>'). Drives `/api/sonobus/cluster/bindings/matrix`
        (T2521-5)."""
        clauses = []
        if talker_node_id is not None:
            clauses.append(SonoBusBinding.talker_node_id == talker_node_id)
        if listener_node_id is not None:
            clauses.append(SonoBusBinding.listener_node_id == listener_node_id)
        stmt = select(SonoBusBinding)
        if clauses:
            stmt = stmt.where(and_(*clauses))
        if enabled_only:
            stmt = stmt.where(SonoBusBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_in_scope(
        self,
        scope: SonoBusBindingScope,
        scope_id: Optional[str],
        *,
        enabled_only: bool = True,
    ) -> list[SonoBusBindingRead]:
        """All bindings active in a given scope."""
        if scope == "global":
            stmt = select(SonoBusBinding).where(SonoBusBinding.scope == "global")
        else:
            stmt = select(SonoBusBinding).where(
                and_(SonoBusBinding.scope == scope, SonoBusBinding.scope_id == scope_id)
            )
        if enabled_only:
            stmt = stmt.where(SonoBusBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def count(self) -> int:
        n = await self._session.scalar(select(func.count(SonoBusBinding.binding_id)))
        return int(n or 0)

    # ---------- update ----------

    async def update(
        self,
        binding_id: str,
        patch: SonoBusBindingUpdate,
    ) -> SonoBusBindingRead:
        row = await self._session.scalar(
            select(SonoBusBinding).where(SonoBusBinding.binding_id == binding_id)
        )
        if row is None:
            raise SonoBusBindingNotFound(binding_id)

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

    async def disable(
        self, binding_id: str, *, modified_by: str = "unknown"
    ) -> SonoBusBindingRead:
        return await self.update(
            binding_id, SonoBusBindingUpdate(enabled=False, modified_by=modified_by)
        )

    async def enable(
        self, binding_id: str, *, modified_by: str = "unknown"
    ) -> SonoBusBindingRead:
        return await self.update(
            binding_id, SonoBusBindingUpdate(enabled=True, modified_by=modified_by)
        )

    # ---------- delete ----------

    async def delete(self, binding_id: str) -> bool:
        result = await self._session.execute(
            delete(SonoBusBinding).where(SonoBusBinding.binding_id == binding_id)
        )
        return bool(result.rowcount)

    async def delete_for_consumer(
        self,
        consumer_type: SonoBusBindingConsumerType,
        consumer_id: str,
    ) -> int:
        result = await self._session.execute(
            delete(SonoBusBinding).where(
                SonoBusBinding.consumer_type == consumer_type,
                SonoBusBinding.consumer_id == consumer_id,
            )
        )
        return int(result.rowcount or 0)

    # ---------- internal ----------

    @staticmethod
    def _row_to_read(row: SonoBusBinding) -> SonoBusBindingRead:
        return SonoBusBindingRead(
            binding_id=row.binding_id,
            consumer_type=row.consumer_type,
            consumer_id=row.consumer_id,
            consumer_label=row.consumer_label,
            binding_kind=row.binding_kind,
            source_type=row.source_type,
            source_descriptor=dict(row.source_descriptor or {}),
            target_type=row.target_type,
            target_descriptor=dict(row.target_descriptor or {}),
            stream_format=row.stream_format,
            codec_profile=row.codec_profile,
            jitter_buffer_ms=row.jitter_buffer_ms,
            resend_policy=row.resend_policy,
            latency_target_ms=row.latency_target_ms,
            channel_count=row.channel_count,
            group_id=row.group_id,
            session_label=row.session_label,
            transport_protocol=row.transport_protocol,
            bind_interface=row.bind_interface,
            bind_port_local=row.bind_port_local,
            server_endpoint=row.server_endpoint,
            talker_node_id=row.talker_node_id,
            listener_node_id=row.listener_node_id,
            listener_capability=row.listener_capability,
            cluster_role=row.cluster_role,
            transport_priority=row.transport_priority,
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
