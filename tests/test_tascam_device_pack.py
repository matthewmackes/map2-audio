"""T2515-3 — TASCAM device-pack smoke + invariants tests.

The platform does not yet have a central device-pack schema validator, so this
suite asserts the specific contract this pack establishes with the rest of
the platform: hardware-FX bridge port roles, capability tags, and S/PDIF
channel-index claims that T2517 binds to.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

PACK_ROOT = Path(__file__).resolve().parents[1] / "device-packs" / "tascam"


def _load_yaml(p: Path):
    with p.open("r", encoding="utf-8") as fp:
        return yaml.safe_load(fp)


def test_pack_yaml_parses_and_advertises_us_144mkii():
    pack = _load_yaml(PACK_ROOT / "pack.yaml")
    assert pack["schema_version"] == 1
    assert pack["pack_id"] == "tascam"
    assert "us-144mkii" in pack["models"]
    assert pack["license"] == "AGPL-3.0-only"
    assert pack["source"] == "map2-native"
    assert pack["identifier_rules_path"] == "shared/identifier_rules.yaml"


def test_identifier_rules_vendor_and_pids():
    rules = _load_yaml(PACK_ROOT / "shared" / "identifier_rules.yaml")
    assert rules["vendor_id"] == 0x0644
    assert rules["product_ids"]["us-144mkii"] == 0x8020
    assert rules["product_ids"]["us-144mkii-boot"] == 0x800F


def test_audio_profile_identity_kernel_module_and_card_regex():
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    identity = profile["identity"]
    assert identity["hardware_id"] == "usb:0644:8020"
    assert identity["hardware_id_boot"] == "usb:0644:800F"
    assert identity["kernel_module"] == "snd-usb-us144mkii"
    assert identity["alsa_card_regex"].startswith("^US144MKII")


def test_audio_profile_spdif_ports_are_hardware_fx_bridge_capable():
    """T2517 binds to this role flag; do not regress it."""
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    spdif_ports = [p for p in profile["ports"] if p["id"].startswith("spdif_")]
    assert len(spdif_ports) == 2, "expected exactly spdif_in + spdif_out"
    for port in spdif_ports:
        assert port.get("role") == "hardware_fx_bridge_capable", port
        assert port.get("role_format") == "spdif_coax", port
        assert port["channel_indices"] == [2, 3], port
        assert "rca_coax_spdif" in port["connectors"]


def test_audio_profile_analog_ports_have_channel_indices_0_1():
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    analog_ports = [p for p in profile["ports"] if p["id"].startswith("analog_")]
    assert len(analog_ports) == 2
    for port in analog_ports:
        assert port["channel_indices"] == [0, 1]


def test_audio_profile_sample_rate_policy_matches_tier1_locks():
    """Tier A locks: 48 kHz / 64-sample. SR change requires stream stop."""
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    policy = profile["sample_rate_policy"]
    assert policy["tier1_default"] == 48000
    assert policy["tier1_buffer_size"] == 64
    assert policy["requires_stream_stop_for_sr_change"] is True
    assert policy["prefer_jack"] is True


def test_audio_profile_clock_sources_include_internal_and_spdif():
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    sources = {s["id"] for s in profile["clock_sources"]}
    assert {"internal_48k", "spdif_in"}.issubset(sources)
    default = next(s for s in profile["clock_sources"] if s.get("is_default"))
    assert default["id"] == "internal_48k"


def test_audio_profile_advertises_interface_capabilities():
    """T2517 effects-chooser availability gating reads these tags."""
    profile = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.audio.yaml")
    caps = profile["capabilities"]
    assert "digital_io_stereo" in caps
    assert "spdif_coax" in caps


def test_midi_profile_alsa_client_pattern():
    midi = _load_yaml(PACK_ROOT / "profiles" / "us-144mkii.midi.yaml")
    assert midi["identity"]["alsa_client_pattern"] == "TASCAM US-144MKII"
    # No hardware controls → no MIDI bindings declared
    assert midi.get("controls") == []


def test_pack_directory_layout():
    """All expected files exist (regression for partial-pack failures)."""
    for relpath in (
        "pack.yaml",
        "shared/identifier_rules.yaml",
        "profiles/us-144mkii.audio.yaml",
        "profiles/us-144mkii.midi.yaml",
        "scripts/us-144mkii-scripts.js",
    ):
        assert (PACK_ROOT / relpath).is_file(), f"missing {relpath}"
