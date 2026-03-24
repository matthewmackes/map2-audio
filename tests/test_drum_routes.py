from concurrent.futures import ThreadPoolExecutor
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
            "track_swing": [0] * 16,
        }
        self.position = {
            "step": 0,
            "bar": 1,
            "beat": 1,
            "pattern": 0,
            "pattern_id": 0,
            "variation": 0,
            "is_playing": False,
            "pending_pattern": -1,
            "switch_quantization_beats": 4,
            "updated_at": None,
        }
        self.song = []
        self.song_loop = False
        self.song_transport = {
            "is_playing": False,
            "current_entry_index": -1,
            "current_repeat": 0,
            "total_entries": 0,
            "loop": False,
            "active_pattern": 0,
        }
        self.patterns = {}
        self.midi_mapping = {
            "global_midi_channel": 0,
            "pads": [{"pad": pad, "notes": [36 + pad], "midi_channel": 0} for pad in range(16)],
        }
        self.velocity_curves = {
            "pads": [
                {
                    "pad": pad,
                    "curve_type": 0,
                    "fixed_velocity": 1.0,
                    "input_floor": 0.0,
                    "output_floor": 0.0,
                    "output_ceiling": 1.0,
                    "preview": [0.0] * 128,
                    "last_velocity": 0.0,
                }
                for pad in range(16)
            ]
        }
        self.zones = {"pads": [{"pad": pad, "zones": []} for pad in range(16)]}
        self.learn_state = {
            "active": False,
            "learn_all": False,
            "active_pad_index": -1,
            "next_pad_index": -1,
            "last_received_note": -1,
            "last_received_channel": -1,
            "timeout_seconds": 10,
        }
        self.presets = ["Roland PD-140DS / CY-18DR / VH-14D", "Yamaha DTX Multi-Zone"]

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
            "pending_pattern": self.position["pending_pattern"],
            "switch_quantization_beats": self.position["switch_quantization_beats"],
            "track_swing": list(self.state["track_swing"]),
        }

    def update_transport(self, patch):
        if "is_playing" in patch:
            self.state["transport"] = patch["is_playing"]
        for key in ("bpm", "pattern", "variation", "swing"):
            if key in patch:
                self.state[key] = patch[key]
        if "switch_quantization_beats" in patch:
            self.position["switch_quantization_beats"] = patch["switch_quantization_beats"]
        return self.get_transport()

    def set_track_swing(self, instrument, swing):
        self.state["track_swing"][instrument] = swing
        return {
            "instrument": instrument,
            "swing": swing,
            "track_swing": list(self.state["track_swing"]),
        }

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

    def trigger_fill(self):
        return {"status": "ok", "pattern": self.state["pattern"], "variation": self.state["variation"]}

    def get_midi_mapping(self):
        return json.loads(json.dumps(self.midi_mapping))

    def update_midi_mapping(self, payload):
        if "global_midi_channel" in payload:
            self.midi_mapping["global_midi_channel"] = payload["global_midi_channel"]
        for pad in payload.get("pads", []):
            self.midi_mapping["pads"][pad["pad"]] = pad
        return self.get_midi_mapping()

    def get_velocity_curves(self):
        return json.loads(json.dumps(self.velocity_curves))

    def update_velocity_curves(self, payload):
        for pad in payload.get("pads", []):
            self.velocity_curves["pads"][pad["pad"]].update(pad)
        return self.get_velocity_curves()

    def get_midi_zones(self):
        return json.loads(json.dumps(self.zones))

    def update_midi_zones(self, payload):
        for pad in payload.get("pads", []):
            self.zones["pads"][pad["pad"]] = pad
        return self.get_midi_zones()

    def start_midi_learn(self, pad, learn_all=False, timeout_seconds=10):
        self.learn_state = {
            "active": True,
            "learn_all": learn_all,
            "active_pad_index": pad,
            "next_pad_index": pad,
            "last_received_note": -1,
            "last_received_channel": -1,
            "timeout_seconds": timeout_seconds,
        }
        return dict(self.learn_state)

    def stop_midi_learn(self):
        self.learn_state["active"] = False
        self.learn_state["learn_all"] = False
        self.learn_state["active_pad_index"] = -1
        self.learn_state["next_pad_index"] = -1
        return dict(self.learn_state)

    def get_midi_learn_state(self):
        return dict(self.learn_state)

    def get_midi_presets(self):
        return {"presets": list(self.presets)}

    def load_midi_preset(self, preset_name):
        if preset_name not in self.presets:
            raise ValueError(f"Unknown drum MIDI preset: {preset_name}")
        self.zones["pads"][1] = {
            "pad": 1,
            "zones": [{"kind": 1, "trigger_note": 40, "key_switch_note": 36, "velocity_scale": 0.92, "enabled": True}],
        }
        return {
            "status": "ok",
            "preset_name": preset_name,
            "mapping": self.get_midi_mapping(),
            "zones": self.get_midi_zones(),
        }

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

    def get_song_transport(self):
        self.song_transport["total_entries"] = len(self.song)
        self.song_transport["loop"] = self.song_loop
        self.song_transport["active_pattern"] = self.state["pattern"]
        return dict(self.song_transport)

    def start_song_playback(self):
        first_pattern = self.song[0]["pattern"] if self.song else self.state["pattern"]
        self.song_transport = {
            "is_playing": bool(self.song),
            "current_entry_index": 0 if self.song else -1,
            "current_repeat": 1 if self.song else 0,
            "total_entries": len(self.song),
            "loop": self.song_loop,
            "active_pattern": first_pattern,
        }
        self.state["transport"] = bool(self.song)
        self.state["pattern"] = first_pattern
        self.position["pattern"] = first_pattern
        self.position["pattern_id"] = first_pattern
        self.position["is_playing"] = bool(self.song)
        return self.get_song_transport()

    def stop_song_playback(self, stop_transport=True):
        self.song_transport["is_playing"] = False
        if stop_transport:
            self.state["transport"] = False
            self.position["is_playing"] = False
        return self.get_song_transport()

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


