"""T2459-H4 Slice 5: IntelFX SysEx parser routes through device-pack JS runtime.

Verifies the `MAP2_SYSEX_PARSER_USE_JS_RUNTIME` feature flag bridges the
Python parser onto `device-packs/_runtime/sysex-tags.js` with bit-identical
output.
"""

from __future__ import annotations

import shutil
from unittest.mock import patch

import pytest

if shutil.which("node") is None:
    pytest.skip("node not available on PATH", allow_module_level=True)

from app.services import sysex_tags_js_runtime as js_runtime
from app.services.intelfx_syx_parser import IntelFXSyxParser


def _build_intelfx_frame(
    *,
    name: str,
    program_number: int = 0,
    device_id: int = 0x00,
    msg_type: int = 0x03,
    extra_data: bytes = b"\x00\x01\x02\x03",
) -> bytes:
    program = max(0, min(255, int(program_number)))
    prog_hi = (program >> 7) & 0x7F
    prog_lo = program & 0x7F
    name_bytes = name.encode("ascii", errors="replace")[:16].ljust(16, b" ")
    body = bytes(
        [
            0xF0,
            0x00,
            0x01,
            0x56,
            device_id & 0x7F,
            msg_type & 0x7F,
            prog_hi,
            prog_lo,
        ]
    ) + name_bytes + extra_data
    checksum = 0
    for byte in body[1:]:
        checksum ^= byte
    checksum &= 0x7F
    return body + bytes([checksum, 0xF7])


_FIXTURE = (
    _build_intelfx_frame(name="Clean Chorus", program_number=0)
    + _build_intelfx_frame(name="Hush Lead", program_number=1)
    + _build_intelfx_frame(name="Plate Reverb", program_number=2)
    + _build_intelfx_frame(name="Wah Crunch", program_number=3)
    + _build_intelfx_frame(name="Acoustic Slap", program_number=4)
    + _build_intelfx_frame(name="Zzz Qqq", program_number=5)
)


def _snapshot(programs):
    return [(p.name, p.program_number, list(p.auto_tags)) for p in programs]


@pytest.fixture(autouse=True)
def _clear_js_cache():
    js_runtime.compile_intelfx_tag_map_via_js.cache_clear()
    yield
    js_runtime.compile_intelfx_tag_map_via_js.cache_clear()


def test_flag_off_uses_python_path_unchanged(monkeypatch):
    monkeypatch.delenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", raising=False)
    parser = IntelFXSyxParser()
    programs = parser.parse_bytes(_FIXTURE)
    snap = _snapshot(programs)
    by_name = {n: tags for n, _, tags in snap}
    assert "clean" in by_name["Clean Chorus"]
    assert "chorus" in by_name["Clean Chorus"]
    assert "hush" in by_name["Hush Lead"]
    assert "noise_reduction" in by_name["Hush Lead"]
    assert "lead" in by_name["Hush Lead"]
    assert "plate" in by_name["Plate Reverb"]
    assert "reverb" in by_name["Plate Reverb"]
    assert "wah" in by_name["Wah Crunch"]
    assert "crunch" in by_name["Wah Crunch"]
    assert "acoustic" in by_name["Acoustic Slap"]
    assert "slap" in by_name["Acoustic Slap"]
    assert by_name["Zzz Qqq"] == []


def test_flag_on_matches_python_path_bit_identical(monkeypatch):
    monkeypatch.delenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", raising=False)
    parser = IntelFXSyxParser()
    expected = _snapshot(parser.parse_bytes(_FIXTURE))

    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    actual = _snapshot(parser.parse_bytes(_FIXTURE))

    assert actual == expected


def test_compile_intelfx_tag_map_via_js_caches_subprocess_call():
    js_runtime.compile_intelfx_tag_map_via_js.cache_clear()
    with patch.object(js_runtime, "_run_node", wraps=js_runtime._run_node) as spy:
        first = js_runtime.compile_intelfx_tag_map_via_js()
        second = js_runtime.compile_intelfx_tag_map_via_js()
    assert spy.call_count == 1
    assert first is second
