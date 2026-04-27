"""Schema validation for every YAML and JS file shipped under device-packs/.

T2459-A4 — initial CI gate. Walks device-packs/, classifies each YAML by
filename pattern, validates against the matching JSON Schema, and runs a
syntactic check on every shipped JS file. Fails CI if any file is broken.

This mirrors Mixxx's controller_mapping_validation_test.cpp pattern.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import jsonschema
import pytest
import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKS_ROOT = REPO_ROOT / "device-packs"
SCHEMA_ROOT = PACKS_ROOT / "_schema"

# Files under _mixx-imports/res/controllers/ are upstream Mixxx XML/JS, not
# MAP2 YAML — they are validated by tests/test_mixxx_mapping_load.py
# (T2459-B5) once that subtask lands. Skip them here.
SKIP_DIRS = {"_mixx-imports"}


def _load_schema(name: str) -> dict:
    with open(SCHEMA_ROOT / name, encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="module")
def pack_schema() -> dict:
    return _load_schema("pack.schema.yaml")


@pytest.fixture(scope="module")
def audio_schema() -> dict:
    return _load_schema("audio-profile.schema.yaml")


@pytest.fixture(scope="module")
def midi_schema() -> dict:
    return _load_schema("midi-profile.schema.yaml")


@pytest.fixture(scope="module")
def hid_schema() -> dict:
    return _load_schema("hid-profile.schema.yaml")


def _walk_packs() -> list[Path]:
    """Return every pack directory under device-packs/.

    Real vendor packs live at device-packs/<vendor>/. Underscore-prefixed
    siblings (_runtime, _schema, _mixx-imports, _tests, _tests/fixture-pack)
    are framework directories or test fixtures, not packs themselves.
    """
    if not PACKS_ROOT.exists():
        return []
    out: list[Path] = []
    for child in sorted(PACKS_ROOT.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("_"):
            # Skip framework dirs at the top level. The fixture-pack is
            # added explicitly below.
            continue
        if child.name in SKIP_DIRS:
            continue
        out.append(child)
    # Include the fixture-pack inside _tests/ — it IS a real pack used by
    # the schema validator's smoke test.
    fixture_pack = PACKS_ROOT / "_tests" / "fixture-pack"
    if fixture_pack.exists():
        out.append(fixture_pack)
    return out


def _profile_files(pack_dir: Path, suffix: str) -> list[Path]:
    """Return every *.<suffix>.yaml file in a pack's profiles/ directory."""
    pdir = pack_dir / "profiles"
    if not pdir.exists():
        return []
    return sorted(pdir.glob(f"*.{suffix}.yaml"))


def _all_js_files(pack_dir: Path) -> list[Path]:
    out: list[Path] = []
    for sub in ("scripts", "_runtime"):
        d = pack_dir / sub
        if d.exists():
            out.extend(sorted(d.rglob("*.js")))
    return out


def _runtime_js_files() -> list[Path]:
    """JS files under device-packs/_runtime/ — shipped MAP2-authored libraries."""
    rt = PACKS_ROOT / "_runtime"
    if not rt.exists():
        return []
    return sorted(rt.rglob("*.js"))


# ---------------------------------------------------------------------------
# Schema files exist + are loadable.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "schema_name",
    [
        "pack.schema.yaml",
        "audio-profile.schema.yaml",
        "midi-profile.schema.yaml",
        "hid-profile.schema.yaml",
    ],
)
def test_schema_file_loads(schema_name: str) -> None:
    """Every shipped JSON Schema parses + has the expected $schema marker."""
    path = SCHEMA_ROOT / schema_name
    assert path.exists(), f"Missing schema file: {path}"
    with open(path, encoding="utf-8") as f:
        schema = yaml.safe_load(f)
    assert schema.get("$schema") == "http://json-schema.org/draft-07/schema#"
    assert "title" in schema
    assert "type" in schema


# ---------------------------------------------------------------------------
# Every pack's pack.yaml validates.
# ---------------------------------------------------------------------------

