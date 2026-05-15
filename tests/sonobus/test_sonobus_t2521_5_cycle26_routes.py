"""T2521-5 cycle 26 — operator-facing route additions.

Locks the wire contract for the new probe / groups CRUD /
session disconnect / profile CRUD / network / diagnostics endpoints.
Every endpoint is daemon-stubbed today (T2521-4 ships the live data
later), so the assertions focus on the contract: status code, shape,
and the placeholder values the architecture doc commits to.
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
        f"sqlite+aiosqlite:///{tmp_path / 'sonobus-cycle26.db'}"
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
        group_id="grp-cycle26",
        talker_node_id="node-alpha",
        listener_node_id="node-beta",
        scope="global",
        created_by="cycle26-test",
        source="cycle26-test",
    )
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# /peers/{peer_id}/probe
# ---------------------------------------------------------------------------


def test_probe_peer_returns_unreachable_stub_pre_daemon(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.post("/api/sonobus/peers/peer-x/probe")
    assert r.status_code == 200
    body = r.json()
    assert body["peer_id"] == "peer-x"
    assert body["reachable"] is False
    assert "daemon" in body["detail"].lower()


# ---------------------------------------------------------------------------
# /groups CRUD
# ---------------------------------------------------------------------------


def test_create_group_returns_seeded_summary(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.post(
        "/api/sonobus/groups",
        json={"group_id": "grp-new", "session_label": "fresh", "channel_count": 4},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["group_id"] == "grp-new"
    assert body["session_label"] == "fresh"
    assert body["binding_count"] == 0
    assert body["channel_count_total"] == 4


def test_get_group_404_when_no_bindings_yet(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/groups/ghost-group")
    assert r.status_code == 404


def test_get_group_returns_summary_after_binding_attached(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    create = client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-1", group_id="grp-real"),
    )
    assert create.status_code == 201
    r = client.get("/api/sonobus/groups/grp-real")
    assert r.status_code == 200
    body = r.json()
    assert body["group_id"] == "grp-real"
    assert body["binding_count"] == 1


def test_patch_group_propagates_label_to_bindings(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-2", group_id="grp-rename"),
    )
    r = client.patch(
        "/api/sonobus/groups/grp-rename",
        json={"session_label": "Renamed Group"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["session_label"] == "Renamed Group"
    # Confirm underlying binding picked up the label.
    listing = client.get(
        "/api/sonobus/bindings?group_id=grp-rename"
    ).json()
    assert listing[0]["session_label"] == "Renamed Group"


def test_delete_group_drops_every_binding(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-3", group_id="grp-doomed"),
    )
    client.post(
        "/api/sonobus/bindings",
        json=_stream_payload("s-4", group_id="grp-doomed"),
    )
    r = client.delete("/api/sonobus/groups/grp-doomed")
    assert r.status_code == 204
    listing = client.get(
        "/api/sonobus/bindings?group_id=grp-doomed"
    ).json()
    assert listing == []


def test_delete_group_404_when_unknown(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.delete("/api/sonobus/groups/no-such-group")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# /sessions/{session_id}/disconnect
# ---------------------------------------------------------------------------


def test_disconnect_session_disables_binding(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    create = client.post(
        "/api/sonobus/bindings", json=_stream_payload("session-1")
    )
    binding_id = create.json()["binding_id"]
    r = client.post(f"/api/sonobus/sessions/{binding_id}/disconnect")
    assert r.status_code == 200
    body = r.json()
    assert body["disconnected"] is True
    assert body["session_id"] == binding_id
    # Confirm the binding now reports enabled=False.
    after = client.get(f"/api/sonobus/bindings/{binding_id}").json()
    assert after["enabled"] is False


def test_disconnect_session_404_when_unknown(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.post("/api/sonobus/sessions/missing-id/disconnect")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# /profiles CRUD (built-in immutability + operator-defined round-trip)
# ---------------------------------------------------------------------------


def test_create_custom_profile_round_trips_through_wire_contract(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.post(
        "/api/sonobus/profiles",
        json={
            "profile_id": "pcm-custom",
            "label": "Custom PCM",
            "codec_profile": "pcm",
            "stream_format": "pcm_s24_48000",
            "jitter_buffer_ms": 6,
            "resend_policy": "burst_loss_only",
            "latency_target_ms": 10,
            "description": "operator preset for the room",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["profile_id"] == "pcm-custom"
    assert body["jitter_buffer_ms"] == 6
    assert body["description"].startswith("operator preset")


def test_patch_built_in_profile_returns_409(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.patch(
        "/api/sonobus/profiles/pcm_lowest_latency",
        json={"label": "tweaked"},
    )
    assert r.status_code == 409


def test_delete_built_in_profile_returns_409(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.delete("/api/sonobus/profiles/pcm_lowest_latency")
    assert r.status_code == 409


def test_delete_unknown_profile_is_idempotent_204(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.delete("/api/sonobus/profiles/operator-defined-not-yet")
    assert r.status_code == 204


# ---------------------------------------------------------------------------
# /network + /network/connection-server
# ---------------------------------------------------------------------------


def test_get_network_status_uses_locked_defaults(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/network")
    assert r.status_code == 200
    body = r.json()
    assert body["udp_port_range_start"] == 10000
    assert body["udp_port_range_end"] == 10100
    assert body["mdns_enabled"] is True
    assert len(body["bind_interfaces"]) >= 1


def test_get_connection_server_defaults_to_q3_enabled(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/network/connection-server")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    # Daemon offline → running=False until T2521-4.
    assert body["running"] is False


def test_patch_connection_server_round_trips_operator_overrides(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.patch(
        "/api/sonobus/network/connection-server",
        json={"enabled": False, "listen_port": 11000},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["listen_port"] == 11000


# ---------------------------------------------------------------------------
# /diagnostics
# ---------------------------------------------------------------------------


def test_diagnostics_returns_one_entry_per_binding(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    client.post(
        "/api/sonobus/bindings", json=_stream_payload("diag-1")
    )
    client.post(
        "/api/sonobus/bindings", json=_stream_payload("diag-2")
    )
    r = client.get("/api/sonobus/diagnostics")
    assert r.status_code == 200
    body = r.json()
    assert body["daemon_running"] is False  # pre-T2521-4 stub
    assert len(body["bindings"]) == 2
    # Each entry carries the static enable state; live metrics are
    # None until the daemon publishes them.
    for entry in body["bindings"]:
        assert entry["enabled"] is True
        assert entry["rtt_ms"] is None
        assert entry["resend_count"] == 0


def test_diagnostics_empty_when_no_bindings(tmp_path):
    _init_temp_db(tmp_path)
    client = TestClient(_build_app())
    r = client.get("/api/sonobus/diagnostics")
    assert r.status_code == 200
    body = r.json()
    assert body["bindings"] == []
    assert body["daemon_running"] is False
