from __future__ import annotations

from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.routes import tesira as tesira_routes


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(tesira_routes.router)
    return TestClient(app, raise_server_exceptions=False)


def _make_device():
    dev = MagicMock()
    dev.device_id = "tesira_dev_1"
    dev.connected = True
    dev.set_eq_band_gain = AsyncMock()
    dev.set_eq_band_q = AsyncMock()
    return dev


def test_set_eq_gain_and_q_routes(client):
    device = _make_device()
    with patch("app.routes.tesira._get_device", return_value=device):
        gain_resp = client.put(
            "/api/tesira/devices/tesira_dev_1/eq/PEQ1/band/1/gain",
            json={"gain_db": 3.5},
        )
        q_resp = client.put(
            "/api/tesira/devices/tesira_dev_1/eq/PEQ1/band/1/q",
            json={"q": 1.2},
        )

    assert gain_resp.status_code == 200
    assert q_resp.status_code == 200
    assert device.set_eq_band_gain.await_count == 1
    assert device.set_eq_band_q.await_count == 1


@dataclass
class _ProbeResult:
    def to_dict(self):
        return {"device_id": "tesira_dev_1", "discovered_count": 1, "blocks": [], "errors": []}


def test_dsp_probe_route(client):
    device = _make_device()
    model = MagicMock()
    model.probe_device = AsyncMock(return_value=_ProbeResult())
    with patch("app.routes.tesira._get_device", return_value=device), patch(
        "app.routes.tesira._get_dsp_model", return_value=model
    ):
        response = client.post("/api/tesira/devices/tesira_dev_1/dsp/probe")

    assert response.status_code == 200
    body = response.json()
    assert body["device_id"] == "tesira_dev_1"
    assert body["discovered_count"] == 1


@dataclass
class _GpioResp:
    ok: bool
    value: object = None
    error_code: str | None = None
    error_detail: str | None = None


def test_gpio_set_route(client):
    device = _make_device()
    device._client = MagicMock()
    device._client.send = AsyncMock(return_value=_GpioResp(ok=True, value=True))

    with patch("app.routes.tesira._get_device", return_value=device):
        response = client.put("/api/tesira/devices/tesira_dev_1/gpio/1", json={"state": True})

    assert response.status_code == 200
    assert response.json()["ok"] is True
