import asyncio
from types import SimpleNamespace

from app.routes import health as health_routes


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.requested_services: list[str] = []
        self._services = {
            "juce_engine": {"state": "running"},
            "plugin_loader": {"state": "running", "health": {"metrics": {"plugin_count": 12}}},
        }

    def get_all_status(self):
        return {"services": self._services}

    def get_service_status(self, name: str):
        self.requested_services.append(name)
        return self._services.get(name)


class _FakeMetricsCollector:
    def __init__(self) -> None:
        self.cpu_history = [{"timestamp": "2026-03-07T00:00:00Z", "value": 12.5}]
        self.buffer_underruns = 0
        self.max_history = 3600

    def get_alerts(self):
        return []


def _patch_psutil(monkeypatch):
    class _Process:
        def memory_info(self):
            return SimpleNamespace(rss=256 * 1024 * 1024)

    monkeypatch.setattr(health_routes.os, "getpid", lambda: 1234)
    monkeypatch.setattr(health_routes.psutil, "Process", lambda pid: _Process())
    monkeypatch.setattr(health_routes.psutil, "virtual_memory", lambda: SimpleNamespace(percent=45.0))
    monkeypatch.setattr(health_routes.psutil, "cpu_percent", lambda interval=0.1: 12.5)


async def _fake_get_metrics_collector():
    return _FakeMetricsCollector()


class _FakeOrchestratorWithOptionalStopped(_FakeOrchestrator):
    def __init__(self) -> None:
        super().__init__()
        self._services["pipewire"] = {"state": "stopped", "is_optional": True}


def test_health_check_returns_healthy_without_dependency_errors(monkeypatch):
    _patch_psutil(monkeypatch)
    fake_orchestrator = _FakeOrchestrator()

    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: fake_orchestrator,
    )
    monkeypatch.setattr(
        "app.services.performance_metrics.get_metrics_collector",
        _fake_get_metrics_collector,
    )

    payload = asyncio.run(health_routes.health_check())

    assert payload["status"] == "healthy"
    assert payload["audio_running"] is True
    assert payload["nam_available"] is True
    assert payload["dependency_errors"] == []
    assert payload["issues"] == []
    assert payload["services_total"] == 2
    assert payload["services_running"] == payload["services_total"]
    assert payload["buffer_underruns"] == 0


def test_health_check_uses_juce_engine_service_lookup(monkeypatch):
    _patch_psutil(monkeypatch)
    fake_orchestrator = _FakeOrchestrator()

    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: fake_orchestrator,
    )
    monkeypatch.setattr(
        "app.services.performance_metrics.get_metrics_collector",
        _fake_get_metrics_collector,
    )

    payload = asyncio.run(health_routes.health_check())

    assert payload["audio_running"] is True
    assert "juce_engine" in fake_orchestrator.requested_services
    assert "audio_engine" not in fake_orchestrator.requested_services


def test_health_check_ignores_optional_services_in_degraded_status(monkeypatch):
    _patch_psutil(monkeypatch)
    fake_orchestrator = _FakeOrchestratorWithOptionalStopped()

    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: fake_orchestrator,
    )
    monkeypatch.setattr(
        "app.services.performance_metrics.get_metrics_collector",
        _fake_get_metrics_collector,
    )

    payload = asyncio.run(health_routes.health_check())

    assert payload["status"] == "healthy"
    assert payload["issues"] == []
    assert payload["services_total"] == 3
    assert payload["services_running"] == 2
    assert payload["services_required_total"] == 2
    assert payload["services_required_running"] == 2
    assert payload["services_optional_total"] == 1
    assert payload["services_optional_running"] == 0
