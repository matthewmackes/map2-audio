"""T2522-C cycle 6 — pressure-curve calibration facade + HTTP routes.

Pins the GET/PUT /api/maschine/calibration/pressure-curves contract,
the default-when-missing payload behavior, the schema validation on
malformed PUTs, and the round-trip through the calibration store.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import maschine as maschine_routes
from app.services.maschine import calibration_facade, calibration_store
from app.services.maschine_service import reset_maschine_service


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(maschine_routes.router)
    return TestClient(app)


@pytest.fixture
def isolated_calibration_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """Redirect MaschineCalibrationStore's default dir into tmp_path so
    each test starts with a clean slate and never touches ~/.map2."""
    devices_dir = tmp_path / "devices"
    devices_dir.mkdir()
    monkeypatch.setattr(calibration_store, "DEFAULT_DEVICES_DIR", devices_dir)
    reset_maschine_service()
    yield devices_dir
    reset_maschine_service()


def test_get_pressure_curves_returns_linear_default_when_no_file(isolated_calibration_dir):
    client = _build_client()
    response = client.get("/api/maschine/calibration/pressure-curves")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["usb_serial"] == calibration_facade.DEFAULT_USB_SERIAL
    curves = payload["pressure_curves"]
    assert curves["global_compensation"] == 0.0
    assert len(curves["per_pad"]) == 16
    for pad in curves["per_pad"]:
        assert pad["polynomial"] == [0.0, 1.0]


def test_put_pressure_curves_round_trips_through_store(isolated_calibration_dir):
    client = _build_client()
    custom = {
        "global_compensation": 0.1,
        "per_pad": [
            {"polynomial": [0.05, 1.2]} if i == 3 else {"polynomial": [0.0, 1.0]}
            for i in range(16)
        ],
    }
    put_response = client.put(
        "/api/maschine/calibration/pressure-curves",
        json={"pressure_curves": custom},
    )
    assert put_response.status_code == 200
    put_body = put_response.json()
    assert put_body["status"] == "ok"
    assert put_body["pressure_curves"]["global_compensation"] == 0.1
    assert put_body["pressure_curves"]["per_pad"][3]["polynomial"] == [0.05, 1.2]

    # Re-GET — the on-disk file persists the custom payload.
    get_response = client.get("/api/maschine/calibration/pressure-curves")
    assert get_response.status_code == 200
    assert get_response.json()["pressure_curves"]["per_pad"][3]["polynomial"] == [0.05, 1.2]

    # The store wrote a real file under the redirected dir.
    files = list(isolated_calibration_dir.iterdir())
    assert any("calibrated" in f.name for f in files)


def test_put_pressure_curves_rejects_bad_global_compensation(isolated_calibration_dir):
    client = _build_client()
    bad = {
        "global_compensation": 1.5,  # out of [-1, 1]
        "per_pad": [{"polynomial": [0.0, 1.0]} for _ in range(16)],
    }
    response = client.put(
        "/api/maschine/calibration/pressure-curves",
        json={"pressure_curves": bad},
    )
    assert response.status_code == 400
    assert "global_compensation" in response.json()["detail"]


def test_put_pressure_curves_rejects_wrong_pad_count(isolated_calibration_dir):
    client = _build_client()
    bad = {
        "global_compensation": 0.0,
        "per_pad": [{"polynomial": [0.0, 1.0]} for _ in range(8)],  # only 8
    }
    response = client.put(
        "/api/maschine/calibration/pressure-curves",
        json={"pressure_curves": bad},
    )
    assert response.status_code == 400
    assert "per_pad" in response.json()["detail"]


def test_put_pressure_curves_rejects_empty_polynomial(isolated_calibration_dir):
    client = _build_client()
    bad = {
        "global_compensation": 0.0,
        "per_pad": [{"polynomial": []}] + [{"polynomial": [0.0, 1.0]} for _ in range(15)],
    }
    response = client.put(
        "/api/maschine/calibration/pressure-curves",
        json={"pressure_curves": bad},
    )
    assert response.status_code == 400
    assert "polynomial" in response.json()["detail"]
