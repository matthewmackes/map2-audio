import asyncio

from app.services.avb.avb_service import (
    AvbService,
    AvbStreamConfig,
    AvbStreamInfo,
    AvbStreamStats,
    StreamDirection,
    StreamState,
)


def _stream_config(stream_id: str) -> AvbStreamConfig:
    return AvbStreamConfig(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        channels=2,
        sample_rate=48000,
        buffer_size=256,
        interface="eth0",
    )


def test_create_stream_fails_when_engine_lifecycle_api_missing():
    service = AvbService()
    service.is_available = lambda: True
    service.set_engine(object())

    result = asyncio.run(service.create_stream(_stream_config("stream-1")))

    assert result["code"] == "ENGINE_METHOD_UNAVAILABLE"
    assert "create" in result["error"]
    assert "stream-1" not in service.streams


def test_start_stream_fails_when_engine_lifecycle_api_missing():
    service = AvbService()
    service.set_engine(object())

    stream_id = "stream-2"
    service.streams[stream_id] = AvbStreamInfo(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        state=StreamState.STOPPED,
        config=_stream_config(stream_id),
        stats=AvbStreamStats(),
    )

    result = asyncio.run(service.start_stream(stream_id))

    assert result["code"] == "ENGINE_METHOD_UNAVAILABLE"
    assert "start" in result["error"]
    assert service.streams[stream_id].state == StreamState.ERROR


def test_stop_stream_fails_when_engine_lifecycle_api_missing():
    service = AvbService()
    service.set_engine(object())

    stream_id = "stream-3"
    service.streams[stream_id] = AvbStreamInfo(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        state=StreamState.RUNNING,
        config=_stream_config(stream_id),
        stats=AvbStreamStats(),
    )

    result = asyncio.run(service.stop_stream(stream_id))

    assert result["code"] == "ENGINE_METHOD_UNAVAILABLE"
    assert "stop" in result["error"]
    assert service.streams[stream_id].state == StreamState.ERROR


def test_delete_stream_fails_when_engine_lifecycle_api_missing():
    service = AvbService()
    service.set_engine(object())

    stream_id = "stream-4"
    service.streams[stream_id] = AvbStreamInfo(
        stream_id=stream_id,
        direction=StreamDirection.TALKER,
        state=StreamState.STOPPED,
        config=_stream_config(stream_id),
        stats=AvbStreamStats(),
    )

    result = asyncio.run(service.delete_stream(stream_id))

    assert result["code"] == "ENGINE_METHOD_UNAVAILABLE"
    assert "delete" in result["error"]
    assert stream_id in service.streams
