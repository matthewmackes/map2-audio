from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import cpu_metrics as cpu_routes


class _FakeEngine:
    def __init__(self, *, running: bool, metrics: dict[str, float] | None = None) -> None:
        self.is_running = running
        self._metrics = metrics or {}

    async def get_cpu_metrics(self):
        return dict(self._metrics)

    async def get_total_cpu(self):
        return self._metrics.get("total_cpu_percent", 0.0)

    async def get_plugin_cpu(self, instance_id: int):
        return self._metrics.get("per_plugin_percent", {}).get(str(instance_id), 0.0)

    async def get_xrun_count(self):
        return int(self._metrics.get("xrun_count", 0))


def _build_client(monkeypatch, engine: _FakeEngine) -> TestClient:
    app = FastAPI()
    app.include_router(cpu_routes.router)
    monkeypatch.setattr(cpu_routes, "get_audio_engine", lambda: engine)
    return TestClient(app)


def test_cpu_routes_return_safe_defaults_when_engine_is_offline(monkeypatch):
    client = _build_client(monkeypatch, _FakeEngine(running=False))

    metrics_response = client.get("/api/engine/cpu")
    total_response = client.get("/api/engine/cpu/total")
    plugins_response = client.get("/api/engine/cpu/plugins")
    xruns_response = client.get("/api/engine/cpu/xruns")
    headroom_response = client.get("/api/engine/cpu/headroom")
    budget_response = client.get("/api/engine/cpu/budget")
    plugin_response = client.get("/api/engine/cpu/plugin/7")

    assert metrics_response.status_code == 200
    assert metrics_response.json() == {
        "total_cpu_percent": 0.0,
        "audio_callback_percent": 0.0,
        "peak_cpu_percent": 0.0,
        "average_cpu_percent": 0.0,
        "xrun_count": 0,
        "budget_ms": 0.0,
        "current_callback_ms": 0.0,
        "headroom_percent": 100.0,
        "per_plugin_percent": {},
        "running": False,
    }
    assert total_response.json() == {"cpu_percent": 0.0, "running": False}
    assert plugins_response.json() == {"plugins": {}}
    assert xruns_response.json() == {"xrun_count": 0}
    assert headroom_response.json() == {"headroom_percent": 100.0}
    assert budget_response.json() == {
        "budget_ms": 0.0,
        "current_ms": 0.0,
        "utilization_percent": 0.0,
    }
    assert plugin_response.status_code == 503
    assert plugin_response.json() == {"detail": "Audio engine not running"}


def test_cpu_routes_return_live_engine_metrics_and_budget_calculations(monkeypatch):
    engine = _FakeEngine(
        running=True,
        metrics={
            "total_cpu_percent": 37.5,
            "audio_callback_percent": 22.0,
            "peak_cpu_percent": 44.0,
            "average_cpu_percent": 31.0,
            "xrun_count": 4,
            "budget_ms": 2.0,
            "current_callback_ms": 0.5,
            "headroom_percent": 75.0,
            "per_plugin_percent": {"7": 12.5, "9": 4.0},
        },
    )
    client = _build_client(monkeypatch, engine)

    metrics_response = client.get("/api/engine/cpu")
    total_response = client.get("/api/engine/cpu/total")
    plugin_response = client.get("/api/engine/cpu/plugin/7")
    plugins_response = client.get("/api/engine/cpu/plugins")
    xruns_response = client.get("/api/engine/cpu/xruns")
    headroom_response = client.get("/api/engine/cpu/headroom")
    budget_response = client.get("/api/engine/cpu/budget")

    assert metrics_response.status_code == 200
    assert metrics_response.json() == {
        "total_cpu_percent": 37.5,
        "audio_callback_percent": 22.0,
        "peak_cpu_percent": 44.0,
        "average_cpu_percent": 31.0,
        "xrun_count": 4,
        "budget_ms": 2.0,
        "current_callback_ms": 0.5,
        "headroom_percent": 75.0,
        "per_plugin_percent": {"7": 12.5, "9": 4.0},
        "running": True,
    }
    assert total_response.json() == {"cpu_percent": 37.5, "running": True}
    assert plugin_response.json() == {"instance_id": 7, "cpu_percent": 12.5}
    assert plugins_response.json() == {"plugins": {"7": 12.5, "9": 4.0}}
    assert xruns_response.json() == {"xrun_count": 4}
    assert headroom_response.json() == {"headroom_percent": 75.0}
    assert budget_response.json() == {
        "budget_ms": 2.0,
        "current_ms": 0.5,
        "utilization_percent": 25.0,
    }
