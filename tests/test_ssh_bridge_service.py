"""Tests for T2419-A — asyncssh-based Web SSH bridge service.

The service is driven against an in-process fake asyncssh transport so the
tests do not require a real sshd; this is the same shape the WebSocket
route (T2419-B) will consume.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import pytest

from app.services import ssh_bridge_service as svc


# ------------------------------------------------------------------ fakes


class _FakeWriter:
    def __init__(self) -> None:
        self.buffer: bytearray = bytearray()
        self.drained = False
        self.raise_on_write: Optional[Exception] = None
        self.closed = False

    def write(self, data: bytes) -> None:
        if self.raise_on_write is not None:
            raise self.raise_on_write
        self.buffer.extend(data)

    async def drain(self) -> None:
        self.drained = True

    def close(self) -> None:
        self.closed = True


class _FakeReader:
    """Async reader the service pumps from.

    Call `push(chunk)` to hand bytes to the pump, and `close()` to make the
    next `.read()` return an empty string (remote EOF).
    """

    def __init__(self) -> None:
        self._queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
        self.raise_on_read: Optional[Exception] = None

    async def push(self, chunk: bytes) -> None:
        await self._queue.put(chunk)

    async def close(self) -> None:
        await self._queue.put(None)

    async def read(self, size: int) -> bytes:
        if self.raise_on_read is not None:
            raise self.raise_on_read
        item = await self._queue.get()
        if item is None:
            return b""
        return bytes(item[:size]) if size > 0 else bytes(item)


class _FakeProcess:
    def __init__(self) -> None:
        self.stdin = _FakeWriter()
        self.stdout = _FakeReader()
        self.resized_to: Optional[tuple] = None
        self.terminated = False

    def change_terminal_size(self, cols: int, rows: int) -> None:
        self.resized_to = (cols, rows)

    def terminate(self) -> None:
        self.terminated = True


class _FakeConnection:
    def __init__(self) -> None:
        self.proc = _FakeProcess()
        self.closed = False
        self.process_kwargs: Dict[str, Any] = {}

    async def create_process(self, **kwargs: Any) -> _FakeProcess:
        self.process_kwargs = kwargs
        return self.proc

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


class _FakeAsyncSSH:
    """Minimal stand-in for the parts of asyncssh our service uses."""

    def __init__(self) -> None:
        self.last_connect_kwargs: Dict[str, Any] = {}
        self.connect_exception: Optional[Exception] = None
        self.connect_delay: float = 0.0
        self.connection: Optional[_FakeConnection] = None

    async def connect(self, host: str, **kwargs: Any) -> _FakeConnection:
        self.last_connect_kwargs = {"host": host, **kwargs}
        if self.connect_delay:
            await asyncio.sleep(self.connect_delay)
        if self.connect_exception is not None:
            raise self.connect_exception
        self.connection = _FakeConnection()
        return self.connection

    def import_private_key(self, text: str) -> str:
        if "BROKEN" in text:
            raise ValueError("bad key")
        return f"key::{text[:10]}"


# ------------------------------------------------------------------ helpers


class _Collector:
    def __init__(self) -> None:
        self.data: bytearray = bytearray()
        self.errors: List[Dict[str, Any]] = []
        self.closed_reason: Optional[str] = None

    async def on_data(self, chunk: bytes) -> None:
        self.data.extend(chunk)

    async def on_error(self, envelope: Dict[str, Any]) -> None:
        self.errors.append(envelope)

    async def on_closed(self, reason: str) -> None:
        self.closed_reason = reason


def _install_fake(monkeypatch) -> _FakeAsyncSSH:
    fake = _FakeAsyncSSH()
    monkeypatch.setattr(svc, "asyncssh", fake)
    svc.reset_ssh_bridge_service_for_tests()
    return fake


def _req(**overrides: Any) -> svc.SshOpenRequest:
    base = dict(
        host="10.0.0.50",
        port=22,
        username="mm",
        auth="publickey",
        known_hosts="accept-new",
        keepalive_s=10.0,
        connect_timeout_s=1.0,
        term_cols=80,
        term_rows=24,
        idle_timeout_s=3600.0,
    )
    base.update(overrides)
    return svc.SshOpenRequest(**base)


# ------------------------------------------------------------------ tests


@pytest.mark.asyncio
async def test_open_session_wires_pty_and_streams_stdout(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)
    collector = _Collector()

    service = svc.SshBridgeService()
    session = await service.open_session(
        _req(),
        on_data=collector.on_data,
        on_closed=collector.on_closed,
        on_error=collector.on_error,
        known_hosts_path=tmp_path / "known_hosts",
    )

    assert session.is_open
    assert fake.last_connect_kwargs["host"] == "10.0.0.50"
    assert fake.last_connect_kwargs["port"] == 22
    assert fake.last_connect_kwargs["username"] == "mm"
    assert fake.last_connect_kwargs["preferred_auth"] == ["publickey"]
    assert fake.connection is not None
    assert fake.connection.process_kwargs["term_type"] == svc.DEFAULT_TERM_TYPE

    await fake.connection.proc.stdout.push(b"hello\r\n")
    for _ in range(20):
        await asyncio.sleep(0.01)
        if collector.data:
            break
    assert bytes(collector.data) == b"hello\r\n"
    assert session.stats().bytes_rx == len(b"hello\r\n")

    await session.close()
    assert collector.closed_reason == "client_close"
    assert session.stats().connected is False


@pytest.mark.asyncio
async def test_send_writes_to_stdin_and_counts_tx(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()
    session = await service.open_session(
        _req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh"
    )

    await session.send(b"ls -la\r")
    assert fake.connection is not None
    assert bytes(fake.connection.proc.stdin.buffer) == b"ls -la\r"
    assert fake.connection.proc.stdin.drained is True
    assert session.stats().bytes_tx == len(b"ls -la\r")

    await session.close()


@pytest.mark.asyncio
async def test_resize_calls_change_terminal_size(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()
    session = await service.open_session(
        _req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh"
    )

    await session.resize(120, 40)
    assert fake.connection is not None
    assert fake.connection.proc.resized_to == (120, 40)

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await session.resize(0, 40)
    assert exc_info.value.code == "invalid_resize"

    with pytest.raises(svc.SshBridgeError):
        await session.resize(10000, 40)

    await session.close()


@pytest.mark.asyncio
async def test_connect_timeout_surfaces_envelope(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)
    fake.connect_delay = 2.0
    collector = _Collector()
    service = svc.SshBridgeService()

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(
            _req(connect_timeout_s=0.05),
            on_data=collector.on_data,
            known_hosts_path=tmp_path / "kh",
        )
    assert exc_info.value.code == "connect_timeout"
    assert exc_info.value.as_envelope()["error"]["code"] == "connect_timeout"
    assert service.list_stats() == []


@pytest.mark.asyncio
async def test_auth_failure_classified(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)

    class PermissionDenied(Exception):
        pass

    fake.connect_exception = PermissionDenied("bad creds")
    service = svc.SshBridgeService()
    collector = _Collector()

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(
            _req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh"
        )
    assert exc_info.value.code == "auth_failed"


@pytest.mark.asyncio
async def test_password_auth_requires_password(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(
            _req(auth="password"),
            on_data=collector.on_data,
            known_hosts_path=tmp_path / "kh",
        )
    assert exc_info.value.code == "missing_password"


@pytest.mark.asyncio
async def test_invalid_private_key_raises(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(
            _req(private_key="BROKEN-KEY-BLOB"),
            on_data=collector.on_data,
            known_hosts_path=tmp_path / "kh",
        )
    assert exc_info.value.code == "invalid_private_key"


@pytest.mark.asyncio
async def test_strict_known_hosts_requires_file(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()

    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(
            _req(known_hosts="strict"),
            on_data=collector.on_data,
            known_hosts_path=tmp_path / "nope",
        )
    assert exc_info.value.code == "strict_known_hosts_missing"


@pytest.mark.asyncio
async def test_remote_eof_closes_session(monkeypatch, tmp_path):
    fake = _install_fake(monkeypatch)
    collector = _Collector()
    service = svc.SshBridgeService()
    session = await service.open_session(
        _req(), on_data=collector.on_data, on_closed=collector.on_closed, known_hosts_path=tmp_path / "kh"
    )

    assert fake.connection is not None
    await fake.connection.proc.stdout.close()
    for _ in range(50):
        await asyncio.sleep(0.01)
        if collector.closed_reason is not None:
            break
    assert collector.closed_reason == "remote_eof"
    assert session.stats().connected is False


@pytest.mark.asyncio
async def test_session_cap_enforced(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    service = svc.SshBridgeService(max_sessions=2)
    collector = _Collector()

    s1 = await service.open_session(_req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh")
    s2 = await service.open_session(_req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh")
    with pytest.raises(svc.SshBridgeError) as exc_info:
        await service.open_session(_req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh")
    assert exc_info.value.code == "session_cap_reached"

    await s1.close()
    await s2.close()


@pytest.mark.asyncio
async def test_close_all_closes_every_session(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    service = svc.SshBridgeService()
    collector = _Collector()

    for _ in range(3):
        await service.open_session(_req(), on_data=collector.on_data, known_hosts_path=tmp_path / "kh")

    assert len(service.list_stats()) == 3
    await service.close_all("service_shutdown")
    assert service.list_stats() == []


@pytest.mark.asyncio
async def test_send_before_open_raises(monkeypatch):
    _install_fake(monkeypatch)
    collector = _Collector()
    session = svc.SshBridgeSession(on_data=collector.on_data)
    with pytest.raises(svc.SshBridgeError) as exc_info:
        await session.send(b"hello")
    assert exc_info.value.code == "session_not_open"


@pytest.mark.asyncio
async def test_open_twice_raises(monkeypatch, tmp_path):
    _install_fake(monkeypatch)
    collector = _Collector()
    session = svc.SshBridgeSession(on_data=collector.on_data, known_hosts_path=tmp_path / "kh")
    await session.open(_req())
    with pytest.raises(svc.SshBridgeError) as exc_info:
        await session.open(_req())
    assert exc_info.value.code == "session_already_open"
    await session.close()


def test_asyncssh_missing_raises_open_error(monkeypatch):
    monkeypatch.setattr(svc, "asyncssh", None)
    svc.reset_ssh_bridge_service_for_tests()
    collector = _Collector()
    session = svc.SshBridgeSession(on_data=collector.on_data)

    async def _run() -> None:
        with pytest.raises(svc.SshBridgeError) as exc_info:
            await session.open(_req())
        assert exc_info.value.code == "asyncssh_missing"

    asyncio.run(_run())


def test_singleton_get_ssh_bridge_service_respects_env(monkeypatch):
    svc.reset_ssh_bridge_service_for_tests()
    monkeypatch.setenv("MAP2_SSH_BRIDGE_MAX_SESSIONS", "4")
    service = svc.get_ssh_bridge_service()
    assert service.max_sessions == 4
    svc.reset_ssh_bridge_service_for_tests()
