"""
Lexi Love PCM 70 Reverb API Routes
Lexicon PCM 70 algorithmic reverb emulation with 9 legendary presets
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/lexilove", tags=["lexilove"])


# ========================================
# Lexi Love Models
# ========================================

class LexiLoveParams(BaseModel):
    """Lexi Love PCM 70 reverb parameters"""
    # Algorithm
    algorithm: Optional[int] = Field(None, ge=0, le=8, description="Algorithm index (0-8)")
    algorithm_name: Optional[str] = Field(None, description="Algorithm name")

    # Core parameters
    pre_delay: Optional[float] = Field(None, ge=0.0, le=500.0, description="Pre-delay in ms")
    decay_time: Optional[float] = Field(None, ge=0.5, le=30.0, description="Decay time in seconds")
    diffusion: Optional[float] = Field(None, ge=0.0, le=100.0, description="Diffusion %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet/dry mix %")
    high_cut: Optional[float] = Field(None, ge=1000.0, le=20000.0, description="High cut frequency in Hz")
    low_cut: Optional[float] = Field(None, ge=20.0, le=500.0, description="Low cut frequency in Hz")

    # Multi-band decay (Lexicon signature)
    low_decay_mult: Optional[float] = Field(None, ge=0.25, le=2.0, description="Low frequency decay multiplier")
    high_decay_mult: Optional[float] = Field(None, ge=0.25, le=2.0, description="High frequency decay multiplier")
    low_crossover: Optional[float] = Field(None, ge=100.0, le=2000.0, description="Low crossover frequency in Hz")
    high_crossover: Optional[float] = Field(None, ge=2000.0, le=15000.0, description="High crossover frequency in Hz")

    # Early reflections
    early_level: Optional[float] = Field(None, ge=0.0, le=100.0, description="Early reflection level %")
    early_pattern: Optional[float] = Field(None, ge=0.0, le=100.0, description="Early reflection pattern/density %")

    # Modulation (sparkle)
    mod_depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    mod_rate: Optional[float] = Field(None, ge=0.1, le=10.0, description="Modulation rate in Hz")

    # State
    spillover: Optional[bool] = Field(None, description="Enable spillover (tails when bypassed)")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class LexiLoveMetering(BaseModel):
    """Lexi Love metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    reverb_level_l: float
    reverb_level_r: float
    early_level: float
    late_level: float
    mod_lfo_phase: float
    current_decay: float


class LexiLoveAlgorithmInfo(BaseModel):
    """Lexi Love algorithm information"""
    index: int
    id: str
    name: str
    short_name: str
    description: str


# ========================================
# Lexi Love Routes
# ========================================

@router.get("")
async def get_lexilove() -> Dict[str, Any]:
    """Get Lexi Love parameters and metering."""
    engine = get_audio_engine()
    params = await engine.get_lexilove_parameters()
    metering = await engine.get_lexilove_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_lexilove_parameters() -> Dict[str, Any]:
    """Get Lexi Love parameters only."""
    engine = get_audio_engine()
    return await engine.get_lexilove_parameters()


@router.get("/metering")
async def get_lexilove_metering() -> Dict[str, float]:
    """Get Lexi Love metering data."""
    engine = get_audio_engine()
    return await engine.get_lexilove_metering()


@router.patch("/parameters")
async def update_lexilove_parameters(params: LexiLoveParams) -> Dict[str, Any]:
    """Update Lexi Love parameters."""
    engine = get_audio_engine()

    # Algorithm
    if params.algorithm is not None:
        await engine.set_lexilove_algorithm(params.algorithm)
    if params.algorithm_name is not None:
        await engine.set_lexilove_algorithm_by_name(params.algorithm_name)

    # Core parameters
    if params.pre_delay is not None:
        await engine.set_lexilove_pre_delay(params.pre_delay)
    if params.decay_time is not None:
        await engine.set_lexilove_decay_time(params.decay_time)
    if params.diffusion is not None:
        await engine.set_lexilove_diffusion(params.diffusion)
    if params.mix is not None:
        await engine.set_lexilove_mix(params.mix)
    if params.high_cut is not None:
        await engine.set_lexilove_high_cut(params.high_cut)
    if params.low_cut is not None:
        await engine.set_lexilove_low_cut(params.low_cut)

    # Multi-band decay
    if params.low_decay_mult is not None:
        await engine.set_lexilove_low_decay_mult(params.low_decay_mult)
    if params.high_decay_mult is not None:
        await engine.set_lexilove_high_decay_mult(params.high_decay_mult)
    if params.low_crossover is not None:
        await engine.set_lexilove_low_crossover(params.low_crossover)
    if params.high_crossover is not None:
        await engine.set_lexilove_high_crossover(params.high_crossover)

    # Early reflections
    if params.early_level is not None:
        await engine.set_lexilove_early_level(params.early_level)
    if params.early_pattern is not None:
        await engine.set_lexilove_early_pattern(params.early_pattern)

    # Modulation
    if params.mod_depth is not None:
        await engine.set_lexilove_mod_depth(params.mod_depth)
    if params.mod_rate is not None:
        await engine.set_lexilove_mod_rate(params.mod_rate)

    # State
    if params.spillover is not None:
        await engine.set_lexilove_spillover(params.spillover)
    if params.bypass is not None:
        await engine.set_lexilove_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_lexilove_parameters()}


@router.post("/bypass/{bypass}")
async def set_lexilove_bypass(bypass: bool) -> Dict[str, Any]:
    """Set Lexi Love bypass state."""
    engine = get_audio_engine()
    await engine.set_lexilove_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/algorithm/{algorithm_index}")
async def load_lexilove_algorithm(algorithm_index: int) -> Dict[str, Any]:
    """Load a Lexi Love algorithm by index (0-8)."""
    if algorithm_index < 0 or algorithm_index > 8:
        raise HTTPException(status_code=400, detail="Algorithm index must be 0-8")

    engine = get_audio_engine()
    await engine.set_lexilove_algorithm(algorithm_index)
    return {
        "status": "ok",
        "algorithm": algorithm_index,
        "parameters": await engine.get_lexilove_parameters()
    }


@router.get("/algorithms")
async def get_lexilove_algorithms() -> List[Dict[str, Any]]:
    """Get all available Lexi Love algorithms."""
    engine = get_audio_engine()
    return await engine.get_lexilove_algorithms()
