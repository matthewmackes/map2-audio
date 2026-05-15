"""T2521-8: SonoBus packaging + systemd asset presence tests.

Verifies the installer manifest registers the `sonobus` component, the
systemd unit + firewalld fragment + env example exist on disk and
contain the locked-decision defaults. These are stub-presence checks —
behavior tests for the daemon arrive with T2521-4.
"""

from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_systemd_unit_exists():
    unit = REPO_ROOT / "systemd" / "map2-sonobus-transport.service"
    assert unit.is_file(), f"missing systemd unit at {unit}"


def test_systemd_unit_carries_locked_defaults():
    unit_text = (
        REPO_ROOT / "systemd" / "map2-sonobus-transport.service"
    ).read_text()
    # Q3 default
    assert "MAP2_SONOBUS_CONNECTION_SERVER=1" in unit_text
    # Q14 default cap
    assert "MAP2_SONOBUS_MAX_CHANNELS=32" in unit_text
    # Q18 default transport priority
    assert "MAP2_SONOBUS_DEFAULT_TRANSPORT_PRIORITY=avb_preferred" in unit_text
    # UDP port range matches firewalld fragment
    assert "MAP2_SONOBUS_UDP_PORT_BASE=10000" in unit_text
    assert "MAP2_SONOBUS_UDP_PORT_COUNT=100" in unit_text


def test_systemd_unit_stays_off_isolated_audio_cores():
    """Daemon is non-RT — must stay off cores 4-5 (audio-isolated)."""
    unit_text = (
        REPO_ROOT / "systemd" / "map2-sonobus-transport.service"
    ).read_text()
    assert "CPUAffinity=0 1 2 3" in unit_text


def test_firewalld_fragment_exists():
    fragment = REPO_ROOT / "systemd" / "firewalld" / "map2-sonobus.xml"
    assert fragment.is_file(), f"missing firewalld fragment at {fragment}"


def test_firewalld_fragment_opens_correct_udp_range():
    fragment_text = (
        REPO_ROOT / "systemd" / "firewalld" / "map2-sonobus.xml"
    ).read_text()
    assert 'port="10000-10100"' in fragment_text
    assert 'protocol="udp"' in fragment_text


def test_env_example_exists_and_documents_locked_decisions():
    env = REPO_ROOT / "etc" / "map2" / "sonobus.env.example"
    assert env.is_file(), f"missing env example at {env}"
    text = env.read_text()
    assert "MAP2_SONOBUS_CONNECTION_SERVER" in text
    assert "MAP2_SONOBUS_MAX_CHANNELS" in text
    assert "MAP2_SONOBUS_DEFAULT_TRANSPORT_PRIORITY" in text
    assert "MAP2_SONOBUS_UDP_PORT_BASE" in text


def test_installer_registers_sonobus_component():
    """The installer's `sonobus` component must expose the daemon's
    build deps so RPM and Debian targets stay parallel."""
    from installer.backend.packages import (
        SONOBUS_PACKAGES_FEDORA,
        FEDORA_TO_APT,
    )

    # Fedora set
    assert "opus-devel" in SONOBUS_PACKAGES_FEDORA
    assert "libuv-devel" in SONOBUS_PACKAGES_FEDORA
    assert "avahi-devel" in SONOBUS_PACKAGES_FEDORA

    # apt mappings (Debian/Ubuntu equivalents)
    assert FEDORA_TO_APT["opus-devel"] == "libopus-dev"
    assert FEDORA_TO_APT["libuv-devel"] == "libuv1-dev"
    assert FEDORA_TO_APT["avahi-devel"] == "libavahi-client-dev"


def test_installer_component_map_contains_sonobus():
    """The PackageManager.install_component() switchboard must accept
    `sonobus` as a component name so installer wiring can request it."""
    from installer.backend import packages as packages_module

    source = (
        Path(packages_module.__file__).read_text()
    )
    assert '"sonobus":  SONOBUS_PACKAGES_FEDORA' in source


# ---------------------------------------------------------------------------
# T2521-8 cycle 29 — RPM spec entries + vendor/aoo skeleton + uninstaller
# ---------------------------------------------------------------------------


def test_rpm_spec_installs_sonobus_systemd_unit():
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "map2-sonobus-transport.service" in spec
    assert "/usr/lib/systemd/system/map2-sonobus-transport.service" in spec


def test_rpm_spec_installs_firewalld_fragment():
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "systemd/firewalld/map2-sonobus.xml" in spec
    assert "/usr/lib/firewalld/services/map2-sonobus.xml" in spec


def test_rpm_spec_installs_env_example():
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "etc/map2/sonobus.env.example" in spec


def test_rpm_spec_has_preun_hook_for_sonobus_disable():
    """%preun must stop + disable the SonoBus transport so the daemon
    doesn't keep its UDP ports + RT priority across uninstall."""
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "%preun" in spec
    assert "systemctl stop map2-sonobus-transport.service" in spec
    assert "systemctl disable map2-sonobus-transport.service" in spec


def test_rpm_spec_has_postun_hook_for_firewalld_cleanup():
    """%postun must drop the firewalld zone fragment on full uninstall."""
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "%postun" in spec
    assert "firewall-cmd --remove-service=map2-sonobus" in spec


def test_rpm_spec_changelog_records_t2521_8():
    spec = (REPO_ROOT / "packaging" / "rpm" / "map2.spec").read_text()
    assert "T2521-8" in spec


def test_packaging_systemd_directory_has_sonobus_unit_copy():
    """The packaging/systemd/ copy used by the RPM install script must
    match the canonical systemd/ copy."""
    canonical = REPO_ROOT / "systemd" / "map2-sonobus-transport.service"
    packaged = (
        REPO_ROOT / "packaging" / "systemd" / "map2-sonobus-transport.service"
    )
    assert packaged.is_file(), f"missing packaging copy at {packaged}"
    # Same content end-to-end so a future operator-only edit in either
    # path doesn't silently drift.
    assert canonical.read_text() == packaged.read_text()


def test_vendor_aoo_placeholder_files_present():
    """The vendor/aoo/ skeleton must carry a VERSION + LICENSE
    placeholder so the licensing posture is visible before the full
    source pull lands in T2521-4."""
    version = REPO_ROOT / "vendor" / "aoo" / "VERSION"
    license_placeholder = REPO_ROOT / "vendor" / "aoo" / "LICENSE.placeholder"
    assert version.is_file(), "vendor/aoo/VERSION placeholder missing"
    assert license_placeholder.is_file(), (
        "vendor/aoo/LICENSE.placeholder missing"
    )
    version_text = version.read_text()
    assert "BSD-3-Clause" in version_text
    assert "T2521-4" in version_text


def test_vendor_aoo_has_no_cmakelists_yet():
    """The CMake guard at juce-engine/CMakeLists.txt checks for
    vendor/aoo/CMakeLists.txt to flip SONOBUS_AVAILABLE=TRUE. Until
    the full source vendor lands in T2521-4, that file must NOT
    exist so the engine build correctly logs PLANNED instead of
    ENABLED."""
    cmake = REPO_ROOT / "vendor" / "aoo" / "CMakeLists.txt"
    assert not cmake.exists(), (
        "vendor/aoo/CMakeLists.txt landed before the T2521-4 source pull. "
        "The CMake guard would now claim SONOBUS_AVAILABLE=TRUE without a "
        "real AOO source tree — that's a contract regression."
    )
