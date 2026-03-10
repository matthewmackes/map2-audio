import time

import pytest

from app.services.pipewire_recovery import PipeWireHealth, PipeWireRecoveryService


@pytest.mark.asyncio
async def test_execute_recovery_respects_cooldown(monkeypatch):
    service = PipeWireRecoveryService()
    calls = {"count": 0}

    async def fake_soft_recovery():
        calls["count"] += 1
        return True

    monkeypatch.setattr(service, "_soft_recovery", fake_soft_recovery)

    first = await service._execute_recovery("jack_server_down")
    second = await service._execute_recovery("jack_server_down")

    assert first is True
    assert second is False
    assert calls["count"] == 1


@pytest.mark.asyncio
async def test_check_and_recover_defers_jack_retry_during_recovery_grace(monkeypatch):
    service = PipeWireRecoveryService()
    service.set_engine(object())
    service._last_recovery_completed_at = time.monotonic()

    monkeypatch.setattr(
        service,
        "get_health",
        lambda: PipeWireHealth(
            daemon_running=True,
            jack_server_running=False,
            device_connected=False,
        ),
    )
    calls = {"count": 0}

    async def fake_execute_recovery(_trigger: str):
        calls["count"] += 1
        return True

    monkeypatch.setattr(service, "_execute_recovery", fake_execute_recovery)

    await service._check_and_recover()

    assert calls["count"] == 0
