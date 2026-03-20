#!/usr/bin/env python3
"""
Validate factory drum-kit sourcing and SFZ topology.

Checks:
- expected kits exist
- sourcing manifest matches on-disk inventory
- each kit has 16 SFZ programs
- each program has 3 velocity layers and 2 round-robin alternates
- open/closed hats share a choke group
- referenced samples exist
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KITS_ROOT = ROOT / "data" / "drums" / "factory_kits"
MANIFEST_PATH = KITS_ROOT / "SOURCING_MANIFEST.json"
EXPECTED_KITS = ("standard_rock", "electronic_808", "electronic_909", "jazz_brush")
EXPECTED_VELOCITY_SPLITS = ((1, 42), (43, 90), (91, 127))
EXPECTED_ROUND_ROBIN = (1, 2)
EXPECTED_PROGRAMS_PER_KIT = 16
EXPECTED_SAMPLES_PER_KIT = EXPECTED_PROGRAMS_PER_KIT * len(EXPECTED_VELOCITY_SPLITS) * len(EXPECTED_ROUND_ROBIN)


def _extract_samples(sfz_text: str) -> list[str]:
    return re.findall(r"^sample=(.+)$", sfz_text, re.MULTILINE)


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text())
    assert manifest["license"] == "CC0-1.0"
    manifest_by_kit = {entry["kit_id"]: entry for entry in manifest["kits"]}
    assert tuple(sorted(manifest_by_kit)) == tuple(sorted(EXPECTED_KITS))

    validated_kits = []
    total_samples = 0
    total_programs = 0

    for kit_id in EXPECTED_KITS:
        kit_root = KITS_ROOT / kit_id
        assert kit_root.exists(), f"missing kit root: {kit_id}"
        kit_manifest = manifest_by_kit[kit_id]

        kit_json = json.loads((kit_root / "kit.json").read_text())
        assert len(kit_json["instruments"]) == EXPECTED_PROGRAMS_PER_KIT, f"{kit_id}: expected 16 instruments"

        sfz_paths = sorted(path for path in kit_root.glob("*.sfz"))
        assert len(sfz_paths) == EXPECTED_PROGRAMS_PER_KIT, f"{kit_id}: expected 16 sfz programs"

        sample_count = 0
        for sfz_path in sfz_paths:
            sfz_text = sfz_path.read_text()
            assert sfz_text.count("<region>") == len(EXPECTED_VELOCITY_SPLITS) * len(EXPECTED_ROUND_ROBIN), (
                f"{kit_id}/{sfz_path.name}: wrong region count"
            )
            for lovel, hivel in EXPECTED_VELOCITY_SPLITS:
                assert f"lovel={lovel}" in sfz_text, f"{kit_id}/{sfz_path.name}: missing lovel={lovel}"
                assert f"hivel={hivel}" in sfz_text, f"{kit_id}/{sfz_path.name}: missing hivel={hivel}"
            for rr in EXPECTED_ROUND_ROBIN:
                assert f"seq_position={rr}" in sfz_text, f"{kit_id}/{sfz_path.name}: missing seq_position={rr}"
            assert "seq_length=2" in sfz_text, f"{kit_id}/{sfz_path.name}: missing seq_length=2"

            sample_paths = _extract_samples(sfz_text)
            assert len(sample_paths) == 6, f"{kit_id}/{sfz_path.name}: expected 6 sample references"
            for rel_path in sample_paths:
                resolved = (sfz_path.parent / rel_path).resolve()
                assert resolved.exists(), f"{kit_id}/{sfz_path.name}: missing sample {rel_path}"
            sample_count += len(sample_paths)

        open_hat_text = (kit_root / "open_hat.sfz").read_text()
        closed_hat_text = (kit_root / "closed_hat.sfz").read_text()
        assert "group=10" in open_hat_text and "off_by=10" in open_hat_text, f"{kit_id}: open hat choke missing"
        assert "group=10" in closed_hat_text and "off_by=10" in closed_hat_text, f"{kit_id}: closed hat choke missing"

        assert kit_manifest["sfz_program_count"] == EXPECTED_PROGRAMS_PER_KIT, f"{kit_id}: manifest sfz count mismatch"
        assert kit_manifest["sample_file_count"] == EXPECTED_SAMPLES_PER_KIT, f"{kit_id}: manifest sample count mismatch"
        assert kit_manifest["velocity_layers_per_instrument"] == len(EXPECTED_VELOCITY_SPLITS)
        assert kit_manifest["round_robin_variations_per_instrument"] == len(EXPECTED_ROUND_ROBIN)
        assert kit_manifest["hihat_choke_group"] == 10

        total_programs += len(sfz_paths)
        total_samples += sample_count
        validated_kits.append(kit_id)

    print(
        json.dumps(
            {
                "validated_kits": validated_kits,
                "total_kits": len(validated_kits),
                "total_programs": total_programs,
                "total_samples": total_samples,
                "license": manifest["license"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
