from __future__ import annotations

import json

from app.config import ConfigManager
from app.deployment.deployment import DeploymentConfig, DeploymentMode


def test_config_manager_save_uses_atomic_replace(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    config_path.write_text('{"existing": true}', encoding="utf-8")

    manager = ConfigManager(config_path=config_path)
    manager.config_backup_path = tmp_path / "config.backup.json"
    manager._config = {"audio": {"sample_rate": 48000}}
    manager._dirty = True

    seen = []
    real_replace = __import__("os").replace

    def _replace(src, dst):
        seen.append((src, dst))
        return real_replace(src, dst)

    monkeypatch.setattr("app.config.os.replace", _replace)

    assert manager.save() is True
    assert len(seen) == 1
    src, dst = seen[0]
    assert str(src).startswith(str(tmp_path / ".config.json."))
    assert dst == config_path
    assert json.loads(config_path.read_text(encoding="utf-8")) == {"audio": {"sample_rate": 48000}}


def test_deployment_config_save_uses_atomic_replace(tmp_path, monkeypatch):
    config = DeploymentConfig(config_dir=str(tmp_path))
    config.mode = DeploymentMode.CONTROL_NODE

    seen = []
    real_replace = __import__("os").replace

    def _replace(src, dst):
        seen.append((src, dst))
        return real_replace(src, dst)

    monkeypatch.setattr("app.deployment.deployment.os.replace", _replace)

    config.save()

    assert len(seen) == 1
    src, dst = seen[0]
    assert str(src).startswith(str(tmp_path / ".deployment.json."))
    assert dst == config.config_file
    payload = json.loads(config.config_file.read_text(encoding="utf-8"))
    assert payload["mode"] == "CONTROL-NODE"
