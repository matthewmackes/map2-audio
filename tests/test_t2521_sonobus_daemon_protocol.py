"""T2521-4 cycle 2 — daemon UDS protocol functional tests.

Launches the actual `map2-sonobus-transport` binary in stub mode +
exercises every protocol frame the supervisor will send. Catches:
- Frame parser regressions (malformed JSON, missing fields)
- Handler dispatch regressions
- Error-code drift (canonical strings the supervisor matches on)
- Lifecycle regressions (SIGTERM, shutdown, reconnect)

Skipped automatically if the daemon hasn't been built (CI Fedora
builds first, then runs this suite). Use `pytest -k "..."` to target
specific scenarios when debugging.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
DAEMON_BIN = REPO_ROOT / "juce-engine" / "build" / "SonoBusDaemon" / "map2-sonobus-transport"

pytestmark = pytest.mark.skipif(
    not DAEMON_BIN.is_file(),
    reason=f"daemon binary not built at {DAEMON_BIN}; run "
           "`cmake --build juce-engine/build --target map2-sonobus-transport` first",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class DaemonHandle:
    """Spawn the daemon + connect over UDS. Yields a socket for tests."""

    def __init__(self, tmp_path: Path):
        self.socket_path = tmp_path / "sonobus-test.sock"
        self.log_path = tmp_path / "daemon.log"
        self.proc: Optional[subprocess.Popen] = None
        self.sock: Optional[socket.socket] = None
        # Buffer holds unread bytes from prior recv calls — frames can
        # arrive in one TCP read so we must retain the tail across
        # recv_one() invocations.
        self._recv_buf: bytes = b""

    def start(self, timeout: float = 5.0) -> None:
        log_fd = open(self.log_path, "wb")
        self.proc = subprocess.Popen(
            [str(DAEMON_BIN), "--socket", str(self.socket_path)],
            stdout=log_fd,
            stderr=log_fd,
        )
        # Poll for the socket to appear (daemon binds it on initialize()).
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.socket_path.exists():
                break
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"daemon exited prematurely (rc={self.proc.returncode}); "
                    f"log:\n{self.log_path.read_text()}"
                )
            time.sleep(0.05)
        else:
            self.proc.kill()
            raise TimeoutError(
                f"daemon did not bind {self.socket_path} within {timeout}s"
            )

    def connect(self) -> socket.socket:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(5.0)
        # Daemon may not have called accept() yet — retry briefly on ECONNREFUSED.
        deadline = time.monotonic() + 2.0
        while True:
            try:
                s.connect(str(self.socket_path))
                self.sock = s
                return s
            except (FileNotFoundError, ConnectionRefusedError):
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.05)

    def send(self, frame: dict[str, Any]) -> None:
        assert self.sock is not None
        self.sock.sendall((json.dumps(frame) + "\n").encode())

    def recv_one(self, timeout: float = 2.0) -> dict[str, Any]:
        """Read one '\n'-terminated frame from the daemon. Retains any
        trailing bytes from a multi-frame TCP read in `_recv_buf` so
        the next call sees them — without this, batched responses get
        silently dropped after the first one."""
        assert self.sock is not None
        self.sock.settimeout(timeout)
        while b"\n" not in self._recv_buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise EOFError(f"daemon closed connection; buf={self._recv_buf!r}")
            self._recv_buf += chunk
        line, _, rest = self._recv_buf.partition(b"\n")
        self._recv_buf = rest
        return json.loads(line.decode())

    def stop(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None
        if self.proc is not None:
            if self.proc.poll() is None:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=3.0)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait()
            self.proc = None


@pytest.fixture
def daemon(tmp_path: Path):
    handle = DaemonHandle(tmp_path)
    handle.start()
    handle.connect()
    yield handle
    handle.stop()


# ---------------------------------------------------------------------------
# Hello handshake
# ---------------------------------------------------------------------------


def test_hello_returns_version_and_capabilities(daemon: DaemonHandle) -> None:
    """The supervisor's first frame is `hello`. Daemon must reply with
    version + build mode + capability flags so the supervisor knows
    whether to expect AOO transport to work."""
    daemon.send({"v": 1, "type": "hello", "id": "h1"})
    resp = daemon.recv_one()
    assert resp["type"] == "hello.response"
    assert resp["ok"] is True
    assert resp["id"] == "h1"
    d = resp["data"]
    assert "version" in d
    assert d["build_mode"] in ("stub", "full")
    assert isinstance(d["has_aoo"], bool)
    assert isinstance(d["has_jack"], bool)
    assert d["sample_rate_hz"] == 48000
    assert d["buffer_size"] == 64
    assert d["port_base"] == 10000
    assert d["port_count"] == 100


def test_hello_reports_stub_mode_when_aoo_not_vendored(daemon: DaemonHandle) -> None:
    """Cycle 1 + 2 are stub-mode (vendor/aoo/ has no CMakeLists yet);
    has_aoo must be False so the supervisor can warn operators that
    audio won't move until the vendor pull lands."""
    daemon.send({"v": 1, "type": "hello", "id": "h1"})
    resp = daemon.recv_one()
    assert resp["data"]["has_aoo"] is False, (
        "stub build must report has_aoo=False — this is what tells the "
        "supervisor + GUI to show 'AOO transport not vendored'"
    )
    assert resp["data"]["build_mode"] == "stub"


