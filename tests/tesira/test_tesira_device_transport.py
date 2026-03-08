from __future__ import annotations

from typing import Any, Dict

import pytest

from app.services.tesira.ttp_client import TTPResponse
from app.services.tesira.tesira_device import TesiraDevice


class FakeClient:
    def __init__(self, responses: Dict[str, Any], connect_error: Exception | None = None):
        self._responses = responses
        self._connect_error = connect_error
        self.connected = False
        self._push_cb = None

    async def connect(self) -> None:
        if self._connect_error is not None:
            raise self._connect_error
        self.connected = True

    async def disconnect(self) -> None:
        self.connected = False

    def on_push(self, callback):
        self._push_cb = callback

    async def send(self, instance_tag: str, service: str, attribute: str, *args: Any) -> TTPResponse:
        key = f"{instance_tag}.{service}.{attribute}"
        if key in self._responses:
            value = self._responses[key]
            if isinstance(value, TTPResponse):
                return value
            return TTPResponse(ok=True, value=value, raw=f"+OK value={value}")
        return TTPResponse(ok=False, error_code="NOT_FOUND", raw="-ERR NOT_FOUND")

    async def subscribe(self, instance_tag: str, attribute: str, interval_ms: int = 100) -> None:
        return None

    async def unsubscribe(self, instance_tag: str, attribute: str) -> None:
        return None


@pytest.mark.asyncio
async def test_tesira_device_auto_falls_back_to_ssh(monkeypatch):
    telnet = FakeClient({}, connect_error=RuntimeError("telnet down"))
    ssh = FakeClient(
        {
            "DEVICE.get.hostname": "forte-a",
            "DEVICE.get.serialNumber": "SN-100",
            "DEVICE.get.version": "4.0.1",
            "DEVICE.get.macAddress": "00:11:22:33:44:55",
            "DEVICE.get.model": "TesiraFORTE CI",
        }
    )

    monkeypatch.setattr(TesiraDevice, "_build_telnet_client", lambda self: telnet)
    monkeypatch.setattr(TesiraDevice, "_build_ssh_client", lambda self: ssh)

    device = TesiraDevice(
        host="172.20.1.10",
        transport="auto",
        ssh_enabled=True,
        ssh_port=22,
        ssh_username="default",
        ssh_password="default",
    )

    await device.connect()

    assert device.connected is True
    assert device.transport == "ssh"
    assert device.transport_port == 22
    assert device.device_id == "tesira_SN-100"


@pytest.mark.asyncio
async def test_tesira_device_prefers_telnet_when_available(monkeypatch):
    telnet = FakeClient(
        {
            "DEVICE.get.hostname": "forte-b",
            "DEVICE.get.serialNumber": "SN-200",
            "DEVICE.get.version": "4.0.1",
            "DEVICE.get.macAddress": "00:aa:bb:cc:dd:ee",
            "DEVICE.get.model": "TesiraFORTE CI",
        }
    )
    ssh = FakeClient({}, connect_error=RuntimeError("should not be used"))

    monkeypatch.setattr(TesiraDevice, "_build_telnet_client", lambda self: telnet)
    monkeypatch.setattr(TesiraDevice, "_build_ssh_client", lambda self: ssh)

    device = TesiraDevice(host="172.20.1.11", transport="auto", ssh_enabled=True)
    await device.connect()

    assert device.connected is True
    assert device.transport == "telnet"
    assert device.transport_port == 23


@pytest.mark.asyncio
async def test_tesira_device_ptp_falls_back_to_network_status(monkeypatch):
    telnet = FakeClient(
        {
            "DEVICE.get.hostname": "forte-c",
            "DEVICE.get.serialNumber": "SN-300",
            "DEVICE.get.version": "5.5.0.2",
            "DEVICE.get.macAddress": "00:bb:cc:dd:ee:ff",
            "DEVICE.get.model": "TesiraFORTE CI",
            "AVBInterface1.get.ptpStatus": TTPResponse(
                ok=False,
                error_code="address",
                error_detail='{"deviceId":0 "classCode":0 "instanceNum":0}',
                raw='-ERR address not found',
            ),
            "DEVICE.get.networkStatus": '{"networkInterfaceStatusWithName":[{"interfaceId":"media_avb_0" "networkInterfaceStatus":{"linkStatus":LINK_NONE}}]}',
        }
    )

    monkeypatch.setattr(TesiraDevice, "_build_telnet_client", lambda self: telnet)

    device = TesiraDevice(host="172.20.1.12", transport="telnet", ssh_enabled=False)
    await device.connect()

    ptp = await device.get_ptp_status()
    assert ptp["state"] == "NO_LINK"
