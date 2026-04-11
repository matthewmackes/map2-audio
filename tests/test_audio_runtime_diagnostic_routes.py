from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import audio as audio_routes


class _DiagnosticServiceStub:
    def __init__(self, *, available: bool = True, running: bool = True) -> None:
        self.is_available = available
        self._running = running
        self._sample_rate = 48000

    def is_audio_running(self):
        return self._running

    def get_system_info(self):
        return {
            "buffer_size": 256,
            "sample_rate": self._sample_rate,
            "cpu_load": 12.5,
            "underruns": 0,
            "xruns": 0,
        }

    async def set_sample_rate(self, rate: int):
        self._sample_rate = rate
        return True


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(audio_routes.router)
    return TestClient(app)


def test_full_diagnostics_emits_utc_timestamp_and_nonnegative_durations(monkeypatch):
    service = _DiagnosticServiceStub()

    monkeypatch.setattr(audio_routes, "get_engine_service", lambda: service)
    monkeypatch.setattr(audio_routes, "utc_now", lambda: datetime(2026, 4, 11, 12, 20, tzinfo=timezone.utc))
    client = _build_client()

    response = client.post("/api/audio/diagnostics/full")

    assert response.status_code == 200
    payload = response.json()
    parsed = datetime.fromisoformat(payload["timestamp"])
    assert parsed.tzinfo is not None
    assert parsed.utcoffset() == timezone.utc.utcoffset(parsed)
    assert payload["overall_status"] in {"pass", "warning", "fail"}
    assert len(payload["tests"]) == 5
    assert all(test["duration_ms"] >= 0 for test in payload["tests"])


def test_sample_rate_unsupported_uses_monotonic_duration(monkeypatch):
    service = _DiagnosticServiceStub()

    monkeypatch.setattr(audio_routes, "get_engine_service", lambda: service)
    client = _build_client()

    response = client.post("/api/audio/test/sample-rate?rate=12345")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is False
    assert payload["test_name"] == "Sample Rate Test (12345 Hz)"
    assert payload["duration_ms"] >= 0
    assert "Unsupported sample rate" in payload["message"]
