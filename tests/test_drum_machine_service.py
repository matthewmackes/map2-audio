import json
import asyncio
import sys
import types
import pytest
from pydantic import ValidationError

from app.services import drum_kit_service as drum_kit_service_module
from app.services.websocket_manager import ws_manager

from app.services import drum_machine_service as drum_service_module


class _FakeDrumEngine:
    def __init__(self):
        self.master_volume_calls = []
        self.master_fx_calls = []
        self.transport_playing_calls = []
        self.bpm_calls = []
        self.pattern_calls = []
        self.swing_calls = []
        self.track_swing_calls = []
        self.variation_calls = []
        self.fill_trigger_calls = 0
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
            "pending_pattern": -1,
            "switch_quantization_beats": 4,
        }
        self.queued_pattern_calls = []
        self.switch_quantization_calls = []
        self.midi_output_enabled = False
        self.midi_clock_output_enabled = False
        self.midi_output_channel = 9
        self.program_change_enabled = False
        self.midi_output_enabled_calls = []
        self.midi_clock_output_enabled_calls = []
        self.midi_output_channel_calls = []
        self.program_change_enabled_calls = []
        self.cc_mappings = [
            {
                "slot": slot,
                "cc_number": 0,
                "midi_channel": 0,
                "target": "pad_volume",
                "target_index": 0,
                "active": False,
            }
            for slot in range(32)
        ]
        self.cc_learn_state = {
            "active": False,
            "slot": -1,
            "last_cc": -1,
            "last_channel": -1,
            "timeout_seconds": 10,
        }
        self.pad_sound_source_calls = []
        self.pad_sound_sources = {pad: "sample" for pad in range(16)}
        self.pad_synth_params = {
            pad: {
                "oscillator_type": "sine",
                "pitch_envelope_start_hz": 160.0,
                "pitch_envelope_end_hz": 50.0,
                "pitch_envelope_decay_ms": 180.0,
                "noise_level": 0.2,
                "noise_decay_ms": 120.0,
                "body_decay_ms": 420.0,
                "tone_amount": 0.55,
            }
            for pad in range(16)
        }
        self.pad_filter_calls = []
        self.pad_filters = {
            pad: {
                "type": "lowpass",
                "cutoff_hz": 12000.0,
                "resonance": 0.35,
                "env_amount": 0.0,
                "env_decay_ms": 180.0,
            }
            for pad in range(16)
        }
        self.pad_cv_gate_calls = []
        self.pad_cv_gate_configs = {
            pad: {
                "enabled": False,
                "output_pair": 0,
                "gate_length_ms": 25.0,
                "note_min": 36,
                "note_max": 84,
                "pitch_min_volts": 0.0,
                "pitch_max_volts": 5.0,
            }
            for pad in range(16)
        }
        self.pad_control_calls = []
        self.bus_eq_calls = []
        self.bus_comp_calls = []
        self.bus_level_calls = []
        self.bus_mute_calls = []
        self.bus_solo_calls = []
        self.bus_output_pair_calls = []
        self.bus_reverb_send_calls = []
        self.output_channels = 8
        self.master_fx = {
            "drive_db": 0.0,
            "compressor_threshold": -18.0,
            "compressor_ratio": 2.0,
            "compressor_attack": 10.0,
            "compressor_release": 80.0,
            "compressor_makeup": 0.0,
            "reverb_mix": 0.18,
            "reverb_size": 0.45,
            "reverb_damping": 0.35,
            "reverb_width": 1.0,
            "limiter_threshold": -0.5,
            "limiter_release": 60.0,
        }

    def set_drum_master_volume(self, value):
        self.master_volume_calls.append(value)
        return True

    def set_drum_master_fx(self, parameter, value):
        self.master_fx[parameter] = value
        self.master_fx_calls.append((parameter, value))
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
        self.position["pending_pattern"] = -1
        return True

    def queue_drum_pattern_switch(self, pattern):
        self.queued_pattern_calls.append(pattern)
        self.position["pending_pattern"] = pattern
        return True

    def get_drum_pending_pattern_switch(self):
        return self.position["pending_pattern"]

    def set_drum_pattern_switch_quantization(self, beats):
        self.switch_quantization_calls.append(beats)
        self.position["switch_quantization_beats"] = beats
        return True

    def get_drum_pattern_switch_quantization(self):
        return self.position["switch_quantization_beats"]

    def set_drum_midi_output_enabled(self, enabled):
        self.midi_output_enabled = enabled
        self.midi_output_enabled_calls.append(enabled)
        return True

    def get_drum_midi_output_enabled(self):
        return self.midi_output_enabled

    def set_drum_midi_clock_output_enabled(self, enabled):
        self.midi_clock_output_enabled = enabled
        self.midi_clock_output_enabled_calls.append(enabled)
        return True

    def get_drum_midi_clock_output_enabled(self):
        return self.midi_clock_output_enabled

    def set_drum_midi_output_channel(self, channel):
        self.midi_output_channel = channel
        self.midi_output_channel_calls.append(channel)
        return True

    def get_drum_midi_output_channel(self):
        return self.midi_output_channel

    def set_drum_program_change_enabled(self, enabled):
        self.program_change_enabled = enabled
        self.program_change_enabled_calls.append(enabled)
        return True

    def get_drum_program_change_enabled(self):
        return self.program_change_enabled

    def set_drum_cc_mapping(self, slot, cc_number, midi_channel, target, target_index, active):
        self.cc_mappings[slot] = {
            "slot": slot,
            "cc_number": cc_number,
            "midi_channel": midi_channel,
            "target": target,
            "target_index": target_index,
            "active": active,
        }
        return True

    def get_drum_cc_mappings(self):
        return list(self.cc_mappings)

    def start_drum_cc_learn(self, slot, timeout_seconds):
        self.cc_learn_state = {
            "active": True,
            "slot": slot,
            "last_cc": -1,
            "last_channel": -1,
            "timeout_seconds": timeout_seconds,
        }
        return True

    def stop_drum_cc_learn(self):
        self.cc_learn_state["active"] = False
        self.cc_learn_state["slot"] = -1
        return True

    def get_drum_cc_learn_state(self):
        return dict(self.cc_learn_state)

    def set_drum_swing(self, swing):
        self.swing_calls.append(swing)
        return True

    def set_drum_track_swing(self, instrument, swing):
        self.track_swing_calls.append((instrument, swing))
        return True

    def set_drum_variation(self, pattern, variation):
        self.variation_calls.append((pattern, variation))
        self.position["pattern"] = pattern
        self.position["pattern_id"] = pattern
        self.position["variation"] = variation
        return True

    def trigger_drum_fill(self):
        self.fill_trigger_calls += 1
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

    def set_drum_pad_sound_source(self, pad, source):
        self.pad_sound_sources[pad] = source
        self.pad_sound_source_calls.append((pad, source))
        return True

    def get_drum_pad_sound_source(self, pad):
        return self.pad_sound_sources[pad]

    def set_drum_synth_param(self, pad, name, value):
        self.pad_synth_params[pad][name] = value
        return True

    def get_drum_synth_params(self, pad):
        return dict(self.pad_synth_params[pad])

    def set_drum_pad_filter(self, pad, filter_type, cutoff_hz, resonance, env_amount, env_decay_ms):
        self.pad_filters[pad] = {
            "type": filter_type,
            "cutoff_hz": cutoff_hz,
            "resonance": resonance,
            "env_amount": env_amount,
            "env_decay_ms": env_decay_ms,
        }
        self.pad_filter_calls.append((pad, filter_type, cutoff_hz, resonance, env_amount, env_decay_ms))
        return True

    def get_drum_pad_filter(self, pad):
        return dict(self.pad_filters[pad])

    def set_drum_cv_gate_config(self, pad, enabled, output_pair, gate_length_ms, note_min, note_max, pitch_min_volts, pitch_max_volts):
        self.pad_cv_gate_configs[pad] = {
            "enabled": enabled,
            "output_pair": output_pair,
            "gate_length_ms": gate_length_ms,
            "note_min": note_min,
            "note_max": note_max,
            "pitch_min_volts": pitch_min_volts,
            "pitch_max_volts": pitch_max_volts,
        }
        self.pad_cv_gate_calls.append((pad, enabled, output_pair, gate_length_ms, note_min, note_max, pitch_min_volts, pitch_max_volts))
        return True

    def set_drum_pad_volume(self, pad, volume):
        self.pad_control_calls.append((pad, "volume", volume))
        return True

    def set_drum_pad_pan(self, pad, pan):
        self.pad_control_calls.append((pad, "pan", pan))
        return True

    def set_drum_pad_tune(self, pad, tune):
        self.pad_control_calls.append((pad, "tune", tune))
        return True

    def set_drum_pad_mute(self, pad, mute):
        self.pad_control_calls.append((pad, "mute", mute))
        return True

    def set_drum_pad_solo(self, pad, solo):
        self.pad_control_calls.append((pad, "solo", solo))
        return True

    def set_drum_pad_bus(self, pad, bus):
        self.pad_control_calls.append((pad, "bus_assignment", bus))
        return True

    def set_drum_bus_eq(self, bus, low_gain, mid_gain, mid_freq, high_gain):
        self.bus_eq_calls.append((bus, low_gain, mid_gain, mid_freq, high_gain))
        return True

    def set_drum_bus_comp(self, bus, threshold, ratio, attack, release, makeup):
        self.bus_comp_calls.append((bus, threshold, ratio, attack, release, makeup))
        return True

    def set_drum_bus_level(self, bus, level):
        self.bus_level_calls.append((bus, level))
        return True

    def set_drum_bus_mute(self, bus, mute):
        self.bus_mute_calls.append((bus, mute))
        return True

    def set_drum_bus_solo(self, bus, solo):
        self.bus_solo_calls.append((bus, solo))
        return True

    def set_drum_bus_output_pair(self, bus, output_pair):
        self.bus_output_pair_calls.append((bus, output_pair))
        return True

    def set_drum_bus_reverb_send(self, bus, reverb_send):
        self.bus_reverb_send_calls.append((bus, reverb_send))
        return True

    def get_num_output_channels(self):
        return self.output_channels


