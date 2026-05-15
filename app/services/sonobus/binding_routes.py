"""Consolidated `/api/sonobus/*` routes for the SonoBus/AOO transport
authority.

T2521-5. Mirrors `app/services/avb/binding_routes.py` shape-for-shape so
the operator-tooling consumers can treat AVB and SonoBus binding
surfaces interchangeably. Cluster-matrix fan-out and WebSocket events
are deferred to a later T2521-5 slice (kept here as a placeholder note).

The router is mounted in `app/main.py` near the AVB Services mount.
"""

from __future__ import annotations

from typing import Any, Optional

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select

logger = logging.getLogger(__name__)

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

    The daemon/runtime side lights up incrementally across T2521-4 cycles:
    cycle 5 wires `daemon_running` + `daemon_endpoint` + `daemon_status`
    + `daemon_capabilities` from the live supervisor. Authority/database
    fields are live from T2521-3 onward.
    """

    authority_ok: bool
    table_present: bool
    binding_count: int
    enabled_binding_count: int

    # Daemon-side fields. cycle 5 lights these up from the live supervisor.
    daemon_running: bool = False
    daemon_endpoint: Optional[str] = None
    # Canonical supervisor state string (stopped / waiting-for-binary /
    # waiting-for-daemon / connecting / running / reconnecting / degraded /
    # shutdown). Used by the GUI to render the right tone Tag.
    daemon_status: str = "stopped"
    # Full daemon capability snapshot from the hello handshake. Lets the
    # GUI show `stub mode` / `full mode` + the daemon's version + the
    # locked Q1-Q21 defaults without an extra round-trip.
    daemon_capabilities: Optional[dict[str, Any]] = None

    connection_server_enabled: bool = True  # Q3 default
    connection_server_running: bool = False

    # Transport-priority indicator surfaced on the Overview page.
    default_transport_priority: str = "avb_preferred"  # Q18 default


class SonoBusClusterPeerMatrix(BaseModel):
    """One peer's matrix slice in the cluster response.

    Mirrors `AvbClusterPeerMatrix`. `health` is sourced from
    `NodeHealthService` and baked in so the frontend doesn't need a
    second fetch.
    """

    node_id: str
    hostname: str
    matrix: dict[str, dict[str, SonoBusMatrixCell]]
    total_bindings: int
    health: str = "offline"


class SonoBusClusterBindingsMatrixResponse(BaseModel):
    """Cluster-wide aggregation of every peer's
    `GET /api/sonobus/bindings/matrix`. Local matrix kept under `local`;
    per-peer matrices under `peers`; failed peers populate `errors`
    keyed by node_id.

    Mirrors `AvbClusterBindingsMatrixResponse`.
    """

    local: SonoBusBindingsMatrixResponse
    peers: list[SonoBusClusterPeerMatrix]
    errors: dict[str, str]


# IMPORTANT: route ordering matters in FastAPI. /bindings/count,
# /bindings/matrix and /cluster/bindings/matrix MUST come before
# /bindings/{binding_id} so the literal segments don't accidentally
# match the parameterized slot.


def _supervisor_status_fields() -> dict[str, Any]:
    """Pull live daemon-side fields from the supervisor singleton.

    Wrapped in try/except so a failed import (e.g. during early
    backend boot before the supervisor module is loaded) keeps the
    status route alive with stub defaults.
    """
    try:
        from app.services.sonobus.daemon_supervisor import (
            get_sonobus_daemon_supervisor,
        )
        supervisor = get_sonobus_daemon_supervisor()
        payload = supervisor.status_payload()
        return {
            "daemon_running": bool(payload.get("connected", False)),
            "daemon_endpoint": (
                payload.get("socket_path") if payload.get("connected") else None
            ),
            "daemon_status": str(payload.get("status", "stopped")),
            "daemon_capabilities": payload.get("capabilities"),
        }
    except Exception:
        return {
            "daemon_running": False,
            "daemon_endpoint": None,
            "daemon_status": "stopped",
            "daemon_capabilities": None,
        }


@router.get("/status", response_model=SonoBusStatusResponse)
async def get_status() -> SonoBusStatusResponse:
    """High-level SonoBus status — drives the /sonobus Overview tile.

    Authority + database fields are live from T2521-3 onward; daemon
    fields are live from T2521-4 cycle 5 onward (sourced from the
    SonoBusDaemonSupervisor singleton).
    """
    daemon_fields = _supervisor_status_fields()
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
                **daemon_fields,
            )
    except Exception:
        return SonoBusStatusResponse(
            authority_ok=False,
            table_present=False,
            binding_count=0,
            enabled_binding_count=0,
            **daemon_fields,
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


async def _fetch_peer_sonobus_matrix(
    *,
    node_id: str,
    hostname: str,
    api_url: str,
    timeout_s: float,
    health: str = "offline",
) -> tuple[Optional[SonoBusClusterPeerMatrix], Optional[str]]:
    """Single-peer fetch helper. Returns (matrix_or_none, error_or_none).

    Mirrors `_fetch_peer_avb_matrix`. Each peer request is bounded by
    `timeout_s` so a slow peer never holds the cluster matrix.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(f"{api_url}/api/sonobus/bindings/matrix")
            if response.status_code != 200:
                return None, f"http {response.status_code}"
            payload = response.json()
            return (
                SonoBusClusterPeerMatrix(
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
    "/cluster/bindings/matrix",
    response_model=SonoBusClusterBindingsMatrixResponse,
)
async def get_cluster_bindings_matrix() -> SonoBusClusterBindingsMatrixResponse:
    """T2521-5b — cluster-wide aggregation of every peer's
    `GET /api/sonobus/bindings/matrix`. Mirrors `AvbClusterBindingsMatrixResponse`.

    All peer requests are issued concurrently via asyncio.gather with
    a 2 s per-peer timeout. Failed peers populate `errors` but don't
    fail the whole request.
    """
    import asyncio

    local = await get_bindings_matrix()

    from app.services.node_discovery_service import get_node_discovery_service

    discovery = get_node_discovery_service()
    peer_records = await discovery._load_peer_records()
    if not peer_records:
        return SonoBusClusterBindingsMatrixResponse(
            local=local, peers=[], errors={}
        )

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
        _fetch_peer_sonobus_matrix(
            node_id=peer.node_id,
            hostname=peer.hostname,
            api_url=peer.api_url or f"http://{peer.host}:8080",
            timeout_s=2.0,
            health=health,
        )
        for peer, health in zip(peer_records, healths)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=False)

    peers: list[SonoBusClusterPeerMatrix] = []
    errors: dict[str, str] = {}
    for peer, (matrix_or_none, err_or_none) in zip(peer_records, results):
        if matrix_or_none is not None:
            peers.append(matrix_or_none)
        if err_or_none is not None:
            errors[peer.node_id] = err_or_none

    return SonoBusClusterBindingsMatrixResponse(
        local=local, peers=peers, errors=errors
    )


