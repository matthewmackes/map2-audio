from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest

from app.services.event_producers.audio_producer import AudioEventProducer
from app.services.event_producers.system_producer import SystemHealthProducer


class _CaptureBus:
    async def emit(self, event) -> None:
        return None


@pytest.mark.asyncio
async def test_audio_event_producer_uses_juce_status_without_service_manager(monkeypatch: pytest.MonkeyPatch) -> None:
    bus = _CaptureBus()
    producer = AudioEventProducer(bus, node_label="NODE-RUNTIME")

    async def _get_xrun_count() -> int:
        return 3

    fake_engine = SimpleNamespace(
        get_system_info=lambda: {
            "running": True,
            "audio_running": True,
            "sample_rate": 48000,
            "buffer_size": 64,
            "cpu_usage_pct": 12.5,
        },
        get_xrun_count=_get_xrun_count,
    )
    fake_module = SimpleNamespace(get_audio_engine=lambda: fake_engine)

    monkeypatch.setitem(sys.modules, "app.services.juce_engine_service", fake_module)
    monkeypatch.delitem(sys.modules, "app.services.service_manager", raising=False)

    status = await producer._get_audio_status()

    assert status == {
        "running": True,
        "sample_rate": 48000,
        "buffer_size": 64,
        "latency_ms": pytest.approx(64 / 48000 * 1000.0),
        "cpu_load": 12.5,
        "underruns": 3,
        "overruns": 0,
    }


@pytest.mark.asyncio
async def test_system_health_producer_collects_snapshot_via_to_thread(monkeypatch: pytest.MonkeyPatch) -> None:
    bus = _CaptureBus()
    producer = SystemHealthProducer(bus, node_label="NODE-RUNTIME")
    calls: list[str] = []

    def fake_collect():
        calls.append("collect")
        return {
            "cpu_percent": 10.0,
            "memory_percent": 20.0,
            "memory_available": 1234,
            "disk_percent": 30.0,
            "disk_free": 5678,
            "temperatures": None,
        }

    async def fake_to_thread(func, *args, **kwargs):
        assert func == producer._collect_system_snapshot
        return fake_collect()

    monkeypatch.setattr(producer, "_collect_system_snapshot", fake_collect)
    monkeypatch.setattr("app.services.event_producers.system_producer.asyncio.to_thread", fake_to_thread)

    await producer._check_system_health()

    assert calls == ["collect"]
