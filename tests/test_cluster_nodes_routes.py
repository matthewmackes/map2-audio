from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cluster_nodes as cluster_nodes_routes


class _FakeRegistry:
    def __init__(self) -> None:
        self._nodes = [{"id": "node-a"}, {"id": "node-b"}]

    def get_all_nodes(self):
        return list(self._nodes)


class _FakeNodeLifecycleManager:
    def __init__(self) -> None:
        self.registry = _FakeRegistry()

    async def run_diagnostics(self, node_id: str):
        if node_id == "missing":
            raise ValueError("Unknown node: missing")
        if node_id == "node-b":
            raise RuntimeError("offline")
        return SimpleNamespace(
            node_id=node_id,
            timestamp=datetime(2026, 3, 26, 21, 35, 0),
            overall_health=84,
            checks=[
                SimpleNamespace(name="network", status="passed", message="reachable", severity=1),
                SimpleNamespace(name="audio", status="failed", message="xrun spike", severity=3),
            ],
            services_status={"backend": "running", "pipewire": "running"},
            recommendations=["Inspect XRuns"],
        )

    async def recover_node(self, node_id: str):
        return {
            "status": "ok",
            "health_before": 40,
            "health_after": 82,
            "actions_taken": ["restart backend"],
            "message": f"Recovered {node_id}",
        }

    async def graceful_shutdown(self, node_id: str):
        return {
            "status": "ok",
            "message": f"Shutdown started for {node_id}",
            "flows_drained": 3,
        }

    async def promote_node_role(self, node_id: str, new_role: str):
        return {
            "status": "ok",
            "message": f"Promoted {node_id}",
            "old_role": "audio_node",
            "new_role": new_role,
        }

    async def demote_node_role(self, node_id: str):
        return {
            "status": "ok",
            "message": f"Demoted {node_id}",
            "flows_drained": 2,
        }


def _build_client(monkeypatch, manager: _FakeNodeLifecycleManager | None = None) -> TestClient:
    fake_manager = manager or _FakeNodeLifecycleManager()
    app = FastAPI()
    app.include_router(cluster_nodes_routes.router)
    monkeypatch.setattr(cluster_nodes_routes, "get_node_lifecycle_manager", lambda: fake_manager)
    return TestClient(app)


def test_cluster_node_routes_return_diagnostics_and_lifecycle_results(monkeypatch):
    client = _build_client(monkeypatch)

    diagnostics = client.get("/api/cluster/nodes/node-a/diagnostics")
    recovery = client.post("/api/cluster/nodes/node-a/recover")
    shutdown = client.post("/api/cluster/nodes/node-a/shutdown")
    promote = client.post("/api/cluster/nodes/node-a/promote?new_role=management_node")
    demote = client.post("/api/cluster/nodes/node-a/demote")

    assert diagnostics.status_code == 200
    assert diagnostics.json() == {
        "node_id": "node-a",
        "timestamp": "2026-03-26T21:35:00",
        "overall_health": 84,
        "checks": [
            {"name": "network", "status": "passed", "message": "reachable", "severity": 1},
            {"name": "audio", "status": "failed", "message": "xrun spike", "severity": 3},
        ],
        "services_status": {"backend": "running", "pipewire": "running"},
        "recommendations": ["Inspect XRuns"],
    }
    assert recovery.status_code == 200
    assert recovery.json()["message"] == "Recovered node-a"
    assert shutdown.status_code == 200
    assert shutdown.json() == {
        "status": "ok",
        "message": "Shutdown started for node-a",
        "flows_drained": 3,
    }
    assert promote.status_code == 200
    assert promote.json() == {
        "status": "ok",
        "message": "Promoted node-a",
        "old_role": "audio_node",
        "new_role": "management_node",
    }
    assert demote.status_code == 200
    assert demote.json() == {
        "status": "ok",
        "message": "Demoted node-a",
        "flows_drained": 2,
    }


def test_cluster_health_summary_reports_unreachable_nodes(monkeypatch):
    client = _build_client(monkeypatch)

    response = client.get("/api/cluster/nodes/health/summary")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "timestamp": response.json()["timestamp"],
        "cluster_health": 42,
        "total_nodes": 2,
        "healthy_nodes": 1,
        "degraded_nodes": 0,
        "unreachable_nodes": 1,
        "nodes": [
            {
                "node_id": "node-a",
                "health": 84,
                "status": "healthy",
                "failed_checks": 1,
            },
            {
                "node_id": "node-b",
                "health": 0,
                "status": "unreachable",
                "error": "offline",
            },
        ],
    }
