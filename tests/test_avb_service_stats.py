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


def test_route_get_streams_includes_transport_health(monkeypatch):
    class _Service:
        def is_available(self):
            return True

        def get_all_streams(self):
            return [
                {
                    "stream_id": "stream-1",
                    "direction": "talker",
                    "state": "running",
                    "config": {"interface": "eth0"},
                    "stats": {},
                    "error": None,
                }
            ]

    class _PtpMonitor:
        async def get_status(self):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "state": "SLAVE",
                    "offset_ns": 123.0,
                    "mean_path_delay_ns": 456.0,
                }
            )

    class _TsnManager:
        async def get_status(self, interface=None):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "interface": interface,
                    "mqprio_configured": True,
                    "cbs_configured": True,
                    "etf_configured": True,
                    "vlan_configured": True,
                }
            )

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(avb_routes, "get_ptp_monitor", lambda: _PtpMonitor())
    monkeypatch.setattr(avb_routes, "get_tsn_qdisc_manager", lambda: _TsnManager())

    result = asyncio.run(avb_routes.get_streams())

    assert result["available"] is True
    assert len(result["streams"]) == 1
    stream = result["streams"][0]
    assert stream["stream_id"] == "stream-1"
    assert stream["health"]["ready"] is True
    assert stream["health"]["issues"] == []
    assert stream["health"]["ptp"]["state"] == "SLAVE"
    assert stream["health"]["tsn"]["mqprio_configured"] is True
    assert stream["diagnostics"]["effective_config"]["interface"] == "eth0"
    assert stream["diagnostics"]["ptp_lock"]["locked"] is True
    assert stream["diagnostics"]["srp"]["bound"] is False
    assert stream["diagnostics"]["tsn_qdisc"]["available"] is True


def test_route_get_stream_includes_health_issues_when_degraded(monkeypatch):
    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "listener",
                "state": "error",
                "config": {"interface": "eth0"},
                "stats": {},
                "error": "engine timeout",
            }

    class _PtpMonitor:
        async def get_status(self):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": False,
                    "error": "ptp4l service not running",
                }
            )

    class _TsnManager:
        async def get_status(self, interface=None):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "interface": "eth1",
                    "mqprio_configured": True,
                    "cbs_configured": True,
                    "etf_configured": True,
                    "vlan_configured": False,
                }
            )

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(avb_routes, "get_ptp_monitor", lambda: _PtpMonitor())
    monkeypatch.setattr(avb_routes, "get_tsn_qdisc_manager", lambda: _TsnManager())

    stream = asyncio.run(avb_routes.get_stream("stream-degraded"))

    assert stream["stream_id"] == "stream-degraded"
    assert stream["health"]["ready"] is False
    assert "PTP_UNAVAILABLE" in stream["health"]["issues"]
    assert "TSN_INTERFACE_MISMATCH" in stream["health"]["issues"]
    assert "STREAM_ERROR" in stream["health"]["issues"]
    assert stream["diagnostics"]["ptp_lock"]["locked"] is False
    assert stream["diagnostics"]["ptp_lock"]["reason"] == "PTP_UNAVAILABLE"
    assert stream["diagnostics"]["srp"]["bound"] is False


