import asyncio
import logging
import os
import signal

import pytest

from app import main as app_main


@pytest.mark.asyncio
async def test_safe_stop_service_times_out_and_cancels(caplog):
    cancelled = asyncio.Event()

    async def _slow_stop() -> None:
        try:
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    caplog.set_level(logging.WARNING)
    await app_main.safe_stop_service(
        logging.getLogger("test.main.shutdown"),
        "Slow Service",
        _slow_stop,
        timeout_seconds=0.01,
    )

    assert cancelled.is_set()
    assert "Timed out stopping Slow Service after 0.0s" in caplog.text


@pytest.mark.asyncio
async def test_safe_stop_service_logs_success(caplog):
    caplog.set_level(logging.INFO)

    async def _fast_stop() -> None:
        await asyncio.sleep(0)

    await app_main.safe_stop_service(
        logging.getLogger("test.main.shutdown"),
        "Fast Service",
        _fast_stop,
        timeout_seconds=0.1,
    )

    assert "Fast Service stopped successfully" in caplog.text


def test_runtime_shutdown_signal_handler_starts_watchdog_and_calls_previous(monkeypatch, caplog):
    called = []
    started = []
    notices = []

    def _previous_handler(signum, frame):
        called.append((signum, frame))

    monkeypatch.setattr(app_main, "_start_forced_shutdown_watchdog", lambda signal_name: started.append(signal_name))
    monkeypatch.setattr(app_main, "_emit_shutdown_notice", lambda message: notices.append(message))

    app_main._runtime_shutdown_signal_handler(
        signal.SIGTERM,
        None,
        previous_handler=_previous_handler,
    )

    assert started == ["SIGTERM"]
    assert called == [(signal.SIGTERM, None)]
    assert notices == ["SIGTERM received; starting forced-exit watchdog"]


def test_runtime_shutdown_signal_handler_respects_default(monkeypatch):
    started = []
    monkeypatch.setattr(app_main, "_start_forced_shutdown_watchdog", lambda signal_name: started.append(signal_name))

    with pytest.raises(SystemExit):
        app_main._runtime_shutdown_signal_handler(
            signal.SIGTERM,
            None,
            previous_handler=signal.SIG_DFL,
        )

    assert started == ["SIGTERM"]


def test_emit_shutdown_notice_writes_stderr(monkeypatch):
    writes = []

    monkeypatch.setattr(os, "write", lambda fd, data: writes.append((fd, data)) or len(data))

    app_main._emit_shutdown_notice("shutdown notice")

    assert writes == [(2, b"shutdown notice\n")]
