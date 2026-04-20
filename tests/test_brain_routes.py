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
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "program_change_enabled": True,
            "track_swing": [0] * 16,
            "pad_sound_sources": ["sample"] * 16,
            "pad_filters": [{"type": "lowpass"} for _ in range(16)],
            "pad_synth_params": [{"tone_amount": 0.55} for _ in range(16)],
            "pad_cv_gate_configs": [{"enabled": False} for _ in range(16)],
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

    def get_song_transport(self):
        return {
            "is_playing": True,
            "active_pattern": 3,
            "pending_pattern": 7,
            "switch_quantization_beats": 2,
        }

    def get_midi_output_config(self):
        return {
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "midi_output_channel": 9,
            "program_change_enabled": True,
        }


class _FakeDrumSequencerService:
    def get_song(self):
        return [{"pattern": 3, "repeat_count": 2}]

    def get_song_loop(self):
        return True

    def get_pattern(self, pattern_id: int):
        steps = [[{"velocity": 0, "accent": False} for _ in range(64)] for _ in range(16)]
        steps[0][0] = {"velocity": 127, "accent": True, "lock_volume": 0.75}
        steps[1][8] = {"velocity": 96, "accent": False, "lock_filter_cutoff": 4200.0}
        return {
            "pattern_id": pattern_id,
            "length": 16,
            "track_lengths": [16, 16] + [0] * 14,
            "steps": steps,
        }


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
                "output_bus": "aux_2" if index == 0 else "main",
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
            "sfz_path": "" if index == 0 else f"/sfz/{index}.sfz",
            "soundfont_path": "/soundfonts/studio-grand.sf2" if index == 0 else "",
            "active_bank": 0,
            "active_program": 0,
            "active_preset_name": f"Layer {index + 1}",
            "engine": "sfizz",
        }

    async def get_synthforge_part_parameters(self, index: int):
        return {
            "global.transpose": 7 if index == 0 else 0,
            "performance.velocity_curve": 0.25 if index == 0 else 0.0,
            "performance.pitch_bend_range": 12 if index == 0 else 2,
            "performance.mono_mode": 1.0 if index == 0 else 0.0,
            "performance.legato": 1.0 if index == 0 else 0.0,
        }

    async def get_synthforge_part_sampler_backend(self, index: int):
        return "native" if index == 0 else "sfizz"

    async def get_synthforge_part_streaming_config(self, index: int):
        return {
            "enabled": True,
            "preload_size": 131072,
            "max_voices": 48 if index == 0 else 24,
            "interpolation": "hermite",
            "quality_live": 5,
            "quality_freewheeling": 8,
            "memory_limit_mb": 256,
        }

    async def get_synthforge_part_hot_reload_status(self, index: int):
        return {
            "enabled": index == 0,
            "interval_ms": 1000,
            "pending_reload": False,
            "reloaded": False,
            "generation": 0,
            "last_reload_iso": "",
            "last_error": "",
        }

    async def get_synthforge_part_scala_tuning(self, index: int):
        return {
            "enabled": index == 0,
            "scala_path": "/tunings/studio-grand.scl" if index == 0 else "",
            "root_key": 60,
            "reference_hz": 440.0,
        }

    async def get_synthforge_part_mpe_config(self, index: int):
        return {
            "enabled": index == 0,
            "lower_zone_channels": 5 if index == 0 else 0,
            "upper_zone_channels": 0,
            "pitch_bend_range_semitones": 48,
        }

    async def get_synthforge_part_mod_matrix_routes(self, index: int):
        if index != 0:
            return []
        return [
            {
                "source": "modwheel",
                "destination": "filter.cutoff",
                "amount": 0.8,
                "bipolar": False,
                "enabled": True,
            }
        ]

    async def get_synthforge_part_backend_status(self, index: int):
        return {
            "backend": "native" if index == 0 else "sfizz",
            "sfizz_available": True,
            "sfizz_loaded": index != 0,
            "region_count": 14,
            "group_count": 2,
            "preloaded_samples": 128,
            "unknown_opcodes": [],
            "unsupported_opcodes": ["sw_lfo"] if index == 0 else [],
        }

    async def get_synthforge_patches(self, category: str = ""):
        return [
            {
                "bank": 0,
                "program": 0,
                "name": "Studio Grand",
                "category": "Piano",
                "author": "MAP2",
                "description": "Flagship piano patch",
            }
        ]


