"""T2529-A4 cycle 6-7 — Map2Paths FHS-aware plane extensions.

Locks the four new FHS §3 plane roots (runtime / cache / log / app-install)
on Map2Paths so a future refactor can't silently re-hardcode /home/mm/ or
/opt/map2 anywhere in the platform.

The pre-existing Map2Paths host/service/user planes are exercised by
tests/test_paths.py + tests/test_t2431c_paths_authority.py; this suite
only covers the new T2529 extensions.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.paths import Map2Paths


# ---------------------------------------------------------------------------
# Default plane-root locations match the T2529 Q3 lock
# ---------------------------------------------------------------------------


def test_runtime_dir_default_is_run_map2(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-service runtime dir defaults to /run/map2 (FHS + Q3 lock)."""
    monkeypatch.delenv("MAP2_RUNTIME_DIR", raising=False)
    assert Map2Paths.runtime_dir() == Path("/run/map2")


def test_cache_dir_default_is_var_cache_map2(monkeypatch: pytest.MonkeyPatch) -> None:
    """Cache dir defaults to /var/cache/map2 (FHS §5.5)."""
    monkeypatch.delenv("MAP2_CACHE_DIR", raising=False)
    assert Map2Paths.cache_dir() == Path("/var/cache/map2")


def test_log_dir_default_is_var_log_map2(monkeypatch: pytest.MonkeyPatch) -> None:
    """Log dir defaults to /var/log/map2 (FHS §5.10)."""
    monkeypatch.delenv("MAP2_LOG_DIR", raising=False)
    assert Map2Paths.log_dir() == Path("/var/log/map2")


def test_app_install_dir_default_is_opt_map2_audio(monkeypatch: pytest.MonkeyPatch) -> None:
    """Application install root defaults to /opt/map2-audio (FHS §3.13 + Q3 lock)."""
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.app_install_dir() == Path("/opt/map2-audio")


# ---------------------------------------------------------------------------
# Env-var overrides flip the whole plane atomically
# ---------------------------------------------------------------------------


def test_runtime_dir_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MAP2_RUNTIME_DIR", str(tmp_path / "rt"))
    assert Map2Paths.runtime_dir() == tmp_path / "rt"


def test_cache_dir_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MAP2_CACHE_DIR", str(tmp_path / "cache"))
    assert Map2Paths.cache_dir() == tmp_path / "cache"


def test_log_dir_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("MAP2_LOG_DIR", str(tmp_path / "log"))
    assert Map2Paths.log_dir() == tmp_path / "log"


def test_app_install_dir_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Dev-host can override /opt/map2-audio to its working tree via
    MAP2_APP_INSTALL_DIR — needed for pytest + the engine without an RPM install."""
    monkeypatch.setenv("MAP2_APP_INSTALL_DIR", str(tmp_path / "repo"))
    assert Map2Paths.app_install_dir() == tmp_path / "repo"


# ---------------------------------------------------------------------------
# Derived runtime paths — controller-host + sonobus-transport UDS sockets
# ---------------------------------------------------------------------------


def test_controller_host_socket_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_RUNTIME_DIR", raising=False)
    assert Map2Paths.controller_host_socket_path() == Path("/run/map2/controller-host.sock")


def test_sonobus_transport_socket_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_RUNTIME_DIR", raising=False)
    assert Map2Paths.sonobus_transport_socket_path() == Path("/run/map2/sonobus-transport.sock")


def test_runtime_paths_track_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When MAP2_RUNTIME_DIR is overridden, the derived UDS paths follow."""
    monkeypatch.setenv("MAP2_RUNTIME_DIR", str(tmp_path / "rt"))
    assert Map2Paths.controller_host_socket_path() == tmp_path / "rt" / "controller-host.sock"
    assert Map2Paths.sonobus_transport_socket_path() == tmp_path / "rt" / "sonobus-transport.sock"


# ---------------------------------------------------------------------------
# Derived cache paths — LV2 index, IR thumbnails
# ---------------------------------------------------------------------------


def test_lv2_index_cache_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_CACHE_DIR", raising=False)
    assert Map2Paths.lv2_index_cache_path() == Path("/var/cache/map2/lv2-index.json")


def test_ir_thumbnail_cache_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_CACHE_DIR", raising=False)
    assert Map2Paths.ir_thumbnail_cache_dir() == Path("/var/cache/map2/ir-thumbnails")


# ---------------------------------------------------------------------------
# Derived log paths
# ---------------------------------------------------------------------------


def test_soak_evidence_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_LOG_DIR", raising=False)
    assert Map2Paths.soak_evidence_dir() == Path("/var/log/map2/soak")


# ---------------------------------------------------------------------------
# Derived app-install paths
# ---------------------------------------------------------------------------


def test_juce_engine_build_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.juce_engine_build_dir() == Path("/opt/map2-audio/juce-engine/build")


def test_controller_host_binary_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.controller_host_binary_path() == Path(
        "/opt/map2-audio/juce-engine/build/map2-controller-host"
    )


