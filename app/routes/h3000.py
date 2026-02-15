"""
Ultra-Harmonizer API Routes
Pitch shifting and effects emulation with 10 legendary algorithms
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/h3000", tags=["h3000"])


# ========================================
# H3000 Models
# ========================================

class H3000Params(BaseModel):
    """H3000 Ultra-Harmonizer parameters"""
    # Algorithm
    algorithm: Optional[int] = Field(None, ge=0, le=9, description="Algorithm index (0-9)")
    algorithm_name: Optional[str] = Field(None, description="Algorithm name")

    # Pitch shifting (in cents, -2400 to +2400 = -2 to +2 octaves)
    pitch_l: Optional[float] = Field(None, ge=-2400.0, le=2400.0, description="Left pitch shift in cents")
    pitch_r: Optional[float] = Field(None, ge=-2400.0, le=2400.0, description="Right pitch shift in cents")

    # Delay parameters
    delay_l: Optional[float] = Field(None, ge=0.0, le=1000.0, description="Left delay in ms")
    delay_r: Optional[float] = Field(None, ge=0.0, le=1000.0, description="Right delay in ms")

    # Feedback
    feedback: Optional[float] = Field(None, ge=0.0, le=100.0, description="Feedback amount %")
    cross_feedback: Optional[float] = Field(None, ge=0.0, le=100.0, description="Cross-channel feedback %")

    # Modulation
    mod_depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    mod_rate: Optional[float] = Field(None, ge=0.1, le=10.0, description="Modulation rate in Hz")

    # Filters
    low_cut: Optional[float] = Field(None, ge=20.0, le=500.0, description="Low cut frequency in Hz")
    high_cut: Optional[float] = Field(None, ge=2000.0, le=20000.0, description="High cut frequency in Hz")

    # Levels
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet/dry mix %")
    level_l: Optional[float] = Field(None, ge=0.0, le=100.0, description="Left output level %")
    level_r: Optional[float] = Field(None, ge=0.0, le=100.0, description="Right output level %")

    # Glide (portamento)
    glide: Optional[float] = Field(None, ge=0.0, le=1000.0, description="Pitch glide time in ms")

    # State
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class H3000Metering(BaseModel):
    """H3000 metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    pitch_l_actual: float
    pitch_r_actual: float
    delay_l_actual: float
    delay_r_actual: float
    mod_phase: float


class H3000AlgorithmInfo(BaseModel):
    """H3000 algorithm information"""
    index: int
    id: str
    name: str
    short_name: str
    description: str


# ========================================
# H3000 Routes
# ========================================

@router.get("")
async def get_h3000() -> Dict[str, Any]:
    """Get H3000 parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_h3000_parameters()
    metering = await engine.get_h3000_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_h3000_parameters() -> Dict[str, Any]:
    """Get H3000 parameters only."""
    engine = get_audio_engine()
    return await engine.get_h3000_parameters()


@router.get("/metering")
async def get_h3000_metering() -> Dict[str, float]:
    """Get H3000 metering data."""
    engine = get_audio_engine()
    return await engine.get_h3000_metering()


@router.patch("/parameters")
async def update_h3000_parameters(params: H3000Params) -> Dict[str, Any]:
    """Update H3000 parameters."""
    engine = get_audio_engine()

    # Algorithm
    if params.algorithm is not None:
        await engine.set_h3000_algorithm(params.algorithm)
    if params.algorithm_name is not None:
        await engine.set_h3000_algorithm_by_name(params.algorithm_name)

    # Pitch parameters
    if params.pitch_l is not None:
        await engine.set_h3000_pitch_l(params.pitch_l)
    if params.pitch_r is not None:
        await engine.set_h3000_pitch_r(params.pitch_r)

    # Delay parameters
    if params.delay_l is not None:
        await engine.set_h3000_delay_l(params.delay_l)
    if params.delay_r is not None:
        await engine.set_h3000_delay_r(params.delay_r)

    # Feedback
    if params.feedback is not None:
        await engine.set_h3000_feedback(params.feedback)
    if params.cross_feedback is not None:
        await engine.set_h3000_cross_feedback(params.cross_feedback)

    # Modulation
    if params.mod_depth is not None:
        await engine.set_h3000_mod_depth(params.mod_depth)
    if params.mod_rate is not None:
        await engine.set_h3000_mod_rate(params.mod_rate)

    # Filters
    if params.low_cut is not None:
        await engine.set_h3000_low_cut(params.low_cut)
    if params.high_cut is not None:
        await engine.set_h3000_high_cut(params.high_cut)

    # Levels
    if params.mix is not None:
        await engine.set_h3000_mix(params.mix)
    if params.level_l is not None:
        await engine.set_h3000_level_l(params.level_l)
    if params.level_r is not None:
        await engine.set_h3000_level_r(params.level_r)

    # Glide
    if params.glide is not None:
        await engine.set_h3000_glide(params.glide)

    # State
    if params.bypass is not None:
        await engine.set_h3000_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_h3000_parameters()}


@router.post("/bypass/{bypass}")
async def set_h3000_bypass(bypass: bool) -> Dict[str, Any]:
    """Set H3000 bypass state."""
    engine = get_audio_engine()
    await engine.set_h3000_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/algorithm/{algorithm_index}")
async def load_h3000_algorithm(algorithm_index: int) -> Dict[str, Any]:
    """Load an H3000 algorithm by index (0-9)."""
    if algorithm_index < 0 or algorithm_index > 9:
        raise HTTPException(status_code=400, detail="Algorithm index must be 0-9")

    engine = get_audio_engine()
    await engine.set_h3000_algorithm(algorithm_index)
    params = await engine.get_h3000_parameters()
    return {
        "status": "ok",
        "algorithm": algorithm_index,
        "parameters": params
    }


@router.get("/algorithms")
async def get_h3000_algorithms() -> List[Dict[str, Any]]:
    """Get all available H3000 algorithms."""
    engine = get_audio_engine()
    return await engine.get_h3000_algorithms()