def _build_service(tmp_path, monkeypatch):
    factory_dir = tmp_path / "factory"
    generated_dir = tmp_path / "generated"
    state_path = tmp_path / "state.json"
    midi_configs_dir = tmp_path / "midi_configs"
    factory_dir.mkdir()
    generated_dir.mkdir()
    midi_configs_dir.mkdir()
    fake_engine = _FakeDrumEngine()
    fake_engine_service = type("FakeEngineService", (), {"engine": fake_engine})()

    monkeypatch.setattr(drum_service_module, "_FACTORY_PACKS_DIR", factory_dir)
    monkeypatch.setattr(drum_service_module, "_GENERATED_PACKS_DIR", generated_dir)
    monkeypatch.setattr(drum_service_module, "_DEFAULT_STATE_PATH", state_path)
    monkeypatch.setattr(drum_service_module, "_MIDI_CONFIGS_DIR", midi_configs_dir)
    monkeypatch.setattr(drum_service_module, "get_audio_engine", lambda: fake_engine_service)
    drum_service_module.DrumMachineService.reset_instance()
    return drum_service_module.get_drum_machine_service(), factory_dir, generated_dir, state_path, midi_configs_dir, fake_engine


def test_drum_machine_service_persists_and_restores_state(tmp_path, monkeypatch):
    service, _, _, state_path, _, _ = _build_service(tmp_path, monkeypatch)

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


