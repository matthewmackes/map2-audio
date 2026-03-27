from __future__ import annotations

import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import ssh_trust as ssh_trust_routes


def _build_client(monkeypatch, tmp_path: Path, *, identity=None) -> TestClient:
    app = FastAPI()
    app.include_router(ssh_trust_routes.router)
    monkeypatch.setattr(ssh_trust_routes, "TRUST_DIR", tmp_path / "ssh_trust")
    monkeypatch.setattr(ssh_trust_routes, "AUTHORIZED_KEYS_FILE", tmp_path / "authorized_keys")
    monkeypatch.setattr(
        ssh_trust_routes,
        "_get_node_identity",
        lambda: identity
        or SimpleNamespace(
            node_id="node-a",
            ssh_fingerprint="local-fp",
            ssh_public_key="ssh-ed25519 AAAALOCAL node-a",
            created_at="2026-03-26T21:00:00",
        ),
    )
    return TestClient(app)


def test_get_keys_and_trust_status_read_local_identity_and_trusted_peers(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    ssh_trust_routes._write_trusted_peers(
        {
            "node-b": {
                "fingerprint": "peer-fp",
                "public_key": "ssh-ed25519 AAAAPEER node-b",
                "trusted_at": "2026-03-26T21:01:00",
            }
        }
    )

    keys_response = client.get("/api/ssh/keys")
    status_response = client.get("/api/ssh/trust/status")

    assert keys_response.status_code == 200
    assert keys_response.json() == {
        "node_id": "node-a",
        "fingerprint": "local-fp",
        "public_key": "ssh-ed25519 AAAALOCAL node-a",
        "key_path": str(Path.home() / ".ssh" / "map2_node-a"),
        "created_at": "2026-03-26T21:00:00",
    }
    assert status_response.status_code == 200
    assert status_response.json() == {
        "local_node_id": "node-a",
        "local_fingerprint": "local-fp",
        "trusted_peers": [
            {
                "peer_id": "node-b",
                "trusted": True,
                "fingerprint": "peer-fp",
                "trusted_at": "2026-03-26T21:01:00",
            }
        ],
        "untrusted_peers": [],
    }


def test_add_and_remove_peer_trust_updates_files_and_registry(monkeypatch, tmp_path):
    async def _immediate_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    def _fake_run(cmd, capture_output=False, text=False, check=False, **kwargs):
        return subprocess.CompletedProcess(
            args=cmd,
            returncode=0,
            stdout="4096 SHA256:peer-fingerprint peer@test\n",
            stderr="",
        )

    client = _build_client(monkeypatch, tmp_path)
    monkeypatch.setattr(ssh_trust_routes.asyncio, "to_thread", _immediate_to_thread)
    monkeypatch.setattr(ssh_trust_routes.subprocess, "run", _fake_run)

    add_response = client.post(
        "/api/ssh/trust/add",
        json={"peer_id": "node-b", "peer_public_key": "ssh-ed25519 AAAAPEER node-b"},
    )

    assert add_response.status_code == 200
    assert add_response.json() == {
        "peer_id": "node-b",
        "trusted": True,
        "fingerprint": "SHA256:peer-fingerprint",
        "trusted_at": add_response.json()["trusted_at"],
    }
    assert ssh_trust_routes.AUTHORIZED_KEYS_FILE.read_text(encoding="utf-8") == "ssh-ed25519 AAAAPEER node-b\n"
    stored_peers = json.loads((ssh_trust_routes.TRUST_DIR / "trusted_peers.json").read_text(encoding="utf-8"))
    assert stored_peers["node-b"]["fingerprint"] == "SHA256:peer-fingerprint"

    remove_response = client.post("/api/ssh/trust/remove", json={"peer_id": "node-b"})

    assert remove_response.status_code == 200
    assert remove_response.json() == {
        "peer_id": "node-b",
        "trusted": False,
        "fingerprint": "SHA256:peer-fingerprint",
        "trusted_at": None,
    }
    assert ssh_trust_routes.AUTHORIZED_KEYS_FILE.read_text(encoding="utf-8") == ""
    assert ssh_trust_routes._read_trusted_peers() == {}


def test_distribute_key_requires_existing_local_public_key(monkeypatch, tmp_path):
    client = _build_client(monkeypatch, tmp_path)
    monkeypatch.setattr(ssh_trust_routes.Path, "home", staticmethod(lambda: tmp_path))

    response = client.post(
        "/api/ssh/keys/distribute",
        json={"peer_id": "node-b", "peer_host": "10.0.0.5", "peer_user": "mm"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Local SSH key not found"}
