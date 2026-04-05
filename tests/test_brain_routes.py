from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import brain as brain_routes
from app.services.performance_brain_service import PerformanceBrainService


class _FakeDrumMachineService:
    def get_state(self):
        return {
            "transport": True,
            "bpm": 124,
            "swing": 11,
            "pattern": 3,
            "variation": 1,
            "volume": 83,
            "track_swing": [0] * 16,
            "pad_sound_sources": ["sample"] * 16,
        }

    def get_pad_controls(self):
        return [
            {
                "pad_id": index,
                "volume": 80,
                "pan": 0,
                "tune": 0,
                "mute": False,
                "solo": False,
                "bus_assignment": index % 8,
            }
            for index in range(16)
        ]

    def get_bus_mixers(self):
        return [
            {
                "bus_id": index,
                "name": f"Bus {index + 1}",
                "level": 75,
                "pan": 0,
                "mute": False,
                "solo": False,
                "output_pair": index % 4,
                "reverb_send": 8,
            }
            for index in range(8)
        ]

    def get_master_fx(self):
        return {
            "drive_db": 1.5,
            "compressor_ratio": 3.0,
            "reverb_mix": 0.2,
            "limiter_threshold": -0.5,
        }

    def get_midi_mapping(self):
        return {"pads": [{"pad": pad, "notes": [36 + pad], "midi_channel": 0} for pad in range(16)]}

    def get_velocity_curves(self):
        return {"pads": [{"pad": pad, "curve_type": "dynamic"} for pad in range(16)]}

    def get_midi_zones(self):
        return {"pads": [{"pad": pad, "zones": []} for pad in range(16)]}


class _FakeDrumSequencerService:
    def get_song(self):
        return [{"pattern_id": 3, "repeat_count": 2}]

    def get_song_loop(self):
        return True


class _FakeDrumKitService:
    def get_active_kit(self):
        return {
            "name": "Arena Kit",
            "instruments": [{"name": "Kick" if index == 0 else f"Pad {index + 1}", "sfz_path": f"/kits/{index}.sfz"} for index in range(16)],
        }


class _FakeSynthForgeEngine:
    async def get_synthforge_parts_config(self):
        return [
            {
                "part_index": index,
                "midi_channel": index + 1,
                "output_bus": "main",
                "level": 1.0,
                "pan": 0.0,
                "mute": False,
                "solo": False,
            }
            for index in range(16)
        ]

    async def get_synthforge_voice_metrics(self):
        return {"active_voices": 9, "peak_voices": 21, "voices_per_part": [1] * 16}

    async def get_synthforge_part_sample_status(self, index: int):
        return {
            "loaded": True,
            "sampler_mode": True,
            "sfz_path": f"/sfz/{index}.sfz",
            "soundfont_path": "",
            "active_preset_name": f"Layer {index + 1}",
            "engine": "sfizz",
        }

    async def get_synthforge_part_parameters(self, index: int):
        return {"global.transpose": 7 if index == 0 else 0}


def make_client(tmp_path: Path) -> TestClient:
    service = PerformanceBrainService(root_path=tmp_path / "brain-routes")
    app = FastAPI()
    app.include_router(brain_routes.router)
    brain_routes.get_performance_brain_service = lambda: service
    brain_routes.get_drum_machine_service = lambda: _FakeDrumMachineService()
    brain_routes.get_drum_sequencer_service = lambda: _FakeDrumSequencerService()
    brain_routes.get_drum_kit_service = lambda: _FakeDrumKitService()
    brain_routes.get_audio_engine = lambda: _FakeSynthForgeEngine()
    return TestClient(app)


def test_brain_routes_scope_state_by_instance_id(tmp_path):
    client = make_client(tmp_path)

    update_response = client.post("/api/engine/brain/state?instance_id=17", json={"set_name": "Card Instance", "active_slot": 4})
    assert update_response.status_code == 200
    assert update_response.json()["set_name"] == "Card Instance"

    get_response = client.get("/api/engine/brain/state?instance_id=17")
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["instance_id"] == "instance-17"
    assert payload["active_slot"] == 4


def test_brain_routes_import_drum_machine_state(tmp_path):
    client = make_client(tmp_path)

    response = client.post("/api/engine/brain/import/drums?instance_id=23")
    assert response.status_code == 200
    payload = response.json()
    assert payload["transport"]["bpm"] == 124
    assert payload["song"]["loop"] is True
    assert payload["slots"][0]["name"] == "Kick"
    assert payload["diagnostics"]["last_import_source"] == "drums"


def test_brain_routes_import_synthforge_state(tmp_path):
    client = make_client(tmp_path)

    response = client.post("/api/engine/brain/import/synthforge?instance_id=42")
    assert response.status_code == 200
    payload = response.json()
    assert payload["slots"][0]["name"] == "Layer 1"
    assert payload["slots"][0]["transpose"] == 7
    assert payload["diagnostics"]["active_voices"] == 9
    assert payload["diagnostics"]["last_import_source"] == "synthforge"
