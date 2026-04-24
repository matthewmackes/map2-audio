from types import SimpleNamespace

import pytest

from app.services import runtime_profiles


def _mode(value: str):
    return SimpleNamespace(mode=SimpleNamespace(value=value))


def _set_mode(monkeypatch, mode: str) -> None:
    """Lock `get_node_type()` to `mode` across the T2437 resolve chain."""
    from app.deployment import authority as authority_module

    monkeypatch.setattr(authority_module, "resolve_deployment_mode", lambda **_: mode)
    monkeypatch.setattr(runtime_profiles, "get_deployment_config", lambda: _mode(mode))


def test_audio_node_defaults_to_performance(monkeypatch):
    _set_mode(monkeypatch, "AUDIO-NODE")
    monkeypatch.setattr(runtime_profiles, "config_get", lambda key, default=None: default)

    status = runtime_profiles.get_runtime_profile_status()

    assert status["node_type"] == "AUDIO-NODE"
    assert status["audio_capable"] is True
    assert status["default_profile"] == "Performance"
    assert status["current_profile"] == "Performance"


def test_control_node_is_control_only(monkeypatch):
    _set_mode(monkeypatch, "CONTROL-NODE")
    monkeypatch.setattr(runtime_profiles, "config_get", lambda key, default=None: default)

    status = runtime_profiles.get_runtime_profile_status()

    assert status["audio_capable"] is False
    assert status["supported_profiles"] == ["N/A"]
    assert status["current_profile"] == "N/A"
    assert status["profile_policy"]["graph_mutation_policy"] == "disabled"


def test_apply_runtime_profile_persists_policy(monkeypatch):
    _set_mode(monkeypatch, "AUDIO-NODE")
    monkeypatch.setattr(runtime_profiles, "config_get", lambda key, default=None: default)
    persisted = {}
    monkeypatch.setattr(runtime_profiles, "config_set", lambda key, value: persisted.setdefault(key, value) or True)

    applied = runtime_profiles.apply_runtime_profile("Performance")

    assert applied["applied_profile"] == "Performance"
    assert persisted["audio.runtime_profile"] == "Performance"
    assert persisted["audio.graph_mutation_policy"] == "frozen"
    assert persisted["plugins.effect_residency"] is True
    assert persisted["plugins.allow_plugin_churn"] is False


def test_apply_runtime_profile_rejects_control_node(monkeypatch):
    _set_mode(monkeypatch, "CONTROL-NODE")
    monkeypatch.setattr(runtime_profiles, "config_get", lambda key, default=None: default)

    with pytest.raises(ValueError):
        runtime_profiles.apply_runtime_profile("Performance")
