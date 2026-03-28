"""
Phase 1 Integration Tests (Checkpoint 1.5)
"""

import pytest
import os
from fastapi.testclient import TestClient
from contextlib import asynccontextmanager

from app.services.flow_orchestrator import FlowOrchestrator

pytestmark = pytest.mark.skipif(
    os.getenv("MAP2_RUN_INTEGRATION_TESTS", "").lower() != "true",
    reason="Integration test disabled (set MAP2_RUN_INTEGRATION_TESTS=true to run)",
)


@pytest.fixture
def client():
    os.environ["MAP2_TEST_MODE"] = "true"
    from app.main import create_app
    app = create_app()

    @asynccontextmanager
    async def _no_lifespan(_app):
        yield

    app.router.lifespan_context = _no_lifespan
    return TestClient(app, raise_server_exceptions=False)


def test_phase1_cluster_routes_exist(client, monkeypatch):
    """Ensure cluster endpoints respond with the expected payload contract."""
    FlowOrchestrator.initialize()

    async def _fake_get_assignments(self):
        return []

    monkeypatch.setattr(FlowOrchestrator, "get_assignments", _fake_get_assignments)

    res_nodes = client.get("/api/cluster/nodes")
    assert res_nodes.status_code == 200
    assert res_nodes.json() == {"nodes": [], "count": 0}

    res_assignments = client.get("/api/cluster/flows/assignments")
    assert res_assignments.status_code == 200
    assert res_assignments.json() == {"assignments": [], "total": 0}


def test_phase1_flow_assignment_stub(client):
    """Ensure missing-node flow assignment fails explicitly."""
    FlowOrchestrator.initialize()

    response = client.post(
        "/api/cluster/flows/assign",
        json={
            "flow_id": "flow-0",
            "chain_id": 1,
            "node_id": "node-a",
            "redundancy_enabled": False,
        },
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Assignment failed"}
