"""T2521-5: SonoBus binding routes — live HTTP round-trip tests.

Exercises the FastAPI route layer against a real authority + isolated
sqlite. Confirms the full CRUD-plus-matrix-plus-status path is wired
correctly for the operator surface.
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
        f"sqlite+aiosqlite:///{tmp_path / 'sonobus-routes.db'}"
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
        consumer_label=f"sonobus-stream-{consumer_id}",
        binding_kind="stream",
        source_type="aoo_source",
        source_descriptor={
            "aoo_source_id": 1001,
            "channel_count": 2,
            "bind_interface": "eth0",
        },
        target_type="aoo_sink",
        target_descriptor={
            "listener_peer_endpoint": "10.0.0.10:10001",
            "aoo_sink_id": 2002,
        },
        group_id="g-1",
        talker_node_id="node-alpha",
        listener_node_id="node-beta",
        scope="global",
        created_by="t2521-route-test",
        source="t2521-route-test",
    )
    base.update(overrides)
    return base


def test_status_returns_authority_ok(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/status")
    assert r.status_code == 200
    body = r.json()
    assert body["authority_ok"] is True
    assert body["table_present"] is True
    assert body["binding_count"] == 0
    assert body["enabled_binding_count"] == 0
    # Daemon-side stub fields per T2521-4 deferral.
    assert body["daemon_running"] is False
    assert body["connection_server_enabled"] is True  # Q3
    assert body["default_transport_priority"] == "avb_preferred"  # Q18


def test_create_then_get_then_count(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())

    create_r = client.post(
        "/api/sonobus/bindings", json=_stream_payload("stream-1")
    )
    assert create_r.status_code == 201, create_r.text
    created = create_r.json()
    binding_id = created["binding_id"]
    assert len(binding_id) == 36

    get_r = client.get(f"/api/sonobus/bindings/{binding_id}")
    assert get_r.status_code == 200
    assert get_r.json()["consumer_id"] == "stream-1"

    count_r = client.get("/api/sonobus/bindings/count")
    assert count_r.status_code == 200
    assert count_r.json() == 1


def test_list_requires_filter(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/bindings")
    assert r.status_code == 400
    assert "filter" in r.json()["detail"].lower()


def test_list_by_kind_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post("/api/sonobus/bindings", json=_stream_payload("s-1"))
    client.post("/api/sonobus/bindings", json=_stream_payload("s-2"))
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
    streams = client.get("/api/sonobus/bindings?binding_kind=stream").json()
    peers = client.get("/api/sonobus/bindings?binding_kind=peer").json()
    assert len(streams) == 2
    assert len(peers) == 1


def test_matrix_aggregates(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post("/api/sonobus/bindings", json=_stream_payload("s-1"))
    client.post("/api/sonobus/bindings", json=_stream_payload("s-2"))

    r = client.get("/api/sonobus/bindings/matrix")
    assert r.status_code == 200
    body = r.json()
    assert body["total_bindings"] == 2
    assert "stream" in body["matrix"]
    assert "sonobus_stream" in body["matrix"]["stream"]
    cell = body["matrix"]["stream"]["sonobus_stream"]
    assert cell["count"] == 2
    assert cell["enabled_count"] == 2
    assert len(body["bindings"]) == 2


def test_patch_then_disable_then_enable(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    created = client.post(
        "/api/sonobus/bindings", json=_stream_payload("s-1")
    ).json()
    binding_id = created["binding_id"]

    patched = client.patch(
        f"/api/sonobus/bindings/{binding_id}",
        json={
            "consumer_label": "patched",
            "jitter_buffer_ms": 12,
            "modified_by": "route-test",
        },
    ).json()
    assert patched["consumer_label"] == "patched"
    assert patched["jitter_buffer_ms"] == 12
    assert patched["modified_by"] == "route-test"

    disabled = client.post(
        f"/api/sonobus/bindings/{binding_id}/disable?modified_by=ops"
    ).json()
    assert disabled["enabled"] is False
    assert disabled["modified_by"] == "ops"

    enabled = client.post(
        f"/api/sonobus/bindings/{binding_id}/enable?modified_by=ops"
    ).json()
    assert enabled["enabled"] is True


def test_delete_round_trip(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    created = client.post(
        "/api/sonobus/bindings", json=_stream_payload("s-1")
    ).json()
    binding_id = created["binding_id"]

    delete_r = client.delete(f"/api/sonobus/bindings/{binding_id}")
    assert delete_r.status_code == 204
    # Second delete should 404.
    delete_again = client.delete(f"/api/sonobus/bindings/{binding_id}")
    assert delete_again.status_code == 404


def test_unknown_binding_returns_404(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/bindings/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_create_rejects_unknown_field(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    payload = _stream_payload("s-1")
    payload["nonsense_field"] = "x"
    r = client.post("/api/sonobus/bindings", json=payload)
    assert r.status_code == 422


def test_cluster_matrix_empty_peers(tmp_path, monkeypatch):
    """T2521-5b — cluster matrix returns local + empty peers/errors
    when discovery has no peer records."""
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())

    # Seed one binding so local matrix is non-empty.
    client.post("/api/sonobus/bindings", json=_stream_payload("s-1"))

    # Stub the node-discovery service so no peers are returned.
    class _StubDiscovery:
        async def _load_peer_records(self):
            return []

    from app.services import node_discovery_service

    monkeypatch.setattr(
        node_discovery_service, "get_node_discovery_service", lambda: _StubDiscovery()
    )

    r = client.get("/api/sonobus/cluster/bindings/matrix")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["peers"] == []
    assert body["errors"] == {}
    assert body["local"]["total_bindings"] == 1
    assert "stream" in body["local"]["matrix"]


def test_cluster_matrix_peer_error_does_not_break_response(tmp_path, monkeypatch):
    """T2521-5b — a peer that fails to respond populates `errors` but
    the overall request still returns 200 with the local matrix intact."""
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post("/api/sonobus/bindings", json=_stream_payload("s-1"))

    class _StubPeer:
        node_id = "node-bad"
        hostname = "bad.local"
        host = "10.255.255.254"
        api_url = "http://10.255.255.254:8080"

    class _StubDiscovery:
        async def _load_peer_records(self):
            return [_StubPeer()]

    class _StubHealth:
        async def get_remote_health(self, host):
            class _S:
                status = "offline"
            return _S()

    from app.services import node_discovery_service, node_health_service

    monkeypatch.setattr(
        node_discovery_service,
        "get_node_discovery_service",
        lambda: _StubDiscovery(),
    )
    monkeypatch.setattr(
        node_health_service,
        "get_node_health_service",
        lambda: _StubHealth(),
    )

    # Force the peer fetch to fail fast by patching httpx to raise.
    import app.services.sonobus.binding_routes as routes_module

    async def _fail_fetch(*, node_id, hostname, api_url, timeout_s, health):
        return None, "stubbed peer failure"

    monkeypatch.setattr(routes_module, "_fetch_peer_sonobus_matrix", _fail_fetch)

    r = client.get("/api/sonobus/cluster/bindings/matrix")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["peers"] == []
    assert body["errors"] == {"node-bad": "stubbed peer failure"}
    assert body["local"]["total_bindings"] == 1
