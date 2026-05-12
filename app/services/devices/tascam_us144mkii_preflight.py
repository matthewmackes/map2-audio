"""T2515-2 — TASCAM US-144MKII driver + USB enumeration preflight.

The US-144MKII is NOT USB Audio Class compliant; it requires the in-tree
``snd-usb-us144mkii`` kernel module (Fedora kernel >= 6.x). The driver performs
a two-stage enumeration: the device appears initially with VID/PID 0644:800F
(boot/loader) and re-enumerates to 0644:8020 once firmware has been uploaded
by the kernel module. This preflight surfaces those states crisply so the
engine boot path can wait briefly for the operational PID before failing.

This module is intentionally synchronous and dependency-free (stdlib only) so
it can run at engine-boot before any heavier service comes up.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

KERNEL_MODULE_NAME = "snd_usb_us144mkii"      # /proc/modules form (underscores)
KERNEL_MODULE_ALIAS = "snd-usb-us144mkii"     # modprobe form (hyphens)

OPERATIONAL_VID = "0644"
OPERATIONAL_PID = "8020"
BOOT_PID = "800F"

# /proc filesystem lookups
_PROC_MODULES = Path("/proc/modules")
_SYS_USB_DEVICES = Path("/sys/bus/usb/devices")


# ----------------------------------------------------------------------------
# Public data types
# ----------------------------------------------------------------------------

class EnumerationStage:
    """Two-stage USB enumeration states for the US-144MKII.

    String constants (not an Enum) so they serialize cleanly across the
    Python<->JS bridge and into the React Devices panel without an extra
    mapping layer.
    """

    DISCONNECTED = "disconnected"
    BOOT_MODE = "boot_mode"            # PID 0x800F observed; awaiting firmware upload
    OPERATIONAL = "operational"        # PID 0x8020 observed; audio I/O usable


@dataclass(frozen=True)
class PreflightReport:
    """Summary report consumed by the engine boot path + Devices panel."""

    module_loaded: bool
    enumeration_stage: str             # one of EnumerationStage.*
    operational_path: Optional[str]    # /sys/bus/usb/devices/X-Y entry, or None
    remediation_hint: Optional[str]


# ----------------------------------------------------------------------------
# Module-presence probes
# ----------------------------------------------------------------------------

def is_module_loaded() -> bool:
    """True iff `snd-usb-us144mkii` is currently in /proc/modules."""
    try:
        with _PROC_MODULES.open("r", encoding="utf-8") as fp:
            for line in fp:
                # /proc/modules: "snd_usb_us144mkii <size> <ref> <deps> Live 0x..."
                if line.startswith(KERNEL_MODULE_NAME + " "):
                    return True
    except OSError:
        # /proc not readable (containerized test env, sandbox, etc.)
        return False
    return False


# ----------------------------------------------------------------------------
# USB enumeration probes
# ----------------------------------------------------------------------------

def _read_usb_id(devdir: Path) -> Optional[tuple[str, str]]:
    """Read (vendor, product) lowercase hex from a /sys/bus/usb/devices entry."""
    try:
        vendor = (devdir / "idVendor").read_text().strip().lower()
        product = (devdir / "idProduct").read_text().strip().lower()
    except OSError:
        return None
    if not vendor or not product:
        return None
    return vendor, product


def _find_us144mkii(target_pid: str) -> Optional[Path]:
    """Return the /sys path for a US-144MKII matching the target PID, if any."""
    target_pid = target_pid.lower()
    target_vid = OPERATIONAL_VID.lower()
    try:
        candidates = sorted(_SYS_USB_DEVICES.glob("*"))
    except OSError:
        return None
    for devdir in candidates:
        ids = _read_usb_id(devdir)
        if ids is None:
            continue
        vid, pid = ids
        if vid == target_vid and pid == target_pid:
            return devdir
    return None


def is_in_boot_mode() -> bool:
    """True iff a US-144MKII is enumerated with the boot/loader PID 0x800F."""
    return _find_us144mkii(BOOT_PID) is not None


def find_operational_device() -> Optional[Path]:
    """Return the /sys path for an operational US-144MKII, or None."""
    return _find_us144mkii(OPERATIONAL_PID)


# ----------------------------------------------------------------------------
# Boot-mode resolution
# ----------------------------------------------------------------------------

def try_resolve_boot_mode(timeout_s: float = 5.0,
                          poll_interval_s: float = 0.25) -> bool:
    """Wait briefly for the kernel module to flip the device to operational PID.

    Returns True if the operational PID (0x8020) is observed within the timeout.
    Emits one structured log line per state change.

    The kernel driver normally completes firmware upload + re-enumeration in
    well under 2 s. The default 5 s timeout is generous but bounded so the
    engine boot path can't hang on a missing device.
    """
    deadline = time.monotonic() + max(0.0, timeout_s)
    last_state: Optional[str] = None
    while True:
        if find_operational_device() is not None:
            if last_state != EnumerationStage.OPERATIONAL:
                logger.info(
                    "tascam.us144mkii.boot_resolved stage=%s previous=%s",
                    EnumerationStage.OPERATIONAL,
                    last_state or "unknown",
                )
            return True
        in_boot = is_in_boot_mode()
        current = EnumerationStage.BOOT_MODE if in_boot else EnumerationStage.DISCONNECTED
        if current != last_state:
            logger.info(
                "tascam.us144mkii.enum_stage stage=%s previous=%s",
                current,
                last_state or "unknown",
            )
            last_state = current
        if time.monotonic() >= deadline:
            return False
        time.sleep(poll_interval_s)


# ----------------------------------------------------------------------------
# Remediation hints
# ----------------------------------------------------------------------------

def recommend_remediation(report: "PreflightReport | None" = None) -> str:
    """Return an operator-readable one-line hint for the current state."""
    report = report or get_preflight_report(resolve_boot_mode=False)
    if not report.module_loaded:
        return (
            "Kernel module 'snd-usb-us144mkii' is not loaded. "
            "Run `sudo modprobe snd-usb-us144mkii` "
            "(requires Linux kernel >= 6.x with snd-usb-us144mkii built in-tree)."
        )
    if report.enumeration_stage == EnumerationStage.BOOT_MODE:
        return (
            "Device stuck in boot/loader stage at 0644:800F. "
            "Unplug and replug the USB cable, or reboot. "
            "If the issue persists, run `sudo usbreset 0644:800F`."
        )
    if report.enumeration_stage == EnumerationStage.DISCONNECTED:
        return (
            "TASCAM US-144MKII not detected on the USB bus. "
            "Check the cable and that the device is powered on a USB 2.0 (Hi-Speed) port. "
            "The device firmware does not support USB 1.1 fallback."
        )
    return ""


# ----------------------------------------------------------------------------
# Aggregate report
# ----------------------------------------------------------------------------

def get_preflight_report(resolve_boot_mode: bool = True,
                         timeout_s: float = 5.0) -> PreflightReport:
    """Return a single PreflightReport summarizing module + USB state.

    With `resolve_boot_mode=True` (default), spends up to `timeout_s` seconds
    waiting for an observed boot-mode device to flip to the operational PID.
    With `resolve_boot_mode=False`, returns the current observed state without
    waiting — appropriate for status polling.
    """
    module_loaded = is_module_loaded()
    operational = find_operational_device()
    if operational is not None:
        report = PreflightReport(
            module_loaded=module_loaded,
            enumeration_stage=EnumerationStage.OPERATIONAL,
            operational_path=str(operational),
            remediation_hint=None,
        )
        return report

    if resolve_boot_mode and is_in_boot_mode():
        if try_resolve_boot_mode(timeout_s=timeout_s):
            operational = find_operational_device()
            return PreflightReport(
                module_loaded=module_loaded,
                enumeration_stage=EnumerationStage.OPERATIONAL,
                operational_path=str(operational) if operational else None,
                remediation_hint=None,
            )

    if is_in_boot_mode():
        stage = EnumerationStage.BOOT_MODE
    else:
        stage = EnumerationStage.DISCONNECTED

    interim = PreflightReport(
        module_loaded=module_loaded,
        enumeration_stage=stage,
        operational_path=None,
        remediation_hint=None,
    )
    return PreflightReport(
        module_loaded=module_loaded,
        enumeration_stage=stage,
        operational_path=None,
        remediation_hint=recommend_remediation(interim),
    )
