from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import database as database_module
from app.routes import plugin_tags as tag_routes


def _init_temp_db(tmp_path: Path, filename: str) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / filename}")


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(tag_routes.router)
    return TestClient(app)


def _plugin_path(uri: str) -> str:
    return f"/api/plugins/tags/plugin/{quote(uri, safe='')}"


async def _seed_plugin(
    *,
    uri: str,
    name: str,
    tags: list[str] | None = None,
    category: str = "Unclassified",
    is_favorite: bool = False,
    is_hidden: bool = False,
    user_description: str = "",
) -> None:
    async with database_module.get_session() as session:
        session.add(
            database_module.Plugin(
                uri=uri,
                name=name,
                tags=tags or [],
                category=category,
                is_favorite=is_favorite,
                is_hidden=is_hidden,
                user_description=user_description,
            )
        )
        await session.flush()


def test_available_tags_and_unknown_plugin_defaults(tmp_path):
    _init_temp_db(tmp_path, "plugin-tags-available.db")
    client = _build_client()

    available_response = client.get("/api/plugins/tags/available")
    plugin_response = client.get(_plugin_path("map2://effects/unknown"))

    assert available_response.status_code == 200
    payload = available_response.json()
    assert payload["categories"]["effect_type"][:3] == ["Distortion", "Overdrive", "Fuzz"]
    assert "Favorite" in payload["all_tags"]

    assert plugin_response.status_code == 200
    assert plugin_response.json() == {
        "uri": "map2://effects/unknown",
        "name": "Unknown Plugin",
        "tags": [],
        "is_favorite": False,
        "is_hidden": False,
        "user_description": "",
    }


def test_patch_add_remove_and_toggle_favorite_routes_persist_metadata(tmp_path):
    _init_temp_db(tmp_path, "plugin-tags-metadata.db")
    client = _build_client()
    uri = "map2://effects/chorus"

    patch_response = client.patch(
        _plugin_path(uri),
        json={
            "tags": ["Chorus", "Bright"],
            "is_hidden": True,
            "user_description": "Wide stereo chorus",
        },
    )

    assert patch_response.status_code == 200
    assert patch_response.json() == {
        "uri": uri,
        "name": "chorus",
        "tags": ["Chorus", "Bright"],
        "is_favorite": False,
        "is_hidden": True,
        "user_description": "Wide stereo chorus",
    }

    add_response = client.post(
        f"{_plugin_path(uri)}/add",
        json={"tags": ["Favorite", "Bright"]},
    )
    assert add_response.status_code == 200
    assert add_response.json()["success"] is True
    assert sorted(add_response.json()["tags"]) == ["Bright", "Chorus", "Favorite"]

    remove_response = client.post(
        f"{_plugin_path(uri)}/remove",
        json={"tags": ["Bright"]},
    )
    assert remove_response.status_code == 200
    assert sorted(remove_response.json()["tags"]) == ["Chorus", "Favorite"]

    favorite_response = client.post(f"{_plugin_path(uri)}/favorite?is_favorite=true")
    assert favorite_response.status_code == 200
    assert favorite_response.json() == {
        "success": True,
        "uri": uri,
        "is_favorite": True,
    }

    get_response = client.get(_plugin_path(uri))
    assert get_response.status_code == 200
    get_payload = get_response.json()
    assert sorted(get_payload["tags"]) == ["Chorus", "Favorite"]
    assert get_payload == {
        "uri": uri,
        "name": "chorus",
        "tags": get_payload["tags"],
        "is_favorite": True,
        "is_hidden": True,
        "user_description": "Wide stereo chorus",
    }


def test_bulk_search_and_favorites_routes_filter_tagged_plugins(tmp_path):
    _init_temp_db(tmp_path, "plugin-tags-search.db")
    asyncio.run(
        _seed_plugin(
            uri="map2://effects/chorus",
            name="Chorus",
            tags=["Modulation", "Favorite"],
            category="Modulation",
            is_favorite=True,
        )
    )
    asyncio.run(
        _seed_plugin(
            uri="map2://effects/delay",
            name="Delay",
            tags=["Delay", "Ambient"],
            category="Delay",
        )
    )
    client = _build_client()

    bulk_response = client.post(
        "/api/plugins/tags/bulk",
        json={
            "uris": ["map2://effects/chorus", "map2://effects/delay", "map2://effects/missing"],
            "add_tags": ["Studio"],
            "remove_tags": ["Ambient"],
        },
    )
    assert bulk_response.status_code == 200
    assert bulk_response.json() == {
        "success": True,
        "updated_count": 2,
        "total_requested": 3,
    }

    any_match_response = client.get("/api/plugins/tags/search?tags=Studio,Favorite")
    assert any_match_response.status_code == 200
    any_match_payload = any_match_response.json()
    assert any_match_payload["query_tags"] == ["Studio", "Favorite"]
    assert any_match_payload["count"] == 2
    assert sorted(plugin["uri"] for plugin in any_match_payload["plugins"]) == [
        "map2://effects/chorus",
        "map2://effects/delay",
    ]

    all_match_response = client.get("/api/plugins/tags/search?tags=Studio,Favorite&match_all=true")
    assert all_match_response.status_code == 200
    all_match_payload = all_match_response.json()
    assert all_match_payload["query_tags"] == ["Studio", "Favorite"]
    assert all_match_payload["match_all"] is True
    assert all_match_payload["count"] == 1
    assert len(all_match_payload["plugins"]) == 1
    assert sorted(all_match_payload["plugins"][0]["tags"]) == ["Favorite", "Modulation", "Studio"]
    assert all_match_payload["plugins"][0] == {
        "uri": "map2://effects/chorus",
        "name": "Chorus",
        "tags": all_match_payload["plugins"][0]["tags"],
        "category": "Modulation",
    }

    favorites_response = client.get("/api/plugins/tags/favorites")
    assert favorites_response.status_code == 200
    favorites_payload = favorites_response.json()
    assert favorites_payload["count"] == 1
    assert len(favorites_payload["plugins"]) == 1
    assert sorted(favorites_payload["plugins"][0]["tags"]) == ["Favorite", "Modulation", "Studio"]
    assert favorites_payload["plugins"][0] == {
        "uri": "map2://effects/chorus",
        "name": "Chorus",
        "tags": favorites_payload["plugins"][0]["tags"],
        "category": "Modulation",
    }

    empty_search_response = client.get("/api/plugins/tags/search?tags=%20%2C%20")
    assert empty_search_response.status_code == 400
    assert empty_search_response.json() == {"detail": "No tags provided"}
