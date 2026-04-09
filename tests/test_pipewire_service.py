from __future__ import annotations

import asyncio
from pathlib import Path
from itertools import chain, repeat

import pytest

import app.services.pipewire_service as pipewire_service_module
from app.services.pipewire_service import PipeWireService, _pipewire_env


def test_pipewire_env_uses_current_user_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HOME", raising=False)
    monkeypatch.delenv("XDG_RUNTIME_DIR", raising=False)
    monkeypatch.setattr(pipewire_service_module.os, "getuid", lambda: 4242)
    monkeypatch.setattr(pipewire_service_module.Path, "home", staticmethod(lambda: Path("/tmp/pw-home")))

    env = _pipewire_env()

    assert env["HOME"] == "/tmp/pw-home"
    assert env["XDG_RUNTIME_DIR"] == "/run/user/4242"


@pytest.mark.asyncio
async def test_set_quantum_reports_command_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    monkeypatch.setattr(pipewire_service_module, "HAS_PW_METADATA", True)

    async def _fake_run_cmd_result(cmd, timeout=5.0):
        return "", "permission denied", 1

    monkeypatch.setattr(service, "_run_cmd_result", _fake_run_cmd_result)

    assert await service.set_quantum(128) is False


@pytest.mark.asyncio
async def test_check_daemon_uptime_tracks_observed_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    monkeypatch.setattr(pipewire_service_module, "HAS_WPCTL", True)

    outputs = iter(
        [
            "PipeWire 'pipewire-0' [1.4.9, mm@MAP2, cookie:123]\n",
            "",
            "PipeWire 'pipewire-0' [1.4.9, mm@MAP2, cookie:123]\n",
        ]
    )
    monotonic_values = chain([10.0, 14.5, 20.0, 20.0], repeat(20.0))

    async def _fake_run_cmd(cmd, timeout=5.0):
        return next(outputs)

    monkeypatch.setattr(service, "_run_cmd", _fake_run_cmd)
    monkeypatch.setattr(pipewire_service_module.time, "monotonic", lambda: next(monotonic_values))

    first = await service.check_daemon()
    second = await service.check_daemon()
    third = await service.check_daemon()

    assert first.running is True
    assert first.uptime_seconds == pytest.approx(0.0)
    assert second.running is False
    assert third.running is True
    assert third.uptime_seconds == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_check_daemon_resets_uptime_when_cookie_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    monkeypatch.setattr(pipewire_service_module, "HAS_WPCTL", True)

    outputs = iter(
        [
            "PipeWire 'pipewire-0' [1.4.9, mm@MAP2, cookie:123]\n",
            "PipeWire 'pipewire-0' [1.4.9, mm@MAP2, cookie:999]\n",
        ]
    )
    monotonic_values = chain([10.0, 14.5, 20.0, 20.0], repeat(20.0))

    async def _fake_run_cmd(cmd, timeout=5.0):
        return next(outputs)

    monkeypatch.setattr(service, "_run_cmd", _fake_run_cmd)
    monkeypatch.setattr(pipewire_service_module.time, "monotonic", lambda: next(monotonic_values))

    first = await service.check_daemon()
    second = await service.check_daemon()

    assert first.uptime_seconds == pytest.approx(0.0)
    assert second.running is True
    assert second.cookie == "999"
    assert second.uptime_seconds == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_run_cmd_result_kills_timed_out_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    events: list[str] = []

    class _FakeProcess:
        returncode = None

        async def communicate(self):
            events.append("communicate")
            await asyncio.sleep(0)
            return b"", b""

        def kill(self):
            events.append("kill")

    async def _fake_create_subprocess_exec(*cmd, **kwargs):
        return _FakeProcess()

    async def _fake_wait_for(awaitable, timeout):
        close = getattr(awaitable, "close", None)
        if callable(close):
            close()
        await asyncio.sleep(0)
        raise asyncio.TimeoutError

    monkeypatch.setattr(pipewire_service_module.asyncio, "create_subprocess_exec", _fake_create_subprocess_exec)
    monkeypatch.setattr(pipewire_service_module.asyncio, "wait_for", _fake_wait_for)

    stdout, stderr, returncode = await service._run_cmd_result(["pw-dump"], timeout=0.01)

    assert stdout == ""
    assert "timed out" in stderr
    assert returncode == 124
    assert events == ["kill", "communicate"]


@pytest.mark.asyncio
async def test_get_graph_snapshot_serializes_cache_refresh(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    monkeypatch.setattr(pipewire_service_module, "HAS_PW_DUMP", False)

    entered = asyncio.Event()
    release = asyncio.Event()
    check_calls = 0

    async def _fake_check_daemon():
        nonlocal check_calls
        check_calls += 1
        entered.set()
        await release.wait()
        return pipewire_service_module.PipeWireDaemonInfo(running=True, cookie="123")

    async def _fake_get_settings():
        return pipewire_service_module.PipeWireSettings()

    async def _fake_get_nodes(dump=None):
        return []

    async def _fake_get_devices():
        return []

    async def _fake_get_streams(dump=None):
        return []

    async def _fake_get_links_from_dump(dump=None):
        return []

    async def _fake_get_clients():
        return []

    async def _fake_get_xruns_from_dump(dump=None):
        return 0

    monkeypatch.setattr(service, "check_daemon", _fake_check_daemon)
    monkeypatch.setattr(service, "get_settings", _fake_get_settings)
    monkeypatch.setattr(service, "get_nodes", _fake_get_nodes)
    monkeypatch.setattr(service, "get_devices", _fake_get_devices)
    monkeypatch.setattr(service, "get_streams", _fake_get_streams)
    monkeypatch.setattr(service, "_get_links_from_dump", _fake_get_links_from_dump)
    monkeypatch.setattr(service, "get_clients", _fake_get_clients)
    monkeypatch.setattr(service, "_get_xruns_from_dump", _fake_get_xruns_from_dump)

    first_task = asyncio.create_task(service.get_graph_snapshot())
    await entered.wait()
    second_task = asyncio.create_task(service.get_graph_snapshot())
    await asyncio.sleep(0)
    release.set()

    first, second = await asyncio.gather(first_task, second_task)

    assert check_calls == 1
    assert first is second


@pytest.mark.asyncio
async def test_get_streams_uses_precomputed_link_and_client_maps(monkeypatch: pytest.MonkeyPatch) -> None:
    service = PipeWireService()
    monkeypatch.setattr(pipewire_service_module, "HAS_PW_DUMP", True)

    async def _fake_parse_wpctl_status():
        return {"streams": [], "sinks": [], "sources": [], "devices": []}

    dump = [
        {
            "type": "PipeWire:Interface:Link",
            "info": {"state": "active", "props": {"link.output.node": 300, "link.input.node": 400}},
        },
        {
            "type": "PipeWire:Interface:Client",
            "id": 91,
            "info": {"props": {"application.process.id": 4567}},
        },
        {
            "type": "PipeWire:Interface:Node",
            "id": 300,
            "info": {
                "state": "running",
                "props": {
                    "node.name": "JUCEJack",
                    "node.nick": "JUCEJack",
                    "client.id": 91,
                    "audio.channels": 2,
                    "audio.rate": 48000,
                },
            },
        },
    ]

    monkeypatch.setattr(service, "_parse_wpctl_status", _fake_parse_wpctl_status)

    streams = await service.get_streams(dump=dump)

    assert len(streams) == 1
    assert streams[0].id == 300
    assert streams[0].client_pid == 4567
    assert streams[0].direction == "output"
    assert streams[0].sample_rate == 48000