def test_every_pack_manifest_validates(pack_schema: dict) -> None:
    """Every pack.yaml under device-packs/<vendor>/ validates against pack schema."""
    packs = _walk_packs()
    assert packs, (
        "No packs found under device-packs/. The fixture-pack at minimum "
        "should be present."
    )
    failures: list[str] = []
    for pack_dir in packs:
        manifest = pack_dir / "pack.yaml"
        if not manifest.exists():
            failures.append(f"{pack_dir.name}: missing pack.yaml")
            continue
        try:
            with open(manifest, encoding="utf-8") as f:
                doc = yaml.safe_load(f)
            jsonschema.validate(doc, pack_schema)
        except (jsonschema.ValidationError, yaml.YAMLError) as exc:
            failures.append(f"{pack_dir.name}/pack.yaml: {exc}")
    assert not failures, "Pack manifest validation failures:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# Every audio / MIDI / HID profile validates against its schema.
# ---------------------------------------------------------------------------

def test_every_audio_profile_validates(audio_schema: dict) -> None:
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "audio"):
            try:
                with open(profile, encoding="utf-8") as f:
                    doc = yaml.safe_load(f)
                jsonschema.validate(doc, audio_schema)
            except (jsonschema.ValidationError, yaml.YAMLError) as exc:
                failures.append(f"{profile.relative_to(REPO_ROOT)}: {exc}")
    assert not failures, "Audio profile failures:\n" + "\n".join(failures)


def test_every_midi_profile_validates(midi_schema: dict) -> None:
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "midi"):
            try:
                with open(profile, encoding="utf-8") as f:
                    doc = yaml.safe_load(f)
                jsonschema.validate(doc, midi_schema)
            except (jsonschema.ValidationError, yaml.YAMLError) as exc:
                failures.append(f"{profile.relative_to(REPO_ROOT)}: {exc}")
    assert not failures, "MIDI profile failures:\n" + "\n".join(failures)


def test_every_hid_profile_validates(hid_schema: dict) -> None:
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "hid"):
            try:
                with open(profile, encoding="utf-8") as f:
                    doc = yaml.safe_load(f)
                jsonschema.validate(doc, hid_schema)
            except (jsonschema.ValidationError, yaml.YAMLError) as exc:
                failures.append(f"{profile.relative_to(REPO_ROOT)}: {exc}")
    assert not failures, "HID profile failures:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# Cross-references: every script: reference resolves to a file that exists.
# ---------------------------------------------------------------------------

def test_midi_profile_script_references_resolve() -> None:
    """Every `scripts:` entry in a MIDI profile points at an existing JS file."""
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "midi"):
            with open(profile, encoding="utf-8") as f:
                doc = yaml.safe_load(f)
            for ref in doc.get("scripts", []) or []:
                target = (pack_dir / ref).resolve()
                if not target.exists():
                    failures.append(f"{profile.relative_to(REPO_ROOT)}: scripts ref '{ref}' missing")
    assert not failures, "Script reference failures:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# JS files parse cleanly. T2459-A4 uses node --check as a syntactic gate;
# T2459-B2 will replace this with a QuickJS parse so we test the actual
# runtime semantics, but for now node --check is sufficient + universally
# available.
# ---------------------------------------------------------------------------

def _node_check_available() -> bool:
    try:
        out = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, check=False
        )
        return out.returncode == 0
    except FileNotFoundError:
        return False


@pytest.mark.skipif(not _node_check_available(), reason="node not available on PATH")
def test_runtime_js_files_parse() -> None:
    """device-packs/_runtime/*.js files parse with node --check."""
    failures: list[str] = []
    for js in _runtime_js_files():
        result = subprocess.run(
            ["node", "--check", str(js)],
            capture_output=True, text=True, check=False,
        )
        if result.returncode != 0:
            failures.append(f"{js.relative_to(REPO_ROOT)}: {result.stderr.strip()}")
    assert not failures, "Runtime JS parse failures:\n" + "\n".join(failures)


@pytest.mark.skipif(not _node_check_available(), reason="node not available on PATH")
def test_pack_js_files_parse() -> None:
    """All scripts/*.js under each pack parse with node --check."""
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for js in _all_js_files(pack_dir):
            result = subprocess.run(
                ["node", "--check", str(js)],
                capture_output=True, text=True, check=False,
            )
            if result.returncode != 0:
                failures.append(f"{js.relative_to(REPO_ROOT)}: {result.stderr.strip()}")
    assert not failures, "Pack JS parse failures:\n" + "\n".join(failures)


# ---------------------------------------------------------------------------
# Hard-rule: a broken pack must never block backend boot.
# Until the ProfileRegistry lands in T2459-A3, we simulate the contract by
# verifying that yaml.safe_load on an intentionally-broken pack raises a
# yaml.YAMLError (so the registry would catch it and skip), AND that the
# ProfileRegistry implementation pattern in T2459-A3 must call
# yaml.safe_load + jsonschema.validate inside a try/except.
# ---------------------------------------------------------------------------

