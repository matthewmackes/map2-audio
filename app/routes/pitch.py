"""
Pitch Processing API Routes
Boss XS-1 Polyphonic Pitch Shifter
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/pitch", tags=["pitch"])


# ========================================
# Boss XS-1 Models
# ========================================

class BossXS1Params(BaseModel):
    """Boss XS-1 parameters"""
    shift_amount: Optional[float] = Field(None, ge=-7.0, le=7.0, description="Pitch shift in semitones")
    balance: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet/dry balance %")
    detune_mode: Optional[bool] = Field(None, description="True for detune mode, false for shift mode")
    detune_amount: Optional[float] = Field(None, ge=-20.0, le=20.0, description="Detune in cents")
    glide: Optional[float] = Field(None, ge=0.0, le=100.0, description="Glide time in ms")
    feedback: Optional[float] = Field(None, ge=0.0, le=0.7, description="Feedback 0-0.7")
    pedal_enabled: Optional[bool] = Field(None, description="Expression pedal enabled")
    pedal_position: Optional[float] = Field(None, ge=0.0, le=100.0, description="Pedal position %")
    pedal_min: Optional[float] = Field(None, ge=-36.0, le=36.0, description="Pedal min semitones")
    pedal_max: Optional[float] = Field(None, ge=-36.0, le=36.0, description="Pedal max semitones")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class BossXS1Metering(BaseModel):
    """Boss XS-1 metering data"""
    input_level: float
    output_level: float


class BossXS1PresetInfo(BaseModel):
    """Boss XS-1 preset information"""
    id: str
    name: str
    category: str
    shift_amount: float
    detune_mode: bool
    detune_amount: float


# ========================================
# Boss XS-1 Routes
# ========================================

@router.get("/boss-xs1")
async def get_boss_xs1() -> Dict[str, Any]:
    """Get Boss XS-1 parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_boss_xs1_parameters()
    metering = await engine.get_boss_xs1_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/boss-xs1/parameters")
async def get_boss_xs1_parameters() -> Dict[str, Any]:
    """Get Boss XS-1 parameters only."""
    engine = get_audio_engine()
    return await engine.get_boss_xs1_parameters()


@router.get("/boss-xs1/metering")
async def get_boss_xs1_metering() -> Dict[str, float]:
    """Get Boss XS-1 metering data."""
    engine = get_audio_engine()
    return await engine.get_boss_xs1_metering()


@router.patch("/boss-xs1/parameters")
async def update_boss_xs1_parameters(params: BossXS1Params) -> Dict[str, Any]:
    """Update Boss XS-1 parameters."""
    engine = get_audio_engine()

    if params.shift_amount is not None:
        await engine.set_boss_xs1_shift_amount(params.shift_amount)
    if params.balance is not None:
        await engine.set_boss_xs1_balance(params.balance)
    if params.detune_mode is not None:
        await engine.set_boss_xs1_detune_mode(params.detune_mode)
    if params.detune_amount is not None:
        await engine.set_boss_xs1_detune_amount(params.detune_amount)
    if params.glide is not None:
        await engine.set_boss_xs1_glide(params.glide)
    if params.feedback is not None:
        await engine.set_boss_xs1_feedback(params.feedback)
    if params.pedal_enabled is not None:
        await engine.set_boss_xs1_pedal_enabled(params.pedal_enabled)
    if params.pedal_position is not None:
        await engine.set_boss_xs1_pedal_position(params.pedal_position)
    if params.pedal_min is not None and params.pedal_max is not None:
        await engine.set_boss_xs1_pedal_range(params.pedal_min, params.pedal_max)
    elif params.pedal_min is not None:
        current_max = await engine.get_boss_xs1_pedal_max()
        await engine.set_boss_xs1_pedal_range(params.pedal_min, current_max)
    elif params.pedal_max is not None:
        current_min = await engine.get_boss_xs1_pedal_min()
        await engine.set_boss_xs1_pedal_range(current_min, params.pedal_max)
    if params.bypass is not None:
        await engine.set_boss_xs1_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_boss_xs1_parameters()}


@router.post("/boss-xs1/preset/{preset_index}")
async def set_boss_xs1_preset(preset_index: int) -> Dict[str, Any]:
    """
    Set Boss XS-1 to a preset.

    Preset Categories:
    - Tuning: Drop D, Drop D#, Half Step Down
    - Capo: 2nd Fret, 3rd Fret, 5th Fret
    - Octave: Octave Up, Octave Down, Sub Bass
    - Doubling: Micro Pitch, Voice Doubling
    - Creative: Unique Intervals, Minor Third
    """
    if preset_index < 0 or preset_index > 22:
        raise HTTPException(status_code=400, detail="Invalid preset index (0-22)")

    engine = get_audio_engine()
    await engine.set_boss_xs1_preset(preset_index)

    return {
        "status": "ok",
        "preset": preset_index,
        "parameters": await engine.get_boss_xs1_parameters()
    }


@router.post("/boss-xs1/bypass/{bypass}")
async def set_boss_xs1_bypass(bypass: bool) -> Dict[str, Any]:
    """Set Boss XS-1 bypass state."""
    engine = get_audio_engine()
    await engine.set_boss_xs1_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.get("/boss-xs1/presets")
async def get_boss_xs1_presets() -> List[Dict[str, Any]]:
    """
    Get all Boss XS-1 presets.

    Categories:
    - tuning: Drop tunings (Drop D, Half step down, etc.)
    - capo: Capo simulation (2nd fret, 3rd fret, etc.)
    - octave: Octave effects (Octave up, Sub bass, etc.)
    - doubling: Micro pitch and doubling effects
    - creative: Unique intervals and modulation effects
    """
    engine = get_audio_engine()
    return await engine.get_boss_xs1_presets()
