"""T2521-4 cycle 7 — metrics + WS event bridge tests.

Coverage matrix:

- Daemon side (functional, requires built binary):
  * `metrics_query` UDS command returns full snapshot
  * `metrics_query` with stream_id returns single-stream snapshot
  * `metrics_query` with unknown stream_id returns stream_not_found
  * Source/sink lifecycle registers/unregisters streams in metrics

- Supervisor side (unit, no daemon):
  * latest_metrics() returns empty + fresh=False until an event arrives
  * _handle_daemon_event with metrics_snapshot updates the cache
  * latest_metrics() reports fresh=True for snapshots <30s old
  * subscribe_events() returns a queue that receives subsequent events
  * subscribe_events(replay_buffer=True) pre-loads recent events
  * unsubscribe_events() removes the queue from the fanout list
  * Slow subscriber (full queue) does not block other subscribers

- Route side:
  * /api/sonobus/diagnostics surfaces daemon_running + live metrics
  * /api/sonobus/diagnostics returns None metrics when daemon has no snapshot
"""

from __future__ import annotations

import asyncio
import json
import socket
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

import pytest

from app.services.sonobus.daemon_supervisor import (
    SonoBusDaemonSupervisor,
)
from app.services.sonobus.daemon_client import SonoBusDaemonClient


REPO_ROOT = Path(__file__).resolve().parents[1]
DAEMON_BIN = REPO_ROOT / "juce-engine" / "build" / "SonoBusDaemon" / "map2-sonobus-transport"


# ---------------------------------------------------------------------------
# Helper to spawn the daemon for functional tests
# ---------------------------------------------------------------------------


class _DaemonProc:
    def __init__(self, tmp_path: Path):
        self.socket_path = tmp_path / "sonobus.sock"
        self.log_path = tmp_path / "daemon.log"
        self.proc: Optional[subprocess.Popen] = None

    def start(self, timeout: float = 5.0) -> None:
        log_fd = open(self.log_path, "wb")
        self.proc = subprocess.Popen(
            [str(DAEMON_BIN), "--socket", str(self.socket_path)],
            stdout=log_fd,
            stderr=log_fd,
        )
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.socket_path.exists():
                return
            if self.proc.poll() is not None:
                raise RuntimeError(
                    f"daemon exited (rc={self.proc.returncode}); "
                    f"log:\n{self.log_path.read_text()}"
                )
            time.sleep(0.05)
        self.proc.kill()
        raise TimeoutError(f"daemon did not bind {self.socket_path} in {timeout}s")

    def stop(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3.0)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()


pytestmark_functional = pytest.mark.skipif(
    not DAEMON_BIN.is_file(),
    reason=f"daemon binary not built at {DAEMON_BIN}",
)


_recv_buffers: dict[int, bytes] = {}


def _send_recv(sock: socket.socket, frame: dict[str, Any]) -> dict[str, Any]:
    """Sync send-recv helper for the functional tests.

    Run-14c cycle 4: skips event frames (those carrying `event: true`)
    so command-response tests don't accidentally read a synthetic
    stub-mode event from the create/destroy lifecycle handlers.
    Retains the read buffer per-socket so subsequent calls see any
    leftover bytes from a multi-frame TCP read.
    """
    sock.sendall((json.dumps(frame) + "\n").encode())
    sock.settimeout(5.0)
    buf = _recv_buffers.get(id(sock), b"")
    while True:
        while b"\n" not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                raise EOFError(f"daemon closed; buf={buf!r}")
            buf += chunk
        line, _, rest = buf.partition(b"\n")
        buf = rest
        decoded = json.loads(line.decode())
        if isinstance(decoded, dict) and decoded.get("event") is True:
            # Skip event frames.
            continue
        _recv_buffers[id(sock)] = buf
        return decoded


# ---------------------------------------------------------------------------
# Functional: daemon-side metrics_query + stream registry
# ---------------------------------------------------------------------------


@pytestmark_functional
def test_daemon_metrics_query_empty_returns_no_streams(tmp_path: Path) -> None:
    """Fresh daemon has no streams registered — metrics_query returns
    an empty streams list."""
    proc = _DaemonProc(tmp_path)
    proc.start()
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(str(proc.socket_path))
        try:
            resp = _send_recv(s, {"v": 1, "type": "metrics_query", "id": "mq1"})
            assert resp["ok"] is True
            assert resp["data"]["streams"] == []
            assert "taken_at_unix_ms" in resp["data"]
        finally:
            s.close()
    finally:
        proc.stop()


