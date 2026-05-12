"""T2515-1 regression tests for TASCAM US-144MKII inventory + identity wiring.

Asserts:
  * Operational VID/PID 0644:8020 is recognized as 'TASCAM US-144MKII' in
    both the cluster hardware inventory display map and the NodeHardwareDetector
    canonical ID table.
  * Boot/loader PID 0644:800F is intentionally NOT mapped — the kernel driver
    re-enumerates the device to 0x8020 before audio is usable, so the platform
    must not advertise the boot stage as a connected interface.
  * The vendor ID 0644 is in the audio-interface vendor allowlist.
  * `TASCAM_DEVICES["us-144mkii"]` registry shape matches the locked spec.
"""

from __future__ import annotations

import pytest

from app.services.cluster.enhanced_node_identity import NodeHardwareDetector
from app.services.cluster.hardware_inventory import _KNOWN_USB_AUDIO_NAMES
from app.services.usb_audio_manager import AUDIO_INTERFACE_VENDOR_IDS, TASCAM_DEVICES


CANONICAL_NAME = "TASCAM US-144MKII"
OPERATIONAL_VID = "0644"
OPERATIONAL_PID = "8020"
BOOT_PID = "800F"


def test_operational_vidpid_is_recognized_in_cluster_inventory():
    key = f"{OPERATIONAL_VID}:{OPERATIONAL_PID}"
    assert key in _KNOWN_USB_AUDIO_NAMES
    assert _KNOWN_USB_AUDIO_NAMES[key] == CANONICAL_NAME


def test_boot_vidpid_is_intentionally_unmapped_in_cluster_inventory():
    """Boot/loader PID must NOT register as a connected device."""
    boot_key = f"{OPERATIONAL_VID}:{BOOT_PID}"
    assert boot_key not in _KNOWN_USB_AUDIO_NAMES


def test_operational_vidpid_is_recognized_in_node_hardware_detector():
    key = (OPERATIONAL_VID, OPERATIONAL_PID)
    assert key in NodeHardwareDetector.KNOWN_USB_AUDIO_IDS
    assert NodeHardwareDetector.KNOWN_USB_AUDIO_IDS[key] == CANONICAL_NAME


def test_boot_vidpid_is_intentionally_unmapped_in_node_hardware_detector():
    boot_key = (OPERATIONAL_VID, BOOT_PID)
    assert boot_key not in NodeHardwareDetector.KNOWN_USB_AUDIO_IDS


def test_tascam_vendor_in_audio_interface_allowlist():
    assert OPERATIONAL_VID in AUDIO_INTERFACE_VENDOR_IDS


def test_tascam_devices_registry_shape():
    spec = TASCAM_DEVICES["us-144mkii"]
    assert spec.name == CANONICAL_NAME
    assert spec.vendor_id == OPERATIONAL_VID
    assert spec.product_id == OPERATIONAL_PID
    assert spec.boot_product_id == BOOT_PID
    assert spec.channels_in == 4   # 2 analog + 2 S/PDIF
    assert spec.channels_out == 4
    assert spec.bit_depth == 24
    assert 48000 in spec.sample_rates
    assert spec.kernel_module == "snd-usb-us144mkii"


@pytest.mark.parametrize(
    "vid,pid,expected",
    [
        ("0644", "8020", CANONICAL_NAME),
        ("0582", "0074", "Edirol UA-1000"),
        ("84ef", "0014", "Hotone Jogg USB Audio"),
    ],
)
def test_known_usb_audio_ids_round_trip(vid: str, pid: str, expected: str):
    """Tier-1 devices are jointly indexed in the canonical detector map."""
    assert NodeHardwareDetector.KNOWN_USB_AUDIO_IDS[(vid, pid)] == expected
