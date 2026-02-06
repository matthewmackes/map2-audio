"""
Phase 5 endpoint smoke tests to improve coverage.
"""

import os
from fastapi.testclient import TestClient
from contextlib import asynccontextmanager


def create_test_client():
    os.environ["MAP2_TEST_MODE"] = "true"
    from app.main import create_app
    app = create_app()

    @asynccontextmanager
    async def _no_lifespan(_app):
        yield

    app.router.lifespan_context = _no_lifespan
    return TestClient(app)


def test_deploy_chain_endpoint_exists():
    client = create_test_client()
    response = client.post(
        "/api/chains/deploy",
        json={
            "chain_id": 1,
            "chain_name": "Test",
            "plugins": [],
            "mode": "active",
            "activate": True,
        },
    )
    assert response.status_code in (200, 400)


def test_cluster_assign_endpoint_exists():
    client = create_test_client()
    response = client.post(
        "/api/cluster/flows/assign",
        json={
            "flow_id": "flow-0",
            "chain_id": 1,
            "node_id": "node-a",
            "redundancy_enabled": False,
        },
    )
    assert response.status_code in (200, 400)
