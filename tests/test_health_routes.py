import asyncio
from types import SimpleNamespace

from app.routes import health as health_routes
from app.services import system_health_summary


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

    def get_ready_status(self):
        return {
            "ready": True,
            "accepting_traffic": True,
            "uptime_seconds": 12.5,
            "summary": {"total_critical": 1, "healthy": 1, "unhealthy": 0},
            "critical_services": {
                "database": {
                    "display_name": "Database",
                    "state": "running",
                    "running": True,
                    "healthy": True,
                    "last_error": None,
                    "health_message": "",
                    "restart_count": 0,
                }
            },
            "traffic_gate_services": {
                "database": {
                    "display_name": "Database",
                    "state": "running",
                    "running": True,
                    "dependencies": [],
                    "last_error": None,
                },
                "command_queue": {
                    "display_name": "Command Queue",
                    "state": "running",
                    "running": True,
                    "dependencies": ["database"],
                    "last_error": None,
                },
                "websocket_manager": {
                    "display_name": "WebSocket Manager",
                    "state": "running",
                    "running": True,
                    "dependencies": [],
                    "last_error": None,
                },
            },
            "dependency_levels": [{"level": 1, "services": ["database", "websocket_manager"]}],
            "issues": [],
        }


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

    monkeypatch.setattr(system_health_summary.os, "getpid", lambda: 1234)
    monkeypatch.setattr(system_health_summary.psutil, "Process", lambda pid: _Process())
    monkeypatch.setattr(system_health_summary.psutil, "virtual_memory", lambda: SimpleNamespace(percent=45.0))
    monkeypatch.setattr(system_health_summary.psutil, "cpu_percent", lambda interval=0.1: 12.5)


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
    assert payload["subsystems"]["system"]["status"] == "healthy"
    assert payload["subsystems"]["orchestrator"]["services_total"] == 2
    assert payload["subsystems"]["performance"]["buffer_underruns"] == 0
    assert payload["subsystems"]["plugins"]["plugins_loaded"] == 12
    assert "deployment" in payload["subsystems"]
    assert "health_monitor" in payload["subsystems"]


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


def test_health_check_includes_midi_cluster_section(monkeypatch):
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
    monkeypatch.setattr(
        "app.config.config_get",
        lambda key, default=None: {"midi.cluster.enabled": True}.get(key, default),
    )

    class _FakeDiscovery:
        def get_discovery_summary(self):
            return {"total_nodes": 2}

    class _FakeClock:
        def get_state(self):
            return SimpleNamespace(
                master_node_id="node-a",
                strategy=SimpleNamespace(value="leader-node"),
                is_master=True,
                drift_ms=0.25,
                sync_offset_ms=0.0,
            )

    class _FakeRouter:
        def get_connections(self):
            return [object(), object()]

    monkeypatch.setattr(
        "app.services.midi_hub.midi_discovery.get_midi_discovery_service",
        lambda: _FakeDiscovery(),
    )
    monkeypatch.setattr(
        "app.services.midi_hub.cluster_clock.get_midi_cluster_clock",
        lambda: _FakeClock(),
    )
    monkeypatch.setattr(
        "app.services.midi_hub.cluster_router.get_midi_cluster_router",
        lambda: _FakeRouter(),
    )

    payload = asyncio.run(health_routes.health_check())

    assert payload["midi_cluster"]["enabled"] is True
    assert payload["midi_cluster"]["node_count"] == 2
    assert payload["midi_cluster"]["connection_count"] == 2
    assert payload["midi_cluster"]["clock_status"] == "master"
    assert payload["midi_cluster"]["master_node_id"] == "node-a"


def test_ready_check_returns_accepting_traffic_details(monkeypatch):
    fake_orchestrator = _FakeOrchestrator()
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: fake_orchestrator,
    )

    response = asyncio.run(health_routes.ready_check())

    assert response.status_code == 200
    assert response.body
    payload = response.body.decode("utf-8")
    assert '"ready":true' in payload
    assert '"accepting_traffic":true' in payload
    assert '"traffic_gate_services"' in payload
