"""T2521-5c: peer / group / session projection route round-trip tests.

Live HTTP tests against the FastAPI TestClient + isolated sqlite.
Verifies the projection routes aggregate bindings correctly and skip
rows that lack the relevant key.
"""

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
        f"sqlite+aiosqlite:///{tmp_path / 'sonobus-projections.db'}"
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


def _stream_payload(consumer_id: str, **overrides) -> dict:
    base = dict(
        consumer_type="sonobus_stream",
        consumer_id=consumer_id,
        consumer_label=f"stream-{consumer_id}",
        binding_kind="stream",
        source_type="aoo_source",
        source_descriptor={"aoo_source_id": 1001, "channel_count": 2},
        target_type="aoo_sink",
        target_descriptor={
            "listener_peer_endpoint": "10.0.0.10:10001",
            "aoo_sink_id": 2002,
        },
        group_id="g-1",
        session_label="set A",
        talker_node_id="node-alpha",
        listener_node_id="node-beta",
        listener_capability="map2",
        scope="global",
        created_by="run13-test",
        source="run13-test",
    )
    base.update(overrides)
    return base


def test_peers_aggregate_by_listener(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post("/api/sonobus/bindings", json=_stream_payload("s-1"))
    client.post("/api/sonobus/bindings", json=_stream_payload("s-2"))
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload(
            "s-3", listener_node_id="node-gamma", listener_capability="map2"
        ),
    )

    r = client.get("/api/sonobus/peers")
    assert r.status_code == 200
    peers = r.json()
    assert len(peers) == 2
    beta = next(p for p in peers if p["listener_node_id"] == "node-beta")
    gamma = next(p for p in peers if p["listener_node_id"] == "node-gamma")
    assert beta["binding_count"] == 2
    assert beta["enabled_binding_count"] == 2
    assert gamma["binding_count"] == 1


def test_peers_skip_rows_without_listener_keys(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload(
            "no-listener",
            listener_node_id=None,
            listener_capability=None,
            target_descriptor={},
        ),
    )
    r = client.get("/api/sonobus/peers")
    assert r.status_code == 200
    assert r.json() == []


def test_groups_aggregate_channel_count_and_session_label(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-1", group_id="g-A", channel_count=2, session_label="A"),
    )
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-2", group_id="g-A", channel_count=4),
    )
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-3", group_id="g-B", channel_count=8, session_label="B"),
    )

    r = client.get("/api/sonobus/groups")
    assert r.status_code == 200
    groups = r.json()
    assert len(groups) == 2
    a = next(g for g in groups if g["group_id"] == "g-A")
    b = next(g for g in groups if g["group_id"] == "g-B")
    assert a["binding_count"] == 2
    assert a["channel_count_total"] == 6
    assert a["session_label"] == "A"
    assert b["channel_count_total"] == 8


def test_groups_skip_bindings_without_group_id(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("no-group", group_id=None),
    )
    r = client.get("/api/sonobus/groups")
    assert r.status_code == 200
    assert r.json() == []


def test_sessions_returns_only_enabled_streams_and_client_sessions(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    s1 = client.post(
        "/api/sonobus/bindings", json=_stream_payload("s-1")
    ).json()
    client.post(
        "/api/sonobus/bindings", json=_stream_payload("s-2", enabled=False)
    )
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload(
            "p-1",
            consumer_type="sonobus_peer",
            binding_kind="peer",
            source_type="peer_endpoint",
            target_type="peer_endpoint",
            source_descriptor={"endpoint": "10.0.0.10:10001"},
            target_descriptor={"endpoint": "10.0.0.11:10001"},
            group_id=None,
        ),
    )

    r = client.get("/api/sonobus/sessions")
    assert r.status_code == 200
    sessions = r.json()
    # One enabled stream returned; the disabled stream and the peer
    # binding are excluded.
    assert len(sessions) == 1
    assert sessions[0]["binding_id"] == s1["binding_id"]
