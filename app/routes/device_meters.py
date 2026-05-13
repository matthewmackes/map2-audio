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

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Importing the facade modules forces their import-time registration
# call to run, so the registry knows about every device even if no
# request ever names them.
from app.services.devices import (
    edirol_ua1000_meters,  # noqa: F401 — import for registration side-effect
    hotone_jogg_meters,  # noqa: F401 — import for registration side-effect
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
    )
