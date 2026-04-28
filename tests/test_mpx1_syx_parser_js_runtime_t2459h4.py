"""T2459-H4 Slice 4: MPX-1 SysEx parser routes through device-pack JS runtime.

Verifies the `MAP2_SYSEX_PARSER_USE_JS_RUNTIME` feature flag bridges the
Python parser onto `device-packs/_runtime/sysex-tags.js` with bit-identical
output.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from unittest.mock import patch

import pytest

if shutil.which("node") is None:
    pytest.skip("node not available on PATH", allow_module_level=True)

from app.services import mpx1_syx_parser as parser_mod
from app.services import sysex_tags_js_runtime as js_runtime
from app.services.mpx1_syx_parser import MPX1SyxParser


_LEXICON_ID = 0x06


def _build_syx_frame(name: str, program_number: int = 0) -> bytes:
    header = bytes([0xF0, _LEXICON_ID, 0x00, program_number & 0x7F])
    pre = bytes([0x00, 0x00])
    name_bytes = name.encode("ascii", errors="replace")[:12].ljust(12, b" ")
    payload = pre + name_bytes + bytes([0x00] * 20)
    return header + payload + bytes([0xF7])


_FIXTURE = (
    _build_syx_frame("Vocal Hall", 0)
    + _build_syx_frame("Plate Plate", 1)
    + _build_syx_frame("Wide Flange", 2)
    + _build_syx_frame("Stereo Echo", 3)
    + _build_syx_frame("Zzz Qqq", 4)
)


def _snapshot(programs):
    return [(p.name, p.program_number, list(p.auto_tags)) for p in programs]


@pytest.fixture(autouse=True)
def _clear_js_cache():
    js_runtime.compile_mpx1_tag_map_via_js.cache_clear()
    yield
    js_runtime.compile_mpx1_tag_map_via_js.cache_clear()


def test_flag_off_uses_python_path_unchanged(monkeypatch):
    monkeypatch.delenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", raising=False)
    parser = MPX1SyxParser()
    programs = parser.parse_bytes(_FIXTURE)
    snap = _snapshot(programs)
    # sanity on tags from Python path
    by_name = {n: tags for n, _, tags in snap}
    assert "vocal" in by_name["Vocal Hall"]
    assert "hall" in by_name["Vocal Hall"]
    assert "reverb" in by_name["Vocal Hall"]
    assert by_name["Plate Plate"].count("plate") == 1
    assert by_name["Zzz Qqq"] == []


def test_flag_on_matches_python_path_bit_identical(monkeypatch):
    monkeypatch.delenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", raising=False)
    parser = MPX1SyxParser()
    expected = _snapshot(parser.parse_bytes(_FIXTURE))

    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    actual = _snapshot(parser.parse_bytes(_FIXTURE))

    assert actual == expected


def test_compile_mpx1_tag_map_via_js_caches_subprocess_call():
    js_runtime.compile_mpx1_tag_map_via_js.cache_clear()
    with patch.object(js_runtime, "_run_node", wraps=js_runtime._run_node) as spy:
        first = js_runtime.compile_mpx1_tag_map_via_js()
        second = js_runtime.compile_mpx1_tag_map_via_js()
    assert spy.call_count == 1
    assert first is second


def test_facade_raises_sysex_js_runtime_error_on_node_failure(monkeypatch, tmp_path):
    bogus = tmp_path / "missing-sysex-tags.js"
    monkeypatch.setattr(js_runtime, "_RUNTIME_JS", bogus)
    js_runtime.compile_mpx1_tag_map_via_js.cache_clear()
    with pytest.raises(js_runtime.SysexJsRuntimeError):
        js_runtime.compile_mpx1_tag_map_via_js()
    with pytest.raises(js_runtime.SysexJsRuntimeError):
        js_runtime.auto_tag_from_name_via_js("Vocal Hall", "mpx1")
