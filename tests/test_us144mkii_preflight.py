"""T2515-2 — Driver + USB-enumeration preflight regression tests.

Uses tmp_path-backed pyfakefs-style monkeypatching of /proc/modules and
/sys/bus/usb/devices so all three operational states are deterministic in CI:

1. module loaded + operational PID present                  → OPERATIONAL
2. module loaded + boot PID present (no operational)        → BOOT_MODE
3. module missing + no relevant USB device                  → DISCONNECTED + module-load hint

Also covers ``recommend_remediation()`` text returns for each state and the
boot-mode polling wrapper short-circuiting once an operational device appears.
"""

from __future__ import annotations

from pathlib import Path
from typing import List

import pytest

from app.services.devices import tascam_us144mkii_preflight as preflight
from app.services.devices.tascam_us144mkii_preflight import (
    BOOT_PID,
    EnumerationStage,
    OPERATIONAL_PID,
    OPERATIONAL_VID,
    PreflightReport,
)


# ----------------------------------------------------------------------------
# Test fixtures — build a fake /proc and /sys layout under tmp_path
# ----------------------------------------------------------------------------

def _make_usb_dev(root: Path, name: str, vid: str, pid: str) -> Path:
    devdir = root / name
    devdir.mkdir(parents=True)
    (devdir / "idVendor").write_text(f"{vid}\n")
    (devdir / "idProduct").write_text(f"{pid}\n")
    return devdir


@pytest.fixture
def usb_root(tmp_path: Path, monkeypatch):
    """Redirect _SYS_USB_DEVICES to a temporary tree."""
    root = tmp_path / "sys_bus_usb_devices"
    root.mkdir()
    monkeypatch.setattr(preflight, "_SYS_USB_DEVICES", root)
    return root


@pytest.fixture
def proc_modules(tmp_path: Path, monkeypatch):
    """Redirect _PROC_MODULES to a temporary file (initially empty)."""
    path = tmp_path / "proc_modules"
    path.write_text("")
    monkeypatch.setattr(preflight, "_PROC_MODULES", path)
    return path


def _write_modules(path: Path, modules: List[str]) -> None:
    """Render /proc/modules-style lines so is_module_loaded() can match."""
    lines = [f"{m} 16384 0 - Live 0x0000000000000000\n" for m in modules]
    path.write_text("".join(lines))


# ----------------------------------------------------------------------------
# Module-presence
# ----------------------------------------------------------------------------

def test_is_module_loaded_true_when_listed(proc_modules):
    _write_modules(proc_modules, ["snd_usb_us144mkii", "snd_hda_intel"])
    assert preflight.is_module_loaded() is True


def test_is_module_loaded_false_when_missing(proc_modules):
    _write_modules(proc_modules, ["snd_hda_intel", "btusb"])
    assert preflight.is_module_loaded() is False


def test_is_module_loaded_false_on_missing_proc_modules(tmp_path, monkeypatch):
    monkeypatch.setattr(
        preflight, "_PROC_MODULES", tmp_path / "definitely-not-there"
    )
    assert preflight.is_module_loaded() is False


# ----------------------------------------------------------------------------
# USB enumeration
# ----------------------------------------------------------------------------

def test_finds_operational_device(usb_root):
    _make_usb_dev(usb_root, "1-2", OPERATIONAL_VID, OPERATIONAL_PID)
    result = preflight.find_operational_device()
    assert result is not None
    assert result.name == "1-2"


def test_finds_boot_mode_device(usb_root):
    _make_usb_dev(usb_root, "1-3", OPERATIONAL_VID, BOOT_PID)
    assert preflight.is_in_boot_mode() is True
    assert preflight.find_operational_device() is None


def test_ignores_unrelated_usb_devices(usb_root):
    _make_usb_dev(usb_root, "1-4", "1d6b", "0002")        # generic root hub
    _make_usb_dev(usb_root, "1-5", "0582", "0044")        # UA-1000 — different vendor
    assert preflight.find_operational_device() is None
    assert preflight.is_in_boot_mode() is False


# ----------------------------------------------------------------------------
# Aggregate report
# ----------------------------------------------------------------------------

def test_report_operational_state(usb_root, proc_modules):
    _write_modules(proc_modules, ["snd_usb_us144mkii"])
    _make_usb_dev(usb_root, "1-2", OPERATIONAL_VID, OPERATIONAL_PID)
    report = preflight.get_preflight_report(resolve_boot_mode=False)
    assert isinstance(report, PreflightReport)
    assert report.module_loaded is True
    assert report.enumeration_stage == EnumerationStage.OPERATIONAL
    assert report.operational_path is not None
    assert report.remediation_hint is None


def test_report_boot_mode_state(usb_root, proc_modules):
    _write_modules(proc_modules, ["snd_usb_us144mkii"])
    _make_usb_dev(usb_root, "1-2", OPERATIONAL_VID, BOOT_PID)
    report = preflight.get_preflight_report(resolve_boot_mode=False)
    assert report.module_loaded is True
    assert report.enumeration_stage == EnumerationStage.BOOT_MODE
    assert report.operational_path is None
    assert report.remediation_hint is not None
    assert "0644:800F".lower() in report.remediation_hint.lower() \
        or "boot" in report.remediation_hint.lower()


def test_report_disconnected_module_missing(usb_root, proc_modules):
    # /proc/modules has unrelated module only; /sys has no US-144MKII
    _write_modules(proc_modules, ["snd_hda_intel"])
    report = preflight.get_preflight_report(resolve_boot_mode=False)
    assert report.module_loaded is False
    assert report.enumeration_stage == EnumerationStage.DISCONNECTED
    assert report.operational_path is None
    assert report.remediation_hint is not None
    assert "snd-usb-us144mkii" in report.remediation_hint


def test_report_disconnected_module_loaded_no_device(usb_root, proc_modules):
    _write_modules(proc_modules, ["snd_usb_us144mkii"])
    report = preflight.get_preflight_report(resolve_boot_mode=False)
    assert report.module_loaded is True
    assert report.enumeration_stage == EnumerationStage.DISCONNECTED
    assert report.remediation_hint is not None
    # Should NOT suggest modprobe — module already loaded
    assert "modprobe" not in report.remediation_hint


# ----------------------------------------------------------------------------
# Boot-mode resolution
# ----------------------------------------------------------------------------

def test_try_resolve_returns_true_when_operational_already_present(usb_root):
    _make_usb_dev(usb_root, "1-2", OPERATIONAL_VID, OPERATIONAL_PID)
    assert preflight.try_resolve_boot_mode(timeout_s=0.01) is True


def test_try_resolve_returns_false_when_no_device_within_timeout(usb_root):
    # Empty /sys — neither boot nor operational device present
    assert preflight.try_resolve_boot_mode(timeout_s=0.05, poll_interval_s=0.01) is False


def test_try_resolve_returns_false_when_stuck_in_boot_mode(usb_root):
    _make_usb_dev(usb_root, "1-3", OPERATIONAL_VID, BOOT_PID)
    assert preflight.try_resolve_boot_mode(timeout_s=0.05, poll_interval_s=0.01) is False
