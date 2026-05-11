"""Consolidated `/api/midi/*` routes for the MIDI Services canonical authority.

T2482-P3.1 (iter 18) — backend route scaffold. The `/midi`
canonical surface (Phase 3) consumes these endpoints exclusively.
Per the four-services discipline, every binding read/write goes
through MidiBindingAuthority via this single route file.

The router is mounted in `app/main.py` via
`app.include_router(midi_services_router)` (search for
"MIDI Services routes registered" in main.py for the live mount
point). All endpoints declared here are publicly reachable.

T2483 loop 17 / iter 162 — added GET /bindings/matrix for the
T2483-8 server-side aggregation. Replaces the iter-117 client-side
fan-out (10 queries / 5s poll → 1 query / 5s poll).

T2483 loop 17 / iter 172 — added GET /bindings/learn/last-cc for
the T2483-5 SourceDescriptorEditor Learn button.

T2484 loop 19 / iter 182 — added GET /cluster/bindings/matrix for
T2484-1 cluster MIDI peer wiring; iter 195 extended ClusterPeerMatrix
with health field per T2484-4.
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


class LastCcResponse(BaseModel):
    """T2483-5 iter 172 — most-recently-observed CC for the
    SourceDescriptorEditor Learn button. None if no CC has been
    observed since service start.
    """

    cc: int
    channel: Optional[int]
    value: int
    observed_at: float


@router.get("/bindings/learn/last-cc", response_model=Optional[LastCcResponse])
async def get_last_observed_cc() -> Optional[LastCcResponse]:
    """T2483-5 iter 172 — return the most-recently-observed MIDI CC
    captured by MIDILearnManager's existing MidiHub bridge.

    The frontend SourceDescriptorEditor Learn button polls this
    every 250ms for up to 10s; on first non-null response it writes
    the cc + channel into the descriptor.
    """
    from app.services.midi_learn import midi_learn_manager

    last = midi_learn_manager.get_last_cc()
    if last is None:
        return None
    return LastCcResponse(**last)


class ClusterPeerMatrix(BaseModel):
    """T2484-1 iter 182 — one peer's matrix slice in the cluster response.
    T2484-4 iter 195 — added `health` field sourced from NodeHealthService.
    """

    node_id: str
    hostname: str
    matrix: dict[str, dict[str, MatrixCell]]
    total_bindings: int
    # 'ok' | 'warn' | 'critical' | 'offline' | 'unreachable' (last is
    # set when the matrix fetch failed but discovery still listed the
    # peer)
    health: str = "offline"


class ClusterBindingsMatrixResponse(BaseModel):
    """T2484-1 iter 182 — cluster-wide aggregation for the iter-177
    usePeerMatrix scaffold to consume.

    Shape:
      local: BindingsMatrixResponse  (the local node's matrix; unchanged
        from the iter-162 endpoint shape so existing consumers keep working)
      peers: list[ClusterPeerMatrix]  (per-peer matrix, EXCLUDES local
        per the iter-181 plan D2)
      errors: dict[node_id, error_message]  (peers that failed to respond
        or returned malformed payloads — still listed so the UI can surface
        partial-availability state)
    """

    local: BindingsMatrixResponse
    peers: list[ClusterPeerMatrix]
    errors: dict[str, str]


async def _fetch_peer_matrix(
    *,
    node_id: str,
    hostname: str,
    api_url: str,
    timeout_s: float,
    health: str = "offline",
) -> tuple[Optional[ClusterPeerMatrix], Optional[str]]:
    """Single-peer fetch helper. Returns (matrix_or_none, error_or_none).

    T2484-4 iter 195 — `health` is passed in from the route handler
    after a NodeHealthService.get_remote_health call; baked into the
    returned ClusterPeerMatrix so the frontend doesn't need a second
    fetch.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(f"{api_url}/api/midi/bindings/matrix")
            if response.status_code != 200:
                return None, f"http {response.status_code}"
            payload = response.json()
            return (
                ClusterPeerMatrix(
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
    "/cluster/bindings/matrix", response_model=ClusterBindingsMatrixResponse
)
async def get_cluster_bindings_matrix() -> ClusterBindingsMatrixResponse:
    """T2484-1 iter 182 — cluster-wide aggregation of every peer's
    GET /api/midi/bindings/matrix. Frontend usePeerMatrix (iter 185)
    consumes this directly.

    Per the iter-181 plan D3: all peer requests are issued
    concurrently via asyncio.gather with a 2s per-peer timeout. Failed
    peers populate the errors map but don't fail the whole request.
    """
    import asyncio

    # Local matrix.
    local = await get_bindings_matrix()

    # Peer fan-out.
    from app.services.node_discovery_service import get_node_discovery_service

    discovery = get_node_discovery_service()
    peer_records = await discovery._load_peer_records()
    if not peer_records:
        return ClusterBindingsMatrixResponse(local=local, peers=[], errors={})

    # T2484-4 iter 195 — fetch per-peer health alongside the matrix
    # so the frontend gets it in one round-trip. Health failures degrade
    # to 'offline' silently; matrix failures still populate `errors`.
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
        _fetch_peer_matrix(
            node_id=peer.node_id,
            hostname=peer.hostname,
            api_url=peer.api_url or f"http://{peer.host}:8080",
            timeout_s=2.0,
            health=health,
        )
        for peer, health in zip(peer_records, healths)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    peers: list[ClusterPeerMatrix] = []
    errors: dict[str, str] = {}
    for peer, (matrix_or_none, err_or_none) in zip(peer_records, results):
        if matrix_or_none is not None:
            peers.append(matrix_or_none)
        if err_or_none is not None:
            errors[peer.node_id] = err_or_none

    return ClusterBindingsMatrixResponse(local=local, peers=peers, errors=errors)


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

    `consumer_id="*"` is a wildcard: when combined with `consumer_type`,
    every binding of that type is returned regardless of consumer_id
    (T2459-H10 — matches the UI hint "use * for any").
    """
    async with get_session(read_only=True) as session:
        authority = MidiBindingAuthority(session)
        if consumer_type is not None and consumer_id is not None:
            if consumer_id == "*":
                return await authority.list_by_consumer_type(
                    consumer_type, enabled_only=enabled_only
                )
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


# T2459-H8b-1 — outbound feedback test for a canonical MidiBinding.
# Replaces the legacy integer-id `POST /api/v2/midi/mappings/{id}/test`
# call that the Snapshot Editor Selected-block panel had to disable when
# it cut over to canonical authority. Re-enables the Heel/Live/Toe buttons.


class BindingFeedbackTestRequest(BaseModel):
    normalized_value: Optional[float] = None
    use_current_value: bool = False


class BindingFeedbackTestResponse(BaseModel):
    binding_id: str
    channel: int
    cc: int
    normalized_value: float
    cc_value: int
    source: str


@router.post("/bindings/{binding_id}/test", response_model=BindingFeedbackTestResponse)
async def send_binding_feedback_test(
    binding_id: str,
    request: BindingFeedbackTestRequest,
) -> BindingFeedbackTestResponse:
    from app.services.midi_service import midi_service

    async with get_session(read_only=True) as session:
        authority = MidiBindingAuthority(session)
        try:
            binding = await authority.get(binding_id)
        except MidiBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")

    if binding.source_type != "midi_cc":
        raise HTTPException(
            status_code=400,
            detail=(
                "feedback test is only supported for midi_cc bindings; "
                f"binding {binding_id} has source_type={binding.source_type}"
            ),
        )

    try:
        payload = await midi_service.send_canonical_binding_feedback_test(
            binding_id=binding_id,
            source_descriptor=dict(binding.source_descriptor or {}),
            target_descriptor=dict(binding.target_descriptor or {}),
            normalized_value=request.normalized_value,
            use_current_value=request.use_current_value,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return BindingFeedbackTestResponse(**payload)


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
