"""T2521-4 cycle 5 — SonoBusDaemonSupervisor unit + functional tests.

Two test surfaces:

1. **Unit** (no real daemon): a stub SonoBusDaemonClient drives the
   supervisor through every state transition. Catches lifecycle bugs
   without depending on a built binary.

2. **Functional** (real daemon): the actual built C++ daemon is
   spawned in supervised mode. Verifies connect → ping → reconnect
   end-to-end. Skipped when the binary isn't built.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any, Optional

import pytest

from app.services.sonobus.daemon_client import (
    DaemonCapabilities,
    DaemonHandshakeError,
    DaemonNotConnected,
    SonoBusDaemonClient,
)
from app.services.sonobus.daemon_supervisor import (
    CRASH_WINDOW_SECONDS,
    MAX_CRASHES_IN_WINDOW,
    SonoBusDaemonStatus,
    SonoBusDaemonSupervisor,
    get_sonobus_daemon_supervisor,
    reset_sonobus_daemon_supervisor_for_tests,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DAEMON_BIN = REPO_ROOT / "juce-engine" / "build" / "SonoBusDaemon" / "map2-sonobus-transport"


# ---------------------------------------------------------------------------
# Stub client for unit tests
# ---------------------------------------------------------------------------


class _StubClient(SonoBusDaemonClient):
    """Mocks SonoBusDaemonClient lifecycle without touching a real UDS.

    Scriptable via the public attributes:
      - ``raise_on_connect``: exception to raise on connect()
      - ``ping_responses``: deque of bool/Exception per ping()
      - ``capabilities_data``: dict for the hello response
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from collections import deque
        self.raise_on_connect: Optional[Exception] = None
        self.ping_responses: deque = deque()
        self.capabilities_data: dict[str, Any] = {
            "version": "0.1.0-stub",
            "build_mode": "stub",
            "has_aoo": False,
            "has_jack": True,
            "sample_rate_hz": 48000,
            "buffer_size": 64,
            "port_base": 10000,
            "port_count": 100,
        }
        self.connect_calls = 0
        self.ping_calls = 0
        self.disconnect_calls = 0
        self._is_connected = False

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def capabilities(self) -> Optional[DaemonCapabilities]:
        return DaemonCapabilities(self.capabilities_data) if self._is_connected else None

    async def connect(self) -> DaemonCapabilities:
        self.connect_calls += 1
        if self.raise_on_connect is not None:
            exc = self.raise_on_connect
            self.raise_on_connect = None
            raise exc
        self._is_connected = True
        return DaemonCapabilities(self.capabilities_data)

    async def disconnect(self) -> None:
        self.disconnect_calls += 1
        self._is_connected = False

    async def ping(self) -> bool:
        self.ping_calls += 1
        if not self.ping_responses:
            return True
        result = self.ping_responses.popleft()
        if isinstance(result, Exception):
            raise result
        return bool(result)


# ---------------------------------------------------------------------------
# Unit tests with stub client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_supervisor_initial_status_is_stopped() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(client=stub)
    assert sup.status == SonoBusDaemonStatus.STOPPED
    assert sup.status_payload()["status"] == SonoBusDaemonStatus.STOPPED
    assert sup.status_payload()["connected"] is False
    assert sup.status_payload()["capabilities"] is None


