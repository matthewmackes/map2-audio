"""JuceEngineMeterSource — concrete meter-source adapter for the C++
engine's per-device peak-buffer IPC.

Pivot-13c cycle 1 / Order-1 #1 of the pivot-13b handoff.

Background
----------
``DeviceMeterSourceRegistry`` (T2519, tenth-run cycle 2) lets every
device install one swappable ``MeterSource`` implementation. Until
this commit the only concrete source has been ``PlaceholderMeterSource``,
which emits ``SILENCE_DBFS`` on every channel — operators see the
device's wire-up state as "Awaiting engine wire-up" in every Devices
panel.

This module lands the seam the engine's per-device peak-buffer IPC
will plug into. The C++ side has not yet exposed the IPC, so the
adapter takes any callable that returns a ``RawPeakBuffer`` payload.
Tests inject a fake ring-buffer reader; production wiring (when the
C++ surface lands) constructs a reader bound to the engine's shared
memory ring.

Contract
--------
A ``RawPeakBuffer`` carries:

  - ``input_peak_db: Sequence[float]`` — per-channel peak in dBFS for
    the input direction.
  - ``output_peak_db: Sequence[float]`` — per-channel peak in dBFS
    for the output direction.
  - ``captured_at: Optional[float]`` — unix timestamp the engine
    stamped at sample-buffer commit time. When ``None`` the
    ``DeviceMeterSourceRegistry.read_snapshot`` helper backfills the
    field with wall-clock time on read (pivot-13b cycle 1).

The reader callable can be sync (returns ``RawPeakBuffer``) or async
(returns an awaitable yielding ``RawPeakBuffer``). ``snapshot()``
follows the same awaitable-aware pattern the registry already uses.

Channel-count truncation
------------------------
The engine may publish a wider buffer than the device's declared
channel count (e.g. an over-allocated ring sized for the maximum
supported device width). Conversely, an under-published buffer (after
a reconfigure that hasn't propagated yet) must not surface garbage.
The adapter:

  - Truncates each direction to the declared count when the reader
    returns *more* values.
  - Pads with ``SILENCE_DBFS`` when the reader returns *fewer* values.

Failure mode
------------
If the reader raises, the adapter logs at WARN and returns a
silence-shaped snapshot tagged ``source="engine_unavailable"``. Routes
and panels distinguish this from ``"placeholder"`` so an operator can
tell the engine wire-up is installed but currently failing — versus
no wire-up at all.
"""

from __future__ import annotations

import inspect
import logging
import time
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Optional, Sequence, Union

from app.services.devices._meter_source import (
    MeterSnapshot,
    SILENCE_DBFS,
)

logger = logging.getLogger(__name__)

__all__ = [
    "RawPeakBuffer",
    "JuceEngineMeterSource",
    "RingBufferReader",
]


@dataclass(frozen=True)
class RawPeakBuffer:
    """Snapshot of the engine's per-device peak buffer.

    Shape is intentionally loose (``Sequence[float]``) so a future C++
    binding can hand back a ``memoryview`` of native ``float`` without
    copying. The adapter materializes to ``list[float]`` only when
    constructing the ``MeterSnapshot`` the route layer serializes.
    """

    input_peak_db: Sequence[float] = field(default_factory=tuple)
    output_peak_db: Sequence[float] = field(default_factory=tuple)
    captured_at: Optional[float] = None


# Reader can be sync or async — ``snapshot()`` handles either.
RingBufferReader = Callable[
    [], Union[RawPeakBuffer, Awaitable[RawPeakBuffer]]
]


def _fit_channels(values: Sequence[float], count: int) -> list[float]:
    """Pad with ``SILENCE_DBFS`` or truncate so the list matches the
    declared channel count.

    ``count`` is the device's canonical declared count (passed in by
    the facade module at construction). The padding sentinel is the
    same ``-150.0 dBFS`` value every Devices panel renders as an
    em-dash, so a partially-published buffer doesn't leak into a
    visible "0 dBFS" mis-render.
    """
    if count < 0:
        count = 0
    materialized: list[float] = []
    for idx in range(count):
        if idx < len(values):
            value = float(values[idx])
        else:
            value = SILENCE_DBFS
        materialized.append(value)
    return materialized


class JuceEngineMeterSource:
    """Concrete ``MeterSource`` reading from the engine's peak buffer.

    Constructed with the device's declared channel counts plus a
    reader callable. The reader is owned by the caller (typically the
    device facade at engine-bind time) and is responsible for keeping
    the underlying ring-buffer mapping alive.

    Instances are cheap; tests construct one per assertion. Production
    code constructs a single instance per device at engine-bind time
    and installs it via the facade's ``set_active_meter_source``.
    """

    def __init__(
        self,
        *,
        input_channels: int,
        output_channels: int,
        reader: RingBufferReader,
    ) -> None:
        self._input_channels = int(input_channels)
        self._output_channels = int(output_channels)
        self._reader = reader

    def snapshot(self) -> Union[MeterSnapshot, Awaitable[MeterSnapshot]]:
        """Read one peak buffer and project it onto ``MeterSnapshot``.

        Mirrors the awaitable-aware contract of ``MeterSource.snapshot``
        so the registry's ``read_snapshot`` helper can await us
        uniformly. Sync readers produce a sync return; async readers
        produce a coroutine.
        """
        try:
            result = self._reader()
        except Exception as exc:
            logger.warning(
                "JuceEngineMeterSource: reader raised; surfacing engine_unavailable snapshot: %s",
                exc,
            )
            return self._unavailable_snapshot()
        if inspect.isawaitable(result):
            return self._await_and_project(result)
        return self._project(result)

    async def _await_and_project(
        self, awaitable: Awaitable[RawPeakBuffer]
    ) -> MeterSnapshot:
        try:
            raw = await awaitable
        except Exception as exc:
            logger.warning(
                "JuceEngineMeterSource: async reader raised; surfacing engine_unavailable snapshot: %s",
                exc,
            )
            return self._unavailable_snapshot()
        return self._project(raw)

    def _project(self, raw: RawPeakBuffer) -> MeterSnapshot:
        captured_at = raw.captured_at
        # Stamp wall-clock when the engine didn't supply a timestamp.
        # The registry would backfill this anyway, but doing it here
        # means the adapter's own stamp survives any future code path
        # that bypasses the registry (e.g. direct calls in tests).
        if captured_at is None:
            captured_at = time.time()
        return MeterSnapshot(
            input_peak_db=_fit_channels(raw.input_peak_db, self._input_channels),
            output_peak_db=_fit_channels(raw.output_peak_db, self._output_channels),
            source="engine",
            captured_at=captured_at,
        )

    def _unavailable_snapshot(self) -> MeterSnapshot:
        """Silence-shaped snapshot tagged as engine_unavailable.

        Distinguishes "engine wire-up installed but reader failed
        right now" from "no wire-up at all". Routes serialize
        ``source`` as-is so the Devices panel can render a red tag
        for ``engine_unavailable`` vs warm-gray for ``placeholder``.
        """
        return MeterSnapshot(
            input_peak_db=[SILENCE_DBFS] * self._input_channels,
            output_peak_db=[SILENCE_DBFS] * self._output_channels,
            source="engine_unavailable",
            captured_at=time.time(),
        )