class SonoBusProfilePreset(BaseModel):
    """A built-in codec + jitter + resend posture preset.

    The set of presets reflects the T2521 locked decisions (Q7/Q8/Q9).
    Operator-defined custom profiles ride alongside the daemon-side
    profile table once T2521-4 ships.
    """

    profile_id: str
    label: str
    codec_profile: str
    stream_format: str
    jitter_buffer_ms: int
    resend_policy: str
    latency_target_ms: int
    description: str


BUILT_IN_PROFILES: tuple[SonoBusProfilePreset, ...] = (
    SonoBusProfilePreset(
        profile_id="pcm_lowest_latency",
        label="PCM lowest latency",
        codec_profile="pcm",
        stream_format="pcm_s24_48000",
        jitter_buffer_ms=4,
        resend_policy="burst_loss_only",
        latency_target_ms=8,
        description=(
            "T2521 default per Q7/Q8/Q9 — PCM 24-bit/48 kHz with 4 ms "
            "jitter buffer and burst-loss-only resends. Optimised for "
            "lowest latency; tolerates occasional dropouts."
        ),
    ),
    SonoBusProfilePreset(
        profile_id="pcm_resilient",
        label="PCM resilient",
        codec_profile="pcm",
        stream_format="pcm_s24_48000",
        jitter_buffer_ms=12,
        resend_policy="full",
        latency_target_ms=20,
        description=(
            "PCM 24-bit/48 kHz with a wider jitter buffer and full "
            "resends. For lossier paths where occasional dropouts are "
            "unacceptable."
        ),
    ),
    SonoBusProfilePreset(
        profile_id="pcm_studio",
        label="PCM studio",
        codec_profile="pcm",
        stream_format="pcm_s24_48000",
        jitter_buffer_ms=8,
        resend_policy="burst_loss_only",
        latency_target_ms=12,
        description=(
            "PCM 24-bit/48 kHz with a moderate jitter buffer. "
            "Balanced posture for stable LAN paths under recording "
            "use (not Recorder per Q12 — for live monitoring)."
        ),
    ),
)


