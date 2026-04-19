from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cluster_update as cluster_update_routes


class _FakeUpdateOrchestrator:
    def __init__(self) -> None:
        self.progress = None
        self.calls: list[tuple[str, bool]] = []
        self.cancel_calls = 0
        self.snapshots_dir = Path("/tmp/map2-cluster-snapshots")

    async def trigger_cluster_update(self, *, target_version: str, dry_run: bool):
        self.calls.append((target_version, dry_run))
        return {
            "status": "ok",
            "message": "validated",
            "nodes_updated": 0,
            "duration_seconds": 0.1,
            "failed_nodes": [],
            "rolled_back": False,
        }

    def get_current_progress(self):
        return self.progress

    async def cancel_update(self):
        self.cancel_calls += 1
        return True


class _FakeRegistry:
    def get_node(self, node_id: str):
        if node_id == "node-a":
            return {"hostname": "alpha"}
        return None


class _FakeManifestService:
    def __init__(self, *, available: bool = True, manifest: dict | None = None, drift: dict | None = None) -> None:
        self.available = available
        self.manifest = manifest
        self.drift = drift or {}
        self.enforce_calls: list[tuple[str, bool]] = []

    def get_storage_status(self):
        return SimpleNamespace(
            available=self.available,
            reason=None if self.available else "read-only",
            detail=None if self.available else "manifest storage unavailable",
        )

    def get_manifest(self):
        return self.manifest

    def compare_all_nodes(self):
        return dict(self.drift)

    def enforce_manifest(self, node_id: str, *, dry_run: bool):
        self.enforce_calls.append((node_id, dry_run))
        return {"node_id": node_id, "dry_run": dry_run, "changed": False}


def _build_client(monkeypatch, *, orchestrator=None, manifest_service=None, registry=None) -> TestClient:
    app = FastAPI()
    app.include_router(cluster_update_routes.router)
    monkeypatch.setattr(
        cluster_update_routes,
        "get_update_orchestrator",
        lambda: orchestrator or _FakeUpdateOrchestrator(),
    )
    monkeypatch.setattr(
        cluster_update_routes,
        "get_version_manifest_service",
        lambda: manifest_service or _FakeManifestService(),
    )
    monkeypatch.setattr(
        cluster_update_routes,
        "get_cluster_registry",
        lambda: registry or _FakeRegistry(),
    )
    return TestClient(app)


def test_progress_returns_404_when_no_update_is_running(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/cluster/update/progress")

    assert response.status_code == 404
    assert response.json()["detail"] == "No update in progress"


def test_validate_update_forces_dry_run(monkeypatch):
    orchestrator = _FakeUpdateOrchestrator()
    client = _build_client(monkeypatch, orchestrator=orchestrator)

    response = client.post("/api/cluster/update/validate", json={"target_version": "v3.1.0", "dry_run": False})

    assert response.status_code == 200
    assert orchestrator.calls == [("v3.1.0", True)]
    assert response.json()["validation_passed"] is True
    assert response.json()["details"]["message"] == "validated"


def test_abort_update_calls_scheduler_cancel(monkeypatch):
    orchestrator = _FakeUpdateOrchestrator()
    orchestrator.progress = {
        "total_nodes": 4,
        "completed_nodes": 1,
        "failed_nodes": 0,
        "remaining_nodes": 3,
        "current_node": "node-b",
        "status": "running",
        "message": "Phase: updating",
    }
    client = _build_client(monkeypatch, orchestrator=orchestrator)

    response = client.post("/api/cluster/update/abort")

    assert response.status_code == 200
    assert orchestrator.cancel_calls == 1
    assert response.json()["status"] == "ok"
    assert response.json()["nodes_remaining"] == 3


def test_manifest_drift_reports_degraded_storage(monkeypatch):
    manifest_service = _FakeManifestService(available=False)
    client = _build_client(monkeypatch, manifest_service=manifest_service)

    response = client.get("/api/cluster/update/manifest/drift")

    assert response.status_code == 200
    assert response.json() == {
        "status": "degraded",
        "available": False,
        "reason": "read-only",
        "detail": "manifest storage unavailable",
        "drifted": False,
        "nodes": [],
    }


def test_manifest_drift_summarizes_registry_hostnames(monkeypatch):
    manifest_service = _FakeManifestService(
        available=True,
        manifest={"version": "golden"},
        drift={
            "node-a": {"added": ["pkg-a"], "removed": [], "mismatched": {}},
            "node-b": {"error": "offline"},
        },
    )
    client = _build_client(monkeypatch, manifest_service=manifest_service, registry=_FakeRegistry())

    response = client.get("/api/cluster/update/manifest/drift")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["available"] is True
    assert payload["drifted"] is True
    assert payload["nodes"] == [
        {
            "node_id": "node-a",
            "hostname": "alpha",
            "packages_drifted": 1,
        }
    ]


def test_manifest_enforce_returns_service_result(monkeypatch):
    manifest_service = _FakeManifestService(available=True, manifest={"version": "golden"})
    client = _build_client(monkeypatch, manifest_service=manifest_service)

    response = client.post("/api/cluster/update/manifest/enforce", json={"node_id": "node-a", "dry_run": False})

    assert response.status_code == 200
    assert manifest_service.enforce_calls == [("node-a", False)]
    assert response.json() == {
        "status": "ok",
        "result": {"node_id": "node-a", "dry_run": False, "changed": False},
    }