def test_drum_machine_service_rejects_invalid_state_updates(tmp_path, monkeypatch):
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)

    with pytest.raises(ValidationError):
        service.update_state({"bpm": 12})

    assert service.get_state()["bpm"] == 120


def test_drum_machine_service_indexes_factory_and_generated_packs(tmp_path, monkeypatch):
    service, factory_dir, generated_dir, _, _, _ = _build_service(tmp_path, monkeypatch)

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
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)

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
        "pending_pattern": -1,
        "switch_quantization_beats": 4,
        "midi_output_enabled": False,
        "midi_clock_output_enabled": False,
        "midi_output_channel": 9,
        "program_change_enabled": False,
        "track_swing": [0] * 16,
    }
    assert service.get_state()["transport"] is True


def test_drum_machine_service_tracks_backing_track_runtime_progress(tmp_path, monkeypatch):
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)
    clock = {"value": 100.0}
    monkeypatch.setattr(drum_service_module.time, "monotonic", lambda: clock["value"])

    started = service.update_backing_track_transport({
        "track_id": "bt-003",
        "is_playing": True,
        "loop_enabled": True,
        "tempo_shift": 20,
        "pitch_shift": -2,
    })

    assert started["track_id"] == "bt-003"
    assert started["position_seconds"] == 0.0
    assert started["tempo_shift"] == 20
    assert started["pitch_shift"] == -2

    clock["value"] = 110.0
    progressed = service.get_backing_track_transport()
    assert progressed["position_seconds"] == pytest.approx(12.0)
    assert progressed["position_label"] == "00:12"
    assert progressed["is_playing"] is True

    clock["value"] = 400.0
    looped = service.get_backing_track_transport()
    assert looped["position_seconds"] == pytest.approx(109.0)
    assert looped["position_label"] == "01:49"
    assert looped["is_playing"] is True

    service.update_backing_track_transport({
        "track_id": "bt-002",
        "position_seconds": 175.0,
        "is_playing": True,
        "loop_enabled": False,
        "tempo_shift": 0,
    })
    clock["value"] = 405.0
    clamped = service.get_backing_track_transport()
    assert clamped["track_id"] == "bt-002"
    assert clamped["position_seconds"] == pytest.approx(178.0)
    assert clamped["position_label"] == "02:58"
    assert clamped["is_playing"] is False


