"""T2459-H3 Slice 6 — multi-controller routing on the host's MIDI rings.

Slice 6 retires the single-active-controller shortcut Slice 5 left behind:
the host now assigns a per-controller `controllerIndex` to each opened
input port, the libremidi callback writes that index into the slot's
controllerIndex field, and the consumer dispatches each event through
the matching loaded descriptor.

Without bench MIDI hardware, this integration test cannot exercise a real
two-controller loopback. It instead drives the production main-loop
contract that's directly observable over IPC:

1. Schema parity — `MidiOpenInputRequest.controller_key` is still on the
   wire so the host has the input it needs to assign per-port indices.
2. Two distinct controllers each load + activate cleanly + each get an
   independent error log on a non-existent open (proves the per-port
   assignment table doesn't drift state across controllers).
3. The host stays responsive after both opens — no goto-disconnect when
   the multi-controller bookkeeping runs.

Per-event index round-tripping is covered by the C++ Catch2 cases
`Slice 6: multi-controller routing dispatches each ring event ...` and
`Slice 6: ring fallback (controllerIndex=0) ...` in
`juce-engine/tests/Map2MappingEngineTests.cpp` +
`juce-engine/tests/ShmEventRingTests.cpp`. Bench HIL with two real
controllers is the remaining acceptance gate.
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


def test_open_input_request_still_carries_controller_key() -> None:
    """Slice-6 routing depends on per-port controller_key tagging — make
    sure the schema gate hasn't dropped that field from the wire."""
    fields = FIELD_MANIFEST["MidiOpenInputRequest"]
    assert "controller_key" in fields
    assert "port_id" in fields


def _load_and_activate(sock: socket.socket, controller_key: str, channel_tag: str) -> None:
    """Load a tiny controller-specific script and activate the descriptor."""
    load = _roundtrip(
        sock,
        {
            "type": "script_load_request",
            "msg_id": f"load-{controller_key}",
            "schema_version": SCHEMA_VERSION,
            "controller_key": controller_key,
            "pack_id": "test",
            "model": "test",
            "script_path": f"scripts/test-slice6-{controller_key}.js",
            "script_body": (
                f"var Pack_{channel_tag} = {{ onCC: function(bytes) {{"
                f" engine.setValue('[Channel_{channel_tag}]','volume', 0.5);"
                f"}} }};"
            ),
        },
    )
    assert load["type"] == "log_event"
    assert load["level"] == "info"

    activate = _roundtrip(
        sock,
        {
            "type": "mapping_activate",
            "msg_id": f"activate-{controller_key}",
            "schema_version": SCHEMA_VERSION,
            "controller_key": controller_key,
            "descriptor": {
                "pack_id": "test",
                "model": "test",
                "kind": "midi",
                "scripts": [f"scripts/test-slice6-{controller_key}.js"],
                "controls": [
                    {
                        "status": 0xB0,
                        "midino": 7,
                        "channel": 0,
                        "script": f"Pack_{channel_tag}.onCC",
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


def test_two_controllers_each_get_independent_open_assignments(host_socket: Path) -> None:
    """Two controllers load, activate, and request opens against synthetic
    port ids. Each open returns its own typed log_event tagged with its
    controller_key — proving the slice-6 per-port assignment table tracks
    each controller without leaking state across them. The host stays up
    after both opens (the new index-bookkeeping path is crash-free)."""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        _load_and_activate(sock, "ctrl-A-slice6", "A")
        _load_and_activate(sock, "ctrl-B-slice6", "B")

        open_a = _roundtrip(
            sock,
            {
                "type": "midi_open_input_request",
                "msg_id": "open-A",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-A-slice6",
                "port_id": "no-such-port-A-zzz",
            },
        )
        assert open_a["type"] == "log_event"
        assert open_a.get("controller_key") == "ctrl-A-slice6"

        open_b = _roundtrip(
            sock,
            {
                "type": "midi_open_input_request",
                "msg_id": "open-B",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "ctrl-B-slice6",
                "port_id": "no-such-port-B-zzz",
            },
        )
        assert open_b["type"] == "log_event"
        assert open_b.get("controller_key") == "ctrl-B-slice6"

        # Host stays responsive after both opens — list-ports round-trips
        # cleanly, proving the multi-controller bookkeeping path didn't
        # wedge the main loop.
        ports = _roundtrip(
            sock,
            {
                "type": "midi_list_ports_request",
                "msg_id": "list-after-opens",
                "schema_version": SCHEMA_VERSION,
            },
        )
        assert ports["type"] == "midi_list_ports_response"


def test_same_controller_key_on_two_ports_does_not_crash(host_socket: Path) -> None:
    """Slice-6 contract: a second port under the same controller_key reuses
    the existing controllerIndex (one descriptor, two physical inputs).
    The Python-observable surface is that both opens return typed log
    events for the same controller_key without the host disconnecting."""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        _load_and_activate(sock, "ctrl-shared-slice6", "S")

        for port in ("no-such-port-shared-1", "no-such-port-shared-2"):
            response = _roundtrip(
                sock,
                {
                    "type": "midi_open_input_request",
                    "msg_id": f"open-{port}",
                    "schema_version": SCHEMA_VERSION,
                    "controller_key": "ctrl-shared-slice6",
                    "port_id": port,
                },
            )
            assert response["type"] == "log_event"
            assert response.get("controller_key") == "ctrl-shared-slice6"

        ports = _roundtrip(
            sock,
            {
                "type": "midi_list_ports_request",
                "msg_id": "list-after-shared",
                "schema_version": SCHEMA_VERSION,
            },
        )
        assert ports["type"] == "midi_list_ports_response"
