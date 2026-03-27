from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import system_tests as system_test_routes


class _FakeSystemTestService:
    def __init__(self, latest=None, summary=None) -> None:
        self.latest = latest
        self.summary = summary or {"overall_status": "passed"}
        self.history_calls: list[tuple[str, int]] = []

    def get_latest_engine_test(self):
        return self.latest

    def get_test_summary(self):
        return dict(self.summary)

    def get_test_history(self, test_type: str, days: int):
        self.history_calls.append((test_type, days))
        return {"test_type": test_type, "period_days": days, "results": []}


class _FakeProcess:
    def __init__(self, returncode: int = 0, stdout: bytes = b"ok", stderr: bytes = b"") -> None:
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self):
        return self._stdout, self._stderr


def _build_client(monkeypatch, service: _FakeSystemTestService) -> TestClient:
    app = FastAPI()
    app.include_router(system_test_routes.router)
    monkeypatch.setattr(system_test_routes, "test_service", service)
    return TestClient(app)


def test_latest_and_summary_routes_use_system_test_service(monkeypatch):
    latest = {
        "timestamp": "2026-03-26T21:10:00",
        "overall_status": "passed",
        "score": 98,
    }
    service = _FakeSystemTestService(
        latest=latest,
        summary={"overall_status": "passed", "tests": {"juce_engine": {"status": "passed"}}},
    )
    client = _build_client(monkeypatch, service)

    latest_response = client.get("/api/system-tests/test/juce-engine/latest")
    legacy_response = client.get("/api/system-tests/test/pipedal/latest")
    summary_response = client.get("/api/system-tests/test/summary")
    history_response = client.get("/api/system-tests/test/juce-engine/history?days=3")

    assert latest_response.status_code == 200
    assert latest_response.json() == latest
    assert legacy_response.status_code == 200
    assert legacy_response.json() == latest
    assert summary_response.status_code == 200
    assert summary_response.json() == {
        "overall_status": "passed",
        "tests": {"juce_engine": {"status": "passed"}},
    }
    assert history_response.status_code == 200
    assert history_response.json() == {"test_type": "juce-engine", "period_days": 3, "results": []}
    assert service.history_calls == [("juce-engine", 3)]


def test_latest_route_returns_404_when_no_results_exist(monkeypatch):
    client = _build_client(monkeypatch, _FakeSystemTestService(latest=None))

    response = client.get("/api/system-tests/test/juce-engine/latest")

    assert response.status_code == 404
    assert response.json() == {"detail": "No JUCE engine test results found"}


def test_run_and_status_routes_reflect_script_availability_and_latest_score(monkeypatch, tmp_path):
    latest = {
        "timestamp": "2026-03-26T21:12:00",
        "overall_status": "passed",
        "score": 82,
    }
    service = _FakeSystemTestService(latest=latest)
    client = _build_client(monkeypatch, service)
    (tmp_path / "test_juce_engine.py").write_text("print('ok')\n", encoding="utf-8")

    async def _fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(returncode=0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr(system_test_routes.Path, "cwd", staticmethod(lambda: tmp_path))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    run_response = client.post("/api/system-tests/test/juce-engine/run")
    status_response = client.get("/api/system-tests/test/status")

    assert run_response.status_code == 200
    assert run_response.json() == {
        "status": "completed",
        "message": "Test completed successfully",
        "results": latest,
    }
    assert status_response.status_code == 200
    assert status_response.json() == {
        "timestamp": status_response.json()["timestamp"],
        "testing_available": True,
        "boot_testing_configured": False,
        "last_engine_test": {
            "timestamp": "2026-03-26T21:12:00",
            "score": 82,
            "status": "passed",
        },
        "system_status": "good",
    }
