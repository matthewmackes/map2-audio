import io
import json
import zipfile
from pathlib import Path

import pytest

from app.services import drum_kit_service as drum_kit_service_module


class _FakeDrumKitEngine:
    def __init__(self):
        self.loaded_sfzs = []
        self.pad_notes = []
        self.pad_volumes = []
        self.pad_pans = []
        self.pad_tunes = []
        self.pad_buses = []
        self.transport_calls = []
        self.position = {"is_playing": False}

    def load_drum_pad_sfz(self, pad_index, sfz_path):
        self.loaded_sfzs.append((pad_index, sfz_path))
        return True

    def set_drum_pad_note(self, pad_index, midi_note):
        self.pad_notes.append((pad_index, midi_note))
        return True

    def set_drum_pad_volume(self, pad_index, value):
        self.pad_volumes.append((pad_index, value))
        return True

    def set_drum_pad_pan(self, pad_index, value):
        self.pad_pans.append((pad_index, value))
        return True

    def set_drum_pad_tune(self, pad_index, value):
        self.pad_tunes.append((pad_index, value))
        return True

    def set_drum_pad_bus(self, pad_index, value):
        self.pad_buses.append((pad_index, value))
        return True

    def set_drum_transport_playing(self, is_playing):
        self.transport_calls.append(is_playing)
        self.position["is_playing"] = is_playing
        return True

    def get_drum_sequencer_position(self):
        return dict(self.position)

    def get_drum_kit_status(self):
        return {f"pad_{index}": {"loaded": True} for index in range(16)}


def _write_kit(root: Path, kit_id: str, *, source_name: str = "Factory Kit"):
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
                "default_volume": 0.5 + (index * 0.01),
                "default_pan": 0.0,
                "default_tune": 0.0,
            }
        )
    (kit_root / "kit.json").write_text(
        json.dumps(
            {
                "kit_id": kit_id,
                "name": source_name,
                "description": "Test kit",
                "author": "Tests",
                "version": 1,
                "category": "acoustic",
                "license": "CC0-1.0",
                "default_bpm": 120,
                "default_swing": 10,
                "instruments": instruments,
            },
            indent=2,
        )
        + "\n"
    )
    return kit_root


def _build_service(tmp_path, monkeypatch):
    factory_dir = tmp_path / "factory_kits"
    user_dir = tmp_path / "user_kits"
    active_kit_state_path = tmp_path / "active_kit.json"
    factory_dir.mkdir()
    user_dir.mkdir()
    fake_engine = _FakeDrumKitEngine()
    fake_engine_service = type("FakeEngineService", (), {"engine": fake_engine})()

    monkeypatch.setattr(drum_kit_service_module, "_FACTORY_KITS_DIR", factory_dir)
    monkeypatch.setattr(drum_kit_service_module, "_USER_KITS_DIR", user_dir)
    monkeypatch.setattr(drum_kit_service_module, "_ACTIVE_KIT_STATE_PATH", active_kit_state_path)
    monkeypatch.setattr(drum_kit_service_module, "get_audio_engine", lambda: fake_engine_service)
    drum_kit_service_module.DrumKitService.reset_instance()
    return drum_kit_service_module.get_drum_kit_service(), factory_dir, user_dir, active_kit_state_path, fake_engine


def test_drum_kit_service_indexes_factory_and_user_kits(tmp_path, monkeypatch):
    service, factory_dir, user_dir, _, _ = _build_service(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one", source_name="Factory One")
    _write_kit(user_dir, "user_one", source_name="User One")

    kits = service.list_kits()

    assert [kit["kit_id"] for kit in kits] == ["factory_one", "user_one"]
    assert kits[0]["source"] == "factory"
    assert kits[1]["source"] == "user"


def test_drum_kit_service_loads_kit_into_engine_and_persists_active_selection(tmp_path, monkeypatch):
    service, factory_dir, _, active_kit_state_path, fake_engine = _build_service(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one", source_name="Factory One")
    fake_engine.position["is_playing"] = True

    payload = service.load_kit("factory_one")

    assert payload["status"] == "ok"
    assert payload["loaded_pad_count"] == 16
    assert len(fake_engine.loaded_sfzs) == 16
    assert fake_engine.pad_notes[0] == (0, 36)
    assert fake_engine.pad_buses[7] == (7, 7)
    assert fake_engine.transport_calls == [False, True]
    assert json.loads(active_kit_state_path.read_text())["kit_id"] == "factory_one"
    assert service.get_active_kit()["kit_id"] == "factory_one"


def test_drum_kit_service_creates_user_kit_from_template(tmp_path, monkeypatch):
    service, factory_dir, user_dir, _, _ = _build_service(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one", source_name="Factory One")

    created = service.create_user_kit(
        "factory_one",
        "custom_copy",
        name="Custom Copy",
        description="Customized",
        author="User",
    )

    assert created["kit_id"] == "custom_copy"
    assert created["name"] == "Custom Copy"
    assert created["source"] == "user"
    manifest = json.loads((user_dir / "custom_copy" / "kit.json").read_text())
    assert manifest["author"] == "User"
    assert (user_dir / "custom_copy" / "pad_0.sfz").exists()


def test_drum_kit_service_imports_user_kit_archive(tmp_path, monkeypatch):
    service, _, user_dir, _, _ = _build_service(tmp_path, monkeypatch)
    import_root = tmp_path / "archive_source"
    kit_root = _write_kit(import_root, "imported_kit", source_name="Imported Kit")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for file_path in kit_root.rglob("*"):
            archive.write(file_path, file_path.relative_to(kit_root.parent))

    imported = service.import_user_kit_archive(buffer.getvalue(), filename="imported_kit.zip")

    assert imported["kit_id"] == "imported_kit"
    assert imported["source"] == "user"
    assert (user_dir / "imported_kit" / "kit.json").exists()


def test_drum_kit_service_rejects_invalid_archive_member_paths(tmp_path, monkeypatch):
    service, _, _, _, _ = _build_service(tmp_path, monkeypatch)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../escape.txt", "bad")

    with pytest.raises(ValueError, match="Invalid archive member path"):
        service.import_user_kit_archive(buffer.getvalue(), filename="bad.zip")
