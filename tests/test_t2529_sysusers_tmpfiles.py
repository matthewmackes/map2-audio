"""T2529-A1 cycle 2 — sysusers.d / tmpfiles.d declarative provisioning files.

Locks the file presence + line-shape contract so a future operator-only
edit can't silently drop the `map2` user creation or the FHS-aligned
directory provisioning.

These tests don't actually create users or directories — they just
verify the declarative files the RPM `%pre` / `%post` scriptlets will
hand to `systemd-sysusers` and `systemd-tmpfiles` are correctly shaped.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SYSUSERS_FILE = REPO_ROOT / "packaging" / "sysusers.d" / "map2.conf"
TMPFILES_FILE = REPO_ROOT / "packaging" / "tmpfiles.d" / "map2.conf"


# ---------------------------------------------------------------------------
# sysusers.d/map2.conf
# ---------------------------------------------------------------------------


def test_sysusers_file_exists() -> None:
    assert SYSUSERS_FILE.is_file(), f"missing sysusers.d file at {SYSUSERS_FILE}"


def test_sysusers_declares_map2_user() -> None:
    """The single `u` line creates the `map2` user with auto-assigned UID."""
    text = SYSUSERS_FILE.read_text()
    lines = [
        line.split() for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    user_lines = [parts for parts in lines if parts and parts[0] == "u"]
    assert len(user_lines) == 1, (
        f"expected exactly one `u` (user-create) line, found {len(user_lines)}: "
        f"{user_lines}"
    )
    parts = user_lines[0]
    # Type Name ID GECOS HomeDir Shell
    assert parts[1] == "map2", f"expected user name 'map2', got {parts[1]!r}"
    # ID column is '-' → systemd-sysusers picks an unused UID in the system
    # range (honors /etc/login.defs SYS_UID_MIN..SYS_UID_MAX per Q1 lock).
    assert parts[2] == "-", f"expected ID '-', got {parts[2]!r}"
    assert "/var/lib/map2" in parts, (
        f"expected /var/lib/map2 as the home dir token; got {parts}"
    )
    assert "/sbin/nologin" in parts, (
        f"expected /sbin/nologin as the shell; got {parts}"
    )


def test_sysusers_no_hardcoded_uid() -> None:
    """Q1 lock: ID column MUST be `-` (auto-assigned) so the user honors
    /etc/login.defs UID_MIN per-machine. A hardcoded UID here breaks
    portability."""
    text = SYSUSERS_FILE.read_text()
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        parts = s.split()
        if parts and parts[0] == "u" and parts[1] == "map2":
            # Reject any literal UID in the ID column.
            assert not parts[2].isdigit(), (
                f"hardcoded UID detected in sysusers.d/map2.conf: {parts[2]!r} — "
                "Q1 lock requires '-' (auto-assigned, honors UID_MIN)"
            )


def test_sysusers_carries_documentation_header() -> None:
    """The file should explain itself to a future maintainer. Don't enforce
    exact text; require an install-path hint and the T2529 anchor."""
    text = SYSUSERS_FILE.read_text()
    assert "/usr/lib/sysusers.d/map2.conf" in text, (
        "sysusers.d/map2.conf should reference its canonical install path"
    )
    assert "T2529" in text, (
        "sysusers.d/map2.conf should reference the T2529 epic so a future "
        "operator can trace the decision lock"
    )


# ---------------------------------------------------------------------------
# tmpfiles.d/map2.conf
# ---------------------------------------------------------------------------


def test_tmpfiles_file_exists() -> None:
    assert TMPFILES_FILE.is_file(), f"missing tmpfiles.d file at {TMPFILES_FILE}"


def _tmpfiles_d_entries() -> list[list[str]]:
    """Return the parsed non-comment lines from tmpfiles.d/map2.conf."""
    return [
        line.split()
        for line in TMPFILES_FILE.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


@pytest.mark.parametrize(
    "path,mode",
    [
        ("/var/lib/map2", "0755"),
        ("/var/cache/map2", "0755"),
        ("/var/log/map2", "0750"),
        ("/run/map2", "0755"),
    ],
)
def test_tmpfiles_declares_canonical_fhs_dir(path: str, mode: str) -> None:
    """Each canonical FHS service-dir is declared with the correct mode."""
    entries = _tmpfiles_d_entries()
    matching = [parts for parts in entries if len(parts) >= 5 and parts[1] == path]
    assert matching, f"tmpfiles.d/map2.conf missing entry for {path}"
    parts = matching[0]
    assert parts[0] == "d", (
        f"{path} should be a `d` (create dir) entry, got {parts[0]!r}"
    )
    assert parts[2] == mode, (
        f"{path} should have mode {mode}, got {parts[2]!r}"
    )
    assert parts[3] == "map2", (
        f"{path} should be owned by user 'map2', got {parts[3]!r}"
    )
    assert parts[4] == "map2", (
        f"{path} should be owned by group 'map2', got {parts[4]!r}"
    )


def test_tmpfiles_declares_state_subdirs() -> None:
    """Q3 lock subset: the four /var/lib/map2 subdirs the service expects at
    startup (snapshots / devices / sessions / recordings) are pre-created so
    a fresh install + immediate engine launch doesn't race against directory
    creation."""
    entries = _tmpfiles_d_entries()
    paths = {parts[1] for parts in entries if len(parts) >= 2}
    for subdir in (
        "/var/lib/map2/snapshots",
        "/var/lib/map2/devices",
        "/var/lib/map2/sessions",
        "/var/lib/map2/recordings",
    ):
        assert subdir in paths, (
            f"tmpfiles.d/map2.conf missing entry for {subdir} "
            "(needed so the engine doesn't race against dir-creation on first launch)"
        )


def test_tmpfiles_environment_drop_in_dir_is_group_writable() -> None:
    """Operator can edit /etc/map2/environment.d/*.env without becoming root
    over the whole /etc/map2 tree. mode 0775, group=map2 lets sudo + map2
    group members drop in environment overrides."""
    entries = _tmpfiles_d_entries()
    matches = [
        parts for parts in entries
        if len(parts) >= 5 and parts[1] == "/etc/map2/environment.d"
    ]
    assert matches, "tmpfiles.d/map2.conf missing /etc/map2/environment.d entry"
    parts = matches[0]
    assert parts[2] == "0775", (
        f"/etc/map2/environment.d should be mode 0775 for group-writable "
        f"operator drop-ins, got {parts[2]!r}"
    )
    # Owner is root (system config tree) but group is map2 so the service user
    # can read; operators with sudo group can drop in env overrides.
    assert parts[3] == "root", (
        f"/etc/map2/environment.d should be owned by root, got {parts[3]!r}"
    )
    assert parts[4] == "map2", (
        f"/etc/map2/environment.d should have group map2, got {parts[4]!r}"
    )


def test_tmpfiles_carries_documentation_header() -> None:
    text = TMPFILES_FILE.read_text()
    assert "/usr/lib/tmpfiles.d/map2.conf" in text, (
        "tmpfiles.d/map2.conf should reference its canonical install path"
    )
    assert "T2529" in text, (
        "tmpfiles.d/map2.conf should reference the T2529 epic"
    )
    # The FHS §3 layout is documented inline so a future maintainer
    # understands the per-path rationale without reading the worklist.
    assert "FHS" in text, (
        "tmpfiles.d/map2.conf should reference the FHS standard so a "
        "future maintainer understands the per-path rationale"
    )


def test_tmpfiles_no_hardcoded_uid_or_path_outside_fhs() -> None:
    """Rock-solid invariant: every entry must use the canonical FHS paths.
    Any drift (e.g. /home/mm/...) would defeat the entire migration."""
    entries = _tmpfiles_d_entries()
    forbidden_prefixes = ("/home/", "/root/", "/tmp/", "/usr/local/")
    for parts in entries:
        if len(parts) < 2:
            continue
        path = parts[1]
        for prefix in forbidden_prefixes:
            assert not path.startswith(prefix), (
                f"tmpfiles.d/map2.conf entry {path!r} starts with the "
                f"non-FHS prefix {prefix!r} — Q3 lock requires strict FHS §3 "
                "paths only (/opt /etc /var /run /usr)"
            )
