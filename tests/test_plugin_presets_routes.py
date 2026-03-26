from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import database as database_module
from app.routes import plugin_presets as preset_routes
from app.services import plugin_preset_lifecycle as lifecycle_module


def _init_temp_db(tmp_path: Path, filename: str) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / filename}")


def _build_client(monkeypatch, lifecycle: "_FakeLifecycle") -> TestClient:
    app = FastAPI()
    app.include_router(preset_routes.router)
    monkeypatch.setattr(lifecycle_module, "get_preset_lifecycle", lambda: lifecycle)
    return TestClient(app)


class _FakeLifecycle:
    def __init__(self) -> None:
        self.created: list[tuple[int, str, str, dict[str, object]]] = []
        self.deleted: list[tuple[int, str]] = []
        self.favorite_toggles: list[tuple[int, bool]] = []
        self.loaded: list[int] = []
        self.cleanup_days: list[int] = []
        self.started = 0
        self.stopped = 0

    async def on_preset_created(self, preset_id, name, plugin_uri, parameters):
        self.created.append((preset_id, name, plugin_uri, parameters))

    async def on_preset_deleted(self, preset_id, name):
        self.deleted.append((preset_id, name))

    async def on_preset_favorite_toggled(self, preset_id, is_favorite):
        self.favorite_toggles.append((preset_id, is_favorite))

    async def on_preset_loaded(self, preset_id):
        self.loaded.append(preset_id)

    async def cleanup_unused_presets(self, days_threshold):
        self.cleanup_days.append(days_threshold)
        return 2

    async def get_usage_stats(self):
        return {"total_presets": 3, "favorite_presets": 1}

    async def startup(self):
        self.started += 1

    async def shutdown(self):
        self.stopped += 1


async def _seed_preset(
    *,
    name: str,
    plugin_uri: str,
    plugin_name: str = "Test Plugin",
    parameters: dict[str, object] | None = None,
    tags: list[str] | None = None,
    category: str = "User",
    description: str = "",
    is_favorite: bool = False,
    is_default: bool = False,
    usage_count: int = 0,
) -> int:
    async with database_module.get_session() as session:
        preset = database_module.PluginPreset(
            name=name,
            plugin_uri=plugin_uri,
            plugin_name=plugin_name,
            parameters=json.dumps(parameters or {"gain": 0.5}),
            tags=tags or [],
            category=category,
            description=description,
            is_favorite=is_favorite,
            is_default=is_default,
            usage_count=usage_count,
        )
        session.add(preset)
        await session.flush()
        return int(preset.id)


async def _fetch_presets() -> list[dict[str, object]]:
    async with database_module.get_session() as session:
        presets = (
            await session.execute(select(database_module.PluginPreset).order_by(database_module.PluginPreset.id))
        ).scalars().all()
        return [
            {
                "id": int(preset.id),
                "name": str(preset.name),
                "parameters": json.loads(preset.parameters),
                "tags": list(preset.tags or []),
                "is_default": bool(preset.is_default),
                "is_favorite": bool(preset.is_favorite),
                "usage_count": int(preset.usage_count or 0),
            }
            for preset in presets
        ]


def test_create_list_fetch_and_plugin_scoped_routes(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "plugin-presets-create.db")
    lifecycle = _FakeLifecycle()
    client = _build_client(monkeypatch, lifecycle)

    create_response = client.post(
        "/api/plugin-presets/",
        json={
            "name": "Studio Lead",
            "plugin_uri": "urn-test-plugin",
            "plugin_name": "Test Plugin",
            "parameters": {"gain": 0.8, "mix": 0.3},
            "tags": ["lead", "clean"],
            "category": "Factory",
            "description": "Bright lead preset",
            "is_favorite": True,
            "is_default": True,
        },
    )

    assert create_response.status_code == 200
    assert create_response.json() == {
        "status": "success",
        "preset_id": 1,
        "message": "Created preset: Studio Lead",
    }
    assert lifecycle.created == [(1, "Studio Lead", "urn-test-plugin", {"gain": 0.8, "mix": 0.3})]

    list_response = client.get("/api/plugin-presets/?plugin_uri=urn-test-plugin&tags=clean")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1
    assert list_response.json()["presets"][0]["name"] == "Studio Lead"
    assert list_response.json()["presets"][0]["parameters"] == {"gain": 0.8, "mix": 0.3}

    fetch_response = client.get("/api/plugin-presets/1")
    assert fetch_response.status_code == 200
    assert fetch_response.json()["name"] == "Studio Lead"
    assert fetch_response.json()["is_default"] is True

    plugin_response = client.get("/api/plugin-presets/plugin/urn-test-plugin")
    assert plugin_response.status_code == 200
    assert plugin_response.json() == {
        "plugin_uri": "urn-test-plugin",
        "presets": [
            {
                "id": 1,
                "name": "Studio Lead",
                "parameters": {"gain": 0.8, "mix": 0.3},
                "is_favorite": True,
                "is_default": True,
                "usage_count": 0,
                "description": "Bright lead preset",
            }
        ],
        "count": 1,
        "default_preset_id": 1,
    }


