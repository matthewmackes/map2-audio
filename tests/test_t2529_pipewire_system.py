"""T2529-A5 cycle 8 — system-wide PipeWire packaging contract.

Locks the file presence + content shape of the two PipeWire packaging
artefacts that ship MAP2's audio substrate via the system-wide instance
(`pipewire-system.service`) rather than the per-user one
(`pipewire.service` under the operator UID).

Per Q2 lock (2026-05-15), MAP2 connects to /run/pipewire-system/pipewire-0
instead of /run/user/<UID>/pipewire-0. These tests guard against drift back
to the per-user model that broke fresh installs on non-1000-UID operators.
"""

from __future__ import annotations

from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PIPEWIRE_FRAGMENT = REPO_ROOT / "packaging" / "pipewire" / "99-map2-audio.conf"
PIPEWIRE_SYSTEM_DROPIN = (
    REPO_ROOT
    / "packaging"
    / "pipewire"
    / "pipewire-system.service.d"
    / "10-map2-audio.conf"
)
SPEC_FILE = REPO_ROOT / "packaging" / "rpm" / "map2.spec"


# ---------------------------------------------------------------------------
# PipeWire context-properties fragment
# ---------------------------------------------------------------------------


def test_pipewire_fragment_exists() -> None:
    assert PIPEWIRE_FRAGMENT.is_file(), (
        f"missing PipeWire fragment at {PIPEWIRE_FRAGMENT}"
    )


def test_pipewire_fragment_pins_48k_rate() -> None:
    """default.clock.rate = 48000 — locks resampling-off behavior."""
    text = PIPEWIRE_FRAGMENT.read_text()
    assert "default.clock.rate" in text and "48000" in text, (
        "PipeWire fragment must pin default.clock.rate = 48000"
    )


def test_pipewire_fragment_pins_64_sample_quantum() -> None:
    """default.clock.quantum = 64 — 1.33ms period at 48k."""
    text = PIPEWIRE_FRAGMENT.read_text()
    assert "default.clock.quantum" in text and "64" in text, (
        "PipeWire fragment must pin default.clock.quantum = 64"
    )


def test_pipewire_fragment_allows_mlock() -> None:
    """mem.allow-mlock + mem.mlock-all prevent paging the audio graph."""
    text = PIPEWIRE_FRAGMENT.read_text()
    assert "mem.allow-mlock" in text and "true" in text, (
        "PipeWire fragment must allow memlock for the audio graph"
    )
    assert "mem.mlock-all" in text, (
        "PipeWire fragment should also set mem.mlock-all to lock the whole graph"
    )


def test_pipewire_fragment_documents_install_path() -> None:
    """Header must reference the canonical install path so a future
    maintainer can match installed file → repo source without grepping."""
    text = PIPEWIRE_FRAGMENT.read_text()
    assert "/etc/pipewire/pipewire.conf.d/99-map2-audio.conf" in text, (
        "PipeWire fragment header must document its canonical install path"
    )


def test_pipewire_fragment_documents_t2529_anchor() -> None:
    """Reference T2529 + Q2 lock so a future maintainer can trace decision history."""
    text = PIPEWIRE_FRAGMENT.read_text()
    assert "T2529" in text, "PipeWire fragment header must reference T2529"
    # The Q2 lock is the system-wide PipeWire decision
    assert "system-wide" in text.lower() or "Q2" in text, (
        "PipeWire fragment must document the system-wide instance decision (Q2 lock)"
    )


# ---------------------------------------------------------------------------
# pipewire-system.service drop-in
# ---------------------------------------------------------------------------


def test_pipewire_system_dropin_exists() -> None:
    assert PIPEWIRE_SYSTEM_DROPIN.is_file(), (
        f"missing pipewire-system.service drop-in at {PIPEWIRE_SYSTEM_DROPIN}"
    )


def test_pipewire_system_dropin_pins_cpu_affinity_off_audio_cores() -> None:
    """CPUAffinity=0 1 2 3 keeps the system-wide PipeWire daemon off the
    isolated audio cores (4,5)."""
    text = PIPEWIRE_SYSTEM_DROPIN.read_text()
    assert "CPUAffinity=0 1 2 3" in text, (
        "pipewire-system drop-in must pin CPUAffinity=0 1 2 3 (off the isolated "
        "audio cores 4,5)"
    )


def test_pipewire_system_dropin_grants_rtprio() -> None:
    """LimitRTPRIO=55 lets PipeWire's data-loop self-elevate; below the
    JUCE audio callback (80) + libremidi (70)."""
    text = PIPEWIRE_SYSTEM_DROPIN.read_text()
    assert "LimitRTPRIO=55" in text, (
        "pipewire-system drop-in must grant LimitRTPRIO=55 so the data-loop "
        "thread can self-elevate to SCHED_FIFO/55 (below audio callback at 80)"
    )


def test_pipewire_system_dropin_grants_memlock_unlimited() -> None:
    text = PIPEWIRE_SYSTEM_DROPIN.read_text()
    assert "LimitMEMLOCK=infinity" in text, (
        "pipewire-system drop-in must grant LimitMEMLOCK=infinity so PipeWire "
        "can mlock the audio graph (mem.allow-mlock=true in the fragment)"
    )


def test_pipewire_system_dropin_targets_correct_unit() -> None:
    """Drop-in lives in pipewire-system.service.d/ (the system-wide unit),
    NOT pipewire.service.d/ (the per-user unit)."""
    parent = PIPEWIRE_SYSTEM_DROPIN.parent.name
    assert parent == "pipewire-system.service.d", (
        f"drop-in must target pipewire-system.service (system-wide), not "
        f"pipewire.service (per-user). Parent dir was {parent!r}"
    )


# ---------------------------------------------------------------------------
# RPM spec — install + %files coverage
# ---------------------------------------------------------------------------


def test_rpm_spec_installs_pipewire_fragment() -> None:
    text = SPEC_FILE.read_text()
    assert (
        "install -m 644 packaging/pipewire/99-map2-audio.conf "
        "%{buildroot}/etc/pipewire/pipewire.conf.d/99-map2-audio.conf"
        in text
    ), "RPM spec must install the PipeWire fragment to /etc/pipewire/pipewire.conf.d/"


def test_rpm_spec_installs_pipewire_system_dropin() -> None:
    text = SPEC_FILE.read_text()
    assert (
        "install -m 644 packaging/pipewire/pipewire-system.service.d/10-map2-audio.conf "
        "%{buildroot}/usr/lib/systemd/system/pipewire-system.service.d/10-map2-audio.conf"
        in text
    ), (
        "RPM spec must install the pipewire-system.service drop-in to "
        "/usr/lib/systemd/system/pipewire-system.service.d/"
    )


def test_rpm_spec_files_section_lists_pipewire_fragment() -> None:
    """%config(noreplace) so operator edits to the fragment survive an upgrade."""
    text = SPEC_FILE.read_text()
    assert (
        "%config(noreplace) /etc/pipewire/pipewire.conf.d/99-map2-audio.conf"
        in text
    ), (
        "%files must list the PipeWire fragment with %config(noreplace) so "
        "operator-edited copies aren't overwritten on upgrade"
    )


def test_rpm_spec_files_section_lists_pipewire_system_dropin() -> None:
    text = SPEC_FILE.read_text()
    assert (
        "/usr/lib/systemd/system/pipewire-system.service.d/10-map2-audio.conf"
        in text
    ), "%files must list the pipewire-system.service drop-in"