def test_sonobus_transport_binary_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.sonobus_transport_binary_path() == Path(
        "/opt/map2-audio/juce-engine/build/map2-sonobus-transport"
    )


def test_device_packs_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.device_packs_dir() == Path("/opt/map2-audio/device-packs")


def test_scripts_dir(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.scripts_dir() == Path("/opt/map2-audio/scripts")


def test_app_install_paths_track_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """All derived app-install paths flip atomically when MAP2_APP_INSTALL_DIR
    is overridden — critical for dev-host vs. FHS-install split."""
    monkeypatch.setenv("MAP2_APP_INSTALL_DIR", str(tmp_path / "repo"))
    assert Map2Paths.juce_engine_build_dir() == tmp_path / "repo" / "juce-engine" / "build"
    assert Map2Paths.device_packs_dir() == tmp_path / "repo" / "device-packs"
    assert Map2Paths.scripts_dir() == tmp_path / "repo" / "scripts"


# ---------------------------------------------------------------------------
# Install-layout detection
# ---------------------------------------------------------------------------


def test_is_fhs_install_returns_true_when_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """No override → we're notionally on the FHS-install layout."""
    monkeypatch.delenv("MAP2_APP_INSTALL_DIR", raising=False)
    assert Map2Paths.is_fhs_install() is True


def test_is_fhs_install_returns_false_when_dev_host(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When MAP2_APP_INSTALL_DIR points at a dev-host working tree, we're
    NOT on the FHS install. Used by code that needs to behave differently
    (e.g., the soak runner sets evidence-dir under repo/docs/ when dev)."""
    monkeypatch.setenv("MAP2_APP_INSTALL_DIR", str(tmp_path / "repo"))
    assert Map2Paths.is_fhs_install() is False


# ---------------------------------------------------------------------------
# Plane summary picks up the new FHS planes
# ---------------------------------------------------------------------------


def test_plane_summary_includes_new_planes(monkeypatch: pytest.MonkeyPatch) -> None:
    """T2529-A4: plane_summary() must report the four new FHS planes so
    the `map2 authority doctor` CLI can diagnose runtime/cache/log/app
    issues the same way it does for host/service/user."""
    for env_var in (
        "MAP2_RUNTIME_DIR",
        "MAP2_CACHE_DIR",
        "MAP2_LOG_DIR",
        "MAP2_APP_INSTALL_DIR",
    ):
        monkeypatch.delenv(env_var, raising=False)
    summary = Map2Paths.plane_summary()
    for plane in ("runtime", "cache", "log", "app_install"):
        assert plane in summary, f"plane_summary() missing the {plane!r} plane"
        entry = summary[plane]
        assert "root" in entry and "override_active" in entry, (
            f"plane_summary()[{plane!r}] entry is missing required keys: {entry}"
        )
        assert entry["override_active"] is False, (
            f"plane_summary()[{plane!r}] should show override_active=False when "
            f"no env var is set, got {entry['override_active']}"
        )


def test_plane_summary_shows_active_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """When MAP2_RUNTIME_DIR is set, plane_summary()['runtime']['override_active'] flips."""
    monkeypatch.setenv("MAP2_RUNTIME_DIR", str(tmp_path / "rt"))
    summary = Map2Paths.plane_summary()
    assert summary["runtime"]["override_active"] is True
    assert summary["runtime"]["root"] == str(tmp_path / "rt")


# ---------------------------------------------------------------------------
# No-operator-home invariant: every default plane root is FHS-clean
# ---------------------------------------------------------------------------


def test_no_default_plane_root_is_operator_home(monkeypatch: pytest.MonkeyPatch) -> None:
    """T2529 invariant: no plane root defaults under /home/, /root/, /tmp/.
    Drift here would silently re-introduce the mm-account dependency T2529
    was filed to fix."""
    for env_var in (
        "MAP2_HOST_CONFIG_DIR",
        "MAP2_SERVICE_STATE_DIR",
        "MAP2_USER_DIR",
        "MAP2_RUNTIME_DIR",
        "MAP2_CACHE_DIR",
        "MAP2_LOG_DIR",
        "MAP2_APP_INSTALL_DIR",
    ):
        monkeypatch.delenv(env_var, raising=False)

    candidates = {
        "host": Map2Paths.host_config_dir(),
        "service": Map2Paths.service_state_dir(),
        "runtime": Map2Paths.runtime_dir(),
        "cache": Map2Paths.cache_dir(),
        "log": Map2Paths.log_dir(),
        "app_install": Map2Paths.app_install_dir(),
    }
    # NOTE: user plane defaults to ~/.map2 which is operator-home by design
    # (per-user state) — that's the expected single exception.
    for plane, path in candidates.items():
        s = str(path)
        assert not s.startswith("/home/"), (
            f"plane {plane!r} default ({s}) is under /home/ — T2529 invariant violated"
        )
        assert not s.startswith("/root/"), (
            f"plane {plane!r} default ({s}) is under /root/ — T2529 invariant violated"
        )
        assert not s.startswith("/tmp/"), (
            f"plane {plane!r} default ({s}) is under /tmp/ — T2529 invariant violated"
        )
