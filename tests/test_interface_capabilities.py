"""T2517-3 — Interface-capability registry regression tests.

Asserts the registry reads the real device packs in this repo and exposes the
T2515/T2517 capability declarations:
  * TASCAM US-144MKII — `digital_io_stereo`, `spdif_coax`, `midi_1_in_1_out`
  * Edirol UA-1000  — `digital_io_stereo`, `spdif_coax`, `adat`, `r_bus`
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.services.effects.interface_capabilities import (
    DEVICE_PACKS_ROOT,
    list_interfaces_with_all_capabilities,
    list_interfaces_with_capability,
    load_interface_capabilities,
)


def test_loads_tascam_and_edirol_capability_decls():
    registry = load_interface_capabilities()
    assert "tascam.us-144mkii" in registry, sorted(registry)
    assert "edirol-ua.ua-1000" in registry, sorted(registry)
    tascam = registry["tascam.us-144mkii"]
    edirol = registry["edirol-ua.ua-1000"]
    assert "digital_io_stereo" in tascam.capabilities
    assert "spdif_coax" in tascam.capabilities
    assert "digital_io_stereo" in edirol.capabilities
    assert "spdif_coax" in edirol.capabilities


def test_list_with_capability_returns_both_spdif_capable_interfaces():
    matches = {c.interface_id for c in list_interfaces_with_capability("spdif_coax")}
    assert {"tascam.us-144mkii", "edirol-ua.ua-1000"}.issubset(matches)


def test_neither_interface_declares_aes_ebu():
    """Sanity check on Q&A locked decisions — no rig device has native AES yet."""
    matches = {c.interface_id for c in list_interfaces_with_capability("aes_ebu")}
    assert "tascam.us-144mkii" not in matches
    assert "edirol-ua.ua-1000" not in matches


def test_list_with_all_capabilities_does_intersection():
    matches = list_interfaces_with_all_capabilities(["digital_io_stereo", "adat"])
    ids = {c.interface_id for c in matches}
    assert "edirol-ua.ua-1000" in ids
    # US-144MKII has no ADAT
    assert "tascam.us-144mkii" not in ids


def test_only_profiles_with_capability_blocks_are_indexed(tmp_path: Path):
    """Profiles without `capabilities:` are skipped, not silently included."""
    pack = tmp_path / "fakepack" / "profiles"
    pack.mkdir(parents=True)
    (pack / "no-caps.audio.yaml").write_text(
        yaml.safe_dump(
            {
                "schema_version": 1,
                "identity": {"manufacturer": "Test", "model": "no-caps"},
                "ports": [],
            }
        )
    )
    registry = load_interface_capabilities(root=tmp_path)
    assert registry == {}


def test_interface_display_name_combines_manufacturer_and_model():
    registry = load_interface_capabilities()
    tascam = registry["tascam.us-144mkii"]
    assert "TASCAM" in tascam.display_name
    assert "US-144MKII" in tascam.display_name


def test_real_repo_packs_have_consistent_packids():
    """Registry interface_ids = `<packdir>.<model>` — must match disk layout."""
    registry = load_interface_capabilities()
    for cap in registry.values():
        assert (DEVICE_PACKS_ROOT / cap.pack_id / "profiles" / f"{cap.model_id}.audio.yaml").is_file(), cap
