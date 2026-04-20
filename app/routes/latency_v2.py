"""Latency v2 API routes."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.latency_compensation import get_latency_analyzer, get_latency_compensator
from app.services.juce_engine_service import get_audio_engine
from app.services.timing_jitter_collector import get_timing_jitter_collector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/latency", tags=["latency-v2"])


class LatencyMeasureRequest(BaseModel):
    """Request to measure plugin latency."""

    plugin_uri: str
    method: str = "impulse"


class LatencyCompensationRequest(BaseModel):
    """Request to enable/disable compensation."""

    enabled: bool


class ChainLatencyRequest(BaseModel):
    """Request to calculate chain compensation."""

    chain_id: int
    plugin_latencies: dict[str, int]


def _compute_jitter_sample(service: Any, io_stats: dict[str, Any]) -> dict[str, Any]:
    callback_budget_ms = float(io_stats.get("callback_budget_ms", 0.0) or 0.0)
    deviation_ms = max(0.0, float(io_stats.get("callback_jitter_ms", 0.0) or 0.0))
    delta_ms = max(0.0, callback_budget_ms + deviation_ms)
    xrun_count = int(io_stats.get("xrun_count", 0) or 0)
    configured_buffer = int(getattr(service.config, "buffer_size", 64) or 64)
    if configured_buffer <= 0:
        configured_buffer = 64
    samples_processed = int(io_stats.get("samples_processed", 0) or 0)
    callback_count = max(0, int(samples_processed / configured_buffer))
    rtl_ms = float(io_stats.get("measured_round_trip_ms", 0.0) or 0.0)
    return {
        "delta_ms": delta_ms,
        "deviation_ms": deviation_ms,
        "callback_count": callback_count,
        "xrun_count": xrun_count,
        "rtl_ms": rtl_ms,
    }


async def _measure_impulse_latency(plugin_uri: str) -> int:
    """Return measured impulse latency when a runtime instance is available."""
    from app.services.engine_runtime_facade import get_engine_service

    engine = get_engine_service()
    if not getattr(engine, "is_available", False) or not getattr(engine, "is_running", False):
        logger.warning("Audio engine not available for impulse latency measurement")
        return 0

    # JUCE currently exposes runtime instances by instance id, not direct process callables.
    logger.warning("Plugin instance not found for %s", plugin_uri)
    return 0


async def _measure_reported_latency(plugin_uri: str) -> int:
    """Return reported plugin latency from plugin metadata when available."""
    from sqlalchemy import select

    from app.database import Plugin, get_session

    analyzer = get_latency_analyzer()
    async with get_session(read_only=True) as session:
        result = await session.execute(select(Plugin).where(Plugin.uri == plugin_uri))
        plugin = result.scalar_one_or_none()
        if not plugin:
            logger.warning("No latency information available for %s", plugin_uri)
            return 0
        latency_samples = int(getattr(plugin, "reported_latency_samples", 0) or 0)
        has_latency_port = bool(getattr(plugin, "has_latency_port", False))

    if latency_samples > 0:
        analyzer.measured_latencies[plugin_uri] = latency_samples
        return latency_samples

    if has_latency_port:
        logger.warning(
            "Plugin %s exposes a latency port, but runtime port reads are not available through v2 yet",
            plugin_uri,
        )
    else:
        logger.warning("No latency information available for %s", plugin_uri)
    return 0


@router.get("/status")
async def get_latency_status() -> dict[str, Any]:
    """Get latency compensation status."""
    try:
        return get_latency_compensator().get_status()
    except Exception as exc:
        logger.error("Error getting latency status: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/compensate")
async def set_compensation(request: LatencyCompensationRequest) -> dict[str, Any]:
    """Enable or disable latency compensation."""
    try:
        compensator = get_latency_compensator()
        compensator.enable_compensation(request.enabled)
        state = "enabled" if request.enabled else "disabled"
        return {
            "status": "ok",
            "enabled": request.enabled,
            "message": f"Latency compensation {state}",
        }
    except Exception as exc:
        logger.error("Error setting compensation: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/measure")
async def measure_plugin_latency(request: LatencyMeasureRequest) -> dict[str, Any]:
    """Measure plugin latency."""
    try:
        if request.method == "impulse":
            latency_samples = await _measure_impulse_latency(request.plugin_uri)
        elif request.method == "reported":
            latency_samples = await _measure_reported_latency(request.plugin_uri)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown method: {request.method}")

        analyzer = get_latency_analyzer()
        return {
            "plugin_uri": request.plugin_uri,
            "latency_samples": latency_samples,
            "latency_ms": analyzer.samples_to_ms(latency_samples),
            "method": request.method,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error measuring latency: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/plugins/{plugin_uri:path}")
async def get_plugin_latency(plugin_uri: str) -> dict[str, Any]:
    """Get measured latency for a plugin."""
    try:
        analyzer = get_latency_analyzer()
        latency_samples = analyzer.get_latency(plugin_uri)
        return {
            "plugin_uri": plugin_uri,
            "latency_samples": latency_samples,
            "latency_ms": analyzer.samples_to_ms(latency_samples),
            "has_measurement": latency_samples > 0,
        }
    except Exception as exc:
        logger.error("Error getting plugin latency: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/chains/{chain_id}/calculate")
async def calculate_chain_compensation(
    chain_id: int,
    request: ChainLatencyRequest,
) -> dict[str, Any]:
    """Calculate latency compensation for an entire chain."""
    try:
        compensator = get_latency_compensator()
        analyzer = get_latency_analyzer()
        compensations = compensator.calculate_chain_compensation(request.plugin_latencies)
        max_latency = max(request.plugin_latencies.values()) if request.plugin_latencies else 0
        return {
            "chain_id": chain_id,
            "max_latency_samples": max_latency,
            "max_latency_ms": analyzer.samples_to_ms(max_latency),
            "compensations": compensations,
        }
    except Exception as exc:
        logger.error("Error calculating chain compensation: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/reset")
async def reset_delay_lines() -> dict[str, Any]:
    """Reset all delay line buffers."""
    try:
        get_latency_compensator().reset_delay_lines()
        return {"status": "ok", "message": "Delay lines reset"}
    except Exception as exc:
        logger.error("Error resetting delay lines: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/chains/{chain_id}")
async def get_chain_latency(chain_id: int) -> dict[str, Any]:
    """Get total latency for a chain."""
    try:
        compensator = get_latency_compensator()
        analyzer = get_latency_analyzer()
        total_latency = compensator.get_total_chain_latency()
        return {
            "chain_id": chain_id,
            "total_latency_samples": total_latency,
            "total_latency_ms": analyzer.samples_to_ms(total_latency),
            "compensation_enabled": compensator.compensation_enabled,
        }
    except Exception as exc:
        logger.error("Error getting chain latency: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/jitter-stats")
async def get_jitter_stats():
    """
    Return rolling callback jitter statistics for the latest 60-second window.
    """
    try:
        collector = get_timing_jitter_collector()
        stats = collector.get_stats()
        if int(stats.get("sample_count", 0)) > 0:
            return stats

        # Prime with one live sample when the collector window is empty.
        service = get_audio_engine()
        if service and service.is_running:
            io_stats = await service.get_audio_io_stats()
            sample = _compute_jitter_sample(service, io_stats)
            collector.record(
                delta_ms=sample["delta_ms"],
                deviation_ms=sample["deviation_ms"],
                callback_count=sample["callback_count"],
                xrun_count=sample["xrun_count"],
                rtl_ms=sample["rtl_ms"],
                running=service.is_audio_running(),
            )
            return collector.get_stats()

        return stats
    except Exception as exc:
        logger.error("Failed to build jitter stats: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to build jitter stats") from exc


@router.post("/xruns/reset")
async def reset_xrun_counter():
    """Reset engine xrun counter for the current runtime session."""
    service = get_audio_engine()
    if not service:
        raise HTTPException(status_code=503, detail="Audio engine service unavailable")

    try:
        reset_ok = await service.reset_xrun_counter()
    except Exception as exc:
        logger.error("Failed to reset xrun counter: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset xrun counter") from exc

    if not reset_ok:
        raise HTTPException(status_code=503, detail="Audio engine is unavailable")

    # Record a fresh post-reset sample so downstream reads converge quickly.
    try:
        io_stats = await service.get_audio_io_stats()
        sample = _compute_jitter_sample(service, io_stats)
        get_timing_jitter_collector().record(
            delta_ms=sample["delta_ms"],
            deviation_ms=sample["deviation_ms"],
            callback_count=sample["callback_count"],
            xrun_count=sample["xrun_count"],
            rtl_ms=sample["rtl_ms"],
            running=service.is_audio_running(),
        )
    except Exception as exc:
        # Keep reset route success independent of sampling failures.
        logger.debug("Failed to record post-reset jitter sample", exc_info=exc)

    return {"status": "ok", "message": "Xrun counter reset"}
