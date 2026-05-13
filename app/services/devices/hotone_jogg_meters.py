"""Hotone JoGG meter source facade (tenth Continue run, order-2 follow-on).

Mirror of the Edirol UA-1000 facade. The JoGG's existing Devices panel
reads from the platform-wide metering broadcast; this file declares
the device with the shared registry so a future per-device meter
route can adopt the same seam without a parallel singleton.

Canonical layout is 2-in / 2-out (mono + mono USB audio class device).
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
from app.services.juce.common import HOTONE_JOGG

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


DEVICE_ID = "hotone-jogg"


get_registry().register_device(
    DEVICE_ID,
    input_channels=int(HOTONE_JOGG["input_channels"]),
    output_channels=int(HOTONE_JOGG["output_channels"]),
)


def set_active_meter_source(source: Optional[MeterSource]) -> None:
    get_registry().set_active_source(DEVICE_ID, source)


def get_active_meter_source() -> MeterSource:
    return get_registry().get_active_source(DEVICE_ID)


def reset_active_meter_source() -> None:
    get_registry().reset_active_source(DEVICE_ID)


async def read_snapshot() -> MeterSnapshot:
    return await get_registry().read_snapshot(DEVICE_ID)
