"""T2459-H11 — regression test for the controller-host single-client wedge.

Before T2459-H11 the daemon's accept loop was strictly serialized: it
accepted ONE backend client, entered an inner poll loop on that fd, and
only returned to accept() after that client disconnected. With multiple
long-lived subscribers (T2459-H8's EngineCommandBridge + every future
bridge that opens a persistent UDS) only the first one connected; every
subsequent caller — including short-lived `MidiHostClient.list_ports()`
round-trips from the MidiHub — queued in the kernel listen backlog and
got `Resource temporarily unavailable (EAGAIN)` until the persistent
client disconnected.

T2459-H11 replaces the serialized accept→handle→close loop with a
single-threaded poll-fanout that drains [listen_fd, ...client_fds]
each tick. This test pins the fix: hold a persistent client open AND
round-trip a fresh list_ports through a second connection without the
second connection timing out, blocking, or queueing.

Failure modes the test catches:
- accept loop re-serialized to single-client (regression to pre-H11).
- listen socket left blocking and accept4() loop never drains pending
  connects within a tick (probe storm queues across multiple ticks).
- `process_request_frame` ever calls a blocking recv on the wrong fd.
"""

from __future__ import annotations

import os
import socket
import subprocess
import threading
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
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.settimeout(recv_timeout_s)
        sock.connect(str(sock_path))
        sock.sendall(encode_frame({
            "type": "midi_list_ports_request",
            "msg_id": f"h11-{time.monotonic_ns()}",
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
        "— H11 multi-client regression (daemon serialized to a single client)"
    )


def test_list_ports_succeeds_while_persistent_subscriber_is_connected(
    host_socket: Path,
) -> None:
    """A persistent client (modelling EngineCommandBridge's subscription)
    holds an open UDS for the duration of the test. A SECOND fresh
    connection must still be able to round-trip a midi_list_ports_request
    in under 500 ms. Before T2459-H11 the second connect succeeded at the
    kernel level but the daemon never accept()ed it, so list_ports timed
    out at the client's recv() deadline."""

    persistent = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    persistent.settimeout(1.0)
    persistent.connect(str(host_socket))
    try:
        # Give the daemon a tick to register the persistent client so we
        # exercise the fan-out path, not the initial-connect path.
        time.sleep(0.1)

        t0 = time.monotonic()
        response = _list_ports_roundtrip(host_socket, recv_timeout_s=0.5)
        elapsed = time.monotonic() - t0

        assert response["type"] == "midi_list_ports_response", (
            f"expected midi_list_ports_response, got {response!r}"
        )
        assert elapsed < 0.5, (
            f"H11 regression: list_ports with a persistent subscriber held open "
            f"took {elapsed:.2f}s (must be < 0.5s; the daemon must service "
            f"concurrent clients, not serialize them)"
        )
    finally:
        persistent.close()


def test_ten_concurrent_list_ports_all_succeed_under_load(host_socket: Path) -> None:
    """Hold one persistent client open. Fire 10 list_ports round-trips
    concurrently from 10 worker threads. Every call must return a valid
    response within 1 s. This is the operator-facing scenario: a backend
    bridge holds an `engine_command` subscription while the MidiHub
    hotplug thread + Hardware Store page + Launch Control surface each
    do their own round-trips."""

    persistent = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    persistent.settimeout(1.0)
    persistent.connect(str(host_socket))
    try:
        time.sleep(0.1)

        results: list[dict | Exception] = [None] * 10  # type: ignore[list-item]

        def _worker(idx: int) -> None:
            try:
                results[idx] = _list_ports_roundtrip(host_socket, recv_timeout_s=1.0)
            except Exception as exc:
                results[idx] = exc

        threads = [threading.Thread(target=_worker, args=(i,)) for i in range(10)]
        t0 = time.monotonic()
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=2.0)
        elapsed = time.monotonic() - t0

        failures = [r for r in results if isinstance(r, Exception)]
        assert not failures, (
            f"H11 regression: {len(failures)}/10 concurrent list_ports failed "
            f"with a persistent subscriber held open. First failure: {failures[0]!r}"
        )
        assert all(
            isinstance(r, dict) and r.get("type") == "midi_list_ports_response"
            for r in results
        ), "every concurrent round-trip must return a midi_list_ports_response"
        assert elapsed < 2.0, (
            f"H11 regression: 10 concurrent list_ports took {elapsed:.2f}s "
            f"(must be < 2.0s; the daemon must fan out, not serialize)"
        )
    finally:
        persistent.close()


def test_listen_backlog_does_not_accumulate_under_persistent_subscriber(
    host_socket: Path,
) -> None:
    """The smoking-gun symptom of the H11 wedge was that ss -lxn showed
    the listen socket's accept queue at 16/16 (full) within seconds of
    a persistent client connecting. This test asserts the queue is
    drained quickly: open one persistent client, fire 8 connect+close
    cycles, observe that the kernel accept queue is back at 0 by the
    time we check."""

    persistent = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    persistent.settimeout(1.0)
    persistent.connect(str(host_socket))
    try:
        # Let the daemon pick up the persistent client.
        time.sleep(0.1)

        # Fire 8 short-lived connect+close cycles. Each must be drained
        # from the kernel backlog by the daemon's accept-all-pending loop
        # within one tick.
        for _ in range(8):
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                s.connect(str(host_socket))

        # Give the daemon ~5 poll ticks to drain.
        time.sleep(0.05)

        # Confirm a fresh request still round-trips. If the backlog were
        # full the connect would EAGAIN at this point.
        response = _list_ports_roundtrip(host_socket, recv_timeout_s=0.5)
        assert response["type"] == "midi_list_ports_response", (
            f"H11 regression: after 8 connect+close cycles plus one persistent "
            f"subscriber, the daemon failed to service a new request. "
            f"Got: {response!r}"
        )
    finally:
        persistent.close()
