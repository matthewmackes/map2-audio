"""T2431-C: Map2Paths platform path authority.

Covers: plane roots, per-plane path accessors, env override behaviour,
diagnostic summary, and user-plane directory creation. The assertions keep
the mapping between each canonical path and its plane locked, so future
subtasks can rely on the tree without inspecting every call site.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.paths import Map2Paths


# ---------------------------------------------------------------------------
# plane root defaults
# ---------------------------------------------------------------------------

def test_default_plane_roots(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_HOST_CONFIG_DIR", raising=False)
    monkeypatch.delenv("MAP2_SERVICE_STATE_DIR", raising=False)
    monkeypatch.delenv("MAP2_USER_DIR", raising=False)
    assert Map2Paths.host_config_dir() == Path("/etc/map2")
    assert Map2Paths.service_state_dir() == Path("/var/lib/map2")
    assert Map2Paths.user_dir() == Path("~/.map2").expanduser()


def test_env_overrides_redirect_every_plane(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    host = tmp_path / "etc"
    service = tmp_path / "var"
    user = tmp_path / "home"
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(host))
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(service))
    monkeypatch.setenv("MAP2_USER_DIR", str(user))

    # Every downstream path follows its plane root.
    assert Map2Paths.host_config_dir() == host
    assert Map2Paths.node_identity_path() == host / "node-identity.json"
    assert Map2Paths.ssl_dir() == host / "ssl"
    assert Map2Paths.ca_cert_path() == host / "ssl" / "ca-cert.pem"

    assert Map2Paths.service_state_dir() == service
    assert Map2Paths.cluster_db_path() == service / "cluster.db"
    assert Map2Paths.backups_dir() == service / "backups"

    assert Map2Paths.user_dir() == user
    assert Map2Paths.midi_routes_path() == user / "midi_routes.json"


# ---------------------------------------------------------------------------
# plane classification — each canonical path belongs to exactly one plane
# ---------------------------------------------------------------------------

HOST_PATHS = [
    "node_identity_path",
    "node_conf_path",
    "node_conf_backup_path",
    "host_environment_path",
    "host_mode_json_path",
    "trust_dir",
    "trusted_nodes_path",
    "ssl_dir",
    "ssh_dir",
    "ca_cert_path",
    "node_cert_path",
    "node_key_path",
]

SERVICE_PATHS = [
    "cluster_db_path",
    "cluster_config_database_path",
    "platform_events_db_path",
    "legacy_cluster_events_db_path",
    "backups_dir",
    "config_repo_dir",
    "config_distribution_dir",
    "config_manager_history_path",
    "ztp_marker_path",
    "lifecycle_dir",
    "nam_library_dir",
    "lv2_library_dir",
    "ir_cabinets_library_dir",
    "ir_reverbs_library_dir",
    "presets_dir",
    "presets_pre_restore_dir",
    "secrets_salt_path",
]

USER_PATHS = [
    "user_sessions_dir",
    "user_ir_download_state_path",
    "user_soundfont_download_state_path",
    "midi_routes_path",
    "midi_hub_event_lists_path",
    "midi_hub_macros_path",
    "midi_hub_message_mapper_path",
    "midi_hub_scheduler_path",
    "midi_hub_presets_path",
    "midi_hub_recordings_dir",
    "midi_hub_traffic_exports_dir",
    "midi_scripts_registry_path",
    "midi_scripts_state_path",
]


def _assert_under(method_name: str, plane_root: Path) -> None:
    resolved: Path = getattr(Map2Paths, method_name)()
    # is_relative_to appeared in 3.9; fall back to string prefix for safety.
    try:
        assert resolved.is_relative_to(plane_root), (
            f"{method_name}() -> {resolved} not under {plane_root}"
        )
    except AttributeError:  # pragma: no cover — Python < 3.9
        assert str(resolved).startswith(str(plane_root))


def test_host_plane_paths_resolve_under_host_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    host = tmp_path / "etc-map2"
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(host))
    monkeypatch.delenv("MAP2_SERVICE_STATE_DIR", raising=False)
    monkeypatch.delenv("MAP2_USER_DIR", raising=False)
    for method in HOST_PATHS:
        _assert_under(method, host)


def test_service_plane_paths_resolve_under_service_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    service = tmp_path / "var-map2"
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(service))
    monkeypatch.delenv("MAP2_HOST_CONFIG_DIR", raising=False)
    monkeypatch.delenv("MAP2_USER_DIR", raising=False)
    for method in SERVICE_PATHS:
        _assert_under(method, service)


def test_user_plane_paths_resolve_under_user_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    user = tmp_path / "home-map2"
    monkeypatch.setenv("MAP2_USER_DIR", str(user))
    monkeypatch.delenv("MAP2_HOST_CONFIG_DIR", raising=False)
    monkeypatch.delenv("MAP2_SERVICE_STATE_DIR", raising=False)
    for method in USER_PATHS:
        _assert_under(method, user)


def test_no_path_crosses_planes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Sanity — host paths must not leak into service or user roots, etc."""
    host = tmp_path / "H"
    service = tmp_path / "S"
    user = tmp_path / "U"
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(host))
    monkeypatch.setenv("MAP2_SERVICE_STATE_DIR", str(service))
    monkeypatch.setenv("MAP2_USER_DIR", str(user))
    for method in HOST_PATHS:
        resolved = getattr(Map2Paths, method)()
        assert not str(resolved).startswith(str(service))
        assert not str(resolved).startswith(str(user))
    for method in SERVICE_PATHS:
        resolved = getattr(Map2Paths, method)()
        assert not str(resolved).startswith(str(host))
        assert not str(resolved).startswith(str(user))
    for method in USER_PATHS:
        resolved = getattr(Map2Paths, method)()
        assert not str(resolved).startswith(str(host))
        assert not str(resolved).startswith(str(service))


# ---------------------------------------------------------------------------
# diagnostics + lifecycle
# ---------------------------------------------------------------------------

def test_plane_summary_reports_overrides(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    host = tmp_path / "etc"
    monkeypatch.setenv("MAP2_HOST_CONFIG_DIR", str(host))
    monkeypatch.delenv("MAP2_SERVICE_STATE_DIR", raising=False)
    monkeypatch.delenv("MAP2_USER_DIR", raising=False)

    summary = Map2Paths.plane_summary()
    assert summary["host"]["override_active"] is True
    assert summary["host"]["root"] == str(host)
    assert summary["host"]["override_env_var"] == "MAP2_HOST_CONFIG_DIR"

    assert summary["service"]["override_active"] is False
    assert summary["service"]["root"] == "/var/lib/map2"

    assert summary["user"]["override_active"] is False
    assert summary["user"]["root"] == str(Path("~/.map2").expanduser())


def test_ensure_user_directories_creates_the_user_plane_tree(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    user = tmp_path / "home-user"
    monkeypatch.setenv("MAP2_USER_DIR", str(user))

    assert not user.exists()
    Map2Paths.ensure_user_directories()

    assert user.is_dir()
    assert Map2Paths.user_sessions_dir().is_dir()
    assert Map2Paths.midi_hub_recordings_dir().is_dir()
    assert Map2Paths.midi_hub_traffic_exports_dir().is_dir()
    assert Map2Paths.midi_hub_presets_path().parent.is_dir()
    assert Map2Paths.midi_scripts_registry_path().parent.is_dir()
