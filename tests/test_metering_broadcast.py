import pytest
from datetime import datetime, timezone

import app.services.metering_broadcast as metering_broadcast_module


def test_metering_broadcast_defaults_reduce_spectrum_and_dynamics(monkeypatch):
    monkeypatch.setattr(
        metering_broadcast_module,
        "config_get",
        lambda key, default=None: default,
    )

    service = metering_broadcast_module.MeteringBroadcastService()

    assert service._intervals["spectrum"] == pytest.approx(1.0 / 15.0)
    assert service._intervals["dynamics"] == pytest.approx(1.0 / 15.0)
    assert service._intervals["meters"] == pytest.approx(1.0 / 30.0)


def test_metering_broadcast_uses_configured_fps_overrides(monkeypatch):
    overrides = {
        "metering.broadcast_fps.spectrum": 24.0,
        "metering.broadcast_fps.dynamics": 12.0,
        "metering.broadcast_fps.meters": 20.0,
    }

    monkeypatch.setattr(
        metering_broadcast_module,
        "config_get",
        lambda key, default=None: overrides.get(key, default),
    )

    service = metering_broadcast_module.MeteringBroadcastService()

    assert service._intervals["spectrum"] == pytest.approx(1.0 / 24.0)
    assert service._intervals["dynamics"] == pytest.approx(1.0 / 12.0)
    assert service._intervals["meters"] == pytest.approx(1.0 / 20.0)


@pytest.mark.asyncio
async def test_metering_broadcast_emits_utc_timestamp(monkeypatch):
    delivered = []

    class _FakeWsManager:
        def get_subscribers(self, topic):
            return ["client-1"]

        async def broadcast_json(self, message, topic):
            delivered.append((topic, message))

    service = metering_broadcast_module.MeteringBroadcastService()
    service._running = True

    async def _fake_sleep(_interval):
        service._running = False

    monkeypatch.setattr(metering_broadcast_module, "ws_manager", _FakeWsManager())
    monkeypatch.setattr(metering_broadcast_module.asyncio, "sleep", _fake_sleep)

    async def _data_getter():
        return {"peak": -12.0}

    await service._broadcast_loop("meters", _data_getter)

    assert len(delivered) == 1
    topic, message = delivered[0]
    assert topic == "meters"
    assert message["type"] == "meters_update"
    assert datetime.fromisoformat(message["timestamp"]).tzinfo == timezone.utc
