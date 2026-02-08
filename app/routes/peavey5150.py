"""
Peavey 5150 Block Letter Amp Simulator API Routes
6-stage preamp, Yeh/Smith tone stack, push-pull 6L6GC power amp
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/amp/peavey5150", tags=["peavey5150"])


# ========================================
# Peavey 5150 Models
# ========================================

class Peavey5150Params(BaseModel):
    """Peavey 5150 amplifier parameters"""
    pre_gain: Optional[float] = Field(None, ge=0.0, le=10.0, description="Preamp drive level")
    post_gain: Optional[float] = Field(None, ge=0.0, le=10.0, description="Master volume")
    low: Optional[float] = Field(None, ge=0.0, le=10.0, description="Bass tone control")
    mid: Optional[float] = Field(None, ge=0.0, le=10.0, description="Mid tone control")
    high: Optional[float] = Field(None, ge=0.0, le=10.0, description="Treble tone control")
    presence: Optional[float] = Field(None, ge=0.0, le=10.0, description="Power amp HF NFB")
    resonance: Optional[float] = Field(None, ge=0.0, le=10.0, description="Power amp LF NFB")
    bright: Optional[bool] = Field(None, description="Bright cap switch")
    bias: Optional[float] = Field(None, ge=0.0, le=10.0, description="Power tube bias")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class Peavey5150Metering(BaseModel):
    """Peavey 5150 metering data"""
    input_level: float
    output_level: float
    preamp_level: float
    power_level: float
    supply_sag: float
    cpu_load: float


# ========================================
# Routes
# ========================================

@router.get("")
async def get_peavey5150() -> Dict[str, Any]:
    """Get Peavey 5150 parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_peavey5150_parameters()
    metering = await engine.get_peavey5150_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_peavey5150_parameters() -> Dict[str, Any]:
    """Get Peavey 5150 parameters only."""
    engine = get_audio_engine()
    return await engine.get_peavey5150_parameters()


@router.get("/metering")
async def get_peavey5150_metering() -> Dict[str, float]:
    """Get Peavey 5150 metering data."""
    engine = get_audio_engine()
    return await engine.get_peavey5150_metering()


@router.patch("/parameters")
async def update_peavey5150_parameters(params: Peavey5150Params) -> Dict[str, Any]:
    """Update Peavey 5150 parameters."""
    engine = get_audio_engine()

    if params.pre_gain is not None:
        await engine.set_peavey5150_pre_gain(params.pre_gain)
    if params.post_gain is not None:
        await engine.set_peavey5150_post_gain(params.post_gain)
    if params.low is not None:
        await engine.set_peavey5150_low(params.low)
    if params.mid is not None:
        await engine.set_peavey5150_mid(params.mid)
    if params.high is not None:
        await engine.set_peavey5150_high(params.high)
    if params.presence is not None:
        await engine.set_peavey5150_presence(params.presence)
    if params.resonance is not None:
        await engine.set_peavey5150_resonance(params.resonance)
    if params.bright is not None:
        await engine.set_peavey5150_bright(params.bright)
    if params.bias is not None:
        await engine.set_peavey5150_bias(params.bias)
    if params.bypass is not None:
        await engine.set_peavey5150_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_peavey5150_parameters()}


@router.post("/bypass/{bypass}")
async def set_peavey5150_bypass(bypass: bool) -> Dict[str, Any]:
    """Set Peavey 5150 bypass state."""
    engine = get_audio_engine()
    await engine.set_peavey5150_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/preset/{preset_name}")
async def load_peavey5150_preset(preset_name: str) -> Dict[str, Any]:
    """Load a Peavey 5150 preset by name."""
    engine = get_audio_engine()
    await engine.set_peavey5150_preset(preset_name)
    return {
        "status": "ok",
        "preset": preset_name,
        "parameters": await engine.get_peavey5150_parameters()
    }


@router.get("/presets")
async def get_peavey5150_presets() -> List[Dict[str, str]]:
    """Get all available Peavey 5150 presets."""
    engine = get_audio_engine()
    return await engine.get_peavey5150_presets()
