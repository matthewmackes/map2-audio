"""Tests for T2419-B — FastAPI WebSocket route for the Web SSH console.

Drives a minimal FastAPI app wired with `ssh_bridge.router` and the same
in-process fake asyncssh transport used in `test_ssh_bridge_service.py`.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import ssh_bridge as ssh_bridge_routes
from app.services import ssh_bridge_service as svc


# ------------------------------------------------------------------ fakes


class _FakeWriter:
    def __init__(self) -> None:
        self.buffer = bytearray()
        self.closed = False

    def write(self, data: bytes) -> None:
        self.buffer.extend(data)

    async def drain(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True


class _FakeReader:
    def __init__(self) -> None:
        self._queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()

    async def push(self, chunk: bytes) -> None:
        await self._queue.put(chunk)

    async def close(self) -> None:
        await self._queue.put(None)

    async def read(self, size: int) -> bytes:
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

    async def create_process(self, **kwargs: Any) -> _FakeProcess:
        return self.proc

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


class _FakeAsyncSSH:
    def __init__(self) -> None:
        self.connect_exception: Optional[Exception] = None
        self.connection: Optional[_FakeConnection] = None

    async def connect(self, host: str, **kwargs: Any) -> _FakeConnection:
        if self.connect_exception is not None:
            raise self.connect_exception
        self.connection = _FakeConnection()
        return self.connection

    def import_private_key(self, text: str) -> str:
        return f"key::{text[:10]}"


# ------------------------------------------------------------------ fixtures


@pytest.fixture
def fake_ssh(monkeypatch):
    fake = _FakeAsyncSSH()
    monkeypatch.setattr(svc, "asyncssh", fake)
    svc.reset_ssh_bridge_service_for_tests()
    yield fake
    svc.reset_ssh_bridge_service_for_tests()


@pytest.fixture
def client(fake_ssh):
    app = FastAPI()
    app.include_router(ssh_bridge_routes.router)
    with TestClient(app) as c:
        yield c


# ------------------------------------------------------------------ helpers


def _open_frame(**overrides: Any) -> str:
    base = dict(
        type="open",
        host="10.0.0.50",
        port=22,
        username="mm",
        auth="publickey",
        known_hosts="accept-new",
        keepalive_s=5.0,
        connect_timeout_s=1.0,
        term_cols=80,
        term_rows=24,
        idle_timeout_s=60.0,
    )
    base.update(overrides)
    return json.dumps(base)


# ------------------------------------------------------------------ tests


def test_ws_open_and_stream_happy_path(client, fake_ssh):
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text(_open_frame())
        msg = ws.receive_json()
        assert msg["type"] == "open_ok"
        assert "session_id" in msg

        # Push a chunk from the "remote" and verify we receive it as bytes
        assert fake_ssh.connection is not None
        asyncio.run(fake_ssh.connection.proc.stdout.push(b"ls output\r\n"))
        data = ws.receive_bytes()
        assert data == b"ls output\r\n"

        # Send a keystroke data frame (JSON) and verify it lands on stdin
        ws.send_text(json.dumps({"type": "data", "data": "echo hi\n"}))
        # Give the route a beat to forward
        for _ in range(20):
            if fake_ssh.connection.proc.stdin.buffer:
                break
            import time as _t
            _t.sleep(0.01)
        assert bytes(fake_ssh.connection.proc.stdin.buffer) == b"echo hi\n"

        # Resize
        ws.send_text(json.dumps({"type": "resize", "cols": 120, "rows": 40}))
        for _ in range(20):
            if fake_ssh.connection.proc.resized_to is not None:
                break
            import time as _t
            _t.sleep(0.01)
        assert fake_ssh.connection.proc.resized_to == (120, 40)

        # Client-initiated close
        ws.send_text(json.dumps({"type": "close"}))


def test_ws_raw_binary_frame_is_treated_as_keystrokes(client, fake_ssh):
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text(_open_frame())
        ws.receive_json()  # open_ok

        ws.send_bytes(b"\x03")  # Ctrl-C
        for _ in range(20):
            if fake_ssh.connection is not None and fake_ssh.connection.proc.stdin.buffer:
                break
            import time as _t
            _t.sleep(0.01)
        assert bytes(fake_ssh.connection.proc.stdin.buffer) == b"\x03"


def test_ws_rejects_non_open_first_frame(client):
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text(json.dumps({"type": "data", "data": "oops"}))
        msg = ws.receive_json()
        assert msg["type"] == "open_error"
        assert msg["error"]["code"] == "invalid_open_frame"


def test_ws_rejects_malformed_open_json(client):
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text("this is not json")
        msg = ws.receive_json()
        assert msg["type"] == "open_error"
        assert msg["error"]["code"] == "invalid_open_frame"


def test_ws_surfaces_auth_failure_on_open(client, fake_ssh):
    class PermissionDenied(Exception):
        pass

    fake_ssh.connect_exception = PermissionDenied("bad creds")
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text(_open_frame())
        msg = ws.receive_json()
        assert msg["type"] == "open_error"
        assert msg["error"]["code"] == "auth_failed"


def test_ws_open_frame_missing_host(client):
    with client.websocket_connect("/ws/ssh") as ws:
        ws.send_text(json.dumps({"type": "open"}))  # missing host
        msg = ws.receive_json()
        assert msg["type"] == "open_error"
        assert msg["error"]["code"] == "invalid_open_frame"
