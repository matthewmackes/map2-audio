from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import platform_remediation
from app.services.cluster.version_manifest import ManifestDiff, ManifestStorageStatus


class _FakeManifestService:
    def __init__(self, tmp_path: Path) -> None:
        self.manifest_path = tmp_path / "version_manifest.json"
        self.history_dir = tmp_path / "version_manifest_history"
        self.history_dir.mkdir(parents=True, exist_ok=True)
        self.manifest = {
            "source_node": "NODE-A",
            "timestamp": "2026-03-26T21:45:00Z",
            "packages": {"pkg-a": "1.0"},
        }
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        (self.history_dir / "manifest_20260326.json").write_text(
            json.dumps(
                {
                    "timestamp": "2026-03-26T21:00:00Z",
                    "source_node": "NODE-A",
                    "package_count": 2,
                    "packages": {"pkg-a": "0.9"},
                }
            ),
            encoding="utf-8",
        )
        self.capture_calls: list[str] = []
        self.enforce_calls: list[tuple[str, bool]] = []
        self.compare_calls: list[str] = []

    def get_storage_status(self) -> ManifestStorageStatus:
        return ManifestStorageStatus(
            available=True,
            reason=None,
            detail=None,
            target_path=str(self.history_dir),
        )

    def get_manifest(self):
        return dict(self.manifest)

    def list_manifest_history(self):
        return ["manifest_20260326.json"]

    def capture_manifest(self, source_node_id: str):
        self.capture_calls.append(source_node_id)
        return {
            "source_node": source_node_id,
            "timestamp": "2026-03-26T21:46:00Z",
            "packages": {"pkg-a": "1.1"},
        }

    def enforce_manifest(self, node_id: str, dry_run: bool):
        self.enforce_calls.append((node_id, dry_run))
        return {"status": "ok", "changed": not dry_run}

    def compare_node(self, node_id: str):
        self.compare_calls.append(node_id)
        return ManifestDiff(
            added=["pkg-a"],
            removed=[],
            mismatched={"pkg-b": {"expected": "2.0", "actual": "1.0"}},
        )


class _FakeNodeClient:
    def __init__(self) -> None:
        self.commands: list[str] = []

    def execute_command(self, command: str, timeout: int, check_returncode: bool = False):
        self.commands.append(command)
        if "systemctl restart map2-backend" in command:
            return 0, "restarted", ""
        return 0, "ok", ""


class _FakeRegistry:
    def get_all_nodes(self):
        return [{"hostname": "map2-stage"}]


async def _immediate_to_thread(func, *args, **kwargs):
    return func(*args, **kwargs)


async def _fake_build_nodes(*, sync_available: bool, manifest, history):
    assert sync_available is True
    assert manifest["source_node"] == "NODE-A"
    assert history
    return [
        {
            "node_id": "NODE-1",
            "hostname": "map2-stage",
            "visible": True,
            "registered": True,
            "is_online": True,
            "adoption_state": "ready",
            "sync_states": ["outdated", "held"],
            "clone_states": ["suspected_clone"],
            "is_source_of_truth": False,
            "rollback_available": True,
            "routing_ready": True,
        }
    ]


