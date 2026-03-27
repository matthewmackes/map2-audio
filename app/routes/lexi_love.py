"""
Lexi Love PCM 70 Reverb API Routes
Algorithmic reverb emulation with 9 legendary presets
"""

from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.routes.scoped_plugin_utils import (
    actual_to_bool,
    get_scoped_vu_levels,
    is_scoped_request,
    linear_peak_to_db,
    raise_scoped_not_found,
    read_scoped_actual_parameter,
    resolve_scoped_instance_id,
    set_scoped_actual_parameter,
)
from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/engine/lexilove", tags=["lexilove"])

LEXI_LOVE_PLUGIN_URI = "map2://juce/reverb/pcm70"


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


def _as_int(value: float) -> int:
    return int(round(float(value)))


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

LEXI_LOVE_PARAMETER_SPECS: _ParameterSpec = {
    "pre_delay": ("pre_delay", 40.0, _as_float),
    "decay_time": ("decay_time", 2.5, _as_float),
    "diffusion": ("diffusion", 85.0, _as_float),
    "mix": ("mix", 35.0, _as_float),
    "high_cut": ("high_cut", 12000.0, _as_float),
    "low_cut": ("low_cut", 40.0, _as_float),
    "low_decay_mult": ("low_decay_mult", 1.0, _as_float),
    "high_decay_mult": ("high_decay_mult", 0.8, _as_float),
    "low_crossover": ("low_crossover", 500.0, _as_float),
    "high_crossover": ("high_crossover", 9000.0, _as_float),
    "early_level": ("early_level", 70.0, _as_float),
    "early_pattern": ("early_pattern", 50.0, _as_float),
    "mod_depth": ("mod_depth", 15.0, _as_float),
    "mod_rate": ("mod_rate", 0.8, _as_float),
    "spillover": ("spillover", 1.0, _as_bool),
    "bypass": ("bypass", 0.0, _as_bool),
}

DEFAULT_LEXI_LOVE_METERING = {
    "input_level_l": -100.0,
    "input_level_r": -100.0,
    "output_level_l": -100.0,
    "output_level_r": -100.0,
    "reverb_level_l": -100.0,
    "reverb_level_r": -100.0,
    "early_level": -100.0,
    "late_level": -100.0,
    "mod_lfo_phase": 0.0,
    "current_decay": 2.5,
}


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

    # Multi-band decay
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


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_db_level(levels: dict[str, Any], direct_key: str, *linear_keys: str) -> float:
    if direct_key in levels:
        return _coerce_float(levels[direct_key], -100.0)
    linear_values: list[float] = []
    for key in linear_keys:
        if key not in levels:
            continue
        linear_values.append(_coerce_float(levels[key], 0.0))
    if not linear_values:
        return -100.0
    return linear_peak_to_db(max(linear_values))