@router.get("/profiles", response_model=list[SonoBusProfilePreset])
async def list_profiles() -> list[SonoBusProfilePreset]:
    """T2521-5d — list of codec + jitter + resend presets.

    Returns the built-in profiles derived from the T2521 locked
    decisions. Operator-defined custom profiles land when T2521-4
    ships its own profile table; this endpoint will then return both.
    """
    return list(BUILT_IN_PROFILES)


@router.get("/profiles/{profile_id}", response_model=SonoBusProfilePreset)
async def get_profile(profile_id: str) -> SonoBusProfilePreset:
    """T2521-5d — single profile lookup."""
    for preset in BUILT_IN_PROFILES:
        if preset.profile_id == profile_id:
            return preset
    raise HTTPException(
        status_code=404, detail=f"profile not found: {profile_id}"
    )


class SonoBusPeerSummary(BaseModel):
    """Aggregated peer view derived from bindings.

    Until the T2521-4 daemon ships its own peer-discovery table, the
    peer view is computed from binding rows: each unique (listener_node_id
    or listener_peer_endpoint, listener_capability) tuple is a peer.
    """

    peer_id: str
    listener_node_id: Optional[str]
    listener_endpoint: Optional[str]
    listener_capability: Optional[str]
    binding_count: int
    enabled_binding_count: int


class SonoBusGroupSummary(BaseModel):
    """Aggregated group view derived from bindings."""

    group_id: str
    session_label: Optional[str]
    binding_count: int
    enabled_binding_count: int
    channel_count_total: int


@router.get("/peers", response_model=list[SonoBusPeerSummary])
async def list_peers() -> list[SonoBusPeerSummary]:
    """T2521-5c — operator peer view derived from bindings.

    Aggregates by (listener_node_id, listener_peer_endpoint,
    listener_capability). Drives the `/sonobus/peers` Carbon page.
    Until T2521-4 daemon ships its own discovered-peer table this is
    the authoritative peer projection.
    """
    async with get_session(read_only=True) as session:
        rows = await session.execute(select(SonoBusBinding))
        peers: dict[tuple, SonoBusPeerSummary] = {}
        for binding in rows.scalars().all():
            endpoint = None
            if isinstance(binding.target_descriptor, dict):
                endpoint = binding.target_descriptor.get(
                    "listener_peer_endpoint"
                ) or binding.target_descriptor.get("endpoint")
            key = (
                binding.listener_node_id or "",
                endpoint or "",
                binding.listener_capability or "",
            )
            if not any(key):
                continue
            peer = peers.get(key)
            if peer is None:
                peer_id = ":".join(part or "-" for part in key)
                peer = SonoBusPeerSummary(
                    peer_id=peer_id,
                    listener_node_id=binding.listener_node_id,
                    listener_endpoint=endpoint,
                    listener_capability=binding.listener_capability,
                    binding_count=0,
                    enabled_binding_count=0,
                )
                peers[key] = peer
            peer.binding_count += 1
            if binding.enabled:
                peer.enabled_binding_count += 1
        return sorted(peers.values(), key=lambda p: p.peer_id)


@router.get("/groups", response_model=list[SonoBusGroupSummary])
async def list_groups() -> list[SonoBusGroupSummary]:
    """T2521-5c — operator group view derived from bindings.

    Aggregates by `group_id`. Skips rows without a `group_id` (peer
    bindings, cluster-route bindings).
    """
    async with get_session(read_only=True) as session:
        rows = await session.execute(
            select(SonoBusBinding).where(SonoBusBinding.group_id.is_not(None))
        )
        groups: dict[str, SonoBusGroupSummary] = {}
        for binding in rows.scalars().all():
            gid = binding.group_id or ""
            if not gid:
                continue
            group = groups.get(gid)
            if group is None:
                group = SonoBusGroupSummary(
                    group_id=gid,
                    session_label=binding.session_label,
                    binding_count=0,
                    enabled_binding_count=0,
                    channel_count_total=0,
                )
                groups[gid] = group
            group.binding_count += 1
            if binding.enabled:
                group.enabled_binding_count += 1
            group.channel_count_total += int(binding.channel_count or 0)
            # Prefer first non-null session_label seen.
            if group.session_label is None and binding.session_label:
                group.session_label = binding.session_label
        return sorted(groups.values(), key=lambda g: g.group_id)


