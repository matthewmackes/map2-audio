import json
import pytest

from app.services.websocket_manager import ws_manager

from app.services import drum_machine_service as drum_service_module


class _FakeDrumEngine:
    def __init__(self):
        self.master_volume_calls = []
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

    def set_drum_master_volume(self, value):
        self.master_volume_calls.append(value)
        return True

    def get_drum_metering(self):
        return dict(self.metering)


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
    assert position["variation"] == 0
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
