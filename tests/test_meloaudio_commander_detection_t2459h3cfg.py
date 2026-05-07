"""T2459-H3-CFG Phase 1 — MeloAudio Commander firmware-detection tests.

Hermetic tests: synthesize a fake USB sysfs tree under tmp_path and pass
the root to ``detect_commander_status``. No real hardware required.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services.devices.meloaudio.commander_detection import (
    CommanderFirmwareKind,
    CommanderStatus,
    detect_commander_status,
)


def _write_usb_device(
    root: Path,
    *,
    name: str,
    id_vendor: str,
    id_product: str,
    product: str | None = None,
    manufacturer: str | None = None,
    serial: str | None = None,
    bcd_device: str | None = None,
) -> Path:
    """Create a fake sysfs USB device directory.

    Mirrors the layout the kernel exposes under /sys/bus/usb/devices/ —
    one directory per device with idVendor/idProduct/product/manufacturer/
    serial/bcdDevice text files.
    """
    dev = root / name
    dev.mkdir(parents=True, exist_ok=True)
    (dev / "idVendor").write_text(id_vendor)
    (dev / "idProduct").write_text(id_product)
    if product is not None:
        (dev / "product").write_text(product)
    if manufacturer is not None:
        (dev / "manufacturer").write_text(manufacturer)
    if serial is not None:
        (dev / "serial").write_text(serial)
    if bcd_device is not None:
        (dev / "bcdDevice").write_text(bcd_device)
    return dev


def test_no_devices_returns_not_present(tmp_path: Path) -> None:
    """Empty sysfs tree → NOT_PRESENT."""
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.NOT_PRESENT
    assert not status.is_present
    assert not status.supports_canonical_config_push
    assert not status.supports_discovery_wizard


def test_only_unrelated_devices_returns_not_present(tmp_path: Path) -> None:
    """A USB tree with non-Commander devices (e.g. keyboard, hub) → NOT_PRESENT."""
    _write_usb_device(
        tmp_path, name="3-3", id_vendor="0c45", id_product="5004",
        product="Redragon Mitra RGB Keyboard",
    )
    _write_usb_device(
        tmp_path, name="3-2", id_vendor="0bda", id_product="5411",
        product="USB Hub",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.NOT_PRESENT


def test_stock_firmware_classification(tmp_path: Path) -> None:
    """MeloAudio vendor + product + iProduct=TSMIDI2.0 → STOCK."""
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="TSMIDI2.0",
        manufacturer="MeloAudio",
        serial="000000000000011",
        bcd_device="2.00",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.STOCK
    assert status.is_present
    assert status.supports_discovery_wizard
    assert not status.supports_canonical_config_push
    assert status.vendor_id == 0x2EEE
    assert status.product_id == 0x0301
    assert status.product_string == "TSMIDI2.0"
    assert status.manufacturer_string == "MeloAudio"
    assert status.serial == "000000000000011"
    assert status.bcd_device == "2.00"


def test_custom_firmware_classification(tmp_path: Path) -> None:
    """harvie256 firmware advertises an iProduct string containing 'STM'.

    It re-uses the same MeloAudio USB vendor/product IDs (since the
    underlying STM32 chip's USB descriptors are firmware-defined and the
    custom firmware doesn't bother re-registering for a different vendor
    pair). Disambiguation is by product string only.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="STM32 Customisable Midi Foot Controller",
        manufacturer="harvie256",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.CUSTOM
    assert status.is_present
    assert status.supports_discovery_wizard
    assert status.supports_canonical_config_push
    assert status.product_string == "STM32 Customisable Midi Foot Controller"


def test_dfu_bootloader_classification(tmp_path: Path) -> None:
    """When in DFU mode the device exposes the STM32 ROM bootloader
    USB ID (0483:DF11), NOT the MeloAudio IDs. We treat this as 'the
    Commander, but in flash mode' so the UI can prompt the operator
    to finish the install rather than showing 'no Commander connected'.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="0483", id_product="df11",
        product="STM32 BOOTLOADER",
        manufacturer="STMicroelectronics",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.DFU_BOOTLOADER
    assert status.is_present
    assert not status.supports_discovery_wizard
    assert not status.supports_canonical_config_push


def test_unknown_iproduct_string(tmp_path: Path) -> None:
    """MeloAudio vendor/product pair but the iProduct string doesn't
    match either fingerprint → UNKNOWN. This is a defensive case for a
    third-party firmware that re-uses MeloAudio's USB IDs but identifies
    itself differently. Operator sees the device but neither path is
    enabled until we know what we're talking to.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="MysteryFirmware v9000",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.UNKNOWN
    assert status.is_present
    assert not status.supports_discovery_wizard
    assert not status.supports_canonical_config_push