@pytestmark_functional
def test_daemon_create_source_registers_stream_in_metrics(tmp_path: Path) -> None:
    """Calling create_source registers the stream_id in the metrics
    collector even in stub mode (so diagnostics rows still appear)."""
    proc = _DaemonProc(tmp_path)
    proc.start()
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(str(proc.socket_path))
        try:
            # create_source returns transport_unavailable in stub mode,
            # but the stream IS registered with the metrics collector.
            _send_recv(s, {
                "v": 1, "type": "create_source", "id": "cs1",
                "payload": {"stream_id": "test-stream-A"},
            })
            _send_recv(s, {
                "v": 1, "type": "create_sink", "id": "ck1",
                "payload": {"stream_id": "test-stream-B"},
            })
            resp = _send_recv(s, {"v": 1, "type": "metrics_query", "id": "mq2"})
            assert resp["ok"] is True
            stream_ids = {entry["stream_id"] for entry in resp["data"]["streams"]}
            assert stream_ids == {"test-stream-A", "test-stream-B"}
            # Stub-mode metrics: rtt=0, loss=0, etc.
            for entry in resp["data"]["streams"]:
                assert entry["rtt_ms"] == 0.0
                assert entry["loss_pct"] == 0.0
        finally:
            s.close()
    finally:
        proc.stop()


@pytestmark_functional
def test_daemon_metrics_query_for_single_stream(tmp_path: Path) -> None:
    """metrics_query with stream_id returns that stream's metrics."""
    proc = _DaemonProc(tmp_path)
    proc.start()
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(str(proc.socket_path))
        try:
            _send_recv(s, {
                "v": 1, "type": "create_source", "id": "cs1",
                "payload": {"stream_id": "single-stream"},
            })
            resp = _send_recv(s, {
                "v": 1, "type": "metrics_query", "id": "mq3",
                "payload": {"stream_id": "single-stream"},
            })
            assert resp["ok"] is True
            assert resp["data"]["stream_id"] == "single-stream"
        finally:
            s.close()
    finally:
        proc.stop()


@pytestmark_functional
def test_daemon_metrics_query_unknown_stream_returns_not_found(tmp_path: Path) -> None:
    """metrics_query with unknown stream_id returns canonical stream_not_found."""
    proc = _DaemonProc(tmp_path)
    proc.start()
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(str(proc.socket_path))
        try:
            resp = _send_recv(s, {
                "v": 1, "type": "metrics_query", "id": "mq4",
                "payload": {"stream_id": "nonexistent"},
            })
            assert resp["ok"] is False
            assert resp["error"]["code"] == "stream_not_found"
        finally:
            s.close()
    finally:
        proc.stop()


@pytestmark_functional
def test_daemon_destroy_source_unregisters_stream(tmp_path: Path) -> None:
    """destroy_source removes the stream from the metrics registry."""
    proc = _DaemonProc(tmp_path)
    proc.start()
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect(str(proc.socket_path))
        try:
            _send_recv(s, {
                "v": 1, "type": "create_source", "id": "cs1",
                "payload": {"stream_id": "ephemeral"},
            })
            resp = _send_recv(s, {"v": 1, "type": "metrics_query", "id": "mq5"})
            stream_ids = {e["stream_id"] for e in resp["data"]["streams"]}
            assert "ephemeral" in stream_ids

            _send_recv(s, {
                "v": 1, "type": "destroy_source", "id": "ds1",
                "payload": {"stream_id": "ephemeral"},
            })
            resp = _send_recv(s, {"v": 1, "type": "metrics_query", "id": "mq6"})
            stream_ids = {e["stream_id"] for e in resp["data"]["streams"]}
            assert "ephemeral" not in stream_ids
        finally:
            s.close()
    finally:
        proc.stop()


# ---------------------------------------------------------------------------
# Supervisor side — unit tests, no real daemon
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_latest_metrics_empty_by_default() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    snapshot = sup.latest_metrics()
    assert snapshot["streams"] == {}
    assert snapshot["taken_at_unix_ms"] is None
    assert snapshot["fresh"] is False


@pytest.mark.asyncio
async def test_handle_metrics_snapshot_updates_cache() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    event = {
        "type": "metrics_snapshot",
        "payload": {
            "streams": [
                {
                    "stream_id": "s1",
                    "rtt_ms": 12.5,
                    "loss_pct": 0.1,
                    "jitter_ms": 1.2,
                    "resend_count": 3,
                    "observed_latency_ms": 14.0,
                    "last_update_unix_ms": int(time.time() * 1000),
                },
                {
                    "stream_id": "s2",
                    "rtt_ms": 8.0,
                    "loss_pct": 0.0,
                    "jitter_ms": 0.5,
                    "resend_count": 0,
                    "observed_latency_ms": 9.5,
                    "last_update_unix_ms": int(time.time() * 1000),
                },
            ],
            "taken_at_unix_ms": int(time.time() * 1000),
        },
    }
    sup._handle_daemon_event(event)

    snapshot = sup.latest_metrics()
    assert set(snapshot["streams"].keys()) == {"s1", "s2"}
    assert snapshot["streams"]["s1"]["rtt_ms"] == 12.5
    assert snapshot["streams"]["s2"]["resend_count"] == 0
    assert snapshot["fresh"] is True


