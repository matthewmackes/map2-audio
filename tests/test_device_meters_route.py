"""Generic per-device meter route tests.

Covers ``GET /api/v1/devices/{device_id}/peak-meters`` shipped in the
tenth Continue run. Verifies:

  - placeholder payload shape for every registered device,
  - engine-source install round-trip via the device facade,
  - 404 for an unregistered device_id with the canonical error envelope,
  - all three audio-interface facades (Tascam, UA-1000, JoGG) are
    addressable through the same route handler.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import device_meters
from app.services.devices import (
    edirol_ua1000_meters,
    hotone_jogg_meters,
    lexicon_mpx1_meters,
    tascam_us144mkii_meters,
)
from app.services.devices._meter_source import MeterSnapshot, SILENCE_DBFS


@pytest.fixture(autouse=True)
def _clean_seam():
    """Restore default placeholders around every test so an engine
    source installed in one case doesn't leak into the next."""
    tascam_us144mkii_meters.reset_active_meter_source()
    edirol_ua1000_meters.reset_active_meter_source()
    hotone_jogg_meters.reset_active_meter_source()
    lexicon_mpx1_meters.reset_active_meter_source()
    yield
    tascam_us144mkii_meters.reset_active_meter_source()
    edirol_ua1000_meters.reset_active_meter_source()
    hotone_jogg_meters.reset_active_meter_source()
    lexicon_mpx1_meters.reset_active_meter_source()


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(device_meters.router)
    return TestClient(app)


@pytest.mark.parametrize(
    "device_id,inp,out",
    [
        ("tascam-us144mkii", 4, 4),
        ("edirol-ua-1000", 10, 10),
        ("hotone-jogg", 2, 2),
        ("lexicon-mpx1", 2, 2),
    ],
)
def test_route_returns_placeholder_for_registered_device(client, device_id, inp, out):
    resp = client.get(f"/api/v1/devices/{device_id}/peak-meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["device_id"] == device_id
    assert body["source"] == "placeholder"
    assert len(body["input_peak_db"]) == inp
    assert len(body["output_peak_db"]) == out
    for v in body["input_peak_db"] + body["output_peak_db"]:
        assert v == SILENCE_DBFS


def test_route_picks_up_engine_source_via_tascam_facade(client):
    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-14.5, -22.1, -100.0, -100.0],
                output_peak_db=[-3.0, -3.0, -100.0, -100.0],
                source="engine",
            )

    tascam_us144mkii_meters.set_active_meter_source(EngineSource())
    resp = client.get("/api/v1/devices/tascam-us144mkii/peak-meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "engine"
    assert body["input_peak_db"] == [-14.5, -22.1, -100.0, -100.0]


def test_route_picks_up_engine_source_via_ua1000_facade(client):
    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(
                input_peak_db=[-6.0] * 10,
                output_peak_db=[-3.0] * 10,
                source="engine",
            )

    edirol_ua1000_meters.set_active_meter_source(EngineSource())
    resp = client.get("/api/v1/devices/edirol-ua-1000/peak-meters")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "engine"
    assert body["input_peak_db"] == [-6.0] * 10
    assert body["output_peak_db"] == [-3.0] * 10


def test_route_404s_with_envelope_for_unknown_device(client):
    resp = client.get("/api/v1/devices/does-not-exist/peak-meters")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"]["error"]["code"] == "device_not_registered"
    assert "does-not-exist" in body["detail"]["error"]["message"]


def test_route_facades_remain_isolated(client):
    """Installing on Tascam must not leak into UA-1000 / JoGG even
    through the generic route handler."""

    class EngineSource:
        def snapshot(self):
            return MeterSnapshot(source="engine")

    tascam_us144mkii_meters.set_active_meter_source(EngineSource())
    tascam_body = client.get("/api/v1/devices/tascam-us144mkii/peak-meters").json()
    ua_body = client.get("/api/v1/devices/edirol-ua-1000/peak-meters").json()
    jogg_body = client.get("/api/v1/devices/hotone-jogg/peak-meters").json()
    assert tascam_body["source"] == "engine"
    assert ua_body["source"] == "placeholder"
    assert jogg_body["source"] == "placeholder"


def test_legacy_tascam_meters_route_still_works(client):
    """The new generic route uses ``/peak-meters`` so it does not
    collide with the existing per-device ``/meters`` route. This test
    proves the generic route does not accidentally shadow the legacy
    one by sharing a client fixture with both routers mounted.
    """
    from app.routes import tascam_us144mkii

    legacy_app = FastAPI()
    legacy_app.include_router(tascam_us144mkii.router)
    legacy_app.include_router(device_meters.router)
    legacy_client = TestClient(legacy_app)

    legacy_resp = legacy_client.get("/api/v1/devices/tascam-us144mkii/meters")
    new_resp = legacy_client.get("/api/v1/devices/tascam-us144mkii/peak-meters")

    assert legacy_resp.status_code == 200
    assert new_resp.status_code == 200
    # Same underlying source, slightly different payload shapes.
    assert legacy_resp.json()["source"] == new_resp.json()["source"]
    assert legacy_resp.json()["input_peak_db"] == new_resp.json()["input_peak_db"]
    assert new_resp.json()["device_id"] == "tascam-us144mkii"