def test_route_get_stream_diagnostics_endpoint_includes_effective_config_and_srp(monkeypatch):
    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "state": "running",
                "config": {
                    "interface": "",
                    "channels": 4,
                    "sample_rate": 96000,
                    "buffer_size": 256,
                    "presentation_offset_us": 3000,
                    "priority": 3,
                },
                "stats": {},
                "error": None,
            }

        def get_srp_binding(self, _stream_id):
            return {
                "reservation_id": "res-123",
                "admission_id": "adm-456",
                "metadata": {"endpoint": "streams.start"},
            }

    class _PtpMonitor:
        async def get_status(self):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "state": "MASTER",
                    "offset_ns": 12.0,
                    "mean_path_delay_ns": 34.0,
                }
            )

    class _TsnManager:
        async def get_status(self, interface=None):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "interface": interface,
                    "mqprio_configured": True,
                    "cbs_configured": True,
                    "etf_configured": False,
                    "vlan_configured": True,
                }
            )

    values = {
        "avb.interface": "eth9",
        "audio.buffer_size": 128,
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.failover_policy": "prefer_primary",
        "avb.failover_interfaces": ["eth9", "eth10"],
    }

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(avb_routes, "get_ptp_monitor", lambda: _PtpMonitor())
    monkeypatch.setattr(avb_routes, "get_tsn_qdisc_manager", lambda: _TsnManager())
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))

    result = asyncio.run(avb_routes.get_stream_diagnostics("stream-diagnostics"))

    assert result["stream_id"] == "stream-diagnostics"
    assert result["health"]["ready"] is True
    assert result["health"]["interface"] == "eth9"
    assert result["diagnostics"]["effective_config"]["interface"] == "eth9"
    assert result["diagnostics"]["effective_config"]["channels"] == 4
    assert result["diagnostics"]["effective_config"]["sample_rate"] == 96000
    assert result["diagnostics"]["effective_config"]["failover_policy"] == "prefer_primary"
    assert result["diagnostics"]["effective_config"]["interface_candidates"] == ["eth9", "eth10"]
    assert result["diagnostics"]["ptp_lock"]["locked"] is True
    assert result["diagnostics"]["srp"]["bound"] is True
    assert result["diagnostics"]["srp"]["reservation_id"] == "res-123"


def test_route_get_stream_diagnostics_uses_stream_failover_overrides(monkeypatch):
    class _Service:
        def is_available(self):
            return True

        def get_stream(self, stream_id):
            return {
                "stream_id": stream_id,
                "direction": "talker",
                "state": "running",
                "config": {
                    "interface": "eth5",
                    "channels": 2,
                    "sample_rate": 48000,
                    "buffer_size": 256,
                    "presentation_offset_us": 2000,
                    "priority": 4,
                    "failover_policy": "manual",
                    "failover_interfaces": ["eth5", "eth6"],
                },
                "stats": {},
                "error": None,
            }

        def get_srp_binding(self, _stream_id):
            return None

    class _PtpMonitor:
        async def get_status(self):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "state": "SLAVE",
                }
            )

    class _TsnManager:
        async def get_status(self, interface=None):
            return SimpleNamespace(
                to_dict=lambda: {
                    "available": True,
                    "interface": interface,
                    "mqprio_configured": True,
                    "cbs_configured": True,
                    "etf_configured": True,
                    "vlan_configured": True,
                }
            )

    values = {
        "avb.interface": "eth0",
        "audio.buffer_size": 128,
        "avb.srp.enabled": True,
        "avb.srp.required": False,
        "avb.failover_policy": "prefer_primary",
        "avb.failover_interfaces": ["eth0", "eth1"],
    }

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())
    monkeypatch.setattr(avb_routes, "get_ptp_monitor", lambda: _PtpMonitor())
    monkeypatch.setattr(avb_routes, "get_tsn_qdisc_manager", lambda: _TsnManager())
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))

    result = asyncio.run(avb_routes.get_stream_diagnostics("stream-failover-override"))

    assert result["diagnostics"]["effective_config"]["interface"] == "eth5"
    assert result["diagnostics"]["effective_config"]["failover_policy"] == "manual"
    assert result["diagnostics"]["effective_config"]["interface_candidates"] == ["eth5", "eth6"]


