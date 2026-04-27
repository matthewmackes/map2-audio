"""Measure-latency route storage-plane tests."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import devices as devices_routes
from app.services.controllers.controller_service import (
    get_controller_service,
    reset_controller_service_for_tests,
)
from app.services.controllers.profile_registry import reset_profile_registry_for_tests
from scripts.measure_loopback_ir import MeasurementResult, TrialResult


def _client_with_loaded_packs() -> TestClient:
    reset_profile_registry_for_tests()
    reset_controller_service_for_tests()
    get_controller_service().start()
    app = FastAPI()
    app.include_router(devices_routes.router)
    return TestClient(app)


def _measurement_result() -> MeasurementResult:
    trial = TrialResult(
        rtt_ms=5.0,
        peak_correlation=0.95,
        secondary_peak_ratio=0.1,
    )
    return MeasurementResult(
        sample_rate=48000,
        duration_ms=50,
        tail_ms=20,
        trials=(trial,),
        mean_rtt_ms=5.0,
        p95_rtt_ms=5.0,
        jitter_p95_ms=0.0,
        method="synthetic",
        notes="test measurement",
    )


def test_measure_latency_writes_service_plane_evidence(tmp_path, monkeypatch):
    state_dir = tmp_path / "state"
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(state_dir))
    monkeypatch.setattr(
        "scripts.measure_loopback_ir.measure_loopback_ir",
        lambda **_: _measurement_result(),
    )
    client = _client_with_loaded_packs()

    response = client.post(
        "/api/devices/measure-latency",
        json={
            "pack_id": "hotone",
            "model": "jogg",
            "trials": 1,
            "duration_ms": 50,
            "tail_ms": 20,
        },
    )

    assert response.status_code == 200
    body = response.json()
    evidence_path = body["evidence_path"]
    assert evidence_path.startswith(str(state_dir / "fit-for-purpose-evidence"))
    assert (state_dir / "fit-for-purpose-evidence").is_dir()
    assert Path(evidence_path).is_file()

    history = client.get(
        "/api/devices/measure-latency/history",
        params={"pack_id": "hotone", "model": "jogg"},
    )
    assert history.status_code == 200
    assert history.json()["history"][0]["evidence_path"] == evidence_path


def test_measure_latency_returns_structured_503_when_evidence_unwritable(tmp_path, monkeypatch):
    state_file = tmp_path / "state-file"
    state_file.write_text("not a directory", encoding="utf-8")
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(state_file))
    monkeypatch.setattr(
        "scripts.measure_loopback_ir.measure_loopback_ir",
        lambda **_: _measurement_result(),
    )
    client = _client_with_loaded_packs()

    response = client.post(
        "/api/devices/measure-latency",
        json={
            "pack_id": "hotone",
            "model": "jogg",
            "trials": 1,
            "duration_ms": 50,
            "tail_ms": 20,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "evidence_write_failed"
