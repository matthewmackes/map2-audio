"""MeloAudio MIDI Commander firmware detection.

T2459-H3-CFG Phase 1.

Classifies the connected MeloAudio MIDI Commander into one of:

- ``stock``         — original MeloAudio firmware (mode-switched via
                      front-panel button combos at boot; CC numbers are
                      hardcoded per mode and not user-configurable)
- ``custom``        — `harvie256/midi-commander-custom`_ open-source
                      firmware (MIT-licensed; CC mappings configurable via
                      a SysEx config protocol; iProduct contains "STM")
- ``dfu_bootloader``— STM32 DFU bootloader mode, used for flashing.
                      USB ID switches to ``0483:DF11`` while in this mode.
- ``unknown``       — connected but USB descriptor doesn't match any
                      known firmware fingerprint
- ``not_present``   — no Commander connected

The detection input is the running system's USB device tree (read via
sysfs at ``/sys/bus/usb/devices``). No exclusive open of the device is
needed — detection is purely descriptor-based and side-effect-free.

.. _`harvie256/midi-commander-custom`: https://github.com/harvie256/midi-commander-custom
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# USB identifiers used by the firmware fingerprinting logic. The stock
# MeloAudio firmware exposes the official MeloAudio vendor ID; the
# harvie256 custom firmware reuses these IDs (it's a re-flash of the
# same MCU, so the USB identifier doesn't change from the host's
# perspective). The product STRING is the disambiguator.
MELOAUDIO_VENDOR_ID = 0x2EEE
MELOAUDIO_PRODUCT_ID = 0x0301

# DFU bootloader mode reports a different USB vendor/product entirely
# because the STM32 ROM bootloader takes over the USB endpoint.
STM_DFU_VENDOR_ID = 0x0483
STM_DFU_PRODUCT_ID = 0xDF11

# Product-string fingerprints. Stock firmware advertises "TSMIDI2.0";
# harvie256 advertises "STM32 Customisable" or similar (any string
# containing the substring "STM" is treated as the custom firmware).
STOCK_PRODUCT_STRING = "TSMIDI2.0"
CUSTOM_FIRMWARE_PRODUCT_STRING_FRAGMENT = "STM"

USB_DEVICES_ROOT = Path("/sys/bus/usb/devices")


class CommanderFirmwareKind(str, Enum):
    """The classified firmware running on a connected MIDI Commander."""

    STOCK = "stock"
    CUSTOM = "custom"
    DFU_BOOTLOADER = "dfu_bootloader"
    UNKNOWN = "unknown"
    NOT_PRESENT = "not_present"


@dataclass(frozen=True)
class CommanderStatus:
    """A single point-in-time detection result for the Commander."""

    firmware_kind: CommanderFirmwareKind
    """Which firmware (or absence) was detected."""

    vendor_id: Optional[int]
    """USB vendor ID; ``None`` when not_present."""

    product_id: Optional[int]
    """USB product ID; ``None`` when not_present."""

    product_string: Optional[str]
    """USB ``iProduct`` descriptor string; ``None`` when not_present or
    when sysfs doesn't expose it on this kernel."""

    manufacturer_string: Optional[str]
    """USB ``iManufacturer`` descriptor string."""

    serial: Optional[str]
    """USB ``iSerial`` descriptor string."""

    sysfs_path: Optional[str]
    """Filesystem path under /sys/bus/usb/devices that the device was
    detected at; ``None`` when not_present. Useful for diagnostics."""

    bcd_device: Optional[str]
    """Firmware version per the USB ``bcdDevice`` field, formatted as
    ``MM.mm`` (e.g., ``2.00``). ``None`` when not exposed."""

    @property
    def supports_canonical_config_push(self) -> bool:
        """True when MAP2 can push a canonical config via the SysEx
        protocol. Only the harvie256 custom firmware accepts the
        SysEx ERASE_FLASH/WRITE_FLASH/RESET protocol; stock firmware
        ignores it.
        """
        return self.firmware_kind == CommanderFirmwareKind.CUSTOM

    @property
    def supports_discovery_wizard(self) -> bool:
        """True when the device is connected and can stream MIDI to
        the discovery wizard. Stock + custom both work; DFU bootloader
        and not_present both don't.
        """
        return self.firmware_kind in {
            CommanderFirmwareKind.STOCK,
            CommanderFirmwareKind.CUSTOM,
        }

    @property
    def is_present(self) -> bool:
        """True when ANY device matching the Commander's identifiers is
        on the bus, regardless of firmware mode (so the UI can surface
        DFU-bootloader state distinctly from "not connected at all").
        """
        return self.firmware_kind != CommanderFirmwareKind.NOT_PRESENT


def _read_text(path: Path) -> Optional[str]:
    """Best-effort read; returns None if the file is absent or unreadable."""
    try:
        return path.read_text(encoding="utf-8", errors="replace").strip()
    except (OSError, ValueError):
        return None


