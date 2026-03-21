import asyncio

import pytest
from fastapi import HTTPException

from app.routes import profiling as profiling_routes


class _FakeProfiler:
    def get_all_stats(self):
        return [
            {
                "uri": "urn:test:duplicate",
                "name": "Duplicate",
                "call_count": 9,
                "avg_time_us": 12.5,
                "max_time_us": 18.0,
                "cpu_percent": 7.0,
                "calls_per_second": 187.5,
            }
        ]

    def get_chain_stats(self):
        return {
            "total_plugins": 1,
            "total_cpu_percent": 7.0,
            "total_avg_us": 12.5,
            "total_max_us": 18.0,
            "deadline_us": 5333.33,
            "utilization_percent": 0.23,
            "chain_call_count": 9,
        }

    def get_profiler_stats(self):
        return {
            "sample_rate": 48000,
            "buffer_size": 256,
            "deadline_us": 5333.33,
            "registered_plugins": 1,
            "total_measurements": 9,
            "overhead_per_call_us": 0.2,
        }


class _FakeEngineService:
    is_available = True
    is_running = True

    async def get_runtime_plugin_cpu_telemetry(self):
        return [
            {
                "uri": "urn:test:duplicate",
                "name": "Duplicate A",
                "instance_id": 101,
                "position": 0,
                "plugin_position": 0,
                "cpu_percent": 3.5,
                "latency_samples": 64,
            },
            {
                "uri": "urn:test:duplicate",
                "name": "Duplicate B",
                "instance_id": 202,
                "position": 1,
                "plugin_position": 1,
                "cpu_percent": 5.25,
                "latency_samples": 32,
            },
        ]


def test_profiling_route_emits_per_instance_duplicate_entries(monkeypatch):
    monkeypatch.setattr(profiling_routes, "get_profiler", lambda: _FakeProfiler())
    monkeypatch.setattr(profiling_routes, "get_audio_engine", lambda: _FakeEngineService())

    payload = asyncio.run(profiling_routes.get_plugin_stats())

    assert [plugin["instance_id"] for plugin in payload["plugins"]] == [202, 101]
    assert [plugin["plugin_position"] for plugin in payload["plugins"]] == [1, 0]
    assert payload["chain"]["total_plugins"] == 2
    assert payload["chain"]["total_cpu_percent"] == 8.75


def test_profiling_route_preserves_http_exceptions(monkeypatch):
    monkeypatch.setattr(profiling_routes, "get_profiler", lambda: None)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(profiling_routes.get_plugin_stats())

    assert exc_info.value.status_code == 503
