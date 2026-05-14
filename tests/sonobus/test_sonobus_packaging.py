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