def test_drum_machine_service_round_trips_midi_output_config(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.update_midi_output_config(
        {
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "midi_output_channel": 4,
            "program_change_enabled": True,
        }
    )

    assert payload == {
        "midi_output_enabled": True,
        "midi_clock_output_enabled": True,
        "midi_output_channel": 4,
        "program_change_enabled": True,
    }
    transport = service.get_transport()
    assert transport["midi_output_enabled"] is True
    assert transport["midi_clock_output_enabled"] is True
    assert transport["midi_output_channel"] == 4
    assert transport["program_change_enabled"] is True
    assert fake_engine.midi_output_enabled_calls[-1] is True
    assert fake_engine.midi_clock_output_enabled_calls[-1] is True
    assert fake_engine.midi_output_channel_calls[-1] == 4
    assert fake_engine.program_change_enabled_calls[-1] is True


def test_drum_machine_service_round_trips_cc_mappings_and_learn_state(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    mappings = service.update_cc_mappings(
        {
            "mappings": [
                {
                    "slot": 0,
                    "cc_number": 74,
                    "midi_channel": 2,
                    "target": "pad_filter_cutoff",
                    "target_index": 3,
                    "active": True,
                },
                {
                    "slot": 1,
                    "cc_number": 1,
                    "midi_channel": 0,
                    "target": "tempo",
                    "target_index": 0,
                    "active": True,
                },
            ]
        }
    )

    assert mappings["mappings"][0]["cc_number"] == 74
    assert mappings["mappings"][1]["target"] == "tempo"
    assert fake_engine.cc_mappings[0]["target_index"] == 3
    assert fake_engine.cc_mappings[1]["cc_number"] == 1

    learn = service.start_cc_learn(4, 12)
    assert learn["active"] is True
    assert learn["slot"] == 4
    assert learn["timeout_seconds"] == 12

    stopped = service.stop_cc_learn()
    assert stopped["active"] is False


def test_drum_machine_service_queues_pattern_switch_while_playing(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    service.update_transport({"is_playing": True, "pattern": 2})
    transport = service.update_transport({"pattern": 9, "switch_quantization_beats": 8})

    assert transport["pattern"] == 2
    assert transport["pending_pattern"] == 9
    assert transport["switch_quantization_beats"] == 8
    assert fake_engine.pattern_calls[-1] == 2
    assert fake_engine.queued_pattern_calls[-1] == 9
    assert fake_engine.switch_quantization_calls[-1] == 8


def test_drum_machine_service_sets_per_track_swing(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_track_swing(3, 67)

    assert payload["instrument"] == 3
    assert payload["swing"] == 67
    assert payload["track_swing"][3] == 67
    assert fake_engine.track_swing_calls[-1] == (3, 67.0)


def test_drum_machine_service_round_trips_pad_sound_source_and_synth_params(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    source_payload = service.set_pad_sound_source(2, "hybrid")
    synth_payload = service.set_pad_synth_params(2, {
        "oscillator_type": "metallic",
        "noise_level": 0.64,
        "body_decay_ms": 610.0,
    })

    assert source_payload == {"pad": 2, "source": "hybrid"}
    assert synth_payload["pad"] == 2
    assert synth_payload["params"]["oscillator_type"] == "metallic"
    assert synth_payload["params"]["noise_level"] == 0.64
    assert synth_payload["params"]["body_decay_ms"] == 610.0
    assert fake_engine.pad_sound_source_calls[-1] == (2, "hybrid")
    assert fake_engine.pad_synth_params[2]["oscillator_type"] == "metallic"
    assert fake_engine.pad_synth_params[2]["noise_level"] == 0.64


def test_drum_machine_service_round_trips_pad_filter(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_pad_filter(4, {
        "type": "bandpass",
        "cutoff_hz": 1800.0,
        "resonance": 1.4,
        "env_amount": 0.55,
        "env_decay_ms": 320.0,
    })

    assert payload["pad"] == 4
    assert payload["filter"]["type"] == "bandpass"
    assert payload["filter"]["cutoff_hz"] == 1800.0
    assert fake_engine.pad_filter_calls[-1] == (4, "bandpass", 1800.0, 1.4, 0.55, 320.0)


def test_drum_machine_service_round_trips_pad_cv_gate_config(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_pad_cv_gate_config(2, {
        "enabled": True,
        "output_pair": 3,
        "gate_length_ms": 48.0,
        "note_min": 24,
        "note_max": 72,
        "pitch_min_volts": -1.0,
        "pitch_max_volts": 4.0,
    })

    assert payload["pad"] == 2
    assert payload["config"]["enabled"] is True
    assert payload["config"]["output_pair"] == 3
    assert fake_engine.pad_cv_gate_calls[-1] == (2, True, 3, 48.0, 24, 72, -1.0, 4.0)


def test_drum_machine_service_round_trips_pad_controls(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_pad_control(3, {
        "volume": 64,
        "pan": -25,
        "tune": 7,
        "mute": True,
        "solo": True,
        "bus_assignment": 6,
    })

    assert payload["pad_id"] == 3
    assert payload["bus_assignment"] == 6
    assert fake_engine.pad_control_calls[-1] == (3, "bus_assignment", 6)
    assert (3, "volume", 0.64) in fake_engine.pad_control_calls
    assert (3, "pan", -0.25) in fake_engine.pad_control_calls


def test_drum_machine_service_round_trips_bus_mixers_and_output_pairs(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_bus_mixer(2, {
        "level": 78,
        "mute": True,
        "solo": True,
        "output_pair": 3,
        "eq": {"low_gain": -3, "mid_gain": 2, "mid_freq": 1400, "high_gain": 4},
        "comp": {"threshold": -24, "ratio": 6, "attack": 12, "release": 90, "makeup": 3},
    })

    assert payload["bus_id"] == 2
    assert payload["output_pair"] == 3
    assert payload["output_channel_count"] == 8
    assert payload["available_output_pairs"] == [0, 1, 2, 3]
    assert fake_engine.bus_output_pair_calls[-1] == (2, 3)
    assert fake_engine.bus_level_calls[-1] == (2, 0.78)
    assert fake_engine.bus_eq_calls[-1] == (2, -3.0, 2.0, 1400.0, 4.0)
    assert fake_engine.bus_comp_calls[-1] == (2, -24.0, 6.0, 12.0, 90.0, 3.0)


def test_drum_machine_service_master_volume_route_matches_state_scale(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    payload = service.set_master_volume(72)

    assert payload == {"volume": 72}
    assert fake_engine.master_volume_calls[-1] == pytest.approx(0.72)


def test_drum_machine_service_round_trips_master_fx_and_bus_reverb_send(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    fx = service.set_master_fx({
        "drive_db": 9,
        "compressor_ratio": 4.5,
        "reverb_mix": 0.4,
        "limiter_threshold": -2.0,
    })
    bus = service.set_bus_reverb_send(2, 37)

    assert fx["drive_db"] == 9.0
    assert fx["compressor_ratio"] == 4.5
    assert fx["reverb_mix"] == 0.4
    assert ("limiter_threshold", -2.0) in fake_engine.master_fx_calls
    assert bus["reverb_send"] == 37.0
    assert fake_engine.bus_reverb_send_calls[-1] == (2, 0.37)


def test_drum_machine_service_tracks_sequencer_position(tmp_path, monkeypatch):
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)

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


def test_drum_machine_service_triggers_fill_and_tracks_song_transport(tmp_path, monkeypatch):
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    class _FakeSequencerService:
        @staticmethod
        def get_song():
            return [
                {"pattern": 4, "repeat_count": 2},
                {"pattern": 9, "repeat_count": 1},
            ]

        @staticmethod
        def get_song_loop():
            return True

    fake_module = types.ModuleType("app.services.drum_sequencer_service")
    fake_module.DrumSequencerService = type("FakeSequencerServiceClass", (), {"has_instance": staticmethod(lambda: True)})
    fake_module.get_drum_sequencer_service = lambda: _FakeSequencerService()
    monkeypatch.setitem(sys.modules, "app.services.drum_sequencer_service", fake_module)

    fill = service.trigger_fill()
    assert fill["status"] == "ok"
    assert fake_engine.fill_trigger_calls == 1

    song_transport = service.start_song_playback()
    assert song_transport["is_playing"] is True
    assert song_transport["current_entry_index"] == 0
    assert song_transport["current_repeat"] == 1
    assert fake_engine.pattern_calls[-1] == 4
    assert fake_engine.transport_playing_calls[-1] is True

    fake_engine.position.update({"step": 15, "bar": 1, "beat": 4, "pattern": 4, "pattern_id": 4, "is_playing": True})
    service._refresh_position_from_engine()
    fake_engine.position.update({"step": 0, "bar": 2, "beat": 1, "pattern": 4, "pattern_id": 4, "is_playing": True})
    service._refresh_position_from_engine()

    repeated = service.get_song_transport()
    assert repeated["current_entry_index"] == 0
    assert repeated["current_repeat"] == 2

    fake_engine.position.update({"step": 15, "bar": 2, "beat": 4, "pattern": 4, "pattern_id": 4, "is_playing": True})
    service._refresh_position_from_engine()
    fake_engine.position.update({"step": 0, "bar": 3, "beat": 1, "pattern": 4, "pattern_id": 4, "is_playing": True})
    service._refresh_position_from_engine()

    advanced = service.get_song_transport()
    assert advanced["current_entry_index"] == 1
    assert advanced["current_repeat"] == 1
    assert fake_engine.pattern_calls[-1] == 9


@pytest.mark.asyncio
async def test_drum_machine_service_publishes_metering_topic_history(tmp_path, monkeypatch):
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)
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
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

    service.update_state({"volume": 64})
    fake_engine.metering["master_peak_left"] = 0.42

    metering = service.get_metering()

    assert fake_engine.master_volume_calls[-1] == pytest.approx(0.64)
    assert metering["master_peak_left"] == pytest.approx(0.42)


@pytest.mark.asyncio
async def test_drum_machine_service_polls_engine_position_and_broadcasts_updates(tmp_path, monkeypatch):
    monkeypatch.setattr(drum_service_module, "_POSITION_POLL_INTERVAL_SECONDS", 0.001)
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)
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
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

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
    service, _, _, _, _, fake_engine = _build_service(tmp_path, monkeypatch)

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


def test_drum_machine_service_rejects_unknown_midi_preset(tmp_path, monkeypatch):
    service, _, _, _, _, _ = _build_service(tmp_path, monkeypatch)

    with pytest.raises(ValueError, match="Unknown drum MIDI preset"):
        service.load_midi_preset("Not A Real Preset")


def test_drum_machine_service_persists_and_restores_per_kit_midi_config(tmp_path, monkeypatch):
    service, _, _, _, midi_configs_dir, fake_engine = _build_service(tmp_path, monkeypatch)

    class _FakeKitService:
        @staticmethod
        def get_active_kit():
            return {"kit_id": "factory_one"}

    fake_kit_service_module = type("FakeKitServiceModule", (), {"has_instance": staticmethod(lambda: True)})
    monkeypatch.setattr(drum_kit_service_module, "get_drum_kit_service", lambda: _FakeKitService())
    monkeypatch.setattr(drum_kit_service_module, "DrumKitService", fake_kit_service_module)

    service.update_midi_mapping(
        {"global_midi_channel": 9, "pads": [{"pad": 0, "notes": [36, 35], "midi_channel": 10}]}
    )
    service.update_velocity_curves(
        {"pads": [{"pad": 0, "curve_type": 2, "fixed_velocity": 0.7, "input_floor": 0.1, "output_floor": 0.2, "output_ceiling": 0.9}]}
    )
    service.update_midi_zones(
        {"pads": [{"pad": 1, "zones": [{"kind": 1, "trigger_note": 40, "key_switch_note": 36, "velocity_scale": 0.92, "enabled": True}]}]}
    )

    persisted = json.loads((midi_configs_dir / "factory_one.json").read_text())
    assert persisted["mapping"]["global_midi_channel"] == 9
    assert persisted["mapping"]["pads"][0]["notes"] == [36, 35]
    assert persisted["velocity_curves"]["pads"][0]["curve_type"] == 2
    assert persisted["zones"]["pads"][1]["zones"][0]["trigger_note"] == 40

    fake_engine.global_midi_channel = 0
    fake_engine.pad_notes[0] = [36]
    fake_engine.pad_zones[1] = []
    restored = service.load_midi_config_for_kit("factory_one")

    assert restored["mapping"]["global_midi_channel"] == 9
    assert fake_engine.global_midi_channel_calls[-1] == 9
    assert fake_engine.pad_add_note_calls[-1] == (0, 35)
    assert fake_engine.pad_zone_calls[-1] == (1, 1, 40, 36, 0.92)