class _FakeDrumKitService:
    def __init__(self):
        self.kits = {
            "factory_kit": self._kit_payload("factory_kit", "Factory Kit", "factory"),
            "user_kit": self._kit_payload("user_kit", "User Kit", "user"),
        }
        self.active_kit_id = None

    def list_kits(self):
        return [
            {
                "kit_id": kit["kit_id"],
                "name": kit["name"],
                "description": kit["description"],
                "author": kit["author"],
                "version": kit["version"],
                "category": kit["category"],
                "license": kit["license"],
                "source": kit["source"],
                "root_path": kit["root_path"],
            }
            for kit in self.kits.values()
        ]

    def get_kit(self, kit_id):
        if kit_id not in self.kits:
            raise FileNotFoundError(kit_id)
        return dict(self.kits[kit_id])

    def get_active_kit(self):
        if self.active_kit_id is None:
            return None
        payload = dict(self.kits[self.active_kit_id])
        payload["active"] = True
        return payload

    def load_kit(self, kit_id):
        if kit_id not in self.kits:
            raise FileNotFoundError(kit_id)
        self.active_kit_id = kit_id
        return {
            "status": "ok",
            "loaded_pad_count": 16,
            "kit": dict(self.kits[kit_id]),
            "engine_status": {f"pad_{index}": {"loaded": True} for index in range(16)},
        }

    def create_user_kit(self, template_kit_id, new_kit_id, name=None, description=None, author=None):
        if template_kit_id not in self.kits:
            raise FileNotFoundError(template_kit_id)
        created = dict(self.kits[template_kit_id])
        created.update(
            {
                "kit_id": new_kit_id,
                "name": name or created["name"],
                "description": description if description is not None else created["description"],
                "author": author if author is not None else created["author"],
                "source": "user",
                "root_path": f"/kits/{new_kit_id}",
            }
        )
        self.kits[new_kit_id] = created
        return dict(created)

    def import_user_kit_archive(self, _archive_bytes, filename="kit.zip"):
        imported = self._kit_payload("imported_kit", "Imported Kit", "user")
        self.kits["imported_kit"] = imported
        return dict(imported)

    def update_kit_instrument(self, kit_id, pad, patch):
        if kit_id not in self.kits:
            raise FileNotFoundError(kit_id)
        if self.kits[kit_id]["source"] != "user":
            raise PermissionError("Only user kits can be modified")
        if pad < 0 or pad >= 16:
            raise IndexError("pad must be in range 0..15")
        self.kits[kit_id]["instruments"][pad].update(patch)
        return dict(self.kits[kit_id])

    @staticmethod
    def _kit_payload(kit_id, name, source):
        return {
            "kit_id": kit_id,
            "name": name,
            "description": f"{name} description",
            "author": "MAP2",
            "version": 1,
            "category": "acoustic" if source == "factory" else "hybrid",
            "license": "CC0-1.0",
            "default_bpm": 120,
            "default_swing": 10,
            "source": source,
            "root_path": f"/kits/{kit_id}",
            "instruments": [
                {
                    "name": f"Pad {index + 1}",
                    "sfz_path": f"pad_{index}.sfz",
                    "default_note": 36 + index,
                    "bus_assignment": index % 8,
                    "default_volume": 0.8,
                    "default_pan": 0.0,
                    "default_tune": 0.0,
                }
                for index in range(16)
            ],
        }


