from __future__ import annotations

from dataclasses import dataclass
import io
from unittest.mock import AsyncMock, MagicMock, patch
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.routes import tesira as tesira_routes


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(tesira_routes.router)
    return TestClient(app, raise_server_exceptions=False)


def _make_device():
    dev = MagicMock()
    dev.device_id = "tesira_dev_1"
    dev.connected = True
    dev.set_eq_band_gain = AsyncMock()
    dev.set_eq_band_q = AsyncMock()
    return dev


def test_set_eq_gain_and_q_routes(client):
    device = _make_device()
    with patch("app.routes.tesira._get_device", return_value=device):
        gain_resp = client.put(
            "/api/tesira/devices/tesira_dev_1/eq/PEQ1/band/1/gain",
            json={"gain_db": 3.5},
        )
        q_resp = client.put(
            "/api/tesira/devices/tesira_dev_1/eq/PEQ1/band/1/q",
            json={"q": 1.2},
        )

    assert gain_resp.status_code == 200
    assert q_resp.status_code == 200
    assert device.set_eq_band_gain.await_count == 1
    assert device.set_eq_band_q.await_count == 1


@dataclass
class _ProbeResult:
    def to_dict(self):
        return {"device_id": "tesira_dev_1", "discovered_count": 1, "blocks": [], "errors": []}


def test_dsp_probe_route(client):
    device = _make_device()
    model = MagicMock()
    model.probe_device = AsyncMock(return_value=_ProbeResult())
    with patch("app.routes.tesira._get_device", return_value=device), patch(
        "app.routes.tesira._get_dsp_model", return_value=model
    ):
        response = client.post("/api/tesira/devices/tesira_dev_1/dsp/probe")

    assert response.status_code == 200
    body = response.json()
    assert body["device_id"] == "tesira_dev_1"
    assert body["discovered_count"] == 1


@dataclass
class _GpioResp:
    ok: bool
    value: object = None
    raw: str = ""
    error_code: str | None = None
    error_detail: str | None = None


