"""Edirol UA-1000 meter source facade (tenth Continue run, order-2 follow-on).

The UA-1000 doesn't have a per-device meter HTTP route yet — the
existing UA-1000 Devices panel reads from the platform-wide metering
broadcast. But the registry primitive shipped in the same run wants
**every** audio interface declared at import time so future per-device
meter routes (or a unified ``/api/v1/devices/<id>/meters`` shape) can
adopt the same plumbing without re-introducing per-device singleton
seams.

This facade binds the UA-1000's canonical 10-in / 10-out layout to the
shared registry and re-exports the same one-liner helpers the Tascam
facade uses. The route side will be filed under a separate
operator-gated task; this file is the backend-only prep.
"""

from __future__ import annotations

from typing import Optional

from app.services.devices._meter_source import (
    MeterSnapshot,
    MeterSource,
    PlaceholderMeterSource,
    SILENCE_DBFS,
    get_registry,
)
from app.services.juce.common import EDIROL_UA1000

__all__ = [
    "DEVICE_ID",
    "MeterSnapshot",
    "MeterSource",
    "PlaceholderMeterSource",
    "SILENCE_DBFS",
    "set_active_meter_source",
    "get_active_meter_source",
    "reset_active_meter_source",
    "read_snapshot",
]


DEVICE_ID = "edirol-ua-1000"


get_registry().register_device(
    DEVICE_ID,
    input_channels=int(EDIROL_UA1000["input_channels"]),
    output_channels=int(EDIROL_UA1000["output_channels"]),
)


def set_active_meter_source(source: Optional[MeterSource]) -> None:
    get_registry().set_active_source(DEVICE_ID, source)


def get_active_meter_source() -> MeterSource:
    return get_registry().get_active_source(DEVICE_ID)


def reset_active_meter_source() -> None:
    get_registry().reset_active_source(DEVICE_ID)


async def read_snapshot() -> MeterSnapshot:
    return await get_registry().read_snapshot(DEVICE_ID)
