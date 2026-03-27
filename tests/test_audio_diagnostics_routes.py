from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import audio_diagnostics as diagnostics_routes


class _FakeEngine:
    def __init__(self) -> None:
        self.reported_round_trip: list[float] = []
        self.reset_called = False

    def get_audio_io_stats(self):
        return {
            "xrun_count": 2,
            "xruns_since_reset": 1,
            "last_xrun_timestamp": 123.456,
            "callback_jitter_ms": 1.2345,
            "peak_callback_jitter_ms": 2.3456,
            "budget_utilization": 63.87,
            "latency_ms": 4.567,
            "callback_budget_ms": 5.4321,
            "avg_callback_duration_ms": 2.3456,
            "measured_input_latency_ms": 1.1111,
            "measured_output_latency_ms": 2.2222,
            "measured_round_trip_ms": 6.7,
            "uptime_seconds": 42.44,
            "cpu_usage": 12.34,
            "samples_processed": 4096,
        }

    def get_connection_health(self):
        raise RuntimeError("device disconnected")

    def get_cpu_metrics(self):
        return {"cpu_percent": 12.3}

    def get_total_latency_samples(self):
        return 128

    def get_total_latency_ms(self):
        return 2.6789

    def get_device_reported_latency_ms(self):
        return 3.4567

    def get_latency_breakdown(self):
        return [{"plugin": "Amp", "latency_ms": 1.2}]

    def get_xrun_history(self):
        return [101.1, 102.2]

    def reset_xrun_counter(self):
        self.reset_called = True

    def set_measured_round_trip_latency(self, round_trip_ms: float):
        self.reported_round_trip.append(round_trip_ms)


class _FakeRecoveryService:
    def get_status(self):
        return {"state": "healthy", "last_recovery": None}

    async def force_recovery(self, level: str):
        return {"status": "ok", "level": level}


def _build_client(monkeypatch, *, engine=None, recovery=None) -> TestClient:
    app = FastAPI()
    app.include_router(diagnostics_routes.router)
    monkeypatch.setattr(diagnostics_routes, "_get_engine", lambda: engine)
    monkeypatch.setattr(diagnostics_routes, "_get_recovery_service", lambda: recovery)
    return TestClient(app)


def test_full_diagnostics_returns_engine_snapshot_and_inline_errors(monkeypatch):
    client = _build_client(
        monkeypatch,
        engine=_FakeEngine(),
        recovery=_FakeRecoveryService(),
    )

    response = client.get("/api/audio/diagnostics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["engine_available"] is True
    assert payload["io_stats"]["xrun_count"] == 2
    assert payload["connection_health_error"] == "device disconnected"
    assert payload["cpu_metrics"] == {"cpu_percent": 12.3}
    assert payload["latency"] == {
        "chain_latency_samples": 128,
        "chain_latency_ms": 2.6789,
        "device_reported_ms": 3.4567,
        "breakdown": [{"plugin": "Amp", "latency_ms": 1.2}],
    }
    assert payload["recovery"] == {"state": "healthy", "last_recovery": None}


def test_xruns_route_requires_engine(monkeypatch):
    client = _build_client(monkeypatch, engine=None, recovery=None)

    response = client.get("/api/audio/diagnostics/xruns")

    assert response.status_code == 503
    assert response.json() == {"detail": "Audio engine not available"}


def test_latency_mutation_and_measurement_validation(monkeypatch):
    engine = _FakeEngine()
    client = _build_client(monkeypatch, engine=engine, recovery=None)
    monkeypatch.setattr(diagnostics_routes.os.path, "exists", lambda _path: True)

    set_response = client.post(
        "/api/audio/diagnostics/latency/set-measured",
        json={"round_trip_ms": 7.25},
    )
    invalid_mode_response = client.post(
        "/api/audio/diagnostics/latency/measure?mode=invalid",
    )
    invalid_duration_response = client.post(
        "/api/audio/diagnostics/latency/measure?duration=31",
    )

    assert set_response.status_code == 200
    assert set_response.json() == {
        "status": "ok",
        "measured_round_trip_ms": 7.25,
    }
    assert engine.reported_round_trip == [7.25]
    assert invalid_mode_response.status_code == 400
    assert invalid_mode_response.json()["detail"] == "mode must be one of: internal, loopback"
    assert invalid_duration_response.status_code == 400
    assert invalid_duration_response.json()["detail"] == "duration must be between 1 and 30 seconds"
