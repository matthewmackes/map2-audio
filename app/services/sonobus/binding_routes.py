"""Consolidated `/api/sonobus/*` routes for the SonoBus/AOO transport
authority.

T2521-5. Mirrors `app/services/avb/binding_routes.py` shape-for-shape so
the operator-tooling consumers can treat AVB and SonoBus binding
surfaces interchangeably. Cluster-matrix fan-out and WebSocket events
are deferred to a later T2521-5 slice (kept here as a placeholder note).

The router is mounted in `app/main.py` near the AVB Services mount.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select

from app.database import get_session
from app.services.sonobus.binding_authority import (
    SonoBusBindingAuthority,
    SonoBusBindingNotFound,
)
from app.services.sonobus.binding_models import SonoBusBinding
from app.services.sonobus.binding_schemas import (
    SonoBusBindingConsumerType,
    SonoBusBindingCreate,
    SonoBusBindingKind,
    SonoBusBindingRead,
    SonoBusBindingScope,
    SonoBusBindingUpdate,
)


router = APIRouter(prefix="/api/sonobus", tags=["SonoBus"])


class SonoBusMatrixCell(BaseModel):
    """One cell of the binding-kind × consumer-type aggregation."""

    count: int
    enabled_count: int


class SonoBusBindingsMatrixResponse(BaseModel):
    """Server-side aggregation of every SonoBusBinding plus the rows
    themselves so the frontend can populate the Connections DataTable
    in a single round-trip. Mirrors `AvbBindingsMatrixResponse`."""

    matrix: dict[str, dict[str, SonoBusMatrixCell]]
    total_bindings: int
    bindings: list[SonoBusBindingRead]


class SonoBusStatusResponse(BaseModel):
    """High-level health summary the /sonobus Overview page uses.

    The daemon/runtime side ships in T2521-4; until then the daemon
    fields stay at their stub defaults. The authority/database side is
    real from this slice on.
    """

    authority_ok: bool
    table_present: bool
    binding_count: int
    enabled_binding_count: int

    # Daemon-side fields populated by T2521-4 + later slices.
    daemon_running: bool = False
    daemon_endpoint: Optional[str] = None
    connection_server_enabled: bool = True  # Q3 default
    connection_server_running: bool = False

    # Transport-priority indicator surfaced on the Overview page.
    default_transport_priority: str = "avb_preferred"  # Q18 default


# IMPORTANT: route ordering matters in FastAPI. /bindings/count and
# /bindings/matrix MUST come before /bindings/{binding_id} so the
# literal segments don't accidentally match the parameterized slot.


@router.get("/status", response_model=SonoBusStatusResponse)
async def get_status() -> SonoBusStatusResponse:
    """High-level SonoBus status — drives the /sonobus Overview tile.

    Daemon-side fields are placeholders until T2521-4 lands. Authority
    and database fields are live from this slice on.
    """
    try:
        async with get_session(read_only=True) as session:
            authority = SonoBusBindingAuthority(session)
            # Probe table presence with a lightweight count rather than
            # PRAGMA — the authority's count() raises if the table is
            # missing, which we surface as table_present=False.
            try:
                binding_count = await authority.count()
                enabled_rows = await session.execute(
                    select(func.count(SonoBusBinding.binding_id)).where(
                        SonoBusBinding.enabled.is_(True)
                    )
                )
                enabled_binding_count = int(enabled_rows.scalar() or 0)
                table_present = True
            except Exception:
                binding_count = 0
                enabled_binding_count = 0
                table_present = False

            return SonoBusStatusResponse(
                authority_ok=True,
                table_present=table_present,
                binding_count=binding_count,
                enabled_binding_count=enabled_binding_count,
            )
    except Exception:
        return SonoBusStatusResponse(
            authority_ok=False,
            table_present=False,
            binding_count=0,
            enabled_binding_count=0,
        )


@router.get("/bindings/count", response_model=int)
async def count_bindings() -> int:
    async with get_session(read_only=True) as session:
        authority = SonoBusBindingAuthority(session)
        return await authority.count()


@router.get("/bindings/matrix", response_model=SonoBusBindingsMatrixResponse)
async def get_bindings_matrix() -> SonoBusBindingsMatrixResponse:
    """Server-side aggregation of every SonoBusBinding.

    Returns the binding_kind × consumer_type cell counts AND the full
    binding list in one round-trip, so the Connections DataTable can
    stop fan-out across filters. Mirrors `/api/avb/bindings/matrix`.
    """
    async with get_session(read_only=True) as session:
        agg_rows = await session.execute(
            select(
                SonoBusBinding.binding_kind,
                SonoBusBinding.consumer_type,
                func.count(SonoBusBinding.binding_id).label("count"),
                func.sum(cast(SonoBusBinding.enabled, Integer)).label(
                    "enabled_count"
                ),
            ).group_by(SonoBusBinding.binding_kind, SonoBusBinding.consumer_type)
        )
        matrix: dict[str, dict[str, SonoBusMatrixCell]] = {}
        total = 0
        for binding_kind, consumer_type, count, enabled_count in agg_rows.all():
            row = matrix.setdefault(str(binding_kind), {})
            cell_count = int(count or 0)
            cell_enabled = int(enabled_count or 0)
            row[str(consumer_type)] = SonoBusMatrixCell(
                count=cell_count, enabled_count=cell_enabled
            )
            total += cell_count

        authority = SonoBusBindingAuthority(session)
        all_rows = await session.execute(select(SonoBusBinding))
        bindings = [authority._row_to_read(r) for r in all_rows.scalars().all()]

        return SonoBusBindingsMatrixResponse(
            matrix=matrix,
            total_bindings=total,
            bindings=bindings,
        )


@router.get("/bindings", response_model=list[SonoBusBindingRead])
async def list_bindings(
    consumer_type: Optional[SonoBusBindingConsumerType] = Query(default=None),
    consumer_id: Optional[str] = Query(default=None),
    binding_kind: Optional[SonoBusBindingKind] = Query(default=None),
    group_id: Optional[str] = Query(default=None),
    talker_node_id: Optional[str] = Query(default=None),
    listener_node_id: Optional[str] = Query(default=None),
    scope: Optional[SonoBusBindingScope] = Query(default=None),
    scope_id: Optional[str] = Query(default=None),
    enabled_only: bool = Query(default=False),
) -> list[SonoBusBindingRead]:
    """List bindings with optional filters. Filter precedence:

    consumer (consumer_type+consumer_id) > binding_kind > group_id >
    cluster pair > scope.

    At least one filter is required to keep the fan-out cost bounded.
    """
    async with get_session(read_only=True) as session:
        authority = SonoBusBindingAuthority(session)
        if consumer_type is not None and consumer_id is not None:
            return await authority.list_for_consumer(
                consumer_type, consumer_id, enabled_only=enabled_only
            )
        if binding_kind is not None:
            return await authority.list_by_kind(
                binding_kind, enabled_only=enabled_only
            )
        if group_id is not None:
            return await authority.list_for_group(
                group_id, enabled_only=enabled_only
            )
        if talker_node_id is not None or listener_node_id is not None:
            return await authority.list_for_cluster_pair(
                talker_node_id, listener_node_id, enabled_only=enabled_only
            )
        if scope is not None:
            return await authority.list_in_scope(
                scope, scope_id, enabled_only=enabled_only
            )
        raise HTTPException(
            status_code=400,
            detail=(
                "must filter by consumer_type+consumer_id, binding_kind, "
                "group_id, talker_node_id, listener_node_id, or scope"
            ),
        )


@router.get("/bindings/{binding_id}", response_model=SonoBusBindingRead)
async def get_binding(binding_id: str) -> SonoBusBindingRead:
    async with get_session(read_only=True) as session:
        authority = SonoBusBindingAuthority(session)
        try:
            return await authority.get(binding_id)
        except SonoBusBindingNotFound:
            raise HTTPException(
                status_code=404, detail=f"binding not found: {binding_id}"
            )


# ---------- Write ----------


@router.post("/bindings", response_model=SonoBusBindingRead, status_code=201)
async def create_binding(payload: SonoBusBindingCreate) -> SonoBusBindingRead:
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        return await authority.create(payload)


@router.patch("/bindings/{binding_id}", response_model=SonoBusBindingRead)
async def update_binding(
    binding_id: str, patch: SonoBusBindingUpdate
) -> SonoBusBindingRead:
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        try:
            return await authority.update(binding_id, patch)
        except SonoBusBindingNotFound:
            raise HTTPException(
                status_code=404, detail=f"binding not found: {binding_id}"
            )


@router.delete("/bindings/{binding_id}", status_code=204)
async def delete_binding(binding_id: str) -> None:
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        deleted = await authority.delete(binding_id)
        if not deleted:
            raise HTTPException(
                status_code=404, detail=f"binding not found: {binding_id}"
            )


@router.post("/bindings/{binding_id}/disable", response_model=SonoBusBindingRead)
async def disable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> SonoBusBindingRead:
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        try:
            return await authority.disable(binding_id, modified_by=modified_by)
        except SonoBusBindingNotFound:
            raise HTTPException(
                status_code=404, detail=f"binding not found: {binding_id}"
            )


@router.post("/bindings/{binding_id}/enable", response_model=SonoBusBindingRead)
async def enable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> SonoBusBindingRead:
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        try:
            return await authority.enable(binding_id, modified_by=modified_by)
        except SonoBusBindingNotFound:
            raise HTTPException(
                status_code=404, detail=f"binding not found: {binding_id}"
            )


__all__ = ["router"]
