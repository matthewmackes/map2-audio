from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import websocket_rt as websocket_rt_routes


class _FakeRealtimeBridge:
    def __init__(self) -> None:
        self.clients = {}
        self.connect_calls: list[tuple[str, bool]] = []
        self.handle_calls: list[tuple[str, object]] = []
        self.disconnect_calls: list[str] = []
        self._param_cache = {"plugin-a:0": 0.5}

    async def connect_client(self, websocket, client_id: str, use_binary: bool = False):
        await websocket.accept()
        self.clients[client_id] = websocket
        self.connect_calls.append((client_id, use_binary))
        await websocket.send_json(
            {
                "type": "rt_welcome",
                "client_id": client_id,
                "protocol": "binary" if use_binary else "json",
            }
        )

    async def handle_message(self, client_id: str, data):
        self.handle_calls.append((client_id, data))
        websocket = self.clients[client_id]
        if isinstance(data, bytes):
            await websocket.send_json({"type": "binary_ack", "size": len(data)})
        else:
            await websocket.send_json({"type": "json_ack", "payload": data})

    def disconnect_client(self, client_id: str):
        self.disconnect_calls.append(client_id)
        self.clients.pop(client_id, None)

    def clear_param_cache(self):
        self._param_cache.clear()

    def get_stats(self):
        return {
            "connected_clients": len(self.clients),
            "handled_messages": len(self.handle_calls),
        }


def _build_client(monkeypatch, bridge: _FakeRealtimeBridge) -> TestClient:
    app = FastAPI()
    app.include_router(websocket_rt_routes.router)
    monkeypatch.setattr(websocket_rt_routes, "rt_parameter_bridge", bridge)
    return TestClient(app)


def test_rt_websocket_handles_json_and_binary_clients(monkeypatch):
    bridge = _FakeRealtimeBridge()
    client = _build_client(monkeypatch, bridge)

    with client.websocket_connect("/ws/rt") as websocket:
        welcome = websocket.receive_json()
        assert welcome["type"] == "rt_welcome"
        assert welcome["protocol"] == "json"
        websocket.send_text('{"action":"ping"}')
        assert websocket.receive_json() == {
            "type": "json_ack",
            "payload": '{"action":"ping"}',
        }

    with client.websocket_connect("/ws/rt?binary=true") as websocket:
        welcome = websocket.receive_json()
        assert welcome["type"] == "rt_welcome"
        assert welcome["protocol"] == "binary"
        websocket.send_bytes(b"\x01\x02\x03")
        assert websocket.receive_json() == {
            "type": "binary_ack",
            "size": 3,
        }

    assert len(bridge.connect_calls) == 2
    assert len(bridge.handle_calls) == 2
    assert len(bridge.disconnect_calls) == 2


def test_rt_stats_and_cache_clear_surface_bridge_state(monkeypatch):
    bridge = _FakeRealtimeBridge()
    client = _build_client(monkeypatch, bridge)

    stats_response = client.get("/ws/rt/stats")
    clear_response = client.post("/ws/rt/cache/clear")

    assert stats_response.status_code == 200
    assert stats_response.json() == {
        "connected_clients": 0,
        "handled_messages": 0,
    }
    assert clear_response.status_code == 200
    assert clear_response.json() == {"status": "cleared"}
    assert bridge._param_cache == {}
