"""Lexicon MPX-1 meter source facade (tenth Continue run, order-2 follow-on).

The MPX-1 is a stereo hardware-bridge effects processor (one of the
T2517 effects-chooser block types). Audio enters via the host
interface's send pair and returns through the host interface's
return pair, so the MPX-1's "meter" surface is two channels in and
two channels out per active instance.

Singleton policy: only one physical MPX-1 may be active at a time
(enforced by ``app/services/effects/hardware_singleton_lock.py``), so
this facade declares a single device entry. A future
multi-MPX-1 setup would need a per-instance keying scheme; for now
the singleton constraint keeps the shape identical to every other
audio interface facade.
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


DEVICE_ID = "lexicon-mpx1"

# MPX-1 is stereo on both connection types (AES preferred, S/PDIF
# fallback per T2517-2). The Carbon panel reads channels 0/1 as L/R
# return + 0/1 as L/R send.
_INPUT_CHANNELS = 2
_OUTPUT_CHANNELS = 2


get_registry().register_device(
    DEVICE_ID,
    input_channels=_INPUT_CHANNELS,
    output_channels=_OUTPUT_CHANNELS,
)


def set_active_meter_source(source: Optional[MeterSource]) -> None:
    get_registry().set_active_source(DEVICE_ID, source)


def get_active_meter_source() -> MeterSource:
    return get_registry().get_active_source(DEVICE_ID)


def reset_active_meter_source() -> None:
    get_registry().reset_active_source(DEVICE_ID)


async def read_snapshot() -> MeterSnapshot:
    return await get_registry().read_snapshot(DEVICE_ID)