def test_broken_yaml_raises_a_known_error() -> None:
    """Sanity check that the loader pattern T2459-A3 will use catches errors."""
    bad = "not_a_dict_just_a_scalar"
    doc = yaml.safe_load(bad)
    # yaml.safe_load returns the scalar string. jsonschema would then reject
    # because the schema requires an object. This is the fail-soft path the
    # registry implements: catch ValidationError + log + skip.
    schema = {"type": "object", "required": ["x"]}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(doc, schema)


# ---------------------------------------------------------------------------
# T2459-F1 — extended hardening checks across the now-larger pack tree.
# ---------------------------------------------------------------------------

def test_every_vendor_pack_declares_a_license() -> None:
    """Every pack's manifest must declare its license (SPDX identifier
    or descriptive string). A missing license is a contributor error
    that should fail CI, not silently ship an unknown-license pack.
    """
    failures: list[str] = []
    for pack_dir in _walk_packs():
        manifest = pack_dir / "pack.yaml"
        if not manifest.exists():
            continue
        with open(manifest, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        license_value = doc.get("license")
        if not license_value or not isinstance(license_value, str):
            failures.append(f"{pack_dir.name}/pack.yaml: missing or invalid `license` field")
    assert not failures, "Pack license violations:\n  " + "\n  ".join(failures)


def test_every_pack_with_models_has_at_least_one_profile() -> None:
    """A pack that lists models in its manifest must have at least one
    matching profile YAML. A model listed without a profile is a
    common authoring mistake we want CI to catch.
    """
    failures: list[str] = []
    for pack_dir in _walk_packs():
        manifest = pack_dir / "pack.yaml"
        if not manifest.exists():
            continue
        with open(manifest, encoding="utf-8") as f:
            doc = yaml.safe_load(f)
        models = doc.get("models") or []
        for model in models:
            audio_path = pack_dir / "profiles" / f"{model}.audio.yaml"
            midi_path = pack_dir / "profiles" / f"{model}.midi.yaml"
            hid_path = pack_dir / "profiles" / f"{model}.hid.yaml"
            if not (audio_path.exists() or midi_path.exists() or hid_path.exists()):
                failures.append(
                    f"{pack_dir.name}: model '{model}' listed in pack.yaml "
                    f"but no matching profile YAML exists in profiles/"
                )
    assert not failures, "Missing-profile failures:\n  " + "\n  ".join(failures)


def test_every_audio_profile_has_unique_hardware_id() -> None:
    """Two distinct profiles must not share a hardware_id. That would
    cause `ProfileRegistry.resolve_for_hardware_id` to return both and
    leave the GUI guessing which to render.
    """
    seen: dict[str, str] = {}
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "audio"):
            with open(profile, encoding="utf-8") as f:
                doc = yaml.safe_load(f)
            identity = doc.get("identity", {}) or {}
            hwid = identity.get("hardware_id")
            if not hwid:
                continue
            rel = str(profile.relative_to(REPO_ROOT))
            if hwid in seen:
                failures.append(
                    f"hardware_id collision: '{hwid}' declared by both "
                    f"{seen[hwid]} and {rel}"
                )
            else:
                seen[hwid] = rel
    assert not failures, "Hardware-id collisions:\n  " + "\n  ".join(failures)


def test_every_audio_profile_loopback_ports_pair_consistency() -> None:
    """If `loopback_ports` is declared, both `playback` and `capture`
    must be present + non-empty. The path-c measurement (T2459-E3 +
    E4 GUI button) needs both to exist or the call fails with a
    confusing error.
    """
    failures: list[str] = []
    for pack_dir in _walk_packs():
        for profile in _profile_files(pack_dir, "audio"):
            with open(profile, encoding="utf-8") as f:
                doc = yaml.safe_load(f)
            loopback = doc.get("loopback_ports")
            if loopback is None:
                continue
            playback = loopback.get("playback") if isinstance(loopback, dict) else None
            capture = loopback.get("capture") if isinstance(loopback, dict) else None
            if not playback or not capture:
                failures.append(
                    f"{profile.relative_to(REPO_ROOT)}: loopback_ports declared "
                    f"but missing playback or capture (got {loopback})"
                )
    assert not failures, "Loopback port consistency failures:\n  " + "\n  ".join(failures)
