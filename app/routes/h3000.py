"""
Ultra-Harmonizer API Routes
Pitch shifting and effects emulation with 10 legendary algorithms
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

router = APIRouter(prefix="/api/engine/h3000", tags=["h3000"])

H3000_PLUGIN_URI = "map2://juce/pitch/h3000"


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


def _as_int(value: float) -> int:
    return int(round(float(value)))


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

H3000_PARAMETER_SPECS: _ParameterSpec = {
    "pitch_l": ("pitch_l", 0.0, _as_float),
    "pitch_r": ("pitch_r", 0.0, _as_float),
    "delay_l": ("delay_l", 15.0, _as_float),
    "delay_r": ("delay_r", 20.0, _as_float),
    "feedback": ("feedback", 0.0, _as_float),
    "cross_feedback": ("cross_feedback", 0.0, _as_float),
    "mod_depth": ("mod_depth", 0.0, _as_float),
    "mod_rate": ("mod_rate", 0.5, _as_float),
    "low_cut": ("low_cut", 80.0, _as_float),
    "high_cut": ("high_cut", 12000.0, _as_float),
    "mix": ("mix", 50.0, _as_float),
    "level_l": ("level_l", 100.0, _as_float),
    "level_r": ("level_r", 100.0, _as_float),
    "glide": ("glide", 0.0, _as_float),
    "bypass": ("bypass", 0.0, _as_bool),
}

DEFAULT_H3000_METERING = {
    "input_level_l": -100.0,
    "input_level_r": -100.0,
    "output_level_l": -100.0,
    "output_level_r": -100.0,
    "pitch_l_actual": 0.0,
    "pitch_r_actual": 0.0,
    "delay_l_actual": 0.0,
    "delay_r_actual": 0.0,
    "mod_phase": 0.0,
}


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


async def _resolve_h3000_instance(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    scoped_instance_id = await resolve_scoped_instance_id(
        engine,
        H3000_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None and is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found("H3000", instance_id, plugin_position)
    return scoped_instance_id


async def _read_scoped_h3000_parameters(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for response_key, (symbol, default, parser) in H3000_PARAMETER_SPECS.items():
        payload[response_key] = parser(
            await read_scoped_actual_parameter(
                engine,
                H3000_PLUGIN_URI,
                symbol,
                scoped_instance_id,
                plugin_position,
                default,
            )
        )

    algorithms = await engine.get_h3000_algorithms()
    algorithm_index = _as_int(
        await read_scoped_actual_parameter(
            engine,
            H3000_PLUGIN_URI,
            "algorithm",
            scoped_instance_id,
            plugin_position,
            0.0,
        )
    )
    algorithm_index = max(0, min(len(algorithms) - 1, algorithm_index)) if algorithms else 0
    payload["algorithm_index"] = algorithm_index
    payload["algorithm"] = algorithms[algorithm_index]["id"] if algorithms else "micropitch"
    return payload


async def _read_scoped_h3000_metering(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, H3000_PLUGIN_URI, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_H3000_METERING)
    return {
        "input_level_l": _extract_db_level(levels, "input_level_l", "input_left", "input"),
        "input_level_r": _extract_db_level(levels, "input_level_r", "input_right", "input"),
        "output_level_l": _extract_db_level(levels, "output_level_l", "output_left", "output"),
        "output_level_r": _extract_db_level(levels, "output_level_r", "output_right", "output"),
        "pitch_l_actual": _coerce_float(levels.get("pitch_l_actual"), 0.0),
        "pitch_r_actual": _coerce_float(levels.get("pitch_r_actual"), 0.0),
        "delay_l_actual": _coerce_float(levels.get("delay_l_actual"), 0.0),
        "delay_r_actual": _coerce_float(levels.get("delay_r_actual"), 0.0),
        "mod_phase": _coerce_float(levels.get("mod_phase"), 0.0),
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
    raise HTTPException(status_code=400, detail=f"Unknown H3000 algorithm: {algorithm_name}")


# ========================================
# H3000 Routes
# ========================================

@router.get("")
async def get_h3000(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get H3000 parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return {
            "parameters": await _read_scoped_h3000_parameters(engine, scoped_instance_id, plugin_position),
            "metering": await _read_scoped_h3000_metering(engine, scoped_instance_id, plugin_position),
        }
    params = await engine.get_h3000_parameters()
    metering = await engine.get_h3000_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_h3000_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get H3000 parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_h3000_parameters(engine, scoped_instance_id, plugin_position)
    return await engine.get_h3000_parameters()


@router.get("/metering")
async def get_h3000_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get H3000 metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_h3000_metering(engine, scoped_instance_id, plugin_position)
    return await engine.get_h3000_metering()


@router.patch("/parameters")
async def update_h3000_parameters(
    params: H3000Params,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update H3000 parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        algorithms = await engine.get_h3000_algorithms()
        if params.algorithm is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "algorithm", params.algorithm, scoped_instance_id, plugin_position)
        if params.algorithm_name is not None:
            await set_scoped_actual_parameter(
                engine,
                H3000_PLUGIN_URI,
                "algorithm",
                _resolve_algorithm_index(algorithms, params.algorithm_name),
                scoped_instance_id,
                plugin_position,
            )
        if params.pitch_l is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "pitch_l", params.pitch_l, scoped_instance_id, plugin_position)
        if params.pitch_r is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "pitch_r", params.pitch_r, scoped_instance_id, plugin_position)
        if params.delay_l is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "delay_l", params.delay_l, scoped_instance_id, plugin_position)
        if params.delay_r is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "delay_r", params.delay_r, scoped_instance_id, plugin_position)
        if params.feedback is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "feedback", params.feedback, scoped_instance_id, plugin_position)
        if params.cross_feedback is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "cross_feedback", params.cross_feedback, scoped_instance_id, plugin_position)
        if params.mod_depth is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "mod_depth", params.mod_depth, scoped_instance_id, plugin_position)
        if params.mod_rate is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "mod_rate", params.mod_rate, scoped_instance_id, plugin_position)
        if params.low_cut is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "low_cut", params.low_cut, scoped_instance_id, plugin_position)
        if params.high_cut is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "high_cut", params.high_cut, scoped_instance_id, plugin_position)
        if params.mix is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "mix", params.mix, scoped_instance_id, plugin_position)
        if params.level_l is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "level_l", params.level_l, scoped_instance_id, plugin_position)
        if params.level_r is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "level_r", params.level_r, scoped_instance_id, plugin_position)
        if params.glide is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "glide", params.glide, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_h3000_parameters(engine, scoped_instance_id, plugin_position),
        }

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
async def set_h3000_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set H3000 bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_h3000_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/algorithm/{algorithm_index}")
async def load_h3000_algorithm(
    algorithm_index: int,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Load an H3000 algorithm by index (0-9)."""
    if algorithm_index < 0 or algorithm_index > 9:
        raise HTTPException(status_code=400, detail="Algorithm index must be 0-9")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_h3000_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, H3000_PLUGIN_URI, "algorithm", algorithm_index, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "algorithm": algorithm_index,
            "parameters": await _read_scoped_h3000_parameters(engine, scoped_instance_id, plugin_position),
        }
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
