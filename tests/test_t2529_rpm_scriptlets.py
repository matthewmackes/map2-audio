"""T2529-A2 cycle 3 — RPM spec scriptlet contract.

Locks the body shape of packaging/rpm/map2.spec so a future operator-only
edit can't silently drop the `map2` service-user provisioning, the
systemd-tmpfiles invocation, the per-distro group-membership best-effort
loop, or the FHS-aligned /opt/map2-audio install root.

These tests don't actually build the RPM — they verify the spec file the
rpmbuild macros will read is correctly shaped per the T2529 Q1-Q3 locks.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SPEC_FILE = REPO_ROOT / "packaging" / "rpm" / "map2.spec"


@pytest.fixture(scope="module")
def spec_text() -> str:
    assert SPEC_FILE.is_file(), f"missing RPM spec at {SPEC_FILE}"
    return SPEC_FILE.read_text()


# ---------------------------------------------------------------------------
# BuildRequires / Requires headers — RPM macro availability
# ---------------------------------------------------------------------------


def test_spec_buildrequires_systemd_rpm_macros(spec_text: str) -> None:
    """%sysusers_create_package + %tmpfiles_create_package come from the
    systemd-rpm-macros package. Without this BR the spec won't expand."""
    assert "BuildRequires:  systemd-rpm-macros" in spec_text, (
        "RPM spec must BuildRequires systemd-rpm-macros so the %sysusers_create_package "
        "and %tmpfiles_create_package macros are available at build time"
    )


def test_spec_requires_pre_shadow_utils(spec_text: str) -> None:
    """The %pre scriptlet invokes useradd-via-sysusers; shadow-utils must be
    installed before the spec runs %pre. Q1 lock."""
    assert "Requires(pre):  shadow-utils" in spec_text, (
        "RPM spec must Requires(pre) shadow-utils so the %pre scriptlet can "
        "create the map2 user via systemd-sysusers (Q1 lock)"
    )


def test_spec_requires_pre_systemd(spec_text: str) -> None:
    """systemd-sysusers + systemd-tmpfiles tooling must be installed before
    %pre runs."""
    assert "Requires(pre):  systemd" in spec_text, (
        "RPM spec must Requires(pre) systemd so systemd-sysusers/systemd-tmpfiles "
        "tooling is available when %pre/%post run"
    )


def test_spec_requires_systemd_runtime(spec_text: str) -> None:
    """Runtime Requires: systemd — the service units we ship depend on it."""
    assert "\nRequires:       systemd\n" in spec_text, (
        "RPM spec must Requires systemd at runtime (the .service units depend on it)"
    )


def test_spec_recommends_pipewire_system(spec_text: str) -> None:
    """Q2 lock: system-wide PipeWire instance is the canonical audio
    substrate. Recommend (soft dep) so minimal images don't break."""
    assert "Recommends:     pipewire-system" in spec_text, (
        "RPM spec must Recommends pipewire-system per Q2 lock — the system-wide "
        "PipeWire instance is the canonical audio substrate for the map2 user"
    )


# ---------------------------------------------------------------------------
# FHS §3 install root — /opt/map2-audio, NOT /opt/map2 or /home/mm/...
# ---------------------------------------------------------------------------


def test_spec_uses_opt_map2_audio_install_root(spec_text: str) -> None:
    """Q3 lock: application tree lives under /opt/map2-audio (FHS §3.13)."""
    assert "/opt/map2-audio" in spec_text, (
        "RPM spec must use /opt/map2-audio as the application install root (Q3 lock)"
    )


def test_spec_has_no_legacy_opt_map2_paths(spec_text: str) -> None:
    """No /opt/map2/ (without -audio suffix) paths should remain in the
    install layout. Q3 lock — drift would split the install tree."""
    forbidden = "/opt/map2/"
    for line in spec_text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        # The license header has 'map2' as the project name; skip those.
        if "Name:" in s or "License:" in s or "URL:" in s:
            continue
        assert forbidden not in s, (
            f"RPM spec contains legacy {forbidden!r} path — Q3 lock requires "
            f"/opt/map2-audio/ as the sole application install root. Offending "
            f"line: {s!r}"
        )


