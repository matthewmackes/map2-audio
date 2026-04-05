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
            "midi_output_enabled": False,
            "midi_clock_output_enabled": False,
            "midi_output_channel": 9,
            "program_change_enabled": False,
            "track_swing": [0] * 16,
            "pad_sound_sources": ["sample"] * 16,
            "pad_synth_params": [
                {
                    "oscillator_type": "sine",
                    "pitch_envelope_start_hz": 160.0,
                    "pitch_envelope_end_hz": 50.0,
                    "pitch_envelope_decay_ms": 180.0,
                    "noise_level": 0.2,
                    "noise_decay_ms": 120.0,
                    "body_decay_ms": 420.0,
                    "tone_amount": 0.55,
                }
                for _ in range(16)
            ],
            "pad_filters": [
                {
                    "type": "lowpass",
                    "cutoff_hz": 12000.0,
                    "resonance": 0.35,
                    "env_amount": 0.0,
                    "env_decay_ms": 180.0,
                }
                for _ in range(16)
            ],
            "pad_cv_gate_configs": [
                {
                    "enabled": False,
                    "output_pair": 0,
                    "gate_length_ms": 25.0,
                    "note_min": 36,
                    "note_max": 84,
                    "pitch_min_volts": 0.0,
                    "pitch_max_volts": 5.0,
                }
                for _ in range(16)
            ],
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
        self.backing_tracks = [
            {"track_id": "bt-001", "name": "Midnight Motor", "genre": "Rock", "key": "E minor", "tempo": 118, "duration_seconds": 204.0, "duration_label": "03:24"},
            {"track_id": "bt-002", "name": "City Lights", "genre": "Pop", "key": "A major", "tempo": 124, "duration_seconds": 178.0, "duration_label": "02:58"},
            {"track_id": "bt-003", "name": "Copper Shuffle", "genre": "Blues", "key": "G", "tempo": 92, "duration_seconds": 251.0, "duration_label": "04:11"},
        ]
        self.backing_track_transport = {
            "track_id": "bt-001",
            "track_name": "Midnight Motor",
            "genre": "Rock",
            "key": "E minor",
            "tempo": 118,
            "duration_seconds": 204.0,
            "duration_label": "03:24",
            "position_seconds": 0.0,
            "position_label": "00:00",
            "is_playing": False,
            "loop_enabled": False,
            "tempo_shift": 0,
            "pitch_shift": 0,
            "runtime_source": "drum_machine_service",
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
        self.pad_controls = [
            {
                "pad_id": index,
                "volume": 80 - index,
                "pan": 0,
                "tune": 0,
                "mute": False,
                "solo": False,
                "bus_assignment": index % 8,
            }
            for index in range(16)
        ]
        self.bus_mixers = [
            {
                "bus_id": index,
                "name": f"Bus {index}",
                "eq": {"low_gain": 0, "mid_gain": 0, "mid_freq": 800, "high_gain": 0},
                "comp": {"threshold": -18, "ratio": 4, "attack": 10, "release": 80, "makeup": 0},
                "level": 75,
                "pan": 0,
                "mute": False,
                "solo": False,
                "output_pair": min(index, 3),
                "reverb_send": 0,
                "output_channel_count": 8,
                "available_output_pairs": [0, 1, 2, 3],
            }
            for index in range(8)
        ]
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
        self.cc_mappings = {
            "mappings": [
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
        }
        self.cc_learn_state = {
            "active": False,
            "slot": -1,
            "last_cc": -1,
            "last_channel": -1,
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
            "midi_output_enabled": self.state["midi_output_enabled"],
            "midi_clock_output_enabled": self.state["midi_clock_output_enabled"],
            "midi_output_channel": self.state["midi_output_channel"],
            "program_change_enabled": self.state["program_change_enabled"],
            "track_swing": list(self.state["track_swing"]),
        }

    def _format_time_label(self, seconds):
        rounded_seconds = max(0, int(round(seconds)))
        minutes, remainder = divmod(rounded_seconds, 60)
        return f"{minutes:02d}:{remainder:02d}"

    def list_backing_tracks(self):
        return [dict(track) for track in self.backing_tracks]

    def get_backing_track_transport(self):
        payload = dict(self.backing_track_transport)
        payload["position_label"] = self._format_time_label(payload["position_seconds"])
        return payload

    def update_backing_track_transport(self, patch):
        if "track_id" in patch:
            track = next(track for track in self.backing_tracks if track["track_id"] == patch["track_id"])
            self.backing_track_transport.update({
                "track_id": track["track_id"],
                "track_name": track["name"],
                "genre": track["genre"],
                "key": track["key"],
                "tempo": track["tempo"],
                "duration_seconds": track["duration_seconds"],
                "duration_label": track["duration_label"],
                "position_seconds": 0.0,
            })
        for key in ("is_playing", "loop_enabled", "tempo_shift", "pitch_shift", "position_seconds"):
            if key in patch:
                self.backing_track_transport[key] = patch[key]
        self.backing_track_transport["position_label"] = self._format_time_label(self.backing_track_transport["position_seconds"])
        return self.get_backing_track_transport()

    def update_transport(self, patch):
        if "is_playing" in patch:
            self.state["transport"] = patch["is_playing"]
        for key in (
            "bpm",
            "pattern",
            "variation",
            "swing",
            "midi_output_enabled",
            "midi_clock_output_enabled",
            "midi_output_channel",
            "program_change_enabled",
        ):
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

    def get_pad_sound_source(self, pad):
        return {"pad": pad, "source": self.state["pad_sound_sources"][pad]}

    def set_pad_sound_source(self, pad, source):
        self.state["pad_sound_sources"][pad] = source
        return self.get_pad_sound_source(pad)

    def get_pad_synth_params(self, pad):
        return {"pad": pad, "params": dict(self.state["pad_synth_params"][pad])}

    def set_pad_synth_params(self, pad, payload):
        self.state["pad_synth_params"][pad].update(payload)
        return self.get_pad_synth_params(pad)

    def get_pad_filter(self, pad):
        return {"pad": pad, "filter": dict(self.state["pad_filters"][pad])}

    def set_pad_filter(self, pad, payload):
        self.state["pad_filters"][pad].update(payload)
        return self.get_pad_filter(pad)

    def get_pad_cv_gate_config(self, pad):
        return {"pad": pad, "config": dict(self.state["pad_cv_gate_configs"][pad])}

    def set_pad_cv_gate_config(self, pad, payload):
        self.state["pad_cv_gate_configs"][pad].update(payload)
        return self.get_pad_cv_gate_config(pad)

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

    def get_pad_controls(self):
        return json.loads(json.dumps(self.pad_controls))

    def set_pad_control(self, pad, patch):
        self.pad_controls[pad].update(patch)
        return dict(self.pad_controls[pad])

    def get_bus_mixers(self):
        return json.loads(json.dumps(self.bus_mixers))

    def set_bus_mixer(self, bus, patch):
        if "eq" in patch and patch["eq"] is not None:
            self.bus_mixers[bus]["eq"].update(patch["eq"])
        if "comp" in patch and patch["comp"] is not None:
            self.bus_mixers[bus]["comp"].update(patch["comp"])
        for key in ("level", "pan", "mute", "solo", "output_pair", "reverb_send"):
            if key in patch and patch[key] is not None:
                self.bus_mixers[bus][key] = patch[key]
        return dict(self.bus_mixers[bus])

    def get_master_fx(self):
        return dict(self.master_fx)

    def set_master_fx(self, payload):
        self.master_fx.update(payload)
        return dict(self.master_fx)

    def set_bus_reverb_send(self, bus, level):
        self.bus_mixers[bus]["reverb_send"] = level
        return dict(self.bus_mixers[bus])

    def get_master_volume(self):
        return {"volume": self.state["volume"]}

    def set_master_volume(self, volume):
        self.state["volume"] = volume
        return {"volume": volume}

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

    def get_midi_output_config(self):
        return {
            "midi_output_enabled": self.state["midi_output_enabled"],
            "midi_clock_output_enabled": self.state["midi_clock_output_enabled"],
            "midi_output_channel": self.state["midi_output_channel"],
            "program_change_enabled": self.state["program_change_enabled"],
        }

    def update_midi_output_config(self, payload):
        for key in ("midi_output_enabled", "midi_clock_output_enabled", "midi_output_channel", "program_change_enabled"):
            if key in payload:
                self.state[key] = payload[key]
        return self.get_midi_output_config()

    def get_cc_mappings(self):
        return json.loads(json.dumps(self.cc_mappings))

    def update_cc_mappings(self, payload):
        for mapping in payload.get("mappings", []):
            self.cc_mappings["mappings"][mapping["slot"]] = mapping
        return self.get_cc_mappings()

    def start_cc_learn(self, slot, timeout_seconds=10):
        self.cc_learn_state = {
            "active": True,
            "slot": slot,
            "last_cc": -1,
            "last_channel": -1,
            "timeout_seconds": timeout_seconds,
        }
        return dict(self.cc_learn_state)

    def stop_cc_learn(self):
        self.cc_learn_state["active"] = False
        self.cc_learn_state["slot"] = -1
        return dict(self.cc_learn_state)

    def get_cc_learn_state(self):
        return dict(self.cc_learn_state)

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
        pattern["track_lengths"] = payload.get("track_lengths", [0] * 16)
        pattern["steps"] = payload["steps"]
        self.patterns[pattern_id] = pattern
        return dict(pattern)

    def set_step(
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
        return dict(pattern)

    def set_track_length(self, pattern_id, instrument, length):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["track_lengths"][instrument] = length
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
            "track_lengths": [0] * 16,
            "steps": [
                [{"velocity": 0, "accent": False, "micro_timing": 0, "probability": 1.0, "ratchet_count": 1, "ratchet_decay": 0, "lock_pitch": None, "lock_filter_cutoff": None, "lock_decay": None, "lock_pan": None, "lock_volume": None} for _ in range(64)]
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


class _FakeDrumSampleEditorService:
    def __init__(self):
        self.recording_pad = None
        self.exported = []
        self.waveform = {
            "pad": 0,
            "kit_id": "user_kit",
            "kit_source": "user",
            "root_path": "/kits/user_kit",
            "sfz_path": "pad_0_sample.sfz",
            "sample_path": "samples/pad_1/pad_1_uploaded.wav",
            "sample_rate": 48000,
            "channel_count": 1,
            "sample_count": 960,
            "duration_seconds": 0.02,
            "points": 256,
            "peaks": [0.25] * 256,
        }

    def get_waveform(self, pad, points=256):
        payload = dict(self.waveform)
        payload["pad"] = pad
        payload["points"] = points
        payload["peaks"] = [0.25] * points
        return payload

    def export_sample(self, pad):
        self.exported.append(pad)
        return f"pad_{pad + 1}.wav", b"RIFFdemoWAVE"

    def upload_sample(self, pad, filename, file_bytes):
        payload = self.get_waveform(pad, 256)
        payload["sample_path"] = f"samples/pad_{pad + 1}/uploaded.wav"
        payload["sample_count"] = 2048
        payload["duration_seconds"] = 2048 / 48000.0
        return payload

    def start_recording(self, pad):
        self.recording_pad = pad
        return {"pad": pad, "active": True, "max_duration_seconds": 30.0}

    def stop_recording(self, pad):
        self.recording_pad = None
        payload = self.get_waveform(pad, 256)
        payload["sample_path"] = f"samples/pad_{pad + 1}/recorded.wav"
        payload["sample_count"] = 512
        payload["duration_seconds"] = 512 / 48000.0
        return payload

    def trim_sample(self, pad, start_sample, end_sample):
        payload = self.get_waveform(pad, 256)
        payload["sample_count"] = end_sample - start_sample
        payload["duration_seconds"] = payload["sample_count"] / 48000.0
        return payload

    def normalize_sample(self, pad, target_peak):
        payload = self.get_waveform(pad, 256)
        payload["peaks"] = [target_peak] * 256
        return payload

    def reverse_sample(self, pad):
        return self.get_waveform(pad, 256)

    def fade_sample(self, pad, fade_in_ms, fade_out_ms):
        payload = self.get_waveform(pad, 256)
        payload["peaks"][0] = 0.0
        payload["peaks"][-1] = 0.0
        return payload


def _app_with_service(monkeypatch):
    app = FastAPI()
    app.include_router(drum_routes.router)
    service = _FakeDrumService()
    kit_service = _FakeDrumKitService()
    sample_editor_service = _FakeDrumSampleEditorService()
    monkeypatch.setattr(drum_routes, "_get_service", lambda: service)
    monkeypatch.setattr(drum_routes, "_get_sequencer_service", lambda: service)
    monkeypatch.setattr(drum_routes, "_get_kit_service", lambda: kit_service)
    monkeypatch.setattr(drum_routes, "_get_sample_editor_service", lambda: sample_editor_service)
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
        "midi_output_enabled": False,
        "midi_clock_output_enabled": False,
        "midi_output_channel": 9,
        "program_change_enabled": False,
        "track_swing": [0] * 16,
    }
    history = ws_manager.get_event_history("drums:transport")
    assert history["events"][-1]["type"] == "drum_transport"
    assert history["events"][-1]["data"]["bpm"] == 96


def test_drum_backing_track_routes_round_trip_runtime_state(monkeypatch):
    client = _client(monkeypatch)

    catalog = client.get("/api/engine/drums/backing-tracks")
    initial_transport = client.get("/api/engine/drums/backing-tracks/transport")
    updated_transport = client.post(
        "/api/engine/drums/backing-tracks/transport",
        json={
            "track_id": "bt-003",
            "is_playing": True,
            "loop_enabled": True,
            "tempo_shift": 12,
            "pitch_shift": -3,
            "position_seconds": 24.0,
        },
    )

    assert catalog.status_code == 200
    assert catalog.json()[0]["track_id"] == "bt-001"

    assert initial_transport.status_code == 200
    assert initial_transport.json()["track_id"] == "bt-001"
    assert initial_transport.json()["runtime_source"] == "drum_machine_service"

    assert updated_transport.status_code == 200
    assert updated_transport.json() == {
        "track_id": "bt-003",
        "track_name": "Copper Shuffle",
        "genre": "Blues",
        "key": "G",
        "tempo": 92,
        "duration_seconds": 251.0,
        "duration_label": "04:11",
        "position_seconds": 24.0,
        "position_label": "00:24",
        "is_playing": True,
        "loop_enabled": True,
        "tempo_shift": 12,
        "pitch_shift": -3,
        "runtime_source": "drum_machine_service",
    }


def test_drum_pad_synth_routes_round_trip_source_and_params(monkeypatch):
    client = _client(monkeypatch)

    source_response = client.post("/api/engine/drums/pad/2/source", json={"source": "hybrid"})
    synth_response = client.post(
        "/api/engine/drums/pad/2/synth",
        json={
            "oscillator_type": "metallic",
            "pitch_envelope_start_hz": 220.0,
            "pitch_envelope_end_hz": 72.0,
            "pitch_envelope_decay_ms": 240.0,
            "noise_level": 0.64,
            "noise_decay_ms": 180.0,
            "body_decay_ms": 610.0,
            "tone_amount": 0.83,
        },
    )

    assert source_response.status_code == 200
    assert source_response.json() == {"pad": 2, "source": "hybrid"}
    assert synth_response.status_code == 200
    assert synth_response.json()["pad"] == 2
    assert synth_response.json()["params"]["oscillator_type"] == "metallic"


def test_drum_sample_editor_routes_round_trip(monkeypatch):
    client = _client(monkeypatch)

    waveform_response = client.get("/api/engine/drums/pad/0/sample/waveform?points=64")
    file_response = client.get("/api/engine/drums/pad/0/sample/file")
    upload_response = client.post(
        "/api/engine/drums/pad/0/sample/upload",
        files={"file": ("kick.wav", b"RIFFdemoWAVE", "audio/wav")},
    )
    record_start_response = client.post("/api/engine/drums/pad/0/record/start")
    record_stop_response = client.post("/api/engine/drums/pad/0/record/stop")
    trim_response = client.post("/api/engine/drums/pad/0/sample/trim", json={"start_sample": 12, "end_sample": 132})
    normalize_response = client.post("/api/engine/drums/pad/0/sample/normalize", json={"target_peak": 0.5})
    reverse_response = client.post("/api/engine/drums/pad/0/sample/reverse")
    fade_response = client.post("/api/engine/drums/pad/0/sample/fade", json={"fade_in_ms": 5.0, "fade_out_ms": 5.0})

    assert waveform_response.status_code == 200
    assert waveform_response.json()["points"] == 64
    assert len(waveform_response.json()["peaks"]) == 64
    assert file_response.status_code == 200
    assert file_response.headers["content-type"] == "audio/wav"
    assert file_response.content == b"RIFFdemoWAVE"

    assert upload_response.status_code == 200
    assert upload_response.json()["sample_path"] == "samples/pad_1/uploaded.wav"

    assert record_start_response.status_code == 200
    assert record_start_response.json() == {"pad": 0, "active": True, "max_duration_seconds": 30.0}

    assert record_stop_response.status_code == 200
    assert record_stop_response.json()["sample_path"] == "samples/pad_1/recorded.wav"

    assert trim_response.status_code == 200
    assert trim_response.json()["sample_count"] == 120

    assert normalize_response.status_code == 200
    assert max(normalize_response.json()["peaks"]) == 0.5

    assert reverse_response.status_code == 200
    assert reverse_response.json()["pad"] == 0

    assert fade_response.status_code == 200
    assert fade_response.json()["peaks"][0] == 0.0
    assert fade_response.json()["peaks"][-1] == 0.0


def test_drum_pad_filter_routes_round_trip(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pad/5/filter",
        json={
            "type": "notch",
            "cutoff_hz": 2400.0,
            "resonance": 1.9,
            "env_amount": -0.25,
            "env_decay_ms": 420.0,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "pad": 5,
        "filter": {
            "type": "notch",
            "cutoff_hz": 2400.0,
            "resonance": 1.9,
            "env_amount": -0.25,
            "env_decay_ms": 420.0,
        },
    }


def test_drum_pad_cv_gate_routes_round_trip(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pad/4/cv-gate",
        json={
            "enabled": True,
            "output_pair": 2,
            "gate_length_ms": 40.0,
            "note_min": 24,
            "note_max": 72,
            "pitch_min_volts": -1.0,
            "pitch_max_volts": 4.0,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "pad": 4,
        "config": {
            "enabled": True,
            "output_pair": 2,
            "gate_length_ms": 40.0,
            "note_min": 24,
            "note_max": 72,
            "pitch_min_volts": -1.0,
            "pitch_max_volts": 4.0,
        },
    }


def test_drum_mixer_routes_round_trip_pad_bus_and_master_controls(monkeypatch):
    client = _client(monkeypatch)

    pad_response = client.patch(
        "/api/engine/drums/mixer/pads/3",
        json={"volume": 64, "pan": -25, "bus_assignment": 6, "mute": True},
    )
    bus_response = client.patch(
        "/api/engine/drums/mixer/buses/2",
        json={
            "level": 78,
            "output_pair": 3,
            "reverb_send": 31,
            "eq": {"low_gain": -3, "mid_gain": 2, "mid_freq": 1400, "high_gain": 4},
            "comp": {"threshold": -24, "ratio": 6, "attack": 12, "release": 90, "makeup": 3},
        },
    )
    master_response = client.post("/api/engine/drums/mixer/master", json={"volume": 72})

    assert pad_response.status_code == 200
    assert pad_response.json()["bus_assignment"] == 6
    assert bus_response.status_code == 200
    assert bus_response.json()["output_pair"] == 3
    assert bus_response.json()["reverb_send"] == 31
    assert bus_response.json()["available_output_pairs"] == [0, 1, 2, 3]
    assert master_response.status_code == 200
    assert master_response.json() == {"volume": 72}


def test_drum_master_fx_and_bus_reverb_send_routes_round_trip(monkeypatch):
    client = _client(monkeypatch)

    fx_response = client.post(
        "/api/engine/drums/master-fx",
        json={
            "drive_db": 8,
            "compressor_threshold": -21,
            "compressor_ratio": 3,
            "compressor_attack": 6,
            "compressor_release": 120,
            "compressor_makeup": 2,
            "reverb_mix": 0.35,
            "reverb_size": 0.7,
            "reverb_damping": 0.25,
            "reverb_width": 1.0,
            "limiter_threshold": -1.5,
            "limiter_release": 75,
        },
    )
    send_response = client.post("/api/engine/drums/bus/2/reverb-send", json={"level": 44})

    assert fx_response.status_code == 200
    assert fx_response.json()["drive_db"] == 8.0
    assert fx_response.json()["reverb_mix"] == 0.35
    assert send_response.status_code == 200
    assert send_response.json()["bus_id"] == 2
    assert send_response.json()["reverb_send"] == 44.0


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


def test_drum_pattern_track_length_route_updates_pattern(monkeypatch):
    client = _client(monkeypatch)

    response = client.post("/api/engine/drums/pattern/7/track/3/length", json={"length": 12})

    assert response.status_code == 200
    payload = response.json()
    assert payload["track_lengths"][3] == 12


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


def test_drum_midi_output_routes_round_trip_payload(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/midi/output",
        json={
            "midi_output_enabled": True,
            "midi_clock_output_enabled": True,
            "midi_output_channel": 6,
            "program_change_enabled": True,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "midi_output_enabled": True,
        "midi_clock_output_enabled": True,
        "midi_output_channel": 6,
        "program_change_enabled": True,
    }

    fetch = client.get("/api/engine/drums/midi/output")
    assert fetch.status_code == 200
    assert fetch.json()["midi_output_channel"] == 6


def test_drum_cc_mapping_and_learn_routes_round_trip_payload(monkeypatch):
    client = _client(monkeypatch)

    mapping_response = client.post(
        "/api/engine/drums/midi/cc-mappings",
        json={
            "mappings": [
                {
                    "slot": 0,
                    "cc_number": 74,
                    "midi_channel": 1,
                    "target": "pad_filter_cutoff",
                    "target_index": 3,
                    "active": True,
                }
            ]
        },
    )
    assert mapping_response.status_code == 200
    assert mapping_response.json()["mappings"][0]["cc_number"] == 74

    learn_start = client.post("/api/engine/drums/midi/cc-learn/start", json={"slot": 2, "timeout_seconds": 12})
    assert learn_start.status_code == 200
    assert learn_start.json()["active"] is True
    assert learn_start.json()["slot"] == 2

    learn_status = client.get("/api/engine/drums/midi/cc-learn/status")
    assert learn_status.status_code == 200
    assert learn_status.json()["timeout_seconds"] == 12

    learn_stop = client.post("/api/engine/drums/midi/cc-learn/stop")
    assert learn_stop.status_code == 200
    assert learn_stop.json()["active"] is False


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


def test_drum_pattern_step_route_accepts_parameter_locks(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={
            "instrument": 2,
            "step": 5,
            "velocity": 110,
            "accent": True,
            "lock_pitch": 2,
            "lock_filter_cutoff": 4200,
            "lock_decay": 250,
            "lock_pan": -0.15,
            "lock_volume": 0.68,
        },
    )

    assert response.status_code == 200
    payload = response.json()["steps"][2][5]
    assert payload["lock_pitch"] == 2
    assert payload["lock_filter_cutoff"] == 4200
    assert payload["lock_decay"] == 250
    assert payload["lock_pan"] == -0.15
    assert payload["lock_volume"] == 0.68


def test_drum_pattern_step_route_accepts_micro_timing(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={"instrument": 1, "step": 2, "velocity": 96, "accent": False, "micro_timing": 6},
    )

    assert response.status_code == 200
    assert response.json()["steps"][1][2]["micro_timing"] == 6


def test_drum_pattern_step_route_accepts_probability(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={"instrument": 1, "step": 2, "velocity": 96, "accent": False, "probability": 0.35},
    )

    assert response.status_code == 200
    assert response.json()["steps"][1][2]["probability"] == 0.35


def test_drum_pattern_step_route_accepts_ratchet(monkeypatch):
    client = _client(monkeypatch)

    response = client.post(
        "/api/engine/drums/pattern/9/step",
        json={"instrument": 3, "step": 4, "velocity": 112, "accent": False, "ratchet_count": 4, "ratchet_decay": 25},
    )

    assert response.status_code == 200
    assert response.json()["steps"][3][4]["ratchet_count"] == 4
    assert response.json()["steps"][3][4]["ratchet_decay"] == 25


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
