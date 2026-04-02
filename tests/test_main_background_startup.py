import asyncio

import pytest

from app import main as app_main


@pytest.mark.asyncio
async def test_defer_optional_service_start_runs_without_blocking():
    gate = asyncio.Event()
    order: list[str] = []

    async def _start() -> None:
        order.append("entered")
        await gate.wait()
        order.append("completed")

    task = app_main.defer_optional_service_start(
        app_main.logger,
        "AVB router discovery",
        _start,
    )

    await asyncio.sleep(0)
    assert order == ["entered"]
    assert task.done() is False

    gate.set()
    await task

    assert order == ["entered", "completed"]


@pytest.mark.asyncio
async def test_cancel_background_startup_tasks_cancels_pending_work():
    gate = asyncio.Event()

    async def _start() -> None:
        await gate.wait()

    task = app_main.defer_optional_service_start(
        app_main.logger,
        "Tesira Fleet",
        _start,
    )

    await asyncio.sleep(0)
    await app_main.cancel_background_startup_tasks([task])

    assert task.cancelled() is True
