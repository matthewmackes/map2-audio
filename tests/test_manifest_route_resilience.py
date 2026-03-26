from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cluster_update, platform_remediation
from app.services.cluster.version_manifest import ManifestStorageStatus


class _UnavailableManifestService:
    def __init__(self, base_dir: Path):
        self.manifest_path = base_dir / "version_manifest.json"
        self.history_dir = base_dir / "version_manifest_history"
        self._status = ManifestStorageStatus(
            available=False,
            reason="read_only_filesystem",
            detail=(
                "Version manifest storage is unavailable at "
                f"{self.history_dir} because {base_dir} is mounted read-only."
            ),
            target_path=str(self.history_dir),
        )

    def get_storage_status(self) -> ManifestStorageStatus:
        return self._status

    def get_manifest(self):
        return {"source_node": "MANAGEMENT-NODE-1", "timestamp": "2026-03-26T12:00:00Z"}

    def list_manifest_history(self):
        return ["manifest_20260326.json"]

    def capture_manifest(self, source_node_id: str):
        raise AssertionError(f"capture_manifest should not run when storage is unavailable: {source_node_id}")

    def compare_all_nodes(self):
        raise AssertionError("compare_all_nodes should not run when storage is unavailable")

    def enforce_manifest(self, node_id: str, dry_run: bool = True):
        raise AssertionError(f"enforce_manifest should not run when storage is unavailable: {node_id}, {dry_run}")


async def _fake_build_remediation_nodes(*, sync_available: bool, manifest, history):
    assert sync_available is False
    assert manifest is None
    assert history == []
    return [
        {
            "node_id": "NODE-1",
            "hostname": "MAP2-REMOTE-1",
            "visible": True,
            "registered": True,
            "is_online": True,
            "adoption_state": "ready",
            "sync_states": [],
            "clone_states": [],
            "is_source_of_truth": False,
            "rollback_available": False,
            "routing_ready": True,
        }
    ]


def test_platform_remediation_routes_degrade_when_manifest_storage_is_unavailable(tmp_path, monkeypatch):
    service = _UnavailableManifestService(tmp_path)
    monkeypatch.setattr(platform_remediation, "get_version_manifest", lambda: service)
    monkeypatch.setattr(platform_remediation, "_build_remediation_nodes", _fake_build_remediation_nodes)

    app = FastAPI()
    app.include_router(platform_remediation.router)

    with TestClient(app) as client:
        summary = client.get("/api/platform-remediation/summary")
        history = client.get("/api/platform-remediation/sync/history")
        capture = client.post("/api/platform-remediation/sync/capture", json={"source_node_id": "MANAGEMENT-NODE-1"})
        run_sync = client.post("/api/platform-remediation/sync/run", json={"node_ids": ["NODE-1"], "dry_run": False})

    assert summary.status_code == 200
    assert summary.json() == {
        "status": "degraded",
        "counts": {
            "adoption": {
                "candidate": 0,
                "claimable": 0,
                "adopted": 0,
                "ready": 1,
                "blocked": 0,
            },
            "sync": {
                "outdated": 0,
                "syncing": 0,
                "failed": 0,
                "held": 0,
                "rollback_available": 0,
            },
            "clone": {
                "confirmed_clone": 0,
                "suspected_clone": 0,
            },
        },
        "manifest": {
            "source_node": None,
            "timestamp": None,
        },
        "workflows": {
            "adoption": {
                "available": True,
                "state": "ready",
                "reason": None,
                "detail": None,
            },
            "sync": {
                "available": False,
                "state": "unavailable",
                "reason": "read_only_filesystem",
                "detail": service.get_storage_status().detail,
            },
            "clone": {
                "available": True,
                "state": "ready",
                "reason": None,
                "detail": None,
            },
        },
        "nodes": [
            {
                "node_id": "NODE-1",
                "hostname": "MAP2-REMOTE-1",
                "visible": True,
                "registered": True,
                "is_online": True,
                "adoption_state": "ready",
                "sync_states": [],
                "clone_states": [],
                "is_source_of_truth": False,
                "rollback_available": False,
                "routing_ready": True,
            }
        ],
    }

    assert history.status_code == 200
    assert history.json() == {
        "status": "degraded",
        "available": False,
        "reason": "read_only_filesystem",
        "detail": service.get_storage_status().detail,
        "items": [],
    }

    assert capture.status_code == 503
    assert capture.json() == {"detail": service.get_storage_status().detail}

    assert run_sync.status_code == 503
    assert run_sync.json() == {"detail": service.get_storage_status().detail}


def test_cluster_update_manifest_routes_degrade_when_storage_is_unavailable(tmp_path, monkeypatch):
    service = _UnavailableManifestService(tmp_path)
    monkeypatch.setattr(cluster_update, "get_version_manifest_service", lambda: service)

    app = FastAPI()
    app.include_router(cluster_update.router)

    with TestClient(app) as client:
        manifest = client.get("/api/cluster/update/manifest")
        drift = client.get("/api/cluster/update/manifest/drift")
        capture = client.post("/api/cluster/update/manifest/capture", json={"source_node_id": "MANAGEMENT-NODE-1"})
        enforce = client.post("/api/cluster/update/manifest/enforce", json={"node_id": "NODE-1", "dry_run": False})

    assert manifest.status_code == 200
    assert manifest.json() == {
        "status": "degraded",
        "available": False,
        "reason": "read_only_filesystem",
        "detail": service.get_storage_status().detail,
        "manifest": None,
    }

    assert drift.status_code == 200
    assert drift.json() == {
        "status": "degraded",
        "available": False,
        "reason": "read_only_filesystem",
        "detail": service.get_storage_status().detail,
        "drifted": False,
        "nodes": [],
    }

    assert capture.status_code == 503
    assert capture.json() == {"detail": service.get_storage_status().detail}

    assert enforce.status_code == 503
    assert enforce.json() == {"detail": service.get_storage_status().detail}
