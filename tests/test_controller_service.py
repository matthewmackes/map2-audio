"""Tests for app.services.controllers.controller_service.

T2459-A3 acceptance gate.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.services.controllers import (
    ControllerService,
    MappingFileHandler,
    MappingLoadError,
    MappingRegistry,
    ProfileRegistry,
)


@pytest.fixture
def fixture_packs_root(tmp_path: Path) -> Path:
    """Minimal fixture packs root with the repo schemas + a single
    valid pack (one MIDI profile)."""
    import shutil

    repo_root = Path(__file__).resolve().parents[1]
    shutil.copytree(repo_root / "device-packs" / "_schema", tmp_path / "_schema")

    pack = tmp_path / "vendor-x"
    (pack / "profiles").mkdir(parents=True)
    (pack / "scripts").mkdir()
    (pack / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-x
        vendor: { name: VendorX }
        description: Vendor X test pack.
        license: AGPL-3.0-only
        models:
          - thing
    """))
    (pack / "profiles" / "thing.midi.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: VendorX
          model: thing
          alsa_client_pattern: 'VENDOR_X'
        scripts:
          - scripts/thing-scripts.js
        controls:
          - status: 0xB0
            midino: 7
            target: audio.master.volume
            action: set
        outputs: []
    """))
    (pack / "scripts" / "thing-scripts.js").write_text("// stub\n")
    return tmp_path


@pytest.fixture
def service(fixture_packs_root: Path) -> ControllerService:
    pr = ProfileRegistry(packs_root=fixture_packs_root)
    s = ControllerService(profile_registry=pr,
                          mapping_registry=MappingRegistry(),
                          mapping_file_handler=MappingFileHandler())
    s.start()
    return s


def test_start_loads_packs(service: ControllerService) -> None:
    packs = service.list_packs()
    assert any(p["pack_id"] == "vendor-x" for p in packs)


def test_list_profiles_filter_by_kind(service: ControllerService) -> None:
    midi = service.list_profiles(kind="midi")
    assert any(p["pack_id"] == "vendor-x" and p["model"] == "thing" for p in midi)


def test_get_profile_returns_document_when_requested(service: ControllerService) -> None:
    detail = service.get_profile("vendor-x", "thing", "midi")
    assert detail is not None
    assert "document" in detail


def test_get_profile_returns_none_for_missing(service: ControllerService) -> None:
    assert service.get_profile("vendor-x", "missing", "midi") is None


def test_resolve_for_alsa_client_substring(service: ControllerService) -> None:
    matches = service.resolve_for_alsa_client("VENDOR_X:0")
    assert len(matches) == 1
    assert matches[0]["model"] == "thing"


def test_load_mapping_succeeds_for_known_profile(service: ControllerService) -> None:
    descriptor = service.load_mapping("vendor-x", "thing", "midi")
    assert descriptor.pack_id == "vendor-x"
    assert descriptor.model == "thing"
    assert descriptor.kind == "midi"
    assert len(descriptor.controls) == 1
    assert descriptor.controls[0].target == "audio.master.volume"


def test_load_mapping_raises_for_unknown(service: ControllerService) -> None:
    with pytest.raises(MappingLoadError):
        service.load_mapping("vendor-x", "missing", "midi")


def test_load_mapping_raises_for_unsupported_kind(service: ControllerService) -> None:
    with pytest.raises(MappingLoadError):
        service.load_mapping("vendor-x", "thing", "audio")


def test_assign_and_clear_mapping(service: ControllerService) -> None:
    descriptor = service.load_mapping("vendor-x", "thing", "midi")
    service.assign_mapping("alsa-seq:VENDOR_X:0", descriptor)
    active = service.active_mappings()
    assert any(m["controller_key"] == "alsa-seq:VENDOR_X:0" for m in active)

    service.clear_mapping("alsa-seq:VENDOR_X:0")
    assert service.active_mappings() == []


def test_stop_clears_active_mappings(service: ControllerService) -> None:
    descriptor = service.load_mapping("vendor-x", "thing", "midi")
    service.assign_mapping("k1", descriptor)
    service.assign_mapping("k2", descriptor)
    assert len(service.active_mappings()) == 2
    service.stop()
    assert service.active_mappings() == []


def test_reload_pack_via_service(service: ControllerService, fixture_packs_root: Path) -> None:
    # Edit the manifest and reload.
    pack_yaml = fixture_packs_root / "vendor-x" / "pack.yaml"
    pack_yaml.write_text(pack_yaml.read_text().replace("VendorX", "VendorX2"))
    assert service.reload_pack("vendor-x") is True
    packs = service.list_packs()
    by_id = {p["pack_id"]: p for p in packs}
    assert by_id["vendor-x"]["vendor_name"] == "VendorX2"