async def _resolve_lexi_love_instance(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    scoped_instance_id = await resolve_scoped_instance_id(
        engine,
        LEXI_LOVE_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None and is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found("Lexi Love", instance_id, plugin_position)
    return scoped_instance_id


async def _read_scoped_lexi_love_parameters(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for response_key, (symbol, default, parser) in LEXI_LOVE_PARAMETER_SPECS.items():
        payload[response_key] = parser(
            await read_scoped_actual_parameter(
                engine,
                LEXI_LOVE_PLUGIN_URI,
                symbol,
                scoped_instance_id,
                plugin_position,
                default,
            )
        )

    algorithms = await engine.get_lexilove_algorithms()
    algorithm_index = _as_int(
        await read_scoped_actual_parameter(
            engine,
            LEXI_LOVE_PLUGIN_URI,
            "algorithm",
            scoped_instance_id,
            plugin_position,
            1.0,
        )
    )
    algorithm_index = max(0, min(len(algorithms) - 1, algorithm_index)) if algorithms else 1
    payload["algorithm_index"] = algorithm_index
    payload["algorithm"] = algorithms[algorithm_index]["id"] if algorithms else "rich_plate"
    return payload


async def _read_scoped_lexi_love_metering(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, LEXI_LOVE_PLUGIN_URI, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_LEXI_LOVE_METERING)
    return {
        "input_level_l": _extract_db_level(levels, "input_level_l", "input_left", "input"),
        "input_level_r": _extract_db_level(levels, "input_level_r", "input_right", "input"),
        "output_level_l": _extract_db_level(levels, "output_level_l", "output_left", "output"),
        "output_level_r": _extract_db_level(levels, "output_level_r", "output_right", "output"),
        "reverb_level_l": _coerce_float(levels.get("reverb_level_l"), -100.0),
        "reverb_level_r": _coerce_float(levels.get("reverb_level_r"), -100.0),
        "early_level": _coerce_float(levels.get("early_level"), -100.0),
        "late_level": _coerce_float(levels.get("late_level"), -100.0),
        "mod_lfo_phase": _coerce_float(levels.get("mod_lfo_phase"), 0.0),
        "current_decay": _coerce_float(levels.get("current_decay"), 2.5),
    }


def _resolve_algorithm_index(algorithms: list[dict[str, Any]], algorithm_name: str) -> int:
    normalized = algorithm_name.strip().lower()
    for algorithm in algorithms:
        candidates = {
            str(algorithm.get("id", "")).lower(),
            str(algorithm.get("name", "")).lower(),
            str(algorithm.get("short_name", "")).lower(),
        }
        if normalized in candidates:
            return int(algorithm.get("index", 0))
    raise HTTPException(status_code=400, detail=f"Unknown Lexi Love algorithm: {algorithm_name}")


# ========================================
# Lexi Love Routes
# ========================================

@router.get("")
async def get_lexilove(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get Lexi Love parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return {
            "parameters": await _read_scoped_lexi_love_parameters(engine, scoped_instance_id, plugin_position),
            "metering": await _read_scoped_lexi_love_metering(engine, scoped_instance_id, plugin_position),
        }
    params = await engine.get_lexilove_parameters()
    metering = await engine.get_lexilove_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_lexilove_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get Lexi Love parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_lexi_love_parameters(engine, scoped_instance_id, plugin_position)
    return await engine.get_lexilove_parameters()


@router.get("/metering")
async def get_lexilove_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get Lexi Love metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_lexi_love_metering(engine, scoped_instance_id, plugin_position)
    return await engine.get_lexilove_metering()


@router.patch("/parameters")
async def update_lexilove_parameters(
    params: LexiLoveParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update Lexi Love parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        algorithms = await engine.get_lexilove_algorithms()
        if params.algorithm is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "algorithm", params.algorithm, scoped_instance_id, plugin_position)
        if params.algorithm_name is not None:
            await set_scoped_actual_parameter(
                engine,
                LEXI_LOVE_PLUGIN_URI,
                "algorithm",
                _resolve_algorithm_index(algorithms, params.algorithm_name),
                scoped_instance_id,
                plugin_position,
            )
        if params.pre_delay is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "pre_delay", params.pre_delay, scoped_instance_id, plugin_position)
        if params.decay_time is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "decay_time", params.decay_time, scoped_instance_id, plugin_position)
        if params.diffusion is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "diffusion", params.diffusion, scoped_instance_id, plugin_position)
        if params.mix is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "mix", params.mix, scoped_instance_id, plugin_position)
        if params.high_cut is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "high_cut", params.high_cut, scoped_instance_id, plugin_position)
        if params.low_cut is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "low_cut", params.low_cut, scoped_instance_id, plugin_position)
        if params.low_decay_mult is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "low_decay_mult", params.low_decay_mult, scoped_instance_id, plugin_position)
        if params.high_decay_mult is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "high_decay_mult", params.high_decay_mult, scoped_instance_id, plugin_position)
        if params.low_crossover is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "low_crossover", params.low_crossover, scoped_instance_id, plugin_position)
        if params.high_crossover is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "high_crossover", params.high_crossover, scoped_instance_id, plugin_position)
        if params.early_level is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "early_level", params.early_level, scoped_instance_id, plugin_position)
        if params.early_pattern is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "early_pattern", params.early_pattern, scoped_instance_id, plugin_position)
        if params.mod_depth is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "mod_depth", params.mod_depth, scoped_instance_id, plugin_position)
        if params.mod_rate is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "mod_rate", params.mod_rate, scoped_instance_id, plugin_position)
        if params.spillover is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "spillover", params.spillover, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_lexi_love_parameters(engine, scoped_instance_id, plugin_position),
        }

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
async def set_lexilove_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set Lexi Love bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_lexilove_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/algorithm/{algorithm_index}")
async def load_lexilove_algorithm(
    algorithm_index: int,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Load a Lexi Love algorithm by index (0-8)."""
    if algorithm_index < 0 or algorithm_index > 8:
        raise HTTPException(status_code=400, detail="Algorithm index must be 0-8")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_lexi_love_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, LEXI_LOVE_PLUGIN_URI, "algorithm", algorithm_index, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "algorithm": algorithm_index,
            "parameters": await _read_scoped_lexi_love_parameters(engine, scoped_instance_id, plugin_position),
        }
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
