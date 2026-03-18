"""
Audio Route Handlers
API endpoints for audio control and status.
Integrated with JUCE audio engine service.
Includes new audio health monitoring endpoints.
"""

import asyncio
import json
import logging
import os
import subprocess
import threading
import time
from dataclasses import asdict
from datetime import datetime, timezone

try:
    from fastapi import APIRouter, HTTPException, Query
    from typing import Dict, Any, Optional, List
    from app.services.api_readiness import ensure_audio_route_ready
    from app.services.engine_runtime_facade import get_engine_service

    logger = logging.getLogger(__name__)

    # Import new audio health monitoring
    try:
        from app.services.audio_health_monitor import get_audio_health_monitor, init_audio_health_monitor
        from app.services.audio_io_v2 import AudioIOFactory, BUFFER_PRESETS
        AUDIO_HEALTH_AVAILABLE = True
    except ImportError:
        AUDIO_HEALTH_AVAILABLE = False

    # Import plugin health tracking
    try:
        from app.services.plugin_health import get_plugin_health_tracker
        PLUGIN_HEALTH_AVAILABLE = True
    except ImportError:
        PLUGIN_HEALTH_AVAILABLE = False

    router = APIRouter(prefix="/api/audio", tags=["audio"])

    def _coerce_int(raw_value: Any, default: int) -> int:
        try:
            return int(raw_value)
        except Exception:
            return default

    def _coerce_float(raw_value: Any, default: float) -> float:
        try:
            return float(raw_value)
        except Exception:
            return default

    def _normalize_rate_list(raw_value: Any, fallback: List[int]) -> List[int]:
        if not isinstance(raw_value, list):
            return list(fallback)

        normalized: List[int] = []
        seen: set[int] = set()
        for item in raw_value:
            try:
                rate = int(item)
            except Exception:
                continue
            if rate <= 0 or rate in seen:
                continue
            normalized.append(rate)
            seen.add(rate)

        return normalized or list(fallback)

    def _append_issue(
        issues: List[Dict[str, Any]],
        *,
        issue_id: str,
        severity: str,
        message: str,
        expected: Any = None,
        actual: Any = None,
    ) -> None:
        payload: Dict[str, Any] = {
            "id": issue_id,
            "severity": severity,
            "message": message,
        }
        if expected is not None:
            payload["expected"] = expected
        if actual is not None:
            payload["actual"] = actual
        issues.append(payload)

    _AUDIO_LEVELS_CACHE_TTL_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_LEVELS_CACHE_TTL_SECONDS", "0.20"),
        0.20,
    )
    _AUDIO_LEVELS_TIMEOUT_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_LEVELS_TIMEOUT_SECONDS", "0.04"),
        0.04,
    )
    _AUDIO_PLUGIN_LEVELS_CACHE_TTL_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_PLUGIN_LEVELS_CACHE_TTL_SECONDS", "0.25"),
        0.25,
    )
    _AUDIO_PLUGIN_LEVELS_TIMEOUT_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_PLUGIN_LEVELS_TIMEOUT_SECONDS", "0.06"),
        0.06,
    )
    _AUDIO_LATENCY_CACHE_TTL_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_LATENCY_CACHE_TTL_SECONDS", "0.50"),
        0.50,
    )
    _AUDIO_STATUS_CACHE_TTL_SECONDS = _coerce_float(
        os.getenv("MAP2_AUDIO_STATUS_CACHE_TTL_SECONDS", "0.20"),
        0.20,
    )
    _audio_levels_cache: Optional[Dict[str, Any]] = None
    _audio_levels_cache_at = 0.0
    _audio_levels_cache_lock = threading.Lock()
    _audio_levels_refresh_lock: Optional[asyncio.Lock] = None

    _audio_plugin_levels_cache: Optional[List[Dict[str, Any]]] = None
    _audio_plugin_levels_cache_at = 0.0
    _audio_plugin_levels_cache_lock = threading.Lock()
    _audio_plugin_levels_refresh_lock: Optional[asyncio.Lock] = None
    _audio_latency_cache: Optional[Dict[str, Any]] = None
    _audio_latency_cache_at = 0.0
    _audio_latency_cache_lock = threading.Lock()
    _audio_status_cache: Optional[Dict[str, Any]] = None
    _audio_status_cache_at = 0.0
    _audio_status_cache_lock = threading.Lock()

    def _get_audio_levels_refresh_lock() -> asyncio.Lock:
        global _audio_levels_refresh_lock
        lock = _audio_levels_refresh_lock
        if lock is None:
            lock = asyncio.Lock()
            _audio_levels_refresh_lock = lock
        return lock

    def _get_audio_plugin_levels_refresh_lock() -> asyncio.Lock:
        global _audio_plugin_levels_refresh_lock
        lock = _audio_plugin_levels_refresh_lock
        if lock is None:
            lock = asyncio.Lock()
            _audio_plugin_levels_refresh_lock = lock
        return lock

    async def _refresh_audio_levels_cache(service) -> None:
        global _audio_levels_cache, _audio_levels_cache_at
        lock = _get_audio_levels_refresh_lock()
        if lock.locked():
            return
        async with lock:
            try:
                levels = await asyncio.wait_for(
                    service.get_vu_levels(),
                    timeout=_AUDIO_LEVELS_TIMEOUT_SECONDS,
                )
            except Exception:
                return
            if isinstance(levels, dict):
                with _audio_levels_cache_lock:
                    _audio_levels_cache = dict(levels)
                    _audio_levels_cache_at = time.monotonic()

    async def _refresh_audio_plugin_levels_cache(service) -> None:
        global _audio_plugin_levels_cache, _audio_plugin_levels_cache_at
        lock = _get_audio_plugin_levels_refresh_lock()
        if lock.locked():
            return
        async with lock:
            try:
                levels = await asyncio.wait_for(
                    service.get_plugin_vu_levels(),
                    timeout=_AUDIO_PLUGIN_LEVELS_TIMEOUT_SECONDS,
                )
            except Exception:
                return
            if isinstance(levels, list):
                with _audio_plugin_levels_cache_lock:
                    _audio_plugin_levels_cache = list(levels)
                    _audio_plugin_levels_cache_at = time.monotonic()

    @router.get("/status")
    async def get_audio_status_route():
        """Get audio engine status from JUCE."""
        ensure_audio_route_ready("/api/audio/status")
        global _audio_status_cache, _audio_status_cache_at
        service = get_engine_service()
        from app.services.audio_health_monitor import get_audio_health_monitor

        if not service.is_available:
            return {
                "running": False,
                "error": "JUCE audio engine not available",
                "sample_rate": 0,
                "buffer_size": 0,
                "cpu_load": 0.0,
                "engine": "juce",
                "available": False
            }

        now = time.monotonic()
        with _audio_status_cache_lock:
            if (
                _audio_status_cache is not None
                and (now - _audio_status_cache_at) < _AUDIO_STATUS_CACHE_TTL_SECONDS
            ):
                return dict(_audio_status_cache)

        try:
            info = await asyncio.wait_for(
                asyncio.to_thread(service.get_system_info),
                timeout=0.05,
            )
        except Exception:
            with _audio_status_cache_lock:
                stale = dict(_audio_status_cache) if _audio_status_cache is not None else None
            if stale is not None:
                stale["stale"] = True
                return stale
            info = {}

        health_summary = get_audio_health_monitor().get_summary()

        payload = {
            "running": service.is_audio_running(),
            "sample_rate": info.get("sample_rate", 48000),
            "buffer_size": info.get("buffer_size", 128),
            "cpu_load": info.get("cpu_load", 0.0),
            "engine": "juce",
            "version": info.get("version", "unknown"),
            "plugin_count": info.get("plugin_count", 0),
            "active_pedalboard": info.get("active_pedalboard", None),
            "available": True,
            "total_xruns": health_summary.get("total_xruns"),
            "xrun_rate_per_minute": health_summary.get("xrun_rate_per_minute"),
            "thread_state": health_summary.get("thread_state"),
            "signal_state": health_summary.get("signal_state"),
            "buffer_health_pct": health_summary.get("buffer_health_pct"),
            "latency_ms": health_summary.get("latency_ms"),
        }
        with _audio_status_cache_lock:
            _audio_status_cache = dict(payload)
            _audio_status_cache_at = time.monotonic()
        return payload

    @router.get("/node-summary")
    async def get_audio_node_summary():
        """Lightweight status for cluster scraping."""
        service = get_engine_service()
        from app.services.audio_health_monitor import get_audio_health_monitor

        health = get_audio_health_monitor().get_summary()
        status = {
            "running": service.is_audio_running(),
            "sample_rate": health.get("sample_rate"),
            "buffer_size": health.get("block_size") or 0,
            "cpu_load": None,
            "total_xruns": health.get("total_xruns"),
            "xrun_rate_per_minute": health.get("xrun_rate_per_minute"),
            "thread_state": health.get("thread_state"),
            "signal_state": health.get("signal_state"),
            "buffer_health_pct": health.get("buffer_health_pct"),
            "latency_ms": health.get("latency_ms"),
        }
        return status

    @router.get("/source-of-truth")
    async def get_audio_source_of_truth() -> Dict[str, Any]:
        """
        Single Source of Truth for bitrate and audio configuration.

        This endpoint intentionally combines config intent and runtime state from
        JUCE + PipeWire + AVB so `/engine` can display one canonical map and
        identify drift/mismatches quickly.
        """
        from app.config import config_get
        from app.services.avb import get_avb_readiness

        service = get_engine_service()
        info = service.get_system_info() if service.is_available else {}

        selected_profile = str(
            config_get("clock_sync.selected_profile", config_get("audio.sync_profile", "legacy_fixed_48k"))
        )
        profile_version = str(config_get("clock_sync.profile_version", "") or "")
        clock_master = str(config_get("clock_sync.clock_master", config_get("audio.clock_master", "internal")) or "internal")

        engine_rate_hz = _coerce_int(
            config_get("clock_sync.engine_rate_hz", config_get("audio.sample_rate", 48000)),
            48000,
        )
        avb_stream_rate_hz = _coerce_int(
            config_get("clock_sync.avb_stream_rate_hz", engine_rate_hz),
            engine_rate_hz,
        )
        spdif_rate_hz = _coerce_int(
            config_get("clock_sync.spdif_rate_hz", config_get("spdif.sample_rate_hz", engine_rate_hz)),
            engine_rate_hz,
        )
        bits_per_sample = _coerce_int(
            config_get("clock_sync.bits_per_sample", config_get("audio.bits_per_sample", 24)),
            24,
        )
        buffer_size_samples = _coerce_int(
            config_get("clock_sync.buffer_size_samples", config_get("audio.buffer_size", 64)),
            64,
        )
        allowed_rates_hz = _normalize_rate_list(
            config_get("clock_sync.allowed_rates_hz", config_get("audio.allowed_rates_hz", [engine_rate_hz])),
            [engine_rate_hz],
        )

        strict_lock = bool(config_get("clock_sync.require_hard_lock", config_get("spdif.require_hard_lock", True)))
        allow_resampler = bool(config_get("clock_sync.allow_resampler", config_get("spdif.allow_resampler", False)))

        runtime_sample_rate_hz = _coerce_int(info.get("sample_rate", 0), 0)
        runtime_buffer_size_samples = _coerce_int(info.get("buffer_size", 0), 0)
        runtime_cpu_load = _coerce_float(info.get("cpu_load", 0.0), 0.0)

        pipewire_runtime: Dict[str, Any] = {
            "available": False,
            "clock_rate_hz": 0,
            "clock_force_rate_hz": 0,
            "clock_quantum_samples": 0,
            "clock_force_quantum_samples": 0,
            "clock_allowed_rates_hz": [],
            "effective_rate_hz": 0,
            "effective_quantum_samples": 0,
        }
        try:
            from app.services.pipewire_service import get_pipewire_service

            pipewire_settings = await get_pipewire_service().get_settings()
            settings = asdict(pipewire_settings)
            pipewire_runtime = {
                "available": True,
                "clock_rate_hz": _coerce_int(settings.get("clock_rate", 0), 0),
                "clock_force_rate_hz": _coerce_int(settings.get("clock_force_rate", 0), 0),
                "clock_quantum_samples": _coerce_int(settings.get("clock_quantum", 0), 0),
                "clock_force_quantum_samples": _coerce_int(settings.get("clock_force_quantum", 0), 0),
                "clock_allowed_rates_hz": _normalize_rate_list(settings.get("clock_allowed_rates", []), []),
                "effective_rate_hz": _coerce_int(settings.get("clock_force_rate", 0), 0)
                or _coerce_int(settings.get("clock_rate", 0), 0),
                "effective_quantum_samples": _coerce_int(settings.get("clock_force_quantum", 0), 0)
                or _coerce_int(settings.get("clock_quantum", 0), 0),
            }
        except Exception as exc:
            pipewire_runtime["error"] = str(exc)

        avb_readiness = get_avb_readiness(engine=service.engine)
        avb_runtime: Dict[str, Any] = {
            "enabled": bool(config_get("avb.enabled", False)),
            "interface": str(config_get("avb.interface", "") or "").strip(),
            "auto_connect": bool(config_get("avb.auto_connect", True)),
            "available": bool(avb_readiness.get("available", False)),
            "state": str(avb_readiness.get("state", "disabled") or "disabled"),
            "reason": avb_readiness.get("reason"),
            "ptp": {"available": False},
        }

        try:
            from app.services.avb.ptp_monitor import get_ptp_monitor

            ptp_status = await get_ptp_monitor().get_status()
            avb_runtime["ptp"] = ptp_status.to_dict() if hasattr(ptp_status, "to_dict") else {}
        except Exception as exc:
            avb_runtime["ptp"] = {"available": False, "error": str(exc)}

        issues: List[Dict[str, Any]] = []
        checks: Dict[str, bool] = {}

        engine_available = bool(service.is_available)
        checks["engine_available"] = engine_available
        if not engine_available:
            _append_issue(
                issues,
                issue_id="engine_unavailable",
                severity="error",
                message="JUCE audio engine is unavailable; runtime rate cannot be verified.",
            )
        else:
            engine_rate_match = runtime_sample_rate_hz == engine_rate_hz
            checks["engine_rate_match"] = engine_rate_match
            if not engine_rate_match:
                _append_issue(
                    issues,
                    issue_id="engine_rate_mismatch",
                    severity="error" if strict_lock else "warning",
                    message="JUCE runtime sample rate differs from selected profile.",
                    expected=engine_rate_hz,
                    actual=runtime_sample_rate_hz,
                )

            engine_buffer_match = runtime_buffer_size_samples == buffer_size_samples
            checks["engine_buffer_match"] = engine_buffer_match
            if not engine_buffer_match:
                _append_issue(
                    issues,
                    issue_id="engine_buffer_mismatch",
                    severity="warning",
                    message="JUCE runtime buffer size differs from selected profile.",
                    expected=buffer_size_samples,
                    actual=runtime_buffer_size_samples,
                )

        pipewire_available = bool(pipewire_runtime.get("available", False))
        checks["pipewire_available"] = pipewire_available
        if not pipewire_available:
            _append_issue(
                issues,
                issue_id="pipewire_unavailable",
                severity="warning",
                message="PipeWire settings unavailable; lock verification is partial.",
            )
        else:
            pw_rate_match = _coerce_int(pipewire_runtime.get("effective_rate_hz", 0), 0) == engine_rate_hz
            checks["pipewire_rate_match"] = pw_rate_match
            if not pw_rate_match:
                _append_issue(
                    issues,
                    issue_id="pipewire_rate_mismatch",
                    severity="error" if strict_lock else "warning",
                    message="PipeWire effective rate differs from selected profile.",
                    expected=engine_rate_hz,
                    actual=pipewire_runtime.get("effective_rate_hz"),
                )

            pw_quantum_match = _coerce_int(pipewire_runtime.get("effective_quantum_samples", 0), 0) == buffer_size_samples
            checks["pipewire_quantum_match"] = pw_quantum_match
            if not pw_quantum_match:
                _append_issue(
                    issues,
                    issue_id="pipewire_quantum_mismatch",
                    severity="warning",
                    message="PipeWire effective quantum differs from selected profile.",
                    expected=buffer_size_samples,
                    actual=pipewire_runtime.get("effective_quantum_samples"),
                )

            configured_rates = set(allowed_rates_hz)
            pipewire_rates = set(_normalize_rate_list(pipewire_runtime.get("clock_allowed_rates_hz", []), []))
            allowed_rates_match = configured_rates.issubset(pipewire_rates) if configured_rates else True
            checks["pipewire_allowed_rates_match"] = allowed_rates_match
            if not allowed_rates_match:
                _append_issue(
                    issues,
                    issue_id="pipewire_allowed_rates_mismatch",
                    severity="warning",
                    message="PipeWire allowed-rates list does not include all profile rates.",
                    expected=sorted(configured_rates),
                    actual=sorted(pipewire_rates),
                )

        spdif_enabled = bool(config_get("spdif.enabled", False))
        spdif_rate_match = (spdif_rate_hz == engine_rate_hz) or allow_resampler
        checks["spdif_rate_map_match"] = spdif_rate_match
        if spdif_enabled and not spdif_rate_match:
            _append_issue(
                issues,
                issue_id="spdif_rate_map_mismatch",
                severity="error" if strict_lock else "warning",
                message="Configured S/PDIF rate does not map to engine rate.",
                expected=engine_rate_hz,
                actual=spdif_rate_hz,
            )

        avb_enabled = bool(config_get("avb.enabled", False))
        avb_rate_match = avb_stream_rate_hz == engine_rate_hz
        checks["avb_rate_map_match"] = avb_rate_match
        if avb_enabled and not avb_rate_match:
            _append_issue(
                issues,
                issue_id="avb_rate_map_mismatch",
                severity="error" if strict_lock else "warning",
                message="Configured AVB stream rate does not map to engine rate.",
                expected=engine_rate_hz,
                actual=avb_stream_rate_hz,
            )

        checks["bits_per_sample_valid"] = bits_per_sample in {16, 20, 24, 32}
        if not checks["bits_per_sample_valid"]:
            _append_issue(
                issues,
                issue_id="bits_per_sample_invalid",
                severity="error",
                message="Bit-depth is outside supported digital transport values (16/20/24/32).",
                actual=bits_per_sample,
            )

        if avb_enabled and not avb_runtime["available"]:
            _append_issue(
                issues,
                issue_id="avb_not_operational",
                severity="warning",
                message="AVB is enabled but readiness is not operational.",
                actual=avb_runtime.get("reason") or avb_runtime.get("state"),
            )

        if avb_enabled and bool(avb_runtime.get("ptp", {}).get("available")):
            ptp_state = str(avb_runtime["ptp"].get("state", "") or "")
            checks["ptp_lock_state_valid"] = ptp_state in {"SLAVE", "MASTER"}
            if not checks["ptp_lock_state_valid"]:
                _append_issue(
                    issues,
                    issue_id="ptp_not_locked",
                    severity="warning",
                    message="PTP state is not SLAVE/MASTER; AVB clock lock may be incomplete.",
                    actual=ptp_state or "unknown",
                )

        severity_rank = {"info": 0, "warning": 1, "error": 2}
        highest = max((severity_rank.get(issue.get("severity", "info"), 0) for issue in issues), default=0)
        status = "aligned" if highest == 0 else "warning" if highest == 1 else "error"

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "profile": {
                "selected_profile": selected_profile,
                "profile_version": profile_version,
                "clock_master": clock_master,
                "remarks": config_get("clock_sync.remarks", []),
            },
            "configured": {
                "engine_rate_hz": engine_rate_hz,
                "avb_stream_rate_hz": avb_stream_rate_hz,
                "spdif_rate_hz": spdif_rate_hz,
                "buffer_size_samples": buffer_size_samples,
                "bits_per_sample": bits_per_sample,
                "allowed_rates_hz": allowed_rates_hz,
                "require_hard_lock": strict_lock,
                "allow_resampler": allow_resampler,
                "spdif": {
                    "enabled": spdif_enabled,
                    "device": config_get("spdif.device", "Lexicon MPX1"),
                    "transport_mode": config_get("spdif.transport_mode", "send_return"),
                    "allow_resampler": bool(config_get("spdif.allow_resampler", False)),
                    "require_hard_lock": bool(config_get("spdif.require_hard_lock", True)),
                    "remarks": config_get("spdif.remarks", []),
                },
                "avb": {
                    "enabled": avb_enabled,
                    "interface": str(config_get("avb.interface", "") or "").strip(),
                    "auto_connect": bool(config_get("avb.auto_connect", True)),
                    "ptp_domain": _coerce_int(config_get("avb.ptp_domain", 0), 0),
                    "max_streams": _coerce_int(config_get("avb.max_streams", 8), 8),
                },
            },
            "runtime": {
                "engine": {
                    "available": engine_available,
                    "running": bool(service.is_audio_running() if service.is_available else False),
                    "sample_rate_hz": runtime_sample_rate_hz,
                    "buffer_size_samples": runtime_buffer_size_samples,
                    "cpu_load_percent": runtime_cpu_load,
                    "audio_device": str(info.get("audio_device") or info.get("alsa_device") or ""),
                },
                "pipewire": pipewire_runtime,
                "avb": avb_runtime,
            },
            "consistency": {
                "checks": checks,
                "issues": issues,
                "issue_count": len(issues),
            },
        }

    @router.post("/start")
    async def start_audio_route():
        """Start JUCE audio processing."""
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        # Initialize engine first if not already initialized
        if not service.is_running:
            init_success = await service.initialize()
            if not init_success:
                raise HTTPException(status_code=500, detail="Failed to initialize audio engine")

        success = await service.start_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to start audio")

        return {"success": True, "message": "JUCE audio started"}

    @router.post("/stop")
    async def stop_audio_route():
        """Stop JUCE audio processing."""
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        success = await service.stop_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to stop audio")

        return {"success": True, "message": "JUCE audio stopped"}

    @router.get("/latency")
    async def get_latency():
        """Get audio latency in milliseconds."""
        ensure_audio_route_ready("/api/audio/latency")
        global _audio_latency_cache, _audio_latency_cache_at
        service = get_engine_service()

        if not service.is_available:
            return {"latency_ms": 0.0}

        now = time.monotonic()
        with _audio_latency_cache_lock:
            if (
                _audio_latency_cache is not None
                and (now - _audio_latency_cache_at) < _AUDIO_LATENCY_CACHE_TTL_SECONDS
            ):
                return dict(_audio_latency_cache)

        try:
            info = await asyncio.wait_for(
                asyncio.to_thread(service.get_system_info),
                timeout=0.05,
            )
        except Exception:
            with _audio_latency_cache_lock:
                stale = dict(_audio_latency_cache) if _audio_latency_cache is not None else None
            if stale is not None:
                stale["stale"] = True
                return stale
            info = {}
        # Calculate latency from buffer size and sample rate
        buffer_size = info.get("buffer_size", 128)
        sample_rate = info.get("sample_rate", 48000)
        latency_ms = (buffer_size / sample_rate) * 1000.0 if sample_rate > 0 else 0.0

        payload = {"latency_ms": latency_ms}
        with _audio_latency_cache_lock:
            _audio_latency_cache = dict(payload)
            _audio_latency_cache_at = time.monotonic()
        return payload

    @router.get("/pipedal")
    async def get_pipedal_metrics():
        """Get PiPedal-style audio metrics (CPU load, xruns, etc.)."""
        service = get_engine_service()

        if not service.is_available:
            return {
                "cpu_load": 0.0,
                "xruns": 0,
                "underruns": 0,
                "overruns": 0,
                "running": False,
                "available": False
            }

        info = service.get_system_info()

        # Get CPU load from engine
        cpu_load = info.get("cpu_load", 0.0)
        if isinstance(cpu_load, str):
            try:
                cpu_load = float(cpu_load.replace('%', ''))
            except Exception:
                cpu_load = 0.0

        return {
            "cpu_load": cpu_load,
            "xruns": info.get("xruns", 0),
            "underruns": info.get("underruns", 0),
            "overruns": info.get("overruns", 0),
            "running": service.is_audio_running(),
            "available": service.is_available,
            "sample_rate": info.get("sample_rate", 48000),
            "buffer_size": info.get("buffer_size", 256)
        }

    @router.get("/levels")
    async def get_levels():
        """Get current audio levels from JUCE VU meters."""
        ensure_audio_route_ready("/api/audio/levels")
        global _audio_levels_cache, _audio_levels_cache_at
        service = get_engine_service()

        if not service.is_available:
            return {
                "input_left": 0.0,
                "input_right": 0.0,
                "output_left": 0.0,
                "output_right": 0.0
            }

        now = time.monotonic()
        with _audio_levels_cache_lock:
            if (
                _audio_levels_cache is not None
                and (now - _audio_levels_cache_at) < _AUDIO_LEVELS_CACHE_TTL_SECONDS
            ):
                return dict(_audio_levels_cache)

            stale = dict(_audio_levels_cache) if _audio_levels_cache is not None else None

        if stale is not None:
            if not _get_audio_levels_refresh_lock().locked():
                asyncio.create_task(_refresh_audio_levels_cache(service))
            stale["stale"] = True
            return stale

        refresh_lock = _get_audio_levels_refresh_lock()
        if refresh_lock.locked():
            with _audio_levels_cache_lock:
                stale = dict(_audio_levels_cache) if _audio_levels_cache is not None else None
            if stale is not None:
                stale["stale"] = True
                return stale

        async with refresh_lock:
            now = time.monotonic()
            with _audio_levels_cache_lock:
                if (
                    _audio_levels_cache is not None
                    and (now - _audio_levels_cache_at) < _AUDIO_LEVELS_CACHE_TTL_SECONDS
                ):
                    return dict(_audio_levels_cache)

            try:
                levels = await asyncio.wait_for(
                    service.get_vu_levels(),
                    timeout=_AUDIO_LEVELS_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                with _audio_levels_cache_lock:
                    stale = dict(_audio_levels_cache) if _audio_levels_cache is not None else None
                if stale is not None:
                    stale["stale"] = True
                    return stale
                return {
                    "input_left": 0.0,
                    "input_right": 0.0,
                    "output_left": 0.0,
                    "output_right": 0.0,
                    "deferred": True,
                }
            except Exception:
                with _audio_levels_cache_lock:
                    stale = dict(_audio_levels_cache) if _audio_levels_cache is not None else None
                if stale is not None:
                    stale["stale"] = True
                    return stale
                return {
                    "input_left": 0.0,
                    "input_right": 0.0,
                    "output_left": 0.0,
                    "output_right": 0.0,
                    "deferred": True,
                }

            if isinstance(levels, dict):
                with _audio_levels_cache_lock:
                    _audio_levels_cache = dict(levels)
                    _audio_levels_cache_at = time.monotonic()
                return levels
            return levels

    @router.get("/levels/plugins")
    async def get_plugin_levels():
        """Get per-plugin VU levels from JUCE."""
        ensure_audio_route_ready("/api/audio/levels/plugins")
        global _audio_plugin_levels_cache, _audio_plugin_levels_cache_at
        service = get_engine_service()

        if not service.is_available:
            return {"plugins": []}

        now = time.monotonic()
        with _audio_plugin_levels_cache_lock:
            if (
                _audio_plugin_levels_cache is not None
                and (now - _audio_plugin_levels_cache_at) < _AUDIO_PLUGIN_LEVELS_CACHE_TTL_SECONDS
            ):
                return {"plugins": list(_audio_plugin_levels_cache)}

            stale = (
                list(_audio_plugin_levels_cache)
                if _audio_plugin_levels_cache is not None
                else None
            )

        if stale is not None:
            if not _get_audio_plugin_levels_refresh_lock().locked():
                asyncio.create_task(_refresh_audio_plugin_levels_cache(service))
            return {"plugins": stale, "stale": True}

        refresh_lock = _get_audio_plugin_levels_refresh_lock()
        if refresh_lock.locked():
            with _audio_plugin_levels_cache_lock:
                stale = (
                    list(_audio_plugin_levels_cache)
                    if _audio_plugin_levels_cache is not None
                    else None
                )
            if stale is not None:
                return {"plugins": stale, "stale": True}

        async with refresh_lock:
            now = time.monotonic()
            with _audio_plugin_levels_cache_lock:
                if (
                    _audio_plugin_levels_cache is not None
                    and (now - _audio_plugin_levels_cache_at) < _AUDIO_PLUGIN_LEVELS_CACHE_TTL_SECONDS
                ):
                    return {"plugins": list(_audio_plugin_levels_cache)}

            try:
                levels = await asyncio.wait_for(
                    service.get_plugin_vu_levels(),
                    timeout=_AUDIO_PLUGIN_LEVELS_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                with _audio_plugin_levels_cache_lock:
                    stale = (
                        list(_audio_plugin_levels_cache)
                        if _audio_plugin_levels_cache is not None
                        else None
                    )
                if stale is not None:
                    return {"plugins": stale, "stale": True}
                return {"plugins": [], "deferred": True}
            except Exception:
                with _audio_plugin_levels_cache_lock:
                    stale = (
                        list(_audio_plugin_levels_cache)
                        if _audio_plugin_levels_cache is not None
                        else None
                    )
                if stale is not None:
                    return {"plugins": stale, "stale": True}
                return {"plugins": [], "deferred": True}

            if isinstance(levels, list):
                with _audio_plugin_levels_cache_lock:
                    _audio_plugin_levels_cache = list(levels)
                    _audio_plugin_levels_cache_at = time.monotonic()
            return {"plugins": levels}

    @router.get("/juce")
    async def get_juce_metrics():
        """Get JUCE audio engine-specific metrics."""
        service = get_engine_service()

        if not service.is_available:
            return {
                "available": False,
                "error": "JUCE audio engine not available"
            }

        info = service.get_system_info()

        # Get current pedalboard
        pedalboard = await service.get_current_pedalboard()

        return {
            "available": True,
            "running": service.is_audio_running(),
            "version": info.get("version"),
            "sample_rate": info.get("sample_rate"),
            "buffer_size": info.get("buffer_size"),
            "alsa_device": info.get("alsa_device"),
            "plugin_count": info.get("plugin_count"),
            "loaded_plugins": len(pedalboard.get("items", [])),
            "active_pedalboard": pedalboard.get("name"),
            "current_snapshot": info.get("current_snapshot"),
            "cpu_load": info.get("cpu_load", 0.0),
            "underruns": info.get("underruns", 0),
            "midi_enabled": info.get("midi_enabled", False)
        }

    @router.post("/config")
    async def configure_audio(sample_rate: int = None, buffer_size: int = None):
        """
        Configure audio engine settings.

        Args:
            sample_rate: Optional sample rate in Hz (44100, 48000, 96000, 192000)
            buffer_size: Optional buffer size in samples (64, 128, 256, 512, 1024)

        Returns:
            Configuration update status and new settings
        """
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        success = True
        updated_settings = {}

        # Update sample rate if provided
        if sample_rate is not None:
            # Check if sample_rate is locked
            from app.config import get_config
            cfg = get_config()
            if hasattr(cfg, 'is_locked') and cfg.is_locked('audio.sample_rate'):
                raise HTTPException(
                    status_code=403,
                    detail="Sample rate is LOCKED for Tier A performance. Must be changed in systemd service and restart."
                )
            
            supported_rates = [44100, 48000, 96000, 192000]
            if sample_rate not in supported_rates:
                raise HTTPException(status_code=400, detail=f"Unsupported sample rate. Must be one of: {supported_rates}")

            success = await service.set_sample_rate(sample_rate)
            if success:
                updated_settings["sample_rate"] = sample_rate

        # Update buffer size if provided
        if buffer_size is not None:
            # Check if buffer_size is locked
            from app.config import get_config
            cfg = get_config()
            if hasattr(cfg, 'is_locked') and cfg.is_locked('audio.buffer_size'):
                raise HTTPException(
                    status_code=403,
                    detail="Buffer size is LOCKED at 64 samples for <3ms latency. Must be changed in systemd service and restart."
                )
            
            supported_sizes = [64, 128, 256, 512, 1024]
            if buffer_size not in supported_sizes:
                raise HTTPException(status_code=400, detail=f"Unsupported buffer size. Must be one of: {supported_sizes}")

            success = await service.set_buffer_size(buffer_size)
            if success:
                updated_settings["buffer_size"] = buffer_size

        if not success:
            raise HTTPException(status_code=500, detail="Failed to apply configuration changes")

        # Get updated status
        info = service.get_system_info()

        return {
            "success": True,
            "message": "Audio configuration updated",
            "updated_settings": updated_settings,
            "current_config": {
                "sample_rate": info.get("sample_rate", 48000),
                "buffer_size": info.get("buffer_size", 256),
                "cpu_load": info.get("cpu_load", 0.0)
            }
        }

    @router.post("/restart")
    async def restart_audio():
        """
        Restart the audio engine.

        Stops audio processing and restarts the engine.
        This may cause brief audio interruption.

        Returns:
            Restart status and new engine state
        """
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        # Stop audio
        await service.stop_audio()

        # Wait a brief moment
        await asyncio.sleep(0.5)

        # Start audio
        success = await service.start_audio()

        if not success:
            raise HTTPException(status_code=500, detail="Failed to restart audio engine")

        # Get updated status
        info = service.get_system_info()

        return {
            "success": True,
            "message": "Audio engine restarted",
            "running": service.is_audio_running(),
            "status": {
                "sample_rate": info.get("sample_rate", 48000),
                "buffer_size": info.get("buffer_size", 256),
                "cpu_load": info.get("cpu_load", 0.0)
            }
        }

    @router.post("/test")
    async def test_audio():
        """
        Run audio interface diagnostics.

        Tests JUCE audio engine functionality and performance.
        Returns diagnostics results including latency measurement and quality score.

        Returns:
            Test results with latency, sample rate, buffer size, and quality score
        """
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="JUCE audio engine not available")

        # Get current audio info
        info = service.get_system_info()
        
        sample_rate = info.get("sample_rate", 48000)
        buffer_size = info.get("buffer_size", 256)
        cpu_load = info.get("cpu_load", 0.0)
        underruns = info.get("underruns", 0)

        # Calculate latency in milliseconds
        latency_ms = (buffer_size / sample_rate * 1000.0) if sample_rate > 0 else 0.0

        # Calculate quality score (0-100)
        # Scoring logic:
        # - Latency: <5ms = +30, <10ms = +20, <20ms = +10, <40ms = +5
        # - CPU Load: <50% = +30, <70% = +15, <80% = +5
        # - No underruns: +30, Some underruns: +10
        # - Running: +5
        score = 0

        # Latency scoring
        if latency_ms < 5:
            score += 30
        elif latency_ms < 10:
            score += 20
        elif latency_ms < 20:
            score += 10
        elif latency_ms < 40:
            score += 5

        # CPU load scoring
        if cpu_load < 50:
            score += 30
        elif cpu_load < 70:
            score += 15
        elif cpu_load < 80:
            score += 5

        # Underrun scoring
        if underruns == 0:
            score += 30
        elif underruns < 5:
            score += 10

        # Running scoring
        if service.is_audio_running():
            score += 5

        # Ensure score is between 0 and 100
        score = max(0, min(100, score))

        return {
            "success": True,
            "latency_ms": round(latency_ms, 2),
            "sample_rate": sample_rate,
            "buffer_size": buffer_size,
            "cpu_load": cpu_load,
            "underruns": underruns,
            "score": score,
            "status": "healthy" if score >= 80 else "warning" if score >= 50 else "critical"
        }

    # =========================================================================
    # NEW: Audio Health Monitoring Endpoints
    # =========================================================================

    @router.get("/health")
    async def get_audio_health() -> Dict[str, Any]:
        """
        Get comprehensive audio health status.

        Returns:
            Audio health summary including:
            - Thread state (healthy/warning/stalled)
            - Signal state (present/weak/absent)
            - XRun statistics
            - Buffer health
            - Recent alerts
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {
                "available": False,
                "error": "Audio health monitoring not available"
            }

        try:
            monitor = get_audio_health_monitor()
            return monitor.get_audio_health_summary()
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }

    @router.get("/health/alerts")
    async def get_audio_alerts(limit: int = Query(20, ge=1, le=100)) -> Dict[str, Any]:
        """
        Get recent audio alerts.

        Args:
            limit: Maximum number of alerts to return (1-100)

        Returns:
            List of recent audio alerts (XRuns, stalls, signal loss, etc.)
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"alerts": [], "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            alerts = monitor.get_recent_alerts(limit)
            return {
                "alerts": alerts,
                "count": len(alerts)
            }
        except Exception as e:
            return {"alerts": [], "error": str(e)}

    @router.get("/health/xruns")
    async def get_xrun_stats() -> Dict[str, Any]:
        """
        Get XRun (buffer underrun/overrun) statistics.

        Returns:
            XRun counts, rates, and recent events
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"available": False, "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            summary = monitor.get_audio_health_summary()

            return {
                "available": True,
                "total_xruns": summary.get("total_xruns", 0),
                "xrun_rate_per_minute": summary.get("xrun_rate_per_minute", 0),
                "status": "critical" if summary.get("xrun_rate_per_minute", 0) >= 5.0
                         else "warning" if summary.get("xrun_rate_per_minute", 0) >= 1.0
                         else "healthy",
                "thresholds": {
                    "warning": "1.0 XRuns/min",
                    "critical": "5.0 XRuns/min"
                }
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.get("/health/signal")
    async def get_signal_status() -> Dict[str, Any]:
        """
        Get input signal detection status.

        Returns:
            Signal state, level, and auto-mute status
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {"available": False, "error": "Audio health monitoring not available"}

        try:
            monitor = get_audio_health_monitor()
            summary = monitor.get_audio_health_summary()

            return {
                "available": True,
                "signal_state": summary.get("signal_state", "unknown"),
                "input_level_db": summary.get("input_level_db", -96),
                "is_auto_muted": summary.get("is_auto_muted", False),
                "thresholds": {
                    "signal_present": "-40 dB",
                    "weak_signal": "-50 dB",
                    "noise_floor": "-60 dB"
                }
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.post("/health/unmute")
    async def force_unmute() -> Dict[str, Any]:
        """
        Force unmute audio output (override auto-mute).

        Returns:
            Success status
        """
        if not AUDIO_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Audio health monitoring not available")

        try:
            monitor = get_audio_health_monitor()
            if monitor._audio_manager:
                monitor._audio_manager.force_unmute()
                return {"success": True, "message": "Auto-mute disabled"}
            else:
                return {"success": False, "error": "Audio manager not initialized"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/buffer-presets")
    async def get_buffer_presets() -> Dict[str, Any]:
        """
        Get available buffer size presets.

        Returns:
            Dictionary of buffer presets with latency calculations
        """
        if not AUDIO_HEALTH_AVAILABLE:
            return {
                "presets": {
                    "standard": {"size": 256, "latency_ms": 5.3}
                }
            }

        presets = {}
        sample_rate = 48000  # Default

        for name, size in BUFFER_PRESETS.items():
            latency_ms = (size / sample_rate) * 1000
            presets[name] = {
                "size": size,
                "latency_ms": round(latency_ms, 2),
                "description": f"{size} samples @ {sample_rate}Hz"
            }

        return {
            "presets": presets,
            "current_sample_rate": sample_rate
        }

    # =========================================================================
    # NEW: Plugin Health Endpoints
    # =========================================================================

    @router.get("/plugins/health")
    async def get_plugins_health() -> Dict[str, Any]:
        """
        Get health status for all tracked plugins.

        Returns:
            Per-plugin health metrics including:
            - Processing times
            - Error counts
            - RT-safety status
            - Bypass state
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            return {"available": False, "error": "Plugin health tracking not available"}

        try:
            tracker = get_plugin_health_tracker()
            all_health = tracker.get_all_plugin_health()

            return {
                "available": True,
                "plugins": [p for p in all_health if p],
                "total": len(all_health),
                "bypassed_count": len(tracker.get_bypassed_plugins()),
                "unhealthy_count": len(tracker.get_unhealthy_plugins())
            }
        except Exception as e:
            return {"available": False, "error": str(e)}

    @router.get("/plugins/health/{plugin_uri:path}")
    async def get_plugin_health(plugin_uri: str) -> Dict[str, Any]:
        """
        Get health status for a specific plugin.

        Args:
            plugin_uri: Plugin URI to query

        Returns:
            Plugin health metrics
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            health = tracker.get_plugin_health(plugin_uri)

            if health is None:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return health
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/plugins/bypass/{plugin_uri:path}")
    async def bypass_plugin(plugin_uri: str, reason: str = Query("Manual bypass")) -> Dict[str, Any]:
        """
        Manually bypass a plugin.

        Args:
            plugin_uri: Plugin URI to bypass
            reason: Reason for bypass

        Returns:
            Success status
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            success = tracker.manual_bypass(plugin_uri, reason)

            if not success:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return {"success": True, "message": f"Plugin bypassed: {plugin_uri}", "reason": reason}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/plugins/enable/{plugin_uri:path}")
    async def enable_plugin(plugin_uri: str) -> Dict[str, Any]:
        """
        Re-enable a bypassed plugin.

        Args:
            plugin_uri: Plugin URI to re-enable

        Returns:
            Success status
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            raise HTTPException(status_code=503, detail="Plugin health tracking not available")

        try:
            tracker = get_plugin_health_tracker()
            success = tracker.re_enable_plugin(plugin_uri)

            if not success:
                raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_uri}")

            return {"success": True, "message": f"Plugin re-enabled: {plugin_uri}"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/plugins/bypassed")
    async def get_bypassed_plugins() -> Dict[str, Any]:
        """
        Get list of currently bypassed plugins.

        Returns:
            List of bypassed plugin URIs
        """
        if not PLUGIN_HEALTH_AVAILABLE:
            return {"bypassed": [], "error": "Plugin health tracking not available"}

        try:
            tracker = get_plugin_health_tracker()
            bypassed = tracker.get_bypassed_plugins()

            return {
                "bypassed": bypassed,
                "count": len(bypassed)
            }
        except Exception as e:
            return {"bypassed": [], "error": str(e)}

    # =========================================================================
    # ALSA Diagnostics Endpoints
    # =========================================================================

    @router.get("/alsa/info")
    async def get_alsa_info() -> Dict[str, Any]:
        """Get ALSA device information."""

        cards = []
        current_device = "unknown"
        driver = "snd-usb-audio"
        state = "stopped"

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                ["cat", "/proc/asound/cards"],
                capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                i = 0
                while i < len(lines):
                    line = lines[i].strip()
                    if line and line[0].isdigit():
                        parts = line.split('[')
                        if len(parts) >= 2:
                            card_id = int(parts[0].strip())
                            card_name = parts[1].split(']')[0].strip() if ']' in parts[1] else parts[1].strip()
                            driver_name = "unknown"
                            if i + 1 < len(lines):
                                driver_line = lines[i + 1].strip()
                                driver_name = driver_line.split(' - ')[0].strip() if ' - ' in driver_line else driver_line
                            cards.append({
                                "id": card_id,
                                "name": card_name,
                                "driver": driver_name,
                                "devices": []
                            })
                    i += 1

            service = get_engine_service()
            if service.is_available and service.is_audio_running():
                state = "running"
                info = service.get_system_info()
                current_device = info.get("alsa_device", "hw:0,0")
        except Exception:
            state = "error"

        return {"cards": cards, "current_device": current_device, "driver": driver, "state": state}

    @router.post("/alsa/reset")
    async def reset_alsa_state() -> Dict[str, Any]:
        """Reset ALSA state."""

        try:
            result = await asyncio.to_thread(subprocess.run, ["alsactl", "restore"], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return {"success": True, "message": "ALSA state restored successfully"}
            result2 = await asyncio.to_thread(subprocess.run, ["alsactl", "init"], capture_output=True, text=True, timeout=10)
            if result2.returncode == 0:
                return {"success": True, "message": "ALSA initialized successfully"}
            return {"success": False, "message": f"ALSA reset failed: {result.stderr or result2.stderr}"}
        except subprocess.TimeoutExpired:
            return {"success": False, "message": "ALSA reset timed out"}
        except FileNotFoundError:
            return {"success": False, "message": "alsactl not found"}
        except Exception as e:
            return {"success": False, "message": f"ALSA reset error: {str(e)}"}

    # =========================================================================
    # Full Diagnostics Endpoint
    # =========================================================================

    @router.post("/diagnostics/full")
    async def run_full_diagnostic() -> Dict[str, Any]:
        """Run full diagnostic suite."""
        from datetime import datetime

        tests = []
        recommendations = []
        overall_status = "pass"
        start_time = datetime.now()
        service = get_engine_service()

        # Test 1: Engine availability
        t1 = datetime.now()
        engine_available = service.is_available
        tests.append({
            "success": engine_available,
            "test_name": "Engine Availability",
            "duration_ms": (datetime.now() - t1).total_seconds() * 1000,
            "xruns_detected": 0,
            "message": "JUCE audio engine is available" if engine_available else "JUCE audio engine not available"
        })
        if not engine_available:
            overall_status = "fail"
            recommendations.append("Check that the JUCE audio engine is properly compiled and installed")

        # Test 2: Audio running state
        t2 = datetime.now()
        is_running = service.is_audio_running() if engine_available else False
        tests.append({
            "success": is_running,
            "test_name": "Audio Running",
            "duration_ms": (datetime.now() - t2).total_seconds() * 1000,
            "xruns_detected": 0,
            "message": "Audio processing is active" if is_running else "Audio processing is stopped"
        })
        if not is_running and engine_available:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append("Start the audio engine to enable processing")

        # Test 3: Latency measurement
        t3 = datetime.now()
        info = service.get_system_info() if engine_available else {}
        buffer_size = info.get("buffer_size", 256)
        sample_rate = info.get("sample_rate", 48000)
        latency_ms = (buffer_size / sample_rate * 1000) if sample_rate > 0 else 0
        latency_ok = latency_ms < 20
        tests.append({
            "success": latency_ok,
            "test_name": "Latency Check",
            "duration_ms": (datetime.now() - t3).total_seconds() * 1000,
            "latency_ms": round(latency_ms, 2),
            "xruns_detected": 0,
            "message": f"Latency is {latency_ms:.2f}ms" + (" (acceptable)" if latency_ok else " (high)")
        })
        if not latency_ok:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append(f"Consider reducing buffer size (current: {buffer_size} samples)")

        # Test 4: CPU load check
        t4 = datetime.now()
        cpu_load = info.get("cpu_load", 0)
        if isinstance(cpu_load, str):
            try:
                cpu_load = float(cpu_load.replace('%', ''))
            except Exception:
                cpu_load = 0
        cpu_ok = cpu_load < 70
        tests.append({
            "success": cpu_ok,
            "test_name": "CPU Load",
            "duration_ms": (datetime.now() - t4).total_seconds() * 1000,
            "quality_score": 1.0 - (cpu_load / 100),
            "xruns_detected": 0,
            "message": f"CPU load is {cpu_load:.1f}%" + (" (healthy)" if cpu_ok else " (high)")
        })
        if not cpu_ok:
            if overall_status == "pass":
                overall_status = "warning"
            recommendations.append("High CPU load - consider disabling some plugins or increasing buffer size")

        # Test 5: XRun check
        t5 = datetime.now()
        underruns = info.get("underruns", 0)
        xruns = info.get("xruns", underruns)
        xrun_ok = xruns < 10
        tests.append({
            "success": xrun_ok,
            "test_name": "XRun Detection",
            "duration_ms": (datetime.now() - t5).total_seconds() * 1000,
            "xruns_detected": xruns,
            "message": f"{xruns} XRuns detected" + (" (acceptable)" if xrun_ok else " (excessive)")
        })
        if not xrun_ok:
            overall_status = "fail" if xruns > 50 else "warning"
            recommendations.append("High XRun count - increase buffer size or check system load")

        if overall_status == "pass" and not recommendations:
            recommendations.append("All diagnostics passed - system is operating normally")

        return {
            "timestamp": start_time.isoformat(),
            "overall_status": overall_status,
            "tests": tests,
            "recommendations": recommendations
        }

    @router.post("/health/xruns/clear")
    async def clear_xruns() -> Dict[str, Any]:
        """Clear the XRun counter."""
        service = get_engine_service()
        if not service.is_available:
            return {"success": False, "error": "Audio engine not available"}
        try:
            if hasattr(service, 'clear_xruns'):
                await service.clear_xruns()
            if AUDIO_HEALTH_AVAILABLE:
                try:
                    monitor = get_audio_health_monitor()
                    if hasattr(monitor, 'reset_xrun_counter'):
                        monitor.reset_xrun_counter()
                except Exception:
                    pass
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @router.post("/test/sample-rate")
    async def test_sample_rate(rate: int = Query(..., description="Sample rate to test")) -> Dict[str, Any]:
        """Test a specific sample rate."""
        from datetime import datetime
        service = get_engine_service()
        test_start = datetime.now()

        if not service.is_available:
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": 0, "xruns_detected": 0, "message": "Audio engine not available"}

        supported_rates = [44100, 48000, 88200, 96000, 192000]
        if rate not in supported_rates:
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": (datetime.now() - test_start).total_seconds() * 1000, "xruns_detected": 0, "message": f"Unsupported sample rate. Supported: {supported_rates}"}

        info = service.get_system_info()
        original_rate = info.get("sample_rate", 48000)

        try:
            success = await service.set_sample_rate(rate)
            duration_ms = (datetime.now() - test_start).total_seconds() * 1000
            if success:
                await service.set_sample_rate(original_rate)
                return {"success": True, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": duration_ms, "xruns_detected": 0, "message": f"Sample rate {rate} Hz is supported"}
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": duration_ms, "xruns_detected": 0, "message": f"Failed to set sample rate to {rate} Hz"}
        except Exception as e:
            try:
                await service.set_sample_rate(original_rate)
            except Exception:
                pass
            return {"success": False, "test_name": f"Sample Rate Test ({rate} Hz)", "duration_ms": (datetime.now() - test_start).total_seconds() * 1000, "xruns_detected": 0, "message": f"Error: {str(e)}"}

    @router.post("/test/buffer-stability")
    async def test_buffer_stability(
        buffer_size: int = Query(..., description="Buffer size to test"),
        duration: int = Query(5, description="Test duration in seconds")
    ) -> Dict[str, Any]:
        """Test buffer stability at a specific buffer size."""
        service = get_engine_service()

        if not service.is_available:
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": "Audio engine not available"}

        supported_sizes = [32, 64, 128, 256, 512, 1024, 2048, 4096]
        if buffer_size not in supported_sizes:
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Unsupported buffer size. Try: {supported_sizes}"}

        info = service.get_system_info()
        original_buffer = info.get("buffer_size", 256)
        initial_xruns = info.get("underruns", 0) + info.get("xruns", 0)
        cpu_samples = []

        try:
            success = await service.set_buffer_size(buffer_size)
            if not success:
                return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Failed to set buffer size to {buffer_size}"}

            sample_interval = 0.25
            samples_needed = int(duration / sample_interval)
            for _ in range(samples_needed):
                await asyncio.sleep(sample_interval)
                current_info = service.get_system_info()
                cpu = current_info.get("cpu_load", 0)
                if isinstance(cpu, str):
                    try:
                        cpu = float(cpu.replace('%', ''))
                    except Exception:
                        cpu = 0
                cpu_samples.append(cpu)

            final_info = service.get_system_info()
            final_xruns = final_info.get("underruns", 0) + final_info.get("xruns", 0)
            xruns_during_test = max(0, final_xruns - initial_xruns)
            await service.set_buffer_size(original_buffer)

            avg_cpu = sum(cpu_samples) / len(cpu_samples) if cpu_samples else 0
            peak_cpu = max(cpu_samples) if cpu_samples else 0
            xrun_penalty = min(xruns_during_test * 0.1, 0.5)
            cpu_penalty = max(0, (avg_cpu - 50) / 100)
            stability_score = max(0, 1.0 - xrun_penalty - cpu_penalty)

            if stability_score >= 0.9 and xruns_during_test == 0:
                recommendation = f"Buffer size {buffer_size} is stable for your system"
            elif stability_score >= 0.7:
                recommendation = f"Buffer size {buffer_size} is marginally stable - consider a larger buffer"
            else:
                recommendation = f"Buffer size {buffer_size} is unstable - increase to {min(buffer_size * 2, 2048)} or higher"

            return {"success": xruns_during_test == 0 and stability_score >= 0.7, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": xruns_during_test, "avg_cpu_load": round(avg_cpu, 2), "peak_cpu_load": round(peak_cpu, 2), "stability_score": round(stability_score, 3), "recommendation": recommendation}
        except Exception as e:
            try:
                await service.set_buffer_size(original_buffer)
            except Exception:
                pass
            return {"success": False, "buffer_size": buffer_size, "duration_seconds": duration, "xruns": 0, "avg_cpu_load": 0, "peak_cpu_load": 0, "stability_score": 0, "recommendation": f"Test error: {str(e)}"}

    # =========================================================================
    # Audio Port Routing Endpoints
    # =========================================================================

    _CHAIN_ROUTING_CONFIG_KEY = "audio_routing"

    # Global routing config stays memory-backed; per-chain overrides are persisted in Chain.config.
    _port_routing_config = {
        "input_ports": [0, 1],  # Default: first stereo pair
        "output_ports": [0, 1],  # Default: first stereo pair
        "input_avb_endpoints": [],
        "output_avb_endpoints": [],
    }

    # Legacy in-memory override map retained for backwards compatibility during transition.
    _chain_port_routing: Dict[int, Dict[str, list]] = {}

    def _dedupe_int_list(raw: Optional[List[int]]) -> List[int]:
        values: List[int] = []
        seen = set()
        for item in raw or []:
            try:
                value = int(item)
            except Exception:
                continue
            if value < 0 or value in seen:
                continue
            seen.add(value)
            values.append(value)
        return values

    def _dedupe_string_list(raw: Optional[List[str]]) -> List[str]:
        values: List[str] = []
        seen = set()
        for item in raw or []:
            value = str(item or "").strip()
            if not value or value in seen:
                continue
            seen.add(value)
            values.append(value)
        return values

    def _sanitize_routing_payload(raw: Optional[Dict[str, Any]]) -> Dict[str, List[Any]]:
        payload = raw if isinstance(raw, dict) else {}
        return {
            "input_ports": _dedupe_int_list(payload.get("input_ports")),
            "output_ports": _dedupe_int_list(payload.get("output_ports")),
            "input_avb_endpoints": _dedupe_string_list(payload.get("input_avb_endpoints")),
            "output_avb_endpoints": _dedupe_string_list(payload.get("output_avb_endpoints")),
        }

    def _parse_chain_config(raw_config: Any) -> Dict[str, Any]:
        if isinstance(raw_config, dict):
            return dict(raw_config)
        if not isinstance(raw_config, str) or not raw_config.strip():
            return {}
        try:
            parsed = json.loads(raw_config)
            return dict(parsed) if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _build_capability_indexes(capabilities: Dict[str, Any]) -> Dict[str, Any]:
        local_inputs = list(capabilities.get("local_inputs") or [])
        local_outputs = list(capabilities.get("local_outputs") or [])
        avb_talkers = list(capabilities.get("avb_talkers") or [])
        avb_listeners = list(capabilities.get("avb_listeners") or [])

        inputs_by_index = {
            int(port.get("index")): port
            for port in local_inputs
            if isinstance(port, dict) and str(port.get("index", "")).strip() != ""
        }
        outputs_by_index = {
            int(port.get("index")): port
            for port in local_outputs
            if isinstance(port, dict) and str(port.get("index", "")).strip() != ""
        }
        talkers_by_id = {
            str(device.get("endpoint_id")).strip(): device
            for device in avb_talkers
            if isinstance(device, dict) and str(device.get("endpoint_id", "")).strip()
        }
        listeners_by_id = {
            str(device.get("endpoint_id")).strip(): device
            for device in avb_listeners
            if isinstance(device, dict) and str(device.get("endpoint_id", "")).strip()
        }

        return {
            "local_input_indices": set(inputs_by_index.keys()),
            "local_output_indices": set(outputs_by_index.keys()),
            "inputs_by_index": inputs_by_index,
            "outputs_by_index": outputs_by_index,
            "talkers_by_id": talkers_by_id,
            "listeners_by_id": listeners_by_id,
        }

    def _validate_local_ports(*, ports: List[int], allowed_indices: set, label: str) -> None:
        invalid = [port for port in ports if port not in allowed_indices]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid {label} port(s): {invalid}. Valid {label} ports: {sorted(allowed_indices)}",
            )

    def _validate_endpoint_ids(*, endpoint_ids: List[str], allowed_ids: set, label: str) -> None:
        invalid = [endpoint_id for endpoint_id in endpoint_ids if endpoint_id not in allowed_ids]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid {label} endpoint(s): {invalid}. Endpoint must be currently discovered and available.",
            )

    def _build_local_binding(
        *,
        direction: str,
        index: int,
        port_payload: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if port_payload:
            return {
                "selection_type": "local_port",
                "index": index,
                "name": str(port_payload.get("name") or f"{direction.title()} {index + 1}"),
                "source": str(port_payload.get("source") or "juce_local"),
                "available": bool(port_payload.get("available", True)),
            }
        return {
            "selection_type": "local_port",
            "index": index,
            "name": f"{direction.title()} {index + 1}",
            "source": "juce_local",
            "available": False,
            "missing": True,
        }

    def _build_avb_binding(
        *,
        direction: str,
        endpoint_id: str,
        endpoint_payload: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        if endpoint_payload:
            return {
                "selection_type": "avb_endpoint",
                "endpoint_id": endpoint_id,
                "direction": str(endpoint_payload.get("direction") or direction),
                "device_name": str(endpoint_payload.get("device_name") or endpoint_id),
                "host": str(endpoint_payload.get("host") or ""),
                "channels": int(endpoint_payload.get("channels") or 0),
                "sample_rate": int(endpoint_payload.get("sample_rate") or 0),
                "available": bool(endpoint_payload.get("available", True)),
            }
        return {
            "selection_type": "avb_endpoint",
            "endpoint_id": endpoint_id,
            "direction": direction,
            "device_name": endpoint_id,
            "host": "",
            "channels": 0,
            "sample_rate": 0,
            "available": False,
            "missing": True,
        }

    def _build_routing_response(
        *,
        routing_payload: Dict[str, List[Any]],
        capabilities: Dict[str, Any],
        chain_id: Optional[int] = None,
        is_override: bool = False,
    ) -> Dict[str, Any]:
        indexes = _build_capability_indexes(capabilities)

        input_bindings = [
            _build_local_binding(
                direction="input",
                index=port_index,
                port_payload=indexes["inputs_by_index"].get(port_index),
            )
            for port_index in routing_payload["input_ports"]
        ] + [
            _build_avb_binding(
                direction="talker",
                endpoint_id=endpoint_id,
                endpoint_payload=indexes["talkers_by_id"].get(endpoint_id),
            )
            for endpoint_id in routing_payload["input_avb_endpoints"]
        ]

        output_bindings = [
            _build_local_binding(
                direction="output",
                index=port_index,
                port_payload=indexes["outputs_by_index"].get(port_index),
            )
            for port_index in routing_payload["output_ports"]
        ] + [
            _build_avb_binding(
                direction="listener",
                endpoint_id=endpoint_id,
                endpoint_payload=indexes["listeners_by_id"].get(endpoint_id),
            )
            for endpoint_id in routing_payload["output_avb_endpoints"]
        ]

        payload = {
            "available": True,
            "input_ports": routing_payload["input_ports"],
            "output_ports": routing_payload["output_ports"],
            "input_avb_endpoints": routing_payload["input_avb_endpoints"],
            "output_avb_endpoints": routing_payload["output_avb_endpoints"],
            "input_bindings": input_bindings,
            "output_bindings": output_bindings,
            "is_override": is_override,
        }
        if chain_id is not None:
            payload["chain_id"] = chain_id
        return payload

    def _get_minimal_capabilities() -> Dict[str, Any]:
        return {
            "local_inputs": [],
            "local_outputs": [],
            "avb_talkers": [],
            "avb_listeners": [],
        }

    def _get_current_capabilities(service: Any) -> Dict[str, Any]:
        from app.services.avb.avb_service import get_avb_service

        info = service.get_system_info()
        return get_avb_service().get_channel_capabilities(system_info=info)

    async def _fetch_chain_routing_override(chain_id: int) -> tuple[bool, Optional[Dict[str, List[Any]]]]:
        from sqlalchemy import select
        from app.database import get_session, Chain

        async with get_session() as session:
            result = await session.execute(select(Chain).filter(Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is None:
                return False, None
            chain_config = _parse_chain_config(chain.config)
            raw_routing = chain_config.get(_CHAIN_ROUTING_CONFIG_KEY)
            if isinstance(raw_routing, dict):
                return True, _sanitize_routing_payload(raw_routing)
            return True, None

    async def _persist_chain_routing_override(
        chain_id: int,
        routing_payload: Optional[Dict[str, List[Any]]],
    ) -> bool:
        from sqlalchemy import select
        from app.database import get_session, Chain

        async with get_session() as session:
            result = await session.execute(select(Chain).filter(Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is None:
                return False

            chain_config = _parse_chain_config(chain.config)
            if routing_payload is None:
                chain_config.pop(_CHAIN_ROUTING_CONFIG_KEY, None)
            else:
                chain_config[_CHAIN_ROUTING_CONFIG_KEY] = _sanitize_routing_payload(routing_payload)

            chain.config = json.dumps(chain_config)
            await session.flush()
            return True

    def _apply_engine_routing(
        service: Any,
        *,
        chain_id: Optional[int] = None,
        input_ports: Optional[List[int]] = None,
        output_ports: Optional[List[int]] = None,
        input_avb_endpoints: Optional[List[str]] = None,
        output_avb_endpoints: Optional[List[str]] = None,
    ) -> None:
        engine = service.engine
        if engine is None:
            return

        def _call_first(method_names: List[str], *args: Any) -> bool:
            for method_name in method_names:
                method = getattr(engine, method_name, None)
                if callable(method):
                    method(*args)
                    return True
            return False

        if input_ports is not None:
            try:
                _call_first(["set_input_channels"], input_ports)
            except Exception as exc:
                logger.warning("Could not apply input routing to engine: %s", exc)

        if output_ports is not None:
            try:
                _call_first(["set_output_channels"], output_ports)
            except Exception as exc:
                logger.warning("Could not apply output routing to engine: %s", exc)

        if input_avb_endpoints is not None:
            try:
                applied = False
                if chain_id is not None:
                    applied = _call_first(
                        ["set_chain_input_avb_endpoints", "setChainInputAvbEndpoints"],
                        chain_id,
                        input_avb_endpoints,
                    )
                if not applied:
                    _call_first(["set_input_avb_endpoints", "setAvbInputEndpoints"], input_avb_endpoints)
            except Exception as exc:
                logger.warning("Could not apply AVB input routing to engine: %s", exc)

        if output_avb_endpoints is not None:
            try:
                applied = False
                if chain_id is not None:
                    applied = _call_first(
                        ["set_chain_output_avb_endpoints", "setChainOutputAvbEndpoints"],
                        chain_id,
                        output_avb_endpoints,
                    )
                if not applied:
                    _call_first(["set_output_avb_endpoints", "setAvbOutputEndpoints"], output_avb_endpoints)
            except Exception as exc:
                logger.warning("Could not apply AVB output routing to engine: %s", exc)

    @router.get("/ports")
    async def get_available_ports() -> Dict[str, Any]:
        """
        Get available audio input/output ports on the connected interface.

        Returns:
            List of input/output local ports + AVB endpoint capabilities.
        """
        service = get_engine_service()
        from app.services.avb.avb_service import get_avb_service

        if not service.is_available:
            return {
                "available": False,
                "inputs": [],
                "outputs": [],
                "error": "Audio engine not available"
            }

        info = service.get_system_info()
        device_name = str(info.get("audio_device") or info.get("alsa_device") or "hw:0,0")
        capabilities = get_avb_service().get_channel_capabilities(system_info=info)
        inputs = list(capabilities.get("local_inputs") or [])
        outputs = list(capabilities.get("local_outputs") or [])
        input_channels = len(inputs)
        output_channels = len(outputs)

        return {
            "available": True,
            "device": device_name,
            "inputs": inputs,
            "outputs": outputs,
            "input_count": input_channels,
            "output_count": output_channels,
            "avb_readiness": capabilities.get("readiness", {}),
            "avb_talkers": capabilities.get("avb_talkers", []),
            "avb_listeners": capabilities.get("avb_listeners", []),
            "capabilities": capabilities,
        }

    @router.get("/routing")
    async def get_port_routing() -> Dict[str, Any]:
        """
        Get current global audio port routing configuration.
        """
        service = get_engine_service()

        if not service.is_available:
            return {
                "available": False,
                "input_ports": [],
                "output_ports": [],
                "input_avb_endpoints": [],
                "output_avb_endpoints": [],
                "input_bindings": [],
                "output_bindings": [],
                "error": "Audio engine not available"
            }

        capabilities = _get_current_capabilities(service)
        return _build_routing_response(
            routing_payload=_sanitize_routing_payload(_port_routing_config),
            capabilities=capabilities,
            is_override=False,
        )

    @router.post("/routing")
    async def set_port_routing(
        input_ports: List[int] = Query(None, description="Input local port indices to use"),
        output_ports: List[int] = Query(None, description="Output local port indices to use"),
        input_avb_endpoints: List[str] = Query(None, description="AVB talker endpoint IDs to map as inputs"),
        output_avb_endpoints: List[str] = Query(None, description="AVB listener endpoint IDs to map as outputs"),
    ) -> Dict[str, Any]:
        """
        Set global audio routing configuration across local and AVB sources/sinks.
        """
        global _port_routing_config
        service = get_engine_service()

        if not service.is_available:
            raise HTTPException(status_code=503, detail="Audio engine not available")

        capabilities = _get_current_capabilities(service)
        indexes = _build_capability_indexes(capabilities)

        if input_ports is not None:
            normalized_input_ports = _dedupe_int_list(input_ports)
            _validate_local_ports(
                ports=normalized_input_ports,
                allowed_indices=indexes["local_input_indices"],
                label="input",
            )
            _port_routing_config["input_ports"] = normalized_input_ports
            _apply_engine_routing(service, input_ports=normalized_input_ports)

        if output_ports is not None:
            normalized_output_ports = _dedupe_int_list(output_ports)
            _validate_local_ports(
                ports=normalized_output_ports,
                allowed_indices=indexes["local_output_indices"],
                label="output",
            )
            _port_routing_config["output_ports"] = normalized_output_ports
            _apply_engine_routing(service, output_ports=normalized_output_ports)

        if input_avb_endpoints is not None:
            normalized_input_endpoints = _dedupe_string_list(input_avb_endpoints)
            _validate_endpoint_ids(
                endpoint_ids=normalized_input_endpoints,
                allowed_ids=set(indexes["talkers_by_id"].keys()),
                label="input AVB",
            )
            _port_routing_config["input_avb_endpoints"] = normalized_input_endpoints
            _apply_engine_routing(service, input_avb_endpoints=normalized_input_endpoints)

        if output_avb_endpoints is not None:
            normalized_output_endpoints = _dedupe_string_list(output_avb_endpoints)
            _validate_endpoint_ids(
                endpoint_ids=normalized_output_endpoints,
                allowed_ids=set(indexes["listeners_by_id"].keys()),
                label="output AVB",
            )
            _port_routing_config["output_avb_endpoints"] = normalized_output_endpoints
            _apply_engine_routing(service, output_avb_endpoints=normalized_output_endpoints)

        payload = _build_routing_response(
            routing_payload=_sanitize_routing_payload(_port_routing_config),
            capabilities=capabilities,
            is_override=False,
        )
        payload["success"] = True
        payload["message"] = "Port routing updated"
        return payload

    @router.get("/routing/chain/{chain_id}")
    async def get_chain_port_routing(chain_id: int) -> Dict[str, Any]:
        """
        Get routing for a specific chain, falling back to global routing.
        """
        service = get_engine_service()
        capabilities = _get_current_capabilities(service) if service.is_available else _get_minimal_capabilities()
        chain_exists, persisted_override = await _fetch_chain_routing_override(chain_id)

        legacy_override = _chain_port_routing.get(chain_id)
        merged_override = persisted_override
        if merged_override is None and isinstance(legacy_override, dict):
            merged_override = _sanitize_routing_payload(legacy_override)

        effective_routing = merged_override or _sanitize_routing_payload(_port_routing_config)
        payload = _build_routing_response(
            chain_id=chain_id,
            routing_payload=effective_routing,
            capabilities=capabilities,
            is_override=merged_override is not None,
        )
        payload["chain_exists"] = chain_exists
        return payload

    @router.post("/routing/chain/{chain_id}")
    async def set_chain_port_routing(
        chain_id: int,
        input_ports: List[int] = Query(None, description="Input local port indices for this chain"),
        output_ports: List[int] = Query(None, description="Output local port indices for this chain"),
        input_avb_endpoints: List[str] = Query(None, description="AVB talker endpoint IDs for this chain"),
        output_avb_endpoints: List[str] = Query(None, description="AVB listener endpoint IDs for this chain"),
    ) -> Dict[str, Any]:
        """
        Set routing override for a specific chain/flow and persist it in Chain.config.
        """
        service = get_engine_service()
        if not service.is_available:
            raise HTTPException(status_code=503, detail="Audio engine not available")

        capabilities = _get_current_capabilities(service)
        indexes = _build_capability_indexes(capabilities)
        chain_exists, persisted_override = await _fetch_chain_routing_override(chain_id)
        if not chain_exists:
            raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

        if persisted_override is not None:
            routing_payload = dict(persisted_override)
        elif chain_id in _chain_port_routing:
            routing_payload = _sanitize_routing_payload(_chain_port_routing[chain_id])
        else:
            routing_payload = _sanitize_routing_payload(_port_routing_config)

        if input_ports is not None:
            normalized_input_ports = _dedupe_int_list(input_ports)
            _validate_local_ports(
                ports=normalized_input_ports,
                allowed_indices=indexes["local_input_indices"],
                label="input",
            )
            routing_payload["input_ports"] = normalized_input_ports
            _apply_engine_routing(service, chain_id=chain_id, input_ports=normalized_input_ports)

        if output_ports is not None:
            normalized_output_ports = _dedupe_int_list(output_ports)
            _validate_local_ports(
                ports=normalized_output_ports,
                allowed_indices=indexes["local_output_indices"],
                label="output",
            )
            routing_payload["output_ports"] = normalized_output_ports
            _apply_engine_routing(service, chain_id=chain_id, output_ports=normalized_output_ports)

        if input_avb_endpoints is not None:
            normalized_input_endpoints = _dedupe_string_list(input_avb_endpoints)
            _validate_endpoint_ids(
                endpoint_ids=normalized_input_endpoints,
                allowed_ids=set(indexes["talkers_by_id"].keys()),
                label="input AVB",
            )
            routing_payload["input_avb_endpoints"] = normalized_input_endpoints
            _apply_engine_routing(
                service,
                chain_id=chain_id,
                input_avb_endpoints=normalized_input_endpoints,
            )

        if output_avb_endpoints is not None:
            normalized_output_endpoints = _dedupe_string_list(output_avb_endpoints)
            _validate_endpoint_ids(
                endpoint_ids=normalized_output_endpoints,
                allowed_ids=set(indexes["listeners_by_id"].keys()),
                label="output AVB",
            )
            routing_payload["output_avb_endpoints"] = normalized_output_endpoints
            _apply_engine_routing(
                service,
                chain_id=chain_id,
                output_avb_endpoints=normalized_output_endpoints,
            )

        routing_payload = _sanitize_routing_payload(routing_payload)
        persisted = await _persist_chain_routing_override(chain_id, routing_payload)
        if not persisted:
            raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")
        _chain_port_routing[chain_id] = dict(routing_payload)

        payload = _build_routing_response(
            chain_id=chain_id,
            routing_payload=routing_payload,
            capabilities=capabilities,
            is_override=True,
        )
        payload["success"] = True
        payload["message"] = f"Chain {chain_id} routing updated"
        return payload

    @router.delete("/routing/chain/{chain_id}")
    async def clear_chain_port_routing(chain_id: int) -> Dict[str, Any]:
        """
        Remove per-chain routing override and revert to global routing.
        """
        chain_exists, _override = await _fetch_chain_routing_override(chain_id)
        if not chain_exists:
            raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

        persisted = await _persist_chain_routing_override(chain_id, None)
        if not persisted:
            raise HTTPException(status_code=404, detail=f"Chain {chain_id} not found")

        if chain_id in _chain_port_routing:
            del _chain_port_routing[chain_id]

        service = get_engine_service()
        capabilities = _get_current_capabilities(service) if service.is_available else _get_minimal_capabilities()
        payload = _build_routing_response(
            chain_id=chain_id,
            routing_payload=_sanitize_routing_payload(_port_routing_config),
            capabilities=capabilities,
            is_override=False,
        )
        payload["success"] = True
        payload["message"] = f"Chain {chain_id} reverted to global routing"
        return payload

    @router.get("/ports/presets")
    async def get_port_presets() -> Dict[str, Any]:
        """
        Get common port routing presets for the connected interface.

        Returns:
            List of preset routing configurations
        """
        service = get_engine_service()

        if not service.is_available:
            return {"presets": []}

        info = service.get_system_info()
        input_channels = info.get("input_channels", 2)
        output_channels = info.get("output_channels", 2)

        presets = []

        # Always have stereo preset
        presets.append({
            "id": "stereo",
            "name": "Stereo (1-2)",
            "description": "Standard stereo input/output",
            "input_ports": [0, 1],
            "output_ports": [0, 1]
        })

        # Add mono preset
        presets.append({
            "id": "mono",
            "name": "Mono (1)",
            "description": "Mono input to stereo output",
            "input_ports": [0],
            "output_ports": [0, 1]
        })

        # Multi-channel presets for interfaces with more ports
        if input_channels >= 4:
            presets.append({
                "id": "inputs_3_4",
                "name": "Inputs 3-4",
                "description": "Use inputs 3 and 4",
                "input_ports": [2, 3],
                "output_ports": [0, 1]
            })

        if input_channels >= 6:
            presets.append({
                "id": "spdif_in",
                "name": "S/PDIF Input",
                "description": "Digital S/PDIF input",
                "input_ports": [4, 5],
                "output_ports": [0, 1]
            })

        if output_channels >= 4:
            presets.append({
                "id": "outputs_3_4",
                "name": "Outputs 3-4",
                "description": "Route to outputs 3 and 4",
                "input_ports": [0, 1],
                "output_ports": [2, 3]
            })

        if output_channels >= 10:
            presets.append({
                "id": "spdif_out",
                "name": "S/PDIF Output",
                "description": "Digital S/PDIF output",
                "input_ports": [0, 1],
                "output_ports": [8, 9]
            })
            presets.append({
                "id": "all_analog_out",
                "name": "All Analog Outputs",
                "description": "Route to all 8 analog outputs",
                "input_ports": [0, 1],
                "output_ports": [0, 1, 2, 3, 4, 5, 6, 7]
            })

        return {
            "presets": presets,
            "current": {
                "input_ports": _port_routing_config["input_ports"],
                "output_ports": _port_routing_config["output_ports"],
                "input_avb_endpoints": _port_routing_config["input_avb_endpoints"],
                "output_avb_endpoints": _port_routing_config["output_avb_endpoints"],
            }
        }

except ImportError:
    router = None
