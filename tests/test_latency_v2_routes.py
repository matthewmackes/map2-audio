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


class _FakeAnalyzer:
    def __init__(self):
        self._latencies = {"map2:plugin/test": 96}
        self.measured_latencies = {}

    def get_latency(self, plugin_uri):
        return self._latencies.get(plugin_uri, 0)

    def samples_to_ms(self, samples):
        return samples * 1000.0 / 48000


class _FakeCompensator:
    def __init__(self):
        self.compensation_enabled = True
        self.reset_calls = 0
        self.chain_latencies = {"map2:plugin/test": 96}

    def get_status(self):
        return {
            "enabled": self.compensation_enabled,
            "max_latency_samples": 8192,
            "max_latency_ms": 170.6666666667,
            "chain_latency_samples": 96,
            "chain_latency_ms": 2.0,
            "active_delay_lines": 1,
            "compensated_plugins": ["map2:plugin/test"],
        }

    def enable_compensation(self, enabled):
        self.compensation_enabled = enabled

    def calculate_chain_compensation(self, plugin_latencies):
        max_latency = max(plugin_latencies.values()) if plugin_latencies else 0
        self.chain_latencies = dict(plugin_latencies)
        return {
            plugin_uri: max_latency - latency
            for plugin_uri, latency in plugin_latencies.items()
        }

    def reset_delay_lines(self):
        self.reset_calls += 1

    def get_total_chain_latency(self):
        return max(self.chain_latencies.values()) if self.chain_latencies else 0


def test_router_exposes_consolidated_v2_latency_surface():
    route_paths = {route.path for route in latency_v2_routes.router.routes}

    assert latency_v2_routes.router.prefix == "/api/v2/latency"
    assert "/api/v2/latency/status" in route_paths
    assert "/api/v2/latency/compensate" in route_paths
    assert "/api/v2/latency/measure" in route_paths
    assert "/api/v2/latency/plugins/{plugin_uri:path}" in route_paths
    assert "/api/v2/latency/chains/{chain_id}/calculate" in route_paths
    assert "/api/v2/latency/reset" in route_paths
    assert "/api/v2/latency/chains/{chain_id}" in route_paths
    assert "/api/v2/latency/jitter-stats" in route_paths
    assert "/api/v2/latency/xruns/reset" in route_paths
    assert all(not path.startswith("/api/" + "latency") for path in route_paths)


def test_compensation_status_and_toggle_use_v2_surface(monkeypatch):
    compensator = _FakeCompensator()
    monkeypatch.setattr(latency_v2_routes, "get_latency_compensator", lambda: compensator)

    status = asyncio.run(latency_v2_routes.get_latency_status())
    assert status["chain_latency_samples"] == 96

    request = latency_v2_routes.LatencyCompensationRequest(enabled=False)
    payload = asyncio.run(latency_v2_routes.set_compensation(request))

    assert payload == {
        "status": "ok",
        "enabled": False,
        "message": "Latency compensation disabled",
    }
    assert compensator.compensation_enabled is False


def test_plugin_and_chain_latency_endpoints_use_compensation_services(monkeypatch):
    analyzer = _FakeAnalyzer()
    compensator = _FakeCompensator()
    monkeypatch.setattr(latency_v2_routes, "get_latency_analyzer", lambda: analyzer)
    monkeypatch.setattr(latency_v2_routes, "get_latency_compensator", lambda: compensator)

    plugin_payload = asyncio.run(latency_v2_routes.get_plugin_latency("map2:plugin/test"))
    assert plugin_payload["latency_samples"] == 96
    assert plugin_payload["latency_ms"] == pytest.approx(2.0)
    assert plugin_payload["has_measurement"] is True

    request = latency_v2_routes.ChainLatencyRequest(
        chain_id=7,
        plugin_latencies={
            "map2:plugin/a": 32,
            "map2:plugin/b": 128,
        },
    )
    chain_payload = asyncio.run(latency_v2_routes.calculate_chain_compensation(7, request))
    assert chain_payload["chain_id"] == 7
    assert chain_payload["max_latency_samples"] == 128
    assert chain_payload["max_latency_ms"] == pytest.approx(2.6666666667)
    assert chain_payload["compensations"] == {
        "map2:plugin/a": 96,
        "map2:plugin/b": 0,
    }

    total_payload = asyncio.run(latency_v2_routes.get_chain_latency(7))
    assert total_payload["total_latency_samples"] == 128
    assert total_payload["compensation_enabled"] is True

    reset_payload = asyncio.run(latency_v2_routes.reset_delay_lines())
    assert reset_payload["status"] == "ok"
    assert compensator.reset_calls == 1


def test_measure_plugin_latency_uses_reported_measurement_helper(monkeypatch):
    analyzer = _FakeAnalyzer()

    async def _fake_reported_latency(plugin_uri):
        assert plugin_uri == "map2:plugin/test"
        return 144

    monkeypatch.setattr(latency_v2_routes, "get_latency_analyzer", lambda: analyzer)
    monkeypatch.setattr(latency_v2_routes, "_measure_reported_latency", _fake_reported_latency)

    request = latency_v2_routes.LatencyMeasureRequest(
        plugin_uri="map2:plugin/test",
        method="reported",
    )
    payload = asyncio.run(latency_v2_routes.measure_plugin_latency(request))

    assert payload["plugin_uri"] == "map2:plugin/test"
    assert payload["latency_samples"] == 144
    assert payload["latency_ms"] == pytest.approx(3.0)
    assert payload["method"] == "reported"


def test_measure_plugin_latency_rejects_unknown_method():
    request = latency_v2_routes.LatencyMeasureRequest(
        plugin_uri="map2:plugin/test",
        method="other",
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(latency_v2_routes.measure_plugin_latency(request))

    assert exc_info.value.status_code == 400


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