def _app_with_service(monkeypatch):
    app = FastAPI()
    app.include_router(drum_routes.router)
    service = _FakeDrumService()
    kit_service = _FakeDrumKitService()
    monkeypatch.setattr(drum_routes, "_get_service", lambda: service)
    monkeypatch.setattr(drum_routes, "_get_sequencer_service", lambda: service)
    monkeypatch.setattr(drum_routes, "_get_kit_service", lambda: kit_service)
    ws_manager.event_history.clear()
    return app, service


def _client(monkeypatch):
    app, _ = _app_with_service(monkeypatch)
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


def test_drum_transport_route_rejects_out_of_range_variation(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/engine/drums/transport", json={"variation": 11})

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
        "pending_pattern": -1,
        "switch_quantization_beats": 4,
        "track_swing": [0] * 16,
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
        "pending_pattern": -1,
        "switch_quantization_beats": 4,
        "updated_at": None,
    }


def test_drum_fill_and_song_transport_routes(monkeypatch):
    client = _client(monkeypatch)

    fill = client.post("/api/engine/drums/fill/trigger")
    assert fill.status_code == 200
    assert fill.json()["status"] == "ok"

    client.post(
        "/api/engine/drums/song",
        json={"song": [{"pattern": 4, "repeat_count": 2}], "song_loop": True},
    )

    play = client.post("/api/engine/drums/song/transport/play")
    assert play.status_code == 200
    assert play.json()["is_playing"] is True
    assert play.json()["current_entry_index"] == 0
    assert play.json()["active_pattern"] == 4

    fetch = client.get("/api/engine/drums/song/transport")
    assert fetch.status_code == 200
    assert fetch.json()["loop"] is True
    assert fetch.json()["total_entries"] == 1

    stop = client.post("/api/engine/drums/song/transport/stop")
    assert stop.status_code == 200
    assert stop.json()["is_playing"] is False


