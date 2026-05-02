"""Consolidated `/api/avb/bindings/*` routes for the AVB Services authority.

T2490-2. Mirrors `app/services/midi/routes.py` shape-for-shape so the
operator-tooling consumers can treat both surfaces interchangeably.

The router is mounted in `app/main.py` near the MIDI Services mount.
T2490-3..T2490-9 progressively build matrix / cluster endpoints on top
of this baseline.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select

from app.database import get_session
from app.services.avb.binding_authority import AvbBindingAuthority, AvbBindingNotFound
from app.services.avb.binding_models import AvbBinding
from app.services.avb.binding_schemas import (
    AvbBindingConsumerType,
    AvbBindingCreate,
    AvbBindingRead,
    AvbBindingScope,
    AvbBindingUpdate,
)


router = APIRouter(prefix="/api/avb", tags=["AVB Services"])


class AvbMatrixCell(BaseModel):
    """T2490-2b — one cell of the source × consumer routing matrix."""

    count: int
    enabled_count: int


class AvbBindingsMatrixResponse(BaseModel):
    """T2490-2b — full source × consumer aggregation, plus the rows
    themselves so the frontend can populate the Connections DataTable
    in a single round-trip (replaces the iter-3 4-query fan-out across
    global / snapshot / node / cluster scopes).

    Mirrors `BindingsMatrixResponse` in app/services/midi/routes.py.
    """

    matrix: dict[str, dict[str, AvbMatrixCell]]
    total_bindings: int
    bindings: list[AvbBindingRead]


class AvbClusterPeerMatrix(BaseModel):
    """T2490-7 — one peer's matrix slice in the cluster response.

    Mirrors `ClusterPeerMatrix` in app/services/midi/routes.py.
    `health` is sourced from NodeHealthService and baked in so the
    frontend doesn't need a second fetch.
    """

    node_id: str
    hostname: str
    matrix: dict[str, dict[str, AvbMatrixCell]]
    total_bindings: int
    health: str = "offline"


class AvbClusterBindingsMatrixResponse(BaseModel):
    """T2490-7 — cluster-wide aggregation. Local matrix kept under
    `local`; per-peer matrices under `peers`; failed peers populate
    `errors` keyed by node_id."""

    local: AvbBindingsMatrixResponse
    peers: list[AvbClusterPeerMatrix]
    errors: dict[str, str]


# IMPORTANT: route ordering matters in FastAPI. /bindings/count MUST
# come before /bindings/{binding_id} so a literal "count" doesn't
# accidentally match the parameterized binding_id slot.


@router.get("/bindings/count", response_model=int)
async def count_bindings() -> int:
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        return await authority.count()


@router.get("/bindings/matrix", response_model=AvbBindingsMatrixResponse)
async def get_bindings_matrix() -> AvbBindingsMatrixResponse:
    """T2490-2b — server-side aggregation of every AvbBinding.

    Returns the source_type × consumer_type cell counts AND the full
    binding list in one round-trip, so the Connections DataTable
    (T2490-4) can stop fan-out across scope filters. Mirrors
    `/api/midi/bindings/matrix`.
    """
    async with get_session(read_only=True) as session:
        # Aggregate cell counts.
        agg_rows = await session.execute(
            select(
                AvbBinding.source_type,
                AvbBinding.consumer_type,
                func.count(AvbBinding.binding_id).label("count"),
                func.sum(cast(AvbBinding.enabled, Integer)).label("enabled_count"),
            ).group_by(AvbBinding.source_type, AvbBinding.consumer_type)
        )
        matrix: dict[str, dict[str, AvbMatrixCell]] = {}
        total = 0
        for source_type, consumer_type, count, enabled_count in agg_rows.all():
            row = matrix.setdefault(str(source_type), {})
            cell_count = int(count or 0)
            cell_enabled = int(enabled_count or 0)
            row[str(consumer_type)] = AvbMatrixCell(
                count=cell_count, enabled_count=cell_enabled
            )
            total += cell_count

        # Pull every binding in a single query so the frontend can render
        # the DataTable + the matrix from one response. This is fine at
        # the table sizes T2490 expects (low thousands at most).
        authority = AvbBindingAuthority(session)
        # The authority's per-scope listers cover the same ground but
        # require 4 queries; here we go straight to the table.
        all_rows = await session.execute(select(AvbBinding))
        bindings = [authority._row_to_read(r) for r in all_rows.scalars().all()]

        return AvbBindingsMatrixResponse(
            matrix=matrix,
            total_bindings=total,
            bindings=bindings,
        )


async def _fetch_peer_avb_matrix(
    *,
    node_id: str,
    hostname: str,
    api_url: str,
    timeout_s: float,
    health: str = "offline",
) -> tuple[Optional[AvbClusterPeerMatrix], Optional[str]]:
    """Single-peer fetch helper. Returns (matrix_or_none, error_or_none).

    Mirrors `_fetch_peer_matrix` in app/services/midi/routes.py.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(f"{api_url}/api/avb/bindings/matrix")
            if response.status_code != 200:
                return None, f"http {response.status_code}"
            payload = response.json()
            return (
                AvbClusterPeerMatrix(
                    node_id=node_id,
                    hostname=hostname,
                    matrix=payload.get("matrix", {}),
                    total_bindings=int(payload.get("total_bindings", 0)),
                    health=health,
                ),
                None,
            )
    except Exception as exc:
        return None, str(exc)


