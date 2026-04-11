import asyncio
import sys
import time
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.event_publisher import EventPublisher
from app.services.service_orchestrator import ServiceHealth, ServiceOrchestrator


class _SlowJuceService:
    is_running = True
    is_available = True

    def get_system_info(self):
        time.sleep(0.2)
        return {
            "version": "3.0.0",
            "running": True,
            "audio_running": True,
            "available": True,
            "initialized": True,
        }


class _ExplodingJuceService:
    is_running = True
    is_available = True

    def get_system_info(self):
        raise RuntimeError("boom")


def test_check_juce_health_uses_cached_metrics_when_probe_times_out(monkeypatch):
    orchestrator = ServiceOrchestrator()
    orchestrator._services["juce_engine"].health = ServiceHealth(
        healthy=True,
        message="cached",
        metrics={
            "version": "2.0.0-juce",
            "running": True,
            "audio_running": True,
            "available": True,
            "initialized": True,
        },
    )
    monkeypatch.setitem(
        sys.modules,
        "app.services.juce_engine_service",
        SimpleNamespace(get_audio_engine=lambda: _SlowJuceService(), JUCE_AVAILABLE=True),
    )

    payload = asyncio.run(orchestrator._check_juce_health())

    assert payload.healthy is True
    assert payload.metrics["version"] == "2.0.0-juce"
    assert payload.metrics["stale"] is True
    assert "cached health snapshot" in payload.message


def test_check_juce_health_falls_back_to_runtime_flags_without_cache(monkeypatch):
    orchestrator = ServiceOrchestrator()
    monkeypatch.setitem(
        sys.modules,
        "app.services.juce_engine_service",
        SimpleNamespace(get_audio_engine=lambda: _ExplodingJuceService(), JUCE_AVAILABLE=True),
    )

    payload = asyncio.run(orchestrator._check_juce_health())

    assert payload.healthy is True
    assert payload.metrics["stale"] is True
    assert payload.metrics["available"] is True
    assert payload.metrics["initialized"] is True
    assert payload.metrics["health_probe_error"] == "boom"


def test_emit_event_uses_publish_abstraction_for_service_status_topic():
    class _FakeWsManager:
        def __init__(self) -> None:
            self.messages = []

        async def broadcast_json(self, message, topic=None):
            self.messages.append((topic, message))

    publisher = EventPublisher()
    ws_manager = _FakeWsManager()
    publisher.set_websocket_manager(ws_manager)
    orchestrator = ServiceOrchestrator(publisher=publisher)

    asyncio.run(orchestrator._emit_event("service_started", {"service": "database"}))

    assert len(ws_manager.messages) == 1
    topic, message = ws_manager.messages[0]
    assert topic == "service_status"
    assert message["type"] == "service_started"
    assert message["data"] == {"service": "database"}
    assert "timestamp" in message
    assert datetime.fromisoformat(message["timestamp"]).tzinfo == timezone.utc


def test_orchestrator_status_payloads_use_aware_utc_timestamps():
    orchestrator = ServiceOrchestrator()
    orchestrator._running = True
    orchestrator._startup_time = datetime.now(timezone.utc)
    orchestrator._services["database"].started_at = datetime.now(timezone.utc)
    orchestrator._services["database"].health.last_check = datetime.now(timezone.utc)

    all_status = orchestrator.get_all_status()
    ready_status = orchestrator.get_ready_status()

    assert datetime.fromisoformat(all_status["orchestrator"]["startup_time"]).tzinfo == timezone.utc
    assert datetime.fromisoformat(ready_status["startup_time"]).tzinfo == timezone.utc
    assert datetime.fromisoformat(all_status["services"]["database"]["started_at"]).tzinfo == timezone.utc
    assert datetime.fromisoformat(all_status["services"]["database"]["health"]["last_check"]).tzinfo == timezone.utc


def test_stop_juce_engine_calls_stop_audio_then_shutdown(monkeypatch):
    class _FakeService:
        def __init__(self) -> None:
            self.calls = []

        async def stop_audio(self):
            self.calls.append("stop_audio")

        async def shutdown(self):
            self.calls.append("shutdown")

    service = _FakeService()
    orchestrator = ServiceOrchestrator()
    monkeypatch.setitem(
        sys.modules,
        "app.services.juce_engine_service",
        SimpleNamespace(get_audio_engine=lambda: service),
    )

    asyncio.run(orchestrator._stop_juce_engine())

    assert service.calls == ["stop_audio", "shutdown"]
