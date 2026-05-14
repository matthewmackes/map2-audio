"""Pivot-13c cycle 1 — JuceEngineMeterSource adapter tests.

Verifies the adapter:
  - projects RawPeakBuffer onto MeterSnapshot with the declared channel
    counts.
  - pads short buffers with SILENCE_DBFS and truncates long ones.
  - preserves engine-supplied captured_at and falls back to wall-clock
    when the engine didn't stamp.
  - surfaces 'engine_unavailable' snapshots when the reader raises.
  - awaits async readers.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.services.devices._meter_source import (
    DeviceMeterSourceRegistry,
    MeterSnapshot,
    SILENCE_DBFS,
)
from app.services.devices.juce_engine_meter_source import (
    JuceEngineMeterSource,
    RawPeakBuffer,
)


def _make_reader(buffer: RawPeakBuffer):
    return lambda: buffer


def test_projects_raw_buffer_onto_snapshot():
    src = JuceEngineMeterSource(
        input_channels=2,
        output_channels=2,
        reader=_make_reader(
            RawPeakBuffer(
                input_peak_db=[-12.0, -18.0],
                output_peak_db=[-9.0, -7.0],
                captured_at=1715731200.0,
            )
        ),
    )
    snap = src.snapshot()
    assert isinstance(snap, MeterSnapshot)
    assert snap.input_peak_db == [-12.0, -18.0]
    assert snap.output_peak_db == [-9.0, -7.0]
    assert snap.source == "engine"
    assert snap.captured_at == 1715731200.0


def test_pads_short_buffer_with_silence():
    src = JuceEngineMeterSource(
        input_channels=4,
        output_channels=4,
        reader=_make_reader(
            RawPeakBuffer(
                input_peak_db=[-12.0],
                output_peak_db=[-9.0, -7.0],
            )
        ),
    )
    snap = src.snapshot()
    assert isinstance(snap, MeterSnapshot)
    assert snap.input_peak_db == [-12.0, SILENCE_DBFS, SILENCE_DBFS, SILENCE_DBFS]
    assert snap.output_peak_db == [-9.0, -7.0, SILENCE_DBFS, SILENCE_DBFS]


def test_truncates_long_buffer():
    src = JuceEngineMeterSource(
        input_channels=2,
        output_channels=2,
        reader=_make_reader(
            RawPeakBuffer(
                input_peak_db=[-12.0, -18.0, -3.0, -5.0],
                output_peak_db=[-9.0, -7.0, -1.0],
            )
        ),
    )
    snap = src.snapshot()
    assert isinstance(snap, MeterSnapshot)
    assert snap.input_peak_db == [-12.0, -18.0]
    assert snap.output_peak_db == [-9.0, -7.0]


def test_backfills_captured_at_with_wallclock_when_engine_omits():
    src = JuceEngineMeterSource(
        input_channels=1,
        output_channels=1,
        reader=_make_reader(
            RawPeakBuffer(
                input_peak_db=[-12.0], output_peak_db=[-9.0]
            )
        ),
    )
    before = time.time()
    snap = src.snapshot()
    after = time.time()
    assert isinstance(snap, MeterSnapshot)
    assert snap.captured_at is not None
    assert before <= snap.captured_at <= after


def test_engine_unavailable_when_reader_raises():
    def _raise() -> RawPeakBuffer:
        raise RuntimeError("simulated IPC failure")

    src = JuceEngineMeterSource(
        input_channels=2,
        output_channels=2,
        reader=_raise,
    )
    snap = src.snapshot()
    assert isinstance(snap, MeterSnapshot)
    assert snap.source == "engine_unavailable"
    assert snap.input_peak_db == [SILENCE_DBFS, SILENCE_DBFS]
    assert snap.output_peak_db == [SILENCE_DBFS, SILENCE_DBFS]
    assert snap.captured_at is not None


def test_async_reader_is_awaited():
    async def _async_reader() -> RawPeakBuffer:
        return RawPeakBuffer(
            input_peak_db=[-12.0], output_peak_db=[-9.0], captured_at=42.0
        )

    src = JuceEngineMeterSource(
        input_channels=1,
        output_channels=1,
        reader=_async_reader,
    )
    awaitable = src.snapshot()
    snap = asyncio.run(awaitable)  # type: ignore[arg-type]
    assert isinstance(snap, MeterSnapshot)
    assert snap.input_peak_db == [-12.0]
    assert snap.captured_at == 42.0


def test_async_reader_failure_yields_engine_unavailable():
    async def _broken_reader() -> RawPeakBuffer:
        raise RuntimeError("async IPC down")

    src = JuceEngineMeterSource(
        input_channels=2,
        output_channels=2,
        reader=_broken_reader,
    )
    snap = asyncio.run(src.snapshot())  # type: ignore[arg-type]
    assert snap.source == "engine_unavailable"


def test_registry_round_trip_with_engine_source():
    """A registered facade can swap its source to a JuceEngineMeterSource
    and the registry awaits the snapshot correctly."""
    registry = DeviceMeterSourceRegistry()
    registry.register_device("widget", input_channels=2, output_channels=2)
    registry.set_active_source(
        "widget",
        JuceEngineMeterSource(
            input_channels=2,
            output_channels=2,
            reader=_make_reader(
                RawPeakBuffer(
                    input_peak_db=[-12.0, -18.0],
                    output_peak_db=[-9.0, -7.0],
                    captured_at=1715731200.0,
                )
            ),
        ),
    )
    snap = asyncio.run(registry.read_snapshot("widget"))
    assert snap.source == "engine"
    assert snap.captured_at == 1715731200.0
    assert snap.input_peak_db == [-12.0, -18.0]


def test_zero_channels_emits_empty_lists():
    src = JuceEngineMeterSource(
        input_channels=0,
        output_channels=0,
        reader=_make_reader(
            RawPeakBuffer(
                input_peak_db=[-3.0],
                output_peak_db=[-3.0],
            )
        ),
    )
    snap = src.snapshot()
    assert isinstance(snap, MeterSnapshot)
    assert snap.input_peak_db == []
    assert snap.output_peak_db == []
