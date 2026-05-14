"""Pivot-13d cycle 3 — engine_unavailable surfaces through the
per-device GET route and the registry+snapshot route.

The JuceEngineMeterSource adapter (pivot-13c-1) returns a
`source="engine_unavailable"` MeterSnapshot when its reader callable
raises. This test pins the contract that the route layer surfaces
that source verbatim rather than collapsing it to "placeholder" or
500'ing on the reader exception.

Frontend rendering of the new state is covered separately by
`DeviceMeterSourceTag.test.tsx` (pivot-13c-3).
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters as device_meters_module
from app.services.devices._meter_source import get_registry
from app.services.devices.juce_engine_meter_source import (
    JuceEngineMeterSource,
    RawPeakBuffer,
)


@pytest.fixture
def app_with_router() -> FastAPI:
    app = FastAPI()
    app.include_router(device_meters_module.router)
    return app


@pytest.fixture
def cleanup_meter_sources():
    """Restore any device meter sources we mutate during the test."""
    registry = get_registry()
    pre = {row.device_id: registry.get_active_source(row.device_id) for row in registry.list_devices()}
    yield
    for device_id, src in pre.items():
        # Reset whatever we touched. Sources registered at import time
        # default to a fresh PlaceholderMeterSource, so resetting to
        # None restores the documented baseline.
        if isinstance(src, type(get_registry().get_active_source(device_id))):
            registry.reset_active_source(device_id)
        else:
            registry.set_active_source(device_id, src)


def test_engine_unavailable_surfaces_on_per_device_get(
    app_with_router: FastAPI, cleanup_meter_sources
) -> None:
    """Install a JuceEngineMeterSource whose reader raises, then call
    the per-device GET — the route must return 200 with
    source=engine_unavailable rather than 5xx'ing on the reader error.
    """
    def _broken_reader() -> RawPeakBuffer:
        raise RuntimeError("IPC broken")

    registry = get_registry()
    registry.set_active_source(
        "tascam-us144mkii",
        JuceEngineMeterSource(
            input_channels=4,
            output_channels=4,
            reader=_broken_reader,
        ),
    )

    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/tascam-us144mkii/peak-meters")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "engine_unavailable"
    # Silence-shaped — adapter pads with -150.0 dBFS on the failure path.
    assert all(v == -150.0 for v in body["input_peak_db"])
    assert all(v == -150.0 for v in body["output_peak_db"])
    # captured_at still stamped so consumers can render "n seconds ago".
    assert body["captured_at"] is not None


def test_engine_unavailable_surfaces_on_registry_with_snapshot(
    app_with_router: FastAPI, cleanup_meter_sources
) -> None:
    """The registry-with-snapshot route must propagate
    engine_unavailable the same way."""
    def _broken_reader() -> RawPeakBuffer:
        raise RuntimeError("simulated reader failure")

    registry = get_registry()
    registry.set_active_source(
        "edirol-ua-1000",
        JuceEngineMeterSource(
            input_channels=10,
            output_channels=10,
            reader=_broken_reader,
        ),
    )

    client = TestClient(app_with_router)
    r = client.get("/api/v1/devices/peak-meters/registry?include_snapshot=true")
    assert r.status_code == 200
    body = r.json()
    ua1000 = next(
        e for e in body["devices"] if e["device_id"] == "edirol-ua-1000"
    )
    assert ua1000["snapshot"]["source"] == "engine_unavailable"
    assert ua1000["snapshot"]["captured_at"] is not None


def test_engine_unavailable_distinct_from_placeholder(
    app_with_router: FastAPI, cleanup_meter_sources
) -> None:
    """Both a broken-engine source and an absent source emit
    -150 dBFS values, but the `source` field must distinguish them
    so the frontend can render distinct tags."""
    def _broken_reader() -> RawPeakBuffer:
        raise RuntimeError("simulated")

    registry = get_registry()
    # tascam: broken-engine source.
    registry.set_active_source(
        "tascam-us144mkii",
        JuceEngineMeterSource(
            input_channels=4,
            output_channels=4,
            reader=_broken_reader,
        ),
    )
    # edirol: reset to placeholder (no engine source installed).
    registry.reset_active_source("edirol-ua-1000")

    client = TestClient(app_with_router)
    tascam = client.get("/api/v1/devices/tascam-us144mkii/peak-meters").json()
    edirol = client.get("/api/v1/devices/edirol-ua-1000/peak-meters").json()
    assert tascam["source"] == "engine_unavailable"
    assert edirol["source"] == "placeholder"


def test_engine_unavailable_surfaces_on_ws_stream_frame(
    app_with_router: FastAPI, cleanup_meter_sources
) -> None:
    """The 30 fps WS stream must reflect engine_unavailable in the
    per-device snapshot it pushes."""
    def _broken_reader() -> RawPeakBuffer:
        raise RuntimeError("ws-failure")

    registry = get_registry()
    registry.set_active_source(
        "lexicon-mpx1",
        JuceEngineMeterSource(
            input_channels=2,
            output_channels=2,
            reader=_broken_reader,
        ),
    )

    client = TestClient(app_with_router)
    with client.websocket_connect(
        "/api/v1/devices/peak-meters/stream?device_ids=lexicon-mpx1"
    ) as ws:
        frame = ws.receive_json()
    devices = frame["data"]["devices"]
    assert len(devices) == 1
    entry = devices[0]
    assert entry["device_id"] == "lexicon-mpx1"
    assert entry["snapshot"]["source"] == "engine_unavailable"
