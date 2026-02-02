"""
EQ/Filter Processing API Routes
8-band parametric EQ control
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/eq", tags=["eq"])


# ========================================
# Pydantic Models
# ========================================

class EQBandParams(BaseModel):
    """EQ band parameters"""
    type: Optional[str] = Field(None, description="Filter type (peak, lowpass, highpass, etc.)")
    frequency: Optional[float] = Field(None, ge=20.0, le=20000.0, description="Center frequency in Hz")
    gain: Optional[float] = Field(None, ge=-24.0, le=24.0, description="Gain in dB")
    q: Optional[float] = Field(None, ge=0.1, le=10.0, description="Q factor")
    enabled: Optional[bool] = Field(None, description="Band enabled state")


class EQParams(BaseModel):
    """Full EQ parameters"""
    bands: Optional[List[EQBandParams]] = Field(None, description="Band parameters (8 bands)")
    output_gain: Optional[float] = Field(None, ge=-12.0, le=12.0, description="Output gain in dB")
    bypass: Optional[bool] = Field(None, description="Bypass EQ")


class FrequencyResponseRequest(BaseModel):
    """Request for frequency response"""
    frequencies: List[float] = Field(..., description="Frequencies to evaluate (Hz)")


# ========================================
# Band Routes
# ========================================

@router.get("/bands/{index}")
async def get_eq_band(index: int) -> Dict[str, Any]:
    """Get EQ band parameters."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    engine = get_audio_engine()
    return await engine.get_eq_band(index)


@router.patch("/bands/{index}")
async def update_eq_band(index: int, params: EQBandParams) -> Dict[str, Any]:
    """Update EQ band parameters."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    engine = get_audio_engine()

    if params.frequency is not None:
        await engine.set_eq_band_frequency(index, params.frequency)
    if params.gain is not None:
        await engine.set_eq_band_gain(index, params.gain)
    if params.q is not None:
        await engine.set_eq_band_q(index, params.q)
    if params.type is not None:
        await engine.set_eq_band_type(index, params.type)
    if params.enabled is not None:
        await engine.set_eq_band_enabled(index, params.enabled)

    return {"status": "ok", "band": await engine.get_eq_band(index)}


@router.post("/bands/{index}/frequency/{hz}")
async def set_eq_band_frequency(index: int, hz: float) -> Dict[str, Any]:
    """Set EQ band frequency."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not 20.0 <= hz <= 20000.0:
        raise HTTPException(status_code=400, detail="Frequency must be 20-20000 Hz")

    engine = get_audio_engine()
    await engine.set_eq_band_frequency(index, hz)
    return {"status": "ok", "index": index, "frequency": hz}


@router.post("/bands/{index}/gain/{db}")
async def set_eq_band_gain(index: int, db: float) -> Dict[str, Any]:
    """Set EQ band gain."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not -24.0 <= db <= 24.0:
        raise HTTPException(status_code=400, detail="Gain must be -24 to +24 dB")

    engine = get_audio_engine()
    await engine.set_eq_band_gain(index, db)
    return {"status": "ok", "index": index, "gain": db}


@router.post("/bands/{index}/q/{q}")
async def set_eq_band_q(index: int, q: float) -> Dict[str, Any]:
    """Set EQ band Q factor."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not 0.1 <= q <= 10.0:
        raise HTTPException(status_code=400, detail="Q must be 0.1 to 10")

    engine = get_audio_engine()
    await engine.set_eq_band_q(index, q)
    return {"status": "ok", "index": index, "q": q}


@router.post("/bands/{index}/type/{filter_type}")
async def set_eq_band_type(index: int, filter_type: str) -> Dict[str, Any]:
    """Set EQ band filter type."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    valid_types = ["peak", "lowpass", "highpass", "bandpass", "notch", "lowshelf", "highshelf", "allpass"]
    if filter_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid filter type. Must be one of: {valid_types}")

    engine = get_audio_engine()
    await engine.set_eq_band_type(index, filter_type)
    return {"status": "ok", "index": index, "type": filter_type}


@router.post("/bands/{index}/enabled/{enabled}")
async def set_eq_band_enabled(index: int, enabled: bool) -> Dict[str, Any]:
    """Enable/disable EQ band."""
    if index < 0 or index >= 8:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    engine = get_audio_engine()
    await engine.set_eq_band_enabled(index, enabled)
    return {"status": "ok", "index": index, "enabled": enabled}


# ========================================
# Global EQ Routes
# ========================================

@router.get("/")
async def get_eq() -> Dict[str, Any]:
    """Get all EQ parameters."""
    engine = get_audio_engine()
    params = await engine.get_eq_parameters()
    bypass = await engine.is_eq_bypassed()
    return {
        "parameters": params,
        "bypass": bypass
    }


@router.get("/parameters")
async def get_eq_parameters() -> Dict[str, Any]:
    """Get EQ parameters only."""
    engine = get_audio_engine()
    return await engine.get_eq_parameters()


@router.patch("/")
async def update_eq(params: EQParams) -> Dict[str, Any]:
    """Update EQ parameters."""
    engine = get_audio_engine()

    if params.output_gain is not None:
        await engine.set_eq_output_gain(params.output_gain)
    if params.bypass is not None:
        await engine.set_eq_bypass(params.bypass)

    # Update bands if provided
    if params.bands:
        for i, band in enumerate(params.bands):
            if i >= 8:
                break
            if band.frequency is not None:
                await engine.set_eq_band_frequency(i, band.frequency)
            if band.gain is not None:
                await engine.set_eq_band_gain(i, band.gain)
            if band.q is not None:
                await engine.set_eq_band_q(i, band.q)
            if band.type is not None:
                await engine.set_eq_band_type(i, band.type)
            if band.enabled is not None:
                await engine.set_eq_band_enabled(i, band.enabled)

    return {"status": "ok", "parameters": await engine.get_eq_parameters()}


@router.post("/bypass/{bypass}")
async def set_eq_bypass(bypass: bool) -> Dict[str, Any]:
    """Set EQ bypass state."""
    engine = get_audio_engine()
    await engine.set_eq_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/output-gain/{db}")
async def set_eq_output_gain(db: float) -> Dict[str, Any]:
    """Set EQ output gain."""
    if not -12.0 <= db <= 12.0:
        raise HTTPException(status_code=400, detail="Output gain must be -12 to +12 dB")

    engine = get_audio_engine()
    await engine.set_eq_output_gain(db)
    return {"status": "ok", "output_gain": db}


# ========================================
# Frequency Response
# ========================================

@router.post("/frequency-response")
async def get_frequency_response(request: FrequencyResponseRequest) -> Dict[str, Any]:
    """Get EQ frequency response at given frequencies."""
    engine = get_audio_engine()
    response = await engine.get_eq_frequency_response(request.frequencies)
    return {
        "frequencies": request.frequencies,
        "response": response
    }


@router.get("/frequency-response/default")
async def get_default_frequency_response() -> Dict[str, Any]:
    """Get frequency response at standard frequencies (20Hz to 20kHz)."""
    # Generate logarithmically spaced frequencies
    import math
    frequencies = []
    for i in range(64):
        freq = 20.0 * math.pow(10, i * 3.0 / 63.0)  # 20 to 20000 Hz
        frequencies.append(freq)

    engine = get_audio_engine()
    response = await engine.get_eq_frequency_response(frequencies)
    return {
        "frequencies": frequencies,
        "response": response
    }
