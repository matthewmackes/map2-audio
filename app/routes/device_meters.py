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
    """
    registry = get_registry()
    rows = registry.list_devices()
    entries: List[DeviceRegistryEntry] = []
    for row in rows:
        snapshot: Optional[DeviceRegistrySnapshot] = None
        if include_snapshot:
            snap = await registry.read_snapshot(row.device_id)
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
