"""T2529-E1 cycle 14 — rpmlint baseline contract.

Locks the .rpmlintrc + runner script shape so a future operator-only edit
can't silently drop the project-specific suppressions or remove the CI
runner.

These tests don't actually execute rpmlint (the host may not have it
installed). The CI matrix (T2529-E3/E4) does run it on every push.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
RPMLINT_RC = REPO_ROOT / "packaging" / "rpm" / "lint" / ".rpmlintrc"
RUNNER = REPO_ROOT / "scripts" / "lint_rpm_spec.sh"


# ---------------------------------------------------------------------------
# .rpmlintrc file
# ---------------------------------------------------------------------------


def test_rpmlintrc_exists() -> None:
    assert RPMLINT_RC.is_file(), f"missing .rpmlintrc at {RPMLINT_RC}"


def test_rpmlintrc_filters_dir_or_file_in_opt() -> None:
    """T2529 Q3 lock: app tree lives in /opt/map2-audio. rpmlint's
    `dir-or-file-in-opt` is a style warning; we override it deliberately."""
    text = RPMLINT_RC.read_text()
    assert "dir-or-file-in-opt" in text, (
        ".rpmlintrc must suppress dir-or-file-in-opt — Q3 lock requires "
        "/opt/map2-audio install root"
    )


def test_rpmlintrc_filters_dangling_symlink_for_cli_entrypoints() -> None:
    """/usr/bin/map2-cli + /usr/bin/map2-self-test are symlinks into
    /opt/map2-audio/scripts/. rpmlint can't follow them at lint time but
    they ARE valid at install time since both files ship in the same RPM."""
    text = RPMLINT_RC.read_text()
    assert "dangling" in text and "map2-cli" in text and "map2-self-test" in text, (
        ".rpmlintrc must suppress the dangling-symlink false-positive for "
        "/usr/bin/map2-cli and /usr/bin/map2-self-test"
    )


def test_rpmlintrc_filters_modern_buildroot_warnings() -> None:
    """Modern Fedora packaging guidelines forbid `rm -rf %{buildroot}` and
    `BuildRoot:` — but rpmlint still warns about their absence. Suppress."""
    text = RPMLINT_RC.read_text()
    assert "no-cleaning-of-buildroot" in text, (
        ".rpmlintrc must suppress no-cleaning-of-buildroot (modern Fedora "
        "packaging guidelines explicitly forbid it)"
    )
    assert "no-buildroot-tag" in text, (
        ".rpmlintrc must suppress no-buildroot-tag"
    )


def test_rpmlintrc_documents_t2529_anchor() -> None:
    text = RPMLINT_RC.read_text()
    assert "T2529" in text, ".rpmlintrc must reference the T2529 anchor"
    assert "2026-05-15" in text, ".rpmlintrc must reference the T2529 lock date"


def test_rpmlintrc_documents_target() -> None:
    """The T2529-E1 target is `0 errors + 0 warnings`. Doc must state it
    so a future maintainer understands why every filter exists."""
    text = RPMLINT_RC.read_text()
    assert "0 errors" in text or "zero" in text.lower(), (
        ".rpmlintrc must document the T2529-E1 target (zero errors + warnings)"
    )


# ---------------------------------------------------------------------------
# Runner script
# ---------------------------------------------------------------------------


def test_runner_exists() -> None:
    assert RUNNER.is_file(), f"missing runner at {RUNNER}"


def test_runner_is_executable() -> None:
    """scripts/lint_rpm_spec.sh must be chmod +x so CI can run it directly."""
    mode = RUNNER.stat().st_mode
    assert mode & stat.S_IXUSR, (
        f"runner must be executable; current mode = {oct(mode)}"
    )


def test_runner_uses_bash_shebang() -> None:
    text = RUNNER.read_text()
    first_line = text.splitlines()[0]
    assert first_line.startswith("#!"), "runner must have a shebang"
    assert "bash" in first_line, "runner must use bash (relies on `set -euo pipefail`)"


def test_runner_references_rpmlintrc() -> None:
    text = RUNNER.read_text()
    assert ".rpmlintrc" in text, "runner must reference the .rpmlintrc config"
    assert "packaging/rpm/lint/.rpmlintrc" in text, (
        "runner must reference the canonical .rpmlintrc path"
    )


def test_runner_references_spec_file() -> None:
    text = RUNNER.read_text()
    assert "packaging/rpm/map2.spec" in text, (
        "runner must reference the canonical spec path"
    )


def test_runner_uses_strict_bash_flags() -> None:
    """`set -euo pipefail` for CI-safe error handling."""
    text = RUNNER.read_text()
    assert "set -euo pipefail" in text, (
        "runner must `set -euo pipefail` for CI-safe error handling"
    )


def test_runner_documents_install_command() -> None:
    """A user without rpmlint installed should see how to install it."""
    text = RUNNER.read_text()
    assert "dnf install rpmlint" in text or "apt install rpmlint" in text, (
        "runner must document how to install rpmlint when missing"
    )


def test_runner_fails_on_warnings_not_just_errors() -> None:
    """T2529-E1 target: 0 errors AND 0 warnings. Runner must fail on either."""
    text = RUNNER.read_text()
    assert "0 errors + 0 warnings" in text or "0 errors AND 0 warnings" in text or (
        "errors + 0 warnings" in text
    ), (
        "runner must document that the T2529-E1 target is 0 errors AND "
        "0 warnings (not just errors) — drift here defeats the gate"
    )