def test_drum_midi_mapping_routes_round_trip_mapping(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/midi/mapping",
        json={
            "global_midi_channel": 10,
            "pads": [
                {"pad": 0, "notes": [36, 35], "midi_channel": 9},
                {"pad": 1, "notes": [38, 40], "midi_channel": 10},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["global_midi_channel"] == 10
    assert payload["pads"][0]["notes"] == [36, 35]
    assert payload["pads"][1]["midi_channel"] == 10


def test_drum_midi_velocity_curve_routes_round_trip_payload(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/midi/velocity-curves",
        json={
            "pads": [
                {
                    "pad": 0,
                    "curve_type": 2,
                    "fixed_velocity": 0.7,
                    "input_floor": 0.1,
                    "output_floor": 0.2,
                    "output_ceiling": 0.9,
                    "preview": [0.0] * 128,
                    "last_velocity": 0.5,
                }
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["pads"][0]["curve_type"] == 2
    assert payload["pads"][0]["output_ceiling"] == 0.9


def test_drum_midi_zone_routes_round_trip_payload(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/midi/zones",
        json={
            "pads": [
                {
                    "pad": 1,
                    "zones": [
                        {"kind": 0, "trigger_note": 38, "key_switch_note": -1, "velocity_scale": 1.0, "enabled": True},
                        {"kind": 1, "trigger_note": 40, "key_switch_note": 36, "velocity_scale": 0.92, "enabled": True},
                    ],
                }
            ]
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["pads"][1]["zones"][1]["trigger_note"] == 40


def test_drum_midi_learn_routes_start_status_and_stop(monkeypatch):
    client = _client(monkeypatch)

    start = client.post("/api/engine/drums/midi/learn/start", json={"pad": 3, "learn_all": True, "timeout_seconds": 12})
    assert start.status_code == 200
    assert start.json()["active"] is True
    assert start.json()["active_pad_index"] == 3

    status = client.get("/api/engine/drums/midi/learn/status")
    assert status.status_code == 200
    assert status.json()["learn_all"] is True

    stop = client.post("/api/engine/drums/midi/learn/stop")
    assert stop.status_code == 200
    assert stop.json()["active"] is False


def test_drum_midi_preset_routes_list_and_load(monkeypatch):
    client = _client(monkeypatch)

    presets = client.get("/api/engine/drums/midi/presets")
    assert presets.status_code == 200
    assert presets.json()["presets"][0] == "Roland PD-140DS / CY-18DR / VH-14D"

    load = client.post("/api/engine/drums/midi/presets/load", json={"preset_name": "Roland PD-140DS / CY-18DR / VH-14D"})
    assert load.status_code == 200
    assert load.json()["status"] == "ok"
    assert load.json()["zones"]["pads"][1]["zones"][0]["trigger_note"] == 40


def test_drum_midi_preset_route_returns_400_for_unknown_preset(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/engine/drums/midi/presets/load", json={"preset_name": "Unknown Preset"})

    assert response.status_code == 400
    assert "Unknown drum MIDI preset" in response.json()["detail"]


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


def test_drum_pattern_step_route_rejects_invalid_velocity(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={"instrument": 2, "step": 5, "velocity": 500, "accent": False},
    )

    assert response.status_code == 422


def test_drum_pattern_clear_and_copy_routes(monkeypatch):
    client = _client(monkeypatch)
    payload = {
        "pattern_id": 5,
        "length": 24,
        "steps": [
            [{"velocity": 0, "accent": False} for _ in range(64)]
            for _ in range(16)
        ],
    }
    payload["steps"][1][3] = {"velocity": 101, "accent": True}
    client.post("/api/engine/drums/pattern/5", json=payload)

    copy_response = client.post(
        "/api/engine/drums/pattern/copy",
        json={"source_pattern_id": 5, "destination_pattern_id": 6},
    )
    assert copy_response.status_code == 200
    assert copy_response.json()["pattern_id"] == 6
    assert copy_response.json()["steps"][1][3]["velocity"] == 101

    clear_response = client.post("/api/engine/drums/pattern/6/clear")
    assert clear_response.status_code == 200
    assert clear_response.json()["length"] == 16
    assert clear_response.json()["steps"][1][3]["velocity"] == 0


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


def test_drum_song_entry_routes_append_and_remove(monkeypatch):
    client = _client(monkeypatch)

    client.post(
        "/api/engine/drums/song",
        json={
            "song": [{"pattern": 4, "repeat_count": 2}],
            "song_loop": False,
        },
    )

    add_response = client.post(
        "/api/engine/drums/song/entries",
        json={"pattern": 12, "repeat_count": 3},
    )
    assert add_response.status_code == 200
    assert len(add_response.json()["song"]) == 2
    assert add_response.json()["song"][1]["pattern"] == 12

    remove_response = client.delete("/api/engine/drums/song/entries/0")
    assert remove_response.status_code == 200
    assert len(remove_response.json()["song"]) == 1
    assert remove_response.json()["song"][0]["pattern"] == 12


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


def test_drum_kits_route_lists_factory_and_user_metadata(monkeypatch):
    client = _client(monkeypatch)

    response = client.get("/api/engine/drums/kits")

    assert response.status_code == 200
    payload = response.json()
    assert {entry["kit_id"] for entry in payload} == {"factory_kit", "user_kit"}


def test_drum_kit_routes_get_load_and_read_active(monkeypatch):
    client = _client(monkeypatch)

    response = client.get("/api/engine/drums/kits/factory_kit")
    assert response.status_code == 200
    assert response.json()["kit_id"] == "factory_kit"

    load_response = client.post("/api/engine/drums/kits/load", json={"kit_id": "factory_kit"})
    assert load_response.status_code == 200
    assert load_response.json()["loaded_pad_count"] == 16

    active_response = client.get("/api/engine/drums/kits/active")
    assert active_response.status_code == 200
    assert active_response.json()["kit_id"] == "factory_kit"
    assert active_response.json()["active"] is True


def test_drum_kit_create_and_import_routes(monkeypatch):
    client = _client(monkeypatch)

    create_response = client.post(
        "/api/engine/drums/kits/create",
        json={
            "template_kit_id": "factory_kit",
            "new_kit_id": "custom_kit",
            "name": "Custom Kit",
            "author": "Tester",
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["kit"]["kit_id"] == "custom_kit"
    assert create_response.json()["source"] == "user"

    import_response = client.post(
        "/api/engine/drums/kits/import",
        files={"file": ("kit.zip", b"fake-zip-content", "application/zip")},
    )
    assert import_response.status_code == 200
    assert import_response.json()["kit"]["kit_id"] == "imported_kit"


def test_drum_kit_instrument_patch_route_updates_user_kit(monkeypatch):
    client = _client(monkeypatch)

    response = client.patch(
        "/api/engine/drums/kits/user_kit/instruments/3",
        json={"default_note": 72, "default_pan": -0.25},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["instruments"][3]["default_note"] == 72
    assert payload["instruments"][3]["default_pan"] == -0.25


def test_drum_kit_instrument_patch_route_rejects_factory_edits(monkeypatch):
    client = _client(monkeypatch)

    response = client.patch(
        "/api/engine/drums/kits/factory_kit/instruments/1",
        json={"default_note": 99},
    )

    assert response.status_code == 403


def test_drum_routes_support_concurrent_state_updates(monkeypatch):
    app, service = _app_with_service(monkeypatch)
    payloads = [
        {"bpm": 101, "pattern": 1, "variation": 1},
        {"bpm": 112, "pattern": 2, "variation": 2},
        {"bpm": 123, "pattern": 3, "variation": 3},
        {"bpm": 134, "pattern": 4, "variation": 4},
    ]

    def submit(payload):
        with TestClient(app) as client:
            response = client.post("/api/engine/drums/state", json=payload)
            assert response.status_code == 200
            return response.json()["state"]

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(submit, payloads))

    assert {result["bpm"] for result in results}.issubset({101, 112, 123, 134})
    final_state = service.get_state()
    assert final_state["bpm"] in {101, 112, 123, 134}
    assert final_state["pattern"] in {1, 2, 3, 4}
    assert final_state["variation"] in {1, 2, 3, 4}
