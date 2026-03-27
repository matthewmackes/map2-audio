from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import upload as upload_routes
from app.routes import preset_exchange as preset_exchange_routes
from app.services.upload_service import AssetType, UploadResult, ValidationResult


class _FakeUploadService:
    def __init__(self) -> None:
        self.validate_calls: list[tuple[str | None, int, str | None]] = []
        self.save_calls: list[tuple[str | None, bytes, AssetType]] = []

    def validate_file(self, filename: str | None, file_size: int, asset_type_override: str | None = None):
        self.validate_calls.append((filename, file_size, asset_type_override))
        if filename and filename.endswith(".wav") and asset_type_override is None:
            return ValidationResult(
                valid=False,
                asset_type=None,
                message="Audio files require type selection",
                details={
                    "requires_type": True,
                    "options": ["cabinet_ir", "reverb_ir"],
                },
            )
        if filename and filename.endswith(".txt"):
            return ValidationResult(
                valid=False,
                asset_type=None,
                message="Unsupported file type: .txt",
                details={},
            )
        return ValidationResult(
            valid=True,
            asset_type=AssetType.NAM,
            message="Valid nam file",
            details={"detected_type": "nam"},
        )

    async def save_upload(self, filename: str | None, content: bytes, asset_type: AssetType):
        self.save_calls.append((filename, content, asset_type))
        return UploadResult(
            success=True,
            asset_type=asset_type,
            filename=filename or "",
            file_path=f"/srv/map2/{filename}",
            file_size=len(content),
            file_hash="hash-123",
            message="Saved",
        )


def _build_client(monkeypatch, service: _FakeUploadService | None = None) -> tuple[TestClient, _FakeUploadService]:
    fake_service = service or _FakeUploadService()
    app = FastAPI()
    app.include_router(upload_routes.router)
    monkeypatch.setattr(upload_routes, "get_upload_service", lambda: fake_service)
    return TestClient(app), fake_service


def test_single_preset_upload_uses_preset_exchange_import(monkeypatch):
    recorded: dict[str, object] = {}

    async def _fake_import_preset_bytes(*, filename, content, plugin_uri, save_to_library):
        recorded.update(
            filename=filename,
            content=content,
            plugin_uri=plugin_uri,
            save_to_library=save_to_library,
        )
        return {
            "success": True,
            "preset_id": "preset-42",
            "checksum": "preset-hash",
            "message": "Preset imported",
        }

    client, service = _build_client(monkeypatch)
    monkeypatch.setattr(preset_exchange_routes, "import_preset_bytes", _fake_import_preset_bytes)

    response = client.post(
        "/api/upload/",
        data={"asset_type": "preset"},
        files={"file": ("lead.map2preset", b"preset-data", "application/octet-stream")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "asset_type": "preset",
        "filename": "lead.map2preset",
        "file_path": "plugin-preset:preset-42",
        "file_size": 11,
        "file_hash": "preset-hash",
        "message": "Preset imported",
        "error": None,
        "already_exists": False,
    }
    assert recorded == {
        "filename": "lead.map2preset",
        "content": b"preset-data",
        "plugin_uri": None,
        "save_to_library": True,
    }
    assert service.validate_calls == []
    assert service.save_calls == []


def test_single_upload_returns_requires_type_payload_for_audio_files(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.post(
        "/api/upload/",
        files={"file": ("cab.wav", b"wave-data", "audio/wav")},
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": {
            "message": "Audio files require type selection",
            "requires_type": True,
            "options": ["cabinet_ir", "reverb_ir"],
        }
    }
    assert service.validate_calls == [("cab.wav", 9, None)]
    assert service.save_calls == []


def test_batch_upload_reports_success_and_failure_per_file(monkeypatch):
    client, service = _build_client(monkeypatch)

    response = client.post(
        "/api/upload/batch",
        files=[
            ("files", ("good.nam", b"nam-data", "application/octet-stream")),
            ("files", ("bad.txt", b"nope", "text/plain")),
        ],
    )

    assert response.status_code == 200
    assert response.json() == {
        "total": 2,
        "successful": 1,
        "failed": 1,
        "results": [
            {
                "success": True,
                "asset_type": "nam",
                "filename": "good.nam",
                "file_path": "/srv/map2/good.nam",
                "file_size": 8,
                "file_hash": "hash-123",
                "message": "Saved",
                "error": None,
                "already_exists": False,
            },
            {
                "success": False,
                "asset_type": "unknown",
                "filename": "bad.txt",
                "file_path": "",
                "file_size": 4,
                "file_hash": "",
                "message": "Unsupported file type: .txt",
                "error": "Unsupported file type: .txt",
                "already_exists": False,
            },
        ],
    }
    assert service.save_calls == [("good.nam", b"nam-data", AssetType.NAM)]
