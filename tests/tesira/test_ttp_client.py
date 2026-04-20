"""
TTPClient unit tests.

These tests use asyncio and mock TCP connections — no real Tesira hardware required.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.tesira.telnet_protocol import _DO, _DONT, _IAC_BYTE, _SB, _SE, _WILL, _WONT
from app.services.tesira.ttp_client import TTPClient, TTPResponse


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_reader_writer(chunks: list[bytes]):
    """Return (reader, writer) mocks that feed byte chunks to StreamReader.read()."""
    reader = AsyncMock()

    queue = list(chunks)

    async def _read(_size: int = -1) -> bytes:
        if queue:
            return queue.pop(0)
        await asyncio.sleep(10.0)
        return b""

    reader.read = AsyncMock(side_effect=_read)

    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()
    writer.close = MagicMock()
    writer.wait_closed = AsyncMock()
    writer.is_closing = MagicMock(return_value=False)
    return reader, writer


@pytest.mark.asyncio
async def test_telnet_negotiation_replies_and_returns_plain_ttp_payload():
    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()

    client = TTPClient(host="192.168.1.10")
    client._writer = writer

    plain = await client._extract_plain_text(
        bytes(
            [
                _IAC_BYTE,
                _DO,
                1,
                _IAC_BYTE,
                _WILL,
                3,
                ord("+"),
                ord("O"),
                ord("K"),
                ord("\r"),
                ord("\n"),
            ]
        )
    )

    assert plain == b"+OK\r\n"
    writer.write.assert_called_once_with(bytes([_IAC_BYTE, _WONT, 1, _IAC_BYTE, _DONT, 3]))
    writer.drain.assert_awaited_once()


@pytest.mark.asyncio
async def test_telnet_subnegotiation_is_removed_from_plain_payload():
    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()

    client = TTPClient(host="192.168.1.10")
    client._writer = writer

    plain = await client._extract_plain_text(
        bytes([ord("a"), _IAC_BYTE, _SB, 24, 1, _IAC_BYTE, _SE, ord("b")])
    )

    assert plain == b"ab"
    writer.write.assert_not_called()
    writer.drain.assert_not_awaited()


# ── Test 1: basic GET parses +OK value ───────────────────────────────────────

@pytest.mark.asyncio
async def test_send_get_parses_ok_value():
    """send() returns TTPResponse.ok=True and parses value from +OK response."""
    reader, writer = make_reader_writer([
        b'+OK value=1.234\r\n',
    ])

    client = TTPClient(host='192.168.1.10')

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        resp = await client.send('LevelControl1', 'get', 'level', 0)
        await client.disconnect()

    assert resp.ok is True
    assert abs(float(resp.value) - 1.234) < 1e-5


# ── Test 2: -ERR response ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_error_response():
    """-ERR response sets ok=False and captures the error code."""
    reader, writer = make_reader_writer([
        b'-ERR INSTANCE_TAG_NOT_FOUND\r\n',
    ])

    client = TTPClient(host='192.168.1.10')

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        resp = await client.send('BadTag', 'get', 'level', 0)
        await client.disconnect()

    assert resp.ok is False
    assert 'INSTANCE_TAG_NOT_FOUND' in (resp.error_code or resp.raw)


# ── Test 3: push notification dispatch ───────────────────────────────────────

@pytest.mark.asyncio
async def test_push_notification_dispatched():
    """Push lines (! tag attr value) are dispatched to registered callbacks."""
    push_events: list[tuple] = []

    def on_push(instance_tag: str, attribute: str, value):
        push_events.append((instance_tag, attribute, value))

    reader, writer = make_reader_writer([
        b'! LevelControl1 level 0.75\r\n',
    ])

    client = TTPClient(host='192.168.1.10')
    client.on_push(on_push)

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        # Let read loop process the push line
        await asyncio.sleep(0.05)
        await client.disconnect()

    assert len(push_events) == 1
    assert push_events[0][0] == 'LevelControl1'
    assert push_events[0][1] == 'level'


# ── Test 4: timeout handling ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_timeout():
    """send() returns a timeout response when no line arrives within read_timeout."""
    reader = AsyncMock()

    async def _read(_size: int = -1) -> bytes:
        await asyncio.sleep(1.0)
        return b""

    reader.read = AsyncMock(side_effect=_read)

    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()
    writer.close = MagicMock()
    writer.wait_closed = AsyncMock()
    writer.is_closing = MagicMock(return_value=False)

    client = TTPClient(host='192.168.1.10', read_timeout=0.1)

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        response = await client.send('LevelControl1', 'get', 'level', 0)
        await client.disconnect()

    assert response.ok is False
    assert response.error_code == 'TIMEOUT'


@pytest.mark.asyncio
async def test_do_connect_clears_stale_response_queue_before_reconnect():
    reader, writer = make_reader_writer([])
    client = TTPClient(host="192.168.1.10")
    client._response_queue.put_nowait("+OK stale=true")

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client._do_connect()
        await client.disconnect()

    assert client._response_queue.empty()


def test_reconnect_task_is_singleton_until_done():
    client = TTPClient(host="192.168.1.10")
    original_create_task = asyncio.create_task

    async def _pending():
        await asyncio.Event().wait()

    created = []

    def _fake_create_task(coro, name=None):
        task = original_create_task(_pending(), name=name)
        created.append(task)
        coro.close()
        return task

    async def _run():
        with patch('app.services.tesira.ttp_client.asyncio.create_task', side_effect=_fake_create_task):
            client._ensure_reconnect_task()
            client._ensure_reconnect_task()
            await asyncio.sleep(0)
            assert len(created) == 1
            created[0].cancel()
            try:
                await created[0]
            except asyncio.CancelledError:
                pass

    asyncio.run(_run())
