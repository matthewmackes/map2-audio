import asyncio
import time

import pytest

from app.services.tesira.tesira_fleet import TesiraFleet


async def _slow_cancel_task():
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        await asyncio.sleep(0.2)
        raise


class _SlowDisconnectDevice:
    def __init__(self, device_id: str) -> None:
        self.device_id = device_id

    async def disconnect(self) -> None:
        await asyncio.sleep(0.2)


def test_tesira_fleet_stop_bounds_background_task_shutdown():
    async def _scenario() -> None:
        fleet = TesiraFleet()
        fleet.TASK_CANCEL_TIMEOUT_SECONDS = 0.05
        fleet._offline_retry_task = asyncio.create_task(
            _slow_cancel_task(),
            name="tesira_test_retry",
        )

        started = time.monotonic()
        await fleet.stop()
        elapsed = time.monotonic() - started

        assert elapsed < 0.15
        with pytest.raises(asyncio.CancelledError):
            await fleet._offline_retry_task

    asyncio.run(_scenario())


def test_tesira_fleet_stop_bounds_device_disconnect():
    async def _scenario() -> None:
        fleet = TesiraFleet()
        fleet.DEVICE_DISCONNECT_TIMEOUT_SECONDS = 0.05
        fleet._devices = {
            "tesira_test": _SlowDisconnectDevice("tesira_test"),
        }

        started = time.monotonic()
        await fleet.stop()
        elapsed = time.monotonic() - started

        assert elapsed < 0.15
        assert fleet._devices == {}

    asyncio.run(_scenario())
