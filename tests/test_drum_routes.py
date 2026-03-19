import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import drums as drum_routes
from app.services.websocket_manager import ws_manager


class _FakeDrumService:
    def __init__(self):
        self.state = {
            "ui_mode": "practice",
            "bpm": 120,
            "volume": 80,
            "pattern": 0,
            "variation": 0,
            "transport": False,
            "swing": 0,
            "active_pack": None,
            "practice_style_id": None,
            "practice_variation": 0,
            "practice_change_quantization": 1,
            "practice_count_in_bars": 1,
            "practice_auto_fill": False,
        }
        self.position = {
            "step": 0,
            "bar": 1,
            "beat": 1,
            "pattern": 0,
            "variation": 0,
            "updated_at": None,
        }

    def get_state(self):
        return dict(self.state)

    def update_state(self, patch):
        self.state.update(patch)
        return dict(self.state)

    def get_transport(self):
        return {
            "is_playing": self.state["transport"],
            "bpm": self.state["bpm"],
            "pattern": self.state["pattern"],
            "variation": self.state["variation"],
            "swing": self.state["swing"],
        }

    def update_transport(self, patch):
        if "is_playing" in patch:
            self.state["transport"] = patch["is_playing"]
        for key in ("bpm", "pattern", "variation", "swing"):
            if key in patch:
                self.state[key] = patch[key]
        return self.get_transport()

    def get_metering(self):
        return {
            "per_pad_peak": [0.0] * 16,
            "per_pad_rms": [0.0] * 16,
            "per_bus_peak": [0.0] * 8,
            "per_bus_rms": [0.0] * 8,
            "master_peak_left": 0.0,
            "master_peak_right": 0.0,
            "master_rms_left": 0.0,
            "master_rms_right": 0.0,
        }

    def get_position(self):
        return dict(self.position)

    def list_factory_packs(self):
        return [{"pack_id": "factory", "name": "Factory", "description": "", "source": "factory", "filename": "factory.json"}]

    def list_generated_packs(self):
        return [{"pack_id": "user", "name": "User", "description": "", "source": "user", "filename": "user.json"}]

    def get_factory_pack_details(self, pack_id):
        if pack_id != "factory":
            raise FileNotFoundError(pack_id)
        return {"pack_id": "factory", "name": "Factory"}

    def get_generated_pack_details(self, pack_id):
        if pack_id != "user":
            raise FileNotFoundError(pack_id)
        return {"pack_id": "user", "name": "User"}

    def save_generated_pack(self, pack):
        return {
            "status": "ok",
            "path": f"/tmp/{pack['pack_id']}.json",
            "pack_id": pack["pack_id"],
        }

    async def publish_state_update(self):
        await ws_manager.broadcast_json({"type": "drum_state", "data": self.get_state()}, topic="drums")

    async def publish_transport_update(self):
        await ws_manager.broadcast_json({"type": "drum_transport", "data": self.get_transport()}, topic="drums:transport")

    async def publish_position_update(self):
        await ws_manager.broadcast_json({"type": "drum_position", "data": self.get_position()}, topic="drums:position")


def _client(monkeypatch):
    app = FastAPI()
    app.include_router(drum_routes.router)
    service = _FakeDrumService()
    monkeypatch.setattr(drum_routes, "_get_service", lambda: service)
    ws_manager.event_history.clear()
    return TestClient(app)


def test_drum_state_route_returns_typed_defaults(monkeypatch):
    client = _client(monkeypatch)

    response = client.get("/api/engine/drums/state")

    assert response.status_code == 200
    payload = response.json()
    assert payload["bpm"] == 120
    assert payload["swing"] == 0
    assert payload["ui_mode"] == "practice"


def test_drum_state_route_validates_updates(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/engine/drums/state", json={"bpm": 500})

    assert response.status_code == 422


def test_drum_transport_route_updates_transport_projection(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/engine/drums/transport", json={"is_playing": True, "bpm": 96, "swing": 12})

    assert response.status_code == 200
    assert response.json() == {
        "is_playing": True,
        "bpm": 96,
        "pattern": 0,
        "variation": 0,
        "swing": 12,
    }
    history = ws_manager.get_event_history("drums:transport")
    assert history["events"][-1]["type"] == "drum_transport"
    assert history["events"][-1]["data"]["bpm"] == 96


def test_drum_position_route_returns_typed_position(monkeypatch):
    client = _client(monkeypatch)

    response = client.get("/api/engine/drums/position")

    assert response.status_code == 200
    assert response.json() == {
        "step": 0,
        "bar": 1,
        "beat": 1,
        "pattern": 0,
        "variation": 0,
        "updated_at": None,
    }


def test_drum_pack_upload_rejects_invalid_json(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/packs/upload",
        files={"file": ("bad.json", "{", "application/json")},
    )

    assert response.status_code == 400
    assert "Invalid JSON" in response.json()["detail"]


def test_drum_pack_upload_accepts_valid_json(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/packs/upload",
        files={"file": ("pack.json", json.dumps({"pack_id": "user-pack"}), "application/json")},
    )

    assert response.status_code == 200
    assert response.json()["pack_id"] == "user-pack"