def _build_client(monkeypatch, service: _FakeManifestService, *, node_client: _FakeNodeClient | None = None) -> tuple[TestClient, _FakeNodeClient]:
    fake_node_client = node_client or _FakeNodeClient()
    app = FastAPI()
    app.include_router(platform_remediation.router)
    monkeypatch.setattr(platform_remediation, "get_version_manifest", lambda: service)
    monkeypatch.setattr(platform_remediation, "_build_remediation_nodes", _fake_build_nodes)
    monkeypatch.setattr(platform_remediation.asyncio, "to_thread", _immediate_to_thread)
    monkeypatch.setattr(platform_remediation, "get_cluster_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(platform_remediation, "get_node_client", lambda node_id, registry: fake_node_client)
    return TestClient(app), fake_node_client


def test_platform_remediation_summary_history_and_capture_routes(monkeypatch, tmp_path):
    service = _FakeManifestService(tmp_path)
    client, _node_client = _build_client(monkeypatch, service)

    summary = client.get("/api/platform-remediation/summary")
    history = client.get("/api/platform-remediation/sync/history")
    capture = client.post("/api/platform-remediation/sync/capture", json={"source_node_id": "NODE-B"})

    assert summary.status_code == 200
    assert summary.json() == {
        "status": "ok",
        "counts": {
            "adoption": {
                "candidate": 0,
                "claimable": 0,
                "adopted": 0,
                "ready": 1,
                "blocked": 0,
            },
            "sync": {
                "outdated": 1,
                "syncing": 0,
                "failed": 0,
                "held": 1,
                "rollback_available": 0,
            },
            "clone": {
                "confirmed_clone": 0,
                "suspected_clone": 1,
            },
        },
        "manifest": {
            "source_node": "NODE-A",
            "timestamp": "2026-03-26T21:45:00Z",
        },
        "workflows": {
            "adoption": {"available": True, "state": "ready", "reason": None, "detail": None},
            "sync": {"available": True, "state": "ready", "reason": None, "detail": None},
            "clone": {"available": True, "state": "ready", "reason": None, "detail": None},
        },
        "nodes": [
            {
                "node_id": "NODE-1",
                "hostname": "map2-stage",
                "visible": True,
                "registered": True,
                "is_online": True,
                "adoption_state": "ready",
                "sync_states": ["outdated", "held"],
                "clone_states": ["suspected_clone"],
                "is_source_of_truth": False,
                "rollback_available": True,
                "routing_ready": True,
            }
        ],
    }
    assert history.status_code == 200
    assert history.json() == {
        "status": "ok",
        "available": True,
        "reason": None,
        "detail": None,
        "items": [
            {
                "history_file": "manifest_20260326.json",
                "timestamp": "2026-03-26T21:00:00Z",
                "source_node": "NODE-A",
                "package_count": 2,
            }
        ],
    }
    assert capture.status_code == 200
    assert capture.json() == {
        "status": "ok",
        "manifest": {
            "source_node": "NODE-B",
            "timestamp": "2026-03-26T21:46:00Z",
            "packages": {"pkg-a": "1.1"},
        },
    }
    assert service.capture_calls == ["NODE-B"]


def test_platform_remediation_sync_routes_delegate_to_manifest_and_node_clients(monkeypatch, tmp_path):
    service = _FakeManifestService(tmp_path)
    client, node_client = _build_client(monkeypatch, service)

    run_sync = client.post("/api/platform-remediation/sync/run", json={"node_ids": ["NODE-1"], "dry_run": True})
    restore = client.post("/api/platform-remediation/sync/restore", json={"history_file": "manifest_20260326.json"})
    fix = client.post("/api/platform-remediation/sync/fix", json={"node_ids": ["NODE-1"], "dry_run": False})

    assert run_sync.status_code == 200
    assert run_sync.json() == {
        "status": "ok",
        "results": [
            {
                "node_id": "NODE-1",
                "status": "ok",
                "changed": False,
            }
        ],
    }
    assert service.enforce_calls == [("NODE-1", True)]
    assert restore.status_code == 200
    assert restore.json() == {
        "status": "ok",
        "manifest": {
            "timestamp": "2026-03-26T21:00:00Z",
            "source_node": "NODE-A",
            "package_count": 2,
            "packages": {"pkg-a": "0.9"},
        },
    }
    assert fix.status_code == 200
    assert fix.json() == {
        "status": "ok",
        "results": [
            {
                "node_id": "NODE-1",
                "status": "ok",
                "stdout": "ok",
                "stderr": "",
                "command": "dnf reinstall -y pkg-a pkg-b",
            }
        ],
    }
    assert service.compare_calls == ["NODE-1"]
    assert node_client.commands == ["dnf reinstall -y pkg-a pkg-b"]


def test_platform_remediation_clone_recover_falls_back_to_fix_when_reset_fails(monkeypatch, tmp_path):
    service = _FakeManifestService(tmp_path)
    node_client = _FakeNodeClient()
    client, _node_client = _build_client(monkeypatch, service, node_client=node_client)

    monkeypatch.setattr(
        platform_remediation,
        "get_visible_remote_nodes",
        lambda: (
            {},
            {
                "NODE-1": SimpleNamespace(
                    node_id="NODE-1",
                    hostname="stage",
                    api_url="http://node1:8080",
                )
            },
        ),
    )

    async def _failed_reset(url: str, payload: dict[str, object], timeout: int = 30):
        return {"status": "failed", "detail": "reset unavailable"}

    monkeypatch.setattr(platform_remediation, "_fetch_remote_post", _failed_reset)

    response = client.post(
        "/api/platform-remediation/clone/recover",
        json={"node_ids": ["NODE-1"], "management_node_ip": "10.0.0.1"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "results": [
            {
                "node_id": "NODE-1",
                "status": "ok",
                "target_hostname": "map2-stage-2",
                "phases": [
                    {
                        "phase": "set_hostname",
                        "status": "ok",
                        "stdout": "ok",
                        "stderr": "",
                        "hostname": "map2-stage-2",
                    },
                    {
                        "phase": "reset_rejoin",
                        "status": "failed",
                        "response": {"status": "failed", "detail": "reset unavailable"},
                    },
                    {
                        "phase": "fix",
                        "status": "ok",
                        "stdout": "restarted",
                        "stderr": "",
                    },
                ],
                "next_workflow": "adoption",
            }
        ],
    }
    assert node_client.commands == [
        "hostnamectl set-hostname map2-stage-2",
        "hostnamectl set-hostname map2-stage-2 && systemctl restart map2-backend",
    ]
