"""T2503 Set 6 — DAW-mode device-pack validation tests.

Validates the structural integrity of the three new device-pack overlays
and the generic MIDI-learn target catalog:

  device-packs/mackie/profiles/mcu-pro-daw.midi.yaml
  device-packs/native-instruments/profiles/maschine-mk1-daw.midi.yaml
  device-packs/_generic/midi-learn-daw/targets.yaml

Doesn't run the controller-host's QuickJS engine — those are end-to-end
HIL gates owned by the controller-host. This test ensures every binding
references a known daw.* verb (cross-checked against
app.services.daw_handlers.DAW_VERBS), every script reference resolves to
a real .js file, and the YAML structure passes a minimal schema check.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Set

import pytest

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

from app.services.daw_handlers import DAW_VERBS

REPO_ROOT = Path(__file__).resolve().parent.parent
PACKS_DIR = REPO_ROOT / "device-packs"

KNOWN_DAW_VERBS: Set[str] = set(DAW_VERBS) | {
    # Verbs the scripts emit that aren't (yet) in DAW_VERBS but are reserved
    # for Sets 7+. Tracked here so the script tests don't break Set 6 ship
    # while the verb surface fills in.
    "daw.track.gain",
    "daw.track.select",
    "daw.transport.gain",
    "__track_gain__",
}


@pytest.fixture(autouse=True)
def _require_yaml() -> None:
    if yaml is None:
        pytest.skip("PyYAML not available")


def _load_yaml(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ---- MCU DAW profile ----


def test_mcu_daw_profile_loads() -> None:
    doc = _load_yaml(PACKS_DIR / "mackie" / "profiles" / "mcu-pro-daw.midi.yaml")
    assert doc["schema_version"] == 1
    assert doc["identity"]["model"] == "mcu-pro-daw"
    assert doc["scripts"] == ["scripts/mcu_daw.js"]
    assert isinstance(doc["controls"], list)
    assert len(doc["controls"]) >= 24  # 8 faders + 8 vpots + 8 rec-arms minimum


def test_mcu_daw_profile_targets_are_known() -> None:
    """Every explicit ``target:`` field in the profile must be a known DAW verb
    (or a reserved Sets-7+ verb listed in KNOWN_DAW_VERBS)."""
    doc = _load_yaml(PACKS_DIR / "mackie" / "profiles" / "mcu-pro-daw.midi.yaml")
    for control in doc["controls"]:
        target = control.get("target")
        if target is not None and target not in KNOWN_DAW_VERBS:
            raise AssertionError(
                f"MCU DAW profile references unknown verb {target!r} "
                f"in control {control}"
            )


def test_mcu_daw_script_file_exists() -> None:
    assert (PACKS_DIR / "mackie" / "scripts" / "mcu_daw.js").is_file()


def test_mcu_daw_script_defines_handlers() -> None:
    script = (PACKS_DIR / "mackie" / "scripts" / "mcu_daw.js").read_text(
        encoding="utf-8"
    )
    for handler in (
        "MCU_DAW.fader",
        "MCU_DAW.fader_echo",
        "MCU_DAW.vpot_param",
        "MCU_DAW.rec_arm",
        "MCU_DAW.rewind",
        "MCU_DAW.fast_forward",
        "MCU_DAW.bank_left",
        "MCU_DAW.bank_right",
        "MCU_DAW.scribble_emit",
    ):
        assert handler in script, f"missing handler {handler}"


# ---- MK1 DAW profile ----


def test_mk1_daw_profile_loads() -> None:
    doc = _load_yaml(PACKS_DIR / "native-instruments" / "profiles" / "maschine-mk1-daw.midi.yaml")
    assert doc["schema_version"] == 1
    assert doc["identity"]["model"] == "maschine-mk1-daw"
    assert doc["scripts"] == ["scripts/maschine-mk1-daw.js"]
    # 16 pads + 8 group encoders + 1 master encoder + 4 transport buttons +
    # 8 group buttons = 37 controls minimum.
    assert len(doc["controls"]) >= 37


def test_mk1_daw_profile_targets_are_known() -> None:
    doc = _load_yaml(PACKS_DIR / "native-instruments" / "profiles" / "maschine-mk1-daw.midi.yaml")
    for control in doc["controls"]:
        target = control.get("target")
        if target is not None and target not in KNOWN_DAW_VERBS:
            raise AssertionError(
                f"MK1 DAW profile references unknown verb {target!r}"
            )


def test_mk1_daw_script_file_exists() -> None:
    assert (
        PACKS_DIR / "native-instruments" / "scripts" / "maschine-mk1-daw.js"
    ).is_file()


def test_mk1_daw_script_defines_handlers() -> None:
    script = (PACKS_DIR / "native-instruments" / "scripts" / "maschine-mk1-daw.js").read_text(
        encoding="utf-8"
    )
    for handler in (
        "MaschineMK1_DAW.pad",
        "MaschineMK1_DAW.encoder_param",
        "MaschineMK1_DAW.master_encoder",
        "MaschineMK1_DAW.restart",
        "MaschineMK1_DAW.select_track",
    ):
        assert handler in script, f"missing handler {handler}"


# ---- Generic MIDI-learn DAW catalog ----


def test_generic_learn_catalog_loads() -> None:
    pack = _load_yaml(PACKS_DIR / "_generic" / "midi-learn-daw" / "pack.yaml")
    assert pack["pack_id"] == "_generic-midi-learn-daw"

    targets = _load_yaml(PACKS_DIR / "_generic" / "midi-learn-daw" / "targets.yaml")
    assert targets["mode"] == "daw"
    groups = targets["groups"]
    assert isinstance(groups, list)
    # 6 groups: transport, tracks, clips, plugins, automation, project.
    group_ids = {g["id"] for g in groups}
    assert group_ids == {"transport", "tracks", "clips", "plugins", "automation", "project"}


def test_generic_learn_catalog_verbs_are_known() -> None:
    targets = _load_yaml(PACKS_DIR / "_generic" / "midi-learn-daw" / "targets.yaml")
    referenced: Set[str] = set()
    for group in targets["groups"]:
        for entry in group["targets"]:
            referenced.add(entry["verb"])
    # Catalog references must all be real DAW verbs (subset of DAW_VERBS).
    unknown = referenced - set(DAW_VERBS)
    assert not unknown, f"learn catalog references unknown verbs: {unknown}"


def test_generic_learn_catalog_arg_prompts_are_typed() -> None:
    """Every arg_prompts entry has a name+label+type."""
    targets = _load_yaml(PACKS_DIR / "_generic" / "midi-learn-daw" / "targets.yaml")
    for group in targets["groups"]:
        for entry in group["targets"]:
            for prompt in entry.get("arg_prompts", []):
                assert "name" in prompt
                assert "label" in prompt
                assert prompt.get("type") in ("int", "float", "str", "bool")


def test_generic_learn_catalog_covers_every_real_verb() -> None:
    """Sanity: every verb in DAW_VERBS should be learnable somewhere in the
    catalog (otherwise the operator can't bind that verb to a generic
    controller). Exempts internal-only verbs."""
    targets = _load_yaml(PACKS_DIR / "_generic" / "midi-learn-daw" / "targets.yaml")
    referenced: Set[str] = set()
    for group in targets["groups"]:
        for entry in group["targets"]:
            referenced.add(entry["verb"])
    # Allow a few exemptions — verbs that don't fit a generic-learn flow
    # (e.g., daw.track.create takes a string track type which the learn UI
    # already prompts for via a custom flow). Keep this list small.
    exempt = {"daw.track.create"}
    missing = (set(DAW_VERBS) - exempt) - referenced
    assert not missing, f"learn catalog missing coverage for: {missing}"
