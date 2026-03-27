"""
Pitch Processing API Routes
Boss XS-1 Polyphonic Pitch Shifter
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

router = APIRouter(prefix="/api/engine/pitch", tags=["pitch"])

BOSS_XS1_PLUGIN_URI = "map2://juce/pitch/boss-xs1"


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


def _as_int(value: float) -> int:
    return int(round(float(value)))


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

BOSS_XS1_PARAMETER_SPECS: _ParameterSpec = {
    "shift_amount": ("shift_amount", 0.0, _as_float),
    "balance": ("balance", 50.0, _as_float),
    "detune_mode": ("detune_mode", 0.0, _as_bool),
    "detune_amount": ("detune_amount", 20.0, _as_float),
    "glide": ("glide", 0.0, _as_float),
    "feedback": ("feedback", 0.0, _as_float),
    "pedal_enabled": ("pedal_enabled", 0.0, _as_bool),
    "pedal_position": ("pedal_position", 0.0, _as_float),
    "pedal_min": ("pedal_min", -7.0, _as_float),
    "pedal_max": ("pedal_max", 7.0, _as_float),
    "preset": ("preset", 0.0, _as_int),
    "bypass": ("bypass", 0.0, _as_bool),
}

DEFAULT_BOSS_XS1_METERING = {
    "input_level": -100.0,
    "output_level": -100.0,
}


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


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_db_level(levels: dict[str, Any], direct_key: str, *linear_keys: str) -> float:
    if direct_key in levels:
        return _coerce_float(levels[direct_key], -100.0)
    peak_values: list[float] = []
    for key in linear_keys:
        if key not in levels:
            continue
        peak_values.append(_coerce_float(levels[key], 0.0))
    if not peak_values:
        return -100.0
    return linear_peak_to_db(max(peak_values))


async def _resolve_boss_xs1_instance(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    scoped_instance_id = await resolve_scoped_instance_id(
        engine,
        BOSS_XS1_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None and is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found("Boss XS-1", instance_id, plugin_position)
    return scoped_instance_id


async def _read_scoped_boss_xs1_parameters(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for response_key, (symbol, default, parser) in BOSS_XS1_PARAMETER_SPECS.items():
        payload[response_key] = parser(
            await read_scoped_actual_parameter(
                engine,
                BOSS_XS1_PLUGIN_URI,
                symbol,
                scoped_instance_id,
                plugin_position,
                default,
            )
        )
    return payload


async def _read_scoped_boss_xs1_metering(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, BOSS_XS1_PLUGIN_URI, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_BOSS_XS1_METERING)
    return {
        "input_level": _extract_db_level(levels, "input_level", "input", "input_left", "input_right"),
        "output_level": _extract_db_level(levels, "output_level", "output", "output_left", "output_right"),
    }


# ========================================
# Boss XS-1 Routes
# ========================================

@router.get("/boss-xs1")
async def get_boss_xs1(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get Boss XS-1 parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return {
            "parameters": await _read_scoped_boss_xs1_parameters(engine, scoped_instance_id, plugin_position),
            "metering": await _read_scoped_boss_xs1_metering(engine, scoped_instance_id, plugin_position),
        }
    params = await engine.get_boss_xs1_parameters()
    metering = await engine.get_boss_xs1_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/boss-xs1/parameters")
async def get_boss_xs1_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get Boss XS-1 parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_boss_xs1_parameters(engine, scoped_instance_id, plugin_position)
    return await engine.get_boss_xs1_parameters()


@router.get("/boss-xs1/metering")
async def get_boss_xs1_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get Boss XS-1 metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_boss_xs1_metering(engine, scoped_instance_id, plugin_position)
    return await engine.get_boss_xs1_metering()


@router.patch("/boss-xs1/parameters")
async def update_boss_xs1_parameters(
    params: BossXS1Params,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update Boss XS-1 parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        if params.shift_amount is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "shift_amount", params.shift_amount, scoped_instance_id, plugin_position)
        if params.balance is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "balance", params.balance, scoped_instance_id, plugin_position)
        if params.detune_mode is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "detune_mode", params.detune_mode, scoped_instance_id, plugin_position)
        if params.detune_amount is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "detune_amount", params.detune_amount, scoped_instance_id, plugin_position)
        if params.glide is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "glide", params.glide, scoped_instance_id, plugin_position)
        if params.feedback is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "feedback", params.feedback, scoped_instance_id, plugin_position)
        if params.pedal_enabled is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "pedal_enabled", params.pedal_enabled, scoped_instance_id, plugin_position)
        if params.pedal_position is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "pedal_position", params.pedal_position, scoped_instance_id, plugin_position)
        if params.pedal_min is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "pedal_min", params.pedal_min, scoped_instance_id, plugin_position)
        if params.pedal_max is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "pedal_max", params.pedal_max, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_boss_xs1_parameters(engine, scoped_instance_id, plugin_position),
        }

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
async def set_boss_xs1_preset(
    preset_index: int,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
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
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "preset", preset_index, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "preset": preset_index,
            "parameters": await _read_scoped_boss_xs1_parameters(engine, scoped_instance_id, plugin_position),
        }
    await engine.set_boss_xs1_preset(preset_index)

    return {
        "status": "ok",
        "preset": preset_index,
        "parameters": await engine.get_boss_xs1_parameters()
    }


@router.post("/boss-xs1/bypass/{bypass}")
async def set_boss_xs1_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set Boss XS-1 bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_boss_xs1_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, BOSS_XS1_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
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
