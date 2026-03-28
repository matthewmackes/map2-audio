"""
Phase 5 smoke tests (Checkpoint 5.1)
"""

import os
import pytest
from fastapi.testclient import TestClient
from contextlib import asynccontextmanager

pytestmark = pytest.mark.skipif(
    os.getenv("MAP2_RUN_INTEGRATION_TESTS", "").lower() != "true",
    reason="Integration test disabled (set MAP2_RUN_INTEGRATION_TESTS=true to run)",
)


def create_test_client():
    os.environ["MAP2_TEST_MODE"] = "true"
    from app.main import create_app
    app = create_app()

    @asynccontextmanager
    async def _no_lifespan(_app):
        yield

    app.router.lifespan_context = _no_lifespan
    return TestClient(app, raise_server_exceptions=False)


def test_app_boots():
    client = create_test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["status"], str)
    assert isinstance(payload["overall_status"], str)
    assert isinstance(payload["uptime_seconds"], (int, float))
    assert isinstance(payload["audio_running"], bool)
