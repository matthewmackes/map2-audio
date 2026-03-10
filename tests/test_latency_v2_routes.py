import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routes import latency_v2 as latency_v2_routes


class _FakeCollector:
    def __init__(self, initial_stats):
        self._stats = dict(initial_stats)
        self.record_calls = []

    def get_stats(self):
        return dict(self._stats)

    def record(self, **kwargs):
        self.record_calls.append(kwargs)
        self._stats.update(
            {
                "p50_ms": kwargs.get("deviation_ms", 0.0),
                "p95_ms": kwargs.get("deviation_ms", 0.0),
                "p99_ms": kwargs.get("deviation_ms", 0.0),
                "max_ms": kwargs.get("deviation_ms", 0.0),
                "rtl_p95_ms": kwargs.get("rtl_ms", 0.0),
                "xrun_count": kwargs.get("xrun_count", 0),
                "window_seconds": self._stats.get("window_seconds", 60),
                "sample_count": max(1, self._stats.get("sample_count", 0)),
                "running": kwargs.get("running", False),
            }
        )


def test_jitter_stats_returns_existing_collector_snapshot(monkeypatch):
    collector = _FakeCollector(
        {
            "p50_ms": 0.12,
            "p95_ms": 0.34,
            "p99_ms": 0.56,
            "max_ms": 0.78,
            "rtl_p95_ms": 2.34,
            "xrun_count": 0,
            "window_seconds": 60,
            "sample_count": 14,
            "running": True,
        }
    )
    monkeypatch.setattr(latency_v2_routes, "get_timing_jitter_collector", lambda: collector)
    monkeypatch.setattr(latency_v2_routes, "get_audio_engine", lambda: None)

    payload = asyncio.run(latency_v2_routes.get_jitter_stats())

    assert payload["sample_count"] == 14
    assert payload["p95_ms"] == pytest.approx(0.34)
    assert collector.record_calls == []


def test_jitter_stats_primes_collector_from_live_engine(monkeypatch):
    collector = _FakeCollector(
        {
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
            "max_ms": 0.0,
            "rtl_p95_ms": 0.0,
            "xrun_count": 0,
            "window_seconds": 60,
            "sample_count": 0,
            "running": False,
        }
    )

    class _FakeService:
        is_running = True
        config = SimpleNamespace(buffer_size=64)

        def is_audio_running(self):
            return True

        async def get_audio_io_stats(self):
            return {
                "callback_budget_ms": 1.333,
                "callback_jitter_ms": 0.21,
                "xrun_count": 2,
                "samples_processed": 6400,
                "measured_round_trip_ms": 2.9,
            }

    monkeypatch.setattr(latency_v2_routes, "get_timing_jitter_collector", lambda: collector)
    monkeypatch.setattr(latency_v2_routes, "get_audio_engine", lambda: _FakeService())

    payload = asyncio.run(latency_v2_routes.get_jitter_stats())

    assert payload["sample_count"] >= 1
    assert collector.record_calls
    recorded = collector.record_calls[-1]
    assert recorded["xrun_count"] == 2
    assert recorded["callback_count"] == 100


def test_reset_xrun_counter_requires_available_engine(monkeypatch):
    monkeypatch.setattr(latency_v2_routes, "get_audio_engine", lambda: None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(latency_v2_routes.reset_xrun_counter())

    assert exc_info.value.status_code == 503


def test_reset_xrun_counter_success(monkeypatch):
    collector = _FakeCollector(
        {
            "p50_ms": 0.1,
            "p95_ms": 0.2,
            "p99_ms": 0.3,
            "max_ms": 0.3,
            "rtl_p95_ms": 2.0,
            "xrun_count": 0,
            "window_seconds": 60,
            "sample_count": 2,
            "running": True,
        }
    )

    class _FakeService:
        config = SimpleNamespace(buffer_size=64)

        def is_audio_running(self):
            return True

        async def reset_xrun_counter(self):
            return True

        async def get_audio_io_stats(self):
            return {
                "callback_budget_ms": 1.333,
                "callback_jitter_ms": 0.1,
                "xrun_count": 0,
                "samples_processed": 1280,
                "measured_round_trip_ms": 2.7,
            }

    monkeypatch.setattr(latency_v2_routes, "get_audio_engine", lambda: _FakeService())
    monkeypatch.setattr(latency_v2_routes, "get_timing_jitter_collector", lambda: collector)

    payload = asyncio.run(latency_v2_routes.reset_xrun_counter())

    assert payload["status"] == "ok"
    assert collector.record_calls
