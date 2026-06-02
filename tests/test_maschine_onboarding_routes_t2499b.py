"""T2499-B — HTTP route tests for the MK1 onboarding orchestrator surface.

Exercises the full operator flow end-to-end through the FastAPI routes with
calibration writing to a temp directory (no ~/.map2 contact, no hardware):
connect -> tour -> 4 calibration phases -> READY, plus the Q4 hot-load and
Q50 ERASE-skip branches and the transition-guard error paths.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import maschine as maschine_routes
from app.services.maschine.onboarding_service import (
    MaschineOnboardingService,
    reset_maschine_onboarding_service_for_tests,
)
import app.services.maschine.onboarding_service as onboarding_service_module


SERIAL = "MK1TESTSERIAL01"


def _pad_sensitivity_payload() -> list[dict[str, int]]:
    return [{"threshold": 8, "max_velocity": 120} for _ in range(16)]


def _pressure_curves_payload() -> dict[str, object]:
    return {
        "per_pad": [{"polynomial": [0.0, 1.0]} for _ in range(16)],
        "global_compensation": 0.0,
    }


def _lcd_payload() -> dict[str, object]:
    return {"gamma": 1.0, "per_lcd_bias": {"left": 0, "right": 0}}


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # Force the singleton to a temp calibration dir so nothing touches
    # ~/.map2/devices and each test starts from a clean machine.
    reset_maschine_onboarding_service_for_tests()
    service = MaschineOnboardingService(calibration_directory=tmp_path)
    monkeypatch.setattr(
        onboarding_service_module, "_service_singleton", service, raising=False
    )

    app = FastAPI()
    app.include_router(maschine_routes.router)
    yield TestClient(app)

    reset_maschine_onboarding_service_for_tests()


def _connect(client: TestClient) -> dict:
    resp = client.post("/api/maschine/onboarding/connect", json={"usb_serial": SERIAL})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_status_starts_idle(client: TestClient) -> None:
    resp = client.get("/api/maschine/onboarding/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["state"] == "idle"
    assert body["usb_serial"] is None
    assert body["is_ready"] is False
    assert "phase_order" in body


def test_connect_fresh_unit_enters_tour(client: TestClient) -> None:
    body = _connect(client)
    assert body["state"] == "tour"
    assert body["usb_serial"] == SERIAL
    assert body["is_ready"] is False


def test_full_calibration_flow_to_ready(client: TestClient) -> None:
    _connect(client)
    # tour -> pad sensitivity
    r = client.post("/api/maschine/onboarding/tour-complete")
    assert r.status_code == 200 and r.json()["state"] == "pad_sensitivity"

    # pad sensitivity -> pressure curves
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "pad_sensitivity", "section_payload": _pad_sensitivity_payload()},
    )
    assert r.status_code == 200 and r.json()["state"] == "pressure_curves"

    # pressure curves -> lcd
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "pressure_curves", "section_payload": _pressure_curves_payload()},
    )
    assert r.status_code == 200 and r.json()["state"] == "lcd_calibration"

    # lcd -> profile selection
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "lcd_calibration", "section_payload": _lcd_payload()},
    )
    assert r.status_code == 200 and r.json()["state"] == "profile_selection"

    # profile selection -> ready
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "profile_selection", "section_payload": {"id": "T9"}},
    )
    body = r.json()
    assert r.status_code == 200
    assert body["state"] == "ready"
    assert body["is_ready"] is True

    # calibration is now on disk for this serial
    cal = client.get("/api/maschine/onboarding/calibration").json()["calibration"]
    assert cal is not None
    assert "pad_sensitivity" in cal and "pressure_curves" in cal and "lcd" in cal
    assert cal["selected_profile"] == {"id": "T9"}


def test_reconnect_after_calibration_hot_loads(client: TestClient) -> None:
    # First run a full calibration so the YAML exists.
    test_full_calibration_flow_to_ready(client)
    # A fresh connect for the same serial should hot-load straight to READY.
    body = _connect(client)
    assert body["state"] == "ready"
    assert body["is_ready"] is True


def test_erase_skip_during_tour_goes_ready_with_defaults(client: TestClient) -> None:
    _connect(client)
    r = client.post("/api/maschine/onboarding/skip")
    assert r.status_code == 200 and r.json()["state"] == "ready"
    # Default calibration was written; a reconnect hot-loads.
    body = _connect(client)
    assert body["state"] == "ready"


def test_tour_complete_out_of_order_returns_409(client: TestClient) -> None:
    # Without connecting, the machine is IDLE; tour-complete is illegal.
    r = client.post("/api/maschine/onboarding/tour-complete")
    assert r.status_code == 409


def test_phase_complete_wrong_phase_returns_409(client: TestClient) -> None:
    _connect(client)
    client.post("/api/maschine/onboarding/tour-complete")  # now PAD_SENSITIVITY
    # Submitting pressure_curves while in pad_sensitivity is illegal.
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "pressure_curves", "section_payload": _pressure_curves_payload()},
    )
    assert r.status_code == 409


def test_phase_complete_bad_payload_returns_400(client: TestClient) -> None:
    _connect(client)
    client.post("/api/maschine/onboarding/tour-complete")  # PAD_SENSITIVITY
    # Pad-sensitivity payload must be a 16-entry list; send a malformed one.
    r = client.post(
        "/api/maschine/onboarding/phase-complete",
        json={"phase": "pad_sensitivity", "section_payload": [{"threshold": 8}]},
    )
    assert r.status_code == 400


def test_reset_returns_machine_to_idle(client: TestClient) -> None:
    _connect(client)
    r = client.post("/api/maschine/onboarding/reset")
    assert r.status_code == 200
    assert r.json()["state"] == "idle"
    # A fresh connect works again after reset.
    assert _connect(client)["state"] == "tour"


def test_connect_twice_restarts_cleanly(client: TestClient) -> None:
    _connect(client)
    client.post("/api/maschine/onboarding/tour-complete")  # advance past IDLE
    # Connecting again (e.g. operator restarts the wizard) must not 409.
    body = _connect(client)
    assert body["state"] == "tour"


def test_profile_catalog_lists_t1_through_t25(client: TestClient) -> None:
    resp = client.get("/api/maschine/onboarding/profile-catalog")
    assert resp.status_code == 200
    profiles = resp.json()["profiles"]
    assert len(profiles) == 25
    ids = {p["id"] for p in profiles}
    assert ids == {f"T{n}" for n in range(1, 26)}
    # Every entry carries a display name + source for the picker UI.
    assert all(p["name"] and p["source"] in {"json", "code"} for p in profiles)
