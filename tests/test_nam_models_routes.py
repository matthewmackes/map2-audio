from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import nam_models as nam_routes


class _FakeRecord:
    def __init__(self, **payload) -> None:
        self.id = payload.get("id")
        self.file_path = payload.get("file_path")
        self.uploaded_at = payload.get("uploaded_at")
        self._payload = payload

    def to_dict(self):
        return dict(self._payload)


class _FakeLibraryService:
    def __init__(self) -> None:
        self.list_calls: list[dict[str, object]] = []
        self.deleted: list[str] = []
        self.records = [
            _FakeRecord(
                id=1,
                name="Edge",
                author="Alice",
                version=2,
                architecture="lstm",
                sample_rate=48000,
                file_hash="hash-1",
                file_size_mb=1.5,
                metadata={"gain": 0.7},
                uploaded_at="2026-03-26T18:00:00Z",
            )
        ]
        self.model = None

    def list_models(self, *, skip, limit, architecture, author):
        self.list_calls.append(
            {
                "skip": skip,
                "limit": limit,
                "architecture": architecture,
                "author": author,
            }
        )
        return list(self.records)

    def get_model(self, model_name):
        return self.model

    def delete_model(self, model_name):
        self.deleted.append(model_name)


class _FakeProcessor:
    def __init__(self) -> None:
        self.valid = True

    def parse_nam_file(self, _path: Path):
        return SimpleNamespace(name="Edge", author="Alice")

    def validate_nam_model(self, _model):
        return self.valid

    def get_model_info(self, _model):
        return {
            "name": "Edge",
            "author": "Alice",
            "version": 2,
            "architecture": "lstm",
            "sample_rate": 48000,
            "file_hash": "hash-1",
            "file_size_mb": 1.5,
            "metadata": {"gain": 0.7},
        }


def _build_client(monkeypatch, *, library_service=None, processor=None) -> TestClient:
    app = FastAPI()
    app.include_router(nam_routes.router)
    monkeypatch.setattr(nam_routes, "get_nam_library_service", lambda: library_service or _FakeLibraryService())
    monkeypatch.setattr(nam_routes, "get_nam_processor", lambda: processor or _FakeProcessor())
    return TestClient(app)


def test_list_nam_models_passes_filters_to_library_service(monkeypatch):
    library_service = _FakeLibraryService()
    client = _build_client(monkeypatch, library_service=library_service)

    response = client.get("/api/nam/library/?skip=2&limit=5&architecture=lstm&author=Alice")

    assert response.status_code == 200
    assert library_service.list_calls == [
        {
            "skip": 2,
            "limit": 5,
            "architecture": "lstm",
            "author": "Alice",
        }
    ]
    assert response.json() == {
        "status": "ok",
        "total": 1,
        "models": [
            {
                "id": 1,
                "name": "Edge",
                "author": "Alice",
                "version": 2,
                "architecture": "lstm",
                "sample_rate": 48000,
                "file_hash": "hash-1",
                "file_size_mb": 1.5,
                "metadata": {"gain": 0.7},
                "uploaded_at": "2026-03-26T18:00:00Z",
            }
        ],
    }


def test_validate_nam_file_reports_valid_model(monkeypatch):
    client = _build_client(monkeypatch, processor=_FakeProcessor())

    response = client.post(
        "/api/nam/library/validate",
        files={"file": ("edge.nam", b"model-bytes", "application/octet-stream")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "valid": True,
        "model": {
            "name": "Edge",
            "author": "Alice",
            "version": 2,
            "architecture": "lstm",
            "sample_rate": 48000,
            "file_hash": "hash-1",
            "file_size_mb": 1.5,
            "metadata": {"gain": 0.7},
        },
        "message": "Model is valid",
    }


def test_delete_nam_model_removes_file_and_record(monkeypatch):
    library_service = _FakeLibraryService()
    with TemporaryDirectory() as tmpdir:
        model_path = Path(tmpdir) / "Edge.nam"
        model_path.write_bytes(b"model")
        library_service.model = _FakeRecord(file_path=str(model_path))
        client = _build_client(monkeypatch, library_service=library_service)

        response = client.delete("/api/nam/library/Edge")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "NAM model 'Edge' deleted"}
    assert library_service.deleted == ["Edge"]
    assert not model_path.exists()
