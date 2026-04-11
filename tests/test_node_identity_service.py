from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

from app.services import node_identity


def test_create_new_identity_persists_utc_created_at(monkeypatch, tmp_path: Path):
    ssh_home = tmp_path / "home"

    def _fake_home() -> Path:
        return ssh_home

    def _fake_run(cmd, check=False, capture_output=False, text=False, **kwargs):
        if cmd[:1] == ["ssh-keygen"] and "-l" not in cmd:
            key_path = Path(cmd[cmd.index("-f") + 1])
            key_path.write_text("private", encoding="utf-8")
            key_path.with_suffix(".pub").write_text(
                "ssh-rsa AAAATEST map2@test-node",
                encoding="utf-8",
            )
            return subprocess.CompletedProcess(cmd, 0, "", "")
        if cmd[:1] == ["ssh-keygen"] and "-l" in cmd:
            return subprocess.CompletedProcess(
                cmd,
                0,
                "4096 SHA256:test-fingerprint map2@test-node\n",
                "",
            )
        raise AssertionError(f"Unexpected command: {cmd}")

    monkeypatch.setattr(node_identity.Path, "home", staticmethod(_fake_home))
    monkeypatch.setattr(node_identity.subprocess, "run", _fake_run)
    monkeypatch.setattr(node_identity.socket, "gethostname", lambda: "test-host")

    identity = node_identity.NodeIdentity(config_dir=str(tmp_path / "config"))

    created_at = datetime.fromisoformat(identity.created_at)
    assert created_at.tzinfo == timezone.utc

    persisted = json.loads((tmp_path / "config" / "node-identity.json").read_text(encoding="utf-8"))
    assert datetime.fromisoformat(persisted["created_at"]).tzinfo == timezone.utc


def test_add_peer_trust_persists_utc_added_at(monkeypatch, tmp_path: Path):
    ssh_home = tmp_path / "home"

    def _fake_home() -> Path:
        return ssh_home

    monkeypatch.setattr(node_identity.Path, "home", staticmethod(_fake_home))

    manager = node_identity.SSHTrustManager(
        SimpleNamespace(node_id="node-a"),
        trust_dir=str(tmp_path / "trust"),
    )

    manager.add_peer_trust(
        "node-b",
        "ssh-ed25519 AAAAPEER node-b",
        "SHA256:peer-fingerprint",
    )

    added_at = datetime.fromisoformat(manager.trusted_nodes["node-b"]["added_at"])
    assert added_at.tzinfo == timezone.utc

    persisted = json.loads((tmp_path / "trust" / "trusted-nodes.json").read_text(encoding="utf-8"))
    assert datetime.fromisoformat(persisted["node-b"]["added_at"]).tzinfo == timezone.utc
    assert (ssh_home / ".ssh" / "authorized_keys").read_text(encoding="utf-8").strip().endswith("node-b")
