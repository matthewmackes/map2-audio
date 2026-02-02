"""
Dynamics Processing API Routes
Compressor, Limiter, and Noise Gate controls
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/dynamics", tags=["dynamics"])


# ========================================
# Pydantic Models
# ========================================

class CompressorParams(BaseModel):
    """Compressor parameters"""
    threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Threshold in dB")
    ratio: Optional[float] = Field(None, ge=1.0, le=100.0, description="Compression ratio")
    attack: Optional[float] = Field(None, ge=0.1, le=500.0, description="Attack time in ms")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    knee: Optional[float] = Field(None, ge=0.0, le=24.0, description="Knee width in dB")
    makeup_gain: Optional[float] = Field(None, ge=-12.0, le=24.0, description="Makeup gain in dB")
    auto_makeup: Optional[bool] = Field(None, description="Enable auto makeup gain")
    bypass: Optional[bool] = Field(None, description="Bypass compressor")


class LimiterParams(BaseModel):
    """Limiter parameters"""
    threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Threshold/ceiling in dB")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    bypass: Optional[bool] = Field(None, description="Bypass limiter")


class GateParams(BaseModel):
    """Noise gate parameters"""
    threshold: Optional[float] = Field(None, ge=-100.0, le=0.0, description="Threshold in dB")
    ratio: Optional[float] = Field(None, ge=1.0, le=100.0, description="Gate ratio")
    attack: Optional[float] = Field(None, ge=0.1, le=500.0, description="Attack time in ms")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    bypass: Optional[bool] = Field(None, description="Bypass gate")


# ========================================
# Compressor Routes
# ========================================

@router.get("/compressor")
async def get_compressor() -> Dict[str, Any]:
    """Get compressor parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_compressor_parameters()
    metering = await engine.get_compressor_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/compressor/parameters")
async def get_compressor_parameters() -> Dict[str, Any]:
    """Get compressor parameters only."""
    engine = get_audio_engine()
    return await engine.get_compressor_parameters()


@router.get("/compressor/metering")
async def get_compressor_metering() -> Dict[str, float]:
    """Get compressor metering data."""
    engine = get_audio_engine()
    return await engine.get_compressor_metering()


@router.patch("/compressor")
async def update_compressor(params: CompressorParams) -> Dict[str, Any]:
    """Update compressor parameters."""
    engine = get_audio_engine()

    if params.threshold is not None:
        await engine.set_compressor_threshold(params.threshold)
    if params.ratio is not None:
        await engine.set_compressor_ratio(params.ratio)
    if params.attack is not None:
        await engine.set_compressor_attack(params.attack)
    if params.release is not None:
        await engine.set_compressor_release(params.release)
    if params.knee is not None:
        await engine.set_compressor_knee(params.knee)
    if params.makeup_gain is not None:
        await engine.set_compressor_makeup_gain(params.makeup_gain)
    if params.auto_makeup is not None:
        await engine.set_compressor_auto_makeup(params.auto_makeup)
    if params.bypass is not None:
        await engine.set_compressor_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_compressor_parameters()}


@router.post("/compressor/bypass/{bypass}")
async def set_compressor_bypass(bypass: bool) -> Dict[str, Any]:
    """Set compressor bypass state."""
    engine = get_audio_engine()
    await engine.set_compressor_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Limiter Routes
# ========================================

@router.get("/limiter")
async def get_limiter() -> Dict[str, Any]:
    """Get limiter parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_limiter_parameters()
    metering = await engine.get_limiter_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/limiter/parameters")
async def get_limiter_parameters() -> Dict[str, Any]:
    """Get limiter parameters only."""
    engine = get_audio_engine()
    return await engine.get_limiter_parameters()


@router.get("/limiter/metering")
async def get_limiter_metering() -> Dict[str, float]:
    """Get limiter metering data."""
    engine = get_audio_engine()
    return await engine.get_limiter_metering()


@router.patch("/limiter")
async def update_limiter(params: LimiterParams) -> Dict[str, Any]:
    """Update limiter parameters."""
    engine = get_audio_engine()

    if params.threshold is not None:
        await engine.set_limiter_threshold(params.threshold)
    if params.release is not None:
        await engine.set_limiter_release(params.release)
    if params.bypass is not None:
        await engine.set_limiter_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_limiter_parameters()}


@router.post("/limiter/bypass/{bypass}")
async def set_limiter_bypass(bypass: bool) -> Dict[str, Any]:
    """Set limiter bypass state."""
    engine = get_audio_engine()
    await engine.set_limiter_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Noise Gate Routes
# ========================================

@router.get("/gate")
async def get_gate() -> Dict[str, Any]:
    """Get noise gate parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_gate_parameters()
    metering = await engine.get_gate_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/gate/parameters")
async def get_gate_parameters() -> Dict[str, Any]:
    """Get noise gate parameters only."""
    engine = get_audio_engine()
    return await engine.get_gate_parameters()


@router.get("/gate/metering")
async def get_gate_metering() -> Dict[str, float]:
    """Get noise gate metering data."""
    engine = get_audio_engine()
    return await engine.get_gate_metering()


@router.patch("/gate")
async def update_gate(params: GateParams) -> Dict[str, Any]:
    """Update noise gate parameters."""
    engine = get_audio_engine()

    if params.threshold is not None:
        await engine.set_gate_threshold(params.threshold)
    if params.ratio is not None:
        await engine.set_gate_ratio(params.ratio)
    if params.attack is not None:
        await engine.set_gate_attack(params.attack)
    if params.release is not None:
        await engine.set_gate_release(params.release)
    if params.bypass is not None:
        await engine.set_gate_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_gate_parameters()}


@router.post("/gate/bypass/{bypass}")
async def set_gate_bypass(bypass: bool) -> Dict[str, Any]:
    """Set noise gate bypass state."""
    engine = get_audio_engine()
    await engine.set_gate_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Combined Dynamics Routes
# ========================================

@router.get("/")
async def get_all_dynamics() -> Dict[str, Any]:
    """Get all dynamics processor states."""
    engine = get_audio_engine()

    return {
        "compressor": {
            "parameters": await engine.get_compressor_parameters(),
            "metering": await engine.get_compressor_metering()
        },
        "limiter": {
            "parameters": await engine.get_limiter_parameters(),
            "metering": await engine.get_limiter_metering()
        },
        "gate": {
            "parameters": await engine.get_gate_parameters(),
            "metering": await engine.get_gate_metering()
        }
    }


@router.get("/metering")
async def get_dynamics_metering() -> Dict[str, Dict[str, float]]:
    """Get all dynamics metering data (for real-time display)."""
    engine = get_audio_engine()
    return await engine.get_dynamics_metering()