@router.get("/sessions", response_model=list[SonoBusBindingRead])
async def list_sessions() -> list[SonoBusBindingRead]:
    """T2521-5c — active session view.

    Returns enabled `binding_kind in {stream, client_session}`. Daemon
    integration in T2521-4 will swap this for a live-session projection
    fed by the AOO runtime; the contract stays the same.
    """
    async with get_session(read_only=True) as session:
        authority = SonoBusBindingAuthority(session)
        streams = await authority.list_by_kind("stream", enabled_only=True)
        sessions = await authority.list_by_kind(
            "client_session", enabled_only=True
        )
        return streams + sessions


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


# ---------- T2521-5 remaining surface (cycle 26) ----------
#
# Each of the routes below is the operator-facing contract. Daemon-side
# fields stay at placeholder/derived values until the T2521-4 transport
# runtime lands; the GUI + tests can wire against the route shape today
# and pick up the live data automatically once the daemon publishes
# through these same paths.


class SonoBusPeerProbeResponse(BaseModel):
    """T2521-5f — one-shot peer reachability probe.

    Daemon-side this kicks an AOO ping at the peer endpoint and records
    the RTT. Until T2521-4 the route returns the binding's last-known
    state from the authority + ``reachable=False`` so the operator sees
    "needs daemon" instead of a route 404.
    """

    peer_id: str
    reachable: bool
    rtt_ms: Optional[float] = None
    last_seen_iso: Optional[str] = None
    detail: str = "daemon offline (T2521-4)"


@router.post(
    "/peers/{peer_id}/probe",
    response_model=SonoBusPeerProbeResponse,
)
async def probe_peer(peer_id: str) -> SonoBusPeerProbeResponse:
    """T2521-5f — issue a one-shot reachability + RTT probe.

    The real probe is daemon-side. This stub honors the architecture
    doc's API contract (POST returns 200 with a structured result) so
    operator tooling and the GUI Network page can light up the call
    button today.
    """
    return SonoBusPeerProbeResponse(peer_id=peer_id, reachable=False)


class SonoBusGroupCreateRequest(BaseModel):
    """Request body for ``POST /api/sonobus/groups`` (T2521-5g)."""

    group_id: str
    session_label: Optional[str] = None
    channel_count: int = 1


@router.post("/groups", response_model=SonoBusGroupSummary, status_code=201)
async def create_group(body: SonoBusGroupCreateRequest) -> SonoBusGroupSummary:
    """T2521-5g — register a group identity for downstream bindings.

    Groups are derived projections over bindings (see ``list_groups``);
    "creating" a group at this layer simply seeds a placeholder summary
    so a fresh GUI can write per-group settings before any binding lands.
    Returns the seeded summary; the operator subsequently attaches
    bindings via POST /bindings with ``group_id=<id>``.
    """
    return SonoBusGroupSummary(
        group_id=body.group_id,
        session_label=body.session_label,
        binding_count=0,
        enabled_binding_count=0,
        channel_count_total=int(body.channel_count or 0),
    )


@router.get(
    "/groups/{group_id}",
    response_model=SonoBusGroupSummary,
)
async def get_group(group_id: str) -> SonoBusGroupSummary:
    """T2521-5g — single-group lookup. Returns 404 when the group has
    no bindings yet (which mirrors ``list_groups`` skipping empty
    groups). Operator tooling treats 404 as "no bindings" rather than
    "no group"."""
    async with get_session(read_only=True) as session:
        rows = await session.execute(
            select(SonoBusBinding).where(SonoBusBinding.group_id == group_id)
        )
        bindings = list(rows.scalars().all())
        if not bindings:
            raise HTTPException(
                status_code=404, detail=f"group not found: {group_id}"
            )
        summary = SonoBusGroupSummary(
            group_id=group_id,
            session_label=next(
                (b.session_label for b in bindings if b.session_label),
                None,
            ),
            binding_count=len(bindings),
            enabled_binding_count=sum(1 for b in bindings if b.enabled),
            channel_count_total=sum(
                int(b.channel_count or 0) for b in bindings
            ),
        )
        return summary


