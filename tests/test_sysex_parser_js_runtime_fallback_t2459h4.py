"""T2459-H4 Slice 9 — SysEx parser JS-runtime silent fallback.

When `MAP2_SYSEX_PARSER_USE_JS_RUNTIME=1` is set but the Node-backed
JS runtime can't be invoked on this host (Node not on PATH, runtime
JS file missing, sandbox crash), the parser must fall back to the
Python tag map silently and emit a single warning log per process.
The fallback path is bit-identical to the Python path (parity proven
in tests/test_sysex_tags_runtime_js_t2459h4.py), so callers see no
behavior delta.
"""

from __future__ import annotations

import importlib

import pytest

from app.services import intelfx_syx_parser, mpx1_syx_parser
from app.services.sysex_tags_js_runtime import SysexJsRuntimeError


def _reset_warn_flags():
    mpx1_syx_parser._JS_RUNTIME_FALLBACK_WARNED = False
    intelfx_syx_parser._JS_RUNTIME_FALLBACK_WARNED = False


def test_mpx1_falls_back_silently_when_js_runtime_raises(monkeypatch, caplog):
    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    _reset_warn_flags()

    def _raise(*_args, **_kwargs):
        raise SysexJsRuntimeError("node executable not found on PATH")

    monkeypatch.setattr(mpx1_syx_parser, "compile_mpx1_tag_map_via_js", _raise)

    with caplog.at_level("WARNING"):
        result = mpx1_syx_parser._resolve_tag_map()

    # Falls back to the Python tag map — same shape, bit-identical.
    assert result is mpx1_syx_parser._NAME_TAG_MAP
    # One warning log emitted on the first miss.
    assert any("Falling back" in rec.message for rec in caplog.records)


def test_mpx1_warns_only_once_per_process(monkeypatch, caplog):
    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    _reset_warn_flags()

    def _raise(*_args, **_kwargs):
        raise SysexJsRuntimeError("node executable not found on PATH")

    monkeypatch.setattr(mpx1_syx_parser, "compile_mpx1_tag_map_via_js", _raise)

    with caplog.at_level("WARNING"):
        mpx1_syx_parser._resolve_tag_map()
        mpx1_syx_parser._resolve_tag_map()
        mpx1_syx_parser._resolve_tag_map()

    fallback_warnings = [r for r in caplog.records if "Falling back" in r.message]
    assert len(fallback_warnings) == 1, (
        f"expected exactly one warning across multiple calls, got "
        f"{len(fallback_warnings)}"
    )


def test_intelfx_falls_back_silently_when_js_runtime_raises(monkeypatch, caplog):
    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    _reset_warn_flags()

    def _raise(*_args, **_kwargs):
        raise SysexJsRuntimeError("device-packs/_runtime/sysex-tags.js missing")

    monkeypatch.setattr(intelfx_syx_parser, "compile_intelfx_tag_map_via_js", _raise)

    with caplog.at_level("WARNING"):
        result = intelfx_syx_parser._resolve_tag_map()

    assert result is intelfx_syx_parser._NAME_TAG_MAP
    assert any("Falling back" in rec.message for rec in caplog.records)


def test_intelfx_warns_only_once_per_process(monkeypatch, caplog):
    monkeypatch.setenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", "1")
    _reset_warn_flags()

    def _raise(*_args, **_kwargs):
        raise SysexJsRuntimeError("invalid JSON from node")

    monkeypatch.setattr(intelfx_syx_parser, "compile_intelfx_tag_map_via_js", _raise)

    with caplog.at_level("WARNING"):
        intelfx_syx_parser._resolve_tag_map()
        intelfx_syx_parser._resolve_tag_map()

    fallback_warnings = [r for r in caplog.records if "Falling back" in r.message]
    assert len(fallback_warnings) == 1


def test_flag_off_path_unchanged_no_warning(monkeypatch, caplog):
    """When the flag is off, no fallback machinery triggers — pure
    Python path, no warnings even if the JS runtime would have
    failed."""
    monkeypatch.delenv("MAP2_SYSEX_PARSER_USE_JS_RUNTIME", raising=False)
    _reset_warn_flags()
    with caplog.at_level("WARNING"):
        mpx1 = mpx1_syx_parser._resolve_tag_map()
        intelfx = intelfx_syx_parser._resolve_tag_map()
    assert mpx1 is mpx1_syx_parser._NAME_TAG_MAP
    assert intelfx is intelfx_syx_parser._NAME_TAG_MAP
    assert not any("Falling back" in rec.message for rec in caplog.records)
