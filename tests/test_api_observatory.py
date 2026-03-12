import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.routes.dev_proxy as dev_proxy_route
import app.services.api_observatory as observatory_service_module
from app.middleware.traffic_capture import TrafficCaptureMiddleware
from app.routes import api_observatory
from app.routes import dev_proxy
from app.services.api_observatory import ApiObservatoryService


def _build_test_app() -> FastAPI:
    app = FastAPI()

    @app.api_route("/api/echo", methods=["GET", "POST"])
    async def _echo(payload: dict | None = None):
        return {
            "ok": True,
            "payload": payload or {},
        }

    app.include_router(dev_proxy.router)
    app.include_router(api_observatory.router)
    return app


def test_api_observatory_service_stats_and_sessions():
    service = ApiObservatoryService(max_events=5)
    for idx in range(6):
        service.record_traffic_event(
            {
                "method": "GET",
                "path": f"/api/test/{idx % 2}",
                "status": 200 if idx < 5 else 503,
                "duration_ms": 10 + idx,
                "response_size": 100 + idx,
            }
        )

    events = service.list_traffic_events(limit=10)
    stats = service.build_traffic_stats(events)

    assert len(events) == 5
    assert stats["total_requests"] == 5
    assert stats["error_rate_percent"] > 0
    assert len(stats["top_called_endpoints"]) >= 1

    session = service.start_recording("Regression")
    service.record_traffic_event(
        {
            "method": "POST",
            "path": "/api/save",
            "status": 201,
            "duration_ms": 33,
            "response_size": 22,
        }
    )
    stopped = service.stop_recording()

    assert stopped is not None
    assert stopped.session_id == session.session_id
    exported = service.export_session_har(session.session_id)
    assert exported is not None
    assert exported["log"]["entries"]


def test_dev_proxy_disabled_returns_403(monkeypatch):
    monkeypatch.setenv("MAP2_DEV_PROXY", "0")
    monkeypatch.setenv("MAP2_TEST_MODE", "0")
    monkeypatch.setattr(dev_proxy_route, "config_get", lambda key, default=None: False)

    app = _build_test_app()
    client = TestClient(app)

    response = client.post(
        "/api/dev/proxy",
        json={
            "method": "GET",
            "url": "/api/echo",
        },
    )

    assert response.status_code == 403
    assert "disabled" in response.text.lower()


def test_dev_proxy_local_request_and_timing(monkeypatch):
    monkeypatch.setenv("MAP2_DEV_PROXY", "1")
    monkeypatch.setattr(dev_proxy_route, "config_get", lambda key, default=None: True)

    app = _build_test_app()
    client = TestClient(app)

    response = client.post(
        "/api/dev/proxy",
        json={
            "method": "POST",
            "url": "/api/echo",
            "headers": {"x-test": "1"},
            "body": {"value": 7},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == 200
    assert payload["body"]["payload"] == {"value": 7}
    assert payload["timing"]["total_ms"] >= 0


def test_traffic_capture_middleware_and_routes(monkeypatch):
    monkeypatch.setenv("MAP2_DEV_PROXY", "1")
    monkeypatch.setattr(dev_proxy_route, "config_get", lambda key, default=None: True)

    # Reset singleton state for deterministic assertions.
    monkeypatch.setattr(observatory_service_module, "_api_observatory_service", None)

    app = FastAPI()
    app.add_middleware(TrafficCaptureMiddleware, enabled=True)

    @app.get("/api/ping")
    async def _ping():
        return {"pong": True}

    app.include_router(api_observatory.router)

    client = TestClient(app)
    ping = client.get("/api/ping")
    assert ping.status_code == 200

    traffic = client.get("/api/observatory/traffic")
    assert traffic.status_code == 200
    traffic_payload = traffic.json()
    assert traffic_payload["count"] >= 1
    assert any(event["path"] == "/api/ping" for event in traffic_payload["events"])

    stats = client.get("/api/observatory/traffic/stats")
    assert stats.status_code == 200
    stats_payload = stats.json()
    assert stats_payload["total_requests"] >= 1
