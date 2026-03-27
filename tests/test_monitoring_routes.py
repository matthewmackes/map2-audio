from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import monitoring as monitoring_routes


class _FakePoolManager:
    def get_stats(self):
        return {"checked_out": 2, "total_errors": 1}

    async def health_check(self):
        return True


class _FakeResourceManager:
    def __init__(self) -> None:
        self.unbypassed: list[str] = []
        self.reset: list[str] = []

    def get_all_usage(self):
        return {
            "plugin-a": {"bypassed": True},
            "plugin-b": {"bypassed": False},
        }

    def get_usage(self, plugin_uri: str):
        return SimpleNamespace(
            cpu_time_ms=1.2,
            memory_mb=32.5,
            avg_time_ms=0.8,
            total_calls=12,
            timeout_count=1,
            last_timeout=datetime(2026, 3, 26, 21, 0, 0),
        )

    def get_limits(self, plugin_uri: str):
        return SimpleNamespace(
            max_cpu_time_ms=50.0,
            max_memory_mb=100.0,
            enabled=True,
        )

    def is_bypassed(self, plugin_uri: str):
        return plugin_uri == "plugin-a"

    def unbypass_plugin(self, plugin_uri: str):
        self.unbypassed.append(plugin_uri)

    def reset_plugin(self, plugin_uri: str):
        self.reset.append(plugin_uri)


class _FakeValidator:
    def validate(self, config):
        return SimpleNamespace(
            valid=False,
            errors=["missing sample_rate"],
            warnings=["using fallback"],
            timestamp=datetime(2026, 3, 26, 21, 5, 0),
        )


class _FakeHotReloadManager:
    def __init__(self) -> None:
        self._reloadable_keys = {"audio.latency", "midi.enabled"}
        self.reload_calls: list[tuple[str, object]] = []

    def is_reloadable(self, key: str):
        return key in self._reloadable_keys

    async def reload(self, key: str, value):
        self.reload_calls.append((key, value))
        return True


def _build_client(monkeypatch, *, pool=None, resource=None, validator=None, hot_reload=None) -> tuple[TestClient, _FakeHotReloadManager, _FakeResourceManager]:
    fake_pool = pool or _FakePoolManager()
    fake_resource = resource or _FakeResourceManager()
    fake_validator = validator or _FakeValidator()
    fake_hot_reload = hot_reload or _FakeHotReloadManager()

    app = FastAPI()
    app.include_router(monitoring_routes.router)
    monkeypatch.setattr(monitoring_routes, "get_pool_manager", lambda: fake_pool)
    monkeypatch.setattr(monitoring_routes, "get_resource_manager", lambda: fake_resource)
    monkeypatch.setattr(monitoring_routes, "get_validator", lambda: fake_validator)
    monkeypatch.setattr(monitoring_routes, "get_hot_reload_manager", lambda: fake_hot_reload)
    return TestClient(app), fake_hot_reload, fake_resource


def test_monitoring_status_routes_report_pool_plugin_and_system_health(monkeypatch):
    client, _hot_reload, _resource = _build_client(monkeypatch)

    pool_response = client.get("/api/monitoring/database/pool-stats")
    health_response = client.get("/api/monitoring/database/health")
    plugin_response = client.get("/api/monitoring/plugins/resource-stats/plugin-a")
    summary_response = client.get("/api/monitoring/system/health-summary")

    assert pool_response.status_code == 200
    assert pool_response.json() == {"checked_out": 2, "total_errors": 1}
    assert health_response.status_code == 200
    assert health_response.json() == {"healthy": True}
    assert plugin_response.status_code == 200
    assert plugin_response.json() == {
        "uri": "plugin-a",
        "usage": {
            "cpu_time_ms": 1.2,
            "memory_mb": 32.5,
            "avg_time_ms": 0.8,
            "total_calls": 12,
            "timeout_count": 1,
            "last_timeout": "2026-03-26T21:00:00",
        },
        "limits": {
            "max_cpu_time_ms": 50.0,
            "max_memory_mb": 100.0,
            "enabled": True,
        },
        "bypassed": True,
    }
    assert summary_response.status_code == 200
    assert summary_response.json() == {
        "database": {
            "healthy": True,
            "active_connections": 2,
            "total_errors": 1,
        },
        "plugins": {
            "total_tracked": 2,
            "bypassed_count": 1,
            "bypassed_plugins": ["plugin-a"],
        },
        "status": "degraded",
    }


def test_monitoring_control_routes_validate_and_mutate_runtime_state(monkeypatch):
    client, hot_reload, resource = _build_client(monkeypatch)

    validate_response = client.post(
        "/api/monitoring/config/validate",
        json={"config": {"audio": {"latency": 64}}},
    )
    hot_reloadable_response = client.get("/api/monitoring/config/hot-reloadable")
    hot_reload_response = client.post(
        "/api/monitoring/config/hot-reload",
        json={"key": "audio.latency", "value": 128},
    )
    unbypass_response = client.post("/api/monitoring/plugins/plugin-a/unbypass")
    reset_response = client.post("/api/monitoring/plugins/plugin-a/reset-stats")

    assert validate_response.status_code == 200
    assert validate_response.json() == {
        "valid": False,
        "errors": ["missing sample_rate"],
        "warnings": ["using fallback"],
        "timestamp": "2026-03-26T21:05:00",
    }
    assert hot_reloadable_response.status_code == 200
    assert sorted(hot_reloadable_response.json()["reloadable_keys"]) == ["audio.latency", "midi.enabled"]
    assert hot_reload_response.status_code == 200
    hot_reload_payload = hot_reload_response.json()
    assert hot_reload_payload["status"] == "success"
    assert hot_reload_payload["message"] == "Configuration 'audio.latency' hot-reloaded successfully"
    assert hot_reload_payload["data"] == {"key": "audio.latency", "value": 128}
    assert unbypass_response.status_code == 200
    assert unbypass_response.json()["message"] == "Bypass removed for plugin-a"
    assert reset_response.status_code == 200
    assert reset_response.json()["message"] == "Statistics reset for plugin-a"
    assert hot_reload.reload_calls == [("audio.latency", 128)]
    assert resource.unbypassed == ["plugin-a"]
    assert resource.reset == ["plugin-a"]
