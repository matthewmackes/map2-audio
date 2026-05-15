"""T2529-E5 cycle 18 — map2-self-test --full CI-gate contract.

Locks the `--full` mode of scripts/self_test.py so a future operator-only
edit can't silently drop the T2529 install-layout verification.

`map2-self-test --full` runs after `dnf install map2` and verifies:
  - The map2 system service user exists
  - The four FHS state dirs exist with map2:map2 ownership + correct modes
  - The /opt/map2-audio app tree is in place
  - Each map2-*.service unit is installed
  - The sysusers.d + tmpfiles.d declarative sources are installed
  - Map2Paths resolves to the canonical FHS roots

The CI Fedora 41 job runs `map2-self-test --full` on every push (E3).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SELF_TEST = REPO_ROOT / "scripts" / "self_test.py"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "t2529-install-matrix.yml"


# ---------------------------------------------------------------------------
# Self-test script structure
# ---------------------------------------------------------------------------


def test_self_test_exists() -> None:
    assert SELF_TEST.is_file(), f"missing self-test at {SELF_TEST}"


def test_self_test_has_full_flag() -> None:
    """The --full flag must exist + must be documented in help text."""
    text = SELF_TEST.read_text()
    assert '"--full"' in text or "'--full'" in text, (
        "self_test.py must declare a --full flag (T2529-E5 gate)"
    )
    assert "T2529-E5" in text, (
        "self_test.py must reference T2529-E5 (so a future operator can "
        "trace why the --full flag exists)"
    )


def test_self_test_full_mode_includes_install_layout_test() -> None:
    """--full must include test_t2529_install_layout in the test set."""
    text = SELF_TEST.read_text()
    assert "test_t2529_install_layout" in text, (
        "self_test.py --full must include test_t2529_install_layout"
    )
    assert "test_t2529_paths_resolve" in text, (
        "self_test.py --full must include test_t2529_paths_resolve"
    )


# ---------------------------------------------------------------------------
# test_t2529_install_layout shape
# ---------------------------------------------------------------------------


def test_install_layout_checks_user_pwd_entry() -> None:
    """The test must call pwd.getpwnam('map2') so a missing user fails fast."""
    text = SELF_TEST.read_text()
    assert 'pwd.getpwnam("map2")' in text, (
        "test_t2529_install_layout must verify the map2 user via pwd.getpwnam"
    )


def test_install_layout_checks_shell_is_nologin() -> None:
    """The map2 user shell must be /sbin/nologin per Q1 lock."""
    text = SELF_TEST.read_text()
    assert "/sbin/nologin" in text, (
        "test_t2529_install_layout must verify shell=/sbin/nologin (Q1 lock)"
    )


def test_install_layout_checks_each_fhs_dir() -> None:
    """All four canonical FHS state dirs must be checked."""
    text = SELF_TEST.read_text()
    for fhs_dir in ("/var/lib/map2", "/var/cache/map2", "/var/log/map2", "/run/map2"):
        assert fhs_dir in text, (
            f"test_t2529_install_layout must check {fhs_dir}"
        )


def test_install_layout_checks_var_log_mode_is_0750() -> None:
    """/var/log/map2 must be mode 0750 (group-only read), not 0755."""
    text = SELF_TEST.read_text()
    # The test should reference 0o750 specifically as the expected mode
    # for /var/log/map2.
    assert "0o750" in text, (
        "test_t2529_install_layout must verify /var/log/map2 mode = 0o750"
    )


def test_install_layout_checks_systemd_units() -> None:
    """Each shipped service unit must be checked."""
    text = SELF_TEST.read_text()
    for unit in (
        "map2-backend.service",
        "map2-tui.service",
        "map2-controller-host.service",
        "map2-sonobus-transport.service",
    ):
        assert unit in text, (
            f"test_t2529_install_layout must check {unit}"
        )


def test_install_layout_checks_declarative_sources() -> None:
    """sysusers.d + tmpfiles.d declarative sources must be checked."""
    text = SELF_TEST.read_text()
    assert "sysusers.d/map2.conf" in text, (
        "test_t2529_install_layout must check /usr/lib/sysusers.d/map2.conf"
    )
    assert "tmpfiles.d/map2.conf" in text, (
        "test_t2529_install_layout must check /usr/lib/tmpfiles.d/map2.conf"
    )


def test_install_layout_skips_on_dev_host() -> None:
    """When MAP2_APP_INSTALL_DIR is set (dev-host), the test must skip
    gracefully — the dev-host has a different layout by design."""
    text = SELF_TEST.read_text()
    assert "MAP2_APP_INSTALL_DIR" in text, (
        "test_t2529_install_layout must skip on dev-host (MAP2_APP_INSTALL_DIR set)"
    )
    assert "Skipping" in text or "skipped" in text, (
        "test_t2529_install_layout must announce the skip when dev-host"
    )


# ---------------------------------------------------------------------------
# test_t2529_paths_resolve shape
# ---------------------------------------------------------------------------


def test_paths_resolve_checks_app_install_dir() -> None:
    text = SELF_TEST.read_text()
    assert "app_install_dir" in text, (
        "test_t2529_paths_resolve must check Map2Paths.app_install_dir()"
    )
    assert "/opt/map2-audio" in text, (
        "test_t2529_paths_resolve must expect /opt/map2-audio default"
    )


def test_paths_resolve_checks_is_fhs_install() -> None:
    text = SELF_TEST.read_text()
    assert "is_fhs_install" in text, (
        "test_t2529_paths_resolve must check Map2Paths.is_fhs_install()"
    )


# ---------------------------------------------------------------------------
# CI wiring: the Fedora job must invoke `map2-self-test --full`
# ---------------------------------------------------------------------------


def test_ci_workflow_runs_self_test_full() -> None:
    """The T2529-E3 Fedora 41 job must invoke `map2-self-test --full`
    after dnf install, so install regressions blow up CI."""
    text = WORKFLOW.read_text()
    assert "map2-self-test --full" in text, (
        "CI workflow must invoke `map2-self-test --full` after dnf install "
        "(T2529-E5 gate)"
    )
    assert "T2529-E5" in text, (
        "CI workflow must reference T2529-E5 anchor on the self-test step"
    )


# ---------------------------------------------------------------------------
# The self_test script must be runnable (`python3 scripts/self_test.py --help`)
# even on dev-host — verify the script parses without import errors.
# ---------------------------------------------------------------------------


def test_self_test_help_runs() -> None:
    """`python3 scripts/self_test.py --help` must succeed (no import errors)."""
    env = dict(os.environ)
    # Force dev-host mode so the test doesn't try to import every backend
    # module. We just want to verify the script parses + argparse works.
    env["MAP2_APP_INSTALL_DIR"] = str(REPO_ROOT)
    result = subprocess.run(
        [sys.executable, str(SELF_TEST), "--help"],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    assert result.returncode == 0, (
        f"self_test.py --help failed; stderr:\n{result.stderr}"
    )
    assert "--full" in result.stdout, (
        f"self_test.py --help output must mention --full; got:\n{result.stdout}"
    )
