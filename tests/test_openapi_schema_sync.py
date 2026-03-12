import asyncio

from fastapi import FastAPI

from app.services import openapi_schema_sync
from app.services.openapi_schema_sync import (
    OpenApiSchemaSyncService,
    build_schema_path_signatures,
    calculate_schema_path_diff,
)
from app.utils.api_contract import install_contract_openapi


def test_calculate_schema_path_diff_reports_added_removed_and_modified():
    previous = {
        "/api/audio/status": "hash-a",
        "/api/legacy": "hash-b",
        "/api/shared": "hash-c",
    }
    current = {
        "/api/audio/status": "hash-a",
        "/api/shared": "hash-d",
        "/api/system/info": "hash-e",
    }

    diff = calculate_schema_path_diff(previous, current)

    assert diff == {
        "added": ["/api/system/info"],
        "removed": ["/api/legacy"],
        "modified": ["/api/shared"],
    }


def test_build_schema_path_signatures_ignores_non_dict_paths():
    assert build_schema_path_signatures({"paths": None}) == {}
    assert build_schema_path_signatures({}) == {}


def test_check_for_updates_broadcasts_schema_changed_when_routes_are_added(monkeypatch):
    async def _run() -> None:
        app = FastAPI()
        install_contract_openapi(app)

        @app.get("/api/alpha", tags=["Alpha"])
        async def alpha():
            return {"ok": True}

        service = OpenApiSchemaSyncService(poll_interval_seconds=60.0)
        broadcasts: list[tuple[dict, str | None]] = []

        async def _fake_broadcast_json(payload, topic=None):
            broadcasts.append((payload, topic))

        monkeypatch.setattr(openapi_schema_sync.ws_manager, "broadcast_json", _fake_broadcast_json)

        await service.start(app)
        try:
            app.router.add_api_route(
                "/api/beta",
                lambda: {"beta": True},
                methods=["POST"],
                tags=["Beta"],
                summary="Create beta",
            )

            diff = await service.check_for_updates()

            assert diff == {
                "added": ["/api/beta"],
                "removed": [],
                "modified": [],
            }
            assert len(broadcasts) == 1
            payload, topic = broadcasts[0]
            assert topic == "schema_changed"
            assert payload["type"] == "schema_changed"
            assert payload["topic"] == "schema_changed"
            assert payload["data"]["diff"] == diff
            assert payload["data"]["path_count"] >= 2
        finally:
            await service.stop()

    asyncio.run(_run())
