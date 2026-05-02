"""Consolidated `/api/midi/*` routes for the MIDI Services canonical authority.

T2482-P3.1 prep (iter 18) — backend route scaffold. The `/midi`
canonical surface (Phase 3) consumes these endpoints exclusively.
Per the four-services discipline, every binding read/write goes
through MidiBindingAuthority via this single route file.

This file is **not yet wired** into app/main.py — that's iter 19's
deliverable, so the routes exist on disk for testing but aren't
exposed publicly until P3.1 ships proper. Tests use APIRouter
introspection to verify the route shape without needing a live mount.

T2483 loop 17 / iter 162 — added GET /bindings/matrix for the
T2483-8 server-side aggregation. Replaces the iter-117 client-side
fan-out (10 queries / 5s poll → 1 query / 5s poll).
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select

from app.database import get_session
from app.services.midi.authority import MidiBindingAuthority, MidiBindingNotFound
from app.services.midi.models import MidiBinding
from app.services.midi.schemas import (
    BindingConsumerType,
    BindingScope,
    MidiBindingCreate,
    MidiBindingRead,
    MidiBindingUpdate,
)


class MatrixCell(BaseModel):
    """T2483-8 iter 162 — one cell of the source × consumer routing matrix."""

    count: int
    enabled_count: int


class BindingsMatrixResponse(BaseModel):
    """T2483-8 iter 162 — full source × consumer aggregation.

    Shape: matrix[source_type][consumer_type] = MatrixCell.
    Frontend `useRoutingMatrix` (iter 164) consumes this directly.
    """

    matrix: dict[str, dict[str, MatrixCell]]
    total_bindings: int


router = APIRouter(prefix="/api/midi", tags=["MIDI Services"])


# Note on the session pattern: the platform's get_session is an async
# context manager (see app/routes/unified_snapshots.py for precedent),
# not an async-generator FastAPI dependency. We use `async with
# get_session() as session:` inline in each handler rather than
# Depends(get_session) so we get the session lifecycle right (commit
# on exit, rollback on exception).


# IMPORTANT: route ordering matters in FastAPI. /bindings/count MUST
# come before /bindings/{binding_id} so a literal "count" doesn't
# accidentally match the parameterized binding_id slot.


# ---------- Read ----------


@router.get("/bindings/count", response_model=int)
async def count_bindings() -> int:
    async with get_session(read_only=True) as session:
        authority = MidiBindingAuthority(session)
        return await authority.count()


@router.get("/bindings/matrix", response_model=BindingsMatrixResponse)
async def get_bindings_matrix() -> BindingsMatrixResponse:
    """T2483-8 iter 162 — server-side source_type × consumer_type
    aggregation for the iter-118 routing matrix UI.

    Replaces the iter-117 client-side fan-out (which issued one query
    per BindingConsumerType every 5s poll, 10 queries total). One
    SQL aggregation here returns the same shape.
    """
    async with get_session(read_only=True) as session:
        rows = await session.execute(
            select(
                MidiBinding.source_type,
                MidiBinding.consumer_type,
                func.count(MidiBinding.binding_id).label("count"),
                func.sum(cast(MidiBinding.enabled, Integer)).label("enabled_count"),
            ).group_by(MidiBinding.source_type, MidiBinding.consumer_type)
        )
        matrix: dict[str, dict[str, MatrixCell]] = {}
        total = 0
        for source_type, consumer_type, count, enabled_count in rows.all():
            row = matrix.setdefault(str(source_type), {})
            cell_count = int(count or 0)
            cell_enabled = int(enabled_count or 0)
            row[str(consumer_type)] = MatrixCell(
                count=cell_count, enabled_count=cell_enabled
            )
            total += cell_count
        return BindingsMatrixResponse(matrix=matrix, total_bindings=total)


@router.get("/legacy-table-rowcounts")
async def legacy_table_rowcounts() -> dict[str, int]:
    """T2482-P2.8 readiness gate: report the row counts of every
    legacy MIDI table that is slated for deletion. P2.8 part 2
    requires every count here to be EITHER zero OR fully covered
    by canonical bindings via `metadata.legacy_table` provenance
    matching.

    Used by future operator tooling + the P2.8 part 2 verification
    script to confirm it's safe to DROP the listed tables.
    """
    from sqlalchemy import text

    async with get_session(read_only=True) as session:
        result: dict[str, int] = {}
        for table_name in ("midi_mappings", "snapshot_midi_maps"):
            try:
                row = await session.execute(
                    text(f"SELECT COUNT(*) FROM {table_name}")
                )
                count = row.scalar()
                result[table_name] = int(count or 0)
            except Exception:
                # Table might already be dropped — report -1 so the
                # caller can distinguish "not present" from "empty".
                result[table_name] = -1
        return result


@router.get("/bindings", response_model=list[MidiBindingRead])
async def list_bindings(
    consumer_type: Optional[BindingConsumerType] = Query(default=None),
    consumer_id: Optional[str] = Query(default=None),
    device_id: Optional[str] = Query(default=None),
    scope: Optional[BindingScope] = Query(default=None),
    scope_id: Optional[str] = Query(default=None),
    enabled_only: bool = Query(default=False),
) -> list[MidiBindingRead]:
    """List bindings, with optional filters. Filter precedence:
    consumer (consumer_type+consumer_id) > device > scope.
    """
    async with get_session(read_only=True) as session:
        authority = MidiBindingAuthority(session)
        if consumer_type is not None and consumer_id is not None:
            return await authority.list_for_consumer(
                consumer_type, consumer_id, enabled_only=enabled_only
            )
        if device_id is not None:
            return await authority.list_for_device(device_id, enabled_only=enabled_only)
        if scope is not None:
            return await authority.list_in_scope(scope, scope_id, enabled_only=enabled_only)
        raise HTTPException(
            status_code=400,
            detail="must filter by consumer_type+consumer_id, device_id, or scope",
        )


@router.get("/bindings/{binding_id}", response_model=MidiBindingRead)
async def get_binding(binding_id: str) -> MidiBindingRead:
    async with get_session(read_only=True) as session:
        authority = MidiBindingAuthority(session)
        try:
            return await authority.get(binding_id)
        except MidiBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


# ---------- Write ----------


@router.post("/bindings", response_model=MidiBindingRead, status_code=201)
async def create_binding(payload: MidiBindingCreate) -> MidiBindingRead:
    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        return await authority.create(payload)


@router.patch("/bindings/{binding_id}", response_model=MidiBindingRead)
async def update_binding(binding_id: str, patch: MidiBindingUpdate) -> MidiBindingRead:
    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        try:
            return await authority.update(binding_id, patch)
        except MidiBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.delete("/bindings/{binding_id}", status_code=204)
async def delete_binding(binding_id: str) -> None:
    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        deleted = await authority.delete(binding_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/disable", response_model=MidiBindingRead)
async def disable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> MidiBindingRead:
    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        try:
            return await authority.disable(binding_id, modified_by=modified_by)
        except MidiBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/enable", response_model=MidiBindingRead)
async def enable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> MidiBindingRead:
    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        try:
            return await authority.enable(binding_id, modified_by=modified_by)
        except MidiBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


__all__ = ["router"]
