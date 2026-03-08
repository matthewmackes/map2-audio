"""
TesiraFleet integration tests.

Uses mocked TesiraDevice instances — no real hardware or DB needed.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.services.tesira.tesira_fleet import TesiraFleet, TesiraDeviceConfig


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_mock_device(host: str, serial: str = "SN001", connected: bool = True):
    device = MagicMock()
    device.device_id = f"tesira_{serial}"
    device.host = host
    device.port = 23
    device.name = f"Forte-{serial}"
    device.connected = connected
    device.info = MagicMock(serial_number=serial, firmware_version="3.9.0.1")
    device.connect = AsyncMock()
    device.disconnect = AsyncMock()
    device.get_avb_streams = AsyncMock(return_value=[])
    device.get_ptp_status = AsyncMock(return_value={"state": "SLAVE"})
    device.start_metering = AsyncMock()
    device.on_push = MagicMock()
    return device


# ── Test 1: fleet registers all configured devices ────────────────────────────

@pytest.mark.asyncio
async def test_fleet_connects_all_configured_devices():
    """TesiraFleet.start() connects each enabled configured device."""
    fleet = TesiraFleet()
    fleet._configs = [
        TesiraDeviceConfig(host='192.168.1.10', name='Unit1'),
        TesiraDeviceConfig(host='192.168.1.11', name='Unit2'),
    ]

    dev1 = make_mock_device('192.168.1.10', 'SN001')
    dev2 = make_mock_device('192.168.1.11', 'SN002')

    async def fake_connect(cfg):
        from app.services.tesira.tesira_device import TesiraDevice
        dev = dev1 if cfg.host == '192.168.1.10' else dev2
        fleet._devices[dev.device_id] = dev

    fleet._connect_device = fake_connect  # type: ignore
    fleet._load_config = MagicMock()  # keep test-local configs
    fleet._ptp_poll_loop = AsyncMock()  # suppress background task
    fleet._offline_retry_loop = AsyncMock()
    fleet._preset_poll_loop = AsyncMock()

    # Patch create_task to avoid real asyncio task
    with patch('asyncio.create_task') as mock_task:
        mock_task.return_value = MagicMock(done=lambda: True)
        await fleet.start()

    assert 'tesira_SN001' in fleet._devices
    assert 'tesira_SN002' in fleet._devices


# ── Test 2: list_devices returns summary including offline ────────────────────

def test_list_devices_includes_offline():
    """list_devices() returns all configured devices, including disconnected ones."""
    fleet = TesiraFleet()
    fleet._configs = [
        TesiraDeviceConfig(host='192.168.1.20'),
    ]
    # No devices connected yet
    fleet._devices = {}

    result = fleet.list_devices()
    assert len(result) == 1
    assert result[0]['connected'] is False
    assert result[0]['host'] == '192.168.1.20'


# ── Test 3: preset interlock is registered via lifecycle ──────────────────────

def test_preset_interlock_listener_registration():
    """TesiraPresetInterlock.on_preset_loaded_event is callable."""
    from app.services.tesira.preset_interlock import TesiraPresetInterlock

    fleet_mock = MagicMock()
    interlock = TesiraPresetInterlock(fleet_mock)

    # Verify it's an async callable (coroutine function)
    import inspect
    assert inspect.iscoroutinefunction(interlock.on_preset_loaded_event)


# ── Test 4: PTP coordinator applies slave mode only when needed ───────────────

@pytest.mark.asyncio
async def test_ptp_coordinator_does_not_apply_slave_when_no_master():
    """PTPCoordinator skips slave-mode when no Tesira unit reports MASTER."""
    from app.services.tesira.ptp_coordinator import TesiraPTPCoordinator

    fleet = MagicMock()
    device = MagicMock()
    device.connected = True
    device.get_ptp_status = AsyncMock(return_value={'state': 'SLAVE'})
    fleet._devices = {'tesira_SN001': device}

    coord = TesiraPTPCoordinator(fleet)
    coord._ptp_enabled = True

    await coord._check_and_coordinate()

    # Slave mode should NOT be active since Tesira is SLAVE, not MASTER
    assert coord._slave_mode_active is False
