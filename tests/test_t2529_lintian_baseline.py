"""T2529-E2 cycle 15 — cross-distro lintian baseline contract.

Locks the lintian-overrides + alien-conversion runner shape so a future
operator-only edit can't silently drop the cross-distro compliance gate.

The tests don't execute alien or lintian (host may not have them installed).
The CI matrix (T2529-E4 Ubuntu 24.04 job) does run them on every push.
"""

from __future__ import annotations

import stat
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
LINTIAN_OVERRIDES = REPO_ROOT / "packaging" / "deb" / "lint" / "lintian-overrides"
RUNNER = REPO_ROOT / "scripts" / "lint_deb_via_alien.sh"


# ---------------------------------------------------------------------------
# Lintian overrides file
# ---------------------------------------------------------------------------


def test_lintian_overrides_exists() -> None:
    assert LINTIAN_OVERRIDES.is_file(), (
        f"missing lintian overrides at {LINTIAN_OVERRIDES}"
    )


def test_lintian_overrides_suppresses_opt_layout() -> None:
    """Q3 lock places app tree in /opt/map2-audio (FHS §3.13). lintian's
    dir-or-file-in-opt is a style warning; we suppress it deliberately."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "dir-or-file-in-opt" in text, (
        "lintian-overrides must suppress dir-or-file-in-opt — Q3 lock requires "
        "/opt/map2-audio install root"
    )


def test_lintian_overrides_suppresses_alien_unknown_section() -> None:
    """alien doesn't know how to map RPM's Group: to a Debian section;
    the converted package always lands as `unknown`. Expected behavior."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "unknown-section" in text, (
        "lintian-overrides must suppress unknown-section unknown (alien "
        "conversion artefact)"
    )


def test_lintian_overrides_suppresses_juce_embedded_library() -> None:
    """JUCE engine .so embeds libcurl/libjpeg/libpng/libz statics by design.
    Without this filter lintian flags every linked symbol as an
    embedded-library warning."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "embedded-library" in text, (
        "lintian-overrides must suppress embedded-library on the JUCE engine "
        ".so (vendored framework with intentional static linkage)"
    )


def test_lintian_overrides_suppresses_sysusers_tmpfiles_exec_check() -> None:
    """sysusers.d / tmpfiles.d are data files; lintian's executable check
    expects ELF or a shebang on every non-zero file under /usr/lib."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "sysusers.d/map2.conf" in text, (
        "lintian-overrides must suppress executable-not-elf-or-script for "
        "/usr/lib/sysusers.d/map2.conf"
    )
    assert "tmpfiles.d/map2.conf" in text, (
        "lintian-overrides must suppress executable-not-elf-or-script for "
        "/usr/lib/tmpfiles.d/map2.conf"
    )


def test_lintian_overrides_suppresses_cli_symlink_in_build_tree() -> None:
    """/usr/bin/map2-cli + /usr/bin/map2-self-test are symlinks into
    /opt/map2-audio/scripts/. lintian's symlink-target-in-build-tree
    triggers on the alien staging tree until install completes."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "symlink-target-in-build-tree" in text, (
        "lintian-overrides must suppress symlink-target-in-build-tree for "
        "the CLI entrypoints"
    )
    assert "map2-cli" in text and "map2-self-test" in text, (
        "lintian-overrides must reference both /usr/bin/map2-cli and "
        "/usr/bin/map2-self-test symlinks"
    )


def test_lintian_overrides_documents_t2529_anchor() -> None:
    text = LINTIAN_OVERRIDES.read_text()
    assert "T2529" in text, "lintian-overrides must reference the T2529 anchor"
    assert "2026-05-15" in text, (
        "lintian-overrides must reference the T2529 lock date"
    )


def test_lintian_overrides_documents_zero_warning_target() -> None:
    """The T2529-E2 target is `0 errors + 0 warnings`."""
    text = LINTIAN_OVERRIDES.read_text()
    assert "0 errors" in text.lower() or "zero" in text.lower(), (
        "lintian-overrides must document the T2529-E2 target"
    )


# ---------------------------------------------------------------------------
# Runner script
# ---------------------------------------------------------------------------


def test_runner_exists() -> None:
    assert RUNNER.is_file(), f"missing runner at {RUNNER}"


def test_runner_is_executable() -> None:
    mode = RUNNER.stat().st_mode
    assert mode & stat.S_IXUSR, (
        f"runner must be executable; current mode = {oct(mode)}"
    )


def test_runner_uses_bash_shebang() -> None:
    text = RUNNER.read_text()
    first_line = text.splitlines()[0]
    assert first_line.startswith("#!"), "runner must have a shebang"
    assert "bash" in first_line, "runner must use bash"


def test_runner_uses_strict_bash_flags() -> None:
    text = RUNNER.read_text()
    assert "set -euo pipefail" in text, (
        "runner must `set -euo pipefail` for CI-safe error handling"
    )


def test_runner_references_overrides_file() -> None:
    text = RUNNER.read_text()
    assert "packaging/deb/lint/lintian-overrides" in text, (
        "runner must reference the canonical overrides path"
    )


def test_runner_invokes_alien() -> None:
    text = RUNNER.read_text()
    assert "alien" in text, "runner must invoke alien for RPM → DEB conversion"
    assert "--to-deb" in text, "runner must pass --to-deb to alien"


def test_runner_invokes_lintian_with_fail_on_warning() -> None:
    """`--fail-on warning` matches the T2529-E2 target (0 errors + 0 warnings)."""
    text = RUNNER.read_text()
    assert "lintian" in text, "runner must invoke lintian"
    assert "--fail-on warning" in text, (
        "runner must pass --fail-on warning so the gate fails on warnings too"
    )


def test_runner_documents_install_commands() -> None:
    """Operator without alien/lintian installed should see how to get them."""
    text = RUNNER.read_text()
    assert "alien" in text and "lintian" in text, (
        "runner must document how to install both alien and lintian"
    )


def test_runner_uses_mktemp_for_work_dir() -> None:
    """alien --to-deb creates intermediate files; runner must use a tmpdir
    and clean it up on exit (no leaking work artefacts into pwd)."""
    text = RUNNER.read_text()
    assert "mktemp" in text, (
        "runner must use mktemp to create the alien work dir"
    )
    assert "trap" in text and "rm -rf" in text, (
        "runner must register a cleanup trap so intermediate files are "
        "removed on exit (success OR failure)"
    )


def test_runner_documents_t2529_e2_target() -> None:
    text = RUNNER.read_text()
    assert "0 errors + 0 warnings" in text or "0 errors AND 0 warnings" in text, (
        "runner must document the T2529-E2 target"
    )
