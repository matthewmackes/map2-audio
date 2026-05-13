"""T2515-Follow-up-METER-WIRE — Tascam US-144MKII meter source seam.

The ``/api/v1/devices/tascam-us144mkii/meters`` route returns a
``MeterPayload`` with per-channel peak dBFS values. Until the JUCE
engine's per-device ring-buffer metering is wired through, the route
returns silence-sentinel values (-150 dBFS) so the Carbon panel
renders the structure cleanly.

This module defines the injection seam that a future
``JuceEngineMeterSource`` (consuming the engine's lock-free ring) can
plug into without touching the route handler. The pattern matches the
looper / recorder / midi-hub injection conventions used elsewhere in
the platform:

  - ``TascamMeterSource`` protocol-style ABC carries a single
    ``snapshot() -> MeterSnapshot`` method. Implementations are free
    to be sync or async; the route awaits it through ``maybe_await``.
  - ``PlaceholderMeterSource`` is the default — same values the route
    handler used to inline, but now centralized for easy swapping.
  - ``set_active_meter_source()`` / ``get_active_meter_source()`` form
    the singleton seam. Lifespan startup can install an engine-backed
    source; tests can install a deterministic fake.

The split keeps the route handler thin (single line: ``snapshot =
await source.snapshot()``) and keeps the wiring concern out of the
HTTP layer entirely. When the C++ binding for per-device peak ring
buffers lands, the only edit will be to register a
``JuceEngineMeterSource`` at lifespan startup.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Awaitable, List, Optional, Protocol, runtime_checkable


SILENCE_DBFS = -150.0
"""Sentinel value indicating "no measurement yet".

The TascamUS144MKII React panel renders -149.9 dB or lower as an
em-dash (see `formatPeakDb`); -150.0 falls cleanly below that
threshold across rounding edges.
"""


@dataclass(frozen=True)
class MeterSnapshot:
    """One snapshot of per-channel peak dBFS for the US-144MKII.

    ``input_peak_db[i]`` is the peak dBFS observed on input channel
    ``i`` since the most recent ``MeterSource.snapshot()`` call (or
    similar reset boundary — implementations decide). ``source`` is
    either ``"engine"`` for a measured snapshot or ``"placeholder"``
    when the source is the silence fallback. The route surfaces this
    field so the Carbon panel can label the row differently when
    measurements aren't live yet.
    """

    input_peak_db: List[float] = field(default_factory=list)
    output_peak_db: List[float] = field(default_factory=list)
    source: str = "placeholder"


@runtime_checkable
class TascamMeterSource(Protocol):
    """Implementations supply peak dBFS for the US-144MKII.

    The route handler calls ``snapshot()`` and awaits the result if
    it's an awaitable, so concrete implementations can be sync
    (returning a ``MeterSnapshot`` directly) or async (returning a
    coroutine that yields one). This keeps the seam friendly to both
    a thread-shared atomic ring buffer reader (sync, microseconds) and
    an IPC roundtrip to the engine (async, fractional ms).
    """

    def snapshot(self) -> "MeterSnapshot | Awaitable[MeterSnapshot]":
        ...


class PlaceholderMeterSource:
    """Default source — emits the silence sentinel for every channel.

    Constructor takes the channel counts so a future device (or test)
    with a different layout can reuse the same placeholder shape. The
    Tascam route wires the canonical 4-in / 4-out spec from
    ``TASCAM_US144MKII``.
    """

    def __init__(self, input_channels: int = 4, output_channels: int = 4) -> None:
        self._input_channels = int(input_channels)
        self._output_channels = int(output_channels)

    def snapshot(self) -> MeterSnapshot:
        return MeterSnapshot(
            input_peak_db=[SILENCE_DBFS] * self._input_channels,
            output_peak_db=[SILENCE_DBFS] * self._output_channels,
            source="placeholder",
        )


# ---------------------------------------------------------------------------
# Module-level singleton seam.
#
# The route reads through ``get_active_meter_source()``; lifespan
# startup / tests install via ``set_active_meter_source()``. A reset
# helper is exposed so tests don't have to know the default channel
# layout to clean up after themselves.
# ---------------------------------------------------------------------------

_DEFAULT_INPUT_CHANNELS = 4
_DEFAULT_OUTPUT_CHANNELS = 4

_active_source: Optional[TascamMeterSource] = None


def set_active_meter_source(source: Optional[TascamMeterSource]) -> None:
    """Install a meter source for the route to read from.

    Passing ``None`` clears the override and restores the default
    placeholder behavior on the next route call.
    """
    global _active_source
    _active_source = source


def get_active_meter_source() -> TascamMeterSource:
    """Return the currently-installed source, or the default placeholder.

    The default is constructed lazily on each call so test isolation
    works — a test that installs a fake doesn't leave a long-lived
    placeholder instance dangling between cases.
    """
    if _active_source is not None:
        return _active_source
    return PlaceholderMeterSource(
        input_channels=_DEFAULT_INPUT_CHANNELS,
        output_channels=_DEFAULT_OUTPUT_CHANNELS,
    )


def reset_active_meter_source() -> None:
    """Convenience helper for test teardown (same as ``set_active_meter_source(None)``)."""
    set_active_meter_source(None)


async def read_snapshot() -> MeterSnapshot:
    """Resolve the active source's ``snapshot()`` to a concrete value.

    Awaitable-aware: synchronous sources return ``MeterSnapshot``
    directly; async sources return a coroutine the route awaits.
    Centralizing this lets the route handler stay one line.
    """
    source = get_active_meter_source()
    result = source.snapshot()
    if inspect.isawaitable(result):
        return await result
    return result
