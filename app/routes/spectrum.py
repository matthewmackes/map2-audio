"""
Spectrum Analysis API Routes
Real-time FFT spectrum data from MAP2 Audio Engine
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/spectrum", tags=["spectrum"])


@router.get("")
async def get_spectrum() -> Dict[str, Any]:
    """
    Get FFT spectrum data

    Returns:
        magnitudes: Array of magnitude values in dB
        frequencies: Array of corresponding frequencies in Hz
        peak_frequency: Frequency with highest magnitude
        peak_magnitude: Highest magnitude value in dB
        spectral_centroid: Weighted center of spectrum in Hz
    """
    service = get_audio_engine()

    if not service.is_running:
        raise HTTPException(status_code=503, detail="Audio engine not running")

    return await service.get_spectrum()


@router.get("/magnitudes")
async def get_spectrum_magnitudes() -> Dict[str, List[float]]:
    """
    Get spectrum magnitude array only

    Returns array of magnitude values in dB for each frequency bin.
    More efficient than full spectrum when only magnitudes are needed.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"magnitudes": []}

    return {"magnitudes": await service.get_spectrum_magnitudes()}


@router.get("/frequencies")
async def get_spectrum_frequencies() -> Dict[str, List[float]]:
    """
    Get spectrum frequency array only

    Returns array of frequency values in Hz for each bin.
    This is static once sample rate is set - can be cached.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"frequencies": []}

    return {"frequencies": await service.get_spectrum_frequencies()}


@router.get("/peak")
async def get_spectrum_peak() -> Dict[str, float]:
    """
    Get peak frequency and magnitude

    Useful for tuner applications or dominant frequency detection.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {
            "peak_frequency": 0.0,
            "peak_magnitude": -100.0
        }

    spectrum = await service.get_spectrum()
    return {
        "peak_frequency": spectrum.get("peak_frequency", 0.0),
        "peak_magnitude": spectrum.get("peak_magnitude", -100.0)
    }


@router.get("/centroid")
async def get_spectral_centroid() -> Dict[str, float]:
    """
    Get spectral centroid

    The spectral centroid indicates where the "center of mass" of the
    spectrum is located. Useful for brightness/timbre analysis.
    """
    service = get_audio_engine()

    if not service.is_running:
        return {"spectral_centroid": 0.0}

    spectrum = await service.get_spectrum()
    return {"spectral_centroid": spectrum.get("spectral_centroid", 0.0)}
