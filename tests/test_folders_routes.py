from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import folders as folder_routes


class _FakeScanner:
    def __init__(self) -> None:
        self.base_paths = {
            "nams": "/srv/map2/nams",
            "irs": "/srv/map2/irs",
            "lv2": "/srv/map2/lv2",
        }
        self.calls: list[str] = []

    def get_folder_stats(self):
        return {
            "nams": {"count": 2, "changed": 1},
            "irs": {"count": 3, "changed": 0},
            "lv2": {"count": 4, "changed": 2},
        }

    async def scan_nams(self):
        self.calls.append("nams")
        return {"count": 2}

    async def scan_irs(self):
        self.calls.append("irs")
        return {"count": 3}

    async def scan_lv2(self):
        self.calls.append("lv2")
        return {"count": 4}

    async def scan_all(self):
        self.calls.append("all")
        return {"nams": 2, "irs": 3, "lv2": 4}


def _build_client(monkeypatch, scanner: _FakeScanner) -> TestClient:
    app = FastAPI()
    app.include_router(folder_routes.router)
    monkeypatch.setattr(folder_routes, "get_folder_scanner", lambda: scanner)
    return TestClient(app)


def test_stats_paths_and_storage_routes_use_scanner_and_storage_paths(monkeypatch):
    scanner = _FakeScanner()
    client = _build_client(monkeypatch, scanner)
    monkeypatch.setattr(
        folder_routes.StoragePaths,
        "get_display_paths",
        staticmethod(
            lambda: {
                "nam_models": "/srv/map2/nams",
                "nam_models_display": "~/MAP2/NAMs",
                "ir_cabinets": "/srv/map2/irs/cabinets",
            }
        ),
    )
    monkeypatch.setattr(
        folder_routes.StoragePaths,
        "get_storage_info",
        staticmethod(
            lambda: {
                "roots": {
                    "nams": {"path": "/srv/map2/nams", "exists": True},
                    "irs": {"path": "/srv/map2/irs", "exists": True},
                }
            }
        ),
    )

    stats_response = client.get("/api/folders/stats")
    paths_response = client.get("/api/folders/paths")
    display_response = client.get("/api/folders/display-paths")
    storage_response = client.get("/api/folders/storage-info")

    assert stats_response.status_code == 200
    assert stats_response.json() == {
        "nams": {"count": 2, "changed": 1},
        "irs": {"count": 3, "changed": 0},
        "lv2": {"count": 4, "changed": 2},
    }
    assert paths_response.status_code == 200
    assert paths_response.json() == scanner.base_paths
    assert display_response.status_code == 200
    assert display_response.json() == {
        "nam_models": "/srv/map2/nams",
        "nam_models_display": "~/MAP2/NAMs",
        "ir_cabinets": "/srv/map2/irs/cabinets",
    }
    assert storage_response.status_code == 200
    assert storage_response.json() == {
        "roots": {
            "nams": {"path": "/srv/map2/nams", "exists": True},
            "irs": {"path": "/srv/map2/irs", "exists": True},
        }
    }


def test_scan_route_validates_selection_and_runs_requested_background_scans(monkeypatch):
    scanner = _FakeScanner()
    client = _build_client(monkeypatch, scanner)
    folder_routes._scan_in_progress = False

    invalid_response = client.post(
        "/api/folders/scan",
        json={"scan_nams": False, "scan_irs": False, "scan_lv2": False},
    )

    assert invalid_response.status_code == 400
    assert invalid_response.json() == {"detail": "No folders selected for scanning"}

    valid_response = client.post(
        "/api/folders/scan",
        json={"scan_nams": True, "scan_irs": False, "scan_lv2": True},
    )

    assert valid_response.status_code == 200
    assert valid_response.json() == {
        "status": "started",
        "message": "Scanning folders: NAMs, LV2",
        "scan_types": ["NAMs", "LV2"],
    }
    assert scanner.calls == ["nams", "lv2"]
    assert folder_routes._scan_in_progress is False


def test_scan_status_conflicts_and_single_surface_routes(monkeypatch):
    scanner = _FakeScanner()
    client = _build_client(monkeypatch, scanner)
    folder_routes._scan_in_progress = False

    idle_response = client.get("/api/folders/scan/status")
    assert idle_response.status_code == 200
    assert idle_response.json() == {
        "scanning": False,
        "message": "No scan running",
    }

    all_response = client.post("/api/folders/scan/all")
    nam_response = client.post("/api/folders/scan/nams")
    ir_response = client.post("/api/folders/scan/irs")
    lv2_response = client.post("/api/folders/scan/lv2")

    assert all_response.status_code == 200
    assert nam_response.status_code == 200
    assert ir_response.status_code == 200
    assert lv2_response.status_code == 200
    assert scanner.calls == ["all", "nams", "irs", "lv2"]

    folder_routes._scan_in_progress = True
    try:
        conflict_response = client.post("/api/folders/scan/all")
        active_status = client.get("/api/folders/scan/status")
    finally:
        folder_routes._scan_in_progress = False

    assert conflict_response.status_code == 409
    assert conflict_response.json() == {"detail": "Scan already in progress"}
    assert active_status.status_code == 200
    assert active_status.json() == {
        "scanning": True,
        "message": "Scan in progress",
    }


def test_counts_route_categorizes_assets_from_centralized_storage(monkeypatch, tmp_path):
    nam_root = tmp_path / "nams"
    ir_root = tmp_path / "irs"
    home_dir = tmp_path / "home"
    home_dir.mkdir()
    (nam_root / "amp").mkdir(parents=True)
    (ir_root / "cabinet").mkdir(parents=True)
    (ir_root / "reverb").mkdir(parents=True)
    (ir_root / "misc").mkdir(parents=True)

    (nam_root / "amp" / "edge.nam").write_bytes(b"nam")
    (nam_root / "amp" / "ignore.txt").write_text("skip", encoding="utf-8")
    (ir_root / "cabinet" / "cab.wav").write_bytes(b"cab")
    (ir_root / "reverb" / "hall.flac").write_bytes(b"hall")
    (ir_root / "misc" / "room.aiff").write_bytes(b"misc")

    client = _build_client(monkeypatch, _FakeScanner())
    monkeypatch.setattr(folder_routes.StoragePaths, "get_all_nam_paths", staticmethod(lambda: [nam_root]))
    monkeypatch.setattr(folder_routes.StoragePaths, "get_all_ir_paths", staticmethod(lambda: [ir_root]))
    monkeypatch.setattr(folder_routes.Path, "home", staticmethod(lambda: home_dir))

    real_exists = os.path.exists

    def _fake_exists(path):
        path_str = os.fspath(path)
        if path_str in {
            "/usr/lib/lv2",
            "/usr/lib64/lv2",
            "/usr/local/lib/lv2",
            "/usr/lib/x86_64-linux-gnu/lv2",
            "/usr/lib/aarch64-linux-gnu/lv2",
        }:
            return False
        return real_exists(path)

    monkeypatch.setattr(os.path, "exists", _fake_exists)

    response = client.get("/api/folders/counts")

    assert response.status_code == 200
    assert response.json() == {
        "nams": 1,
        "irs": {
            "total": 3,
            "cabinets": 1,
            "reverbs": 1,
            "other": 1,
        },
        "lv2": {
            "system": 0,
            "user": 0,
            "total": 0,
        },
    }
