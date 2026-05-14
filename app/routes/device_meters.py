"""Generic per-device meter route.

GET /api/v1/devices/{device_id}/meters

Reads through the ``DeviceMeterSourceRegistry`` shipped in the tenth
Continue run. Every device that imports its facade module (e.g.
``tascam_us144mkii_meters``, ``edirol_ua1000_meters``,
``hotone_jogg_meters``) auto-registers at module-import time, and a
single generic handler can serve all of them.

Coexistence policy: the legacy per-device route
``/api/v1/devices/tascam-us144mkii/meters`` (shipped in run 8) stays
in place so existing clients don't break. The new generic route is
the supported entry point for future devices.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Importing the facade modules forces their import-time registration
# call to run, so the registry knows about every device even if no
# request ever names them.
from app.services.devices import (
    edirol_ua1000_meters,  # noqa: F401 — import for registration side-effect
    hotone_jogg_meters,  # noqa: F401 — import for registration side-effect
    lexicon_mpx1_meters,  # noqa: F401 — import for registration side-effect
    tascam_us144mkii_meters,  # noqa: F401 — import for registration side-effect
)
from app.services.devices._meter_source import get_registry


router = APIRouter(
    prefix="/api/v1/devices",
    tags=["Device Meters (generic)"],
)


class GenericMeterPayload(BaseModel):
    """Per-channel peak dBFS for any registered device.

    Channel indexing is device-specific — consumers should pair this
    with the device's capabilities response to know which index is
    analog vs. digital.
    """

    device_id: str
    input_peak_db: List[float]
    output_peak_db: List[float]
    source: str = Field(
        ...,
        description=(
            "How the values were obtained. One of: 'engine', 'placeholder'. "
            "Operators reading 'placeholder' should treat them as 'not yet measured'."
        ),
    )
    captured_at: Optional[float] = Field(
        None,
        description=(
            "Unix timestamp (seconds since epoch, float) when the source "
            "produced the snapshot. Backfilled by the registry when the "
            "underlying source does not stamp it. Order-2 of the eleventh "
            "Continue run handoff."
        ),
    )


class DeviceRegistrySnapshot(BaseModel):
    """Inline snapshot for ``include_snapshot=true`` requests.

    Carries the same shape as ``GenericMeterPayload`` minus the echo
    of ``device_id`` (the parent entry already has it).
    """

    input_peak_db: List[float]
    output_peak_db: List[float]
    source: str
    captured_at: Optional[float] = None


class DeviceRegistryEntry(BaseModel):
    """One row in the peak-meters registry enumeration."""

    device_id: str
    input_channels: int
    output_channels: int
    has_engine_source: bool
    snapshot: Optional[DeviceRegistrySnapshot] = Field(
        None,
        description=(
            "Inline peak-meter snapshot. Only populated when the "
            "request includes ``include_snapshot=true``."
        ),
    )


class DeviceRegistryResponse(BaseModel):
    """Top-level shape for the registry enumeration route.

    UIs that need to render every device's meter-source state at once
    can call this single endpoint instead of polling per-device. The
    ``devices`` list is alphabetically ordered for deterministic
    enumeration.
    """

    devices: List[DeviceRegistryEntry]


@router.get("/peak-meters/registry", response_model=DeviceRegistryResponse)
async def get_peak_meters_registry(
    include_snapshot: bool = Query(
        False,
        description=(
            "When true, inline the current peak-meter snapshot for "
            "every device so a one-shot enumeration covers both "
            "the wire-up state and the latest reading."
        ),
    ),
) -> DeviceRegistryResponse:
    """Enumerate every device registered with the meter-source registry.

    Returned in alphabetical order by ``device_id``. Each entry carries
    the device's declared channel counts and a ``has_engine_source``
    flag indicating whether the engine wire-up is currently installed
    (vs the silence-fallback placeholder).

    When called with ``include_snapshot=true``, each entry's
    ``snapshot`` field is populated with the same peak-meter payload
    served by ``GET /{device_id}/peak-meters``. This collapses the
    common dashboard pattern (registry + N per-device polls) into a
    single request.

    The path lives under the ``/api/v1/devices`` prefix and uses the
    ``peak-meters/registry`` segment so it does not collide with the
    parametric ``/{device_id}/peak-meters`` route below. FastAPI's
    matcher tries literal segments first, so this stays unambiguous.

    Pivot-13e cycle 2 — when ``include_snapshot`` is true, the
    per-device ``read_snapshot`` calls run concurrently via
    ``asyncio.gather`` instead of sequentially. For a registry of N
    devices where each source is async (engine IPC), total latency
    drops from N×t to roughly t. The result list is keyed back by
    device_id before assembly so the returned ``devices`` field
    preserves the alphabetical ordering ``list_devices()`` already
    enforces.
    """
    import asyncio

    registry = get_registry()
    rows = registry.list_devices()

    snapshots_by_device: dict[str, "object"] = {}
    if include_snapshot and rows:
        device_ids = [row.device_id for row in rows]
        snaps = await asyncio.gather(
            *(registry.read_snapshot(device_id) for device_id in device_ids)
        )
        snapshots_by_device = dict(zip(device_ids, snaps))

    entries: List[DeviceRegistryEntry] = []
    for row in rows:
        snapshot: Optional[DeviceRegistrySnapshot] = None
        if include_snapshot:
            snap = snapshots_by_device[row.device_id]
            snapshot = DeviceRegistrySnapshot(
                input_peak_db=list(snap.input_peak_db),
                output_peak_db=list(snap.output_peak_db),
                source=snap.source,
                captured_at=snap.captured_at,
            )
        entries.append(
            DeviceRegistryEntry(
                device_id=row.device_id,
                input_channels=row.input_channels,
                output_channels=row.output_channels,
                has_engine_source=row.has_engine_source,
                snapshot=snapshot,
            ),
        )
    return DeviceRegistryResponse(devices=entries)


@router.get("/{device_id}/peak-meters", response_model=GenericMeterPayload)
async def get_device_peak_meters(device_id: str) -> GenericMeterPayload:
    """Generic per-device peak-meter readout.

    Returns a structured payload identical to the per-device legacy
    routes; the only differences are the URL shape and the inclusion
    of the ``device_id`` echo so a single frontend hook can call this
    for any registered audio interface.

    The path segment is ``/peak-meters`` (not ``/meters``) to avoid
    colliding with the legacy ``/api/v1/devices/tascam-us144mkii/meters``
    route — they share the ``/api/v1/devices`` prefix, and FastAPI's
    path matcher would otherwise treat ``/tascam-us144mkii/meters`` as
    a candidate for both the literal and the parameter route. The
    explicit ``peak-meters`` segment makes the two endpoints
    unambiguous and gives the generic route a name that reads cleanly
    next to ``/status`` / ``/capabilities``.
    """
    registry = get_registry()
    try:
        snap = await registry.read_snapshot(device_id)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "device_not_registered",
                    "message": str(exc),
                    "details": None,
                }
            },
        )
    return GenericMeterPayload(
        device_id=device_id,
        input_peak_db=list(snap.input_peak_db),
        output_peak_db=list(snap.output_peak_db),
        source=snap.source,
        captured_at=snap.captured_at,
    )


# ---------- Cluster fan-out (run-13f cycle 1) ----------


class ClusterDeviceRegistryPeer(BaseModel):
    """One peer's slice of the cluster device-meter registry.

    Mirrors the AVB/SonoBus per-peer fan-out shape. ``health`` is sourced
    from `NodeHealthService` and baked in so the frontend doesn't need a
    second fetch.
    """

    node_id: str
    hostname: str
    devices: List[DeviceRegistryEntry]
    health: str = "offline"


class ClusterDeviceRegistryResponse(BaseModel):
    """Cluster-wide aggregation of every peer's
    `GET /api/v1/devices/peak-meters/registry`. Local registry kept
    under ``local``; per-peer slices under ``peers``; failed peers
    populate ``errors`` keyed by ``node_id``.

    Mirrors `AvbClusterBindingsMatrixResponse` /
    `SonoBusClusterBindingsMatrixResponse`.
    """

    local: DeviceRegistryResponse
    peers: List[ClusterDeviceRegistryPeer]
    errors: dict[str, str]


async def _fetch_peer_device_registry(
    *,
    node_id: str,
    hostname: str,
    api_url: str,
    timeout_s: float,
    include_snapshot: bool,
    health: str = "offline",
) -> tuple[Optional[ClusterDeviceRegistryPeer], Optional[str]]:
    """Single-peer fetch helper. Returns (peer_or_none, error_or_none).

    Mirrors `_fetch_peer_avb_matrix`. Each peer request is bounded by
    ``timeout_s`` so a slow peer never holds the cluster registry.
    """
    import httpx

    suffix = "?include_snapshot=true" if include_snapshot else ""
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(
                f"{api_url}/api/v1/devices/peak-meters/registry{suffix}"
            )
            if response.status_code != 200:
                return None, f"http {response.status_code}"
            payload = response.json()
            devices = [
                DeviceRegistryEntry(**entry) for entry in payload.get("devices", [])
            ]
            return (
                ClusterDeviceRegistryPeer(
                    node_id=node_id,
                    hostname=hostname,
                    devices=devices,
                    health=health,
                ),
                None,
            )
    except Exception as exc:
        return None, str(exc)


@router.get(
    "/peak-meters/cluster/registry",
    response_model=ClusterDeviceRegistryResponse,
)
async def get_cluster_peak_meters_registry(
    include_snapshot: bool = Query(
        False,
        description=(
            "When true, propagate include_snapshot=true to every peer "
            "fetch so the response carries inline snapshots for every "
            "device across the cluster. Wallclock stays close to the "
            "slowest single peer because all peer fetches run "
            "concurrently."
        ),
    ),
) -> ClusterDeviceRegistryResponse:
    """Cluster-wide aggregation of every peer's
    `GET /api/v1/devices/peak-meters/registry`.

    All peer requests issue concurrently via ``asyncio.gather`` with a
    2 s per-peer timeout. Failed peers populate ``errors`` but don't
    fail the whole request. Local node's registry is returned under
    ``local`` so consumers always have a baseline even when discovery
    is empty.

    Run-13f cycle 1 of the pivot-13e handoff.
    """
    import asyncio

    local = await get_peak_meters_registry(include_snapshot=include_snapshot)

    try:
        from app.services.node_discovery_service import (
            get_node_discovery_service,
        )

        discovery = get_node_discovery_service()
        peer_records = await discovery._load_peer_records()
    except Exception as exc:
        logger.debug("cluster peak-meters: peer discovery unavailable: %s", exc)
        peer_records = []

    if not peer_records:
        return ClusterDeviceRegistryResponse(local=local, peers=[], errors={})

    try:
        from app.services.node_health_service import get_node_health_service

        health_service = get_node_health_service()

        async def _peer_health(peer):
            try:
                health = await health_service.get_remote_health(peer.host)
                return getattr(health, "status", "offline")
            except Exception:
                return "offline"

        healths = await asyncio.gather(
            *(_peer_health(p) for p in peer_records), return_exceptions=False
        )
    except Exception:
        healths = ["offline"] * len(peer_records)

    fetch_tasks = [
        _fetch_peer_device_registry(
            node_id=peer.node_id,
            hostname=peer.hostname,
            api_url=peer.api_url or f"http://{peer.host}:8080",
            timeout_s=2.0,
            include_snapshot=include_snapshot,
            health=health,
        )
        for peer, health in zip(peer_records, healths)
    ]
    results = await asyncio.gather(*fetch_tasks, return_exceptions=False)

    peers: list[ClusterDeviceRegistryPeer] = []
    errors: dict[str, str] = {}
    for peer, (peer_or_none, err_or_none) in zip(peer_records, results):
        if peer_or_none is not None:
            peers.append(peer_or_none)
        if err_or_none is not None:
            errors[peer.node_id] = err_or_none

    return ClusterDeviceRegistryResponse(local=local, peers=peers, errors=errors)


# ---------- WebSocket streaming surface (Pick-1 of eleventh-run handoff) ----------


# Module-level so tests can patch the cadence cheaply.
WS_BROADCAST_INTERVAL_SECONDS = 1.0 / 30.0  # 30 fps target


def _parse_device_ids_query(raw: Optional[str]) -> Optional[set[str]]:
    """Parse a ``?device_ids=a,b,c`` query value into a filter set.

    Returns ``None`` for an absent / empty filter (means "no filter,
    fan-out all devices"). Whitespace and empty segments are tolerated.
    Pivot-13c cycle 2.
    """
    if raw is None:
        return None
    cleaned = {part.strip() for part in raw.split(",") if part.strip()}
    if not cleaned:
        return None
    return cleaned


@router.websocket("/peak-meters/stream")
async def stream_peak_meters(websocket: WebSocket) -> None:
    """WebSocket fan-out of the peak-meters registry.

    Replaces the 5 s polled overview with a server-pushed 30 fps stream.
    Frame envelope is versioned via ``schema_version`` so consumers can
    expand it without breaking older operator tooling.

    Frame shape:

        {
            "type": "device_peak_meters:registry",
            "schema_version": 1,
            "data": {
                "devices": [
                    {
                        "device_id": "edirol-ua-1000",
                        "input_channels": 10,
                        "output_channels": 10,
                        "has_engine_source": false,
                        "snapshot": {
                            "input_peak_db": [...],
                            "output_peak_db": [...],
                            "source": "placeholder",
                            "captured_at": 1715731200.0
                        }
                    },
                    ...
                ]
            }
        }

    Optional query filter ``?device_ids=tascam-us144mkii,edirol-ua-1000``
    restricts the frame to the listed devices (pivot-13c cycle 2).
    Unknown IDs in the filter set are silently ignored so a panel
    consuming a stale device list can't break the stream. The frame
    preserves alphabetical order over the filtered subset.

    The default 30 fps cadence matches the MAP2 metering broadcast
    floor documented in ``CLAUDE.md`` § Service Polling Floors. Tests
    that need a faster tick patch ``WS_BROADCAST_INTERVAL_SECONDS``.
    """
    await websocket.accept()
    client_id = f"device-meters-{uuid.uuid4()}"
    logger.info("device meters ws connected: %s", client_id)

    raw_filter = websocket.query_params.get("device_ids")
    device_filter = _parse_device_ids_query(raw_filter)

    async def _snapshot_frame() -> dict:
        registry = get_registry()
        rows = registry.list_devices()
        device_payloads: list[dict] = []
        for row in rows:
            if device_filter is not None and row.device_id not in device_filter:
                continue
            try:
                snap = await registry.read_snapshot(row.device_id)
            except Exception as exc:  # pragma: no cover — defensive
                logger.debug(
                    "device meters ws: snapshot %s failed: %s",
                    row.device_id,
                    exc,
                )
                continue
            device_payloads.append(
                {
                    "device_id": row.device_id,
                    "input_channels": row.input_channels,
                    "output_channels": row.output_channels,
                    "has_engine_source": row.has_engine_source,
                    "snapshot": {
                        "input_peak_db": list(snap.input_peak_db),
                        "output_peak_db": list(snap.output_peak_db),
                        "source": snap.source,
                        "captured_at": snap.captured_at,
                    },
                }
            )
        return {
            "type": "device_peak_meters:registry",
            "schema_version": 1,
            "data": {"devices": device_payloads},
        }

    try:
        # Initial state immediately on connect — the consumer never has
        # to wait an interval to render its first row.
        await websocket.send_json(await _snapshot_frame())
        while True:
            await asyncio.sleep(WS_BROADCAST_INTERVAL_SECONDS)
            await websocket.send_json(await _snapshot_frame())
    except WebSocketDisconnect:
        logger.info("device meters ws disconnected: %s", client_id)
        return


# ---------- Cluster WebSocket streaming surface (run-13g cycle 3) ----------


# Cluster fan-in cadence is slower than the local 30 fps stream because
# every tick triggers N peer fetches over HTTP. 5 fps keeps the cluster
# overview responsive without saturating the cross-node link.
CLUSTER_WS_BROADCAST_INTERVAL_SECONDS = 0.2  # 5 fps default


@router.websocket("/peak-meters/cluster/stream")
async def stream_cluster_peak_meters(websocket: WebSocket) -> None:
    """WebSocket fan-in of every peer's `/peak-meters/registry`.

    Cluster analogue of the local /peak-meters/stream endpoint. Each
    tick computes a fresh cluster registry snapshot (local + every
    discovered peer, fanned out via asyncio.gather) and pushes it as
    a versioned frame.

    Frame envelope:

        {
            "type": "device_peak_meters:cluster_registry",
            "schema_version": 1,
            "data": {
                "local": { "devices": [...] },
                "peers": [...],
                "errors": { "node_id": "http 504" }
            }
        }

    Default cadence: 5 fps (slower than the local 30 fps stream
    because every tick triggers per-peer HTTP fetches). Override the
    module-level CLUSTER_WS_BROADCAST_INTERVAL_SECONDS in tests.

    `?include_snapshot=true` propagates to every peer fetch so the
    response carries inline per-device snapshots — useful for
    cluster dashboards that want to render Peak columns. Run-13g
    cycle 3 of the run-13f handoff.
    """
    await websocket.accept()
    client_id = f"cluster-device-meters-{uuid.uuid4()}"
    logger.info("cluster device meters ws connected: %s", client_id)

    include_snapshot_raw = websocket.query_params.get("include_snapshot")
    include_snapshot = include_snapshot_raw == "true" if include_snapshot_raw else False

    # Run-13i cycle 2 — node_ids filter. Reuses the same comma-list
    # parsing as device_ids on the local stream. `"local"` is a
    # reserved keyword that includes the local node's slice; any
    # other entry is matched against peer.node_id. Unknown IDs are
    # silently dropped — the caller's stale node list can't break
    # the stream.
    node_ids_raw = websocket.query_params.get("node_ids")
    node_filter = _parse_device_ids_query(node_ids_raw)
    include_local = node_filter is None or "local" in node_filter

    async def _snapshot_frame() -> dict:
        try:
            payload = await get_cluster_peak_meters_registry(
                include_snapshot=include_snapshot,
            )
            data = payload.model_dump()
            if node_filter is not None:
                if not include_local:
                    data["local"] = {"devices": []}
                data["peers"] = [
                    peer
                    for peer in data.get("peers", [])
                    if peer.get("node_id") in node_filter
                    or peer.get("hostname") in node_filter
                ]
                # Trim errors to peers actually requested so consumers
                # don't see a sea of irrelevant unreachable peers.
                data["errors"] = {
                    node_id: err
                    for node_id, err in data.get("errors", {}).items()
                    if node_id in node_filter or node_id == "@local"
                }
            return {
                "type": "device_peak_meters:cluster_registry",
                "schema_version": 1,
                "data": data,
            }
        except Exception as exc:  # pragma: no cover — defensive
            logger.debug(
                "cluster device meters ws: snapshot failed: %s", exc
            )
            return {
                "type": "device_peak_meters:cluster_registry",
                "schema_version": 1,
                "data": {
                    "local": {"devices": []},
                    "peers": [],
                    "errors": {"@local": str(exc)},
                },
            }

    try:
        # Initial state on connect so the consumer never has to wait
        # a full interval before rendering.
        await websocket.send_json(await _snapshot_frame())
        while True:
            await asyncio.sleep(CLUSTER_WS_BROADCAST_INTERVAL_SECONDS)
            await websocket.send_json(await _snapshot_frame())
    except WebSocketDisconnect:
        logger.info(
            "cluster device meters ws disconnected: %s", client_id
        )
        return
