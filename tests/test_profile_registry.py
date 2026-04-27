"""Tests for app.services.controllers.profile_registry.

T2459-A3 acceptance gate. Coverage target: ≥90% per worklist.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.services.controllers.profile_registry import (
    DevicePack,
    DeviceProfile,
    ProfileRegistry,
    get_profile_registry,
    reset_profile_registry_for_tests,
)


@pytest.fixture
def repo_packs_root() -> Path:
    return Path(__file__).resolve().parents[1] / "device-packs"


@pytest.fixture
def fixture_packs_root(tmp_path: Path, repo_packs_root: Path) -> Path:
    """A tmp packs-root that contains:

    - Real `_schema/` (symlink to repo schemas) so validation runs
      against the actual JSON Schemas.
    - A copy of the repo's `_tests/fixture-pack/` so the loader has at
      least one valid pack to ingest.
    - A vendor pack `vendor-good/` with a valid manifest.
    - A vendor pack `vendor-bad/` whose manifest is broken (skipped at
      load with a logged error; the registry must still load
      vendor-good and the fixture pack).
    - A profile inside vendor-good that is intentionally malformed —
      tests that per-profile failures degrade rather than abort the
      whole pack.
    """
    import shutil

    schema_src = repo_packs_root / "_schema"
    schema_dst = tmp_path / "_schema"
    shutil.copytree(schema_src, schema_dst)

    tests_src = repo_packs_root / "_tests"
    tests_dst = tmp_path / "_tests"
    shutil.copytree(tests_src, tests_dst)

    good = tmp_path / "vendor-good"
    (good / "profiles").mkdir(parents=True)
    (good / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-good
        vendor:
          name: Good Vendor
        description: A valid pack for testing.
        license: AGPL-3.0-only
        models:
          - alpha
          - bad-profile
    """))
    (good / "profiles" / "alpha.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: Good Vendor
          model: alpha
          hardware_id: usb:1234:0001
          alsa_card_regex: '^Alpha\\b'
        ports:
          - id: out_l
            kind: analog
            direction: output
            count: 1
        loopback_ports:
          playback: 'Alpha:playback_FL'
          capture: 'Alpha:capture_FL'
    """))
    # Intentionally malformed: missing required `identity.manufacturer`
    (good / "profiles" / "bad-profile.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          model: bad
          hardware_id: usb:1234:0099
        ports:
          - id: x
            kind: analog
            direction: output
            count: 1
    """))

    bad = tmp_path / "vendor-bad"
    bad.mkdir()
    # Missing required pack_id + vendor.name + license
    (bad / "pack.yaml").write_text("schema_version: 1\ndescription: broken\n")

    return tmp_path


def test_load_packs_with_no_root_logs_and_continues(tmp_path: Path) -> None:
    registry = ProfileRegistry(packs_root=tmp_path / "does-not-exist")
    registry.load_packs()  # MUST NOT raise
    assert registry.packs() == ()


def test_load_packs_skips_broken_pack_without_blocking_boot(
    fixture_packs_root: Path,
) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()  # vendor-bad must not raise

    pack_ids = {p.pack_id for p in registry.packs()}
    assert "vendor-good" in pack_ids
    assert "fixture-pack" in pack_ids
    # vendor-bad is broken at the manifest level; it must not appear.
    assert "vendor-bad" not in pack_ids


def test_load_packs_keeps_pack_when_one_profile_is_broken(
    fixture_packs_root: Path,
) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    pack = registry.get_pack("vendor-good")
    assert pack is not None
    # alpha loaded; bad-profile dropped to degraded.
    models = {p.model for p in pack.profiles}
    assert "alpha" in models
    assert "bad-profile" not in models
    assert pack.is_degraded is True
    assert any("bad-profile" in str(d) for d in pack.degraded_files)


def test_resolve_for_hardware_id(fixture_packs_root: Path) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    matches = registry.resolve_for_hardware_id("usb:1234:0001")
    assert len(matches) == 1
    assert matches[0].model == "alpha"


def test_resolve_for_alsa_card_regex(fixture_packs_root: Path) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    matches = registry.resolve_for_alsa_card("Alpha [Audio Card 0]")
    assert len(matches) == 1
    assert matches[0].pack_id == "vendor-good"


