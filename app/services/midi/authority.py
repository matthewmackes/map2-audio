"""MidiBindingAuthority — the single writer for the canonical MidiBinding table.

Every consumer migration in T2482-P2.3+ writes through this service.
No direct table access; no parallel writers.

See `docs/architecture/MIDI_SERVICES.md` for the four-services discipline
that mandates this single-writer pattern.

Created in T2482-P2.2 (MIDI Services Phase 2). Read-side queries are
also routed through here so we can add caching / projection-shape
adapters in one place later.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.midi.models import MidiBinding
from app.services.midi.schemas import (
    BindingConsumerType,
    BindingScope,
    MidiBindingCreate,
    MidiBindingRead,
    MidiBindingUpdate,
)

logger = logging.getLogger(__name__)


class MidiBindingNotFound(Exception):
    """Raised when a binding_id is not present in the table."""


class MidiBindingAuthority:
    """Async service. One instance per request session.

    Construction takes the AsyncSession; every method is awaited; the
    caller owns the session lifecycle (commits, rollbacks, close).

    Usage from a route or a projection adapter:

        async with get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(payload)
            await session.commit()
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ---------- create ----------

    async def create(self, payload: MidiBindingCreate) -> MidiBindingRead:
        """Insert a new binding. Authority assigns binding_id + timestamps."""
        binding_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        row = MidiBinding(
            binding_id=binding_id,
            consumer_type=payload.consumer_type,
            consumer_id=payload.consumer_id,
            consumer_label=payload.consumer_label,
            source_type=payload.source_type,
            source_descriptor=dict(payload.source_descriptor),
            target_type=payload.target_type,
            target_descriptor=dict(payload.target_descriptor),
            device_id=payload.device_id,
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
        payloads: Iterable[MidiBindingCreate],
    ) -> list[MidiBindingRead]:
        """Bulk insert. Useful for the Phase 2 migration scripts."""
        results: list[MidiBindingRead] = []
        for p in payloads:
            results.append(await self.create(p))
        return results

    # ---------- read ----------

    async def get(self, binding_id: str) -> MidiBindingRead:
        row = await self._session.scalar(
            select(MidiBinding).where(MidiBinding.binding_id == binding_id)
        )
        if row is None:
            raise MidiBindingNotFound(binding_id)
        return self._row_to_read(row)

    async def list_for_consumer(
        self,
        consumer_type: BindingConsumerType,
        consumer_id: str,
        *,
        enabled_only: bool = False,
    ) -> list[MidiBindingRead]:
        """All bindings owned by a single consumer (e.g., a snapshot)."""
        stmt = select(MidiBinding).where(
            MidiBinding.consumer_type == consumer_type,
            MidiBinding.consumer_id == consumer_id,
        )
        if enabled_only:
            stmt = stmt.where(MidiBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_for_device(
        self,
        device_id: str,
        *,
        enabled_only: bool = True,
    ) -> list[MidiBindingRead]:
        """All bindings driven by a single device."""
        stmt = select(MidiBinding).where(MidiBinding.device_id == device_id)
        if enabled_only:
            stmt = stmt.where(MidiBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def list_in_scope(
        self,
        scope: BindingScope,
        scope_id: Optional[str],
        *,
        enabled_only: bool = True,
    ) -> list[MidiBindingRead]:
        """All bindings active in a given scope (snapshot, node, or global)."""
        if scope == "global":
            stmt = select(MidiBinding).where(MidiBinding.scope == "global")
        else:
            stmt = select(MidiBinding).where(
                and_(MidiBinding.scope == scope, MidiBinding.scope_id == scope_id)
            )
        if enabled_only:
            stmt = stmt.where(MidiBinding.enabled.is_(True))
        result = await self._session.execute(stmt)
        return [self._row_to_read(r) for r in result.scalars().all()]

    async def count(self) -> int:
        """Total binding count — useful for migration progress reporting."""
        result = await self._session.scalar(select(MidiBinding.binding_id))
        if result is None:
            return 0
        # Use a proper count query for correctness with large tables.
        from sqlalchemy import func

        n = await self._session.scalar(select(func.count(MidiBinding.binding_id)))
        return int(n or 0)

    # ---------- update ----------

    async def update(
        self,
        binding_id: str,
        patch: MidiBindingUpdate,
    ) -> MidiBindingRead:
        row = await self._session.scalar(
            select(MidiBinding).where(MidiBinding.binding_id == binding_id)
        )
        if row is None:
            raise MidiBindingNotFound(binding_id)

        # Apply only fields that were explicitly provided (Pydantic v2:
        # model_dump(exclude_unset=True) returns only the user-set fields).
        changes = patch.model_dump(exclude_unset=True)
        modified_by = changes.pop("modified_by", "unknown")
        for field_name, value in changes.items():
            if field_name == "metadata":
                # Map the public "metadata" field name to the
                # private metadata_json attribute (the column name
                # in SQL is "metadata"; the Python attribute had to
                # be renamed to avoid SQLAlchemy's reserved name).
                row.metadata_json = dict(value) if value is not None else {}
            else:
                setattr(row, field_name, value)
        row.modified_by = modified_by
        # modified_at is updated by the column's onupdate=_utcnow.
        await self._session.flush()
        return self._row_to_read(row)

    async def disable(self, binding_id: str, *, modified_by: str = "unknown") -> MidiBindingRead:
        return await self.update(binding_id, MidiBindingUpdate(enabled=False, modified_by=modified_by))

    async def enable(self, binding_id: str, *, modified_by: str = "unknown") -> MidiBindingRead:
        return await self.update(binding_id, MidiBindingUpdate(enabled=True, modified_by=modified_by))

    # ---------- delete ----------

    async def delete(self, binding_id: str) -> bool:
        """Hard-delete a binding. Returns True when deletion happened,
        False when the binding wasn't there. Most callers should prefer
        disable() over delete() — disabling preserves audit trail."""
        result = await self._session.execute(
            delete(MidiBinding).where(MidiBinding.binding_id == binding_id)
        )
        return bool(result.rowcount)

    async def delete_for_consumer(
        self,
        consumer_type: BindingConsumerType,
        consumer_id: str,
    ) -> int:
        """Hard-delete every binding owned by a consumer. Returns the
        number of rows deleted. Used when a snapshot is permanently
        removed, a brain slot is reset, etc."""
        result = await self._session.execute(
            delete(MidiBinding).where(
                MidiBinding.consumer_type == consumer_type,
                MidiBinding.consumer_id == consumer_id,
            )
        )
        return int(result.rowcount or 0)

    # ---------- internal ----------

    @staticmethod
    def _row_to_read(row: MidiBinding) -> MidiBindingRead:
        return MidiBindingRead(
            binding_id=row.binding_id,
            consumer_type=row.consumer_type,
            consumer_id=row.consumer_id,
            consumer_label=row.consumer_label,
            source_type=row.source_type,
            source_descriptor=dict(row.source_descriptor or {}),
            target_type=row.target_type,
            target_descriptor=dict(row.target_descriptor or {}),
            device_id=row.device_id,
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
