"""Tests for app.services.controllers.mixxx_xml_reader.

T2459-B3.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.services.controllers.mapping_file_handler import MappingLoadError
from app.services.controllers.mixxx_xml_reader import parse_mixxx_xml


def _write_xml(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "MyController.midi.xml"
    p.write_text(body)
    return p


SIMPLE_PRESET = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?>
    <MixxxControllerPreset schemaVersion="1" mixxxVersion="2.4.0">
      <info>
        <name>My Controller</name>
        <author>Me</author>
        <description>Test preset.</description>
      </info>
      <controller id="MyController">
        <scriptfiles>
          <file filename="MyController-scripts.js" functionprefix="MyController"/>
        </scriptfiles>
        <controls>
          <control>
            <group>[Channel1]</group>
            <key>volume</key>
            <status>0xB0</status>
            <midino>0x07</midino>
          </control>
          <control>
            <group>[Master]</group>
            <key>crossfader</key>
            <status>0xB0</status>
            <midino>0x08</midino>
          </control>
          <control>
            <group>[Channel2]</group>
            <key>jog</key>
            <status>0xB0</status>
            <midino>0x09</midino>
            <options>
              <Script-Binding/>
            </options>
          </control>
          <control>
            <group>[Sampler1]</group>
            <key>play</key>
            <status>0x90</status>
            <midino>0x10</midino>
          </control>
        </controls>
        <outputs>
          <output>
            <group>[Channel1]</group>
            <key>play</key>
            <status>0x90</status>
            <midino>0x01</midino>
            <on>0x7F</on>
            <off>0x00</off>
          </output>
        </outputs>
      </controller>
    </MixxxControllerPreset>
""")


def test_parse_simple_preset(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")

    assert result.descriptor.pack_id == "test"
    assert result.descriptor.model == "MyController"
    assert result.descriptor.kind == "midi"
    assert result.descriptor.scripts == ("MyController-scripts.js",)


def test_parse_resolves_well_known(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")

    targets = [c.target for c in result.descriptor.controls if c.target]
    assert "audio.chain.1.volume" in targets
    assert "audio.master.crossfader" in targets


def test_script_binding_emits_script_field(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")
    script_rows = [c for c in result.descriptor.controls if c.script]
    assert len(script_rows) == 1
    assert script_rows[0].script == "jog"
    assert script_rows[0].extra["mixxx_group"] == "[Channel2]"


def test_unresolvable_binding_skipped_with_reason(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")

    # [Sampler1].play is unsupported on MAP2 — should be skipped + reasoned.
    assert result.stats.skipped_controls >= 1
    assert any("[Sampler1]" in r for r in result.stats.skip_reasons)


def test_parse_stats_counts_match(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")
    assert result.stats.total_controls == 4
    # 2 well-known resolved + 1 script-binding = 3 resolved, 1 skipped.
    assert result.stats.resolved_controls == 3
    assert result.stats.skipped_controls == 1


def test_outputs_resolved(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    result = parse_mixxx_xml(path, pack_id="test")
    assert len(result.descriptor.outputs) == 1
    out = result.descriptor.outputs[0]
    assert out.target == "audio.chain.1.play"
    assert out.action == "led_feedback"
    assert out.extra["on_value"] == 0x7F


def test_alias_table_overrides_during_parse(tmp_path: Path) -> None:
    path = _write_xml(tmp_path, SIMPLE_PRESET)
    alias = {"[Channel1]": "audio.chain.42"}
    result = parse_mixxx_xml(path, pack_id="test", alias_table=alias)

    targets = [c.target for c in result.descriptor.controls if c.target]
    # The Channel1.volume row now resolves through the alias.
    assert "audio.chain.42.volume" in targets


def test_invalid_xml_raises(tmp_path: Path) -> None:
    p = tmp_path / "bad.xml"
    p.write_text("<not really xml")
    with pytest.raises(MappingLoadError):
        parse_mixxx_xml(p, pack_id="test")


def test_wrong_root_raises(tmp_path: Path) -> None:
    p = tmp_path / "wrong.xml"
    p.write_text("<?xml version='1.0'?><Foo/>")
    with pytest.raises(MappingLoadError):
        parse_mixxx_xml(p, pack_id="test")


def test_missing_controller_raises(tmp_path: Path) -> None:
    p = tmp_path / "missing.xml"
    p.write_text(
        "<?xml version='1.0'?>"
        "<MixxxControllerPreset schemaVersion='1'>"
        "<info><name>x</name></info>"
        "</MixxxControllerPreset>"
    )
    with pytest.raises(MappingLoadError):
        parse_mixxx_xml(p, pack_id="test")
