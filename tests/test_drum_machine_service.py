import json
import asyncio
import pytest

from app.services.websocket_manager import ws_manager

from app.services import drum_machine_service as drum_service_module


class _FakeDrumEngine:
    def __init__(self):
        self.master_volume_calls = []
        self.transport_playing_calls = []
        self.bpm_calls = []
        self.pattern_calls = []
        self.swing_calls = []
        self.global_midi_channel = 0
        self.global_midi_channel_calls = []
        self.pad_notes = {pad: [36 + pad] for pad in range(16)}
        self.pad_note_calls = []
        self.pad_add_note_calls = []
        self.pad_remove_note_calls = []
        self.pad_midi_channel_calls = []
        self.velocity_curve_calls = []
        self.pad_zones = {pad: [] for pad in range(16)}
        self.pad_zone_calls = []
        self.clear_zone_calls = []
        self.learn_state = {
            "active": False,
            "learn_all": False,
            "active_pad_index": -1,
            "next_pad_index": -1,
            "last_received_note": -1,
            "last_received_channel": -1,
            "timeout_seconds": 10,
        }
        self.learn_start_calls = []
        self.learn_stop_calls = 0
        self.midi_presets = ["Roland PD-140DS / CY-18DR / VH-14D", "Yamaha DTX Multi-Zone"]
        self.loaded_presets = []
        self.metering = {
            "per_pad_peak": [0.0] * 16,
            "per_pad_rms": [0.0] * 16,
            "per_bus_peak": [0.0] * 8,
            "per_bus_rms": [0.0] * 8,
            "master_peak_left": 0.0,
            "master_peak_right": 0.0,
            "master_rms_left": 0.0,
            "master_rms_right": 0.0,
        }
        self.position = {
            "step": 0,
            "bar": 1,
            "beat": 1,
            "pattern": 0,
            "pattern_id": 0,
            "is_playing": False,
        }

    def set_drum_master_volume(self, value):
        self.master_volume_calls.append(value)
        return True

    def set_drum_transport_playing(self, is_playing):
        self.transport_playing_calls.append(is_playing)
        self.position["is_playing"] = is_playing
        return True

    def set_drum_bpm(self, bpm):
        self.bpm_calls.append(bpm)
        return True

    def set_drum_current_pattern(self, pattern):
        self.pattern_calls.append(pattern)
        self.position["pattern"] = pattern
        self.position["pattern_id"] = pattern
        return True

    def set_drum_swing(self, swing):
        self.swing_calls.append(swing)
        return True

    def set_drum_global_midi_channel(self, value):
        self.global_midi_channel = value
        self.global_midi_channel_calls.append(value)
        return True

    def get_drum_global_midi_channel(self):
        return self.global_midi_channel

    def set_drum_pad_note(self, pad, midi_note):
        self.pad_notes[pad] = [midi_note]
        self.pad_note_calls.append((pad, midi_note))
        return True

    def add_drum_pad_note(self, pad, midi_note):
        self.pad_notes.setdefault(pad, [])
        if midi_note not in self.pad_notes[pad]:
            self.pad_notes[pad].append(midi_note)
        self.pad_add_note_calls.append((pad, midi_note))
        return True

    def remove_drum_pad_note(self, pad, midi_note):
        if midi_note in self.pad_notes.get(pad, []):
            self.pad_notes[pad].remove(midi_note)
        self.pad_remove_note_calls.append((pad, midi_note))
        return True

    def get_drum_pad_notes(self, pad):
        return list(self.pad_notes.get(pad, []))

    def set_drum_pad_midi_channel(self, pad, channel):
        self.pad_midi_channel_calls.append((pad, channel))
        return True

    def set_drum_pad_velocity_curve(self, pad, curve_type, fixed_velocity, input_floor, output_floor, output_ceiling):
        self.velocity_curve_calls.append((pad, curve_type, fixed_velocity, input_floor, output_floor, output_ceiling))
        return True

    def get_drum_pad_velocity_curve_preview(self, _pad):
        return [round(index / 127.0, 6) for index in range(128)]

    def get_drum_pad_last_velocity(self, _pad):
        return 0.42

    def set_drum_pad_zone(self, pad, kind, trigger_note, key_switch_note, velocity_scale):
        self.pad_zones.setdefault(pad, [])
        self.pad_zones[pad] = [zone for zone in self.pad_zones[pad] if zone["kind"] != kind]
        self.pad_zones[pad].append(
            {
                "kind": kind,
                "trigger_note": trigger_note,
                "key_switch_note": key_switch_note,
                "velocity_scale": velocity_scale,
                "enabled": True,
            }
        )
        self.pad_zone_calls.append((pad, kind, trigger_note, key_switch_note, velocity_scale))
        return True

    def clear_drum_pad_zone(self, pad, kind):
        self.pad_zones.setdefault(pad, [])
        self.pad_zones[pad] = [zone for zone in self.pad_zones[pad] if zone["kind"] != kind]
        self.clear_zone_calls.append((pad, kind))
        return True

    def get_drum_pad_zones(self, pad):
        return list(self.pad_zones.get(pad, []))

    def start_drum_midi_learn(self, pad, learn_all, timeout_seconds):
        self.learn_state = {
            "active": True,
            "learn_all": learn_all,
            "active_pad_index": pad,
            "next_pad_index": pad,
            "last_received_note": -1,
            "last_received_channel": -1,
            "timeout_seconds": timeout_seconds,
        }
        self.learn_start_calls.append((pad, learn_all, timeout_seconds))
        return True

    def stop_drum_midi_learn(self):
        self.learn_state["active"] = False
        self.learn_state["learn_all"] = False
        self.learn_state["active_pad_index"] = -1
        self.learn_state["next_pad_index"] = -1
        self.learn_stop_calls += 1
        return True

    def get_drum_midi_learn_state(self):
        return dict(self.learn_state)

    def get_drum_midi_presets(self):
        return list(self.midi_presets)

    def apply_drum_midi_preset(self, preset_name):
        if preset_name not in self.midi_presets:
            return False
        self.loaded_presets.append(preset_name)
        self.pad_zones[1] = [
            {"kind": 0, "trigger_note": 38, "key_switch_note": -1, "velocity_scale": 1.0, "enabled": True},
            {"kind": 1, "trigger_note": 40, "key_switch_note": 36, "velocity_scale": 0.92, "enabled": True},
        ]
        return True

    def get_drum_metering(self):
        return dict(self.metering)

    def get_drum_sequencer_position(self):
        return dict(self.position)