def test_spec_has_no_home_mm_paths(spec_text: str) -> None:
    """No /home/mm/ paths in the RPM spec. Q3 lock — the whole point of
    T2529 is to untie the install from the mm operator account."""
    for line in spec_text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        assert "/home/mm/" not in s, (
            f"RPM spec contains operator-home path /home/mm/ — T2529 explicitly "
            f"untie the install from any operator account. Offending line: {s!r}"
        )


# ---------------------------------------------------------------------------
# sysusers.d + tmpfiles.d packaging
# ---------------------------------------------------------------------------


def test_spec_installs_sysusers_conf(spec_text: str) -> None:
    """packaging/sysusers.d/map2.conf must land at /usr/lib/sysusers.d/map2.conf."""
    assert (
        "install -m 644 packaging/sysusers.d/map2.conf %{buildroot}/usr/lib/sysusers.d/map2.conf"
        in spec_text
    ), (
        "RPM spec must install packaging/sysusers.d/map2.conf to "
        "/usr/lib/sysusers.d/map2.conf (Fedora Packaging Guidelines)"
    )


def test_spec_installs_tmpfiles_conf(spec_text: str) -> None:
    """packaging/tmpfiles.d/map2.conf must land at /usr/lib/tmpfiles.d/map2.conf."""
    assert (
        "install -m 644 packaging/tmpfiles.d/map2.conf %{buildroot}/usr/lib/tmpfiles.d/map2.conf"
        in spec_text
    ), (
        "RPM spec must install packaging/tmpfiles.d/map2.conf to "
        "/usr/lib/tmpfiles.d/map2.conf"
    )


def test_spec_files_section_lists_sysusers_conf(spec_text: str) -> None:
    """The %files section must own /usr/lib/sysusers.d/map2.conf so rpm
    tracks it across upgrades + uninstall."""
    assert "/usr/lib/sysusers.d/map2.conf" in spec_text, (
        "%files section must list /usr/lib/sysusers.d/map2.conf"
    )


def test_spec_files_section_lists_tmpfiles_conf(spec_text: str) -> None:
    """The %files section must own /usr/lib/tmpfiles.d/map2.conf."""
    assert "/usr/lib/tmpfiles.d/map2.conf" in spec_text, (
        "%files section must list /usr/lib/tmpfiles.d/map2.conf"
    )


# ---------------------------------------------------------------------------
# Scriptlets: %pre / %post / %preun / %postun
# ---------------------------------------------------------------------------


def test_spec_pre_invokes_sysusers_create_package(spec_text: str) -> None:
    """%pre must create the map2 user via the systemd RPM macro so the user
    exists BEFORE %install moves files into /var/lib/map2 (which has map2
    ownership via the tmpfiles.d entry)."""
    assert "%sysusers_create_package map2 %{_sysusersdir}/map2.conf" in spec_text, (
        "%pre must invoke %sysusers_create_package so the map2 user exists "
        "before file install + before %post tries to chown to it"
    )


def test_spec_post_invokes_tmpfiles_create_package(spec_text: str) -> None:
    """%post provisions /var/lib/map2, /var/cache/map2, /var/log/map2, /run/map2
    with map2:map2 ownership via the systemd RPM macro."""
    assert "%tmpfiles_create_package map2 %{_tmpfilesdir}/map2.conf" in spec_text, (
        "%post must invoke %tmpfiles_create_package so the canonical FHS dirs "
        "(/var/lib/map2 et al) are created with map2:map2 ownership"
    )


def test_spec_post_adds_user_to_audio_groups(spec_text: str) -> None:
    """Q1 lock group memberships: audio, pipewire, pipewire-system, video,
    input, plugdev. The loop must be best-effort (tolerate missing groups
    on minimal images) per the T2529 portability requirement."""
    expected_groups = ("audio", "pipewire", "pipewire-system", "video", "input", "plugdev")
    for grp in expected_groups:
        assert grp in spec_text, (
            f"%post must add the map2 user to the {grp!r} group "
            "(or check + skip if absent) per T2529 Q1 lock"
        )
    # Best-effort: each group is checked with getent first so a minimal image
    # without (e.g.) the pipewire-system group doesn't fail the install.
    assert "getent group" in spec_text, (
        "%post group-add loop must use getent group to skip missing groups "
        "(best-effort per T2529 portability requirement)"
    )
    assert "usermod -aG" in spec_text, (
        "%post must use usermod -aG (append, not replace) to add the map2 "
        "user to supplementary groups"
    )


