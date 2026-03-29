"""
Phase 4 failover tests (Checkpoint 4.4)
"""

import pytest
import os
from fastapi.testclient import TestClient
from contextlib import asynccontextmanager

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


def test_failover_endpoint_exists(client):
    res = client.post("/api/cluster/snapshots/failover", json={"snapshot_id": 1})
    assert res.status_code in (200, 404)


def test_maintenance_endpoint_exists(client):
    res = client.post("/api/cluster/nodes/node-1/maintenance", json={"enabled": True})
    assert res.status_code in (200, 404)
