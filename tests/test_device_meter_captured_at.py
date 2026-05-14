"""Order-2 of the eleventh Continue run handoff — `MeterSnapshot.captured_at`.

Verifies that:
- The placeholder source stamps `captured_at` on every snapshot.
- A legacy source that doesn't stamp the field gets backfilled by the
  registry's `read_snapshot` helper.
- The route surfaces `captured_at` for both the per-device and the
  registry-with-snapshot paths.
"""

from __future__ import annotations

import asyncio
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters as device_meters_module
from app.services.devices._meter_source import (
    DeviceMeterSourceRegistry,
    MeterSnapshot,
    PlaceholderMeterSource,
)


def test_placeholder_stamps_captured_at():
    src = PlaceholderMeterSource(input_channels=2, output_channels=2)
    snapshot = src.snapshot()
    assert snapshot.captured_at is not None
    assert isinstance(snapshot.captured_at, float)
    assert snapshot.captured_at > 0


def test_registry_backfills_captured_at_for_legacy_source():
    """A source that constructs `MeterSnapshot` without `captured_at`
    must still surface a real timestamp once routed through the
    registry — otherwise consumers can't render "n seconds ago"."""
    registry = DeviceMeterSourceRegistry()
    registry.register_device("legacy", input_channels=2, output_channels=2)

    class _LegacySource:
        def snapshot(self) -> MeterSnapshot:
            # Construct without captured_at on purpose.
            return MeterSnapshot(
                input_peak_db=[-12.0, -18.0],
                output_peak_db=[-9.0, -7.0],
                source="engine",
            )

    registry.set_active_source("legacy", _LegacySource())
    before = time.time()
    snap = asyncio.run(registry.read_snapshot("legacy"))
    after = time.time()
    assert snap.captured_at is not None
    # Backfilled value lies within the elapsed window.
    assert before <= snap.captured_at <= after


def test_registry_preserves_source_supplied_captured_at():
    """When the source stamps the field, the registry should not
    overwrite it — otherwise late arrivals via async IPC would all
    show "0 seconds ago"."""
    registry = DeviceMeterSourceRegistry()
    registry.register_device("stamped", input_channels=1, output_channels=1)
    fixed_ts = 1_700_000_000.0

    class _StampedSource:
        def snapshot(self) -> MeterSnapshot:
            return MeterSnapshot(
                input_peak_db=[-12.0],
                output_peak_db=[-9.0],
                source="engine",
                captured_at=fixed_ts,
            )

    registry.set_active_source("stamped", _StampedSource())
    snap = asyncio.run(registry.read_snapshot("stamped"))
    assert snap.captured_at == fixed_ts


@pytest.fixture
def app_with_router() -> FastAPI:
    app = FastAPI()
    app.include_router(device_meters_module.router)
    return app


def test_route_surfaces_captured_at(app_with_router: FastAPI) -> None:
    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/edirol-ua-1000/peak-meters")
    assert r.status_code == 200
    body = r.json()
    assert "captured_at" in body
    assert body["captured_at"] is not None
    assert isinstance(body["captured_at"], float)


def test_registry_snapshot_route_surfaces_captured_at(
    app_with_router: FastAPI,
) -> None:
    client = TestClient(app_with_router)
    r = client.get(
        "/api/v1/devices/peak-meters/registry?include_snapshot=true"
    )
    assert r.status_code == 200
    body = r.json()
    devices = body["devices"]
    assert devices, "registry should enumerate at least one device"
    for entry in devices:
        snap = entry.get("snapshot")
        assert snap is not None, f"snapshot missing for {entry['device_id']}"
        assert "captured_at" in snap
        assert snap["captured_at"] is not None
        assert isinstance(snap["captured_at"], float)


def test_registry_snapshot_route_omits_captured_at_when_not_inlined(
    app_with_router: FastAPI,
) -> None:
    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/registry")
    assert r.status_code == 200
    for entry in r.json()["devices"]:
        # Without include_snapshot=true, the snapshot field is omitted
        # entirely — so captured_at is unreachable, which is the
        # intended shape.
        assert entry.get("snapshot") is None
