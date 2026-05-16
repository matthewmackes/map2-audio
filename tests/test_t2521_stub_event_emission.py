"""Run-14c cycle 4 — T2521-4 stub-mode event emission end-to-end.

The daemon's stub-mode create_source / create_sink handlers now emit
synthetic `peer_up` + `session_start` events; destroy emits
`session_stop` + `peer_down`. This lets the full pipeline
(daemon → UDS → supervisor → event-relay → subscriber queue) be
exercised without bench hardware or the AOO vendor pull.

Skipped if the daemon binary isn't built.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services.sonobus.daemon_client import SonoBusDaemonClient
from app.services.sonobus.daemon_supervisor import (
    SonoBusDaemonStatus,
    SonoBusDaemonSupervisor,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
DAEMON_BIN = REPO_ROOT / "juce-engine" / "build" / "SonoBusDaemon" / "map2-sonobus-transport"

pytestmark = pytest.mark.skipif(
    not DAEMON_BIN.is_file(),
    reason=f"daemon binary not built at {DAEMON_BIN}",
)


async def _wait_for_event(
    queue: asyncio.Queue,
    event_type: str,
    timeout: float = 5.0,
) -> dict:
    """Drain the queue until we see the named event type."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        if event.get("type") == event_type:
            return event
    raise AssertionError(
        f"did not receive event_type={event_type!r} within {timeout}s"
    )


@pytest.mark.asyncio
async def test_create_source_emits_peer_up_and_session_start(tmp_path: Path) -> None:
    """Stub-mode create_source → supervisor's event relay receives both
    peer_up and session_start events through the WS subscriber queue."""
    socket_path = tmp_path / "sb.sock"
    client = SonoBusDaemonClient(socket_path=socket_path)
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        client=client,
        ping_interval_seconds=0.3,
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
        assert sup.status == SonoBusDaemonStatus.RUNNING

        # Subscribe to events BEFORE issuing the lifecycle command so
        # the queue catches the events without racing.
        queue = sup.subscribe_events(replay_buffer=False)

        # Issue the lifecycle command. In stub mode this returns
        # transport_unavailable but the synthetic events still fire.
        from app.services.sonobus.daemon_client import DaemonCommandError
        with pytest.raises(DaemonCommandError):
            await sup.client.create_source("stream-A")

        peer_up = await _wait_for_event(queue, "peer_up")
        session_start = await _wait_for_event(queue, "session_start")

        assert peer_up["payload"]["stream_id"] == "stream-A"
        assert peer_up["payload"]["stub"] is True
        assert session_start["payload"]["stream_id"] == "stream-A"
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_destroy_source_emits_session_stop_and_peer_down(tmp_path: Path) -> None:
    socket_path = tmp_path / "sb.sock"
    client = SonoBusDaemonClient(socket_path=socket_path)
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        client=client,
        ping_interval_seconds=0.3,
        initial_backoff_seconds=0.1,
        max_backoff_seconds=1.0,
    )
    await sup.start()
    try:
        for _ in range(60):
            await asyncio.sleep(0.1)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        assert sup.status == SonoBusDaemonStatus.RUNNING

        from app.services.sonobus.daemon_client import DaemonCommandError
        # Create first so the destroy has a registered stream.
        with pytest.raises(DaemonCommandError):
            await sup.client.create_source("stream-B")

        # NOW subscribe so we only catch the destroy events (not the
        # create's peer_up that already fired).
        queue = sup.subscribe_events(replay_buffer=False)

        with pytest.raises(DaemonCommandError):
            await sup.client.destroy_source("stream-B")

        session_stop = await _wait_for_event(queue, "session_stop")
        peer_down = await _wait_for_event(queue, "peer_down")

        assert session_stop["payload"]["stream_id"] == "stream-B"
        assert peer_down["payload"]["stream_id"] == "stream-B"
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_create_sink_also_emits_peer_up(tmp_path: Path) -> None:
    """The same synthetic-event path covers create_sink (mirrors create_source)."""
    socket_path = tmp_path / "sb.sock"
    client = SonoBusDaemonClient(socket_path=socket_path)
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        client=client,
        ping_interval_seconds=0.3,
        initial_backoff_seconds=0.1,
        max_backoff_seconds=1.0,
    )
    await sup.start()
    try:
        for _ in range(60):
            await asyncio.sleep(0.1)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        queue = sup.subscribe_events(replay_buffer=False)

        from app.services.sonobus.daemon_client import DaemonCommandError
        with pytest.raises(DaemonCommandError):
            await sup.client.create_sink("sink-C")

        peer_up = await _wait_for_event(queue, "peer_up")
        assert peer_up["payload"]["stream_id"] == "sink-C"
    finally:
        await sup.stop()


@pytest.mark.asyncio
async def test_events_marked_with_stub_flag(tmp_path: Path) -> None:
    """The synthetic events carry `stub: true` so consumers can
    distinguish them from real bench events later."""
    socket_path = tmp_path / "sb.sock"
    client = SonoBusDaemonClient(socket_path=socket_path)
    sup = SonoBusDaemonSupervisor(
        binary_path=DAEMON_BIN,
        socket_path=socket_path,
        spawn_subprocess=True,
        client=client,
        ping_interval_seconds=0.3,
        initial_backoff_seconds=0.1,
        max_backoff_seconds=1.0,
    )
    await sup.start()
    try:
        for _ in range(60):
            await asyncio.sleep(0.1)
            if sup.status == SonoBusDaemonStatus.RUNNING:
                break
        queue = sup.subscribe_events(replay_buffer=False)
        from app.services.sonobus.daemon_client import DaemonCommandError
        with pytest.raises(DaemonCommandError):
            await sup.client.create_source("stub-event-flag-check")
        event = await _wait_for_event(queue, "peer_up")
        assert event["payload"].get("stub") is True, (
            "stub-mode events must carry stub: true so the GUI / log "
            "can distinguish them from real bench events"
        )
    finally:
        await sup.stop()
