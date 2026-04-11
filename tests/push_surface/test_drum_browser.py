from __future__ import annotations

import json
from pathlib import Path

from app.services import drum_kit_service as drum_kit_service_module
from app.services.push_surface import drum_browser as drum_browser_module


class _FakeDrumKitEngine:
    def __init__(self) -> None:
        self.loaded_sfzs: list[tuple[int, str]] = []
        self.position = {"is_playing": False}

    def load_drum_pad_sfz(self, pad_index, sfz_path):
        self.loaded_sfzs.append((pad_index, sfz_path))
        return True

    def set_drum_pad_note(self, *_args):
        return True

    def set_drum_pad_volume(self, *_args):
        return True

    def set_drum_pad_pan(self, *_args):
        return True

    def set_drum_pad_tune(self, *_args):
        return True

    def set_drum_pad_bus(self, *_args):
        return True

    def set_drum_transport_playing(self, is_playing):
        self.position["is_playing"] = is_playing
        return True

    def get_drum_sequencer_position(self):
        return dict(self.position)

    def get_drum_kit_status(self):
        return {f"pad_{index}": {"loaded": True} for index in range(16)}


def _write_kit(root: Path, kit_id: str, *, name: str, category: str) -> Path:
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
                "name": f"{name} Pad {index + 1}",
                "sfz_path": sfz_name,
                "default_note": 36 + index,
                "bus_assignment": index % 8,
                "default_volume": 0.5,
                "default_pan": 0.0,
                "default_tune": 0.0,
            }
        )
    (kit_root / "kit.json").write_text(
        json.dumps(
            {
                "kit_id": kit_id,
                "name": name,
                "description": f"{name} description",
                "author": "Tests",
                "version": 1,
                "category": category,
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


def _build_browser(tmp_path, monkeypatch):
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
    drum_browser_module.reset_push_drum_browser_service()
    return drum_browser_module.get_push_drum_browser_service(), drum_kit_service_module.get_drum_kit_service(), factory_dir, user_dir


def test_push_drum_browser_singleton_getter_resets_between_runs(tmp_path, monkeypatch):
    first, *_ = _build_browser(tmp_path, monkeypatch)
    second = drum_browser_module.get_push_drum_browser_service()
    assert first is second

    drum_browser_module.reset_push_drum_browser_service()
    replacement = drum_browser_module.get_push_drum_browser_service()
    assert replacement is not first


def test_push_drum_browser_lists_kits_and_kit_instruments(tmp_path, monkeypatch):
    browser, _kit_service, factory_dir, _user_dir = _build_browser(tmp_path, monkeypatch)
    _write_kit(factory_dir, "acoustic_one", name="Acoustic One", category="acoustic")
    _write_kit(factory_dir, "electronic_one", name="Electronic One", category="electronic")

    root = browser.browse()
    filtered = browser.browse({"category": "electronic"})
    kit_view = browser.browse({"kit_id": "electronic_one"})

    assert [item["id"] for item in root["items"]] == ["acoustic_one", "electronic_one"]
    assert filtered["categories"] == ["all", "acoustic", "electronic"]
    assert [item["id"] for item in filtered["items"]] == ["electronic_one"]
    assert kit_view["scope"] == "kit"
    assert kit_view["kit"]["id"] == "electronic_one"
    assert kit_view["preview"]["id"] == "electronic_one::pad::0"
    assert len(kit_view["items"]) == 16


def test_push_drum_browser_loads_foreign_kit_pad_into_editable_active_kit(tmp_path, monkeypatch):
    browser, kit_service, factory_dir, user_dir = _build_browser(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one", name="Factory One", category="acoustic")
    _write_kit(factory_dir, "factory_two", name="Factory Two", category="electronic")
    kit_service.load_kit("factory_one")

    payload = browser.load({"kit_id": "factory_two", "source_pad": 3, "pad": 5})

    editable_root = user_dir / "factory_one_editable"
    editable_manifest = json.loads((editable_root / "kit.json").read_text())

    assert payload["mode"] == "pad"
    assert payload["active_kit_id"] == "factory_one_editable"
    assert editable_manifest["instruments"][5]["name"] == "Factory Two Pad 4"
    assert editable_manifest["instruments"][5]["sfz_path"].startswith("imports/factory_two/pad_6/")
    assert (editable_root / editable_manifest["instruments"][5]["sfz_path"]).exists()
    assert (editable_root / "imports" / "factory_two" / "pad_6" / "samples" / "pad_3.wav").exists()


def test_push_drum_browser_tracks_projection_metadata_for_favorites_and_recent(tmp_path, monkeypatch):
    browser, kit_service, factory_dir, _user_dir = _build_browser(tmp_path, monkeypatch)
    _write_kit(factory_dir, "factory_one", name="Factory One", category="acoustic")
    _write_kit(factory_dir, "factory_two", name="Factory Two", category="electronic")
    kit_service.load_kit("factory_one")

    browser.browse({"action": "toggle_favorite", "item_id": "factory_two"})
    favorites = browser.browse({"shortcut": "favorites"})
    load_result = browser.load({"kit_id": "factory_two"})
    recent = browser.browse({"shortcut": "recent"})

    assert favorites["items"][0]["id"] == "factory_two"
    assert favorites["metadata"]["favorites"] == ["factory_two"]
    assert load_result["metadata"]["recent"] == ["factory_two"]
    assert recent["items"][0]["id"] == "factory_two"
    assert recent["metadata"]["quick_shortcuts"][0] == {"kind": "favorite", "item_id": "factory_two"}
    assert recent["metadata"]["quick_shortcuts"][1] == {"kind": "recent", "item_id": "factory_two"}
    assert recent["metadata"]["last_browse_payload"] == {"shortcut": "recent"}
