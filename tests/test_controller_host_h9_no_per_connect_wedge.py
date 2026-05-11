"""T2459-H9 — regression test for the controller-host protocol wedge.

Before T2459-H9 the daemon ran its libremidi probe order and recreated
its shm rings on **every accept**. Per-connection setup time exceeded
2 s on contended hosts, which presented to the backend as a "daemon
unreachable" wedge: ``MidiHostClient.list_ports`` timed out at 2.0 s
on its very first request even though the daemon process was alive
and the UDS socket file existed.

This test pins the fix: with the heavy setup hoisted out of the accept
loop, **back-to-back probe connections and a real list_ports request
must all round-trip well under 1 s on a fresh daemon process**.

Failure mode the test catches:
- listen() backlog regressed below 4 → second connect EAGAIN's.
- Map2MidiBackend.probe() moved back inside the accept loop → first
  list_ports times out at the 2 s recv() deadline.
- shm ring creation moved back inside the accept loop → first
  list_ports times out at the 2 s recv() deadline.
"""

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


def _list_ports_roundtrip(sock_path: Path, recv_timeout_s: float = 1.0) -> dict:
    """Open a fresh UDS connection, send midi_list_ports_request, return
    the decoded response. Each call exercises one accept on the daemon."""
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(recv_timeout_s)
        sock.connect(str(sock_path))
        sock.sendall(encode_frame({
            "type": "midi_list_ports_request",
            "msg_id": "probe-1",
            "schema_version": 2,
        }))
        buf = b""
        deadline = time.monotonic() + recv_timeout_s
        while time.monotonic() < deadline:
            try:
                chunk = sock.recv(4096)
            except TimeoutError:
                continue
            if not chunk:
                raise AssertionError("daemon closed socket before responding")
            buf += chunk
            msg, rest = decode_frame(buf)
            if msg is not None:
                assert rest == b""
                return msg
    raise AssertionError(
        f"daemon did not reply to midi_list_ports_request within {recv_timeout_s}s "
        "— H9 wedge regressed"
    )


def test_back_to_back_probes_settle_under_one_second(host_socket: Path) -> None:
    """Three connect-and-close probes followed by a real list_ports must
    all complete in < 1 s. Each connect-and-close exercises the daemon's
    accept loop; the real list_ports exercises the dispatch path. Before
    T2459-H9 the first real request alone took >2 s due to per-accept
    probe order setup, so any single accept exceeding ~1 s is a regression."""

    t0 = time.monotonic()
    for _ in range(3):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            sock.connect(str(host_socket))
            # Immediately close; daemon should HUP-detect and accept again
            # in microseconds.

    response = _list_ports_roundtrip(host_socket, recv_timeout_s=1.0)
    elapsed = time.monotonic() - t0

    assert response["type"] == "midi_list_ports_response", (
        f"expected midi_list_ports_response, got {response!r}"
    )
    assert elapsed < 1.0, (
        f"H9 regression: back-to-back probes + list_ports took {elapsed:.2f}s "
        f"(must be < 1.0s once the heavy setup is hoisted out of the accept loop)"
    )


def test_list_ports_first_request_responds_quickly(host_socket: Path) -> None:
    """The very first request after the daemon comes up must round-trip
    fast — no warm-up grace. Before T2459-H9, the first request paid the
    full per-connection setup cost (libremidi probe + shm ring create)
    and timed out at 2 s. After H9 the setup runs once at daemon start,
    so the first request settles in single-digit milliseconds."""

    t0 = time.monotonic()
    response = _list_ports_roundtrip(host_socket, recv_timeout_s=1.0)
    elapsed = time.monotonic() - t0

    assert response["type"] == "midi_list_ports_response"
    assert elapsed < 0.5, (
        f"H9 regression: first list_ports request took {elapsed:.2f}s "
        f"(must be < 0.5s; H9 hoisted the heavy setup out of the accept loop)"
    )


def test_listen_backlog_accepts_concurrent_connects(host_socket: Path) -> None:
    """Open four UDS connections back-to-back without closing in between.
    The kernel accept queue must absorb them — before T2459-H9 the listen
    backlog was 1, so the third connect could fail with EAGAIN/ECONNREFUSED
    if the daemon was mid-serve. After H9 the backlog is 16."""

    socks = []
    try:
        for i in range(4):
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.settimeout(0.5)
            s.connect(str(host_socket))
            socks.append(s)
    finally:
        for s in socks:
            try:
                s.close()
            except OSError:
                pass

    assert len(socks) == 4, (
        f"H9 regression: only {len(socks)} of 4 concurrent connects succeeded; "
        f"the listen() backlog must accept at least 4 pending connections"
    )
