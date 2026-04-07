from __future__ import annotations

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
    assert manager.set("audio.allowed_rates_hz", [48000, "96000"], save=False) is False
    assert manager.get("audio.allowed_rates_hz") == [48000, 96000]


def test_schema_surfaces_locked_and_element_type_metadata(manager: ConfigManager) -> None:
    schema = manager.get_schema()
    assert schema["audio.sample_rate"]["locked"] is True
    assert schema["audio.allowed_rates_hz"]["element_type"] == "int"

    option = manager.get_option_info("clock_sync.remarks")
    assert option == {
        "key": "clock_sync.remarks",
        "default": [],
        "description": "Operator/AI remarks explaining current synchronization strategy",
        "type": "list",
        "current": [],
        "locked": False,
        "element_type": "str",
    }
