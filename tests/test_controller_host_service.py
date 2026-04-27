"""Tests for app.services.controller_host_service.

Worklist: T2459-A6.

Strategy: the supervisor needs to handle three families of behavior —
binary-missing, normal-spawn-then-exit, restart-storm. We use small
shell-script binaries written into ``tmp_path`` to simulate a child
``map2-controller-host`` until T2459-B2 builds the real one. This keeps
the tests hermetic, fast, and independent of QuickJS.
"""

from __future__ import annotations

import asyncio
import os
import stat
import textwrap
from pathlib import Path

import pytest

from app.services.controller_host_service import (
    CRASH_WINDOW_SECONDS,
    ControllerHostService,
    ControllerHostStatus,
    get_controller_host_service,
    reset_controller_host_service_for_tests,
)


def _write_script(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture(autouse=True)
def _reset_singleton() -> None:
    reset_controller_host_service_for_tests()
    yield
    reset_controller_host_service_for_tests()


def test_service_starts_in_stopped_state(tmp_path: Path) -> None:
    svc = ControllerHostService(
        binary_path=tmp_path / "missing-binary",
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
    )
    assert svc.status == ControllerHostStatus.STOPPED
    payload = svc.status_payload()
    assert payload["binary_exists"] is False
    assert payload["pid"] is None


@pytest.mark.asyncio
async def test_missing_binary_does_not_block_startup(tmp_path: Path) -> None:
    """If the binary is absent the supervisor must enter
    WAITING_FOR_BINARY and the start() call must return promptly so
    backend boot continues.
    """
    svc = ControllerHostService(
        binary_path=tmp_path / "missing",
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
    )
    await svc.start()
    # Give the supervisor a moment to discover the missing binary.
    for _ in range(20):
        if svc.status == ControllerHostStatus.WAITING_FOR_BINARY:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.WAITING_FOR_BINARY
    assert "Binary not found" in (svc.status_payload()["last_error"] or "")
    await svc.stop()


@pytest.mark.asyncio
async def test_spawn_running_then_clean_shutdown(tmp_path: Path) -> None:
    """A simple long-running child reaches RUNNING; SIGTERM during stop
    cleans it up.
    """
    binary = tmp_path / "host.sh"
    _write_script(binary, textwrap.dedent("""\
        #!/bin/bash
        # Long-running fake controller-host. Waits for SIGTERM.
        trap 'exit 0' TERM
        while true; do sleep 1; done
    """))
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
    )
    await svc.start()

    for _ in range(40):
        if svc.status == ControllerHostStatus.RUNNING:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.RUNNING
    payload = svc.status_payload()
    assert payload["pid"] is not None
    assert payload["binary_exists"] is True

    await svc.stop()
    assert svc.status == ControllerHostStatus.SHUTDOWN


@pytest.mark.asyncio
async def test_crash_writes_diagnostic_log(tmp_path: Path) -> None:
    """A child that exits non-zero produces a last-crash log."""
    binary = tmp_path / "host.sh"
    _write_script(binary, textwrap.dedent("""\
        #!/bin/bash
        echo "boom on stderr" >&2
        exit 7
    """))
    crash_log = tmp_path / "crash.log"
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=crash_log,
        cpu_affinity=(),
    )
    await svc.start()
    # Wait until the supervisor has restarted at least once, which
    # implies the crash log has been written.
    for _ in range(60):
        if crash_log.exists():
            break
        await asyncio.sleep(0.05)
    assert crash_log.exists()
    contents = crash_log.read_text()
    assert "exit_code: 7" in contents
    assert "boom on stderr" in contents
    await svc.stop()


@pytest.mark.asyncio
async def test_restart_storm_guard_trips(tmp_path: Path) -> None:
    """A child that exits immediately and repeatedly trips the
    storm guard within a short window.
    """
    binary = tmp_path / "host.sh"
    _write_script(binary, "#!/bin/bash\nexit 1\n")
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
        initial_backoff_seconds=0.01,   # short backoff for fast test
        max_backoff_seconds=0.05,
    )
    await svc.start()
    # Wait for the storm guard to trip (5 crashes in < 60s).
    for _ in range(400):
        if svc.status == ControllerHostStatus.DEGRADED:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.DEGRADED
    assert svc.status_payload()["crashes_in_window"] >= 5
    await svc.stop()


@pytest.mark.asyncio
async def test_reset_storm_guard_re_enables_supervisor(tmp_path: Path) -> None:
    binary = tmp_path / "host.sh"
    _write_script(binary, "#!/bin/bash\nexit 1\n")
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await svc.start()
    for _ in range(400):
        if svc.status == ControllerHostStatus.DEGRADED:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.DEGRADED
    svc.reset_storm_guard()
    # Status should leave DEGRADED. Crash list cleared.
    assert svc.status_payload()["crashes_in_window"] == 0
    await svc.stop()


def test_singleton_helper() -> None:
    a = get_controller_host_service()
    b = get_controller_host_service()
    assert a is b
    reset_controller_host_service_for_tests()
    c = get_controller_host_service()
    assert c is not a
