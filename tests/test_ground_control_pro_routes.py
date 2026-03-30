from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import ground_control_pro as ground_control_pro_routes
from app.services.ground_control_pro.service import GroundControlProService

from tests.test_ground_control_pro_service import _FakeTransport


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro"


def _read_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def _build_client(monkeypatch, tmp_path: Path, *, captures: list[bytes] | None = None) -> tuple[TestClient, GroundControlProService, _FakeTransport]:
    transport = _FakeTransport(captures)
    service = GroundControlProService(base_dir=tmp_path, transport=transport)
    app = FastAPI()
    app.include_router(ground_control_pro_routes.router)
    monkeypatch.setattr(ground_control_pro_routes, "get_ground_control_pro_service", lambda: service)
    return TestClient(app), service, transport


def test_ground_control_pro_routes_import_compile_export_and_download(monkeypatch, tmp_path: Path) -> None:
    client, _service, _transport = _build_client(monkeypatch, tmp_path)
    fixture = _read_fixture("factory_default_v113.syx")

    import_response = client.post(
        "/api/ground-control-pro/import",
        files={"file": ("factory_default_v113.syx", fixture, "application/octet-stream")},
    )

    assert import_response.status_code == 200
    imported = import_response.json()
    session_id = imported["session_id"]

    export_response = client.post("/api/ground-control-pro/export/json", json={"session_id": session_id})
    assert export_response.status_code == 200
    assert export_response.json()["artifact"]["kind"] == "json_export"

    draft = deepcopy(imported["model"])
    draft["presets"][0]["name"] = "LEAD A"
    compile_response = client.post(
        "/api/ground-control-pro/compile",
        json={"session_id": session_id, "model": draft},
    )

    assert compile_response.status_code == 200
    compiled_artifact_id = compile_response.json()["artifact"]["artifact_id"]

    artifact_response = client.get(f"/api/ground-control-pro/artifacts/{compiled_artifact_id}")
    assert artifact_response.status_code == 200
    assert artifact_response.json()["artifact_id"] == compiled_artifact_id

    download_response = client.get(f"/api/ground-control-pro/artifacts/{compiled_artifact_id}?download=true")
    assert download_response.status_code == 200
    assert download_response.content.startswith(b"\xF0\x00\x00\x07\x10")


def test_ground_control_pro_routes_backup_push_and_diff(monkeypatch, tmp_path: Path) -> None:
    fixture = _read_fixture("factory_default_v113.syx")
    client, _service, transport = _build_client(monkeypatch, tmp_path, captures=[fixture])

    backup_response = client.post(
        "/api/ground-control-pro/backup",
        json={"input_port_index": 0, "create_session": True},
    )

    assert backup_response.status_code == 200
    backup_job = backup_response.json()
    assert backup_job["status"] == "completed"

    session = backup_job["result"]["session"]
    session_id = session["session_id"]
    source_artifact_id = session["summary"]["source_artifact_id"]

    draft = deepcopy(session["model"])
    draft["global_config"]["devices"][0]["midi_channel"] = 7
    compile_response = client.post(
        "/api/ground-control-pro/compile",
        json={"session_id": session_id, "model": draft},
    )

    assert compile_response.status_code == 200
    compiled_artifact_id = compile_response.json()["artifact"]["artifact_id"]

    push_response = client.post(
        "/api/ground-control-pro/push",
        json={"compiled_artifact_id": compiled_artifact_id, "session_id": session_id, "output_port_index": 0},
    )

    assert push_response.status_code == 200
    assert push_response.json()["status"] == "completed"
    assert len(transport.sent_messages) == 1

    diff_response = client.post(
        "/api/ground-control-pro/diff",
        json={"left_artifact_id": source_artifact_id, "right_artifact_id": compiled_artifact_id},
    )

    assert diff_response.status_code == 200
    assert diff_response.json()["changed_count"] > 0
