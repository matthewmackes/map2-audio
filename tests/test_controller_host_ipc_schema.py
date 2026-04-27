"""Schema-sync test for backend ↔ map2-controller-host IPC.

Compares the FIELD_MANIFEST in app/schemas/controller_host.py against
the CPP_FIELD_MANIFEST block embedded in
juce-engine/Source/ControllerHost/IpcMessages.h.

Worklist: T2459-A5.
Pattern reference: the existing JUCE-engine schema-sync tests.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.schemas.controller_host import (
    FIELD_MANIFEST,
    SCHEMA_VERSION,
    ControllerEvent,
    EngineCommand,
    LogEvent,
    MappingActivate,
    MidiSendRequest,
    ScriptError,
    ScriptLoadRequest,
    Shutdown,
    decode_frame,
    encode_frame,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
CPP_HEADER = REPO_ROOT / "juce-engine" / "Source" / "ControllerHost" / "IpcMessages.h"


def _parse_cpp_manifest() -> dict[str, list[str]]:
    text = CPP_HEADER.read_text()
    m = re.search(r"CPP_FIELD_MANIFEST_BEGIN(.*?)CPP_FIELD_MANIFEST_END", text, re.DOTALL)
    assert m, "CPP_FIELD_MANIFEST_BEGIN/END markers not found in IpcMessages.h"
    block = m.group(1)
    out: dict[str, list[str]] = {}
    for line in block.splitlines():
        line = line.strip().lstrip("/").strip()
        if not line or ":" not in line:
            continue
        name, csv = line.split(":", 1)
        fields = [f.strip() for f in csv.split(",") if f.strip()]
        out[name.strip()] = fields
    return out


def test_cpp_header_exists() -> None:
    assert CPP_HEADER.exists(), f"Missing C++ header: {CPP_HEADER}"


def test_cpp_manifest_parses() -> None:
    manifest = _parse_cpp_manifest()
    assert manifest, "Empty CPP_FIELD_MANIFEST"


def test_python_manifest_matches_cpp() -> None:
    """Every TypedDict in app/schemas/controller_host.py has a matching
    C++ struct manifest entry, and the field lists agree.
    """
    py = FIELD_MANIFEST
    cpp = _parse_cpp_manifest()

    py_only = set(py.keys()) - set(cpp.keys())
    cpp_only = set(cpp.keys()) - set(py.keys())
    assert not py_only, f"In Python but not in C++ manifest: {py_only}"
    assert not cpp_only, f"In C++ manifest but not in Python: {cpp_only}"

    failures: list[str] = []
    for name in py:
        py_fields = list(py[name])
        cpp_fields = list(cpp[name])
        if py_fields != cpp_fields:
            failures.append(
                f"{name}: python={py_fields} cpp={cpp_fields}"
            )
    assert not failures, "Field-list mismatches:\n  " + "\n  ".join(failures)


def test_schema_version_in_cpp_matches_python() -> None:
    """The kSchemaVersion constant in the C++ header must equal the
    Python SCHEMA_VERSION.
    """
    text = CPP_HEADER.read_text()
    m = re.search(r"kSchemaVersion\s*=\s*(\d+)", text)
    assert m, "kSchemaVersion not found in IpcMessages.h"
    assert int(m.group(1)) == SCHEMA_VERSION


def test_typeddict_construction() -> None:
    """Smoke-test that every TypedDict can be instantiated with the
    documented fields.
    """
    sl: ScriptLoadRequest = {
        "type": "script_load_request",
        "msg_id": "1",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "alsa-seq:UA-1000 MIDI:0",
        "pack_id": "edirol-ua",
        "model": "ua-1000",
        "script_path": "/abs/path.js",
        "script_body": "// stub\n",
    }
    assert sl["pack_id"] == "edirol-ua"

    ma: MappingActivate = {
        "type": "mapping_activate",
        "msg_id": "2",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "descriptor": {
            "pack_id": "p",
            "model": "m",
            "kind": "midi",
            "scripts": [],
            "controls": [],
            "outputs": [],
            "settings": [],
            "mixxx_alias_table": {},
        },
    }
    assert ma["descriptor"]["kind"] == "midi"

    msr: MidiSendRequest = {
        "type": "midi_send_request",
        "msg_id": "3",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "bytes": [0xB0, 7, 100],
    }
    assert msr["bytes"] == [0xB0, 7, 100]

    sd: Shutdown = {
        "type": "shutdown",
        "msg_id": "4",
        "schema_version": SCHEMA_VERSION,
    }
    assert sd["type"] == "shutdown"

    ec: EngineCommand = {
        "type": "engine_command",
        "msg_id": "5",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "target": "audio.chain.1.volume",
        "action": "set",
        "value": 0.7,
    }
    assert ec["value"] == 0.7

    cv: ControllerEvent = {
        "type": "controller_event",
        "msg_id": "6",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "timestamp_ns": 123,
        "bytes": [0x90, 60, 100],
    }
    assert cv["timestamp_ns"] == 123

    le: LogEvent = {
        "type": "log_event",
        "msg_id": "7",
        "schema_version": SCHEMA_VERSION,
        "level": "info",
        "message": "hi",
    }
    assert le["level"] == "info"

    se: ScriptError = {
        "type": "script_error",
        "msg_id": "8",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "message": "boom",
    }
    assert se["message"] == "boom"


# ---------------------------------------------------------------------------
# Wire-format helpers
# ---------------------------------------------------------------------------

def test_encode_decode_round_trip() -> None:
    msg = {"type": "shutdown", "msg_id": "x", "schema_version": SCHEMA_VERSION}
    frame = encode_frame(msg)
    assert len(frame) == 4 + len(frame) - 4  # tautology — sanity check
    decoded, rest = decode_frame(frame)
    assert decoded == msg
    assert rest == b""


def test_decode_partial_frame_returns_none() -> None:
    msg = {"type": "shutdown", "msg_id": "x", "schema_version": SCHEMA_VERSION}
    frame = encode_frame(msg)
    # Slice 1 byte off the end; decoder must return None and keep buffer.
    decoded, rest = decode_frame(frame[:-1])
    assert decoded is None
    assert rest == frame[:-1]


def test_decode_multiple_frames() -> None:
    a = {"type": "shutdown", "msg_id": "1", "schema_version": SCHEMA_VERSION}
    b = {"type": "shutdown", "msg_id": "2", "schema_version": SCHEMA_VERSION}
    buffer = encode_frame(a) + encode_frame(b)
    decoded_a, rest = decode_frame(buffer)
    assert decoded_a == a
    decoded_b, rest = decode_frame(rest)
    assert decoded_b == b
    assert rest == b""


def test_decode_frame_under_4_bytes_returns_none() -> None:
    decoded, rest = decode_frame(b"\x00\x00")
    assert decoded is None
    assert rest == b"\x00\x00"
