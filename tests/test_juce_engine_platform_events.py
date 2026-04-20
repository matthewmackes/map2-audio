import asyncio

from app.services.juce_engine_service import JuceEngineService


class _FakeEngine:
    def __init__(self, events=None, dropped=0):
        self.events = list(events or [])
        self.dropped = dropped
        self.drain_calls = []

    def drain_platform_events(self, max_events):
        self.drain_calls.append(max_events)
        return list(self.events)

    def get_dropped_platform_event_count(self):
        return self.dropped


class _FakePlatformEventBus:
    def __init__(self):
        self.payloads = []

    async def emit(self, payload):
        self.payloads.append(payload)
        return f"event-{len(self.payloads)}"


def test_drain_platform_events_uses_native_fifo():
    service = JuceEngineService()
    service._engine = _FakeEngine(  # noqa: SLF001 - focused service seam test
        [
            {
                "kind": "audio.engine.status",
                "severity": "info",
                "title": "Audio started",
                "message": "JUCE audio processing started",
                "sequence": 7,
                "timestamp_ms": 123456,
                "dropped_count": 0,
            },
            "not-a-dict",
        ]
    )

    records = asyncio.run(service.drain_platform_events(16))

    assert records == [
        {
            "kind": "audio.engine.status",
            "severity": "info",
            "title": "Audio started",
            "message": "JUCE audio processing started",
            "sequence": 7,
            "timestamp_ms": 123456,
            "dropped_count": 0,
        }
    ]
    assert service._engine.drain_calls == [16]  # noqa: SLF001


def test_publish_engine_platform_events_uses_canonical_bus(monkeypatch):
    service = JuceEngineService()
    service._engine = _FakeEngine(  # noqa: SLF001 - focused service seam test
        [
            {
                "kind": "audio.xrun",
                "severity": "warning",
                "title": "Audio xrun",
                "message": "Audio callback xrun detected",
                "sequence": 12,
                "timestamp_ms": 456789,
                "dropped_count": 2,
            }
        ]
    )
    bus = _FakePlatformEventBus()
    monkeypatch.setattr("app.config.config_get", lambda _key, default=None: default)
    monkeypatch.setattr("app.services.platform_event.bus.get_platform_event_bus", lambda: bus)

    emitted_ids = asyncio.run(service.publish_engine_platform_events())

    assert emitted_ids == ["event-1"]
    assert bus.payloads == [
        {
            "kind": "audio.xrun",
            "severity": "warning",
            "source_node": "local",
            "source_service": "juce_engine",
            "title": "Audio xrun",
            "message": "Audio callback xrun detected",
            "context": {
                "engine_sequence": 12,
                "engine_timestamp_ms": 456789,
                "engine_dropped_count": 2,
            },
            "target_surfaces": ["lcd", "toast"],
        }
    ]


def test_get_dropped_platform_event_count_defaults_to_zero():
    service = JuceEngineService()
    service._engine = None  # noqa: SLF001 - focused service seam test

    assert asyncio.run(service.get_dropped_platform_event_count()) == 0

    service._engine = _FakeEngine(dropped=3)  # noqa: SLF001
    assert asyncio.run(service.get_dropped_platform_event_count()) == 3
