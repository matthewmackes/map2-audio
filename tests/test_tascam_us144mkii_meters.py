"""T2515-Follow-up-METER-WIRE — meter source seam tests.

Covers the standalone ``app.services.devices.tascam_us144mkii_meters``
module and verifies that the route reads through the seam (so a future
engine-backed source plugs in without route changes).
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import tascam_us144mkii as tascam_routes
from app.services.devices.tascam_us144mkii_meters import (
    MeterSnapshot,
    PlaceholderMeterSource,
    SILENCE_DBFS,
    get_active_meter_source,
    read_snapshot,
    reset_active_meter_source,
    set_active_meter_source,
)


@pytest.fixture(autouse=True)
def _clean_seam():
    """Every test starts and ends with no installed source so test
    isolation holds across the file."""
    reset_active_meter_source()
    yield
    reset_active_meter_source()


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(tascam_routes.router)
    return TestClient(app)


# ----------------------------------------------------------------------------
# PlaceholderMeterSource
# ----------------------------------------------------------------------------


def test_placeholder_emits_silence_sentinel_per_channel():
    src = PlaceholderMeterSource(input_channels=4, output_channels=4)
    snap = src.snapshot()
    assert snap.source == "placeholder"
    assert len(snap.input_peak_db) == 4
    assert len(snap.output_peak_db) == 4
    for v in snap.input_peak_db:
        assert v == SILENCE_DBFS
    for v in snap.output_peak_db:
        assert v == SILENCE_DBFS


def test_placeholder_respects_custom_channel_counts():
    src = PlaceholderMeterSource(input_channels=2, output_channels=8)
    snap = src.snapshot()
    assert len(snap.input_peak_db) == 2
    assert len(snap.output_peak_db) == 8


# ----------------------------------------------------------------------------
# Active-source seam — install / read / reset
# ----------------------------------------------------------------------------


def test_get_active_returns_default_placeholder_when_nothing_installed():
    src = get_active_meter_source()
    assert isinstance(src, PlaceholderMeterSource)


def test_set_active_meter_source_overrides_default():
    class FakeSource:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-12.0, -18.0, -24.0, -30.0],
                output_peak_db=[-6.0, -6.0, -100.0, -100.0],
                source="engine",
            )

    set_active_meter_source(FakeSource())
    src = get_active_meter_source()
    snap = src.snapshot()
    assert snap.source == "engine"
    assert snap.input_peak_db == [-12.0, -18.0, -24.0, -30.0]


def test_reset_active_meter_source_clears_override():
    class FakeSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    set_active_meter_source(FakeSource())
    reset_active_meter_source()
    assert isinstance(get_active_meter_source(), PlaceholderMeterSource)


# ----------------------------------------------------------------------------
# read_snapshot() — handles both sync and async sources
# ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_read_snapshot_resolves_sync_source():
    snap = await read_snapshot()
    assert snap.source == "placeholder"


@pytest.mark.asyncio
async def test_read_snapshot_awaits_async_source():
    class AsyncSource:
        async def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-9.0, -9.0, -9.0, -9.0],
                output_peak_db=[-3.0, -3.0, -3.0, -3.0],
                source="engine",
            )

    set_active_meter_source(AsyncSource())
    snap = await read_snapshot()
    assert snap.source == "engine"
    assert snap.input_peak_db[0] == -9.0


# ----------------------------------------------------------------------------
# Route integration — proves the route reads through the seam
# ----------------------------------------------------------------------------


def test_route_returns_placeholder_when_no_source_installed(client: TestClient):
    resp = client.get("/api/v1/devices/tascam-us144mkii/meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "placeholder"
    for v in body["input_peak_db"]:
        assert v == SILENCE_DBFS


def test_route_picks_up_installed_engine_source(client: TestClient):
    """Critical: installing a custom source must flow through to the
    route response so a future JuceEngineMeterSource plugin doesn't
    need a route handler edit."""

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-14.5, -22.1, -100.0, -100.0],
                output_peak_db=[-3.0, -3.0, -100.0, -100.0],
                source="engine",
            )

    set_active_meter_source(EngineSource())
    resp = client.get("/api/v1/devices/tascam-us144mkii/meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "engine"
    assert body["input_peak_db"] == [-14.5, -22.1, -100.0, -100.0]
    assert body["output_peak_db"] == [-3.0, -3.0, -100.0, -100.0]


def test_route_picks_up_async_source(client: TestClient):
    """Async sources must work too — the route's read_snapshot helper
    awaits the result for an IPC-backed implementation."""

    class AsyncEngineSource:
        async def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-1.0, -2.0, -3.0, -4.0],
                output_peak_db=[-1.0, -1.0, -1.0, -1.0],
                source="engine",
            )

    set_active_meter_source(AsyncEngineSource())
    resp = client.get("/api/v1/devices/tascam-us144mkii/meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "engine"
    assert body["input_peak_db"] == [-1.0, -2.0, -3.0, -4.0]


def test_route_falls_back_to_placeholder_after_reset(client: TestClient):
    """Installing then resetting must restore placeholder behavior on
    the very next request — no stale-source leak."""

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    set_active_meter_source(EngineSource())
    resp1 = client.get("/api/v1/devices/tascam-us144mkii/meters")
    assert resp1.json()["source"] == "engine"

    reset_active_meter_source()
    resp2 = client.get("/api/v1/devices/tascam-us144mkii/meters")
    assert resp2.json()["source"] == "placeholder"