class _FakeWsManager:
    def __init__(self):
        self.messages = []

    async def broadcast_json(self, data, topic=None):
        self.messages.append({"topic": topic, "message": data})


class _FakeBrainAuthoritySyncService:
    def __init__(self, service: PerformanceBrainService):
        self.calls = []
        self.restored_states = {}
        self.service = service

    async def sync_instance(self, *, instance_id=None, plugin_position=None, triggered_by="ui"):
        self.calls.append(
            {
                "instance_id": instance_id,
                "plugin_position": plugin_position,
                "triggered_by": triggered_by,
            }
        )

    async def restore_instance(self, *, instance_id=None, plugin_position=None):
        key = (instance_id, plugin_position)
        payload = self.restored_states.get(key)
        if payload is None:
            return None
        return self.service.replace_state(payload, instance_id=instance_id, plugin_position=plugin_position)


def make_client(tmp_path: Path) -> tuple[TestClient, _FakeWsManager, _FakeBrainAuthoritySyncService]:
    service = PerformanceBrainService(root_path=tmp_path / "brain-routes")
    ws_manager = _FakeWsManager()
    authority_sync = _FakeBrainAuthoritySyncService(service)
    app = FastAPI()
    app.include_router(brain_routes.router)
    brain_routes.get_performance_brain_service = lambda: service
    brain_routes._brain_authority_service = lambda: authority_sync
    brain_routes.get_drum_machine_service = lambda: _FakeDrumMachineService()
    brain_routes.get_drum_sequencer_service = lambda: _FakeDrumSequencerService()
    brain_routes.get_drum_kit_service = lambda: _FakeDrumKitService()
    brain_routes.get_audio_engine = lambda: _FakeSynthForgeEngine()
    brain_routes.ws_manager = ws_manager
    return TestClient(app), ws_manager, authority_sync


def test_brain_routes_scope_state_by_instance_id(tmp_path):
    client, _, _ = make_client(tmp_path)

    update_response = client.post("/api/engine/brain/state?instance_id=17", json={"set_name": "Card Instance", "active_slot": 4})
    assert update_response.status_code == 200
    assert update_response.json()["set_name"] == "Card Instance"

    get_response = client.get("/api/engine/brain/state?instance_id=17")
    assert get_response.status_code == 200
    payload = get_response.json()
    assert payload["instance_id"] == "instance-17"
    assert payload["active_slot"] == 4


def test_brain_routes_scope_duplicate_instance_ids_by_plugin_position(tmp_path):
    client, _, _ = make_client(tmp_path)

    first_update = client.post(
        "/api/engine/brain/state?instance_id=17&plugin_position=0",
        json={"set_name": "Position Zero", "active_slot": 2},
    )
    second_update = client.post(
        "/api/engine/brain/state?instance_id=17&plugin_position=1",
        json={"set_name": "Position One", "active_slot": 9},
    )

    assert first_update.status_code == 200
    assert second_update.status_code == 200

    first_payload = client.get("/api/engine/brain/state?instance_id=17&plugin_position=0").json()
    second_payload = client.get("/api/engine/brain/state?instance_id=17&plugin_position=1").json()

    assert first_payload["instance_id"] == "instance-17__position-0"
    assert second_payload["instance_id"] == "instance-17__position-1"
    assert first_payload["set_name"] == "Position Zero"
    assert second_payload["set_name"] == "Position One"
    assert first_payload["active_slot"] == 2
    assert second_payload["active_slot"] == 9


