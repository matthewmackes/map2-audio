from __future__ import annotations

from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient

from app.middleware.api_auth import APIAuthMiddleware, required_role_for_scope


def build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(APIAuthMiddleware)

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.get("/api/engine/status")
    async def engine_status():
        return {"status": "ok"}

    @app.post("/api/engine/start")
    async def engine_start():
        return {"started": True}

    @app.post("/api/cluster/nodes/node-a/reboot")
    async def cluster_reboot():
        return {"ok": True}

    @app.websocket("/ws/updates")
    async def updates(websocket: WebSocket):
        await websocket.accept()
        await websocket.send_json({"ok": True})
        await websocket.close()

    return app


def test_required_role_resolution():
    assert required_role_for_scope("http", "GET", "/api/health") is None
    assert required_role_for_scope("http", "GET", "/api/engine/status") == "operator"
    assert required_role_for_scope("http", "POST", "/api/engine/start") == "admin"
    assert required_role_for_scope("http", "POST", "/api/cluster/nodes/node-a/reboot") == "cluster"
    assert required_role_for_scope("websocket", None, "/ws/updates") == "operator"


def test_http_auth_role_enforcement(monkeypatch):
    monkeypatch.setenv("MAP2_API_AUTH_MODE", "required")
    monkeypatch.setenv("MAP2_API_OPERATOR_TOKEN", "op-token")
    monkeypatch.setenv("MAP2_API_ADMIN_TOKEN", "admin-token")
    monkeypatch.setenv("MAP2_API_CLUSTER_TOKEN", "cluster-token")

    client = TestClient(build_app())

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/engine/status").status_code == 401
    assert client.get("/api/engine/status", headers={"Authorization": "Bearer op-token"}).status_code == 200
    assert client.post("/api/engine/start", headers={"Authorization": "Bearer op-token"}).status_code == 403
    assert client.post("/api/engine/start", headers={"Authorization": "Bearer admin-token"}).status_code == 200
    assert client.post("/api/cluster/nodes/node-a/reboot", headers={"Authorization": "Bearer admin-token"}).status_code == 403
    assert client.post("/api/cluster/nodes/node-a/reboot", headers={"Authorization": "Bearer cluster-token"}).status_code == 200


def test_websocket_requires_operator_token(monkeypatch):
    monkeypatch.setenv("MAP2_API_AUTH_MODE", "required")
    monkeypatch.setenv("MAP2_API_OPERATOR_TOKEN", "op-token")
    client = TestClient(build_app())

    with client.websocket_connect("/ws/updates?token=op-token") as websocket:
        assert websocket.receive_json() == {"ok": True}
