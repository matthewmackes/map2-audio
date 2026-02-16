import asyncio

import pytest
from fastapi import HTTPException

from app.routes import avb as avb_routes
from app.services.avb import avb_service
from app.services.avb.avb_service import AvbService, AvbStreamConfig, StreamDirection


class _DummyAvbService:
    def __init__(self) -> None:
        self.called = False

    def is_available(self) -> bool:
        return True

    async def create_stream(self, _config):
        self.called = True
        return {"status": "created", "stream_id": "test"}


def test_avb_service_create_stream_rejects_empty_stream_id():
    service = AvbService()
    service.is_available = lambda: True

    config = AvbStreamConfig(
        stream_id="   ",
        direction=StreamDirection.TALKER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )

    result = asyncio.run(service.create_stream(config))

    assert result["code"] == "INVALID_CONFIG"
    assert "stream_id" in result["error"]


def test_avb_service_create_stream_rejects_non_positive_audio_values():
    service = AvbService()
    service.is_available = lambda: True

    config = AvbStreamConfig(
        stream_id="stream-01",
        direction=StreamDirection.TALKER,
        channels=0,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )

    result = asyncio.run(service.create_stream(config))

    assert result["code"] == "INVALID_CONFIG"
    assert result["error"] == "Invalid stream configuration"


def test_avb_service_create_stream_trims_stream_id():
    service = AvbService()
    service.is_available = lambda: True

    class _Engine:
        def create_avb_stream(self, _config):
            return True

    service.set_engine(_Engine())

    config = AvbStreamConfig(
        stream_id="  stream-02  ",
        direction=StreamDirection.LISTENER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )

    result = asyncio.run(service.create_stream(config))

    assert result["status"] == "created"
    assert result["stream_id"] == "stream-02"
    assert "stream-02" in service.streams


def test_route_create_stream_rejects_invalid_direction(monkeypatch):
    dummy_service = _DummyAvbService()
    monkeypatch.setattr(avb_service, "get_avb_service", lambda: dummy_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.create_stream(
                {
                    "stream_id": "stream-01",
                    "direction": "invalid",
                    "channels": 2,
                    "sample_rate": 48000,
                    "buffer_size": 256,
                    "interface": "eth0",
                }
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "direction must be 'talker' or 'listener'"
    assert dummy_service.called is False


def test_route_create_stream_requires_stream_id(monkeypatch):
    dummy_service = _DummyAvbService()
    monkeypatch.setattr(avb_service, "get_avb_service", lambda: dummy_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.create_stream(
                {
                    "direction": "talker",
                    "channels": 2,
                    "sample_rate": 48000,
                    "buffer_size": 256,
                    "interface": "eth0",
                }
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "stream_id is required"
    assert dummy_service.called is False


def test_route_create_stream_rejects_invalid_srp_payload(monkeypatch):
    dummy_service = _DummyAvbService()
    monkeypatch.setattr(avb_service, "get_avb_service", lambda: dummy_service)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.create_stream(
                {
                    "stream_id": "stream-03",
                    "direction": "talker",
                    "channels": 2,
                    "sample_rate": 48000,
                    "buffer_size": 256,
                    "interface": "eth0",
                    "srp": "invalid",
                }
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "srp must be an object when provided"
    assert dummy_service.called is False


def test_route_create_stream_strict_mode_requires_srp_reservation_id(monkeypatch):
    dummy_service = _DummyAvbService()
    monkeypatch.setattr(avb_service, "get_avb_service", lambda: dummy_service)

    values = {
        "avb.srp.enabled": True,
        "avb.srp.required": True,
    }
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            avb_routes.create_stream(
                {
                    "stream_id": "stream-04",
                    "direction": "talker",
                    "channels": 2,
                    "sample_rate": 48000,
                    "buffer_size": 256,
                    "interface": "eth0",
                    "srp": {"daemon_type": "mrpd"},
                }
            )
        )

    assert exc.value.status_code == 400
    assert "Strict SRP mode requires srp.reservation_id" in exc.value.detail
    assert dummy_service.called is False


def test_avb_service_stores_srp_binding_when_provided():
    service = AvbService()
    service.is_available = lambda: True

    class _Engine:
        def create_avb_stream(self, _config):
            return True

    service.set_engine(_Engine())

    config = AvbStreamConfig(
        stream_id="stream-05",
        direction=StreamDirection.TALKER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
        srp_reservation_id="res-1",
        srp_admission_id="adm-1",
        srp_metadata={"endpoint": "streams.create"},
    )

    result = asyncio.run(service.create_stream(config))

    assert result["status"] == "created"
    binding = service.get_srp_binding("stream-05")
    assert binding is not None
    assert binding["reservation_id"] == "res-1"
    assert binding["admission_id"] == "adm-1"
