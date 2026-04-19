from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.config_validator import ConfigValidator
from app.services.event_producers.network_producer import NetworkEventProducer
from app.services.event_producers.plugin_producer import PluginEventProducer
from app.services.platform_event.envelope import PlatformEvent
from app.services.resilience_logging import ResilienceLogger


class _CaptureBus:
    def __init__(self) -> None:
        self.events: list[PlatformEvent] = []

    async def emit(self, event: PlatformEvent) -> None:
        self.events.append(event)


def test_config_validator_uses_utc_timestamp() -> None:
    result = ConfigValidator().validate(
        {"backend": {"host": "0.0.0.0", "port": 8080}, "audio": {"sample_rate": 48000, "buffer_size": 256}}
    )
    assert result.timestamp.tzinfo == timezone.utc


def test_resilience_logger_uses_utc_timestamp(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[str] = []
    logger = ResilienceLogger("resilience-test")
    monkeypatch.setattr(logger.logger, "info", lambda message: captured.append(message))

    logger.circuit_closed("backend")

    assert captured
    assert "+00:00" in captured[0]


@pytest.mark.asyncio
async def test_network_event_producer_uses_utc_event_timestamps() -> None:
    bus = _CaptureBus()
    producer = NetworkEventProducer(bus, node_label="NODE-UTC")
    await producer.register_peer("node-b", "http://node-b")
    await producer.on_peer_connected("node-b")
    await producer.on_peer_disconnected("node-b")

    assert len(bus.events) == 2
    assert all(event.occurred_at.tzinfo == timezone.utc for event in bus.events)


@pytest.mark.asyncio
async def test_plugin_event_producer_tracks_loaded_at_in_utc() -> None:
    bus = _CaptureBus()
    producer = PluginEventProducer(bus, node_label="NODE-UTC")
    await producer.on_plugin_loaded("Limiter", "lv2", "plugin-1", latency_change_ms=0.5)

    loaded_at = datetime.fromisoformat(producer.loaded_plugins["plugin-1"]["loaded_at"])
    assert loaded_at.tzinfo == timezone.utc
    assert bus.events
    assert bus.events[0].occurred_at.tzinfo == timezone.utc