def test_spec_post_uses_systemd_post_macro(spec_text: str) -> None:
    """%systemd_post handles preset enablement + daemon-reload across install
    + upgrade per Fedora Packaging Guidelines."""
    assert "%systemd_post map2-backend.service" in spec_text, (
        "%post must invoke %systemd_post for the core service units"
    )


def test_spec_preun_uses_systemd_preun_macro(spec_text: str) -> None:
    """%systemd_preun stops services on full uninstall (arg=0) but skips
    stop-on-upgrade so audio doesn't drop during a package update."""
    assert "%systemd_preun map2-backend.service" in spec_text, (
        "%preun must invoke %systemd_preun for clean stop-on-uninstall "
        "(skips on upgrade per Fedora Packaging Guidelines)"
    )


def test_spec_postun_uses_systemd_postun_with_restart(spec_text: str) -> None:
    """%systemd_postun_with_restart triggers a service restart on upgrade
    when the unit file content changed."""
    assert "%systemd_postun_with_restart map2-backend.service" in spec_text, (
        "%postun must invoke %systemd_postun_with_restart so backends pick "
        "up unit-file changes after upgrade"
    )


def test_spec_postun_preserves_map2_user(spec_text: str) -> None:
    """Q4 lock: package uninstall DELIBERATELY does NOT remove the map2
    user. Per FHS §5.5 + Fedora/Debian guidelines, operator data in
    /var/lib/map2 must be preserved across package removal. Operator runs
    userdel + rm -rf manually to fully decommission."""
    # We don't enforce exact wording — just that the spec explains the
    # deliberate preservation so a future maintainer doesn't "fix" it.
    assert "DELIBERATELY do NOT remove the map2 user" in spec_text, (
        "%postun must DELIBERATELY preserve the map2 user (FHS §5.5) — the "
        "spec should document this so a future maintainer doesn't 'fix' it "
        "by adding a userdel"
    )
    assert "userdel" in spec_text, (
        "%postun documentation must reference the manual userdel + rm -rf "
        "command an operator runs to fully decommission"
    )


# ---------------------------------------------------------------------------
# Operator CLI entrypoints (FHS §3.6 — /usr/bin/)
# ---------------------------------------------------------------------------


def test_spec_installs_map2_cli_symlink(spec_text: str) -> None:
    """`map2-cli` lands at /usr/bin/map2-cli as a symlink into the application
    tree per FHS §3.6 (user-facing binaries live in /usr/bin)."""
    assert (
        "ln -s /opt/map2-audio/scripts/cli.py %{buildroot}/usr/bin/map2-cli"
        in spec_text
    ), (
        "RPM spec must symlink /usr/bin/map2-cli → /opt/map2-audio/scripts/cli.py "
        "so operators can run `map2-cli` from any shell"
    )


def test_spec_installs_self_test_symlink(spec_text: str) -> None:
    """`map2-self-test` lands at /usr/bin/map2-self-test for the V-cycle CI gate."""
    assert (
        "ln -s /opt/map2-audio/scripts/self_test.py %{buildroot}/usr/bin/map2-self-test"
        in spec_text
    ), (
        "RPM spec must symlink /usr/bin/map2-self-test → "
        "/opt/map2-audio/scripts/self_test.py for the T2529-E5 CI gate"
    )


# ---------------------------------------------------------------------------
# Changelog
# ---------------------------------------------------------------------------


def test_spec_changelog_references_t2529_a2(spec_text: str) -> None:
    """Every spec change for T2529 must produce a changelog entry so RPM's
    `rpm -q --changelog` shows the migration history."""
    assert "T2529-A2" in spec_text, (
        "%changelog must reference T2529-A2 (the cycle that added the service-user "
        "+ FHS install layout)"
    )


def test_spec_changelog_describes_user_migration(spec_text: str) -> None:
    """The T2529-A2 changelog entry should explain the user-migration so a
    site-admin reading `rpm -q --changelog map2` understands what changed."""
    assert "map2 system service user" in spec_text or "dedicated `map2`" in spec_text, (
        "%changelog T2529-A2 entry should mention the dedicated map2 system "
        "service user migration"
    )
