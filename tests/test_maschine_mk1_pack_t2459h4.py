"""Maschine MK1 device-pack cutover regressions (T2459-H4 slice 6).

Verifies the MIDI-mode mapping surface for the NI Maschine MK1 ships as a
device-pack and is loaded by the canonical profile registry. The HID/USB
control surface is out of scope for this slice (per separate-process
isolation in T2459-H).
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.midi_device_profiles import (
    LEGACY_MASCHINE_MK1_PROFILE_ID,
    MASCHINE_MK1_PACK_PROFILE_PATH,
    MASCHINE_MK1_PROFILE_ID,
    MIDIDeviceProfileService,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = REPO_ROOT / "device-packs" / "native-instruments"


def _load_profile_yaml() -> dict:
    return yaml.safe_load(MASCHINE_MK1_PACK_PROFILE_PATH.read_text(encoding="utf-8"))


def test_pack_files_exist() -> None:
    assert (PACK_DIR / "pack.yaml").exists()
    assert MASCHINE_MK1_PACK_PROFILE_PATH.exists()
    assert (PACK_DIR / "scripts" / "maschine-mk1.js").exists()


def test_profile_loads_via_registry_under_canonical_id() -> None:
    service = MIDIDeviceProfileService()

    profile = service.get_profile(MASCHINE_MK1_PROFILE_ID)

    assert profile is not None
    assert profile["profile_id"] == MASCHINE_MK1_PROFILE_ID
    assert profile["manufacturer"] == "Native Instruments"
    assert "Maschine MK1" in profile["name"]


def test_legacy_alias_resolves_to_canonical() -> None:
    service = MIDIDeviceProfileService()

    legacy = service.get_profile(LEGACY_MASCHINE_MK1_PROFILE_ID)

    assert legacy is not None
    assert legacy["profile_id"] == MASCHINE_MK1_PROFILE_ID
    assert legacy["profile_id_canonical"] == MASCHINE_MK1_PROFILE_ID
    assert service.is_maschine_mk1_profile_id(LEGACY_MASCHINE_MK1_PROFILE_ID) is True
    assert service.is_maschine_mk1_profile_id(MASCHINE_MK1_PROFILE_ID) is True
    assert service.is_maschine_mk1_profile_id("meloaudio_commander") is False


def test_profile_yaml_has_expected_control_counts() -> None:
    doc = _load_profile_yaml()
    controls = doc.get("controls", [])

    pads = [c for c in controls if c.get("status") == 0x90 and 36 <= c.get("midino", -1) <= 51]
    encoders = [
        c for c in controls
        if c.get("status") == 0xB0 and c.get("midino") in {0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11}
        and "encoder" in (c.get("script") or "").lower()
    ]
    transport_buttons = [
        c for c in controls if c.get("status") == 0x90 and 60 <= c.get("midino", -1) <= 67
    ]
    group_buttons = [
        c for c in controls
        if c.get("status") == 0xB0 and 20 <= c.get("midino", -1) <= 27
        and (c.get("script") or "").startswith("MaschineMK1.group_")
    ]

    assert len(pads) == 16, f"expected 16 pads, got {len(pads)}"
    assert len(encoders) == 11, f"expected 11 encoders, got {len(encoders)}"
    assert len(transport_buttons) == 8, f"expected 8 transport buttons, got {len(transport_buttons)}"
    assert len(group_buttons) == 8, f"expected 8 group buttons, got {len(group_buttons)}"


def test_profile_identity_matches_virtual_alsa_port() -> None:
    doc = _load_profile_yaml()
    identity = doc.get("identity", {})
    assert identity.get("manufacturer") == "Native Instruments"
    assert identity.get("model") == "maschine-mk1"
    assert identity.get("alsa_client_pattern") == "MAP2:Maschine-MK1"
    assert identity.get("hardware_id") == "usb:17cc:0808"


def test_profile_scripts_reference_resolves() -> None:
    doc = _load_profile_yaml()
    scripts = doc.get("scripts", []) or []
    assert scripts, "profile must declare a scripts: entry"
    for ref in scripts:
        assert (PACK_DIR / ref).exists(), f"script reference {ref} must exist"


@pytest.mark.parametrize(
    "midino,expected_script",
    [
        (9, "MaschineMK1.volume_encoder"),
        (10, "MaschineMK1.tempo_encoder"),
        (11, "MaschineMK1.swing_encoder"),
        (0, "MaschineMK1.navigate_encoder"),
    ],
)
def test_encoder_cc_resolves_to_expected_script(midino: int, expected_script: str) -> None:
    """Default command generation parity: a CC event with the encoder's CC
    number resolves to the expected script binding in the profile."""
    doc = _load_profile_yaml()
    matches = [
        c for c in doc.get("controls", [])
        if c.get("status") == 0xB0 and c.get("midino") == midino
        and (c.get("script") or "").endswith("_encoder")
    ]
    assert matches, f"no encoder control row for CC {midino}"
    assert matches[0].get("script") == expected_script


def test_pack_manifest_declares_canonical_metadata() -> None:
    doc = yaml.safe_load((PACK_DIR / "pack.yaml").read_text(encoding="utf-8"))
    assert doc["pack_id"] == "native-instruments"
    assert doc["vendor"]["name"] == "Native Instruments"
    assert doc["license"] == "AGPL-3.0-only"
    assert doc["source"] == "map2-native"
    assert "maschine-mk1" in doc["models"]
