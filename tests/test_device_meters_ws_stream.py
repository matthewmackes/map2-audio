"""Pick-1 of the eleventh Continue run handoff —
``GET /api/v1/devices/peak-meters/stream`` WebSocket fan-out tests.

Verifies the initial frame on connect, the frame envelope shape, and
the per-device snapshot payload. The frame cadence is bound to a
module-level constant which tests patch to keep wallclock waits low.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters as device_meters_module


@pytest.fixture
def app_with_router() -> FastAPI:
    app = FastAPI()
    app.include_router(device_meters_module.router)
    return app


def test_initial_frame_on_connect(app_with_router: FastAPI) -> None:
    client = TestClient(app_with_router)
    with client.websocket_connect("/api/v1/devices/peak-meters/stream") as ws:
        frame = ws.receive_json()
    assert frame["type"] == "device_peak_meters:registry"
    assert frame["schema_version"] == 1
    devices = frame["data"]["devices"]
    assert devices, "registry should enumerate at least one device"
    for entry in devices:
        assert "device_id" in entry
        assert "input_channels" in entry
        assert "output_channels" in entry
        assert "has_engine_source" in entry
        snap = entry["snapshot"]
        assert isinstance(snap["input_peak_db"], list)
        assert isinstance(snap["output_peak_db"], list)
        assert snap["source"] in {"engine", "placeholder"}
        assert snap["captured_at"] is not None


def test_second_frame_arrives_after_cadence_tick(
    app_with_router: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Run faster than 30 fps so the test doesn't burn wallclock.
    monkeypatch.setattr(
        device_meters_module, "WS_BROADCAST_INTERVAL_SECONDS", 0.005
    )
    client = TestClient(app_with_router)
    with client.websocket_connect("/api/v1/devices/peak-meters/stream") as ws:
        first = ws.receive_json()
        second = ws.receive_json()
    assert first["type"] == "device_peak_meters:registry"
    assert second["type"] == "device_peak_meters:registry"
    # captured_at advances between frames (or stays equal for clocks
    # with coarse resolution; never goes backward).
    first_ts = first["data"]["devices"][0]["snapshot"]["captured_at"]
    second_ts = second["data"]["devices"][0]["snapshot"]["captured_at"]
    assert second_ts >= first_ts


def test_frame_envelope_versioned(app_with_router: FastAPI) -> None:
    """schema_version=1 must be present so the daemon can bump later."""
    client = TestClient(app_with_router)
    with client.websocket_connect("/api/v1/devices/peak-meters/stream") as ws:
        frame = ws.receive_json()
    assert frame["schema_version"] == 1
    assert frame["type"].startswith("device_peak_meters:")


def test_devices_list_alphabetically_ordered(app_with_router: FastAPI) -> None:
    """list_devices() returns alphabetical order — the WS frame must
    preserve that so frontend consumers don't have to re-sort."""
    client = TestClient(app_with_router)
    with client.websocket_connect("/api/v1/devices/peak-meters/stream") as ws:
        frame = ws.receive_json()
    device_ids = [d["device_id"] for d in frame["data"]["devices"]]
    assert device_ids == sorted(device_ids)