def test_route_get_avb_config_compatibility_matrix(monkeypatch):
    values = {
        "avb.enabled": True,
        "avb.interface": "eth3",
        "avb.srp.enabled": True,
        "avb.srp.required": True,
        "avb.avdecc_enabled": True,
        "avb.failover_policy": "round_robin",
        "avb.failover_interfaces": '["eth3","eth4"]',
    }
    monkeypatch.setattr(avb_routes, "config_get", lambda key, default=None: values.get(key, default))

    result = asyncio.run(avb_routes.get_avb_config_compatibility())

    assert result["active_profile"] == "strict_srp_avdecc"
    assert result["enabled"] is True
    assert result["interface"] == "eth3"
    assert result["failover"]["policy"] == "round_robin"
    assert result["failover"]["interfaces"] == ["eth3", "eth4"]
    assert result["flags"]["srp_required"] is True
    assert result["flags"]["avdecc_enabled"] is True
    assert {profile["profile"] for profile in result["profiles"]} >= {
        "default",
        "strict_srp",
        "avdecc_enabled",
        "strict_srp_avdecc",
    }


def test_route_get_avb_status_includes_compatibility(monkeypatch):
    class _PtpMonitor:
        async def get_status(self):
            return SimpleNamespace(to_dict=lambda: {"available": True, "state": "MASTER"})

    monkeypatch.setattr(avb_routes, "get_ptp_monitor", lambda: _PtpMonitor())
    monkeypatch.setattr(avb_routes, "is_avb_available", lambda: True)

    def _config_get(key, default=None):
        overrides = {
            "avb.enabled": True,
            "avb.interface": "eth0",
            "avb.srp.enabled": False,
            "avb.srp.required": False,
            "avb.avdecc_enabled": False,
        }
        return overrides.get(key, default)

    monkeypatch.setattr(avb_routes, "config_get", _config_get)

    result = asyncio.run(avb_routes.get_avb_status())

    assert "compatibility" in result
    assert result["compatibility"]["active_profile"] == "default"


def test_get_device_inventory_normalizes_engine_payloads():
    service = AvbService()

    class _Engine:
        def get_avb_device_names(self):
            return ["  AVB Talker [eth0]  ", "AVB Listener [eth0]", "AVB Talker [eth0]"]

        def get_avb_discovered_devices(self):
            return [
                {
                    "endpointId": "b:2",
                    "deviceName": "Device-B",
                    "direction": "talker",
                    "deviceType": "map2",
                    "channels": "2",
                    "sampleRate": "48000",
                    "available": True,
                },
                {
                    "endpoint_id": "a:1",
                    "device_name": "Device-A",
                    "direction": "invalid",
                    "device_type": "unexpected",
                    "channels": 0,
                    "sample_rate": -1,
                    "available": False,
                },
            ]

    service.set_engine(_Engine())

    assert service.get_device_names() == ["AVB Listener [eth0]", "AVB Talker [eth0]"]

    discovered = service.get_discovered_devices()
    assert [d["endpoint_id"] for d in discovered] == ["a:1", "b:2"]
    assert discovered[0]["direction"] == "listener"
    assert discovered[0]["device_type"] == "unknown"
    assert discovered[0]["channels"] == 1
    assert discovered[0]["sample_rate"] == 1
    assert discovered[1]["direction"] == "talker"
    assert discovered[1]["device_type"] == "map2"
    assert discovered[1]["sample_rate"] == 48000


def test_route_get_avb_devices_returns_inventory(monkeypatch):
    class _Service:
        def is_available(self):
            return True

        def get_device_names(self):
            return ["AVB Listener [eth0]", "AVB Talker [eth0]"]

        def get_discovered_devices(self):
            return [
                {
                    "endpoint_id": "0011223344556677:1",
                    "device_name": "AVB Talker [node::0011223344556677:1]",
                    "direction": "talker",
                    "device_type": "map2",
                    "node_address": "http://127.0.0.1:8080",
                    "audio_format": "24-bit PCM",
                    "channels": 2,
                    "sample_rate": 48000,
                    "available": True,
                }
            ]

    monkeypatch.setattr(avb_service_module, "get_avb_service", lambda: _Service())

    result = asyncio.run(avb_routes.get_avb_devices())

    assert result["available"] is True
    assert result["count"] == 2
    assert result["discovered_count"] == 1
    assert result["device_names"] == ["AVB Listener [eth0]", "AVB Talker [eth0]"]
    assert result["discovered_devices"][0]["endpoint_id"] == "0011223344556677:1"
