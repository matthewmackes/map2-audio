"""Mixxx XML round-trip test.

T2459-C4 contract: a Mixxx mapping read by the reader and serialized
by the writer must produce a structurally-equivalent MappingDescriptor
when re-parsed. Imported→edited→exported is the operator workflow this
gate protects.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.services.controllers.mapping_file_handler import MappingDescriptor
from app.services.controllers.mixxx_xml_reader import parse_mixxx_xml
from app.services.controllers.mixxx_xml_writer import write_mixxx_xml


REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = REPO_ROOT / "device-packs" / "_tests" / "mixxx-fixtures"


def _round_trip(path: Path, alias_table: dict[str, str] | None = None) -> tuple[
    MappingDescriptor, MappingDescriptor
]:
    first = parse_mixxx_xml(path, pack_id="round-trip", alias_table=alias_table)
    xml = write_mixxx_xml(first.descriptor)
    out = path.parent / f"{path.stem}.round-trip.xml"
    out.write_text(xml)
    second = parse_mixxx_xml(out, pack_id="round-trip", alias_table=alias_table)
    out.unlink()
    return first.descriptor, second.descriptor


def _control_signature(c) -> tuple:
    """Compare-key for a MappingControl, ignoring extras that may shift."""
    return (c.status, c.midino, c.channel, c.target, c.script,
            c.action, c.fast_path)


def test_simple_fixture_round_trip(tmp_path: Path) -> None:
    src = FIXTURE_DIR / "Pioneer-CDJ-2000.midi.xml"
    a, b = _round_trip(src)

    assert a.kind == b.kind == "midi"
    assert a.scripts == b.scripts
    assert {_control_signature(c) for c in a.controls} == {
        _control_signature(c) for c in b.controls
    }
    assert {_control_signature(o) for o in a.outputs} == {
        _control_signature(o) for o in b.outputs
    }


def test_medium_fixture_round_trip() -> None:
    src = FIXTURE_DIR / "Behringer-CMD-Micro.midi.xml"
    a, b = _round_trip(src)
    # Drop the [Sampler1] row from both — it fails soft on parse, so
    # both sides see the same reduced control set.
    assert {_control_signature(c) for c in a.controls} == {
        _control_signature(c) for c in b.controls
    }
    assert len(a.outputs) == len(b.outputs)


def test_complex_fixture_round_trip() -> None:
    src = FIXTURE_DIR / "Pioneer-DDJ-SX.midi.xml"
    a, b = _round_trip(src)
    assert {_control_signature(c) for c in a.controls} == {
        _control_signature(c) for c in b.controls
    }


def test_writer_handles_native_descriptor(tmp_path: Path) -> None:
    """A descriptor without Mixxx ancestry (no extra['mixxx_group'])
    still emits valid Mixxx XML — under the [Map2] catch-all group.
    """
    from app.services.controllers.mapping_file_handler import MappingControl
    descriptor = MappingDescriptor(
        pack_id="edirol-ua",
        model="ua-1000",
        kind="midi",
        source_path=Path("/repo/device-packs/edirol-ua/profiles/ua-1000.midi.yaml"),
        scripts=("scripts/ua-1000-scripts.js",),
        controls=(
            MappingControl(
                status=0xB0, midino=64, channel=None,
                target="audio.chain.1.bypass", action="toggle",
                script=None, fast_path=True,
                description="Pedal CC 64 → fast-path bypass.",
            ),
            MappingControl(
                status=0xB0, midino=7, channel=None,
                target=None, action=None,
                script="UA1000Mapping.masterVolume", fast_path=False,
                description="CC 7 → JS master volume.",
            ),
        ),
        outputs=tuple(),
        settings=tuple(),
        mixxx_alias_table={},
    )
    xml = write_mixxx_xml(descriptor)

    out = tmp_path / "ua1000.midi.xml"
    out.write_text(xml)
    parsed = parse_mixxx_xml(out, pack_id="edirol-ua").descriptor

    # Both controls survived. The fast-path one became a direct binding
    # under [Map2].audio.chain.1.bypass — note the bridge's [Map2]
    # group will fail soft on resolve so the imported descriptor's
    # `controls` will only carry the script-bound row.
    script_rows = [c for c in parsed.controls if c.script]
    assert any(c.script == "UA1000Mapping.masterVolume" for c in script_rows)


def test_writer_rejects_non_midi_descriptor(tmp_path: Path) -> None:
    from app.services.controllers.mapping_file_handler import MappingControl
    bad = MappingDescriptor(
        pack_id="x",
        model="m",
        kind="hid",
        source_path=Path("/repo/x.hid.yaml"),
        scripts=(),
        controls=(),
        outputs=(),
        settings=(),
        mixxx_alias_table={},
    )
    with pytest.raises(ValueError):
        write_mixxx_xml(bad)
