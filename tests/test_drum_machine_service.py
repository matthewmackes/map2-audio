import json

from app.services import drum_machine_service as drum_service_module


def _build_service(tmp_path, monkeypatch):
    factory_dir = tmp_path / "factory"
    generated_dir = tmp_path / "generated"
    state_path = tmp_path / "state.json"
    factory_dir.mkdir()
    generated_dir.mkdir()

    monkeypatch.setattr(drum_service_module, "_FACTORY_PACKS_DIR", factory_dir)
    monkeypatch.setattr(drum_service_module, "_GENERATED_PACKS_DIR", generated_dir)
    monkeypatch.setattr(drum_service_module, "_DEFAULT_STATE_PATH", state_path)
    drum_service_module.DrumMachineService.reset_instance()
    return drum_service_module.get_drum_machine_service(), factory_dir, generated_dir, state_path


def test_drum_machine_service_persists_and_restores_state(tmp_path, monkeypatch):
    service, _, _, state_path = _build_service(tmp_path, monkeypatch)

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
    service, factory_dir, generated_dir, _ = _build_service(tmp_path, monkeypatch)

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
    service, _, _, _ = _build_service(tmp_path, monkeypatch)

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
