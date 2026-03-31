from app.services.push_surface import config as push_config


def test_load_merges_runtime_overrides_without_losing_persisted_values(monkeypatch, tmp_path):
    config_path = tmp_path / "push_surface.json"
    push_config.PushSurfaceConfig(
        input_port_name="Push MIDI In",
        output_port_name="Push MIDI Out",
        bank_size=8,
    ).save(config_path)

    monkeypatch.setattr(
        push_config,
        "_load_runtime_config_overrides",
        lambda _defaults: {
            "enabled": True,
            "bank_size": 6,
            "default_bridge": "rest",
        },
    )

    loaded = push_config.PushSurfaceConfig.load(config_path)

    assert loaded.enabled is True
    assert loaded.bank_size == 6
    assert loaded.default_bridge == "rest"
    assert loaded.input_port_name == "Push MIDI In"
    assert loaded.output_port_name == "Push MIDI Out"


def test_runtime_config_payload_contains_documented_shared_fields():
    payload = push_config.PushSurfaceConfig(enabled=True, bank_size=5).runtime_config_payload()

    assert payload["enabled"] is True
    assert payload["bank_size"] == 5
    assert "category_colors" not in payload