@pytest.mark.asyncio
async def test_supervisor_transitions_to_running_on_successful_connect() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
    )
    await sup.start()
    try:
        # Wait up to 1s for the supervisor to connect.
        for _ in range(20):
            await asyncio.sleep(0.05)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        assert sup.status == SonoBusDaemonStatus.RUNNING
        assert sup.is_connected is True
        payload = sup.status_payload()
        assert payload["connected"] is True
        assert payload["capabilities"] is not None
        assert payload["capabilities"]["version"] == "0.1.0-stub"
        assert payload["capabilities"]["build_mode"] == "stub"
        assert stub.connect_calls == 1
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_supervisor_reports_waiting_for_daemon_when_uds_unreachable() -> None:
    """Permanent DaemonNotConnected → supervisor stays in WAITING_FOR_DAEMON."""

    class AlwaysUnreachable(_StubClient):
        async def connect(self) -> DaemonCapabilities:
            self.connect_calls += 1
            raise DaemonNotConnected("socket missing")

    stub = AlwaysUnreachable()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await sup.start()
    try:
        # Give the supervisor at least one connect attempt.
        for _ in range(40):
            await asyncio.sleep(0.05)
            if sup.status == SonoBusDaemonStatus.WAITING_FOR_DAEMON:
                break
        # In non-spawn-subprocess mode, status should be WAITING_FOR_DAEMON.
        assert sup.status == SonoBusDaemonStatus.WAITING_FOR_DAEMON, (
            f"expected WAITING_FOR_DAEMON; got {sup.status}"
        )
        assert sup.is_connected is False
        assert "UDS not reachable" in (sup.status_payload()["last_error"] or "")
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_supervisor_reconnects_after_ping_failure() -> None:
    """Daemon disconnect → ping fails → supervisor reconnects → RUNNING again."""
    from collections import deque
    stub = _StubClient()
    # First ping succeeds; second raises (simulates daemon disconnect);
    # supervisor should disconnect + reconnect + then succeed.
    stub.ping_responses = deque([True, DaemonNotConnected("disconnect")])
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await sup.start()
    try:
        # Wait for the first connect.
        for _ in range(20):
            await asyncio.sleep(0.05)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        assert sup.status == SonoBusDaemonStatus.RUNNING
        first_connect_count = stub.connect_calls
        # Wait for a reconnect cycle.
        for _ in range(40):
            await asyncio.sleep(0.05)
            if stub.connect_calls > first_connect_count:
                break
        assert stub.connect_calls > first_connect_count, (
            "supervisor must reconnect after ping failure"
        )
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_supervisor_handshake_failure_records_crash() -> None:
    """Permanent DaemonHandshakeError → crash counter increments + status
    reflects handshake failure in last_error."""

    class AlwaysHandshakeFailing(_StubClient):
        async def connect(self) -> DaemonCapabilities:
            self.connect_calls += 1
            raise DaemonHandshakeError("bad protocol version")

    stub = AlwaysHandshakeFailing()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await sup.start()
    try:
        for _ in range(40):
            await asyncio.sleep(0.05)
            if sup.status_payload()["crashes_in_window"] >= 1:
                break
        payload = sup.status_payload()
        assert payload["crashes_in_window"] >= 1
        assert "handshake failed" in (payload["last_error"] or "")
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_supervisor_storm_guard_marks_degraded() -> None:
    """After MAX_CRASHES_IN_WINDOW handshake failures, supervisor degrades."""
    stub = _StubClient()
    # Permanent handshake failure.
    stub.raise_on_connect = DaemonHandshakeError("permanent")

    class AlwaysFailingClient(_StubClient):
        async def connect(self) -> DaemonCapabilities:
            self.connect_calls += 1
            raise DaemonHandshakeError("permanent")

    stub = AlwaysFailingClient()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.02,
    )
    await sup.start()
    try:
        # Wait for the supervisor to accumulate MAX_CRASHES and degrade.
        for _ in range(200):
            await asyncio.sleep(0.05)
            if sup.status == SonoBusDaemonStatus.DEGRADED:
                break
        assert sup.status == SonoBusDaemonStatus.DEGRADED, (
            f"expected DEGRADED after {MAX_CRASHES_IN_WINDOW} crashes; "
            f"got {sup.status} with {sup.status_payload()['crashes_in_window']} crashes"
        )
        assert "crash storm" in (sup.status_payload()["last_error"] or "").lower()
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_supervisor_reset_storm_guard_re_enables_restart() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(client=stub)
    # Directly force degraded state.
    sup._status = SonoBusDaemonStatus.DEGRADED  # type: ignore[attr-defined]
    sup._crash_times.append(0.0)  # type: ignore[attr-defined]
    assert sup.status == SonoBusDaemonStatus.DEGRADED
    sup.reset_storm_guard()
    assert sup.status == SonoBusDaemonStatus.STOPPED
    assert len(sup._crash_times) == 0  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_supervisor_stop_disconnects_and_exits_cleanly() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.05,
        initial_backoff_seconds=0.01,
    )
    await sup.start()
    # Let it connect.
    for _ in range(20):
        await asyncio.sleep(0.05)
        if sup.status == SonoBusDaemonStatus.RUNNING:
            break
    await sup.stop()
    assert sup.status == SonoBusDaemonStatus.SHUTDOWN
    assert stub.disconnect_calls >= 1


# ---------------------------------------------------------------------------
# Singleton management
# ---------------------------------------------------------------------------


def test_singleton_returns_same_instance() -> None:
    reset_sonobus_daemon_supervisor_for_tests(None)
    try:
        a = get_sonobus_daemon_supervisor()
        b = get_sonobus_daemon_supervisor()
        assert a is b
    finally:
        reset_sonobus_daemon_supervisor_for_tests(None)


