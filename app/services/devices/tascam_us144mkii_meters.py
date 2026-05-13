"""T2515-Follow-up-METER-WIRE — Tascam US-144MKII meter source facade.

The ``/api/v1/devices/tascam-us144mkii/meters`` route returns a
``MeterPayload`` with per-channel peak dBFS values. Until the JUCE
engine's per-device ring-buffer metering is wired through, the route
returns silence-sentinel values (-150 dBFS) so the Carbon panel
renders the structure cleanly.

This module is the **Tascam-specific facade** on top of the generic
``_meter_source`` registry primitive (tenth Continue run, order-2). It
preserves the exact public API the route + tests have been using since
run 9:

  - ``MeterSnapshot``, ``TascamMeterSource``, ``PlaceholderMeterSource``,
    ``SILENCE_DBFS`` re-exported from the registry.
  - ``set_active_meter_source`` / ``get_active_meter_source`` /
    ``reset_active_meter_source`` / ``read_snapshot`` bind the
    Tascam-specific ``device_id`` so callers stay one-liner.

When the C++ binding for per-device peak ring buffers lands, the only
edit will be to register a ``JuceEngineMeterSource`` at lifespan
startup via ``set_active_meter_source(...)``.
"""

from __future__ import annotations

from typing import Optional

from app.services.devices._meter_source import (
    MeterSnapshot,
    MeterSource as TascamMeterSource,  # re-exported under the legacy alias
    PlaceholderMeterSource,
    SILENCE_DBFS,
    get_registry,
)

__all__ = [
    "DEVICE_ID",
    "MeterSnapshot",
    "TascamMeterSource",
    "PlaceholderMeterSource",
    "SILENCE_DBFS",
    "set_active_meter_source",
    "get_active_meter_source",
    "reset_active_meter_source",
    "read_snapshot",
]


DEVICE_ID = "tascam-us144mkii"

# Canonical channel layout — kept in sync with the device-pack profile
# and the route's TASCAM_US144MKII constants. 2 analog + 2 S/PDIF in
# both directions.
_DEFAULT_INPUT_CHANNELS = 4
_DEFAULT_OUTPUT_CHANNELS = 4


# Register the device with the global meter-source registry at import
# time. Idempotent — a re-import will preserve any installed source.
get_registry().register_device(
    DEVICE_ID,
    input_channels=_DEFAULT_INPUT_CHANNELS,
    output_channels=_DEFAULT_OUTPUT_CHANNELS,
)


def set_active_meter_source(source: Optional[TascamMeterSource]) -> None:
    """Install a meter source for the Tascam route to read from.

    Passing ``None`` clears the override and restores the default
    placeholder behavior on the next route call.
    """
    get_registry().set_active_source(DEVICE_ID, source)


def get_active_meter_source() -> TascamMeterSource:
    """Return the currently-installed source, or a fresh placeholder.

    The default is constructed lazily on each call so test isolation
    works — a test that installs a fake doesn't leave a long-lived
    placeholder instance dangling between cases.
    """
    return get_registry().get_active_source(DEVICE_ID)


def reset_active_meter_source() -> None:
    """Convenience helper for test teardown."""
    get_registry().reset_active_source(DEVICE_ID)


async def read_snapshot() -> MeterSnapshot:
    """Resolve the active source's ``snapshot()`` to a concrete value.

    Awaitable-aware: synchronous sources return ``MeterSnapshot``
    directly; async sources return a coroutine the route awaits.
    Centralizing this lets the route handler stay one line.
    """
    return await get_registry().read_snapshot(DEVICE_ID)
