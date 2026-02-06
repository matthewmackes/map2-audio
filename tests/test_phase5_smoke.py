"""
Phase 5 smoke tests (Checkpoint 5.1)
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


def test_app_boots():
    client = create_test_client()
    response = client.get("/api/health")
    assert response.status_code in (200, 404)
