from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import soundfonts as soundfont_routes


class _FakeManager:
    def __init__(self) -> None:
        self.scrapers = {"archive": object(), "community": object()}

    def get_libraries_info(self):
        return [
            {
                "name": "archive",
                "displayName": "Archive",
                "description": "Factory archive",
                "license": "CC0",
                "count": 4,
                "iconColor": "#123456",
            }
        ]

    def get_progress(self):
        return {"is_downloading": False, "progress_percent": 0.0, "stats": {"files": 0}}


def _build_client(monkeypatch, tmp_path: Path, *, manager=None) -> TestClient:
    user_dir = tmp_path / "user"
    download_dir = tmp_path / "downloads"
    user_dir.mkdir(parents=True)
    download_dir.mkdir(parents=True)

    app = FastAPI()
    app.include_router(soundfont_routes.router)
    monkeypatch.setattr(soundfont_routes.StoragePaths, "get_soundfont_user_dir", staticmethod(lambda: user_dir))
    monkeypatch.setattr(soundfont_routes.StoragePaths, "get_soundfont_download_dir", staticmethod(lambda: download_dir))
    monkeypatch.setattr(soundfont_routes, "get_sf_download_manager", lambda: manager or _FakeManager())
    monkeypatch.setattr(
        soundfont_routes,
        "attach_soundfont_summaries",
        lambda entries: [dict(entry, preset_summary={"count": 2}) for entry in entries],
    )
    monkeypatch.setattr(
        soundfont_routes,
        "parse_soundfont_presets",
        lambda path: [{"bank": 0, "program": 1, "name": f"Preset for {Path(path).name}"}],
    )
    return TestClient(app)


def test_list_soundfonts_scans_and_summarizes_files(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    sf_file = tmp_path / "user" / "community" / "Pianos" / "Grand.sf2"
    sf_file.parent.mkdir(parents=True)
    sf_file.write_bytes(b"soundfont")
    ignored = tmp_path / "downloads" / "archive" / "Bass" / "README.txt"
    ignored.parent.mkdir(parents=True)
    ignored.write_text("ignore", encoding="utf-8")

    response = client.get("/api/soundfonts/?include_presets=true&format=sf2")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["soundfonts"] == [
        {
            "name": "Grand",
            "filename": "Grand.sf2",
            "path": str(sf_file),
            "format": "sf2",
            "category": "Pianos",
            "library": "community",
            "size": 9,
            "preset_summary": {"count": 2},
        }
    ]


def test_get_soundfont_presets_returns_parser_payload(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    sf_file = tmp_path / "downloads" / "Example.sf2"
    sf_file.write_bytes(b"soundfont")

    response = client.get(f"/api/soundfonts/presets/?path={sf_file}")

    assert response.status_code == 200
    assert response.json() == {
        "path": str(sf_file),
        "presets": [{"bank": 0, "program": 1, "name": "Preset for Example.sf2"}],
        "total": 1,
    }


def test_get_soundfont_libraries_uses_download_manager(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path, manager=_FakeManager())

    response = client.get("/api/soundfonts/libraries/")

    assert response.status_code == 200
    assert response.json() == {
        "libraries": [
            {
                "name": "archive",
                "displayName": "Archive",
                "description": "Factory archive",
                "license": "CC0",
                "count": 4,
                "iconColor": "#123456",
            }
        ]
    }
