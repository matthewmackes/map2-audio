"""
API tests for cluster flow routes (Checkpoint 1.3)
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.flow_orchestrator import FlowOrchestrator


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_get_cluster_nodes(client):
    """GET /api/cluster/nodes returns list structure."""
    response = client.get("/api/cluster/nodes")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "count" in data


def test_get_flow_assignments(client):
    """GET /api/cluster/flows/assignments returns assignments list."""
    FlowOrchestrator.initialize()
    response = client.get("/api/cluster/flows/assignments")
    assert response.status_code == 200
    data = response.json()
    assert "assignments" in data
    assert "total" in data
