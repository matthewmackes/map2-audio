from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import dashboard as dashboard_routes


class _FakeQueue:
    def __init__(self, size: int) -> None:
        self._size = size

    def qsize(self) -> int:
        return self._size


def _build_client(monkeypatch, *, breaker_manager, health_monitor, pool_manager, request_queue, feature_manager) -> TestClient:
    app = FastAPI()
    app.include_router(dashboard_routes.router)
    monkeypatch.setattr(dashboard_routes, "get_breaker_manager", lambda: breaker_manager)
    monkeypatch.setattr(dashboard_routes, "get_health_monitor", lambda: health_monitor)
    monkeypatch.setattr(dashboard_routes, "get_pool_manager", lambda: pool_manager)
    monkeypatch.setattr(dashboard_routes, "get_request_queue", lambda: request_queue)
    monkeypatch.setattr(dashboard_routes, "get_feature_manager", lambda: feature_manager)
    return TestClient(app)


def test_overview_dashboard_aggregates_breakers_health_queue_and_optional_sections(monkeypatch):
    breaker_manager = SimpleNamespace(
        _breakers={
            "api": SimpleNamespace(
                state=SimpleNamespace(name="CLOSED"),
                failure_count=1,
                success_count=9,
                last_failure_time=datetime(2026, 3, 26, 18, 0, 0),
                last_error=None,
                recovery_attempts=0,
            ),
            "db": SimpleNamespace(
                state=SimpleNamespace(name="OPEN"),
                failure_count=3,
                success_count=0,
                last_failure_time=None,
                last_error="timeout",
                recovery_attempts=1,
            ),
        }
    )
    health_monitor = SimpleNamespace(
        get_health_summary=lambda: {"status": "degraded"},
        get_all_service_statuses=lambda: {
            "api": {"status": "healthy"},
            "db": {"status": "degraded"},
        },
    )
    pool_manager = SimpleNamespace(
        pools={
            "local": SimpleNamespace(
                connections=[
                    SimpleNamespace(state=SimpleNamespace(name="IN_USE")),
                    SimpleNamespace(state=SimpleNamespace(name="IDLE")),
                ],
                get_metrics=lambda: SimpleNamespace(
                    total_connections=2,
                    total_reuses=8,
                    total_requests=10,
                ),
            )
        }
    )
    request_queue = SimpleNamespace(
        get_metrics=lambda: SimpleNamespace(
            total_queued=10,
            successful=8,
            failed=2,
            total_attempts=12,
        ),
        pending_queue=_FakeQueue(3),
        dead_letter=["failed-request"],
    )
    feature_manager = SimpleNamespace(
        get_system_health=lambda: {
            "system_healthy": False,
            "core_features": 2,
            "core_available": 1,
            "total_operational": 4,
            "degraded_features": 1,
            "unavailable_features": 1,
        },
        features={
            "routing": SimpleNamespace(
                status=SimpleNamespace(value="available"),
                level=SimpleNamespace(name="CORE"),
                is_operational=True,
                consecutive_failures=0,
            ),
            "sharing": SimpleNamespace(
                status=SimpleNamespace(value="degraded"),
                level=SimpleNamespace(name="STANDARD"),
                is_operational=False,
                consecutive_failures=2,
            ),
        },
    )
    monkeypatch.setattr(dashboard_routes, "AUDIO_HEALTH_AVAILABLE", True)
    monkeypatch.setattr(
        dashboard_routes,
        "get_audio_health_monitor",
        lambda: SimpleNamespace(
            get_audio_health_summary=lambda: {
                "status": "critical",
                "status_message": "XRuns detected",
                "thread_state": "warning",
                "signal_state": "ok",
                "is_running": True,
                "sample_rate": 48000,
                "block_size": 128,
                "latency_ms": 2.7,
                "total_blocks": 240,
                "total_xruns": 2,
                "xrun_rate_per_minute": 1.5,
                "input_level_db": -12.0,
                "buffer_health_pct": 92,
                "watchdog_enabled": True,
                "rt_priority_set": True,
                "is_auto_muted": False,
            },
            get_recent_alerts=lambda _count: [{"severity": "warning", "message": "XRuns detected"}],
        ),
    )
    monkeypatch.setattr(dashboard_routes, "PLUGIN_HEALTH_AVAILABLE", True)
    monkeypatch.setattr(
        dashboard_routes,
        "get_plugin_health_tracker",
        lambda: SimpleNamespace(
            get_all_plugin_health=lambda: [
                {
                    "uri": "map2://effects/chorus",
                    "name": "Chorus",
                    "state": "healthy",
                    "rt_safety": "safe",
                    "is_bypassed": False,
                    "avg_processing_ms": 0.2,
                    "failure_rate": 0.0,
                    "total_calls": 100,
                    "total_failures": 0,
                    "deadline_violations": 1,
                },
                {
                    "uri": "map2://effects/amp",
                    "name": "Amp",
                    "state": "warning",
                    "rt_safety": "watch",
                    "is_bypassed": True,
                    "avg_processing_ms": 0.8,
                    "failure_rate": 0.1,
                    "total_calls": 50,
                    "total_failures": 5,
                    "deadline_violations": 3,
                },
            ],
            get_bypassed_plugins=lambda: ["map2://effects/amp"],
            get_unhealthy_plugins=lambda: ["map2://effects/amp"],
        ),
    )
    client = _build_client(
        monkeypatch,
        breaker_manager=breaker_manager,
        health_monitor=health_monitor,
        pool_manager=pool_manager,
        request_queue=request_queue,
        feature_manager=feature_manager,
    )

    response = client.get("/api/dashboard/overview")

    assert response.status_code == 200
    payload = response.json()
    overview_timestamp = datetime.fromisoformat(payload["timestamp"])
    assert overview_timestamp.tzinfo is not None
    assert overview_timestamp.utcoffset() == timezone.utc.utcoffset(overview_timestamp)
    assert payload["system_status"] == "DEGRADED"
    assert payload["circuit_breakers"]["total_circuits"] == 2
    assert payload["circuit_breakers"]["open_circuits"] == 1
    assert payload["health_monitoring"]["healthy_services"] == 1
    assert payload["connection_pooling"]["pools"]["local"] == {
        "total_connections": 2,
        "active_connections": 1,
        "idle_connections": 1,
        "reuse_rate": "80.0%",
        "health": "healthy",
    }
    assert payload["request_queuing"]["pending_requests"] == 3
    assert payload["request_queuing"]["success_rate"] == "80.0%"
    assert payload["graceful_degradation"]["core_available"] == 1
    assert payload["audio_health"]["available"] is True
    assert payload["audio_health"]["metrics"]["total_xruns"] == 2
    assert payload["plugin_health"]["bypassed_plugins"] == 1
    assert payload["plugin_health"]["aggregate_stats"]["failure_rate"] == "3.33%"