def test_gpio_set_route(client):
    device = _make_device()
    device._client = MagicMock()
    device._client.send = AsyncMock(return_value=_GpioResp(ok=True, value=True))

    with patch("app.routes.tesira._get_device", return_value=device):
        response = client.put("/api/tesira/devices/tesira_dev_1/gpio/1", json={"state": True})

    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_raw_ttp_command_route(client):
    device = _make_device()
    device._client = MagicMock()
    device._client.send = AsyncMock(return_value=_GpioResp(ok=True, value="TesiraFORTE-1", error_code=None, error_detail=None, raw='+OK value="TesiraFORTE-1"'))

    with patch("app.routes.tesira._get_device", return_value=device):
        response = client.post(
            "/api/tesira/devices/tesira_dev_1/command",
            json={"command": "DEVICE get hostname"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["value"] == "TesiraFORTE-1"
    device._client.send.assert_awaited_once_with("DEVICE", "get", "hostname")


def test_raw_ttp_command_route_accepts_two_token_command(client):
    device = _make_device()
    device._client = MagicMock()
    device._client.send = AsyncMock(return_value=_GpioResp(ok=True, value=None, error_code=None, error_detail=None, raw="+OK"))

    with patch("app.routes.tesira._get_device", return_value=device):
        response = client.post(
            "/api/tesira/devices/tesira_dev_1/command",
            json={"command": "DEVICE reboot"},
        )

    assert response.status_code == 200
    device._client.send.assert_awaited_once_with("DEVICE", "reboot", "")


def test_raw_ttp_command_route_rejects_short_command(client):
    device = _make_device()
    device._client = MagicMock()
    device._client.send = AsyncMock()

    with patch("app.routes.tesira._get_device", return_value=device):
        response = client.post(
            "/api/tesira/devices/tesira_dev_1/command",
            json={"command": "DEVICE"},
        )

    assert response.status_code == 400
    device._client.send.assert_not_called()


def test_layout_catalog_routes(client):
    catalog = MagicMock()
    catalog.list_layouts = AsyncMock(
        return_value=[
            {
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Forte CI Default",
                "device_family": "FORTE_CI",
                "checksum": "sha256:abc",
                "is_active": True,
            }
        ]
    )
    catalog.import_layout = AsyncMock(
        return_value={
            "layout_id": "forte_ci_default",
            "version": "1.0.0",
            "name": "Forte CI Default",
            "device_family": "FORTE_CI",
            "checksum": "sha256:abc",
            "is_active": True,
        }
    )
    catalog.get_layout = AsyncMock(return_value=None)

    with patch("app.routes.tesira._get_layout_catalog", return_value=catalog):
        list_resp = client.get("/api/tesira/layouts")
        import_resp = client.post(
            "/api/tesira/layouts/import",
            json={
                "layout_id": "forte_ci_default",
                "version": "1.0.0",
                "name": "Forte CI Default",
                "device_family": "FORTE_CI",
                "checksum": "sha256:abc",
            },
        )
        missing_resp = client.get("/api/tesira/layouts/missing")

    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1
    assert import_resp.status_code == 200
    assert import_resp.json()["layout"]["layout_id"] == "forte_ci_default"
    assert missing_resp.status_code == 404


def test_sagevue_status_route(client):
    response = client.get("/api/tesira/sagevue/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["enabled"] is False
    assert payload["healthy"] is False
    assert payload["manual_upload_required"] is True


def test_deployment_routes(client):
    start_resp = client.post(
        "/api/tesira/devices/tesira_dev_1/deploy",
        json={
            "layout_id": "forte_ci_default",
            "layout_version": "1.0.0",
            "dry_run": True,
        },
    )
    get_resp = client.get("/api/tesira/deployments/job-1")
    rollback_resp = client.post(
        "/api/tesira/deployments/job-1/rollback",
        json={"requested_by": "tester"},
    )

    assert start_resp.status_code == 410
    assert get_resp.status_code == 410
    assert rollback_resp.status_code == 410


def test_get_deployment_not_found_returns_404(client):
    response = client.get("/api/tesira/deployments/missing-job")

    assert response.status_code == 410


def test_manual_package_download_route(client):
    catalog = MagicMock()
    catalog.get_layout = AsyncMock(
        return_value={
            "layout_id": "forte_ci_default",
            "version": "1.0.0",
            "name": "Forte CI Default",
            "device_family": "FORTE_CI",
            "checksum": "sha256:abc",
            "artifact_uri": "",
            "instance_tag_map": {"LevelControl1": "level"},
            "feature_flags": ["levels"],
            "notes": "demo",
        }
    )

    with patch("app.routes.tesira._get_layout_catalog", return_value=catalog):
        response = client.get("/api/tesira/layouts/forte_ci_default/manual-package?version=1.0.0")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")

    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert "README_UPLOAD_TO_SAGEVUE.md" in names
    assert "forte_ci_default_1.0.0.manifest.json" in names
    assert "MISSING_TMF.txt" in names


def test_manual_package_download_bundles_local_tmf_file(client, tmp_path):
    tmf_path = tmp_path / "forte_ci_default.tmf"
    tmf_path.write_bytes(b"fake-tmf-content")

    catalog = MagicMock()
    catalog.get_layout = AsyncMock(
        return_value={
            "layout_id": "forte_ci_default",
            "version": "1.0.0",
            "name": "Forte CI Default",
            "device_family": "FORTE_CI",
            "checksum": "sha256:abc",
            "artifact_uri": str(tmf_path),
            "instance_tag_map": {},
            "feature_flags": [],
            "notes": None,
        }
    )

    with patch("app.routes.tesira._get_layout_catalog", return_value=catalog):
        response = client.get("/api/tesira/layouts/forte_ci_default/manual-package?version=1.0.0")

    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert "forte_ci_default_1.0.0.tmf" in names
    assert "MISSING_TMF.txt" not in names


def test_design_workspace_routes(client):
    design_service = MagicMock()
    design_service.design_block_library = MagicMock(
        return_value=[
            {"block_type": "AudioInput", "title": "Audio Input"},
            {"block_type": "AudioOutput", "title": "Audio Output"},
        ]
    )
    design_service.list_designs = AsyncMock(
        return_value=[
            {
                "design_id": "design_1",
                "device_id": "tesira_dev_1",
                "name": "Design 1",
                "graph": {"nodes": [], "edges": [], "groups": []},
            }
        ]
    )
    design_service.create_design = AsyncMock(
        return_value={
            "design_id": "design_1",
            "device_id": "tesira_dev_1",
            "name": "Design 1",
            "graph": {"nodes": [], "edges": [], "groups": []},
        }
    )
    design_service.get_design = AsyncMock(
        return_value={
            "design_id": "design_1",
            "device_id": "tesira_dev_1",
            "name": "Design 1",
            "graph": {"nodes": [], "edges": [], "groups": []},
        }
    )
    design_service.update_design = AsyncMock(
        return_value={
            "design_id": "design_1",
            "device_id": "tesira_dev_1",
            "name": "Design 1 Updated",
            "graph": {"nodes": [], "edges": [], "groups": []},
        }
    )
    design_service.delete_design = AsyncMock(return_value=True)
    design_service.validate_graph = MagicMock(return_value={"ok": True, "errors": [], "warnings": [], "counts": {"nodes": 0, "edges": 0, "groups": 0}})

    with patch("app.routes.tesira._get_design_workspace", return_value=design_service):
        library_resp = client.get("/api/tesira/devices/tesira_dev_1/designs/library")
        list_resp = client.get("/api/tesira/devices/tesira_dev_1/designs")
        create_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs",
            json={"name": "Design 1", "graph": {"nodes": [], "edges": [], "groups": []}},
        )
        get_resp = client.get("/api/tesira/devices/tesira_dev_1/designs/design_1")
        update_resp = client.put(
            "/api/tesira/devices/tesira_dev_1/designs/design_1",
            json={"name": "Design 1 Updated"},
        )
        validate_resp = client.post("/api/tesira/devices/tesira_dev_1/designs/design_1/validate", json={})
        delete_resp = client.delete("/api/tesira/devices/tesira_dev_1/designs/design_1")

    assert library_resp.status_code == 200
    assert library_resp.json()["count"] == 2
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1
    assert create_resp.status_code == 200
    assert create_resp.json()["design"]["design_id"] == "design_1"
    assert get_resp.status_code == 200
    assert update_resp.status_code == 200
    assert update_resp.json()["design"]["name"] == "Design 1 Updated"
    assert validate_resp.status_code == 200
    assert validate_resp.json()["validation"]["ok"] is True
    assert delete_resp.status_code == 200


def test_design_compile_routes(client):
    compiler = MagicMock()
    compiler.compile_design = AsyncMock(
        return_value={
            "device_id": "tesira_dev_1",
            "design_id": "design_1",
            "status": "COMPILED",
            "compile_status": "COMPILED",
            "compile_revision": 1,
            "graph_hash": "abc123",
            "compiled_at": "2026-03-08T20:00:00",
            "diagnostics": {"validation": {"ok": True}},
            "artifact": {"artifact_id": "compiled_design_1"},
        }
    )
    compiler.compile_active = AsyncMock(
        return_value={"device_id": "tesira_dev_1", "count": 1, "results": []}
    )
    compiler.compile_all = AsyncMock(
        return_value={"device_id": "tesira_dev_1", "count": 2, "results": []}
    )
    compiler.get_diagnostics = AsyncMock(
        return_value={
            "device_id": "tesira_dev_1",
            "design_id": "design_1",
            "compile_status": "COMPILED",
            "compile_revision": 1,
            "graph_hash": "abc123",
            "compiled_at": "2026-03-08T20:00:00",
            "diagnostics": {"validation": {"ok": True}},
        }
    )

    with patch("app.routes.tesira._get_design_compiler", return_value=compiler):
        compile_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/design_1/compile",
            json={"optimize": True, "recompile": False},
        )
        recompile_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/design_1/recompile",
            json={"optimize": True},
        )
        active_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/compile-active",
            json={"optimize": True},
        )
        all_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/compile-all",
            json={"optimize": False, "include_templates": False},
        )
        uncompiled_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/compile-uncompiled",
            json={"optimize": True},
        )
        diagnostics_resp = client.get("/api/tesira/devices/tesira_dev_1/designs/design_1/diagnostics")

    assert compile_resp.status_code == 200
    assert compile_resp.json()["status"] == "COMPILED"
    assert recompile_resp.status_code == 200
    assert active_resp.status_code == 200
    assert active_resp.json()["count"] == 1
    assert all_resp.status_code == 200
    assert all_resp.json()["count"] == 2
    assert uncompiled_resp.status_code == 200
    assert diagnostics_resp.status_code == 200
    assert diagnostics_resp.json()["compile_status"] == "COMPILED"


def test_design_compile_routes_not_found(client):
    compiler = MagicMock()
    compiler.compile_design = AsyncMock(side_effect=ValueError("Design 'missing' not found"))
    compiler.get_diagnostics = AsyncMock(side_effect=ValueError("Design 'missing' not found"))

    with patch("app.routes.tesira._get_design_compiler", return_value=compiler):
        compile_resp = client.post(
            "/api/tesira/devices/tesira_dev_1/designs/missing/compile",
            json={},
        )
        diagnostics_resp = client.get("/api/tesira/devices/tesira_dev_1/designs/missing/diagnostics")

    assert compile_resp.status_code == 404
    assert diagnostics_resp.status_code == 404


def test_design_library_route_invalid_profile_returns_400(client):
    design_service = MagicMock()
    design_service.design_block_library = MagicMock(side_effect=ValueError("Unknown Tesira block registry profile 'bad'"))

    with patch("app.routes.tesira._get_design_workspace", return_value=design_service):
        response = client.get("/api/tesira/devices/tesira_dev_1/designs/library?profile=bad")

    assert response.status_code == 400
