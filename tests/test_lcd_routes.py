from __future__ import annotations

import json
import pathlib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import lcd as lcd_routes


def test_save_lcd_preset_persists_utc_created_at(monkeypatch, tmp_path: Path):
    app = FastAPI()
    app.include_router(lcd_routes.router)
    client = TestClient(app)

    monkeypatch.setattr(pathlib.Path, "home", staticmethod(lambda: tmp_path))

    response = client.post(
        "/api/lcd/presets",
        json={"name": "Stage Left", "description": "Line check"},
    )

    assert response.status_code == 200
    assert response.json()["success"] is True

    preset_file = tmp_path / ".config" / "map2" / "lcd_presets" / "stage_left.json"
    persisted = json.loads(preset_file.read_text(encoding="utf-8"))

    created_at = datetime.fromisoformat(persisted["created_at"])
    assert created_at.tzinfo == timezone.utc
    assert isinstance(persisted["config"], dict)