# ---------------------------------------------------------------------------
# Ping (liveness)
# ---------------------------------------------------------------------------


def test_ping_returns_pong(daemon: DaemonHandle) -> None:
    """Cheap liveness check — supervisor pings periodically to verify
    the daemon hasn't deadlocked."""
    daemon.send({"v": 1, "type": "ping", "id": "p1"})
    resp = daemon.recv_one()
    assert resp["ok"] is True
    assert resp["data"]["pong"] is True


# ---------------------------------------------------------------------------
# Source/sink lifecycle (stub mode → returns transport_unavailable)
# ---------------------------------------------------------------------------


def test_create_source_stub_returns_transport_unavailable(daemon: DaemonHandle) -> None:
    """In stub mode (no AOO vendored), AOO calls must fail with the
    canonical `transport_unavailable` error code. The supervisor uses
    this to decide whether to mark the binding `daemon_status=stub` vs
    `daemon_status=failed`."""
    daemon.send({
        "v": 1, "type": "create_source", "id": "cs1",
        "payload": {"stream_id": "test-source-1"},
    })
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "transport_unavailable"


def test_create_sink_stub_returns_transport_unavailable(daemon: DaemonHandle) -> None:
    daemon.send({
        "v": 1, "type": "create_sink", "id": "ck1",
        "payload": {"stream_id": "test-sink-1"},
    })
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "transport_unavailable"


def test_destroy_source_stub_returns_transport_unavailable(daemon: DaemonHandle) -> None:
    daemon.send({
        "v": 1, "type": "destroy_source", "id": "ds1",
        "payload": {"stream_id": "test-source-1"},
    })
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "transport_unavailable"


# ---------------------------------------------------------------------------
# Argument validation
# ---------------------------------------------------------------------------


def test_create_source_without_stream_id_is_invalid_argument(daemon: DaemonHandle) -> None:
    daemon.send({"v": 1, "type": "create_source", "id": "cs2", "payload": {}})
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "invalid_argument"
    assert "stream_id" in resp["error"]["message"]


def test_create_source_with_null_payload_is_invalid_argument(daemon: DaemonHandle) -> None:
    daemon.send({"v": 1, "type": "create_source", "id": "cs3"})
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "invalid_argument"


# ---------------------------------------------------------------------------
# Frame-level errors (parser + dispatcher)
# ---------------------------------------------------------------------------


def test_unknown_command_returns_unknown_command_error(daemon: DaemonHandle) -> None:
    daemon.send({"v": 1, "type": "nonexistent_command", "id": "u1"})
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "unknown_command"
    # Error message must include the rejected command so the supervisor
    # can debug.
    assert "nonexistent_command" in resp["error"]["message"]


def test_malformed_json_returns_invalid_json_error(daemon: DaemonHandle) -> None:
    """A line that isn't valid JSON must produce an `invalid_json` error
    frame — NOT a daemon crash."""
    daemon.sock.sendall(b'{this is not json\n')  # type: ignore[union-attr]
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "invalid_json"


