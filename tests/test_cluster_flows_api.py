"""
API tests for cluster flow routes (Checkpoint 1.3)
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