def _build_service(tmp_path, monkeypatch):
    factory_dir = tmp_path / "factory"
    generated_dir = tmp_path / "generated"
    state_path = tmp_path / "state.json"
    factory_dir.mkdir()
    generated_dir.mkdir()
    fake_engine = _FakeDrumEngine()
    fake_engine_service = type("FakeEngineService", (), {"engine": fake_engine})()

    monkeypatch.setattr(drum_service_module, "_FACTORY_PACKS_DIR", factory_dir)
    monkeypatch.setattr(drum_service_module, "_GENERATED_PACKS_DIR", generated_dir)
    monkeypatch.setattr(drum_service_module, "_DEFAULT_STATE_PATH", state_path)
    monkeypatch.setattr(drum_service_module, "get_audio_engine", lambda: fake_engine_service)
    drum_service_module.DrumMachineService.reset_instance()
    return drum_service_module.get_drum_machine_service(), factory_dir, generated_dir, state_path, fake_engine


def test_drum_machine_service_persists_and_restores_state(tmp_path, monkeypatch):
    service, _, _, state_path, _ = _build_service(tmp_path, monkeypatch)

    updated = service.update_state({
        "bpm": 142,
        "transport": True,
        "pattern": 12,
        "active_pack": "classic-rock",
    })

    assert updated["bpm"] == 142
    assert updated["transport"] is True
    assert updated["pattern"] == 12
    assert updated["active_pack"] == "classic-rock"

    persisted = json.loads(state_path.read_text())
    assert persisted["bpm"] == 142
    assert persisted["transport"] is True

    drum_service_module.DrumMachineService.reset_instance()
    restored = drum_service_module.get_drum_machine_service()
    assert restored.get_state()["bpm"] == 142
    assert restored.get_state()["active_pack"] == "classic-rock"


