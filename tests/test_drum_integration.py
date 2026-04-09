import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import drums as drum_routes
from app.services import drum_kit_service as drum_kit_service_module
from app.services import drum_machine_service as drum_machine_service_module
from app.services import drum_sequencer_service as drum_sequencer_service_module
from app.services.websocket_manager import ws_manager


class _FakeIntegratedDrumEngine:
    def __init__(self):
        self.loaded_sfzs = {}
        self.loaded_pads = set()
        self.pad_buses = {pad: pad % 8 for pad in range(16)}
        self.pad_notes = {pad: [36 + pad] for pad in range(16)}
        self.patterns = {}
        self.song = []
        self.song_loop = False
        self.swing = 0.0
        self.accent_velocity = 127
        self.transport_calls = []
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
        }
        self.metering = self._silent_metering()
        self.queued_pattern = -1

    @staticmethod
    def _default_pattern(pattern_id):
        return {
            "length": 16,
            "steps": [
                [{"velocity": 0, "accent": False} for _ in range(64)]
                for _ in range(16)
            ],
            "pattern_id": pattern_id,
        }

    @staticmethod
    def _silent_metering():
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

    def _refresh_metering(self):
        if not self.position["is_playing"]:
            self.metering = self._silent_metering()
            return

        pattern = self.patterns.get(self.position["pattern"], self._default_pattern(self.position["pattern"]))
        active_pads = [
            pad for pad in range(16)
            if pattern["steps"][pad][self.position["step"]]["velocity"] > 0 and pad in self.loaded_pads
        ]
        if not active_pads:
            self.metering = self._silent_metering()
            return

        metering = self._silent_metering()
        for pad in active_pads:
            metering["per_pad_peak"][pad] = 0.72
            metering["per_pad_rms"][pad] = 0.31
            bus = self.pad_buses.get(pad, pad % 8)
            metering["per_bus_peak"][bus] = max(metering["per_bus_peak"][bus], 0.81)
            metering["per_bus_rms"][bus] = max(metering["per_bus_rms"][bus], 0.34)
        metering["master_peak_left"] = 0.67
        metering["master_peak_right"] = 0.63
        metering["master_rms_left"] = 0.29
        metering["master_rms_right"] = 0.27
        self.metering = metering

    def advance_step(self, step, *, bar=None, beat=None):
        self.position["step"] = step
        self.position["beat"] = beat if beat is not None else min(4, (step // 4) + 1)
        if bar is not None:
            self.position["bar"] = bar
        self._refresh_metering()

    def load_drum_pad_sfz(self, pad_index, sfz_path):
        self.loaded_sfzs[pad_index] = sfz_path
        self.loaded_pads.add(pad_index)
        self._refresh_metering()
        return True

    def set_drum_pad_note(self, pad_index, midi_note):
        self.pad_notes[pad_index] = [midi_note]
        return True

    def add_drum_pad_note(self, pad_index, midi_note):
        self.pad_notes.setdefault(pad_index, [])
        if midi_note not in self.pad_notes[pad_index]:
            self.pad_notes[pad_index].append(midi_note)
        return True

    def remove_drum_pad_note(self, pad_index, midi_note):
        if midi_note in self.pad_notes.get(pad_index, []):
            self.pad_notes[pad_index].remove(midi_note)
        return True

    def get_drum_pad_notes(self, pad_index):
        return list(self.pad_notes.get(pad_index, []))

    def set_drum_pad_midi_channel(self, pad_index, channel):
        return True

    def set_drum_pad_velocity_curve(self, pad, curve_type, fixed_velocity, input_floor, output_floor, output_ceiling):
        return True

    def get_drum_pad_velocity_curve_preview(self, _pad):
        return [round(index / 127.0, 6) for index in range(128)]

    def get_drum_pad_last_velocity(self, _pad):
        return 0.66

    def set_drum_pad_zone(self, pad, kind, trigger_note, key_switch_note, velocity_scale):
        return True

    def clear_drum_pad_zone(self, pad, kind):
        return True

    def get_drum_pad_zones(self, pad):
        return []

    def get_drum_global_midi_channel(self):
        return 10

    def set_drum_global_midi_channel(self, value):
        return True

    def get_drum_midi_learn_state(self):
        return {
            "active": False,
            "learn_all": False,
            "active_pad_index": -1,
            "next_pad_index": -1,
            "last_received_note": -1,
            "last_received_channel": -1,
            "timeout_seconds": 10,
        }

    def start_drum_midi_learn(self, pad, learn_all, timeout_seconds):
        return True

    def stop_drum_midi_learn(self):
        return True

    def get_drum_midi_presets(self):
        return ["Roland PD-140DS / CY-18DR / VH-14D"]

    def apply_drum_midi_preset(self, preset_name):
        return True

    def set_drum_master_volume(self, value):
        return True

    def set_drum_bpm(self, bpm):
        return True

    def set_drum_current_pattern(self, pattern):
        self.position["pattern"] = pattern
        self.position["pattern_id"] = pattern
        self.position["pending_pattern"] = -1
        self._refresh_metering()
        return True

    def queue_drum_pattern_switch(self, pattern):
        self.queued_pattern = pattern
        self.position["pending_pattern"] = pattern
        return True

    def get_drum_pending_pattern_switch(self):
        return self.position["pending_pattern"]

    def set_drum_pattern_switch_quantization(self, beats):
        self.position["switch_quantization_beats"] = beats
        return True

    def get_drum_pattern_switch_quantization(self):
        return self.position["switch_quantization_beats"]

    def set_drum_variation(self, pattern, variation):
        self.position["pattern"] = pattern
        self.position["pattern_id"] = pattern
        self.position["variation"] = variation
        return True

    def set_drum_swing(self, percent):
        self.swing = percent
        return True

    def trigger_drum_fill(self):
        return True

    def set_drum_transport_playing(self, is_playing):
        self.transport_calls.append(is_playing)
        self.position["is_playing"] = is_playing
        self._refresh_metering()
        return True

    def get_drum_metering(self):
        self._refresh_metering()
        return dict(self.metering)

    def get_drum_sequencer_position(self):
        return dict(self.position)

    def get_drum_pattern_data(self, pattern_id):
        return self.patterns.get(pattern_id, self._default_pattern(pattern_id))

    def clear_drum_pattern(self, pattern_id):
        self.patterns[pattern_id] = self._default_pattern(pattern_id)
        return True

    def set_drum_pattern_length(self, pattern_id, steps):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["length"] = steps
        return True

    def set_drum_step(
        self,
        pattern_id,
        instrument,
        step,
        velocity,
        accent=False,
        micro_timing=0,
        probability=1.0,
        ratchet_count=1,
        ratchet_decay=0,
        lock_pitch=None,
        lock_filter_cutoff=None,
        lock_decay=None,
        lock_pan=None,
        lock_volume=None,
    ):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["steps"][instrument][step] = {
            "velocity": velocity,
            "accent": accent,
            "micro_timing": micro_timing,
            "probability": probability,
            "ratchet_count": ratchet_count,
            "ratchet_decay": ratchet_decay,
            "lock_pitch": lock_pitch,
            "lock_filter_cutoff": lock_filter_cutoff,
            "lock_decay": lock_decay,
            "lock_pan": lock_pan,
            "lock_volume": lock_volume,
        }
        self._refresh_metering()
        return True

    def get_drum_song(self):
        return list(self.song)

    def clear_drum_song(self):
        self.song = []
        return True

    def add_drum_song_entry(self, pattern, repeat_count, position=-1):
        entry = {"pattern": pattern, "repeat_count": repeat_count}
        if position < 0 or position >= len(self.song):
            self.song.append(entry)
        else:
            self.song.insert(position, entry)
        return True

    def set_drum_song_loop(self, enabled):
        self.song_loop = enabled
        return True

    def get_drum_song_loop(self):
        return self.song_loop

    def set_drum_pad_volume(self, pad_index, value):
        return True

    def set_drum_pad_pan(self, pad_index, value):
        return True

    def set_drum_pad_tune(self, pad_index, value):
        return True

    def set_drum_pad_bus(self, pad_index, value):
        self.pad_buses[pad_index] = value
        self._refresh_metering()
        return True

    def get_drum_kit_status(self):
        return {f"pad_{index}": {"loaded": index in self.loaded_pads} for index in range(16)}


def _write_kit(root: Path, kit_id: str, *, name: str):
    kit_root = root / kit_id
    samples_dir = kit_root / "samples"
    samples_dir.mkdir(parents=True)
    instruments = []
    for index in range(16):
        sfz_name = f"pad_{index}.sfz"
        sample_name = f"samples/pad_{index}.wav"
        (kit_root / sfz_name).write_text(f"<region>\nsample={sample_name}\n")
        (samples_dir / f"pad_{index}.wav").write_bytes(b"RIFFdemoWAVE")
        instruments.append(
            {
                "name": f"Pad {index + 1}",
                "sfz_path": sfz_name,
                "default_note": 36 + index,
                "bus_assignment": index % 8,
                "default_volume": 0.75,
                "default_pan": 0.0,
                "default_tune": 0.0,
            }
        )
    (kit_root / "kit.json").write_text(
        json.dumps(
            {
                "kit_id": kit_id,
                "name": name,
                "description": "Integration test kit",
                "author": "Tests",
                "version": 1,
                "category": "acoustic",
                "license": "CC0-1.0",
                "default_bpm": 120,
                "default_swing": 0,
                "instruments": instruments,
            },
            indent=2,
        )
        + "\n"
    )


def _pattern_payload(pattern_id, *, active_steps):
    steps = [
        [{"velocity": 0, "accent": False} for _ in range(64)]
        for _ in range(16)
    ]
    for instrument, step, velocity, accent in active_steps:
        steps[instrument][step] = {"velocity": velocity, "accent": accent}
    return {
        "pattern_id": pattern_id,
        "length": 16,
        "variation": 0,
        "steps": steps,
    }


def _build_client(tmp_path, monkeypatch):
    factory_kits_dir = tmp_path / "factory_kits"
    user_kits_dir = tmp_path / "user_kits"
    patterns_dir = tmp_path / "patterns"
    bundles_dir = tmp_path / "bundles"
    drums_root = tmp_path / "drums_root"
    state_path = drums_root / "state.json"
    active_kit_state_path = drums_root / "active_kit.json"
    autosave_path = drums_root / "sequencer-autosave.json"
    midi_configs_dir = drums_root / "midi_configs"
    factory_packs_dir = tmp_path / "factory_packs"
    generated_packs_dir = tmp_path / "generated_packs"

    for path in [
        factory_kits_dir,
        user_kits_dir,
        patterns_dir,
        bundles_dir,
        midi_configs_dir,
        factory_packs_dir,
        generated_packs_dir,
    ]:
        path.mkdir(parents=True, exist_ok=True)

    engine = _FakeIntegratedDrumEngine()
    engine_service = type("FakeEngineService", (), {"engine": engine})()

    monkeypatch.setattr(drum_machine_service_module, "_FACTORY_PACKS_DIR", factory_packs_dir)
    monkeypatch.setattr(drum_machine_service_module, "_GENERATED_PACKS_DIR", generated_packs_dir)
    monkeypatch.setattr(drum_machine_service_module, "_DEFAULT_STATE_PATH", state_path)
    monkeypatch.setattr(drum_machine_service_module, "_MIDI_CONFIGS_DIR", midi_configs_dir)
    monkeypatch.setattr(drum_machine_service_module, "get_audio_engine", lambda: engine_service)
    monkeypatch.setattr(drum_kit_service_module, "_FACTORY_KITS_DIR", factory_kits_dir)
    monkeypatch.setattr(drum_kit_service_module, "_USER_KITS_DIR", user_kits_dir)
    monkeypatch.setattr(drum_kit_service_module, "_ACTIVE_KIT_STATE_PATH", active_kit_state_path)
    monkeypatch.setattr(drum_kit_service_module, "get_audio_engine", lambda: engine_service)
    monkeypatch.setattr(drum_sequencer_service_module, "_PATTERNS_DIR", patterns_dir)
    monkeypatch.setattr(drum_sequencer_service_module, "_BUNDLES_DIR", bundles_dir)
    monkeypatch.setattr(drum_sequencer_service_module, "_AUTOSAVE_PATH", autosave_path)
    monkeypatch.setattr(drum_sequencer_service_module, "get_audio_engine", lambda: engine_service)

    drum_machine_service_module.DrumMachineService.reset_instance()
    drum_kit_service_module.DrumKitService.reset_instance()
    drum_sequencer_service_module.DrumSequencerService.reset_instance()
    ws_manager.event_history.clear()

    app = FastAPI()
    app.include_router(drum_routes.router)
    return TestClient(app), engine, factory_kits_dir


def test_drum_integration_loads_kit_sets_pattern_and_reports_non_silent_metering(tmp_path, monkeypatch):
    client, engine, factory_kits_dir = _build_client(tmp_path, monkeypatch)
    _write_kit(factory_kits_dir, "factory_one", name="Factory One")

    load_response = client.post("/api/engine/drums/kits/load", json={"kit_id": "factory_one"})
    assert load_response.status_code == 200
    assert load_response.json()["loaded_pad_count"] == 16

    pattern_response = client.post(
        "/api/engine/drums/pattern/7",
        json=_pattern_payload(7, active_steps=[(0, 0, 120, False)]),
    )
    assert pattern_response.status_code == 200
    assert pattern_response.json()["steps"][0][0]["velocity"] == 120

    play_response = client.post("/api/engine/drums/transport", json={"pattern": 7, "is_playing": True})
    assert play_response.status_code == 200
    assert play_response.json()["is_playing"] is True

    transport_history = ws_manager.get_event_history("drums:transport")
    assert transport_history["events"][-1]["type"] == "drum_transport"
    assert transport_history["events"][-1]["data"]["pattern"] == 7
    position_history = ws_manager.get_event_history("drums:position")
    assert position_history["events"][-1]["type"] == "drum_position"
    assert position_history["events"][-1]["data"]["is_playing"] is True

    metering_response = client.get("/api/engine/drums/metering")
    assert metering_response.status_code == 200
    metering = metering_response.json()
    assert metering["per_pad_peak"][0] > 0.0
    assert metering["per_bus_peak"][0] > 0.0
    assert metering["master_peak_left"] > 0.0
    assert metering["master_peak_right"] > 0.0

    stop_response = client.post("/api/engine/drums/transport", json={"is_playing": False})
    assert stop_response.status_code == 200
    assert stop_response.json()["is_playing"] is False
    assert engine.transport_calls[-2:] == [True, False]
    transport_history = ws_manager.get_event_history("drums:transport")
    assert transport_history["events"][-1]["data"]["is_playing"] is False


def test_drum_integration_advances_song_transport_and_resumes_after_kit_switch(tmp_path, monkeypatch):
    client, engine, factory_kits_dir = _build_client(tmp_path, monkeypatch)
    _write_kit(factory_kits_dir, "factory_one", name="Factory One")
    _write_kit(factory_kits_dir, "factory_two", name="Factory Two")

    assert client.post("/api/engine/drums/kits/load", json={"kit_id": "factory_one"}).status_code == 200
    assert client.post(
        "/api/engine/drums/pattern/7",
        json=_pattern_payload(7, active_steps=[(0, 0, 120, False)]),
    ).status_code == 200
    assert client.post(
        "/api/engine/drums/pattern/8",
        json=_pattern_payload(8, active_steps=[(1, 0, 108, True)]),
    ).status_code == 200
    assert client.post(
        "/api/engine/drums/song",
        json={"song": [{"pattern": 7, "repeat_count": 1}, {"pattern": 8, "repeat_count": 1}], "song_loop": False},
    ).status_code == 200

    play_response = client.post("/api/engine/drums/song/transport/play")
    assert play_response.status_code == 200
    assert play_response.json()["is_playing"] is True
    assert play_response.json()["active_pattern"] == 7
    assert ws_manager.get_event_history("drums:transport")["events"][-1]["data"]["is_playing"] is True

    service = drum_machine_service_module.get_drum_machine_service()
    engine.advance_step(15, bar=1, beat=4)
    service._refresh_position_from_engine()
    engine.advance_step(0, bar=2, beat=1)
    service._refresh_position_from_engine()

    song_transport = client.get("/api/engine/drums/song/transport")
    assert song_transport.status_code == 200
    assert song_transport.json()["current_entry_index"] == 1
    assert song_transport.json()["active_pattern"] == 8

    switch_response = client.post("/api/engine/drums/kits/load", json={"kit_id": "factory_two"})
    assert switch_response.status_code == 200
    assert switch_response.json()["kit"]["kit_id"] == "factory_two"
    assert engine.transport_calls[-2:] == [False, True]


def test_drum_integration_applies_pattern_step_edits_on_the_next_playback_step(tmp_path, monkeypatch):
    client, engine, factory_kits_dir = _build_client(tmp_path, monkeypatch)
    _write_kit(factory_kits_dir, "factory_one", name="Factory One")

    assert client.post("/api/engine/drums/kits/load", json={"kit_id": "factory_one"}).status_code == 200
    assert client.post(
        "/api/engine/drums/pattern/7",
        json=_pattern_payload(7, active_steps=[(0, 0, 120, False)]),
    ).status_code == 200
    assert client.post("/api/engine/drums/transport", json={"pattern": 7, "is_playing": True}).status_code == 200

    service = drum_machine_service_module.get_drum_machine_service()
    engine.advance_step(0, bar=1, beat=1)
    service._refresh_position_from_engine()
    first_metering = client.get("/api/engine/drums/metering").json()
    assert first_metering["per_pad_peak"][0] > 0.0
    assert first_metering["per_pad_peak"][1] == 0.0

    step_update = client.post(
        "/api/engine/drums/pattern/7/step",
        json={"instrument": 1, "step": 1, "velocity": 112, "accent": True},
    )
    assert step_update.status_code == 200
    assert step_update.json()["steps"][1][1]["velocity"] == 112
    assert step_update.json()["steps"][1][1]["accent"] is True

    engine.advance_step(1, bar=1, beat=1)
    service._refresh_position_from_engine()
    next_metering = client.get("/api/engine/drums/metering").json()
    assert next_metering["per_pad_peak"][1] > 0.0
