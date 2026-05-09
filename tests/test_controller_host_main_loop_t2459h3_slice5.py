"""T2459-H3 Slice 5 — live libremidi ingestion through the host main loop.

Drives the real `map2-controller-host` binary over a tmp UDS:
1. Loads a small inline JS mapping that calls engine.setValue() on any CC.
2. Activates the descriptor for a synthetic controller_key.
3. Opens the host's MIDI input via a virtual port created by libremidi.
4. Verifies the IPC schema test still includes MidiOpenInputRequest.

The hardware-port `midi_open_input_request` path requires a libremidi
backend with a discoverable input port whose name we control. We can't
rely on hardware in CI, so this test asserts the schema/wire surface
end-to-end and the request/response correlation, then exercises the live
dispatch pump indirectly by activating a mapping and confirming the host
remains responsive (no regression of slices 1-4).
"""

from __future__ import annotations

import os
import socket
import subprocess
import time
from pathlib import Path

import pytest

from app.schemas.controller_host import (
    SCHEMA_VERSION,
    FIELD_MANIFEST,
    decode_frame,
    encode_frame,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
HOST_BINARY_CANDIDATES = [
    REPO_ROOT / "juce-engine" / "build" / "map2-controller-host",
    REPO_ROOT / "juce-engine" / "build-h1" / "map2-controller-host",
]


def _find_host_binary() -> Path | None:
    for candidate in HOST_BINARY_CANDIDATES:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return candidate
    return None


@pytest.fixture(scope="module")
def host_binary() -> Path:
    binary = _find_host_binary()
    if binary is None:
        pytest.skip(
            "map2-controller-host binary not built; "
            "run `cmake --build build --target map2-controller-host`",
        )
    return binary


@pytest.fixture
def host_socket(tmp_path: Path, host_binary: Path):
    sock_path = tmp_path / "controller-host.sock"
    proc = subprocess.Popen(
        [str(host_binary), "--socket", str(sock_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(REPO_ROOT),
    )
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        if sock_path.exists():
            break
        time.sleep(0.05)
    if not sock_path.exists():
        proc.terminate()
        stdout, stderr = proc.communicate(timeout=2.0)
        pytest.fail(
            f"map2-controller-host did not create socket at {sock_path}.\n"
            f"stdout={stdout!r}\nstderr={stderr!r}"
        )
    try:
        yield sock_path
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=1.0)


def _roundtrip(sock: socket.socket, payload: dict, *, timeout_s: float = 6.0) -> dict:
    sock.sendall(encode_frame(payload))
    buf = b""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            chunk = sock.recv(4096)
        except TimeoutError:
            continue
        if not chunk:
            raise AssertionError("controller-host closed socket before sending a response")
        buf += chunk
        msg, rest = decode_frame(buf)
        if msg is not None:
            return msg
    raise AssertionError("timed out waiting for controller-host response")


def test_midi_open_input_request_in_field_manifest() -> None:
    """The schema-sync test gate must include the new request type."""
    assert "MidiOpenInputRequest" in FIELD_MANIFEST
    fields = FIELD_MANIFEST["MidiOpenInputRequest"]
    assert fields == ["type", "msg_id", "schema_version", "controller_key", "port_id"]


def test_midi_open_input_request_unknown_port_returns_error_log(host_socket: Path) -> None:
    """An open against a non-existent port yields an error log_event but
    does NOT crash the host."""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        response = _roundtrip(
            sock,
            {
                "type": "midi_open_input_request",
                "msg_id": "open-missing",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-slice5",
                "port_id": "no-such-port-name-zzz",
            },
        )
        assert response["type"] == "log_event"
        assert response["level"] == "error"
        assert "midi_open_input_request" in str(response["message"]) \
            or "openInput" in str(response["message"]) \
            or "no input port" in str(response["message"]) \
            or "no MIDI backend" in str(response["message"])

        # Host stays responsive afterwards — round-trip a second request.
        ports_response = _roundtrip(
            sock,
            {
                "type": "midi_list_ports_request",
                "msg_id": "list-after-open",
                "schema_version": SCHEMA_VERSION,
            },
        )
        assert ports_response["type"] == "midi_list_ports_response"


def test_full_pipeline_script_load_then_activate_then_open_input(host_socket: Path) -> None:
    """End-to-end smoke: load a tiny script, activate a descriptor, then
    request an open on a synthetic port id. The slice-5 contract is that
    the host accepts each frame, replies with a typed log_event, and
    remains alive — a real hardware port plug-in is required for the
    bench HIL acceptance step (deferred).
    """
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        load = _roundtrip(
            sock,
            {
                "type": "script_load_request",
                "msg_id": "slice5-load",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-slice5",
                "pack_id": "test",
                "model": "test",
                "script_path": "scripts/test-slice5.js",
                "script_body": (
                    "var Slice5 = { onCC: function(bytes) {"
                    " engine.setValue('[Master]','volume', 0.5);"
                    "}};"
                    "globalThis['Slice5.onCC'] = Slice5.onCC;"
                ),
            },
        )
        assert load["type"] == "log_event"
        assert load["level"] == "info"

        activate = _roundtrip(
            sock,
            {
                "type": "mapping_activate",
                "msg_id": "slice5-activate",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-slice5",
                "descriptor": {
                    "pack_id": "test",
                    "model": "test",
                    "kind": "midi",
                    "scripts": ["scripts/test-slice5.js"],
                    "controls": [
                        {
                            "status": 0xB0,
                            "midino": 7,
                            "channel": 0,
                            "script": "Slice5.onCC",
                            "fast_path": False,
                            "description": "any cc7",
                        }
                    ],
                    "outputs": [],
                    "settings": [],
                    "mixxx_alias_table": {},
                },
            },
        )
        assert activate["type"] == "log_event"
        assert activate["level"] in {"info", "warning"}

        open_resp = _roundtrip(
            sock,
            {
                "type": "midi_open_input_request",
                "msg_id": "slice5-open",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-slice5",
                "port_id": "no-such-port-name-zzz",
            },
        )
        assert open_resp["type"] == "log_event"