def _parse_hex_id(text: Optional[str]) -> Optional[int]:
    if not text:
        return None
    try:
        return int(text, 16)
    except ValueError:
        return None


def _scan_usb_devices(root: Path = USB_DEVICES_ROOT) -> list[Path]:
    """Enumerate USB device directories under sysfs.

    Skips interface directories (which contain a colon in the basename)
    and returns only top-level device directories. The kernel exposes
    one such directory per USB device with idVendor/idProduct files.
    """
    if not root.exists():
        return []
    out: list[Path] = []
    for entry in root.iterdir():
        # Interface entries look like "3-13.4:1.0" — they have a colon.
        # Top-level device entries look like "3-13.4" — no colon.
        if ":" in entry.name:
            continue
        if not entry.is_dir():
            continue
        out.append(entry)
    return out


def _classify_product_string(product: Optional[str]) -> CommanderFirmwareKind:
    """Classify a Commander already known to be on the MeloAudio USB
    vendor/product pair, based on its iProduct string.
    """
    if not product:
        # Some kernels don't expose the product string for every device
        # (esp. if the device is in a degraded enumeration state). Treat
        # absent as unknown rather than guessing.
        return CommanderFirmwareKind.UNKNOWN
    if product == STOCK_PRODUCT_STRING:
        return CommanderFirmwareKind.STOCK
    if CUSTOM_FIRMWARE_PRODUCT_STRING_FRAGMENT in product:
        return CommanderFirmwareKind.CUSTOM
    return CommanderFirmwareKind.UNKNOWN


def _build_status_from_sysfs_dir(usb_dir: Path) -> Optional[CommanderStatus]:
    """Read sysfs descriptors for a single USB device directory and
    classify it as a Commander (stock/custom/dfu) or return None if it
    doesn't match the Commander or DFU identifiers.
    """
    vendor = _parse_hex_id(_read_text(usb_dir / "idVendor"))
    product = _parse_hex_id(_read_text(usb_dir / "idProduct"))
    if vendor is None or product is None:
        return None

    product_string = _read_text(usb_dir / "product")
    manufacturer_string = _read_text(usb_dir / "manufacturer")
    serial = _read_text(usb_dir / "serial")
    bcd_device = _read_text(usb_dir / "bcdDevice")

    if vendor == STM_DFU_VENDOR_ID and product == STM_DFU_PRODUCT_ID:
        return CommanderStatus(
            firmware_kind=CommanderFirmwareKind.DFU_BOOTLOADER,
            vendor_id=vendor,
            product_id=product,
            product_string=product_string,
            manufacturer_string=manufacturer_string,
            serial=serial,
            sysfs_path=str(usb_dir),
            bcd_device=bcd_device,
        )

    if vendor == MELOAUDIO_VENDOR_ID and product == MELOAUDIO_PRODUCT_ID:
        kind = _classify_product_string(product_string)
        return CommanderStatus(
            firmware_kind=kind,
            vendor_id=vendor,
            product_id=product,
            product_string=product_string,
            manufacturer_string=manufacturer_string,
            serial=serial,
            sysfs_path=str(usb_dir),
            bcd_device=bcd_device,
        )

    return None


def detect_commander_status(
    usb_devices_root: Path = USB_DEVICES_ROOT,
) -> CommanderStatus:
    """Probe USB sysfs and classify the connected MIDI Commander.

    Returns ``CommanderFirmwareKind.NOT_PRESENT`` when no MeloAudio
    Commander OR STM32 DFU bootloader is found.

    A connected DFU bootloader is treated as "the Commander, but in
    flash mode" — same physical device, different USB identifier,
    different operator-visible state. The UI uses this to show a
    "Commander is in DFU mode; finish the flash to continue" banner
    instead of "no Commander connected."

    Multiple matches are not expected (the user has at most one
    Commander on the bus). If multiple are found, the first
    DFU/custom/stock match is returned in that priority order so the
    operator sees the most-actionable state first.
    """
    candidates: list[CommanderStatus] = []
    for usb_dir in _scan_usb_devices(usb_devices_root):
        status = _build_status_from_sysfs_dir(usb_dir)
        if status is not None:
            candidates.append(status)

    if not candidates:
        return CommanderStatus(
            firmware_kind=CommanderFirmwareKind.NOT_PRESENT,
            vendor_id=None,
            product_id=None,
            product_string=None,
            manufacturer_string=None,
            serial=None,
            sysfs_path=None,
            bcd_device=None,
        )

    priority = {
        CommanderFirmwareKind.DFU_BOOTLOADER: 0,
        CommanderFirmwareKind.CUSTOM: 1,
        CommanderFirmwareKind.STOCK: 2,
        CommanderFirmwareKind.UNKNOWN: 3,
    }
    candidates.sort(key=lambda c: priority.get(c.firmware_kind, 99))
    return candidates[0]
