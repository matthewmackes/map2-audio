from __future__ import annotations

import os
import socket
import subprocess
import time
from pathlib import Path

import pytest

from app.schemas.controller_host import decode_frame, encode_frame


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


def _roundtrip(sock: socket.socket, payload: dict) -> dict:
    sock.sendall(encode_frame(payload))
    buf = b""
    deadline = time.monotonic() + 6.0
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
            assert rest == b""
            return msg
    raise AssertionError("timed out waiting for controller-host response")


def test_script_load_request_and_mapping_activate_are_consumed(host_socket: Path) -> None:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        script_msg = _roundtrip(
            sock,
            {
                "type": "script_load_request",
                "msg_id": "load-1",
                "schema_version": 1,
                "controller_key": "alsa-seq:test:0",
                "pack_id": "meloaudio",
                "model": "midi-commander",
                "script_path": "scripts/test-commander.js",
                "script_body": (
                    "var TestCtl={onCC:function(bytes){engine.log('ok')}};"
                    "globalThis['TestCtl.onCC']=TestCtl.onCC;"
                ),
            },
        )
        assert script_msg["type"] == "log_event"
        assert script_msg["level"] == "info"
        assert "script cached" in str(script_msg["message"])

        mapping_msg = _roundtrip(
            sock,
            {
                "type": "mapping_activate",
                "msg_id": "activate-1",
                "schema_version": 1,
                "controller_key": "alsa-seq:test:0",
                "descriptor": {
                    "pack_id": "meloaudio",
                    "model": "midi-commander",
                    "kind": "midi",
                    "scripts": ["scripts/test-commander.js"],
                    "controls": [
                        {
                            "status": 176,
                            "midino": 80,
                            "channel": 1,
                            "script": "TestCtl.onCC",
                            "fast_path": False,
                            "description": "toggle chain bypass",
                        }
                    ],
                    "outputs": [],
                    "settings": [],
                    "mixxx_alias_table": {"[Master]": "audio.master"},
                },
            },
        )
        assert mapping_msg["type"] == "log_event"
        assert mapping_msg["level"] in {"info", "warning"}
        assert "mapping activated" in str(mapping_msg["message"])


def test_mapping_activate_returns_script_error_on_invalid_inline_js(host_socket: Path) -> None:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        response = _roundtrip(
            sock,
            {
                "type": "mapping_activate",
                "msg_id": "activate-bad-js",
                "schema_version": 1,
                "controller_key": "alsa-seq:test:1",
                "descriptor": {
                    "pack_id": "meloaudio",
                    "model": "midi-commander",
                    "kind": "midi",
                    "scripts": ["var Broken = {"],
                    "controls": [],
                    "outputs": [],
                    "settings": [],
                    "mixxx_alias_table": {},
                },
            },
        )
        assert response["type"] == "script_error"
        assert response["controller_key"] == "alsa-seq:test:1"
        assert "message" in response


def test_mapping_activate_rejects_missing_scripts_for_script_bound_controls(host_socket: Path) -> None:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        sock.connect(str(host_socket))

        response = _roundtrip(
            sock,
            {
                "type": "mapping_activate",
                "msg_id": "activate-missing-scripts",
                "schema_version": 1,
                "controller_key": "alsa-seq:test:2",
                "descriptor": {
                    "pack_id": "meloaudio",
                    "model": "midi-commander",
                    "kind": "midi",
                    "scripts": ["scripts/not-found.js"],
                    "controls": [
                        {
                            "status": 176,
                            "midino": 81,
                            "channel": 1,
                            "script": "Missing.onCC",
                            "fast_path": False,
                            "description": "missing script callback",
                        }
                    ],
                    "outputs": [],
                    "settings": [],
                    "mixxx_alias_table": {},
                },
            },
        )
        assert response["type"] == "script_error"
        assert response["controller_key"] == "alsa-seq:test:2"
        assert "no descriptor scripts resolved" in str(response["message"])
