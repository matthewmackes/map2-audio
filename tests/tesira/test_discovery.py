"""
TesiraDiscoveryService unit tests.

Uses mocked zeroconf, mocked TCP connections, and mocked config — no real
Tesira hardware or zeroconf daemon required.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.tesira.discovery import (
    TesiraDiscoveryService,
    DiscoveredTesiraDevice,
    _parse_ttp_value,
)


# ── Helper ────────────────────────────────────────────────────────────────────

def make_ttp_reader(responses: list[str]):
    """Return an asyncio reader mock that replays TTP response lines."""
    reader = AsyncMock()
    reader.readline = AsyncMock(side_effect=[
        (line.encode() + b'\r\n') for line in responses
    ])
    return reader


def make_writer():
    w = MagicMock()
    w.write = MagicMock()
    w.drain = AsyncMock()
    w.close = MagicMock()
    w.wait_closed = AsyncMock()
    return w


# ── Test 1: _parse_ttp_value parses correctly ─────────────────────────────────

def test_parse_ttp_value_quoted():
    assert _parse_ttp_value('+OK value="TesiraFORTE CI"') == "TesiraFORTE CI"


def test_parse_ttp_value_unquoted():
    assert _parse_ttp_value('+OK value=3.9.0.1') == "3.9.0.1"


def test_parse_ttp_value_error_line():
    assert _parse_ttp_value('-ERR INSTANCE_TAG_NOT_FOUND') is None


# ── Test 2: _probe_host returns populated device from TTP ─────────────────────

@pytest.mark.asyncio
async def test_probe_host_returns_populated_device():
    """_probe_host() connects via TCP, sends identity commands, returns device."""
    # 6 attributes queried: hostname, serialNumber, version, model, partNumber, macAddress
    responses = [
        '+OK value="tesira-forte-1"',      # hostname
        '+OK value="SN001"',               # serialNumber
        '+OK value="3.9.0.1"',             # version
        '+OK value="TesiraFORTE CI"',      # model
        '+OK value="910-00094-01"',        # partNumber
        '+OK value="00:11:22:33:44:55"',   # macAddress
    ]
    reader = make_ttp_reader(responses)
    writer = make_writer()

    svc = TesiraDiscoveryService()

    with patch('asyncio.open_connection', return_value=(reader, writer)):
        result = await svc._probe_host('192.168.1.41', timeout=3.0)

    assert result is not None
    assert result.host == '192.168.1.41'
    assert result.hostname == 'tesira-forte-1'
    assert result.serial_number == 'SN001'
    assert result.firmware_version == '3.9.0.1'
    assert result.model == 'TesiraFORTE CI'
    assert result.part_number == '910-00094-01'
    assert result.mac_address == '00:11:22:33:44:55'


# ── Test 3: _probe_host returns None when host unreachable ────────────────────

@pytest.mark.asyncio
async def test_probe_host_returns_none_on_connection_error():
    """_probe_host() returns None when TCP connection fails (offline unit)."""
    svc = TesiraDiscoveryService()

    with patch('asyncio.open_connection', side_effect=OSError("Connection refused")):
        result = await svc._probe_host('192.168.99.99', timeout=0.5)

    assert result is None


# ── Test 4: adopt_device persists config and calls fleet.reload ───────────────

@pytest.mark.asyncio
async def test_adopt_device_persists_config_and_connects():
    """adopt_device() writes to config and hot-reloads into the fleet."""
    dev = DiscoveredTesiraDevice(
        host='192.168.1.41',
        port=23,
        mdns_name='Tesira-1._tesira._tcp.local.',
        hostname='tesira-forte-1',
        serial_number='SN001',
        firmware_version='3.9.0.1',
        model='TesiraFORTE CI',
        part_number='910-00094-01',
        mac_address='00:11:22:33:44:55',
        already_configured=False,
    )

    svc = TesiraDiscoveryService()
    svc._scan_result = [dev]

    captured_config: list = []

    def fake_config_set(key, value):
        if key == 'tesira.devices':
            captured_config.append(value)

    fleet_mock = MagicMock()
    fleet_mock._devices = {}
    fleet_mock._configs = []
    fleet_mock._connect_device = AsyncMock()

    with patch('app.config.config_get', return_value=[]), \
         patch('app.config.config_set', side_effect=fake_config_set), \
         patch('app.services.tesira.get_tesira_fleet', return_value=fleet_mock), \
         patch.object(svc, '_broadcast', new_callable=AsyncMock):
        result = await svc.adopt_device(host='192.168.1.41', name='Unit 1')

    assert result['ok'] is True
    assert 'device_id' in result
    assert len(captured_config) == 1
    assert captured_config[0][0]['host'] == '192.168.1.41'
    assert captured_config[0][0]['name'] == 'Unit 1'
    fleet_mock._connect_device.assert_called_once()


# ── Test 5: get_status reflects is_scanning state ────────────────────────────

def test_get_status_initial_state():
    svc = TesiraDiscoveryService()
    status = svc.get_status()
    assert status['is_scanning'] is False
    assert status['devices'] == []
    assert status['error'] is None