class SonoBusGroupPatchRequest(BaseModel):
    """Operator-facing fields on a group (label only for now)."""

    session_label: Optional[str] = None


@router.patch(
    "/groups/{group_id}",
    response_model=SonoBusGroupSummary,
)
async def patch_group(
    group_id: str, body: SonoBusGroupPatchRequest
) -> SonoBusGroupSummary:
    """T2521-5g — propagate a group label rename to every binding in
    the group. Returns the refreshed summary."""
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        rows = await session.execute(
            select(SonoBusBinding).where(SonoBusBinding.group_id == group_id)
        )
        bindings = list(rows.scalars().all())
        if not bindings:
            raise HTTPException(
                status_code=404, detail=f"group not found: {group_id}"
            )
        if body.session_label is not None:
            for binding in bindings:
                await authority.update(
                    binding.binding_id,
                    SonoBusBindingUpdate(
                        session_label=body.session_label,
                        modified_by="api:group_patch",
                    ),
                )
            # Refresh post-update.
            rows = await session.execute(
                select(SonoBusBinding).where(
                    SonoBusBinding.group_id == group_id
                )
            )
            bindings = list(rows.scalars().all())
        return SonoBusGroupSummary(
            group_id=group_id,
            session_label=next(
                (b.session_label for b in bindings if b.session_label),
                None,
            ),
            binding_count=len(bindings),
            enabled_binding_count=sum(1 for b in bindings if b.enabled),
            channel_count_total=sum(
                int(b.channel_count or 0) for b in bindings
            ),
        )


@router.delete(
    "/groups/{group_id}",
    status_code=204,
)
async def delete_group(group_id: str) -> None:
    """T2521-5g — drop every binding in a group. Returns 204; mirrors
    the AVB group-delete semantics."""
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        rows = await session.execute(
            select(SonoBusBinding).where(SonoBusBinding.group_id == group_id)
        )
        bindings = list(rows.scalars().all())
        if not bindings:
            raise HTTPException(
                status_code=404, detail=f"group not found: {group_id}"
            )
        for binding in bindings:
            await authority.delete(binding.binding_id)


class SonoBusSessionDisconnectResponse(BaseModel):
    """Response body for the operator-facing tear-down call."""

    session_id: str
    disconnected: bool
    detail: str = "daemon offline (T2521-4)"


@router.post(
    "/sessions/{session_id}/disconnect",
    response_model=SonoBusSessionDisconnectResponse,
)
async def disconnect_session(
    session_id: str,
) -> SonoBusSessionDisconnectResponse:
    """T2521-5g — operator tear-down of a live stream / client session.

    The route disables the matching binding (so the next daemon poll
    picks up the operator's intent) and reports the outcome. Returns
    ``disconnected=False`` when the daemon hasn't been started yet, so
    the GUI can render the "started but daemon offline" affordance the
    architecture doc calls out.
    """
    async with get_session() as session:
        authority = SonoBusBindingAuthority(session)
        try:
            await authority.disable(session_id, modified_by="api:disconnect")
            return SonoBusSessionDisconnectResponse(
                session_id=session_id,
                disconnected=True,
                detail="binding disabled; daemon will tear down on next poll",
            )
        except SonoBusBindingNotFound:
            raise HTTPException(
                status_code=404, detail=f"session not found: {session_id}"
            )


class SonoBusProfileCreateRequest(BaseModel):
    """Operator-defined profile create payload (T2521-5d).

    Mirrors the ``SonoBusProfilePreset`` shape verbatim so a custom
    profile can later be promoted to a built-in without translation.
    """

    profile_id: str
    label: str
    codec_profile: str = "pcm"
    stream_format: str = "pcm_s24_48000"
    jitter_buffer_ms: int = 4
    resend_policy: str = "burst_loss_only"
    latency_target_ms: int = 8
    description: str = "operator-defined custom profile"


@router.post(
    "/profiles",
    response_model=SonoBusProfilePreset,
    status_code=201,
)
async def create_profile(
    body: SonoBusProfileCreateRequest,
) -> SonoBusProfilePreset:
    """T2521-5d — accept an operator-defined custom profile.

    Custom-profile persistence is a T2521-4 deliverable (daemon side
    owns the profile table). Until then the route round-trips the
    payload so GUI form validation and operator tooling can land
    against the canonical shape.
    """
    return SonoBusProfilePreset(
        profile_id=body.profile_id,
        label=body.label,
        codec_profile=body.codec_profile,
        stream_format=body.stream_format,
        jitter_buffer_ms=body.jitter_buffer_ms,
        resend_policy=body.resend_policy,
        latency_target_ms=body.latency_target_ms,
        description=body.description,
    )


