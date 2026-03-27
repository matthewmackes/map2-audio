"""
ShoeGaze Multi-Effect API Routes
Wall of Sound effect inspired by boutique ambient and shimmer pedals
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

router = APIRouter(prefix="/api/engine/shoegaze", tags=["shoegaze"])

SHOEGAZE_PLUGIN_URI = "map2://juce/multieffect/shoegaze"


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


def _as_int(value: float) -> int:
    return int(round(float(value)))


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

SHOEGAZE_PARAMETER_SPECS: _ParameterSpec = {
    "atmosphere": ("atmosphere", 50.0, _as_float),
    "decay": ("decay", 4.0, _as_float),
    "shimmer": ("shimmer", 25.0, _as_float),
    "shimmer_pitch": ("shimmer_pitch", 12.0, _as_float),
    "modulation": ("modulation", 35.0, _as_float),
    "mod_rate": ("mod_rate", 0.7, _as_float),
    "drive": ("drive", 15.0, _as_float),
    "delay_time": ("delay_time", 200.0, _as_float),
    "delay_feedback": ("delay_feedback", 30.0, _as_float),
    "delay_mod": ("delay_mod", 20.0, _as_float),
    "low_cut": ("low_cut", 80.0, _as_float),
    "high_cut": ("high_cut", 8000.0, _as_float),
    "mix": ("mix", 50.0, _as_float),
    "stereo_width": ("stereo_width", 150.0, _as_float),
    "reverb_diffusion": ("reverb_diffusion", 85.0, _as_float),
    "reverb_damping": ("reverb_damping", 40.0, _as_float),
    "shimmer_feedback": ("shimmer_feedback", 35.0, _as_float),
    "chorus_voices": ("chorus_voices", 4.0, _as_int),
    "ducking": ("ducking", 20.0, _as_float),
    "spillover": ("spillover", 1.0, _as_bool),
    "bypass": ("bypass", 0.0, _as_bool),
}

DEFAULT_SHOEGAZE_METERING = {
    "input_level": -100.0,
    "output_level": -100.0,
    "reverb_level": -100.0,
    "shimmer_level": -100.0,
    "lfo_phase": 0.0,
    "grain_activity": 0.0,
    "ducking_reduction": 0.0,
    "feedback_level": -100.0,
    "saturation_level": 0.0,
    "stereo_correlation": 1.0,
    "cpu_load": 0.0,
}

SHOEGAZE_PRESET_ALIASES = {
    "manual": "manual",
    "loveless": "loveless",
    "souvlaki": "souvlaki",
    "treasure": "treasure",
    "spaceage": "spaceage",
    "space_age": "spaceage",
    "psychocandy": "psychocandy",
    "nowhere": "nowhere",
}

SHOEGAZE_PRESET_VALUES: dict[str, dict[str, float]] = {
    "loveless": {
        "atmosphere": 75.0,
        "decay": 5.5,
        "shimmer": 15.0,
        "shimmer_pitch": 12.0,
        "modulation": 60.0,
        "mod_rate": 0.5,
        "drive": 25.0,
        "delay_time": 300.0,
        "delay_feedback": 45.0,
        "delay_mod": 40.0,
        "low_cut": 120.0,
        "high_cut": 6000.0,
        "mix": 55.0,
        "stereo_width": 180.0,
    },
    "souvlaki": {
        "atmosphere": 80.0,
        "decay": 8.0,
        "shimmer": 35.0,
        "shimmer_pitch": 12.0,
        "modulation": 40.0,
        "mod_rate": 0.6,
        "drive": 10.0,
        "delay_time": 400.0,
        "delay_feedback": 35.0,
        "delay_mod": 25.0,
        "low_cut": 100.0,
        "high_cut": 7000.0,
        "mix": 60.0,
        "stereo_width": 160.0,
    },
    "treasure": {
        "atmosphere": 70.0,
        "decay": 4.0,
        "shimmer": 50.0,
        "shimmer_pitch": 12.0,
        "modulation": 30.0,
        "mod_rate": 0.8,
        "drive": 5.0,
        "delay_time": 250.0,
        "delay_feedback": 25.0,
        "delay_mod": 15.0,
        "low_cut": 60.0,
        "high_cut": 12000.0,
        "mix": 50.0,
        "stereo_width": 140.0,
    },
    "spaceage": {
        "atmosphere": 90.0,
        "decay": 12.0,
        "shimmer": 40.0,
        "shimmer_pitch": 12.0,
        "modulation": 25.0,
        "mod_rate": 0.3,
        "drive": 20.0,
        "delay_time": 500.0,
        "delay_feedback": 50.0,
        "delay_mod": 30.0,
        "low_cut": 80.0,
        "high_cut": 5500.0,
        "mix": 65.0,
        "stereo_width": 175.0,
    },
    "psychocandy": {
        "atmosphere": 60.0,
        "decay": 3.0,
        "shimmer": 10.0,
        "shimmer_pitch": 7.0,
        "modulation": 20.0,
        "mod_rate": 1.2,
        "drive": 60.0,
        "delay_time": 180.0,
        "delay_feedback": 55.0,
        "delay_mod": 35.0,
        "low_cut": 150.0,
        "high_cut": 4500.0,
        "mix": 45.0,
        "stereo_width": 120.0,
    },
    "nowhere": {
        "atmosphere": 65.0,
        "decay": 4.5,
        "shimmer": 25.0,
        "shimmer_pitch": 12.0,
        "modulation": 50.0,
        "mod_rate": 0.9,
        "drive": 15.0,
        "delay_time": 350.0,
        "delay_feedback": 40.0,
        "delay_mod": 30.0,
        "low_cut": 90.0,
        "high_cut": 7500.0,
        "mix": 50.0,
        "stereo_width": 155.0,
    },
}


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


def _normalize_preset_name(preset_name: str) -> str:
    normalized = preset_name.strip().lower()
    if normalized not in SHOEGAZE_PRESET_ALIASES:
        raise HTTPException(status_code=400, detail=f"Unknown ShoeGaze preset: {preset_name}")
    return SHOEGAZE_PRESET_ALIASES[normalized]


async def _resolve_shoegaze_instance(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    scoped_instance_id = await resolve_scoped_instance_id(
        engine,
        SHOEGAZE_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None and is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found("ShoeGaze", instance_id, plugin_position)
    return scoped_instance_id


def _detect_shoegaze_preset(parameters: dict[str, Any], tolerance: float = 1e-3) -> str:
    for preset_name, expected_values in SHOEGAZE_PRESET_VALUES.items():
        if all(abs(_coerce_float(parameters.get(symbol), 0.0) - value) <= tolerance for symbol, value in expected_values.items()):
            return preset_name
    return "manual"


async def _read_scoped_shoegaze_parameters(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for response_key, (symbol, default, parser) in SHOEGAZE_PARAMETER_SPECS.items():
        payload[response_key] = parser(
            await read_scoped_actual_parameter(
                engine,
                SHOEGAZE_PLUGIN_URI,
                symbol,
                scoped_instance_id,
                plugin_position,
                default,
            )
        )
    payload["preset"] = _detect_shoegaze_preset(payload)
    return payload


async def _read_scoped_shoegaze_metering(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, SHOEGAZE_PLUGIN_URI, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_SHOEGAZE_METERING)
    return {
        "input_level": _extract_db_level(levels, "input_level", "input", "input_left", "input_right"),
        "output_level": _extract_db_level(levels, "output_level", "output", "output_left", "output_right"),
        "reverb_level": _coerce_float(levels.get("reverb_level"), -100.0),
        "shimmer_level": _coerce_float(levels.get("shimmer_level"), -100.0),
        "lfo_phase": _coerce_float(levels.get("lfo_phase"), 0.0),
        "grain_activity": _coerce_float(levels.get("grain_activity"), 0.0),
        "ducking_reduction": _coerce_float(levels.get("ducking_reduction"), 0.0),
        "feedback_level": _coerce_float(levels.get("feedback_level"), -100.0),
        "saturation_level": _coerce_float(levels.get("saturation_level"), 0.0),
        "stereo_correlation": _coerce_float(levels.get("stereo_correlation"), 1.0),
        "cpu_load": _coerce_float(levels.get("cpu_load"), 0.0),
    }


async def _apply_scoped_shoegaze_preset(
    engine: Any,
    preset_name: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> None:
    normalized_preset = _normalize_preset_name(preset_name)
    if normalized_preset == "manual":
        return
    for symbol, value in SHOEGAZE_PRESET_VALUES[normalized_preset].items():
        await set_scoped_actual_parameter(
            engine,
            SHOEGAZE_PLUGIN_URI,
            symbol,
            value,
            scoped_instance_id,
            plugin_position,
        )


# ========================================
# ShoeGaze Routes
# ========================================

@router.get("")
async def get_shoegaze(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get ShoeGaze parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return {
            "parameters": await _read_scoped_shoegaze_parameters(engine, scoped_instance_id, plugin_position),
            "metering": await _read_scoped_shoegaze_metering(engine, scoped_instance_id, plugin_position),
        }
    params = await engine.get_shoegaze_parameters()
    metering = await engine.get_shoegaze_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/parameters")
async def get_shoegaze_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get ShoeGaze parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_shoegaze_parameters(engine, scoped_instance_id, plugin_position)
    return await engine.get_shoegaze_parameters()


@router.get("/metering")
async def get_shoegaze_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get ShoeGaze metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        return await _read_scoped_shoegaze_metering(engine, scoped_instance_id, plugin_position)
    return await engine.get_shoegaze_metering()


@router.patch("/parameters")
async def update_shoegaze_parameters(
    params: ShoeGazeParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update ShoeGaze parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        if params.atmosphere is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "atmosphere", params.atmosphere, scoped_instance_id, plugin_position)
        if params.decay is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "decay", params.decay, scoped_instance_id, plugin_position)
        if params.shimmer is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "shimmer", params.shimmer, scoped_instance_id, plugin_position)
        if params.shimmer_pitch is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "shimmer_pitch", params.shimmer_pitch, scoped_instance_id, plugin_position)
        if params.modulation is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "modulation", params.modulation, scoped_instance_id, plugin_position)
        if params.mod_rate is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "mod_rate", params.mod_rate, scoped_instance_id, plugin_position)
        if params.drive is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "drive", params.drive, scoped_instance_id, plugin_position)
        if params.delay_time is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "delay_time", params.delay_time, scoped_instance_id, plugin_position)
        if params.delay_feedback is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "delay_feedback", params.delay_feedback, scoped_instance_id, plugin_position)
        if params.delay_mod is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "delay_mod", params.delay_mod, scoped_instance_id, plugin_position)
        if params.low_cut is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "low_cut", params.low_cut, scoped_instance_id, plugin_position)
        if params.high_cut is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "high_cut", params.high_cut, scoped_instance_id, plugin_position)
        if params.mix is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "mix", params.mix, scoped_instance_id, plugin_position)
        if params.stereo_width is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "stereo_width", params.stereo_width, scoped_instance_id, plugin_position)
        if params.reverb_diffusion is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "reverb_diffusion", params.reverb_diffusion, scoped_instance_id, plugin_position)
        if params.reverb_damping is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "reverb_damping", params.reverb_damping, scoped_instance_id, plugin_position)
        if params.shimmer_feedback is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "shimmer_feedback", params.shimmer_feedback, scoped_instance_id, plugin_position)
        if params.chorus_voices is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "chorus_voices", params.chorus_voices, scoped_instance_id, plugin_position)
        if params.ducking is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "ducking", params.ducking, scoped_instance_id, plugin_position)
        if params.preset is not None:
            await _apply_scoped_shoegaze_preset(engine, params.preset, scoped_instance_id, plugin_position)
        if params.spillover is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "spillover", params.spillover, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_shoegaze_parameters(engine, scoped_instance_id, plugin_position),
        }

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
async def set_shoegaze_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set ShoeGaze bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        await set_scoped_actual_parameter(engine, SHOEGAZE_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_shoegaze_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/preset/{preset_name}")
async def load_shoegaze_preset(
    preset_name: str,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Load a ShoeGaze preset by name."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_shoegaze_instance(engine, instance_id, plugin_position)
    if scoped_instance_id is not None:
        normalized_preset = _normalize_preset_name(preset_name)
        await _apply_scoped_shoegaze_preset(engine, normalized_preset, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "preset": normalized_preset,
            "parameters": await _read_scoped_shoegaze_parameters(engine, scoped_instance_id, plugin_position),
        }
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
