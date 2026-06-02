"""T2521-4 — SonoBus daemon supervisor lifecycle + health-probe → status.

Focused, mocked-process suite that complements the broader
``tests/test_t2521_daemon_supervisor.py``. It proves the two things the
T2521-4 worklist step 5 calls out for the daemon supervisor:

1. **Lifecycle** — start / stop / restart-on-failure, driven by an
   injected stub client (no real UDS, no real binary).
2. **Health probe feeds status** — the supervisor's ``status_payload()``
   health snapshot is exactly what the ``GET /api/sonobus/status`` route's
   ``_supervisor_status_fields()`` projects into ``daemon_running`` /
   ``daemon_endpoint`` / ``daemon_status``. We assert that projection
   directly so a supervisor-status regression can't silently desync the
   operator-facing API surface.

Mirrors the maschine MK1 daemon test posture (a scriptable stub stands in
for the device/transport; the lifecycle is exercised without hardware).
"""

from __future__ import annotations

import asyncio
from collections import deque
from pathlib import Path
from typing import Any, Optional

import pytest

from app.services.sonobus.daemon_client import (
    DaemonCapabilities,
    DaemonClientError,
    DaemonHandshakeError,
    DaemonNotConnected,
    SonoBusDaemonClient,
)
from app.services.sonobus.daemon_supervisor import (
    SonoBusDaemonStatus,
    SonoBusDaemonSupervisor,
    get_sonobus_daemon_supervisor,
    reset_sonobus_daemon_supervisor_for_tests,
)


# ---------------------------------------------------------------------------
# Scriptable stub client (mocks the daemon "process" behind the UDS).
# ---------------------------------------------------------------------------


