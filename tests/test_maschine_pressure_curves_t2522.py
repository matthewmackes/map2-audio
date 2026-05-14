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


# ---------------------------------------------------------------------------
# T2522-C cycle 7 — performance patterns + scenes
# ---------------------------------------------------------------------------


def _empty_pattern(pid: str, length: int = 4):
    return {
        "id": pid,
        "name": f"Pattern {pid}",
        "length": length,
        "steps": [[0 for _ in range(length)] for _ in range(16)],
        "scene_slot": None,
    }


def test_get_performance_patterns_returns_empty_default(isolated_calibration_dir):
    client = _build_client()
    response = client.get("/api/maschine/performance/patterns")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["performance_patterns"] == {"active_pattern_id": None, "patterns": []}


def test_put_performance_patterns_round_trip(isolated_calibration_dir):
    client = _build_client()
    bank = {
        "active_pattern_id": "p1",
        "patterns": [
            {**_empty_pattern("p1", 8), "scene_slot": 0},
            _empty_pattern("p2", 16),
        ],
    }
    put_response = client.put(
        "/api/maschine/performance/patterns",
        json={"performance_patterns": bank},
    )
    assert put_response.status_code == 200
    body = put_response.json()
    assert body["performance_patterns"]["active_pattern_id"] == "p1"
    assert len(body["performance_patterns"]["patterns"]) == 2

    get_response = client.get("/api/maschine/performance/patterns")
    assert get_response.json()["performance_patterns"]["active_pattern_id"] == "p1"


def test_put_performance_patterns_rejects_duplicate_ids(isolated_calibration_dir):
    client = _build_client()
    bank = {
        "active_pattern_id": None,
        "patterns": [_empty_pattern("dup"), _empty_pattern("dup")],
    }
    response = client.put(
        "/api/maschine/performance/patterns",
        json={"performance_patterns": bank},
    )
    assert response.status_code == 400
    assert "duplicated" in response.json()["detail"]


def test_put_performance_patterns_rejects_duplicate_scene_slots(isolated_calibration_dir):
    client = _build_client()
    bank = {
        "active_pattern_id": None,
        "patterns": [
            {**_empty_pattern("p1"), "scene_slot": 0},
            {**_empty_pattern("p2"), "scene_slot": 0},
        ],
    }
    response = client.put(
        "/api/maschine/performance/patterns",
        json={"performance_patterns": bank},
    )
    assert response.status_code == 400
    assert "scene_slot" in response.json()["detail"]


def test_put_performance_patterns_rejects_active_id_not_in_bank(isolated_calibration_dir):
    client = _build_client()
    bank = {
        "active_pattern_id": "ghost",
        "patterns": [_empty_pattern("p1")],
    }
    response = client.put(
        "/api/maschine/performance/patterns",
        json={"performance_patterns": bank},
    )
    assert response.status_code == 400
    assert "active_pattern_id" in response.json()["detail"]


def test_put_performance_patterns_rejects_bad_step_value(isolated_calibration_dir):
    client = _build_client()
    pattern = _empty_pattern("p1", 4)
    pattern["steps"][0][0] = 5  # invalid — must be 0/1/2
    bank = {"active_pattern_id": None, "patterns": [pattern]}
    response = client.put(
        "/api/maschine/performance/patterns",
        json={"performance_patterns": bank},
    )
    assert response.status_code == 400
    assert "0/1/2" in response.json()["detail"] or "must be 0" in response.json()["detail"]


# ---------------------------------------------------------------------------
# T2522-D cycle 10 — LED choreography
# ---------------------------------------------------------------------------


def test_get_led_choreography_returns_default(isolated_calibration_dir):
    client = _build_client()
    response = client.get("/api/maschine/led-choreography")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    cho = body["led_choreography"]
    assert len(cho["per_pad"]) == 16
    for entry in cho["per_pad"]:
        assert entry["idle_color"] == "empty"
        assert entry["press_color"] == "white"


def test_put_led_choreography_round_trip(isolated_calibration_dir):
    client = _build_client()
    payload = {
        "per_pad": [
            {"idle_color": "cyan", "press_color": "magenta"} if i == 5
            else {"idle_color": "empty", "press_color": "white"}
            for i in range(16)
        ],
    }
    put_response = client.put(
        "/api/maschine/led-choreography",
        json={"led_choreography": payload},
    )
    assert put_response.status_code == 200
    assert put_response.json()["led_choreography"]["per_pad"][5]["idle_color"] == "cyan"

    get_response = client.get("/api/maschine/led-choreography")
    assert get_response.json()["led_choreography"]["per_pad"][5]["press_color"] == "magenta"


def test_put_led_choreography_rejects_bad_color(isolated_calibration_dir):
    client = _build_client()
    payload = {
        "per_pad": [{"idle_color": "fuchsia", "press_color": "white"}]  # fuchsia not in enum
        + [{"idle_color": "empty", "press_color": "white"} for _ in range(15)],
    }
    response = client.put(
        "/api/maschine/led-choreography",
        json={"led_choreography": payload},
    )
    assert response.status_code == 400
    assert "idle_color" in response.json()["detail"]


def test_put_led_choreography_rejects_wrong_length(isolated_calibration_dir):
    client = _build_client()
    payload = {
        "per_pad": [{"idle_color": "empty", "press_color": "white"} for _ in range(8)],
    }
    response = client.put(
        "/api/maschine/led-choreography",
        json={"led_choreography": payload},
    )
    assert response.status_code == 400
    assert "16" in response.json()["detail"]
