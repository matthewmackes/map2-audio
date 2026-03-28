"""
Latency v2 API routes.

Provides rolling callback-timing jitter stats for runtime latency monitoring.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.services.juce_engine_service import get_audio_engine
from app.services.timing_jitter_collector import get_timing_jitter_collector

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/latency", tags=["latency-v2"])


def _compute_jitter_sample(service, io_stats: dict) -> dict:
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
