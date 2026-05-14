"""T2521-5e: SonoBus WebSocket event stream stub tests."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import database as database_module
from app.services.sonobus.binding_routes import router as sonobus_router


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'sonobus-ws.db'}"
    )
    asyncio.run(database_module._ensure_tables_created())


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(sonobus_router)
    return app


def test_initial_state_frame_on_connect(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    with client.websocket_connect("/api/sonobus/events") as ws:
        frame = ws.receive_json()
        assert frame["type"] == "sonobus:state"
        assert frame["schema_version"] == 1
        assert frame["data"]["authority_ok"] is True
        assert frame["data"]["binding_count"] == 0
        assert frame["data"]["enabled_binding_count"] == 0
        assert frame["data"]["daemon_running"] is False
        assert "timestamp" in frame["data"]


def test_initial_state_reflects_authority_data(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())

    payload = {
        "consumer_type": "sonobus_stream",
        "consumer_id": "s-ws-1",
        "consumer_label": "ws-test",
        "binding_kind": "stream",
        "source_type": "aoo_source",
        "source_descriptor": {"aoo_source_id": 1},
        "target_type": "aoo_sink",
        "target_descriptor": {"listener_peer_endpoint": "10.0.0.10:10001"},
        "talker_node_id": "node-alpha",
        "listener_node_id": "node-beta",
        "created_by": "ws-test",
        "source": "ws-test",
    }
    client.post("/api/sonobus/bindings", json=payload)

    with client.websocket_connect("/api/sonobus/events") as ws:
        frame = ws.receive_json()
        assert frame["data"]["binding_count"] == 1
        assert frame["data"]["enabled_binding_count"] == 1


def test_frame_schema_is_versioned(tmp_path):
    """Frames must carry schema_version=1 so the daemon can bump
    later without breaking older operator tooling."""
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    with client.websocket_connect("/api/sonobus/events") as ws:
        frame = ws.receive_json()
        assert frame["schema_version"] == 1
        assert frame["type"].startswith("sonobus:")