def test_brain_routes_restore_scoped_state_from_authority_before_reads(tmp_path):
    client, _, authority_sync = make_client(tmp_path)
    seed_state = PerformanceBrainService(root_path=tmp_path / "brain-authority-seed").get_state()
    authority_sync.restored_states[("17", 3)] = {
        "instance_id": "instance-17__position-3",
        "product_name": "Performance Brain",
        "set_name": "Authority Recall",
        "active_slot": 6,
        "active_layer_id": "main-stack",
        "active_section": "perform",
        "transport": {
            "is_playing": True,
            "bpm": 133,
            "swing": 10,
            "pattern": 5,
            "variation": 2,
            "step": 0,
            "bar": 1,
            "beat": 1,
            "pending_pattern": -1,
            "switch_quantization_beats": 4,
        },
        "slots": seed_state["slots"],
        "layers": seed_state["layers"],
        "sequence": seed_state["sequence"],
        "song": seed_state["song"],
        "mixer": seed_state["mixer"],
        "inputs": seed_state["inputs"],
        "library": seed_state["library"],
        "sample_editor": seed_state["sample_editor"],
        "diagnostics": seed_state["diagnostics"],
        "snapshot_integration": seed_state["snapshot_integration"],
    }

    response = client.get("/api/engine/brain/state?instance_id=17&plugin_position=3")

    assert response.status_code == 200
    payload = response.json()
    assert payload["set_name"] == "Authority Recall"
    assert payload["active_slot"] == 6
    assert payload["transport"]["bpm"] == 133


def test_brain_routes_accept_session_media_active_section(tmp_path):
    client, _, _ = make_client(tmp_path)

    response = client.post(
        "/api/engine/brain/state",
        json={"active_section": "session_media"},
    )

    assert response.status_code == 200
    assert response.json()["active_section"] == "session_media"


def test_brain_routes_accept_practice_coach_active_section(tmp_path):
    client, _, _ = make_client(tmp_path)

    response = client.post(
        "/api/engine/brain/state",
        json={"active_section": "practice_coach"},
    )

    assert response.status_code == 200
    assert response.json()["active_section"] == "practice_coach"


def test_brain_routes_expose_scoped_controller_qualification(tmp_path):
    client, _, authority_sync = make_client(tmp_path)

    update_response = client.post(
        "/api/engine/brain/inputs?instance_id=17&plugin_position=3",
        json={
            "inputs": {
                "keyboard_zones": [],
                "trigger_profiles": [],
                "controller_assignments": [],
            }
        },
    )

    assert update_response.status_code == 200

    response = client.get("/api/engine/brain/diagnostics?instance_id=17&plugin_position=3")
    assert response.status_code == 200
    payload = response.json()
    qualification = payload["controller_qualification"]

    assert qualification["scoped_instance_key"] == "instance-17__position-3"
    assert qualification["controller_ready"] is False
    assert qualification["keyboard"]["ready"] is False
    assert qualification["triggers"]["ready"] is False
    assert qualification["sequence"]["ready"] is True
    assert qualification["routing"]["ready"] is False
    assert "No enabled keyboard zones configured." in qualification["issues"]
    assert authority_sync.calls[-1] == {
        "instance_id": "17",
        "plugin_position": 3,
        "triggered_by": "brain-route:inputs",
    }

    other_scope = client.get("/api/engine/brain/diagnostics?instance_id=17&plugin_position=4").json()
    assert other_scope["controller_qualification"]["controller_ready"] is True
    assert other_scope["controller_qualification"]["scoped_instance_key"] == "instance-17__position-4"


def test_brain_routes_import_drum_machine_state(tmp_path):
    client, _, authority_sync = make_client(tmp_path)

    response = client.post("/api/engine/brain/import/drums?instance_id=23")
    assert response.status_code == 200
    payload = response.json()
    assert payload["transport"]["bpm"] == 124
    assert payload["transport"]["pending_pattern"] == 7
    assert payload["transport"]["switch_quantization_beats"] == 2
    assert payload["song"]["loop"] is True
    assert payload["song"]["entries"][0]["pattern_id"] == 3
    assert payload["set_name"] == "Arena Kit Brain Import"
    assert payload["slots"][0]["name"] == "Kick"
    assert payload["sequence"]["patterns"][0]["pattern_id"] == 3
    assert payload["sequence"]["patterns"][0]["summary"] == "2 lanes · 2 active steps · locks: filter, volume"
    assert payload["sequence"]["lanes"][0]["step_lock_targets"] == ["volume"]
    assert payload["diagnostics"]["last_import_source"] == "drums"
    assert "Imported Drum Machine MIDI clock output remains a transport bridge." in payload["diagnostics"]["warnings"]
    assert authority_sync.calls[-1] == {
        "instance_id": "23",
        "plugin_position": None,
        "triggered_by": "brain-route:import-drums",
    }