def test_resolve_for_alsa_client_pattern(fixture_packs_root: Path) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    # The fixture pack's MIDI profile has alsa_client_pattern: 'FIXTURE_MIDI'
    matches = registry.resolve_for_alsa_client("FIXTURE_MIDI:0")
    assert len(matches) == 1
    assert matches[0].kind == "midi"


def test_profiles_filter_by_kind(fixture_packs_root: Path) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    audio = registry.profiles(kind="audio")
    midi = registry.profiles(kind="midi")
    hid = registry.profiles(kind="hid")
    # alpha + fixture-audio = 2 audio profiles
    assert len(audio) == 2
    # fixture-midi = 1 MIDI profile
    assert len(midi) == 1
    # fixture-hid = 1 HID profile
    assert len(hid) == 1


def test_reload_pack_succeeds_after_fix(
    fixture_packs_root: Path,
) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()

    # vendor-bad starts not-loaded; fix the manifest, reload.
    bad = fixture_packs_root / "vendor-bad" / "pack.yaml"
    bad.write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-bad
        vendor:
          name: Bad Vendor
        description: now valid
        license: AGPL-3.0-only
    """))
    assert registry.reload_pack("vendor-bad") is True
    assert registry.get_pack("vendor-bad") is not None


def test_reload_pack_returns_false_for_unknown(
    fixture_packs_root: Path,
) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    assert registry.reload_pack("does-not-exist") is False


def test_reload_keeps_previous_state_on_failure(
    fixture_packs_root: Path,
) -> None:
    registry = ProfileRegistry(packs_root=fixture_packs_root)
    registry.load_packs()
    pack_before = registry.get_pack("vendor-good")
    assert pack_before is not None

    # Break vendor-good's pack.yaml then attempt reload.
    (fixture_packs_root / "vendor-good" / "pack.yaml").write_text("not yaml: : :")
    assert registry.reload_pack("vendor-good") is False
    # Previous state is preserved.
    pack_after = registry.get_pack("vendor-good")
    assert pack_after is pack_before


def test_singleton_helper_reset() -> None:
    reset_profile_registry_for_tests()
    a = get_profile_registry()
    b = get_profile_registry()
    assert a is b
    reset_profile_registry_for_tests()
    c = get_profile_registry()
    assert c is not a


def test_invalid_alsa_card_regex_logs_and_returns_none(
    tmp_path: Path,
    repo_packs_root: Path,
) -> None:
    """A profile with a syntactically invalid regex must not crash;
    the property returns None and the registry treats the device as
    un-resolvable by ALSA card name.
    """
    import shutil

    shutil.copytree(repo_packs_root / "_schema", tmp_path / "_schema")
    pack = tmp_path / "vendor-bad-regex"
    (pack / "profiles").mkdir(parents=True)
    (pack / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-bad-regex
        vendor: { name: V }
        description: D
        license: AGPL-3.0-only
    """))
    (pack / "profiles" / "x.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: V
          model: x
          hardware_id: usb:9999:0001
          alsa_card_regex: '['  # invalid regex
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
    """))
    registry = ProfileRegistry(packs_root=tmp_path)
    registry.load_packs()
    profiles = registry.profiles(kind="audio")
    assert len(profiles) == 1
    assert profiles[0].alsa_card_regex is None


# ---------------------------------------------------------------------------
# T2459-B3 — Mixxx import surface in the catalogue.
# ---------------------------------------------------------------------------


def _write_mixxx_xml(
    path: Path,
    *,
    name: str = "Test Mapping",
    author: str = "Test Author",
    controller_id: str = "TestCtl",
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(f"""\
        <?xml version="1.0" encoding="utf-8"?>
        <MixxxMIDIPreset mixxxVersion="1.10.1+" schemaVersion="1">
          <info>
            <name>{name}</name>
            <author>{author}</author>
            <description>Test fixture.</description>
          </info>
          <controller id="{controller_id}">
            <controls/>
          </controller>
        </MixxxMIDIPreset>
    """))


@pytest.fixture
def mixxx_imports_root(tmp_path: Path, repo_packs_root: Path) -> Path:
    """A tmp packs-root with a real ``_schema/`` and a populated
    ``_mixx-imports/res/controllers/`` so the Mixxx synthesis path runs
    end-to-end.
    """
    import shutil

    shutil.copytree(repo_packs_root / "_schema", tmp_path / "_schema")
    controllers = tmp_path / "_mixx-imports" / "res" / "controllers"
    _write_mixxx_xml(
        controllers / "Akai LPD8.midi.xml",
        name="Akai LPD8", author="Rob K", controller_id="LPD8",
    )
    _write_mixxx_xml(
        controllers / "Behringer BCD2000.midi.xml",
        name="Behringer BCD2000", author="Mixxx Team",
        controller_id="BCD2000",
    )
    return tmp_path


def test_mixxx_imports_surface_as_imported_packs(mixxx_imports_root: Path) -> None:
    registry = ProfileRegistry(packs_root=mixxx_imports_root)
    registry.load_packs()
    pack_ids = {p.pack_id for p in registry.packs()}
    assert "mixxx:Akai-LPD8" in pack_ids
    assert "mixxx:Behringer-BCD2000" in pack_ids


def test_mixxx_imports_yield_one_midi_profile_each(mixxx_imports_root: Path) -> None:
    registry = ProfileRegistry(packs_root=mixxx_imports_root)
    registry.load_packs()
    midi = [
        p for p in registry.profiles(kind="midi")
        if p.pack_id.startswith("mixxx:")
    ]
    assert len(midi) == 2
    for p in midi:
        assert p.kind == "midi"
        assert p.path.suffix == ".xml"
        # Synthesized profile carries the schema-required scaffolding
        # so downstream serializers don't blow up, but ``controls`` is
        # empty — full parsing is deferred to mapping load time.
        assert p.document["schema_version"] == 1
        assert p.document["controls"] == []


def test_mixxx_pack_path_classifies_as_imported(mixxx_imports_root: Path) -> None:
    """The synthetic pack's path must live under ``_mixx-imports`` so
    /api/devices/packs/sources tags it ``source: imported``.
    """
    from app.routes.devices import _classify_pack_source

    registry = ProfileRegistry(packs_root=mixxx_imports_root)
    registry.load_packs()
    mixxx_packs = [p for p in registry.packs() if p.pack_id.startswith("mixxx:")]
    assert mixxx_packs, "no mixxx packs synthesized"
    for pack in mixxx_packs:
        assert _classify_pack_source(str(pack.path)) == "imported"


def test_mixxx_malformed_xml_is_skipped_not_fatal(
    tmp_path: Path, repo_packs_root: Path,
) -> None:
    """A broken Mixxx XML must not block backend boot; valid siblings
    must still surface.
    """
    import shutil

    shutil.copytree(repo_packs_root / "_schema", tmp_path / "_schema")
    controllers = tmp_path / "_mixx-imports" / "res" / "controllers"
    controllers.mkdir(parents=True)
    (controllers / "Broken.midi.xml").write_text("<not-xml")
    _write_mixxx_xml(
        controllers / "Good.midi.xml",
        name="Good", author="Author", controller_id="Good",
    )
    registry = ProfileRegistry(packs_root=tmp_path)
    registry.load_packs()  # MUST NOT raise
    pack_ids = {p.pack_id for p in registry.packs()}
    assert "mixxx:Good" in pack_ids
    assert "mixxx:Broken" not in pack_ids


def test_mixxx_pack_id_collision_is_disambiguated(tmp_path: Path, repo_packs_root: Path) -> None:
    """Two Mixxx XMLs whose filenames sanitize to the same model must
    not collide in the registry's pack id space.
    """
    import shutil

    shutil.copytree(repo_packs_root / "_schema", tmp_path / "_schema")
    controllers = tmp_path / "_mixx-imports" / "res" / "controllers"
    # After sanitisation both stems collapse to "Foo-Bar".
    _write_mixxx_xml(controllers / "Foo Bar.midi.xml", name="Foo Bar")
    _write_mixxx_xml(controllers / "Foo+Bar.midi.xml", name="Foo+Bar")
    registry = ProfileRegistry(packs_root=tmp_path)
    registry.load_packs()
    mixxx = sorted(p.pack_id for p in registry.packs() if p.pack_id.startswith("mixxx:"))
    assert mixxx == ["mixxx:Foo-Bar", "mixxx:Foo-Bar-2"]
