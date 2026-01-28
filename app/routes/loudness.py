"""
Loudness Metering API Routes
LUFS loudness and phase correlation from MAP2 Audio Engine
ITU-R BS.1770-4 compliant loudness measurement
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/loudness", tags=["loudness"])


# ============================================================================
# LUFS Loudness Metering
# ============================================================================

@router.get("/lufs")
async def get_lufs_levels() -> Dict[str, Any]:
    """
    Get LUFS loudness levels (ITU-R BS.1770-4)

    Returns:
        momentary: 400ms integrated loudness (LUFS)
        short_term: 3s integrated loudness (LUFS)
        integrated: Gated integrated loudness (LUFS)
        range: Loudness Range (LU)
        true_peak: Maximum True Peak (dBTP)
        true_peak_left: Left channel True Peak (dBTP)
        true_peak_right: Right channel True Peak (dBTP)
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "momentary": -100.0,
            "short_term": -100.0,
            "integrated": -100.0,
            "range": 0.0,
            "true_peak": -100.0,
            "true_peak_left": -100.0,
            "true_peak_right": -100.0,
            "running": False
        }

    levels = await service.get_lufs_levels()
    levels["running"] = True
    return levels


@router.get("/momentary")
async def get_momentary_loudness() -> Dict[str, float]:
    """
    Get momentary loudness (400ms window)

    Fast-responding loudness for peak detection.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"momentary": -100.0}

    levels = await service.get_lufs_levels()
    return {"momentary": levels.get("momentary", -100.0)}


@router.get("/short-term")
async def get_short_term_loudness() -> Dict[str, float]:
    """
    Get short-term loudness (3s window)

    Useful for monitoring program material loudness.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"short_term": -100.0}

    levels = await service.get_lufs_levels()
    return {"short_term": levels.get("short_term", -100.0)}


@router.get("/integrated")
async def get_integrated_loudness() -> Dict[str, float]:
    """
    Get integrated loudness

    Gated measurement over entire program duration.
    Use reset endpoint to start a new measurement.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"integrated": -100.0}

    levels = await service.get_lufs_levels()
    return {"integrated": levels.get("integrated", -100.0)}


@router.post("/reset")
async def reset_integrated_loudness() -> Dict[str, str]:
    """
    Reset integrated loudness measurement

    Clears the integrated loudness accumulator to start fresh.
    """
    service = get_audio_engine()

    if not service.is_running:
        raise HTTPException(status_code=503, detail="Audio engine not running")

    await service.reset_integrated_loudness()
    return {"status": "reset"}


@router.get("/range")
async def get_loudness_range() -> Dict[str, float]:
    """
    Get Loudness Range (LRA)

    Measures the dynamic range of the program material in LU.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"range": 0.0}

    levels = await service.get_lufs_levels()
    return {"range": levels.get("range", 0.0)}


@router.get("/true-peak")
async def get_true_peak() -> Dict[str, float]:
    """
    Get True Peak levels

    Inter-sample peak detection using 4x oversampling.
    Returns values in dBTP (dB True Peak).
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "true_peak": -100.0,
            "true_peak_left": -100.0,
            "true_peak_right": -100.0
        }

    levels = await service.get_lufs_levels()
    return {
        "true_peak": levels.get("true_peak", -100.0),
        "true_peak_left": levels.get("true_peak_left", -100.0),
        "true_peak_right": levels.get("true_peak_right", -100.0)
    }


# ============================================================================
# Phase Correlation / Stereo Analysis
# ============================================================================

@router.get("/phase")
async def get_phase_correlation() -> Dict[str, float]:
    """
    Get stereo phase correlation

    Returns:
        correlation: -1 (out of phase) to +1 (mono/in phase)
        balance: -1 (left) to +1 (right), 0 = center
        width: 0 (mono) to 1 (full stereo)
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "correlation": 0.0,
            "balance": 0.0,
            "width": 0.0,
            "running": False
        }

    info = await service.get_stereo_info()
    info["running"] = True
    return {
        "correlation": info.get("phase_correlation", 0.0),
        "balance": info.get("balance", 0.0),
        "width": info.get("width", 0.0),
        "running": True
    }


@router.get("/stereo")
async def get_stereo_info() -> Dict[str, float]:
    """
    Get complete stereo analysis

    Combined endpoint for phase correlation, balance, and width.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "phase_correlation": 0.0,
            "balance": 0.0,
            "width": 0.0,
            "running": False
        }

    info = await service.get_stereo_info()
    info["running"] = True
    return info


# ============================================================================
# Latency Information
# ============================================================================

@router.get("/latency")
async def get_latency_info() -> Dict[str, Any]:
    """
    Get total chain latency

    Returns:
        total_samples: Total latency in samples
        total_ms: Total latency in milliseconds
        breakdown: Per-plugin latency breakdown
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "total_samples": 0,
            "total_ms": 0.0,
            "breakdown": []
        }

    return {
        "total_samples": await service.get_total_latency_samples(),
        "total_ms": await service.get_total_latency_ms(),
        "breakdown": await service.get_latency_breakdown()
    }


@router.get("/latency/breakdown")
async def get_latency_breakdown() -> Dict[str, Any]:
    """
    Get per-plugin latency breakdown

    Shows how much latency each plugin contributes to the chain.
    Useful for identifying latency-heavy plugins.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"plugins": []}

    return {"plugins": await service.get_latency_breakdown()}