class _StubClient(SonoBusDaemonClient):
    """Mocks the daemon connection without a real socket or binary.

    Scriptable:
      - ``connect_script``: deque of either DaemonCapabilities-data dict
        (success) or an Exception (failure) per connect() call. Empty ⇒
        always succeed with ``default_caps``.
      - ``ping_script``: deque of bool/Exception per ping(). Empty ⇒ True.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.default_caps: dict[str, Any] = {
            "version": "0.1.0-stub",
            "build_mode": "stub",
            "has_aoo": False,
            "has_jack": True,
            "sample_rate_hz": 48000,
            "buffer_size": 64,
            "port_base": 10000,
            "port_count": 100,
        }
        self.connect_script: deque = deque()
        self.ping_script: deque = deque()
        self.connect_calls = 0
        self.ping_calls = 0
        self.disconnect_calls = 0
        self._is_connected = False

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def capabilities(self) -> Optional[DaemonCapabilities]:
        return DaemonCapabilities(self.default_caps) if self._is_connected else None

    async def connect(self) -> DaemonCapabilities:
        self.connect_calls += 1
        if self.connect_script:
            item = self.connect_script.popleft()
            if isinstance(item, Exception):
                raise item
            caps = item
        else:
            caps = self.default_caps
        self._is_connected = True
        return DaemonCapabilities(caps)

    async def disconnect(self) -> None:
        self.disconnect_calls += 1
        self._is_connected = False

    async def ping(self) -> bool:
        self.ping_calls += 1
        if not self.ping_script:
            return True
        result = self.ping_script.popleft()
        if isinstance(result, Exception):
            self._is_connected = False
            raise result
        if not result:
            self._is_connected = False
        return bool(result)

    def events(self):  # type: ignore[override]
        async def _empty():
            # Block until cancelled — the supervisor cancels the relay on
            # disconnect/stop. Yield nothing.
            while True:
                await asyncio.sleep(3600)
                if False:
                    yield {}

        return _empty()


async def _await_status(
    sup: SonoBusDaemonSupervisor, target: str, *, attempts: int = 40
) -> None:
    for _ in range(attempts):
        if sup.status == target:
            return
        await asyncio.sleep(0.02)


# ---------------------------------------------------------------------------
# 1. Lifecycle — start / stop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_connects_and_reaches_running() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub, ping_interval_seconds=0.02, initial_backoff_seconds=0.01
    )
    await sup.start()
    try:
        await _await_status(sup, SonoBusDaemonStatus.RUNNING)
        assert sup.status == SonoBusDaemonStatus.RUNNING
        assert sup.is_connected is True
        assert stub.connect_calls == 1
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_stop_disconnects_and_marks_shutdown() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub, ping_interval_seconds=0.02, initial_backoff_seconds=0.01
    )
    await sup.start()
    await _await_status(sup, SonoBusDaemonStatus.RUNNING)
    await sup.stop()
    assert sup.status == SonoBusDaemonStatus.SHUTDOWN
    assert stub.disconnect_calls >= 1
    assert sup.is_connected is False


@pytest.mark.asyncio
async def test_start_is_idempotent_while_running() -> None:
    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub, ping_interval_seconds=0.02, initial_backoff_seconds=0.01
    )
    await sup.start()
    try:
        await _await_status(sup, SonoBusDaemonStatus.RUNNING)
        # A second start() must NOT spawn a second supervisor loop.
        await sup.start()
        await asyncio.sleep(0.05)
        assert sup.status == SonoBusDaemonStatus.RUNNING
    finally:
        await sup.stop()


# ---------------------------------------------------------------------------
# 2. Restart-on-failure — a dropped ping triggers reconnect
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ping_failure_triggers_reconnect() -> None:
    stub = _StubClient()
    # First ping fails (daemon "crashed") → supervisor reconnects; the
    # second connect succeeds and we are RUNNING again.
    stub.ping_script.append(DaemonClientError("ping lost"))
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.02,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await sup.start()
    try:
        await _await_status(sup, SonoBusDaemonStatus.RUNNING)
        # Force the reconnect path: wait for at least two connects.
        for _ in range(60):
            await asyncio.sleep(0.02)
            if stub.connect_calls >= 2:
                break
        assert stub.connect_calls >= 2, "supervisor did not reconnect after ping loss"
        # After reconnect it returns to RUNNING.
        await _await_status(sup, SonoBusDaemonStatus.RUNNING)
        assert sup.status == SonoBusDaemonStatus.RUNNING
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_unreachable_daemon_reports_waiting_not_crash() -> None:
    """Permanent DaemonNotConnected keeps the supervisor alive in
    WAITING_FOR_DAEMON (degraded, non-blocking) — never crashes the loop."""

    stub = _StubClient()
    # Every connect raises DaemonNotConnected.
    for _ in range(50):
        stub.connect_script.append(DaemonNotConnected("socket missing"))
    sup = SonoBusDaemonSupervisor(
        client=stub,
        ping_interval_seconds=0.02,
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.03,
    )
    await sup.start()
    try:
        await _await_status(sup, SonoBusDaemonStatus.WAITING_FOR_DAEMON)
        assert sup.status == SonoBusDaemonStatus.WAITING_FOR_DAEMON
        assert sup.is_connected is False
    finally:
        await sup.stop()


# ---------------------------------------------------------------------------
# 3. Health probe → /api/sonobus/status projection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_payload_feeds_route_fields_when_running() -> None:
    """The route's _supervisor_status_fields() reads status_payload();
    when RUNNING, it must expose daemon_running=True + the endpoint +
    daemon_status=running."""

    from app.services.sonobus.binding_routes import _supervisor_status_fields

    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(
        client=stub,
        socket_path=Path("/run/map2/sonobus-transport.sock"),
        ping_interval_seconds=0.02,
        initial_backoff_seconds=0.01,
    )
    reset_sonobus_daemon_supervisor_for_tests(sup)
    try:
        await sup.start()
        await _await_status(sup, SonoBusDaemonStatus.RUNNING)

        # Direct payload (the health probe).
        payload = sup.status_payload()
        assert payload["connected"] is True
        assert payload["status"] == SonoBusDaemonStatus.RUNNING

        # The route projection that drives GET /api/sonobus/status.
        fields = _supervisor_status_fields()
        assert fields["daemon_running"] is True
        assert fields["daemon_endpoint"] == "/run/map2/sonobus-transport.sock"
        assert fields["daemon_status"] == SonoBusDaemonStatus.RUNNING
        assert fields["daemon_capabilities"] is not None
        assert fields["daemon_capabilities"]["build_mode"] == "stub"
    finally:
        await sup.stop()
        reset_sonobus_daemon_supervisor_for_tests(None)


@pytest.mark.asyncio
async def test_status_payload_feeds_route_fields_when_stopped() -> None:
    """A stopped/unconnected supervisor projects daemon_running=False +
    no endpoint into the route fields."""

    from app.services.sonobus.binding_routes import _supervisor_status_fields

    stub = _StubClient()
    sup = SonoBusDaemonSupervisor(client=stub)
    reset_sonobus_daemon_supervisor_for_tests(sup)
    try:
        # Never started → STOPPED, not connected.
        fields = _supervisor_status_fields()
        assert fields["daemon_running"] is False
        assert fields["daemon_endpoint"] is None
        assert fields["daemon_status"] == SonoBusDaemonStatus.STOPPED
        assert fields["daemon_capabilities"] is None
    finally:
        reset_sonobus_daemon_supervisor_for_tests(None)


def test_singleton_accessor_and_reset() -> None:
    """The module-level singleton accessor returns a stable instance and
    the test-reset hook swaps it cleanly (so route code + tests share the
    same supervisor)."""
    reset_sonobus_daemon_supervisor_for_tests(None)
    a = get_sonobus_daemon_supervisor()
    b = get_sonobus_daemon_supervisor()
    assert a is b
    custom = SonoBusDaemonSupervisor(client=_StubClient())
    reset_sonobus_daemon_supervisor_for_tests(custom)
    assert get_sonobus_daemon_supervisor() is custom
    reset_sonobus_daemon_supervisor_for_tests(None)
