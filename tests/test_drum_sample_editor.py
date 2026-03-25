import io
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from app.services import drum_kit_service as drum_kit_service_module
from app.services import drum_sample_editor as drum_sample_editor_module


class _FakeSampleEditorEngine:
    def __init__(self):
        self.loaded_sfzs = []
        self.recording_started = []
        self.recording_stopped = 0
        self.position = {"is_playing": False}
        self.recording_payload = {
            "pad": 0,
            "sample_rate": 48000,
            "channel_count": 1,
            "truncated": False,
            "samples": [0.0, 0.5, -0.5, 0.25, -0.25] * 96,
        }

    def load_drum_pad_sfz(self, pad_index, sfz_path):
        self.loaded_sfzs.append((pad_index, sfz_path))
        return True

    def set_drum_pad_note(self, pad_index, midi_note):
        return True

    def set_drum_pad_volume(self, pad_index, value):
        return True

    def set_drum_pad_pan(self, pad_index, value):
        return True

    def set_drum_pad_tune(self, pad_index, value):
        return True

    def set_drum_pad_bus(self, pad_index, value):
        return True

    def set_drum_transport_playing(self, is_playing):
        self.position["is_playing"] = is_playing
        return True

    def get_drum_sequencer_position(self):
        return dict(self.position)

    def get_drum_kit_status(self):
        return {f"pad_{index}": {"loaded": True} for index in range(16)}

    def start_drum_pad_recording(self, pad):
        self.recording_started.append(pad)
        self.recording_payload["pad"] = pad
        return True

    def stop_drum_pad_recording(self):
        self.recording_stopped += 1
        return dict(self.recording_payload)


def _write_wav(path: Path, data: np.ndarray, sample_rate: int = 48000):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), data.astype(np.float32), sample_rate, subtype="PCM_16")


def _write_kit(root: Path, kit_id: str):
    kit_root = root / kit_id
    samples_dir = kit_root / "samples"
    samples_dir.mkdir(parents=True)
    base_wave = np.linspace(-0.75, 0.75, 480, dtype=np.float32)
    instruments = []
    for index in range(16):
        sfz_name = f"pad_{index}.sfz"
        sample_name = f"samples/pad_{index}.wav"
        (kit_root / sfz_name).write_text(f"<region>\nsample={sample_name}\n")
        _write_wav(samples_dir / f"pad_{index}.wav", base_wave)
        instruments.append(
            {
                "name": f"Pad {index + 1}",
                "sfz_path": sfz_name,
                "default_note": 36 + index,
                "bus_assignment": index % 8,
                "default_volume": 0.7,
                "default_pan": 0.0,
                "default_tune": 0.0,
            }
        )
    (kit_root / "kit.json").write_text(
        json.dumps(
            {
                "kit_id": kit_id,
                "name": kit_id.replace("_", " ").title(),
                "description": "Test kit",
                "author": "Tests",
                "version": 1,
                "category": "acoustic",
                "license": "CC0-1.0",
                "default_bpm": 120,
                "default_swing": 0,
                "instruments": instruments,
            },
            indent=2,
        ) + "\n"
    )


def _build_services(tmp_path, monkeypatch):
    factory_dir = tmp_path / "factory_kits"
    user_dir = tmp_path / "user_kits"
    active_kit_state_path = tmp_path / "active_kit.json"
    factory_dir.mkdir()
    user_dir.mkdir()
    fake_engine = _FakeSampleEditorEngine()
    fake_engine_service = type("FakeEngineService", (), {"engine": fake_engine})()

    monkeypatch.setattr(drum_kit_service_module, "_FACTORY_KITS_DIR", factory_dir)
    monkeypatch.setattr(drum_kit_service_module, "_USER_KITS_DIR", user_dir)
    monkeypatch.setattr(drum_kit_service_module, "_ACTIVE_KIT_STATE_PATH", active_kit_state_path)
    monkeypatch.setattr(drum_kit_service_module, "get_audio_engine", lambda: fake_engine_service)
    monkeypatch.setattr(drum_sample_editor_module, "get_audio_engine", lambda: fake_engine_service)
    drum_kit_service_module.DrumKitService.reset_instance()
    drum_sample_editor_module.DrumSampleEditorService.reset_instance()
    return (
        drum_kit_service_module.get_drum_kit_service(),
        drum_sample_editor_module.get_drum_sample_editor_service(),
        factory_dir,
        user_dir,
        fake_engine,
    )


