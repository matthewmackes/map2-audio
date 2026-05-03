"""Lexicon MPX-1 device-pack registry wiring (T2459-H4 slice 7).

The pack files at device-packs/lexicon/ already shipped (pre-existing
authoring surface — see device-packs/lexicon/pack.yaml header). This
test slice wires the pack into the canonical profile registry,
mirrors the legacy-id alias pattern from MeloAudio + Maschine MK1
slices, and pins the front-panel control inventory + identity.

The Python SysEx parser (mpx1_syx_parser.py) stays in place — its
tag-extraction was migrated to the device-pack JS runtime in
T2459-H4 Slice 4. The librarian / preset registry surface
(mpx1_service.py) is database-backed and remains Python-owned.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from app.services.midi_device_profiles import (
    LEGACY_LEXICON_MPX1_PROFILE_ID,
    LEXICON_MPX1_PACK_PROFILE_PATH,
    LEXICON_MPX1_PROFILE_ID,
    MIDIDeviceProfileService,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
PACK_DIR = REPO_ROOT / "device-packs" / "lexicon"


def _load_profile_yaml() -> dict:
    return yaml.safe_load(LEXICON_MPX1_PACK_PROFILE_PATH.read_text(encoding="utf-8"))


def test_pack_files_exist() -> None:
    assert (PACK_DIR / "pack.yaml").exists()
    assert LEXICON_MPX1_PACK_PROFILE_PATH.exists()
    assert (PACK_DIR / "scripts" / "mpx1.js").exists()


def test_profile_loads_via_registry_under_canonical_id() -> None:
    service = MIDIDeviceProfileService()
    profile = service.get_profile(LEXICON_MPX1_PROFILE_ID)
    assert profile is not None
    assert profile["profile_id"] == LEXICON_MPX1_PROFILE_ID
    assert profile["manufacturer"] == "Lexicon"
    assert "MPX-1" in profile["name"]


def test_legacy_alias_resolves_to_canonical() -> None:
    service = MIDIDeviceProfileService()
    legacy = service.get_profile(LEGACY_LEXICON_MPX1_PROFILE_ID)
    assert legacy is not None
    assert legacy["profile_id"] == LEXICON_MPX1_PROFILE_ID
    assert legacy["profile_id_canonical"] == LEXICON_MPX1_PROFILE_ID
    assert service.is_lexicon_mpx1_profile_id(LEGACY_LEXICON_MPX1_PROFILE_ID) is True
    assert service.is_lexicon_mpx1_profile_id(LEXICON_MPX1_PROFILE_ID) is True
    assert service.is_lexicon_mpx1_profile_id("meloaudio_commander") is False
    assert service.is_lexicon_mpx1_profile_id(None) is False


def test_profile_identity_matches_pack_yaml() -> None:
    doc = _load_profile_yaml()
    identity = doc.get("identity", {})
    assert identity.get("manufacturer") == "Lexicon"
    assert identity.get("model") == "mpx1"
    assert identity.get("alsa_client_pattern") == "MPX"


def test_profile_yaml_declares_front_panel_controls() -> None:
    """The MPX-1's MIDI surface is the front-panel CC events: Adjust
    knob (CC 7), Bypass (CC 64), Tap (CC 65), and program-change
    (status 0xC0). The bulk of the device's parameter/preset surface
    rides SysEx, which the Python parser still owns."""
    doc = _load_profile_yaml()
    controls = doc.get("controls", []) or []
    by_status_midino = {(c.get("status"), c.get("midino")) for c in controls}
    assert (0xB0, 7) in by_status_midino, "Adjust knob (CC 7) missing"
    assert (0xB0, 64) in by_status_midino, "Bypass (CC 64) missing"
    assert (0xB0, 65) in by_status_midino, "Tap (CC 65) missing"
    pc_rows = [c for c in controls if c.get("status") == 0xC0]
    assert pc_rows, "program-change row missing"
    sysex_rows = [c for c in controls if c.get("status") == 0xF0]
    assert sysex_rows, "SysEx sentinel row missing"


def test_profile_scripts_reference_resolves() -> None:
    doc = _load_profile_yaml()
    scripts = doc.get("scripts", []) or []
    assert scripts, "profile must declare a scripts: entry"
    for ref in scripts:
        assert (PACK_DIR / ref).exists(), f"script reference {ref} must exist"


def test_pack_manifest_declares_canonical_metadata() -> None:
    doc = yaml.safe_load((PACK_DIR / "pack.yaml").read_text(encoding="utf-8"))
    assert doc["pack_id"] == "lexicon"
    assert doc["vendor"]["name"] == "Lexicon"
    assert doc["license"] == "AGPL-3.0-only"
    assert doc["source"] == "map2-native"
    assert "mpx1" in doc["models"]


def test_profile_includes_program_offset_setting() -> None:
    """The MPX-1 ships 200 factory + 50 user programs; the pack
    exposes a `mpx1_program_offset` setting for operators who map
    MAP2 snapshots into that catalog."""
    doc = _load_profile_yaml()
    settings = doc.get("settings", []) or []
    setting_ids = {s.get("id") for s in settings}
    assert "mpx1_program_offset" in setting_ids
    assert "mpx1_sysex_passthrough" in setting_ids
