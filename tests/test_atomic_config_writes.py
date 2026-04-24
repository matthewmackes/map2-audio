from __future__ import annotations

import json
from datetime import datetime, timezone

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


def test_deployment_config_set_mode_writes_authority_atomically(tmp_path, monkeypatch):
    """T2437-B phase 2: DeploymentConfig.save() is a no-op; set_mode()
    writes the authority file (/etc/map2/mode.json) atomically. Verify the
    authority write uses os.replace just like the ConfigManager path."""
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(tmp_path / "etc"))
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(tmp_path / "var"))
    # Reset the module-level authority singleton so it picks up our override.
    from app.deployment import authority as authority_module
    authority_module.reset_deployment_mode_authority()

    config = DeploymentConfig(config_dir=str(tmp_path))

    seen = []
    real_replace = __import__("os").replace

    def _replace(src, dst):
        seen.append((src, dst))
        return real_replace(src, dst)

    # The atomic replace happens inside app.deployment.authority.atomic_write_bytes.
    monkeypatch.setattr("app.deployment.authority.os.replace", _replace)

    config.set_mode(DeploymentMode.CONTROL_NODE)

    # set_mode writes the authority payload + regenerates the env projection.
    # Both use atomic replace — expect at least one call.
    assert len(seen) >= 1
    authority_path = tmp_path / "etc" / "mode.json"
    assert authority_path.exists()
    payload = json.loads(authority_path.read_text(encoding="utf-8"))
    assert payload["mode"] == "CONTROL-NODE"
    # The legacy ~/.map2/deployment.json mirror must NOT be rewritten.
    assert not config.config_file.exists()


def test_deployment_config_save_is_noop_after_T2437B(tmp_path, monkeypatch):
    """DeploymentConfig.save() is retained as a no-op so any external
    caller does not crash; verify it does not write the legacy mirror."""
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(tmp_path / "etc"))
    from app.deployment import authority as authority_module
    authority_module.reset_deployment_mode_authority()

    config = DeploymentConfig(config_dir=str(tmp_path))
    config.save()
    assert not config.config_file.exists()


def test_deployment_config_uses_utc_metadata_timestamps(tmp_path):
    config = DeploymentConfig(config_dir=str(tmp_path))

    created_at = datetime.fromisoformat(config.created_at)
    updated_at = datetime.fromisoformat(config.updated_at)

    assert created_at.tzinfo == timezone.utc
    assert updated_at.tzinfo == timezone.utc
