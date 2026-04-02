import pytest

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
