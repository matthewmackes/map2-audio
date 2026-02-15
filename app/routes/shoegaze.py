"""
ShoeGaze Multi-Effect API Routes
Wall of Sound effect inspired by boutique ambient and shimmer pedals
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/shoegaze", tags=["shoegaze"])


# ========================================
# ShoeGaze Models
# ========================================

class ShoeGazeParams(BaseModel):
    """ShoeGaze multi-effect parameters"""
    # Primary controls
    atmosphere: Optional[float] = Field(None, ge=0.0, le=100.0, description="Master dreamy amount %")
    decay: Optional[float] = Field(None, ge=0.5, le=30.0, description="Reverb decay time in seconds")
    shimmer: Optional[float] = Field(None, ge=0.0, le=100.0, description="Shimmer amount %")
    shimmer_pitch: Optional[float] = Field(None, ge=-12.0, le=24.0, description="Shimmer pitch in semitones")
    modulation: Optional[float] = Field(None, ge=0.0, le=100.0, description="Chorus modulation depth %")
    mod_rate: Optional[float] = Field(None, ge=0.1, le=5.0, description="Modulation rate in Hz")
    drive: Optional[float] = Field(None, ge=0.0, le=100.0, description="Saturation drive %")
    delay_time: Optional[float] = Field(None, ge=0.0, le=1000.0, description="Delay time in ms")
    delay_feedback: Optional[float] = Field(None, ge=0.0, le=90.0, description="Delay feedback %")
    delay_mod: Optional[float] = Field(None, ge=0.0, le=100.0, description="Delay modulation/BBD wobble %")
    low_cut: Optional[float] = Field(None, ge=20.0, le=2000.0, description="Low cut frequency in Hz")
    high_cut: Optional[float] = Field(None, ge=1000.0, le=20000.0, description="High cut frequency in Hz")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet/dry mix %")
    stereo_width: Optional[float] = Field(None, ge=0.0, le=200.0, description="Stereo width %")

    # Advanced controls
    reverb_diffusion: Optional[float] = Field(None, ge=0.0, le=100.0, description="Reverb diffusion %")
    reverb_damping: Optional[float] = Field(None, ge=0.0, le=100.0, description="Reverb damping %")
    shimmer_feedback: Optional[float] = Field(None, ge=0.0, le=80.0, description="Shimmer feedback %")
    chorus_voices: Optional[int] = Field(None, ge=1, le=6, description="Number of chorus voices")
    ducking: Optional[float] = Field(None, ge=0.0, le=100.0, description="Ducking amount %")

    # State
    preset: Optional[str] = Field(None, description="Preset name")
    spillover: Optional[bool] = Field(None, description="Enable spillover (tails when bypassed)")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class ShoeGazeMetering(BaseModel):
    """ShoeGaze metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    reverb_level_l: float
    reverb_level_r: float
    shimmer_level: float
    saturation_amount: float
    chorus_lfo_phase: float
    delay_mod_phase: float
    ducking_gain: float


class ShoeGazePresetInfo(BaseModel):
    """ShoeGaze preset information"""
    id: str
    name: str
    artist: str
    description: str


# ========================================
# ShoeGaze Routes
# ========================================

@router.get("")
async def get_shoegaze() -> Dict[str, Any]:
    """Get ShoeGaze parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_shoegaze_parameters()
    metering = await engine.get_shoegaze_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_shoegaze_parameters() -> Dict[str, Any]:
    """Get ShoeGaze parameters only."""
    engine = get_audio_engine()
    return await engine.get_shoegaze_parameters()


@router.get("/metering")
async def get_shoegaze_metering() -> Dict[str, float]:
    """Get ShoeGaze metering data."""
    engine = get_audio_engine()
    return await engine.get_shoegaze_metering()


@router.patch("/parameters")
async def update_shoegaze_parameters(params: ShoeGazeParams) -> Dict[str, Any]:
    """Update ShoeGaze parameters."""
    engine = get_audio_engine()

    # Primary controls
    if params.atmosphere is not None:
        await engine.set_shoegaze_atmosphere(params.atmosphere)
    if params.decay is not None:
        await engine.set_shoegaze_decay(params.decay)
    if params.shimmer is not None:
        await engine.set_shoegaze_shimmer(params.shimmer)
    if params.shimmer_pitch is not None:
        await engine.set_shoegaze_shimmer_pitch(params.shimmer_pitch)
    if params.modulation is not None:
        await engine.set_shoegaze_modulation(params.modulation)
    if params.mod_rate is not None:
        await engine.set_shoegaze_mod_rate(params.mod_rate)
    if params.drive is not None:
        await engine.set_shoegaze_drive(params.drive)
    if params.delay_time is not None:
        await engine.set_shoegaze_delay_time(params.delay_time)
    if params.delay_feedback is not None:
        await engine.set_shoegaze_delay_feedback(params.delay_feedback)
    if params.delay_mod is not None:
        await engine.set_shoegaze_delay_mod(params.delay_mod)
    if params.low_cut is not None:
        await engine.set_shoegaze_low_cut(params.low_cut)
    if params.high_cut is not None:
        await engine.set_shoegaze_high_cut(params.high_cut)
    if params.mix is not None:
        await engine.set_shoegaze_mix(params.mix)
    if params.stereo_width is not None:
        await engine.set_shoegaze_stereo_width(params.stereo_width)

    # Advanced controls
    if params.reverb_diffusion is not None:
        await engine.set_shoegaze_reverb_diffusion(params.reverb_diffusion)
    if params.reverb_damping is not None:
        await engine.set_shoegaze_reverb_damping(params.reverb_damping)
    if params.shimmer_feedback is not None:
        await engine.set_shoegaze_shimmer_feedback(params.shimmer_feedback)
    if params.chorus_voices is not None:
        await engine.set_shoegaze_chorus_voices(params.chorus_voices)
    if params.ducking is not None:
        await engine.set_shoegaze_ducking(params.ducking)

    # State
    if params.preset is not None:
        await engine.set_shoegaze_preset(params.preset)
    if params.spillover is not None:
        await engine.set_shoegaze_spillover(params.spillover)
    if params.bypass is not None:
        await engine.set_shoegaze_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_shoegaze_parameters()}


@router.post("/bypass/{bypass}")
async def set_shoegaze_bypass(bypass: bool) -> Dict[str, Any]:
    """Set ShoeGaze bypass state."""
    engine = get_audio_engine()
    await engine.set_shoegaze_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/preset/{preset_name}")
async def load_shoegaze_preset(preset_name: str) -> Dict[str, Any]:
    """Load a ShoeGaze preset by name."""
    engine = get_audio_engine()
    await engine.set_shoegaze_preset(preset_name)
    return {
        "status": "ok",
        "preset": preset_name,
        "parameters": await engine.get_shoegaze_parameters()
    }


@router.get("/presets")
async def get_shoegaze_presets() -> List[Dict[str, str]]:
    """Get all available ShoeGaze presets."""
    engine = get_audio_engine()
    return await engine.get_shoegaze_presets()