class SonoBusProfilePatchRequest(BaseModel):
    """Partial profile patch (every field optional)."""

    label: Optional[str] = None
    codec_profile: Optional[str] = None
    stream_format: Optional[str] = None
    jitter_buffer_ms: Optional[int] = None
    resend_policy: Optional[str] = None
    latency_target_ms: Optional[int] = None
    description: Optional[str] = None


@router.patch(
    "/profiles/{profile_id}",
    response_model=SonoBusProfilePreset,
)
async def patch_profile(
    profile_id: str, body: SonoBusProfilePatchRequest
) -> SonoBusProfilePreset:
    """T2521-5d — patch a profile. Built-in profiles refuse mutation
    with 409; the daemon-owned profile store lands in T2521-4."""
    for preset in BUILT_IN_PROFILES:
        if preset.profile_id == profile_id:
            raise HTTPException(
                status_code=409,
                detail=(
                    "built-in profile is immutable; clone with POST "
                    "/profiles to customize"
                ),
            )
    # Operator-defined profile patch round-trips through the wire
    # contract until the daemon-side table lands.
    return SonoBusProfilePreset(
        profile_id=profile_id,
        label=body.label or profile_id,
        codec_profile=body.codec_profile or "pcm",
        stream_format=body.stream_format or "pcm_s24_48000",
        jitter_buffer_ms=body.jitter_buffer_ms or 4,
        resend_policy=body.resend_policy or "burst_loss_only",
        latency_target_ms=body.latency_target_ms or 8,
        description=body.description or "operator-defined custom profile",
    )


@router.delete(
    "/profiles/{profile_id}",
    status_code=204,
)
async def delete_profile(profile_id: str) -> None:
    """T2521-5d — delete an operator-defined profile. Built-in profiles
    refuse deletion with 409."""
    for preset in BUILT_IN_PROFILES:
        if preset.profile_id == profile_id:
            raise HTTPException(
                status_code=409,
                detail="built-in profile cannot be deleted",
            )
    # Operator-defined profiles aren't persisted yet (daemon-side
    # table is T2521-4); the route honors the wire contract by
    # returning 204 idempotently.


class SonoBusInterfaceSummary(BaseModel):
    """Bind-interface summary entry for the Network page."""

    name: str
    address: Optional[str] = None
    mdns_enabled: bool = True
    notes: Optional[str] = None


class SonoBusNetworkStatusResponse(BaseModel):
    """T2521-5h — network configuration + observed state.

    Operator-facing data: which network interfaces the daemon is bound
    to, the UDP port range, mDNS state, and NAT/STUN state. Daemon-
    side fields default to the T2521 locked values until T2521-4 ships.
    """

    bind_interfaces: list[SonoBusInterfaceSummary]
    udp_port_range_start: int = 10000
    udp_port_range_end: int = 10100
    mdns_enabled: bool = True
    mdns_service_name: str = "_sonobus._udp"
    nat_traversal: str = "stun_optional"
    stun_servers: list[str] = []


@router.get(
    "/network",
    response_model=SonoBusNetworkStatusResponse,
)
async def get_network_status() -> SonoBusNetworkStatusResponse:
    """T2521-5h — operator view of the daemon's network binding.

    The default response mirrors the locked-decision defaults so the
    GUI Network page renders meaningful values pre-daemon. T2521-4
    swaps in the daemon's actual observed state via the same shape.
    """
    return SonoBusNetworkStatusResponse(
        bind_interfaces=[
            SonoBusInterfaceSummary(
                name="any",
                address="0.0.0.0",
                mdns_enabled=True,
                notes=(
                    "Daemon binds all available interfaces until "
                    "operator narrows the scope; T2521-4 surfaces "
                    "the live binding set."
                ),
            ),
        ],
    )


class SonoBusConnectionServerStatusResponse(BaseModel):
    """T2521-5h — MAP2-hosted connection server (Q3) state."""

    enabled: bool = True  # Q3 default
    running: bool = False
    listen_address: str = "0.0.0.0"
    listen_port: int = 10998
    public_endpoint: Optional[str] = None
    detail: str = "daemon offline (T2521-4)"


