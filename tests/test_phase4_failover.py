"""
Phase 4 failover tests (Checkpoint 4.4)
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def test_failover_endpoint_exists(client):
    res = client.post("/api/cluster/flows/failover", json={"flow_id": "flow-0"})
    assert res.status_code in (200, 400)


def test_maintenance_endpoint_exists(client):
    res = client.post("/api/cluster/nodes/node-1/maintenance", json={"enabled": True})
    assert res.status_code in (200, 404)