def test_brain_routes_import_synthforge_state(tmp_path):
    client, _, authority_sync = make_client(tmp_path)

    response = client.post("/api/engine/brain/import/synthforge?instance_id=42")
    assert response.status_code == 200
    payload = response.json()
    assert payload["set_name"] == "Layer 1 Multi Import"
    assert payload["slots"][0]["name"] == "Layer 1"
    assert payload["slots"][0]["asset_type"] == "soundfont"
    assert payload["slots"][0]["source_label"] == "native · Piano"
    assert payload["slots"][0]["output_bus"] == 2
    assert payload["slots"][0]["transpose"] == 7
    assert payload["slots"][0]["velocity_curve"] == "mpe"
    assert payload["slots"][0]["articulation_group"] == "mono-legato"
    assert payload["slots"][0]["status"] == "imported-synthforge:native:hot-reload"
    assert payload["inputs"]["keyboard_zones"][0]["aftertouch_mode"] == "poly"
    assert payload["inputs"]["keyboard_zones"][0]["key_low"] == 0
    assert payload["inputs"]["controller_assignments"][0] == {
        "source": "part:1:modwheel",
        "target": "slot:0:filter.cutoff",
        "mode": "mod-matrix",
        "enabled": True,
    }
    patch_collection = next(
        collection
        for collection in payload["library"]["collections"]
        if collection["collection_id"] == "synthforge-patches"
    )
    assert patch_collection["assets"][0]["asset_type"] == "patch"
    assert patch_collection["assets"][0]["name"] == "Studio Grand"
    assert payload["diagnostics"]["active_voices"] == 9
    assert payload["diagnostics"]["backend_mode"] == "synthforge:mixed(native, sfizz)"
    assert "Part 1 uses Scala tuning from /tunings/studio-grand.scl." in payload["diagnostics"]["warnings"]
    assert "Part 1 backend native reports unsupported opcodes: sw_lfo." in payload["diagnostics"]["warnings"]
    assert payload["diagnostics"]["last_import_source"] == "synthforge"
    assert authority_sync.calls[-1] == {
        "instance_id": "42",
        "plugin_position": None,
        "triggered_by": "brain-route:import-synthforge",
    }


def test_brain_routes_broadcast_scoped_runtime_updates(tmp_path):
    client, ws_manager, authority_sync = make_client(tmp_path)

    response = client.post(
        "/api/engine/brain/transport?instance_id=17&plugin_position=3",
        json={"bpm": 131, "pattern": 4, "is_playing": True},
    )

    assert response.status_code == 200
    assert ws_manager.messages

    payload = ws_manager.messages[-1]
    assert payload["topic"] == "brain:runtime"
    assert payload["message"]["type"] == "brain_runtime_update"
    assert payload["message"]["topic"] == "brain:runtime"
    assert payload["message"]["data"]["resource"] == "transport"
    assert payload["message"]["data"]["scope"] == {
        "runtime_instance_id": "instance-17__position-3",
        "instance_id": "17",
        "plugin_position": 3,
    }
    assert payload["message"]["data"]["state"]["transport"]["bpm"] == 131
    assert payload["message"]["data"]["state"]["transport"]["pattern"] == 4
    assert payload["message"]["data"]["state"]["transport"]["is_playing"] is True
    assert authority_sync.calls[-1] == {
        "instance_id": "17",
        "plugin_position": 3,
        "triggered_by": "brain-route:transport",
    }
