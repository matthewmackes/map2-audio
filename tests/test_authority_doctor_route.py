"""T2431-J — authority doctor route smoke tests.

Exercises the doctor API surface without spinning up the full app — we
mount just the authority-doctor router on a minimal FastAPI TestClient.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.deployment.authority import (
    DeploymentModeAuthority,
    write_environment_projection,
)
from app.routes import authority_doctor


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(tmp_path / "etc"))
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(tmp_path / "var"))
    monkeypatch.setenv("MAP2_USER_DIR", str(tmp_path / "home"))
    app = FastAPI()
    app.include_router(authority_doctor.router)
    return TestClient(app)


def test_doctor_report_reports_missing_authority(client: TestClient) -> None:
    response = client.get("/api/authority/doctor/deployment-mode")
    assert response.status_code == 200
    body = response.json()
    assert body["authority_exists"] is False
    kinds = {finding["kind"] for finding in body["findings"]}
    assert "missing_authority" in kinds


def test_doctor_repair_without_authority_returns_409(client: TestClient) -> None:
    response = client.post("/api/authority/doctor/deployment-mode/repair")
    assert response.status_code == 409
    body = response.json()
    assert "authority" in body["detail"].lower()


def test_doctor_report_healthy_after_authority_and_projection(client: TestClient) -> None:
    authority = DeploymentModeAuthority()
    authority.write("AUDIO-NODE")
    write_environment_projection(authority)

    response = client.get("/api/authority/doctor/deployment-mode")
    assert response.status_code == 200
    body = response.json()
    assert body["healthy"] is True
    assert body["authority_mode"] == "AUDIO-NODE"


def test_doctor_repair_regenerates_projection_via_api(client: TestClient) -> None:
    authority = DeploymentModeAuthority()
    authority.write("ALL-IN-ONE")
    # No projection written yet → repair must produce one.

    response = client.post("/api/authority/doctor/deployment-mode/repair")
    assert response.status_code == 200
    body = response.json()
    assert body["healthy"] is True


def test_config_layers_summary_returns_plane_dump(client: TestClient) -> None:
    response = client.get("/api/authority/doctor/config-layers")
    assert response.status_code == 200
    body = response.json()
    assert "planes" in body
    plane_names = {entry["plane"] for entry in body["planes"]}
    assert "schema" in plane_names