@router.get(
    "/cluster/bindings/matrix", response_model=AvbClusterBindingsMatrixResponse
)
async def get_cluster_bindings_matrix() -> AvbClusterBindingsMatrixResponse:
    """T2490-7 — cluster-wide aggregation of every peer's
    GET /api/avb/bindings/matrix. Mirrors the MIDI cluster-matrix
    endpoint shipped in T2484-1.

    All peer requests are issued concurrently via asyncio.gather with
    a 2s per-peer timeout. Failed peers populate `errors` but don't
    fail the whole request.
    """
    import asyncio

    # Local matrix.
    local = await get_bindings_matrix()

    # Peer fan-out.
    from app.services.node_discovery_service import get_node_discovery_service

    discovery = get_node_discovery_service()
    peer_records = await discovery._load_peer_records()
    if not peer_records:
        return AvbClusterBindingsMatrixResponse(local=local, peers=[], errors={})

    from app.services.node_health_service import get_node_health_service

    health_service = get_node_health_service()

    async def _peer_health(peer):
        try:
            health = await health_service.get_remote_health(peer.host)
            return getattr(health, "status", "offline")
        except Exception:
            return "offline"

    health_tasks = [_peer_health(peer) for peer in peer_records]
    healths = await asyncio.gather(*health_tasks, return_exceptions=False)

    tasks = [
        _fetch_peer_avb_matrix(
            node_id=peer.node_id,
            hostname=peer.hostname,
            api_url=peer.api_url or f"http://{peer.host}:8080",
            timeout_s=2.0,
            health=health,
        )
        for peer, health in zip(peer_records, healths)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    peers: list[AvbClusterPeerMatrix] = []
    errors: dict[str, str] = {}
    for peer, (matrix_or_none, err_or_none) in zip(peer_records, results):
        if matrix_or_none is not None:
            peers.append(matrix_or_none)
        if err_or_none is not None:
            errors[peer.node_id] = err_or_none

    return AvbClusterBindingsMatrixResponse(local=local, peers=peers, errors=errors)


@router.get("/bindings", response_model=list[AvbBindingRead])
async def list_bindings(
    consumer_type: Optional[AvbBindingConsumerType] = Query(default=None),
    consumer_id: Optional[str] = Query(default=None),
    stream_id: Optional[str] = Query(default=None),
    talker_node_id: Optional[str] = Query(default=None),
    listener_node_id: Optional[str] = Query(default=None),
    scope: Optional[AvbBindingScope] = Query(default=None),
    scope_id: Optional[str] = Query(default=None),
    enabled_only: bool = Query(default=False),
) -> list[AvbBindingRead]:
    """List bindings, with optional filters. Filter precedence:
    consumer (consumer_type+consumer_id) > stream_id > cluster pair > scope.

    At least one filter is required (unfiltered queries are rejected so
    a misconfigured frontend can't accidentally fan out the whole table).
    """
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        if consumer_type is not None and consumer_id is not None:
            return await authority.list_for_consumer(
                consumer_type, consumer_id, enabled_only=enabled_only
            )
        if stream_id is not None:
            return await authority.list_for_stream(stream_id, enabled_only=enabled_only)
        if talker_node_id is not None or listener_node_id is not None:
            return await authority.list_for_cluster_pair(
                talker_node_id, listener_node_id, enabled_only=enabled_only
            )
        if scope is not None:
            return await authority.list_in_scope(scope, scope_id, enabled_only=enabled_only)
        raise HTTPException(
            status_code=400,
            detail=(
                "must filter by consumer_type+consumer_id, stream_id, "
                "talker_node_id, listener_node_id, or scope"
            ),
        )


@router.get("/bindings/{binding_id}", response_model=AvbBindingRead)
async def get_binding(binding_id: str) -> AvbBindingRead:
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.get(binding_id)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


# ---------- Write ----------


@router.post("/bindings", response_model=AvbBindingRead, status_code=201)
async def create_binding(payload: AvbBindingCreate) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        return await authority.create(payload)


@router.patch("/bindings/{binding_id}", response_model=AvbBindingRead)
async def update_binding(binding_id: str, patch: AvbBindingUpdate) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.update(binding_id, patch)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.delete("/bindings/{binding_id}", status_code=204)
async def delete_binding(binding_id: str) -> None:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        deleted = await authority.delete(binding_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/disable", response_model=AvbBindingRead)
async def disable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.disable(binding_id, modified_by=modified_by)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/enable", response_model=AvbBindingRead)
async def enable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.enable(binding_id, modified_by=modified_by)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


__all__ = ["router"]
