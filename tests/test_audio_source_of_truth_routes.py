import asyncio
from dataclasses import dataclass

from app.routes import audio as audio_routes


class _AudioServiceStub:
    def __init__(self, *, available: bool, sample_rate: int, buffer_size: int, running: bool):
        self.is_available = available
        self._sample_rate = sample_rate
        self._buffer_size = buffer_size
        self._running = running
        self._engine = object()

    def get_system_info(self):
        return {
            "sample_rate": self._sample_rate,
            "buffer_size": self._buffer_size,
            "cpu_load": 12.5,
            "audio_device": "Edirol UA-1000",
        }

    def is_audio_running(self):
        return self._running


@dataclass
class _PipeWireSettingsStub:
    clock_rate: int
    clock_force_rate: int
    clock_quantum: int
    clock_force_quantum: int
    clock_min_quantum: int
    clock_max_quantum: int
    clock_allowed_rates: list[int]


class _PipeWireServiceStub:
    def __init__(self, settings: _PipeWireSettingsStub):
        self._settings = settings

    async def get_settings(self):
        return self._settings


class _PTPStatusStub:
    def __init__(self, payload):
        self._payload = payload

    def to_dict(self):
        return dict(self._payload)


class _PTPMonitorStub:
    def __init__(self, payload):
        self._payload = payload

    async def get_status(self):
        return _PTPStatusStub(self._payload)


def _config_get_factory(values):
    def _config_get(key, default=None):
        return values.get(key, default)

    return _config_get


def test_source_of_truth_reports_aligned_configuration(monkeypatch):
    config_values = {
        "clock_sync.selected_profile": "dual_locked_48k",
        "clock_sync.profile_version": "1.0.0",
        "clock_sync.clock_master": "hybrid",
        "clock_sync.engine_rate_hz": 48000,
        "clock_sync.avb_stream_rate_hz": 48000,
        "clock_sync.spdif_rate_hz": 48000,
        "clock_sync.bits_per_sample": 24,
        "clock_sync.buffer_size_samples": 64,
        "clock_sync.allowed_rates_hz": [48000],
        "clock_sync.require_hard_lock": True,
        "clock_sync.allow_resampler": False,
        "clock_sync.remarks": ["profile ok"],
        "spdif.enabled": True,
        "spdif.device": "Lexicon MPX1",
        "spdif.transport_mode": "send_return",
        "spdif.allow_resampler": False,
        "spdif.require_hard_lock": True,
        "spdif.remarks": ["spdif mapped"],
        "avb.enabled": True,
        "avb.interface": "enp11s0",
        "avb.auto_connect": True,
        "avb.ptp_domain": 0,
        "avb.max_streams": 8,
    }

    monkeypatch.setattr(audio_routes, "get_audio_engine", lambda: _AudioServiceStub(
        available=True,
        sample_rate=48000,
        buffer_size=64,
        running=True,
    ))
    monkeypatch.setattr("app.config.config_get", _config_get_factory(config_values))
    monkeypatch.setattr(
        "app.services.pipewire_service.get_pipewire_service",
        lambda: _PipeWireServiceStub(
            _PipeWireSettingsStub(
                clock_rate=48000,
                clock_force_rate=48000,
                clock_quantum=64,
                clock_force_quantum=64,
                clock_min_quantum=32,
                clock_max_quantum=2048,
                clock_allowed_rates=[48000],
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.avb.get_avb_readiness",
        lambda engine=None: {
            "available": True,
            "state": "operational",
            "reason": None,
        },
    )
    monkeypatch.setattr(
        "app.services.avb.ptp_monitor.get_ptp_monitor",
        lambda: _PTPMonitorStub({"available": True, "state": "SLAVE", "offset_ns": 25.0}),
    )

    payload = asyncio.run(audio_routes.get_audio_source_of_truth())

    assert payload["status"] == "aligned"
    assert payload["profile"]["selected_profile"] == "dual_locked_48k"
    assert payload["runtime"]["pipewire"]["effective_rate_hz"] == 48000
    assert payload["runtime"]["pipewire"]["effective_quantum_samples"] == 64
    assert payload["runtime"]["avb"]["state"] == "operational"
    assert payload["consistency"]["issue_count"] == 0


def test_source_of_truth_reports_drift_and_lock_issues(monkeypatch):
    config_values = {
        "clock_sync.selected_profile": "spdif_master_48k",
        "clock_sync.clock_master": "spdif",
        "clock_sync.engine_rate_hz": 48000,
        "clock_sync.avb_stream_rate_hz": 44100,
        "clock_sync.spdif_rate_hz": 44100,
        "clock_sync.bits_per_sample": 24,
        "clock_sync.buffer_size_samples": 64,
        "clock_sync.allowed_rates_hz": [48000],
        "clock_sync.require_hard_lock": True,
        "clock_sync.allow_resampler": False,
        "spdif.enabled": True,
        "spdif.allow_resampler": False,
        "spdif.require_hard_lock": True,
        "avb.enabled": True,
        "avb.interface": "enp11s0",
        "avb.auto_connect": True,
    }

    monkeypatch.setattr(audio_routes, "get_audio_engine", lambda: _AudioServiceStub(
        available=True,
        sample_rate=44100,
        buffer_size=128,
        running=True,
    ))
    monkeypatch.setattr("app.config.config_get", _config_get_factory(config_values))
    monkeypatch.setattr(
        "app.services.pipewire_service.get_pipewire_service",
        lambda: _PipeWireServiceStub(
            _PipeWireSettingsStub(
                clock_rate=44100,
                clock_force_rate=44100,
                clock_quantum=128,
                clock_force_quantum=128,
                clock_min_quantum=32,
                clock_max_quantum=2048,
                clock_allowed_rates=[44100],
            )
        ),
    )
    monkeypatch.setattr(
        "app.services.avb.get_avb_readiness",
        lambda engine=None: {
            "available": False,
            "state": "degraded",
            "reason": "ptp4l is not running",
        },
    )
    monkeypatch.setattr(
        "app.services.avb.ptp_monitor.get_ptp_monitor",
        lambda: _PTPMonitorStub({"available": True, "state": "LISTENING", "offset_ns": None}),
    )

    payload = asyncio.run(audio_routes.get_audio_source_of_truth())

    issue_ids = {issue["id"] for issue in payload["consistency"]["issues"]}

    assert payload["status"] == "error"
    assert "engine_rate_mismatch" in issue_ids
    assert "pipewire_rate_mismatch" in issue_ids
    assert "spdif_rate_map_mismatch" in issue_ids
    assert "avb_rate_map_mismatch" in issue_ids
    assert "avb_not_operational" in issue_ids
    assert "ptp_not_locked" in issue_ids