def test_drum_machine_service_indexes_factory_and_generated_packs(tmp_path, monkeypatch):
    service, factory_dir, generated_dir, _, _ = _build_service(tmp_path, monkeypatch)

    (factory_dir / "factory.json").write_text(json.dumps({
        "pack_id": "factory-one",
        "name": "Factory One",
        "description": "Factory pack",
        "source": "factory",
    }))
    (generated_dir / "user.json").write_text(json.dumps({
        "pack_id": "user-one",
        "name": "User One",
        "description": "User pack",
        "source": "user",
    }))

    factory = service.list_factory_packs()
    generated = service.list_generated_packs()

    assert factory == [{
        "pack_id": "factory-one",
        "name": "Factory One",
        "description": "Factory pack",
        "source": "factory",
        "filename": "factory.json",
    }]
    assert generated == [{
        "pack_id": "user-one",
        "name": "User One",
        "description": "User pack",
        "source": "user",
        "filename": "user.json",
    }]


def test_drum_machine_service_transport_projection(tmp_path, monkeypatch):
    service, _, _, _, _ = _build_service(tmp_path, monkeypatch)

    transport = service.update_transport({
        "is_playing": True,
        "bpm": 98,
        "variation": 3,
        "swing": 22,
    })

    assert transport == {
        "is_playing": True,
        "bpm": 98,
        "pattern": 0,
        "variation": 3,
        "swing": 22,
    }
    assert service.get_state()["transport"] is True


def test_drum_machine_service_tracks_sequencer_position(tmp_path, monkeypatch):
    service, _, _, _, _ = _build_service(tmp_path, monkeypatch)

    position = service.update_position({
        "step": 7,
        "bar": 2,
        "beat": 4,
    })

    assert position["step"] == 7
    assert position["bar"] == 2
    assert position["beat"] == 4
    assert position["pattern"] == 0
    assert position["pattern_id"] == 0
    assert position["variation"] == 0
    assert position["is_playing"] is False
    assert position["updated_at"] is not None


@pytest.mark.asyncio
async def test_drum_machine_service_publishes_metering_topic_history(tmp_path, monkeypatch):
    service, _, _, _, _ = _build_service(tmp_path, monkeypatch)
    ws_manager.event_history.clear()

    service.update_metering({
        "per_pad_peak": [0.1] * 16,
        "per_pad_rms": [0.05] * 16,
        "per_bus_peak": [0.2] * 8,
        "per_bus_rms": [0.1] * 8,
        "master_peak_left": 0.3,
        "master_peak_right": 0.31,
        "master_rms_left": 0.12,
        "master_rms_right": 0.13,
    })
    await service.publish_metering_update()

    history = ws_manager.get_event_history("drums:metering")
    assert history["topic"] == "drums:metering"
    assert history["events"][-1]["type"] == "drum_metering"
    assert history["events"][-1]["data"]["master_peak_left"] == 0.3


def test_drum_machine_service_syncs_master_volume_and_reads_engine_metering(tmp_path, monkeypatch):
    service, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    service.update_state({"volume": 64})
    fake_engine.metering["master_peak_left"] = 0.42

    metering = service.get_metering()

    assert fake_engine.master_volume_calls[-1] == pytest.approx(0.64)
    assert metering["master_peak_left"] == pytest.approx(0.42)


