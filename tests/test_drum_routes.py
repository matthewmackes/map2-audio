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
            "pattern_id": 0,
            "variation": 0,
            "is_playing": False,
            "updated_at": None,
        }
        self.song = []
        self.song_loop = False
        self.patterns = {}

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

    def get_pattern(self, pattern_id):
        return self.patterns.get(pattern_id, self._default_pattern(pattern_id))

    def save_pattern(self, pattern_id, payload):
        pattern = self._default_pattern(pattern_id)
        pattern["length"] = payload["length"]
        pattern["steps"] = payload["steps"]
        self.patterns[pattern_id] = pattern
        return dict(pattern)

    def set_step(self, pattern_id, instrument, step, velocity, accent=False):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["steps"][instrument][step] = {"velocity": velocity, "accent": accent}
        return dict(pattern)

    def get_song(self):
        return list(self.song)

    def get_song_loop(self):
        return self.song_loop

    def replace_song(self, entries, song_loop=False):
        self.song = [
            {
                "pattern": entry.pattern if hasattr(entry, "pattern") else entry["pattern"],
                "repeat_count": entry.repeat_count if hasattr(entry, "repeat_count") else entry["repeat_count"],
            }
            for entry in entries
        ]
        self.song_loop = song_loop
        return self.get_song()

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

    @staticmethod
    def _default_pattern(pattern_id):
        return {
            "pattern_id": pattern_id,
            "length": 16,
            "steps": [
                [{"velocity": 0, "accent": False} for _ in range(64)]
                for _ in range(16)
            ],
        }


def _client(monkeypatch):
    app = FastAPI()
    app.include_router(drum_routes.router)
    service = _FakeDrumService()
    monkeypatch.setattr(drum_routes, "_get_service", lambda: service)
    monkeypatch.setattr(drum_routes, "_get_sequencer_service", lambda: service)
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
        "pattern_id": 0,
        "variation": 0,
        "is_playing": False,
        "updated_at": None,
    }


def test_drum_pattern_routes_round_trip_pattern_payload(monkeypatch):
    client = _client(monkeypatch)
    payload = {
        "pattern_id": 7,
        "length": 32,
        "steps": [
            [{"velocity": 0, "accent": False} for _ in range(64)]
            for _ in range(16)
        ],
    }
    payload["steps"][3][12] = {"velocity": 92, "accent": True}

    response = client.post("/api/engine/drums/pattern/7", json=payload)

    assert response.status_code == 200
    assert response.json()["pattern_id"] == 7
    assert response.json()["length"] == 32
    assert response.json()["steps"][3][12]["velocity"] == 92
    assert response.json()["steps"][3][12]["accent"] is True

    fetched = client.get("/api/engine/drums/pattern/7")
    assert fetched.status_code == 200
    assert fetched.json()["steps"][3][12]["velocity"] == 92


def test_drum_pattern_step_route_updates_single_step(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={"instrument": 2, "step": 5, "velocity": 110, "accent": False},
    )

    assert response.status_code == 200
    assert response.json()["pattern_id"] == 9
    assert response.json()["steps"][2][5]["velocity"] == 110


def test_drum_song_routes_round_trip_song_state(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/song",
        json={
            "song": [
                {"pattern": 4, "repeat_count": 2},
                {"pattern": 8, "repeat_count": 1},
            ],
            "song_loop": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["song"][0]["pattern"] == 4
    assert response.json()["song"][0]["repeat_count"] == 2
    assert response.json()["song_loop"] is True

    fetched = client.get("/api/engine/drums/song")
    assert fetched.status_code == 200
    assert fetched.json()["song"][1]["pattern"] == 8
    assert fetched.json()["song_loop"] is True


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