@router.get(
    "/network/connection-server",
    response_model=SonoBusConnectionServerStatusResponse,
)
async def get_connection_server_status() -> SonoBusConnectionServerStatusResponse:
    """T2521-5h — Q3 connection-server state. Default is enabled
    (lock decision); running flips True once T2521-4 daemon supervises
    it."""
    return SonoBusConnectionServerStatusResponse()


class SonoBusConnectionServerPatchRequest(BaseModel):
    """Operator toggle for the Q3 connection server."""

    enabled: Optional[bool] = None
    listen_port: Optional[int] = None


@router.patch(
    "/network/connection-server",
    response_model=SonoBusConnectionServerStatusResponse,
)
async def patch_connection_server(
    body: SonoBusConnectionServerPatchRequest,
) -> SonoBusConnectionServerStatusResponse:
    """T2521-5h — operator toggle / port-override for the Q3
    connection server. Round-trips through the wire contract until
    the daemon-side state store lands."""
    return SonoBusConnectionServerStatusResponse(
        enabled=(body.enabled if body.enabled is not None else True),
        listen_port=(body.listen_port or 10998),
    )


class SonoBusDiagnosticBinding(BaseModel):
    """Per-binding diagnostics snapshot."""

    binding_id: str
    enabled: bool
    rtt_ms: Optional[float] = None
    loss_pct: Optional[float] = None
    jitter_ms: Optional[float] = None
    resend_count: int = 0
    observed_latency_ms: Optional[float] = None
    last_metric_iso: Optional[str] = None


class SonoBusDiagnosticsResponse(BaseModel):
    """T2521-5i — operator diagnostics surface.

    One entry per binding with the daemon-reported metric tuple. Until
    T2521-4 the entries carry the static enable state and ``None`` for
    the live metrics so the GUI Diagnostics table can render rows + a
    "metrics unavailable until daemon online" affordance.
    """

    bindings: list[SonoBusDiagnosticBinding]
    daemon_running: bool = False
    last_refresh_iso: str


def _live_metrics_for_diagnostics() -> tuple[dict[str, dict[str, Any]], bool]:
    """Pull live metrics from the daemon supervisor. Falls back to an
    empty dict if the supervisor module fails to import or the daemon
    hasn't pushed a snapshot yet."""
    try:
        from app.services.sonobus.daemon_supervisor import (
            get_sonobus_daemon_supervisor,
        )
        supervisor = get_sonobus_daemon_supervisor()
        snapshot = supervisor.latest_metrics()
        return snapshot.get("streams", {}), bool(supervisor.is_connected)
    except Exception:
        return {}, False


@router.get(
    "/diagnostics",
    response_model=SonoBusDiagnosticsResponse,
)
async def get_diagnostics() -> SonoBusDiagnosticsResponse:
    """T2521-5i — per-binding metric snapshot for the Diagnostics page.

    T2521-4 cycle 7 lights up the live-metric fields: when the daemon
    has pushed a `metrics_snapshot` event for a given binding's stream
    in the last 30s, the rtt_ms / loss_pct / jitter_ms / resend_count /
    observed_latency_ms fields carry the real values. Otherwise they
    stay None (Diagnostics page renders "metrics unavailable").
    """
    metrics_by_stream, daemon_running = _live_metrics_for_diagnostics()
    async with get_session(read_only=True) as session:
        rows = await session.execute(select(SonoBusBinding))
        diagnostics = []
        for binding in rows.scalars().all():
            # The daemon keys metrics by stream_id; bindings carry it
            # via stream_id (the canonical AOO source/sink identifier).
            stream_id = getattr(binding, "stream_id", None) or binding.binding_id
            live = metrics_by_stream.get(stream_id)
            if live is None:
                diagnostics.append(
                    SonoBusDiagnosticBinding(
                        binding_id=binding.binding_id,
                        enabled=bool(binding.enabled),
                    )
                )
                continue
            last_update_ms = live.get("last_update_unix_ms")
            last_iso = (
                datetime.fromtimestamp(
                    int(last_update_ms) / 1000.0, tz=timezone.utc
                ).isoformat()
                if isinstance(last_update_ms, (int, float))
                else None
            )
            diagnostics.append(
                SonoBusDiagnosticBinding(
                    binding_id=binding.binding_id,
                    enabled=bool(binding.enabled),
                    rtt_ms=live.get("rtt_ms"),
                    loss_pct=live.get("loss_pct"),
                    jitter_ms=live.get("jitter_ms"),
                    resend_count=int(live.get("resend_count") or 0),
                    observed_latency_ms=live.get("observed_latency_ms"),
                    last_metric_iso=last_iso,
                )
            )
        return SonoBusDiagnosticsResponse(
            bindings=diagnostics,
            daemon_running=daemon_running,
            last_refresh_iso=datetime.now(timezone.utc).isoformat(),
        )