def test_missing_iproduct_treated_as_unknown(tmp_path: Path) -> None:
    """Some kernels don't expose iProduct for every device (esp. during
    transient enumeration states). Without the string we can't tell stock
    from custom, so the safer answer is UNKNOWN.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        # no product=
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.UNKNOWN


def test_dfu_takes_priority_over_other_devices(tmp_path: Path) -> None:
    """If somehow BOTH a normal-mode Commander AND a DFU bootloader are
    on the bus (which shouldn't happen in practice but might during a
    multi-device debug session), the DFU bootloader is the
    most-actionable state — surface it.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="TSMIDI2.0",
    )
    _write_usb_device(
        tmp_path, name="3-13.5",
        id_vendor="0483", id_product="df11",
        product="STM32 BOOTLOADER",
    )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.DFU_BOOTLOADER


def test_interface_directories_skipped(tmp_path: Path) -> None:
    """The kernel exposes USB interfaces as sibling directories with a
    colon in the basename (e.g. ``3-13.4:1.0``). Those are NOT top-level
    USB devices and have no idVendor/idProduct files; the scanner must
    skip them so it doesn't generate false positives or noisy errors.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="TSMIDI2.0",
    )
    # An interface directory next to the real device.
    interface = tmp_path / "3-13.4:1.0"
    interface.mkdir(parents=True)
    # Interface dirs don't have idVendor; if the scanner doesn't skip
    # them the call would return None (which is fine) but a buggy
    # scanner might raise.
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is CommanderFirmwareKind.STOCK


def test_missing_root_returns_not_present(tmp_path: Path) -> None:
    """If the sysfs root doesn't exist (e.g. running on a non-Linux dev
    machine), the detector returns NOT_PRESENT rather than crashing.
    """
    nonexistent = tmp_path / "does-not-exist"
    status = detect_commander_status(usb_devices_root=nonexistent)
    assert status.firmware_kind is CommanderFirmwareKind.NOT_PRESENT


@pytest.mark.parametrize("product_value,expected", [
    ("TSMIDI2.0", CommanderFirmwareKind.STOCK),
    ("STM32 Customisable", CommanderFirmwareKind.CUSTOM),
    ("STM32 Custom Midi Commander v0.9", CommanderFirmwareKind.CUSTOM),
    ("Some STM-based whatever", CommanderFirmwareKind.CUSTOM),
    ("RandomThirdParty", CommanderFirmwareKind.UNKNOWN),
    ("", CommanderFirmwareKind.UNKNOWN),
])
def test_product_string_classification_matrix(
    tmp_path: Path, product_value: str, expected: CommanderFirmwareKind
) -> None:
    """Pin the product-string fingerprinting logic across a matrix of
    realistic firmware strings.
    """
    if product_value == "":
        # Empty product string means the kernel didn't expose iProduct;
        # this is the same case as 'no product file at all' from the
        # detector's perspective. Don't write the file.
        _write_usb_device(
            tmp_path, name="3-13.4",
            id_vendor="2eee", id_product="0301",
        )
    else:
        _write_usb_device(
            tmp_path, name="3-13.4",
            id_vendor="2eee", id_product="0301",
            product=product_value,
        )
    status = detect_commander_status(usb_devices_root=tmp_path)
    assert status.firmware_kind is expected


def test_status_fields_propagate_through_dataclass(tmp_path: Path) -> None:
    """All descriptor fields surface through to CommanderStatus so the
    UI can render a 'detected: model X, serial Y, firmware Z.W' card.
    """
    _write_usb_device(
        tmp_path, name="3-13.4",
        id_vendor="2eee", id_product="0301",
        product="TSMIDI2.0",
        manufacturer="MeloAudio",
        serial="ABC123",
        bcd_device="2.00",
    )
    status: CommanderStatus = detect_commander_status(usb_devices_root=tmp_path)
    # All the descriptors round-trip
    assert status.product_string == "TSMIDI2.0"
    assert status.manufacturer_string == "MeloAudio"
    assert status.serial == "ABC123"
    assert status.bcd_device == "2.00"
    assert status.sysfs_path is not None
    assert "3-13.4" in status.sysfs_path
    # And the dataclass is hashable (frozen) so it can be cached.
    assert isinstance(hash(status), int)