def test_reset_for_tests_installs_replacement() -> None:
    stub = _StubClient()
    custom = SonoBusDaemonSupervisor(client=stub)
    reset_sonobus_daemon_supervisor_for_tests(custom)
    try:
        assert get_sonobus_daemon_supervisor() is custom
    finally:
        reset_sonobus_daemon_supervisor_for_tests(None)


# ---------------------------------------------------------------------------
# Status surface (snapshot of status_payload shape)
# ---------------------------------------------------------------------------


def test_status_payload_includes_all_required_keys() -> None:
    """The /api/sonobus/status route consumes specific keys; lock the shape."""
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(client=stub)
    payload = sup.status_payload()
    for key in (
        "status",
        "binary_path",
        "binary_exists",
        "socket_path",
        "socket_exists",
        "connected",
        "spawned_subprocess",
        "subprocess_pid",
        "connected_at",
        "uptime_seconds",
        "restart_count",
        "crashes_in_window",
        "last_error",
        "capabilities",
    ):
        assert key in payload, f"status_payload missing key: {key!r}"


# ---------------------------------------------------------------------------
# Functional tests with the real daemon (skipped if binary missing)
# ---------------------------------------------------------------------------


pytestmark_functional = pytest.mark.skipif(
    not DAEMON_BIN.is_file(),
    reason=f"daemon binary not built at {DAEMON_BIN}; cycle-1 build must run first",
)


@pytest.mark.asyncio
@pytestmark_functional
async def test_real_daemon_connects_via_supervisor(tmp_path: Path) -> None:
    """Spawn the real daemon under the supervisor + verify hello capabilities."""
    socket_path = tmp_path / "sonobus.sock"
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        ping_interval_seconds=0.5,
        initial_backoff_seconds=0.1,
        max_backoff_seconds=1.0,
    )
    await sup.start()
    try:
        # Wait for connect.
        for _ in range(60):
            await asyncio.sleep(0.1)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        assert sup.status == SonoBusDaemonStatus.RUNNING, (
            f"expected RUNNING; got {sup.status} ({sup.status_payload()['last_error']})"
        )
        caps = sup.status_payload()["capabilities"]
        assert caps is not None
        assert caps["build_mode"] in ("stub", "full")
        # has_aoo must agree with build_mode: full ⇒ AOO vendored + linked
        # (T2521-4 real transport); stub ⇒ AOO not vendored. We assert the
        # invariant rather than a fixed value so the test passes in BOTH a
        # CI stub build AND a bench/dev full-AOO build.
        assert caps["has_aoo"] is (caps["build_mode"] == "full")
        assert caps["sample_rate_hz"] == 48000
        assert caps["buffer_size"] == 64
    finally:
        await sup.stop()


@pytest.mark.asyncio
@pytestmark_functional
async def test_real_daemon_create_source_behaviour_matches_build_mode(
    tmp_path: Path,
) -> None:
    """End-to-end: supervisor → client → real daemon → create_source.

    Behaviour is build-mode-dependent (T2521-4 made the full path real):
      - STUB build (AOO not vendored): create_source returns the
        ``transport_unavailable`` command error.
      - FULL build (AOO vendored + linked): create_source actually
        allocates a real AOO source (+ JACK ports if a JACK server is
        reachable) and returns ok.
    We branch on the daemon's reported ``has_aoo`` capability so the test
    is correct in both modes.
    """
    from app.services.sonobus.daemon_client import DaemonCommandError

    socket_path = tmp_path / "sonobus.sock"
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        ping_interval_seconds=0.5,
        initial_backoff_seconds=0.1,
        max_backoff_seconds=1.0,
    )
    await sup.start()
    try:
        for _ in range(60):
            await asyncio.sleep(0.1)
            if sup.is_connected:
                break
        assert sup.is_connected
        caps = sup.status_payload()["capabilities"]
        assert caps is not None

        if caps["has_aoo"]:
            # FULL mode: a real AOO source is created; the call succeeds
            # (create_source raises on a command error, returns None on ok).
            await sup.client.create_source("test-stream")
            # Tearing it down again must also succeed (idempotent destroy).
            await sup.client.destroy_source("test-stream")
        else:
            # STUB mode: transport is unavailable.
            with pytest.raises(DaemonCommandError) as exc_info:
                await sup.client.create_source("test-stream")
            assert exc_info.value.error_code == "transport_unavailable"
    finally:
        await sup.stop()
