"""
T2491-8 — Saved-connection / fast-connect persistence surface.

Exercises POST /api/avb/connections/persist + GET /api/avb/connections/saved
end-to-end against a temp SQLite. Confirms that the persist
operation writes through AvbBindingAuthority with
`source="acmp_persisted"` + `metadata.acmp_replay_pending=True`,
and that the saved-connections list endpoint surfaces every
ACMP-persisted entry.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import database as database_module
from app.routes.avb import saved_connections


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'avb-saved-connections.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


@pytest.fixture
def app_client(tmp_path):
    _init_temp_db(tmp_path)
    app = FastAPI()
    app.include_router(saved_connections.router, prefix="/api/avb")
    return TestClient(app)


def _persist_payload(stream_id: str = "91E0F000FE0000010000", **overrides) -> dict:
    base = {
        "stream_id": stream_id,
        "talker_entity_id": "0x91E0F000FE000001",
        "talker_unique_id": 0,
        "listener_entity_id": "0x91E0F000FE000002",
        "listener_unique_id": 0,
        "stream_format": "iec-61883-6/AM824/8ch/48k",
        "label": "ACMP saved A",
        "operator": "test-suite",
    }
    base.update(overrides)
    return base


def test_persist_then_list_round_trip(app_client):
    res = app_client.post("/api/avb/connections/persist", json=_persist_payload())
    assert res.status_code == 200
    body = res.json()
    binding_id = body["binding_id"]
    assert binding_id
    assert body["replay_pending"] is True
    assert body["persisted_at"]

    listing = app_client.get("/api/avb/connections/saved")
    assert listing.status_code == 200
    payload = listing.json()
    assert payload["count"] == 1
    saved = payload["connections"][0]
    assert saved["binding_id"] == binding_id
    assert saved["stream_id"] == "91E0F000FE0000010000"
    assert saved["talker_entity_id"] == "0x91E0F000FE000001"
    assert saved["listener_entity_id"] == "0x91E0F000FE000002"
    assert saved["replay_pending"] is True
    assert saved["stream_format"] == "iec-61883-6/AM824/8ch/48k"


def test_listing_excludes_non_acmp_persisted_bindings(app_client, tmp_path):
    # Persist one ACMP connection.
    res = app_client.post("/api/avb/connections/persist", json=_persist_payload())
    assert res.status_code == 200

    # Insert a sibling AvbBinding with a DIFFERENT source value to
    # confirm the saved-connections endpoint filters it out.
    async def _seed_other():
        from app.database import get_session
        from app.services.avb.binding_authority import AvbBindingAuthority
        from app.services.avb.binding_schemas import AvbBindingCreate

        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(
                AvbBindingCreate(
                    consumer_type="avdecc_stream",
                    consumer_id="manually-created:0:other:0",
                    consumer_label="manual entry",
                    source_type="avdecc_talker",
                    source_descriptor={"talker_entity_id": "0xff", "talker_unique_id": 0},
                    target_type="avdecc_listener",
                    target_descriptor={"listener_entity_id": "0xee", "listener_unique_id": 0},
                    stream_id="ff" * 8 + "0000",
                    source="manual",
                    metadata={},
                )
            )

    asyncio.run(_seed_other())

    listing = app_client.get("/api/avb/connections/saved")
    assert listing.status_code == 200
    payload = listing.json()
    # Only the ACMP one is returned, not the manual binding.
    assert payload["count"] == 1
    assert payload["connections"][0]["talker_entity_id"] == "0x91E0F000FE000001"


def test_persist_multiple_streams(app_client):
    a = app_client.post(
        "/api/avb/connections/persist",
        json=_persist_payload(stream_id="aaaaaaaaaaaaaaaa0001"),
    )
    b = app_client.post(
        "/api/avb/connections/persist",
        json=_persist_payload(
            stream_id="bbbbbbbbbbbbbbbb0002",
            talker_entity_id="0xBBBB",
            listener_entity_id="0xCCCC",
        ),
    )
    assert a.status_code == 200 and b.status_code == 200
    listing = app_client.get("/api/avb/connections/saved").json()
    assert listing["count"] == 2
    stream_ids = {c["stream_id"] for c in listing["connections"]}
    assert stream_ids == {"aaaaaaaaaaaaaaaa0001", "bbbbbbbbbbbbbbbb0002"}


def test_persist_payload_validation_rejects_invalid_unique_id(app_client):
    bad = _persist_payload()
    bad["talker_unique_id"] = 0xFFFFF  # > 0xFFFF
    res = app_client.post("/api/avb/connections/persist", json=bad)
    assert res.status_code == 422
