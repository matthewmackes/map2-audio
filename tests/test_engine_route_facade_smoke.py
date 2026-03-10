from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.routes.engine as engine_routes


class _FakeEngine:
    def get_audio_io_stats(self):
        return {"xruns": 0}

    def get_connection_health(self):
        return {"connected": True}

    def get_xrun_history(self):
        return []

    def get_sample_rate(self):
        return 48000

    def get_buffer_size(self):
        return 64

    def is_midi_enabled(self):
        return True


class _FakeService:
    def __init__(self):
        self.engine = _FakeEngine()
        self.is_available = True
        self.is_running = True

    def get_system_info(self):
        return {"running": True, "available": True}

    def get_version(self):
        return "test-version"


def test_engine_routes_work_through_facade(monkeypatch):
    fake_service = _FakeService()
    monkeypatch.setattr(engine_routes, "get_engine_service", lambda: fake_service)

    app = FastAPI()
    app.include_router(engine_routes.router)
    client = TestClient(app)

    status = client.get("/api/engine/status")
    diagnostics = client.get("/api/engine/diagnostics")

    assert status.status_code == 200
    assert status.json()["running"] is True
    assert diagnostics.status_code == 200
    assert diagnostics.json()["sample_rate"] == 48000
    assert diagnostics.json()["buffer_size"] == 64
