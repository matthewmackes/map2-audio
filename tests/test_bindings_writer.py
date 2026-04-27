"""T2459-G7 — bindings writer + Undo round-trip tests.

Builds a tiny pack tree under tmp_path so the writer hits a real
ProfileRegistry without touching the live device-packs/. Exercises:

  - write_bindings happy path: file content changes, schema-validated
    against the loaded midi schema, undo_token issued.
  - apply_undo restores the previous YAML body.
  - schema-invalid payload is rejected with BindingsWriteError.
  - undo with an expired/unknown token errors out.
  - audio profiles are rejected (only midi/hid accept binding writes).
"""

from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.services.controllers.bindings_writer import (
    BindingsWriteError,
    BindingsWriter,
)
from app.services.controllers.profile_registry import ProfileRegistry


REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO_ROOT / "device-packs" / "_schema"


@pytest.fixture
def pack_tree(tmp_path: Path) -> Path:
    """Build a minimal pack tree at tmp_path/device-packs/ with one
    midi profile so the writer can read+write a real YAML file under
    a real ProfileRegistry.
    """
    packs = tmp_path / "device-packs"
    packs.mkdir()

    # Mirror the live schemas so jsonschema validation sees the real
    # structure.
    schema_dest = packs / "_schema"
    shutil.copytree(SCHEMA_DIR, schema_dest)

    # Minimal vendor pack.
    vendor = packs / "fixture-co"
    vendor.mkdir()
    (vendor / "pack.yaml").write_text(yaml.safe_dump({
        "schema_version": 1,
        "pack_id": "fixture-co",
        "vendor": {"name": "Fixture Co"},
        "description": "Test fixture pack for the bindings-writer regression suite.",
        "license": "AGPL-3.0-only",
        "models": ["midi-1"],
    }), encoding="utf-8")

    profiles_dir = vendor / "profiles"
    profiles_dir.mkdir()
    midi_doc = {
        "schema_version": 1,
        "identity": {
            "manufacturer": "Fixture Co",
            "model": "midi-1",
            "hardware_id": "usb:dead:beef",
            "alsa_client_pattern": "Fixture MIDI",
        },
        "controls": [
            {"status": 176, "midino": 7, "channel": 1, "target": "audio.master.volume", "action": "set"},
        ],
        "outputs": [],
    }
    (profiles_dir / "midi-1.midi.yaml").write_text(
        yaml.safe_dump(midi_doc, sort_keys=False), encoding="utf-8",
    )
    return packs


@pytest.fixture
def registry(pack_tree: Path) -> ProfileRegistry:
    reg = ProfileRegistry(packs_root=pack_tree)
    reg.load_packs()
    return reg


def _profile_for(registry: ProfileRegistry, kind: str = "midi"):
    return next(
        p for p in registry.profiles(kind=kind)
        if p.pack_id == "fixture-co" and p.model == "midi-1"
    )


def test_write_bindings_replaces_controls_and_returns_token(registry):
    profile = _profile_for(registry)
    writer = BindingsWriter()

    new_controls: list[dict[str, Any]] = [
        {"status": 176, "midino": 99, "channel": 1, "target": "audio.chain.1.volume", "action": "set"},
    ]
    result = writer.write_bindings(
        profile_path=profile.path,
        profile_kind="midi",
        new_controls=new_controls,
        new_outputs=None,
        registry=registry,
    )

    assert result.revision
    assert result.undo_token
    assert result.bytes_written > 0

    on_disk = yaml.safe_load(profile.path.read_text(encoding="utf-8"))
    assert on_disk["controls"][0]["midino"] == 99
    assert on_disk["controls"][0]["target"] == "audio.chain.1.volume"


def test_write_then_undo_restores_previous_yaml(registry):
    profile = _profile_for(registry)
    writer = BindingsWriter()

    original_yaml = profile.path.read_text(encoding="utf-8")

    result = writer.write_bindings(
        profile_path=profile.path, profile_kind="midi",
        new_controls=[
            {"status": 176, "midino": 1, "channel": 1, "target": "audio.master.volume", "action": "set"},
        ],
        new_outputs=None, registry=registry,
    )
    assert profile.path.read_text(encoding="utf-8") != original_yaml

    writer.apply_undo(result.undo_token, registry=registry)
    assert profile.path.read_text(encoding="utf-8") == original_yaml


def test_undo_token_only_works_once(registry):
    profile = _profile_for(registry)
    writer = BindingsWriter()

    result = writer.write_bindings(
        profile_path=profile.path, profile_kind="midi",
        new_controls=[
            {"status": 176, "midino": 22, "channel": 1, "target": "audio.master.volume", "action": "set"},
        ],
        new_outputs=None, registry=registry,
    )
    writer.apply_undo(result.undo_token, registry=registry)
    with pytest.raises(BindingsWriteError, match="undo token"):
        writer.apply_undo(result.undo_token, registry=registry)


def test_audio_profile_writes_are_rejected(registry, pack_tree):
    """Only midi/hid kinds accept binding writes."""
    writer = BindingsWriter()
    fake_audio_path = pack_tree / "fixture-co" / "profiles" / "midi-1.midi.yaml"
    with pytest.raises(BindingsWriteError, match="midi/hid"):
        writer.write_bindings(
            profile_path=fake_audio_path,
            profile_kind="audio",
            new_controls=[],
            new_outputs=None,
            registry=registry,
        )


def test_schema_invalid_payload_is_rejected(registry):
    """Submitting a control row missing required fields fails validation."""
    profile = _profile_for(registry)
    writer = BindingsWriter()

    with pytest.raises(BindingsWriteError, match="schema validation"):
        writer.write_bindings(
            profile_path=profile.path,
            profile_kind="midi",
            new_controls=[{"definitely_not_a_valid_field": True}],
            new_outputs=None,
            registry=registry,
        )


def test_pending_undo_count_drops_with_gc(registry, monkeypatch):
    """GC drops entries past UNDO_TTL_S."""
    import app.services.controllers.bindings_writer as bw
    monkeypatch.setattr(bw, "UNDO_TTL_S", 0.05)
    profile = _profile_for(registry)
    writer = BindingsWriter()

    writer.write_bindings(
        profile_path=profile.path, profile_kind="midi",
        new_controls=[
            {"status": 176, "midino": 33, "channel": 1, "target": "audio.master.volume", "action": "set"},
        ],
        new_outputs=None, registry=registry,
    )
    assert writer.pending_undo_count() == 1
    time.sleep(0.1)
    assert writer.pending_undo_count() == 0
