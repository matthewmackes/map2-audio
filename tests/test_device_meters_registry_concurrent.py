"""Pivot-13e cycle 2 — /peak-meters/registry runs include_snapshot
read_snapshot calls concurrently rather than sequentially.

Installs slow-async sources on every registered device, then asserts
that the total request wallclock is closer to one source's latency
than to the sum. The bound is loose (allow up to 2.5× one-source
latency) so a slow CI host doesn't flake the test; sequential
behaviour would be 4× and would still fail by a wide margin.
"""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters as device_meters_module
from app.services.devices._meter_source import (
    MeterSnapshot,
    SILENCE_DBFS,
    get_registry,
)


@pytest.fixture
def app_with_router() -> FastAPI:
    app = FastAPI()
    app.include_router(device_meters_module.router)
    return app


SOURCE_DELAY_S = 0.05  # 50 ms — well above noise; below test budget.


class SlowAsyncSource:
    """Source whose ``snapshot()`` awaits before returning."""

    def __init__(self, input_channels: int, output_channels: int) -> None:
        self._input_channels = input_channels
        self._output_channels = output_channels

    async def snapshot(self) -> MeterSnapshot:
        await asyncio.sleep(SOURCE_DELAY_S)
        return MeterSnapshot(
            input_peak_db=[-12.0] * self._input_channels,
            output_peak_db=[-9.0] * self._output_channels,
            source="engine",
            captured_at=time.time(),
        )


@pytest.fixture
def slow_sources_installed():
    """Swap every registered device to a slow source for the test."""
    registry = get_registry()
    rows = registry.list_devices()
    for row in rows:
        registry.set_active_source(
            row.device_id,
            SlowAsyncSource(
                input_channels=row.input_channels,
                output_channels=row.output_channels,
            ),
        )
    yield rows
    for row in rows:
        registry.reset_active_source(row.device_id)


def test_include_snapshot_runs_concurrently(
    app_with_router: FastAPI, slow_sources_installed
) -> None:
    """All four registered devices have a 50 ms async source. A
    sequential implementation would take ~200 ms; the concurrent
    asyncio.gather should keep total wallclock close to 50 ms.

    Bound at 2.5× per-source delay so a busy CI host (or coverage
    instrumentation) doesn't flake. Sequential N-device behaviour
    would be ~4× and fail loudly.
    """
    n_devices = len(slow_sources_installed)
    assert n_devices >= 2, "test needs >=2 registered devices to be meaningful"

    client = TestClient(app_with_router)
    t0 = time.perf_counter()
    r = client.get("/api/v1/devices/peak-meters/registry?include_snapshot=true")
    elapsed = time.perf_counter() - t0

    assert r.status_code == 200
    body = r.json()
    assert len(body["devices"]) == n_devices
    # Every snapshot should have come back populated.
    for entry in body["devices"]:
        assert entry["snapshot"] is not None
        assert entry["snapshot"]["source"] == "engine"
        assert entry["snapshot"]["captured_at"] is not None

    upper_bound = SOURCE_DELAY_S * 2.5
    assert elapsed < upper_bound, (
        f"include_snapshot wallclock {elapsed:.3f}s exceeded upper bound "
        f"{upper_bound:.3f}s for {n_devices} devices at {SOURCE_DELAY_S}s each — "
        "regression: serial read_snapshot likely re-introduced"
    )


def test_include_snapshot_preserves_alphabetical_order(
    app_with_router: FastAPI, slow_sources_installed
) -> None:
    """asyncio.gather preserves input ordering — the response must
    still come back alphabetically by device_id, matching
    list_devices()."""
    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/registry?include_snapshot=true")
    assert r.status_code == 200
    device_ids = [entry["device_id"] for entry in r.json()["devices"]]
    assert device_ids == sorted(device_ids)


def test_no_include_snapshot_does_not_call_read_snapshot(
    app_with_router: FastAPI, slow_sources_installed
) -> None:
    """When include_snapshot is omitted the route must not invoke any
    source — wallclock should be tiny even with slow sources installed."""
    client = TestClient(app_with_router)
    t0 = time.perf_counter()
    r = client.get("/api/v1/devices/peak-meters/registry")
    elapsed = time.perf_counter() - t0

    assert r.status_code == 200
    assert elapsed < SOURCE_DELAY_S, (
        f"registry-only wallclock {elapsed:.3f}s suggests read_snapshot "
        "was called despite include_snapshot=false"
    )
    # All snapshots omitted.
    for entry in r.json()["devices"]:
        assert entry.get("snapshot") is None


def test_concurrent_path_handles_zero_devices() -> None:
    """asyncio.gather() with no arguments is well-defined but should
    short-circuit cleanly — confirm via a one-liner async coroutine
    so the gather runs inside a real running loop. (In production the
    route guards with ``if include_snapshot and rows`` so a registry
    of zero devices simply skips the gather entirely.)"""
    async def _smoke() -> list[object]:
        return await asyncio.gather()

    result = asyncio.run(_smoke())
    assert result == []


def test_engine_source_silence_sentinel_unchanged(
    app_with_router: FastAPI
) -> None:
    """Smoke test: when sources are the default placeholder, the
    snapshot still returns SILENCE_DBFS values (i.e. concurrent gather
    didn't drop the per-device payload through the placeholder path)."""
    # Reset to defaults — we don't install slow sources here.
    registry = get_registry()
    for row in registry.list_devices():
        registry.reset_active_source(row.device_id)

    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/registry?include_snapshot=true")
    assert r.status_code == 200
    for entry in r.json()["devices"]:
        snap = entry["snapshot"]
        assert snap["source"] == "placeholder"
        for v in snap["input_peak_db"] + snap["output_peak_db"]:
            assert v == SILENCE_DBFS
