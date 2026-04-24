from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from app.config import ConfigManager


@pytest.fixture()
def manager(tmp_path: Path) -> ConfigManager:
    return ConfigManager(config_path=tmp_path / "config.json")


def test_locked_tier_a_setting_rejects_runtime_update(manager: ConfigManager) -> None:
    with pytest.raises(ValueError):
        manager.set("audio.sample_rate", 44100, save=False)


def test_list_setting_rejects_invalid_element_type(manager: ConfigManager) -> None:
    assert manager.set("audio.allowed_rates_hz", [48000, 96000], save=False) is True
    assert manager.set("audio.allowed_rates_hz", [48000, "96000"], save=False) is True
    assert manager.get("audio.allowed_rates_hz") == [48000, 96000]


def test_schema_surfaces_locked_and_element_type_metadata(manager: ConfigManager) -> None:
    schema = manager.get_schema()
    assert schema["audio.sample_rate"]["locked"] is True
    assert schema["audio.allowed_rates_hz"]["element_type"] == "int"
    assert schema["clock_sync.selected_profile"]["default"] == "pipewire_quantum_48k"
    assert schema["preset_converter.vst2_legacy_enabled"]["default"] is False
    assert schema["preset_converter.vst2_legacy_enabled"]["env_var"] == "MAP2_PRESET_CONVERTER_VST2_LEGACY_ENABLED"
    assert "audio.engine" not in schema
    assert "audio.allow_python_io" not in schema
    assert "audio.sync_profile" not in schema

    option = manager.get_option_info("clock_sync.remarks")
    assert option == {
        "key": "clock_sync.remarks",
        "default": [],
        "description": "Operator/AI remarks explaining current synchronization strategy",
        "type": "list",
        "current": [],
        "locked": False,
        "element_type": "str",
        "plane": "legacy",
        "owner": None,
        "runtime_mutable": True,
        "startup": "optional",
        "projection_of": None,
        "authority_notes": None,
    }

    # T2431-B classified Tier A locks — spot-check authority metadata surfaces
    assert schema["audio.sample_rate"]["plane"] == "host"
    assert schema["audio.sample_rate"]["owner"] == "audio-engine"
    assert schema["audio.sample_rate"]["runtime_mutable"] is False
    assert schema["audio.sample_rate"]["startup"] == "critical"
    assert schema["audio.buffer_size"]["plane"] == "host"
    assert schema["audio.buffer_size"]["runtime_mutable"] is False
    assert schema["audio.backend"]["plane"] == "host"


def test_sensitive_option_info_masks_default_and_current(manager: ConfigManager) -> None:
    assert manager.set("tesira.ssh_password", "super-secret", save=False) is True

    schema = manager.get_schema()
    option = manager.get_option_info("tesira.ssh_password")

    assert schema["tesira.ssh_password"]["default"] == "***"
    assert option == {
        "key": "tesira.ssh_password",
        "default": "***",
        "description": "Tesira SSH password (used if ssh_credentials is not provided)",
        "type": "str",
        "current": "***",
        "locked": False,
        "element_type": None,
        "plane": "legacy",
        "owner": None,
        "runtime_mutable": True,
        "startup": "optional",
        "projection_of": None,
        "authority_notes": None,
    }


def test_none_value_validates_without_type_or_choice_errors(manager: ConfigManager) -> None:
    assert manager.set("node.display_label", None, save=False) is True
    assert manager.get("node.display_label") is None


def test_config_load_migrates_retired_audio_engine_and_clock_keys(tmp_path: Path) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "audio": {
                    "engine": "python",
                    "allow_python_io": True,
                    "sync_profile": "spdif_master_48k",
                    "sample_rate": 48000,
                }
            }
        ),
        encoding="utf-8",
    )

    manager = ConfigManager(config_path=config_path)

    assert manager.get("audio.engine") is None
    assert manager.get("audio.allow_python_io") is None
    assert manager.get("audio.sync_profile") is None
    assert manager.get("clock_sync.selected_profile") == "spdif_master_48k"
    assert manager.get("audio.sample_rate") == 48000

    persisted = json.loads(config_path.read_text(encoding="utf-8"))
    assert "engine" not in persisted.get("audio", {})
    assert "allow_python_io" not in persisted.get("audio", {})
    assert "sync_profile" not in persisted.get("audio", {})
    assert persisted["clock_sync"]["selected_profile"] == "spdif_master_48k"


def test_config_load_migrates_retired_clock_profile_default(tmp_path: Path) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({"clock_sync": {"selected_profile": "legacy_fixed_48k"}}),
        encoding="utf-8",
    )

    manager = ConfigManager(config_path=config_path)

    assert manager.get("clock_sync.selected_profile") == "pipewire_quantum_48k"
    persisted = json.loads(config_path.read_text(encoding="utf-8"))
    assert persisted["clock_sync"]["selected_profile"] == "pipewire_quantum_48k"


def test_config_load_migrates_legacy_avdecc_enabled_key(tmp_path: Path) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text(
        json.dumps({"avdecc": {"enabled": "true"}}),
        encoding="utf-8",
    )

    manager = ConfigManager(config_path=config_path)

    assert manager.get("avb.avdecc_enabled") is True
    assert manager.get("avdecc.enabled") is None

    persisted = json.loads(config_path.read_text(encoding="utf-8"))
    assert persisted["avb"]["avdecc_enabled"] is True
    assert "avdecc" not in persisted


def test_observer_notification_uses_snapshot_when_callbacks_mutate_observers(manager: ConfigManager) -> None:
    seen: list[str] = []

    def _self_removing(_key, _old, _new):
        seen.append("self")
        manager.remove_observer("node.*", _self_removing)

    def _adding(_key, _old, _new):
        seen.append("add")
        manager.add_observer("node.*", lambda *_args: seen.append("late"))

    manager.add_observer("node.*", _self_removing)
    manager.add_observer("node.*", _adding)

    assert manager.set("node.display_label", "stage-left", save=False) is True
    assert seen == ["self", "add"]


def test_get_instance_singleton_is_guarded(monkeypatch, tmp_path: Path) -> None:
    original_instance = ConfigManager._instance
    original_file = ConfigManager.CONFIG_FILE
    original_dir = ConfigManager.CONFIG_DIR
    try:
        ConfigManager._instance = None
        ConfigManager.CONFIG_DIR = tmp_path
        ConfigManager.CONFIG_FILE = tmp_path / "config.json"

        seen = []

        def _worker():
            seen.append(id(ConfigManager.get_instance()))

        threads = [threading.Thread(target=_worker) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=0.5)

        assert len(set(seen)) == 1
    finally:
        ConfigManager._instance = original_instance
        ConfigManager.CONFIG_FILE = original_file
        ConfigManager.CONFIG_DIR = original_dir
