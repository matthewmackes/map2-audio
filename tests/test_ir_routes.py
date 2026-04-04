from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import ir as ir_routes
from app.services import ir_processor as ir_processor_module
from app.services.ir_processor import IRProcessor


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(ir_routes.router)
    return TestClient(app)


def test_list_cabinet_irs_skips_broken_library_entries(tmp_path, monkeypatch):
    cabinet_dir = tmp_path / "cabinets"
    reverb_dir = tmp_path / "reverbs"
    download_dir = tmp_path / "downloads"
    cabinet_dir.mkdir(parents=True)
    reverb_dir.mkdir(parents=True)

    good_ir = cabinet_dir / "good.wav"
    good_ir.write_bytes(b"RIFF")
    (cabinet_dir / "broken.wav").symlink_to(cabinet_dir / "missing.wav")

    monkeypatch.setattr(
        ir_processor_module.StoragePaths,
        "get_ir_cabinet_dir",
        staticmethod(lambda: cabinet_dir),
    )
    monkeypatch.setattr(
        ir_processor_module.StoragePaths,
        "get_ir_reverb_dir",
        staticmethod(lambda: reverb_dir),
    )
    monkeypatch.setattr(
        ir_processor_module.StoragePaths,
        "get_ir_download_dir",
        staticmethod(lambda: download_dir),
    )

    processor = IRProcessor()
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [
            item
            for item in processor.scan_irs(ir_type)
            if item["path"].startswith(str(cabinet_dir)) or item["path"].startswith(str(reverb_dir))
        ],
    )

    client = _build_client()
    response = client.get("/api/ir/cabinets")

    assert response.status_code == 200
    payload = response.json()

    assert payload["count"] == 1
    assert [item["name"] for item in payload["irs"]] == ["good"]
    assert [item["name"] for item in payload["cabinets"]] == ["good"]
    assert payload["irs"][0]["path"] == str(good_ir)
    assert payload["irs"][0]["type"] == "cabinet"
    assert payload["irs"][0]["size"] == 4
    assert payload["irs"][0]["size_mb"] > 0