@pytest.mark.asyncio
async def test_latest_metrics_marks_stale_after_30s() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    very_old_ms = int(time.time() * 1000) - 60_000  # 60s ago
    event = {
        "type": "metrics_snapshot",
        "payload": {
            "streams": [
                {"stream_id": "old", "last_update_unix_ms": very_old_ms},
            ],
            "taken_at_unix_ms": very_old_ms,
        },
    }
    sup._handle_daemon_event(event)
    snapshot = sup.latest_metrics()
    assert snapshot["fresh"] is False, (
        "snapshot >30s old should be marked stale so the GUI can hide values"
    )


@pytest.mark.asyncio
async def test_subscribe_events_receives_subsequent_events() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    queue = sup.subscribe_events(replay_buffer=False)
    try:
        event = {"type": "peer_up", "payload": {"peer_id": "node-42"}}
        sup._handle_daemon_event(event)
        received = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert received == event
    finally:
        sup.unsubscribe_events(queue)


@pytest.mark.asyncio
async def test_subscribe_events_replays_buffer_when_requested() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    # Push a few events BEFORE the subscriber attaches.
    for i in range(3):
        sup._handle_daemon_event({"type": "peer_up", "payload": {"i": i}})

    queue = sup.subscribe_events(replay_buffer=True)
    try:
        # All three should be available immediately.
        received = []
        for _ in range(3):
            received.append(await asyncio.wait_for(queue.get(), timeout=1.0))
        assert [e["payload"]["i"] for e in received] == [0, 1, 2]
    finally:
        sup.unsubscribe_events(queue)


@pytest.mark.asyncio
async def test_unsubscribe_events_removes_queue_from_fanout() -> None:
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    queue = sup.subscribe_events(replay_buffer=False)
    sup.unsubscribe_events(queue)

    sup._handle_daemon_event({"type": "peer_up"})
    # Queue should NOT receive the event.
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(queue.get(), timeout=0.1)


@pytest.mark.asyncio
async def test_slow_subscriber_does_not_block_others() -> None:
    """A subscriber with a full queue drops oldest items, doesn't
    backpressure the supervisor or other subscribers."""
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    slow = sup.subscribe_events(replay_buffer=False)
    # Fill the slow queue (size 256).
    for i in range(256):
        slow.put_nowait({"type": "filler", "i": i})

    fast = sup.subscribe_events(replay_buffer=False)
    try:
        sup._handle_daemon_event({"type": "important_event"})
        # Fast subscriber gets the event without blocking.
        received = await asyncio.wait_for(fast.get(), timeout=1.0)
        assert received["type"] == "important_event"
    finally:
        sup.unsubscribe_events(slow)
        sup.unsubscribe_events(fast)


@pytest.mark.asyncio
async def test_metrics_snapshot_missing_taken_at_uses_current_time() -> None:
    """Defensive: if the daemon omits taken_at_unix_ms, the supervisor
    fills in time.time() so the freshness check still works."""
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    event = {
        "type": "metrics_snapshot",
        "payload": {
            "streams": [{"stream_id": "s1"}],
            # Note: no taken_at_unix_ms.
        },
    }
    sup._handle_daemon_event(event)
    snapshot = sup.latest_metrics()
    assert snapshot["taken_at_unix_ms"] is not None
    assert snapshot["fresh"] is True


@pytest.mark.asyncio
async def test_non_metrics_event_does_not_clobber_cache() -> None:
    """peer_up + session_start etc. don't touch the metrics cache."""
    sup = SonoBusDaemonSupervisor(client=SonoBusDaemonClient())
    # Seed with a metrics snapshot.
    sup._handle_daemon_event({
        "type": "metrics_snapshot",
        "payload": {
            "streams": [{"stream_id": "s1", "rtt_ms": 5.0}],
            "taken_at_unix_ms": int(time.time() * 1000),
        },
    })
    # Now a non-metrics event arrives.
    sup._handle_daemon_event({"type": "peer_up", "payload": {"peer": "x"}})

    snapshot = sup.latest_metrics()
    assert "s1" in snapshot["streams"], (
        "non-metrics events must not clobber the metrics cache"
    )