def test_missing_type_field_returns_invalid_frame_error(daemon: DaemonHandle) -> None:
    daemon.send({"v": 1, "id": "x1", "payload": {}})  # no `type`
    resp = daemon.recv_one()
    assert resp["ok"] is False
    assert resp["error"]["code"] == "invalid_frame"


# ---------------------------------------------------------------------------
# Multi-frame batches over one TCP write
# ---------------------------------------------------------------------------


def test_multiple_frames_in_one_write_decoded_separately(daemon: DaemonHandle) -> None:
    """The supervisor may batch multiple commands into one TCP write.
    Daemon must decode each '\\n'-terminated line independently.

    Bump the recv timeout — the daemon's poll loop is 50ms so 3 responses
    may take up to ~200ms to drain. Use 5s to be safe under CI load.
    """
    batch = b""
    batch += json.dumps({"v": 1, "type": "ping", "id": "p1"}).encode() + b"\n"
    batch += json.dumps({"v": 1, "type": "ping", "id": "p2"}).encode() + b"\n"
    batch += json.dumps({"v": 1, "type": "hello", "id": "h1"}).encode() + b"\n"
    daemon.sock.sendall(batch)  # type: ignore[union-attr]
    r1 = daemon.recv_one(timeout=5.0)
    r2 = daemon.recv_one(timeout=5.0)
    r3 = daemon.recv_one(timeout=5.0)
    assert {r1["id"], r2["id"], r3["id"]} == {"p1", "p2", "h1"}
    assert all(r["ok"] for r in (r1, r2, r3))


# ---------------------------------------------------------------------------
# Shutdown command
# ---------------------------------------------------------------------------


def test_shutdown_command_terminates_daemon_cleanly(daemon: DaemonHandle) -> None:
    """`shutdown` command triggers graceful exit. Daemon must reply with
    ok=true BEFORE exiting so the supervisor knows the shutdown was
    acknowledged."""
    daemon.send({"v": 1, "type": "shutdown", "id": "sd1"})
    resp = daemon.recv_one()
    assert resp["ok"] is True
    assert resp["type"] == "shutdown.response"

    # Daemon must exit within ~1s of acknowledging shutdown.
    assert daemon.proc is not None
    rc = daemon.proc.wait(timeout=2.0)
    assert rc == 0, f"daemon shutdown was not clean (rc={rc})"

    # Socket file is cleaned up.
    assert not daemon.socket_path.exists(), (
        "daemon must unlink the UDS socket on graceful exit "
        "(stale sockets break systemd restart)"
    )


# ---------------------------------------------------------------------------
# Single-client lifecycle
# ---------------------------------------------------------------------------


def test_new_connection_preempts_existing_one(tmp_path: Path) -> None:
    """If a second client connects while one is already attached, the
    daemon disconnects the first and accepts the new one. Supervisor
    reconnect after a crash must work without daemon restart."""
    daemon = DaemonHandle(tmp_path)
    daemon.start()
    try:
        # First connection.
        s1 = daemon.connect()
        s1.sendall(b'{"v":1,"type":"ping","id":"first"}\n')
        # Drain first ping response.
        s1.recv(4096)

        # Second connection should boot the first.
        s2 = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s2.settimeout(2.0)
        s2.connect(str(daemon.socket_path))
        s2.sendall(b'{"v":1,"type":"ping","id":"second"}\n')
        resp = b""
        while b"\n" not in resp:
            chunk = s2.recv(4096)
            if not chunk:
                break
            resp += chunk
        decoded = json.loads(resp.partition(b"\n")[0].decode())
        assert decoded["id"] == "second"
        assert decoded["ok"] is True

        # First socket is closed by the daemon — a read returns EOF (empty).
        s1.settimeout(2.0)
        try:
            data = s1.recv(4096)
            assert data == b"", "first client should have been disconnected"
        except (ConnectionResetError, BrokenPipeError):
            pass  # acceptable error from disconnected peer

        s2.close()
    finally:
        daemon.stop()