@pytest.mark.asyncio
async def test_drum_machine_service_polls_engine_position_and_broadcasts_updates(tmp_path, monkeypatch):
    monkeypatch.setattr(drum_service_module, "_POSITION_POLL_INTERVAL_SECONDS", 0.001)
    service, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)
    ws_manager.event_history.clear()

    transport = service.update_transport({
        "is_playing": True,
        "bpm": 126,
        "pattern": 6,
        "swing": 18,
    })
    assert transport["is_playing"] is True
    assert fake_engine.transport_playing_calls[-1] is True
    assert fake_engine.bpm_calls[-1] == 126
    assert fake_engine.pattern_calls[-1] == 6
    assert fake_engine.swing_calls[-1] == 18.0

    fake_engine.position.update({
        "step": 9,
        "bar": 3,
        "beat": 3,
        "pattern": 6,
        "pattern_id": 6,
        "is_playing": True,
    })

    await asyncio.sleep(0.02)

    history = ws_manager.get_event_history("drums:position")
    assert history["events"][-1]["type"] == "drum_position"
    assert history["events"][-1]["data"]["step"] == 9
    assert history["events"][-1]["data"]["bar"] == 3
    assert history["events"][-1]["data"]["pattern_id"] == 6
    assert history["events"][-1]["data"]["is_playing"] is True

    service.update_transport({"is_playing": False})
    await asyncio.sleep(0)


def test_drum_machine_service_round_trips_midi_mapping_and_velocity_curves(tmp_path, monkeypatch):
    service, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    mapping = service.update_midi_mapping(
        {
            "global_midi_channel": 9,
            "pads": [
                {"pad": 0, "notes": [36, 35], "midi_channel": 10},
                {"pad": 1, "notes": [38, 40], "midi_channel": 11},
            ],
        }
    )
    curves = service.update_velocity_curves(
        {
            "pads": [
                {
                    "pad": 0,
                    "curve_type": 2,
                    "fixed_velocity": 0.7,
                    "input_floor": 0.1,
                    "output_floor": 0.2,
                    "output_ceiling": 0.9,
                }
            ]
        }
    )

    assert mapping["global_midi_channel"] == 9
    assert mapping["pads"][0]["notes"] == [36, 35]
    assert fake_engine.global_midi_channel_calls[-1] == 9
    assert fake_engine.pad_add_note_calls[-1] == (1, 40)
    assert curves["pads"][0]["curve_type"] == 2
    assert len(curves["pads"][0]["preview"]) == 128
    assert curves["pads"][0]["last_velocity"] == pytest.approx(0.42)


def test_drum_machine_service_round_trips_zones_learn_and_presets(tmp_path, monkeypatch):
    service, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    zones = service.update_midi_zones(
        {
            "pads": [
                {
                    "pad": 1,
                    "zones": [
                        {"kind": 0, "trigger_note": 38, "key_switch_note": -1, "velocity_scale": 1.0, "enabled": True},
                        {"kind": 1, "trigger_note": 40, "key_switch_note": 36, "velocity_scale": 0.92, "enabled": True},
                    ],
                }
            ]
        }
    )
    learn = service.start_midi_learn(3, True, 12)
    stopped = service.stop_midi_learn()
    presets = service.get_midi_presets()
    loaded = service.load_midi_preset("Roland PD-140DS / CY-18DR / VH-14D")

    assert zones["pads"][1]["zones"][1]["trigger_note"] == 40
    assert fake_engine.pad_zone_calls[-1] == (1, 1, 40, 36, 0.92)
    assert learn["active"] is True
    assert learn["learn_all"] is True
    assert fake_engine.learn_start_calls[-1] == (3, True, 12)
    assert stopped["active"] is False
    assert fake_engine.learn_stop_calls == 1
    assert presets["presets"][0] == "Roland PD-140DS / CY-18DR / VH-14D"
    assert loaded["status"] == "ok"
    assert fake_engine.loaded_presets[-1] == "Roland PD-140DS / CY-18DR / VH-14D"