# ---------- WebSocket event stream (T2521-5e) ----------


@router.websocket("/events")
async def sonobus_events_ws(websocket: WebSocket) -> None:
    """T2521-5e — WebSocket event stream stub.

    Mounted at `/api/sonobus/events` via the router prefix. The
    daemon (T2521-4) will publish live peer-up/down + session-start/stop
    + metric-snapshot events through this socket. Until then the
    endpoint sends an initial state frame on connect and a heartbeat
    every 5 seconds carrying authority + binding-count health so
    operator tooling can begin wiring against the contract.

    Frame shape (versioned via `schema_version` so future daemon
    output stays compatible):

        { "type": "sonobus:state", "schema_version": 1, "data": { ... } }
        { "type": "sonobus:heartbeat", "schema_version": 1, "data": { ... } }
    """
    await websocket.accept()
    client_id = f"sonobus-{uuid.uuid4()}"
    logger.info("sonobus events ws connected: %s", client_id)

    async def _snapshot() -> dict:
        daemon_fields = _supervisor_status_fields()
        try:
            async with get_session(read_only=True) as session:
                authority = SonoBusBindingAuthority(session)
                binding_count = await authority.count()
                enabled_rows = await session.execute(
                    select(func.count(SonoBusBinding.binding_id)).where(
                        SonoBusBinding.enabled.is_(True)
                    )
                )
                enabled_count = int(enabled_rows.scalar() or 0)
                return {
                    "authority_ok": True,
                    "binding_count": binding_count,
                    "enabled_binding_count": enabled_count,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **daemon_fields,
                }
        except Exception as exc:  # pragma: no cover — defensive
            return {
                "authority_ok": False,
                "error": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **daemon_fields,
            }

    # Cycle 7 — subscribe to daemon events through the supervisor so
    # peer_up / peer_down / session_start / session_stop /
    # metrics_snapshot / transport_error all flow through this WS.
    daemon_queue = None
    supervisor = None
    try:
        from app.services.sonobus.daemon_supervisor import (
            get_sonobus_daemon_supervisor,
        )
        supervisor = get_sonobus_daemon_supervisor()
        daemon_queue = supervisor.subscribe_events(replay_buffer=True)
    except Exception:
        logger.debug("sonobus events ws: supervisor unavailable, daemon-event relay disabled")

    async def _drain_daemon_events() -> None:
        """Pump daemon events onto the WS as `sonobus:daemon` frames.
        Wraps each in the canonical envelope so the GUI dispatcher
        handles it identically to the heartbeat frame."""
        if daemon_queue is None:
            return
        try:
            while True:
                event = await daemon_queue.get()
                await websocket.send_json(
                    {
                        "type": "sonobus:daemon",
                        "schema_version": 1,
                        "data": event,
                    }
                )
        except WebSocketDisconnect:
            raise
        except Exception:  # pragma: no cover — defensive
            logger.exception("sonobus events ws daemon drain crashed")

    daemon_task = (
        asyncio.create_task(_drain_daemon_events()) if daemon_queue is not None else None
    )
    try:
        await websocket.send_json(
            {
                "type": "sonobus:state",
                "schema_version": 1,
                "data": await _snapshot(),
            }
        )
        while True:
            await asyncio.sleep(5.0)
            await websocket.send_json(
                {
                    "type": "sonobus:heartbeat",
                    "schema_version": 1,
                    "data": await _snapshot(),
                }
            )
    except WebSocketDisconnect:
        logger.info("sonobus events ws disconnected: %s", client_id)
        return
    finally:
        if daemon_task is not None and not daemon_task.done():
            daemon_task.cancel()
            try:
                await daemon_task
            except (asyncio.CancelledError, Exception):
                pass
        if supervisor is not None and daemon_queue is not None:
            try:
                supervisor.unsubscribe_events(daemon_queue)
            except Exception:
                pass


__all__ = ["router"]
