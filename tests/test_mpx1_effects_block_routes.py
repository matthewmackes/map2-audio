"""T2517-7 — Backend-route tests for the MPX-1 effects block."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Ensure we import the routes from a clean state file path per test.
@pytest.fixture
def state_file(tmp_path: Path, monkeypatch) -> Path:
    path = tmp_path / "mpx1-effects-block.json"
    monkeypatch.setenv("MAP2_MPX1_BRIDGE_STATE_FILE", str(path))
    return path


@pytest.fixture
def client(state_file, monkeypatch) -> TestClient:
    # Re-import the singleton lock so it's clean across test runs.
    from app.services.effects import hardware_singleton_lock as hsl_mod
    monkeypatch.setattr(hsl_mod, "_GLOBAL_LOCK", hsl_mod.HardwareSingletonLock())

    # Important: import the route module AFTER the lock reset so its
    # `register_aliases` call runs against the fresh lock.
    import importlib
    from app.routes import mpx1_effects_block as mod
    importlib.reload(mod)

    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


CONFIG_BODY = {
    "interface_id": "tascam.us-144mkii",
    "connection_type": "spdif_coax",
    "channel_mapping": {
        "send_left": 2,
        "send_right": 3,
        "return_left": 2,
        "return_right": 3,
    },
    "bypass": False,
}


# ----------------------------------------------------------------------------
# /api/v1/interfaces/capabilities
# ----------------------------------------------------------------------------

def test_capabilities_returns_real_device_packs(client: TestClient):
    resp = client.get("/api/v1/interfaces/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    ids = {row["interface_id"] for row in body["interfaces"]}
    assert "tascam.us-144mkii" in ids
    assert "edirol-ua.ua-1000" in ids


# ----------------------------------------------------------------------------
# Singleton-lock lifecycle
# ----------------------------------------------------------------------------

def test_first_insert_acquires_lock_and_creates_instance(client: TestClient):
    resp = client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chain_id"] == "chain-A"
    assert body["interface_id"] == "tascam.us-144mkii"
    assert body["connection_type"] == "spdif_coax"
    assert body["channel_mapping"]["send_left"] == 2

    usage = client.get("/api/v1/chains/hardware-usage").json()
    assert any(
        row["uri"] == "hardware://lexicon-mpx1" and row["chain_id"] == "chain-A"
        for row in usage["in_use"]
    )


def test_second_insert_into_different_chain_returns_409_structured(client: TestClient):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    resp = client.post("/api/v1/effects/mpx1/instance/chain-B", json=CONFIG_BODY)
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "hardware_singleton_in_use"
    assert detail["uri"] == "hardware://lexicon-mpx1"
    assert detail["in_use_by_chain"] == "chain-A"


def test_idempotent_reinsertion_into_same_chain(client: TestClient):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    resp = client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    assert resp.status_code == 200, resp.text


def test_delete_releases_lock_and_lets_other_chain_acquire(client: TestClient):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    resp = client.delete("/api/v1/effects/mpx1/instance/chain-A")
    assert resp.status_code == 204
    usage = client.get("/api/v1/chains/hardware-usage").json()
    assert all(row["chain_id"] != "chain-A" for row in usage["in_use"])

    # chain-B can now take it over
    resp = client.post("/api/v1/effects/mpx1/instance/chain-B", json=CONFIG_BODY)
    assert resp.status_code == 200


# ----------------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------------

def test_rejects_invalid_connection_type(client: TestClient):
    body = dict(CONFIG_BODY)
    body["connection_type"] = "magical_unicorn"
    resp = client.post("/api/v1/effects/mpx1/instance/chain-A", json=body)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "invalid_connection_type"


def test_get_missing_instance_returns_404(client: TestClient):
    resp = client.get("/api/v1/effects/mpx1/instance/nope")
    assert resp.status_code == 404


# ----------------------------------------------------------------------------
# Bypass + calibrate
# ----------------------------------------------------------------------------

def test_bypass_toggle_persists(client: TestClient):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    resp = client.post(
        "/api/v1/effects/mpx1/instance/chain-A/bypass", json={"bypass": True}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["bypass"] is True
    # And it round-trips
    resp2 = client.get("/api/v1/effects/mpx1/instance/chain-A")
    assert resp2.json()["bypass"] is True


def test_calibrate_records_default_latency_until_wizard_runs(client: TestClient):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    resp = client.post("/api/v1/effects/mpx1/instance/chain-A/calibrate")
    assert resp.status_code == 200
    body = resp.json()
    cal = body["calibration"]
    assert cal is not None
    assert cal["latency_samples"] == 256


def test_state_file_is_written_on_disk(client: TestClient, state_file: Path):
    client.post("/api/v1/effects/mpx1/instance/chain-A", json=CONFIG_BODY)
    assert state_file.exists()
    data = json.loads(state_file.read_text())
    assert "chain-A" in data["instances"]