def test_drum_sample_editor_uploads_into_editable_user_kit_and_returns_waveform(tmp_path, monkeypatch):
    kit_service, sample_editor, factory_dir, user_dir, fake_engine = _build_services(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one")
    kit_service.load_kit("factory_one")

    upload_wave = np.sin(np.linspace(0.0, np.pi * 6.0, 960, dtype=np.float32)) * 0.4
    upload_buffer = io.BytesIO()
    sf.write(upload_buffer, upload_wave, 44100, format="WAV", subtype="PCM_16")

    payload = sample_editor.upload_sample(0, "kick-import.wav", upload_buffer.getvalue())

    assert payload["kit_id"] == "factory_one_editable"
    assert payload["kit_source"] == "user"
    assert payload["sample_rate"] == 44100
    assert payload["sample_count"] == 960
    assert payload["points"] == 256
    assert len(payload["peaks"]) == 256
    assert payload["sample_path"].startswith("samples/pad_1/")
    assert (user_dir / "factory_one_editable" / payload["sample_path"]).exists()
    assert fake_engine.loaded_sfzs[-1][0] == 0
    assert kit_service.get_active_kit()["kit_id"] == "factory_one_editable"


def test_drum_sample_editor_edits_and_records_samples(tmp_path, monkeypatch):
    kit_service, sample_editor, factory_dir, user_dir, fake_engine = _build_services(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one")
    kit_service.load_kit("factory_one")

    upload_wave = np.linspace(-0.25, 0.85, 1200, dtype=np.float32)
    upload_buffer = io.BytesIO()
    sf.write(upload_buffer, upload_wave, 48000, format="WAV", subtype="PCM_16")
    imported = sample_editor.upload_sample(0, "snare.wav", upload_buffer.getvalue())

    trimmed = sample_editor.trim_sample(0, 100, 700)
    assert trimmed["sample_count"] == 600

    normalized = sample_editor.normalize_sample(0, 0.5)
    assert max(normalized["peaks"]) <= 0.51

    reversed_waveform = sample_editor.reverse_sample(0)
    assert reversed_waveform["sample_count"] == normalized["sample_count"]

    faded = sample_editor.fade_sample(0, 5.0, 5.0)
    assert faded["sample_count"] == reversed_waveform["sample_count"]
    assert faded["peaks"][0] < reversed_waveform["peaks"][0]
    assert faded["peaks"][-1] < reversed_waveform["peaks"][-1]

    started = sample_editor.start_recording(2)
    assert started["active"] is True
    assert fake_engine.recording_started == [2]

    recorded = sample_editor.stop_recording(2)
    assert recorded["pad"] == 2
    assert recorded["sample_rate"] == 48000
    assert recorded["sample_count"] == len(fake_engine.recording_payload["samples"])
    assert fake_engine.recording_stopped == 1
    assert (user_dir / "factory_one_editable" / recorded["sample_path"]).exists()
    assert kit_service.get_active_kit()["kit_id"] == "factory_one_editable"

    assert imported["kit_id"] == "factory_one_editable"


def test_drum_sample_editor_exports_current_pad_wav_bytes(tmp_path, monkeypatch):
    kit_service, sample_editor, factory_dir, _user_dir, _fake_engine = _build_services(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one")
    kit_service.load_kit("factory_one")

    filename, payload = sample_editor.export_sample(0)
    audio, sample_rate = sf.read(io.BytesIO(payload), dtype="float32", always_2d=False)

    assert filename.endswith(".wav")
    assert sample_rate == 48000
    assert int(audio.shape[0]) == 480
