import asyncio
import sys
import time
from types import SimpleNamespace

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
