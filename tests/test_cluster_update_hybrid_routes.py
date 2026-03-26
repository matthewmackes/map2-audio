from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cluster_update_hybrid as hybrid_routes
from app.services.cluster.hybrid_update_manager import UpdateMode


class _FakeGitUpdater:
    async def get_current_branch(self):
        return "release/candidate"

    async def get_current_commit(self):
        return "abc1234"


class _FakeHybridUpdateManager:
    def __init__(self) -> None:
        self.mode = UpdateMode.GIT
        self.git_updater = _FakeGitUpdater()
        self.application_calls: list[dict] = []
        self.full_calls: list[dict] = []

    async def trigger_application_update(self, *, version, branch, node_id):
        self.application_calls.append({"version": version, "branch": branch, "node_id": node_id})
        return {"status": "ok", "message": f"updating {branch}", "commit_after": "def5678"}

    def get_application_status(self):
        return {
            "mode": "git",
            "environment": "development",
            "current_version": "abc1234",
            "running": False,
            "completed_at": "2026-03-26T18:28:00Z",
        }

    def get_current_version(self):
        return "abc1234"

    async def trigger_full_update(self, *, update_system, update_application, version, node_id):
        self.full_calls.append(
            {
                "update_system": update_system,
                "update_application": update_application,
                "version": version,
                "node_id": node_id,
            }
        )
        return {"status": "ok", "results": {"application": "updated"}, "duration_seconds": 1.2}


def _build_client(monkeypatch, manager: _FakeHybridUpdateManager | None = None) -> TestClient:
    fake_manager = manager or _FakeHybridUpdateManager()
    app = FastAPI()
    app.include_router(hybrid_routes.router)
    monkeypatch.setattr(hybrid_routes, "get_hybrid_update_manager", lambda: fake_manager)
    monkeypatch.setattr("app.services.cluster.map2_git_updater.get_git_updater", lambda: _FakeGitUpdater())
    return TestClient(app)


def test_application_status_returns_manager_payload(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/cluster/update/hybrid/application/status")

    assert response.status_code == 200
    assert response.json()["current_version"] == "abc1234"
    assert response.json()["mode"] == "git"


def test_application_version_includes_git_branch(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/cluster/update/hybrid/application/version")

    assert response.status_code == 200
    assert response.json() == {
        "version": "abc1234",
        "mode": "git",
        "updated_at": "2026-03-26T18:28:00Z",
        "branch": "release/candidate",
    }


def test_full_update_delegates_to_manager(monkeypatch):
    manager = _FakeHybridUpdateManager()
    client = _build_client(monkeypatch, manager=manager)

    response = client.post(
        "/api/cluster/update/hybrid/full",
        json={"update_system": True, "update_application": False, "version": "v3.1.0", "force": False},
    )

    assert response.status_code == 200
    assert manager.full_calls == [
        {
            "update_system": True,
            "update_application": False,
            "version": "v3.1.0",
            "node_id": None,
        }
    ]
    assert response.json()["results"] == {"application": "updated"}


def test_git_branches_reports_current_branch(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/cluster/update/hybrid/git/branches")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "branches": ["main", "develop", "staging"],
        "current": "release/candidate",
    }