def test_update_toggle_favorite_and_load_routes_mutate_state(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "plugin-presets-update.db")
    lifecycle = _FakeLifecycle()
    first_id = asyncio.run(
        _seed_preset(name="Default A", plugin_uri="urn-test-plugin", is_default=True, parameters={"gain": 0.2})
    )
    second_id = asyncio.run(
        _seed_preset(name="Default B", plugin_uri="urn-test-plugin", parameters={"gain": 0.6})
    )
    client = _build_client(monkeypatch, lifecycle)

    update_response = client.patch(
        f"/api/plugin-presets/{second_id}",
        json={
            "name": "Renamed B",
            "parameters": {"gain": 0.9},
            "tags": ["favorite"],
            "description": "Updated preset",
            "is_default": True,
        },
    )

    assert update_response.status_code == 200
    assert update_response.json() == {
        "status": "success",
        "preset_id": second_id,
        "message": "Updated preset: Renamed B",
    }

    favorite_response = client.post(f"/api/plugin-presets/{second_id}/favorite")
    assert favorite_response.status_code == 200
    assert favorite_response.json() == {
        "status": "success",
        "preset_id": second_id,
        "is_favorite": True,
        "message": "Preset marked as favorite",
    }

    load_response = client.post(f"/api/plugin-presets/{second_id}/load")
    assert load_response.status_code == 200
    assert load_response.json() == {
        "id": second_id,
        "name": "Renamed B",
        "plugin_uri": "urn-test-plugin",
        "plugin_name": "Test Plugin",
        "parameters": {"gain": 0.9},
        "usage_count": 1,
    }

    presets = asyncio.run(_fetch_presets())
    assert [preset["id"] for preset in presets] == [first_id, second_id]
    assert presets[0]["is_default"] is False
    assert presets[1]["name"] == "Renamed B"
    assert presets[1]["parameters"] == {"gain": 0.9}
    assert presets[1]["tags"] == ["favorite"]
    assert presets[1]["is_default"] is True
    assert presets[1]["is_favorite"] is True
    assert presets[1]["usage_count"] == 1
    assert lifecycle.favorite_toggles == [(second_id, True)]
    assert lifecycle.loaded == [second_id]


def test_category_tag_and_favorite_plugin_aggregates(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "plugin-presets-aggregates.db")
    lifecycle = _FakeLifecycle()
    asyncio.run(
        _seed_preset(
            name="Clean One",
            plugin_uri="urn-alpha",
            plugin_name="Alpha",
            tags=["clean", "bright"],
            category="Factory",
            is_favorite=True,
        )
    )
    asyncio.run(
        _seed_preset(
            name="Lead Two",
            plugin_uri="urn-alpha",
            plugin_name="Alpha",
            tags=["lead"],
            category="Factory",
        )
    )
    asyncio.run(
        _seed_preset(
            name="Bass One",
            plugin_uri="urn-beta",
            plugin_name="Beta",
            tags=["clean", "bass"],
            category="User",
            is_favorite=True,
        )
    )
    client = _build_client(monkeypatch, lifecycle)

    categories_response = client.get("/api/plugin-presets/categories/all")
    assert categories_response.status_code == 200
    categories_payload = categories_response.json()
    assert sorted(categories_payload["categories"], key=lambda item: item["name"]) == [
        {"name": "Factory", "count": 2},
        {"name": "User", "count": 1},
    ]
    assert categories_payload["count"] == 2

    tags_response = client.get("/api/plugin-presets/tags/all")
    assert tags_response.status_code == 200
    assert tags_response.json() == {
        "tags": ["bass", "bright", "clean", "lead"],
        "count": 4,
    }

    favorites_response = client.get("/api/plugin-presets/favorites/plugins")
    assert favorites_response.status_code == 200
    favorites_payload = favorites_response.json()
    assert sorted(favorites_payload["plugins"], key=lambda item: item["plugin_uri"]) == [
        {
            "plugin_uri": "urn-alpha",
            "plugin_name": "Alpha",
            "favorite_preset_count": 1,
        },
        {
            "plugin_uri": "urn-beta",
            "plugin_name": "Beta",
            "favorite_preset_count": 1,
        },
    ]
    assert favorites_payload["count"] == 2


def test_delete_and_lifecycle_routes_delegate_to_manager(tmp_path, monkeypatch):
    _init_temp_db(tmp_path, "plugin-presets-lifecycle.db")
    lifecycle = _FakeLifecycle()
    preset_id = asyncio.run(_seed_preset(name="Disposable", plugin_uri="urn-delete"))
    client = _build_client(monkeypatch, lifecycle)

    delete_response = client.delete(f"/api/plugin-presets/{preset_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {
        "status": "success",
        "deleted_id": preset_id,
        "message": "Deleted preset: Disposable",
    }
    assert lifecycle.deleted == [(preset_id, "Disposable")]
    assert asyncio.run(_fetch_presets()) == []

    cleanup_response = client.post("/api/plugin-presets/lifecycle/cleanup?days_threshold=14")
    assert cleanup_response.status_code == 200
    assert cleanup_response.json() == {
        "status": "success",
        "cleaned_up": 2,
        "message": "Cleaned up 2 unused presets",
    }

    stats_response = client.get("/api/plugin-presets/lifecycle/stats")
    assert stats_response.status_code == 200
    assert stats_response.json() == {
        "status": "success",
        "stats": {"total_presets": 3, "favorite_presets": 1},
    }

    startup_response = client.post("/api/plugin-presets/lifecycle/startup")
    shutdown_response = client.post("/api/plugin-presets/lifecycle/shutdown")
    assert startup_response.status_code == 200
    assert shutdown_response.status_code == 200
    assert startup_response.json() == {
        "status": "success",
        "message": "Plugin preset lifecycle started",
    }
    assert shutdown_response.json() == {
        "status": "success",
        "message": "Plugin preset lifecycle shut down",
    }
    assert lifecycle.cleanup_days == [14]
    assert lifecycle.started == 1
    assert lifecycle.stopped == 1
