import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routes import avb as avb_routes
from app.services.avb import avb_service as avb_service_module
from app.services.avb.avb_service import (
    AvbService,
    AvbStreamConfig,
    AvbStreamInfo,
    AvbStreamStats,
    StreamDirection,
    StreamState,
)


class _DummyRouteService:
    def __init__(self, *, available=True, stream_exists=True, reset_success=True):
        self.available = available
        self.stream_exists = stream_exists
        self.reset_success = reset_success

    def is_available(self):
        return self.available

    def get_stream(self, _stream_id):
        if not self.stream_exists:
            return None
        return {"stream_id": "stream-1"}

    def reset_stream_stats(self, _stream_id):
        return self.reset_success



def _add_stream(service: AvbService, stream_id: str = "stream-1", stats: AvbStreamStats | None = None) -> None:
    config = AvbStreamConfig(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )
    service.streams[stream_id] = AvbStreamInfo(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        state=StreamState.RUNNING,
        config=config,
        stats=stats or AvbStreamStats(),
    )



def test_get_stream_stats_uses_engine_dict_payload():
    service = AvbService()
    _add_stream(service, stats=AvbStreamStats(min_latency_ns=17))

    class _Engine:
        def get_avb_stream_stats(self, stream_id):
            assert stream_id == "stream-1"
            return {
                "framesSent": "12",
                "frames_received": 8,
                "sendErrors": 1,
                "bytesTransferred": "2048",
                "maxLatencyNs": "2500",
                "min_latency_ns": -1,
            }

    service.set_engine(_Engine())

    stats = service.get_stream_stats("stream-1")

    assert stats is not None
    assert stats["frames_sent"] == 12
    assert stats["frames_received"] == 8
    assert stats["send_errors"] == 1
    assert stats["bytes_transferred"] == 2048
    assert stats["max_latency_ns"] == 2500
    assert stats["min_latency_ns"] == 17
    assert service.streams["stream-1"].error is None



def test_get_stream_stats_uses_engine_object_payload():
    service = AvbService()
    _add_stream(service)

    class _Engine:
        def getAvbStreamStats(self, _stream_id):
            return SimpleNamespace(frames_sent=3, framesReceived=4, timestampErrors=2)

    service.set_engine(_Engine())

    stats = service.get_stream_stats("stream-1")

    assert stats is not None
    assert stats["frames_sent"] == 3
    assert stats["frames_received"] == 4
    assert stats["timestamp_errors"] == 2



def test_get_stream_stats_preserves_cache_when_engine_errors():
    service = AvbService()
    _add_stream(service, stats=AvbStreamStats(frames_sent=9))

    class _Engine:
        def get_avb_stream_stats(self, _stream_id):
            raise RuntimeError("stats unavailable")

    service.set_engine(_Engine())

    stats = service.get_stream_stats("stream-1")

    assert stats is not None
    assert stats["frames_sent"] == 9
    assert "stats unavailable" in (service.streams["stream-1"].error or "")



def test_reset_stream_stats_calls_engine_when_available():
    service = AvbService()
    _add_stream(service, stats=AvbStreamStats(frames_sent=15, bytes_transferred=99))
    calls = []

    class _Engine:
        def reset_avb_stream_stats(self, stream_id):
            calls.append(stream_id)
            return True

    service.set_engine(_Engine())

    ok = service.reset_stream_stats("stream-1")

    assert ok is True
    assert calls == ["stream-1"]
    assert service.streams["stream-1"].stats.frames_sent == 0
    assert service.streams["stream-1"].stats.bytes_transferred == 0



def test_reset_stream_stats_returns_false_when_engine_reset_fails():
    service = AvbService()
    _add_stream(service, stats=AvbStreamStats(frames_sent=7))

    class _Engine:
        def reset_avb_stream_stats(self, _stream_id):
            return False

    service.set_engine(_Engine())

    ok = service.reset_stream_stats("stream-1")

    assert ok is False
    assert service.streams["stream-1"].stats.frames_sent == 7
    assert "returned False" in (service.streams["stream-1"].error or "")



def test_route_reset_stream_stats_success(monkeypatch):
    dummy = _DummyRouteService(available=True, stream_exists=True, reset_success=True)
    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: dummy)

    result = asyncio.run(avb_routes.reset_stream_stats("stream-1"))

    assert result == {"status": "reset", "stream_id": "stream-1"}



def test_route_reset_stream_stats_not_found(monkeypatch):
    dummy = _DummyRouteService(available=True, stream_exists=False, reset_success=True)
    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: dummy)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.reset_stream_stats("stream-1"))

    assert exc.value.status_code == 404
    assert exc.value.detail == "Stream not found"



def test_route_reset_stream_stats_reset_failure(monkeypatch):
    dummy = _DummyRouteService(available=True, stream_exists=True, reset_success=False)
    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: dummy)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(avb_routes.reset_stream_stats("stream-1"))

    assert exc.value.status_code == 400
    assert exc.value.detail == "Failed to reset stream stats"
