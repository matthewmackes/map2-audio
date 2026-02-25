"""
TTPClient unit tests.

These tests use asyncio and mock TCP connections — no real Tesira hardware required.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.tesira.ttp_client import TTPClient, TTPResponse


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_reader_writer(lines: list[str]):
    """Return (reader, writer) mocks that feed `lines` as ASCII responses."""
    reader = AsyncMock()
    # readline() returns lines in sequence; raise StopAsyncIteration after last
    reader.readline = AsyncMock(side_effect=[
        (line.encode() + b"\r\n") for line in lines
    ] + [asyncio.CancelledError()])

    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()
    writer.close = MagicMock()
    writer.wait_closed = AsyncMock()
    writer.is_closing = MagicMock(return_value=False)
    return reader, writer


# ── Test 1: basic GET parses +OK value ───────────────────────────────────────

@pytest.mark.asyncio
async def test_send_get_parses_ok_value():
    """send() returns TTPResponse.ok=True and parses value from +OK response."""
    reader, writer = make_reader_writer([
        '+OK value=1.234',
    ])

    client = TTPClient(host='192.168.1.10')

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        resp = await client.send('LevelControl1', 'get', 'level', 0)

    assert resp.ok is True
    assert abs(float(resp.value) - 1.234) < 1e-5


# ── Test 2: -ERR response ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_error_response():
    """-ERR response sets ok=False and captures the error code."""
    reader, writer = make_reader_writer([
        '-ERR INSTANCE_TAG_NOT_FOUND',
    ])

    client = TTPClient(host='192.168.1.10')

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        resp = await client.send('BadTag', 'get', 'level', 0)

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
        '! LevelControl1 level 0.75',
    ])

    client = TTPClient(host='192.168.1.10')
    client.on_push(on_push)

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        # Let read loop process the push line
        await asyncio.sleep(0.05)

    assert len(push_events) == 1
    assert push_events[0][0] == 'LevelControl1'
    assert push_events[0][1] == 'level'


# ── Test 4: timeout handling ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_timeout():
    """send() raises asyncio.TimeoutError if no response within read_timeout."""
    reader = AsyncMock()
    reader.readline = AsyncMock(side_effect=asyncio.TimeoutError())

    writer = MagicMock()
    writer.write = MagicMock()
    writer.drain = AsyncMock()
    writer.close = MagicMock()
    writer.wait_closed = AsyncMock()
    writer.is_closing = MagicMock(return_value=False)

    client = TTPClient(host='192.168.1.10', read_timeout=0.1)

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        await client.connect()
        with pytest.raises((asyncio.TimeoutError, Exception)):
            await client.send('LevelControl1', 'get', 'level', 0)
