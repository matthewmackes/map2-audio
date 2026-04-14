from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services.avb import ptp_monitor


class _FakeProcess:
    def __init__(self, *, stdout: str, stderr: str = "", returncode: int = 0):
        self._stdout = stdout.encode()
        self._stderr = stderr.encode()
        self.returncode = returncode

    async def communicate(self):
        return self._stdout, self._stderr


@pytest.mark.asyncio
async def test_query_pmc_uses_writable_runtime_socket_path(monkeypatch, tmp_path):
    monitor = ptp_monitor.PTPMonitor()
    socket_paths: list[Path] = []
    create_calls: list[tuple[str, ...]] = []

    monkeypatch.setattr(ptp_monitor.shutil, "which", lambda tool: "/usr/sbin/pmc" if tool == "pmc" else None)
    monkeypatch.setattr(
        monitor,
        "_reserve_pmc_client_socket_path",
        lambda: tmp_path / "pmc-client.sock",
    )

    async def _fake_create_subprocess_exec(*args, **kwargs):
        create_calls.append(tuple(args))
        socket_path = Path(args[5])
        socket_path.write_text("stale", encoding="utf-8")
        socket_paths.append(socket_path)
        command = args[6]
        if command == "GET CURRENT_DATA_SET":
            return _FakeProcess(
                stdout=(
                    "CURRENT_DATA_SET\n"
                    "  offsetFromMaster     -123\n"
                    "  meanPathDelay        456\n"
                    "  stepsRemoved         1\n"
                )
            )
        if command == "GET PARENT_DATA_SET":
            return _FakeProcess(
                stdout=(
                    "PARENT_DATA_SET\n"
                    "  grandmasterIdentity  00.11.22.ff.fe.33.44.55\n"
                    "  grandmasterPriority1 246\n"
                    "  grandmasterClockClass 248\n"
                )
            )
        raise AssertionError(f"unexpected pmc command: {command}")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    status = await monitor._query_pmc()

    assert status is not None
    assert status.available is True
    assert status.state == "SLAVE"
    assert status.offset_ns == -123.0
    assert status.mean_path_delay_ns == 456.0
    assert status.grandmaster_id == "00.11.22.ff.fe.33.44.55"
    assert status.grandmaster_priority1 == 246
    assert status.grandmaster_clock_class == 248
    assert len(create_calls) == 2
    assert create_calls[0][:6] == ("pmc", "-u", "-b", "0", "-i", str(tmp_path / "pmc-client.sock"))
    assert all(not path.exists() for path in socket_paths)


@pytest.mark.asyncio
async def test_query_pmc_skips_invocation_when_no_writable_runtime_socket_is_available(monkeypatch):
    monitor = ptp_monitor.PTPMonitor()

    monkeypatch.setattr(ptp_monitor.shutil, "which", lambda tool: "/usr/sbin/pmc" if tool == "pmc" else None)
    monkeypatch.setattr(monitor, "_reserve_pmc_client_socket_path", lambda: None)

    async def _unexpected_create_subprocess_exec(*args, **kwargs):
        raise AssertionError(f"pmc should not be invoked without a writable client socket: {args}")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _unexpected_create_subprocess_exec)

    status = await monitor._query_pmc()

    assert status is None


@pytest.mark.asyncio
async def test_query_pmc_rejects_echo_only_output_without_dataset_fields(monkeypatch):
    monitor = ptp_monitor.PTPMonitor()

    monkeypatch.setattr(ptp_monitor.shutil, "which", lambda tool: "/usr/sbin/pmc" if tool == "pmc" else None)

    async def _fake_run_pmc_query(command: str):
        if command == "GET CURRENT_DATA_SET":
            return "sending: GET CURRENT_DATA_SET\nCURRENT_DATA_SET\n"
        if command == "GET PARENT_DATA_SET":
            return "sending: GET PARENT_DATA_SET\nPARENT_DATA_SET\n"
        raise AssertionError(f"unexpected pmc command: {command}")

    monkeypatch.setattr(monitor, "_run_pmc_query", _fake_run_pmc_query)

    status = await monitor._query_pmc()

    assert status is None


def test_get_ptp_monitor_uses_shared_singleton_getter():
    ptp_monitor.PTPMonitor.reset_instance()

    try:
        first = ptp_monitor.get_ptp_monitor()
        second = ptp_monitor.get_ptp_monitor()

        assert first is second
        assert ptp_monitor.PTPMonitor.has_instance() is True
    finally:
        ptp_monitor.PTPMonitor.reset_instance()


@pytest.mark.asyncio
async def test_parse_journal_handles_interface_qualified_port_state_transitions(monkeypatch):
    monitor = ptp_monitor.PTPMonitor()

    async def _fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(
            stdout=(
                "Apr 14 14:14:19 MAP2-TESTBED ptp4l[1877]: port 1 (enp11s0): FAULTY to LISTENING on INIT_COMPLETE\n"
                "Apr 14 14:14:27 MAP2-TESTBED ptp4l[1877]: port 1 (enp11s0): LISTENING to MASTER on ANNOUNCE_RECEIPT_TIMEOUT_EXPIRES\n"
                "Apr 14 14:14:48 MAP2-TESTBED ptp4l[1877]: port 1 (enp11s0): MASTER to FAULTY on FAULT_DETECTED (FT_UNSPECIFIED)\n"
            )
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    status = await monitor._parse_journal()

    assert status is not None
    assert status.available is True
    assert status.state == "FAULTY"


@pytest.mark.asyncio
async def test_parse_journal_prefers_latest_transition_when_multiple_states_exist(monkeypatch):
    monitor = ptp_monitor.PTPMonitor()

    async def _fake_create_subprocess_exec(*args, **kwargs):
        return _FakeProcess(
            stdout=(
                "Apr 14 14:03:47 MAP2-TESTBED ptp4l[1877]: port 1 (enp11s0): FAULTY to LISTENING on INIT_COMPLETE\n"
                "Apr 14 14:03:54 MAP2-TESTBED ptp4l[1877]: port 1 (enp11s0): LISTENING to MASTER on ANNOUNCE_RECEIPT_TIMEOUT_EXPIRES\n"
            )
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)

    status = await monitor._parse_journal()

    assert status is not None
    assert status.state == "MASTER"