def test_performance_and_reliability_dashboards_use_queue_and_recovery_metrics(monkeypatch):
    breaker_manager = SimpleNamespace(
        _breakers={
            "api": SimpleNamespace(
                state=SimpleNamespace(name="CLOSED"),
                failure_count=0,
                success_count=5,
                last_failure_time=None,
                last_error=None,
                recovery_attempts=2,
            )
        }
    )
    request_queue = SimpleNamespace(
        get_metrics=lambda: SimpleNamespace(
            total_queued=5,
            successful=5,
            failed=0,
            total_attempts=5,
        ),
        pending_queue=_FakeQueue(1),
        dead_letter=[],
    )
    feature_manager = SimpleNamespace(
        get_system_health=lambda: {
            "system_healthy": True,
            "core_features": 2,
            "core_available": 2,
        },
        features={},
    )
    client = _build_client(
        monkeypatch,
        breaker_manager=breaker_manager,
        health_monitor=SimpleNamespace(get_health_summary=lambda: {}, get_all_service_statuses=lambda: {}),
        pool_manager=SimpleNamespace(pools={}),
        request_queue=request_queue,
        feature_manager=feature_manager,
    )
    monkeypatch.setattr(dashboard_routes, "AUDIO_HEALTH_AVAILABLE", False)
    monkeypatch.setattr(dashboard_routes, "PLUGIN_HEALTH_AVAILABLE", False)

    performance_response = client.get("/api/dashboard/performance")
    reliability_response = client.get("/api/dashboard/reliability")

    assert performance_response.status_code == 200
    performance_timestamp = datetime.fromisoformat(performance_response.json()["timestamp"])
    assert performance_timestamp.tzinfo is not None
    assert performance_timestamp.utcoffset() == timezone.utc.utcoffset(performance_timestamp)
    assert performance_response.json()["throughput"] == {
        "requests_queued": 5,
        "success_rate": "100.0%",
        "queue_efficiency": "95%+",
    }

    assert reliability_response.status_code == 200
    reliability_timestamp = datetime.fromisoformat(reliability_response.json()["timestamp"])
    assert reliability_timestamp.tzinfo is not None
    assert reliability_timestamp.utcoffset() == timezone.utc.utcoffset(reliability_timestamp)
    assert reliability_response.json() == {
        "timestamp": reliability_response.json()["timestamp"],
        "availability": {
            "target": "99.5%",
            "core_features_available": "2/2",
            "system_health": "HEALTHY",
            "data_loss_events": 0,
            "auto_recovery_count": 1,
        },
        "failure_handling": {
            "cascading_failures": "Prevented by circuit breaker",
            "automatic_retry": "Exponential backoff with jitter",
            "data_preservation": "100% with persistent queue",
            "dead_letter_queue": 0,
            "recovery_timeout": "30 seconds default",
        },
        "feature_protection": {
            "core_features": 2,
            "always_operational": True,
            "graceful_degradation": "Enabled for all features",
            "feature_fallbacks": "Full, Degraded, Limited, Unavailable",
        },
    }
