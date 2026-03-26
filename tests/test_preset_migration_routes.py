from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import preset_migration as migration_routes


class _FakeMigrator:
    def detect_version(self, preset_data):
        return preset_data.get("schema_version", "1.0.0")

    def needs_migration(self, preset_data):
        return preset_data.get("schema_version") != migration_routes.CURRENT_SCHEMA_VERSION

    def get_migration_info(self, _preset_data):
        return {"migration_steps": ["normalize-metadata", "upgrade-midi"]}

    def migrate(self, preset_data, *, target_version, preset_name, create_backup):
        if preset_data.get("fail"):
            return SimpleNamespace(
                success=False,
                errors=["bad preset"],
                original_version="1.0.0",
                steps_applied=["normalize-metadata"],
            )
        return SimpleNamespace(
            success=True,
            final_version=target_version,
            warnings=["legacy field preserved"],
            backup_path="/tmp/preset.backup",
        )

    def validate(self, preset_data, version):
        return [] if preset_data.get("valid", True) else [f"invalid for {version}"]


class _FakePresetManager:
    def list_presets(self):
        return [
            {"name": "Modern", "needs_migration": False},
            {"name": "Legacy", "needs_migration": True},
        ]

    def create_new_preset(self, name, plugins):
        return {
            "schema_version": migration_routes.CURRENT_SCHEMA_VERSION,
            "chain": {"name": name, "description": "", "plugins": plugins},
        }


def _build_client(monkeypatch) -> TestClient:
    app = FastAPI()
    app.include_router(migration_routes.router)
    monkeypatch.setattr(migration_routes, "PresetMigrator", _FakeMigrator)
    monkeypatch.setattr(migration_routes, "get_preset_manager", lambda: _FakePresetManager())
    return TestClient(app)


def test_detect_route_reports_current_schema_gap(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.post("/api/presets/migration/detect", json={"schema_version": "1.0.0"})

    assert response.status_code == 200
    assert response.json() == {
        "detected_version": "1.0.0",
        "current_version": migration_routes.CURRENT_SCHEMA_VERSION,
        "needs_migration": True,
        "migration_steps": ["normalize-metadata", "upgrade-midi"],
    }


def test_migrate_route_returns_structured_400_for_failures(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.post(
        "/api/presets/migration/migrate?target_version=2.0.0&create_backup=false",
        json={"schema_version": "1.0.0", "fail": True},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "message": "Migration failed",
        "errors": ["bad preset"],
        "original_version": "1.0.0",
        "steps_applied": ["normalize-metadata"],
    }


def test_list_route_counts_presets_needing_migration(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/presets/migration/list")

    assert response.status_code == 200
    assert response.json() == {
        "presets": [
            {"name": "Modern", "needs_migration": False},
            {"name": "Legacy", "needs_migration": True},
        ],
        "count": 2,
        "needs_migration_count": 1,
        "current_schema_version": migration_routes.CURRENT_SCHEMA_VERSION,
    }


def test_create_route_applies_query_description(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.post(
        "/api/presets/migration/create?name=My%20Preset&description=Lead&plugins=%5B%7B%22uri%22%3A%22map2%3A%2F%2Fplugin%22%7D%5D"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["version"] == migration_routes.CURRENT_SCHEMA_VERSION
    assert payload["preset"]["chain"]["name"] == "My Preset"
    assert payload["preset"]["chain"]["description"] == "Lead"
