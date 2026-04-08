import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse

import app.routes.dev_proxy as dev_proxy_route
import app.services.api_observatory as observatory_service_module
from app.middleware.traffic_capture import TrafficCaptureMiddleware
from app.routes import api_observatory
from app.routes import dev_proxy
from app.routes import websocket as websocket_routes
from app.services.api_observatory import ApiObservatoryService
from app.services.websocket_manager import ws_manager


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
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_cache", None)
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_cache_at", 0.0)
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_run_cache", {})
    monkeypatch.setattr(
        "app.services.service_orchestrator.get_orchestrator",
        lambda: type(
            "_FakeOrchestrator",
            (),
            {
                "get_all_status": lambda self: {
                    "orchestrator": {"running": True},
                    "services": {
                        "database": {
                            "state": "running",
                            "health": {"healthy": True},
                        }
                    },
                    "startup_progress": {"ready_services": 3, "total_services": 3},
                    "traffic_gate_services": ["database"],
                }
            },
        )(),
    )

    app = FastAPI()
    app.add_middleware(TrafficCaptureMiddleware, enabled=True)

    @app.get("/api/ping")
    async def _ping():
        return {"pong": True}

    app.include_router(api_observatory.router)

    client = TestClient(app)
    ping = client.get("/api/ping", headers={"X-MAP2-Run-ID": "qual-123"})
    assert ping.status_code == 200
    ping_repeat = client.get("/api/ping", headers={"X-MAP2-Run-ID": "qual-123"})
    assert ping_repeat.status_code == 200

    traffic = client.get("/api/observatory/traffic", params={"run_id": "qual-123"})
    assert traffic.status_code == 200
    traffic_payload = traffic.json()
    assert traffic_payload["count"] >= 2
    matching_events = [event for event in traffic_payload["events"] if event["path"] == "/api/ping"]
    assert len(matching_events) == 2
    assert matching_events[-1]["run_id"] == "qual-123"
    assert matching_events[0]["meta"]["dependency_snapshot"]["orchestrator_running"] is True
    assert matching_events[1]["meta"]["dependency_snapshot"] is None

    stats = client.get("/api/observatory/traffic/stats", params={"run_id": "qual-123"})
    assert stats.status_code == 200
    stats_payload = stats.json()
    assert stats_payload["total_requests"] >= 1


def test_traffic_capture_skips_streaming_body_and_preserves_background(monkeypatch):
    monkeypatch.setattr(observatory_service_module, "_api_observatory_service", None)
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_cache", None)
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_cache_at", 0.0)
    monkeypatch.setattr("app.middleware.traffic_capture._dependency_snapshot_run_cache", {})

    background_events: list[str] = []

    async def _stream():
        yield b"chunk-1"
        yield b"chunk-2"

    def _background() -> None:
        background_events.append("completed")

    app = FastAPI()
    app.add_middleware(TrafficCaptureMiddleware, enabled=True)

    @app.get("/api/stream-error")
    async def _stream_error():
        return StreamingResponse(
            _stream(),
            status_code=500,
            media_type="text/plain",
            background=BackgroundTask(_background),
        )

    app.include_router(api_observatory.router)

    client = TestClient(app)
    response = client.get("/api/stream-error")

    assert response.status_code == 500
    assert response.text == "chunk-1chunk-2"
    assert background_events == ["completed"]

    traffic = client.get("/api/observatory/traffic")
    stream_event = next(event for event in traffic.json()["events"] if event["path"] == "/api/stream-error")
    assert stream_event["meta"]["streaming_response"] is True
    assert stream_event["meta"]["res_body"] is None


def test_websocket_events_are_captured_with_run_id(monkeypatch):
    monkeypatch.setattr(observatory_service_module, "_api_observatory_service", None)
    ws_manager.active_connections.clear()
    ws_manager.subscriptions.clear()
    ws_manager.connection_info.clear()

    app = FastAPI()
    app.include_router(websocket_routes.router)
    app.include_router(api_observatory.router)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/v1?run_id=ws-qual-1&client_label=locust-meter-1") as websocket:
            welcome = websocket.receive_json()
            assert welcome["type"] == "welcome"
            websocket.send_json({"action": "subscribe", "topic": "meters"})
            subscribed = websocket.receive_json()
            assert subscribed["type"] == "subscribed"

    traffic = client.get(
        "/api/observatory/traffic",
        params={"event_type": "websocket", "run_id": "ws-qual-1"},
    )
    assert traffic.status_code == 200
    payload = traffic.json()
    actions = [event["meta"]["action"] for event in payload["events"]]
    assert "connect" in actions
    assert "subscribe" in actions
    assert "disconnect" in actions
