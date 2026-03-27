"""
Modulation Processing API Routes
Chorus, Phaser, and EVH-style Pitch Shifter with Van Halen presets
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

router = APIRouter(prefix="/api/engine/modulation", tags=["modulation"])

CHORUS_PLUGIN_URI = "map2://juce/modulation/chorus"
PHASER_PLUGIN_URI = "map2://juce/modulation/phaser"
PITCH_SHIFTER_PLUGIN_URI = "map2://juce/pitch/shifter"
INTERVAL_SHIFTER_PLUGIN_URI = "map2://juce/pitch/interval"
PITCH_SHIFTER_ROUTE_URIS = (PITCH_SHIFTER_PLUGIN_URI, INTERVAL_SHIFTER_PLUGIN_URI)

DEFAULT_MODULATION_METERING = {
    "input_level": -100.0,
    "output_level": -100.0,
    "lfo_phase": 0.0,
}

DEFAULT_PITCH_METERING = {
    "input_level_l": -100.0,
    "input_level_r": -100.0,
    "output_level_l": -100.0,
    "output_level_r": -100.0,
    "grain_phase": 0.0,
}


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


def _as_int(value: float) -> int:
    return int(round(float(value)))


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

CHORUS_PARAMETER_SPECS: _ParameterSpec = {
    "rate": ("rate", 1.0, _as_float),
    "depth": ("depth", 50.0, _as_float),
    "centre_delay": ("centre_delay", 7.0, _as_float),
    "feedback": ("feedback", 0.0, _as_float),
    "mix": ("mix", 50.0, _as_float),
    "spread": ("spread", 100.0, _as_float),
    "bypass": ("bypass", 0.0, _as_bool),
}

PHASER_PARAMETER_SPECS: _ParameterSpec = {
    "rate": ("rate", 0.5, _as_float),
    "depth": ("depth", 50.0, _as_float),
    "centre_frequency": ("centre_frequency", 1000.0, _as_float),
    "feedback": ("feedback", 50.0, _as_float),
    "mix": ("mix", 50.0, _as_float),
    "bypass": ("bypass", 0.0, _as_bool),
}

PITCH_SHIFTER_PARAMETER_SPECS: _ParameterSpec = {
    "pitch_l": ("pitch_l", 0.0, _as_float),
    "pitch_r": ("pitch_r", 0.0, _as_float),
    "delay_l": ("delay_l", 0.0, _as_float),
    "delay_r": ("delay_r", 0.0, _as_float),
    "feedback": ("feedback", 0.0, _as_float),
    "mix": ("mix", 50.0, _as_float),
    "spread": ("spread", 100.0, _as_float),
    "preset": ("preset", 0.0, _as_int),
    "bypass": ("bypass", 0.0, _as_bool),
}

INTERVAL_ROUTE_DEFAULT_PARAMETERS = {
    "pitch_l": 0.0,
    "pitch_r": 0.0,
    "delay_l": 0.0,
    "delay_r": 0.0,
    "feedback": 0.0,
    "mix": 50.0,
    "spread": 100.0,
    "preset": 0,
    "bypass": False,
}


def _default_parameters(specs: _ParameterSpec) -> Dict[str, Any]:
    return {
        response_key: parser(default)
        for response_key, (_, default, parser) in specs.items()
    }


CHORUS_DEFAULT_PARAMETERS = _default_parameters(CHORUS_PARAMETER_SPECS)
PHASER_DEFAULT_PARAMETERS = _default_parameters(PHASER_PARAMETER_SPECS)
PITCH_SHIFTER_DEFAULT_PARAMETERS = _default_parameters(PITCH_SHIFTER_PARAMETER_SPECS)


# ========================================
# Chorus Models
# ========================================

class ChorusParams(BaseModel):
    """Chorus parameters"""
    rate: Optional[float] = Field(None, ge=0.1, le=10.0, description="LFO rate in Hz")
    depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    centre_delay: Optional[float] = Field(None, ge=1.0, le=30.0, description="Centre delay in ms")
    feedback: Optional[float] = Field(None, ge=-100.0, le=100.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    spread: Optional[float] = Field(None, ge=0.0, le=100.0, description="Stereo spread %")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class ChorusMetering(BaseModel):
    """Chorus metering data"""
    input_level: float
    output_level: float
    lfo_phase: float


# ========================================
# Phaser Models
# ========================================

class PhaserParams(BaseModel):
    """Phaser parameters"""
    rate: Optional[float] = Field(None, ge=0.05, le=5.0, description="LFO rate in Hz")
    depth: Optional[float] = Field(None, ge=0.0, le=100.0, description="Modulation depth %")
    centre_frequency: Optional[float] = Field(None, ge=100.0, le=10000.0, description="Centre frequency in Hz")
    feedback: Optional[float] = Field(None, ge=-100.0, le=100.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class PhaserMetering(BaseModel):
    """Phaser metering data"""
    input_level: float
    output_level: float
    lfo_phase: float


# ========================================
# Pitch Shifter Models
# ========================================

class PitchShifterParams(BaseModel):
    """Pitch shifter parameters"""
    pitch_l: Optional[float] = Field(None, ge=-1200.0, le=1200.0, description="Left pitch shift in cents")
    pitch_r: Optional[float] = Field(None, ge=-1200.0, le=1200.0, description="Right pitch shift in cents")
    delay_l: Optional[float] = Field(None, ge=0.0, le=100.0, description="Left delay in ms")
    delay_r: Optional[float] = Field(None, ge=0.0, le=100.0, description="Right delay in ms")
    feedback: Optional[float] = Field(None, ge=0.0, le=90.0, description="Feedback %")
    mix: Optional[float] = Field(None, ge=0.0, le=100.0, description="Wet mix %")
    spread: Optional[float] = Field(None, ge=0.0, le=200.0, description="Stereo spread %")
    preset: Optional[int] = Field(None, ge=0, le=14, description="Preset index")
    bypass: Optional[bool] = Field(None, description="Bypass effect")


class PitchShifterMetering(BaseModel):
    """Pitch shifter metering data"""
    input_level_l: float
    input_level_r: float
    output_level_l: float
    output_level_r: float
    grain_phase: float


class PresetInfo(BaseModel):
    """Van Halen preset information"""
    index: int
    name: str
    song: str
    album: str
    year: str
    description: str
    settings: Dict[str, Any]


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_linear_peak(levels: dict[str, Any], *keys: str) -> Optional[float]:
    peak_values: list[float] = []
    for key in keys:
        if key not in levels:
            continue
        peak_values.append(_coerce_float(levels[key], 0.0))
    if not peak_values:
        return None
    return max(peak_values)


def _extract_db_level(levels: dict[str, Any], direct_keys: tuple[str, ...], linear_keys: tuple[str, ...]) -> float:
    for key in direct_keys:
        if key in levels:
            return _coerce_float(levels[key], -100.0)
    linear_peak = _extract_linear_peak(levels, *linear_keys)
    if linear_peak is None:
        return -100.0
    return linear_peak_to_db(linear_peak)


async def _read_scoped_parameters(
    engine: Any,
    plugin_uri: str,
    specs: _ParameterSpec,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for response_key, (symbol, default, parser) in specs.items():
        payload[response_key] = parser(
            await read_scoped_actual_parameter(
                engine,
                plugin_uri,
                symbol,
                scoped_instance_id,
                plugin_position,
                default,
            )
        )
    return payload


async def _resolve_effect_instance(
    engine: Any,
    label: str,
    plugin_uri: str,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    scoped_instance_id = await resolve_scoped_instance_id(engine, plugin_uri, instance_id, plugin_position)
    if scoped_instance_id is None and is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found(label, instance_id, plugin_position)
    return scoped_instance_id


async def _read_scoped_modulation_metering(
    engine: Any,
    plugin_uri: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, plugin_uri, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_MODULATION_METERING)
    return {
        "input_level": _extract_db_level(levels, ("input_level",), ("input", "input_left", "input_right")),
        "output_level": _extract_db_level(levels, ("output_level",), ("output", "output_left", "output_right")),
        "lfo_phase": _coerce_float(levels.get("lfo_phase"), 0.0),
    }


async def _read_scoped_pitch_metering(
    engine: Any,
    plugin_uri: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, plugin_uri, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_PITCH_METERING)
    return {
        "input_level_l": _extract_db_level(levels, ("input_level_l", "input_level"), ("input_left", "input")),
        "input_level_r": _extract_db_level(levels, ("input_level_r", "input_level"), ("input_right", "input")),
        "output_level_l": _extract_db_level(levels, ("output_level_l", "output_level"), ("output_left", "output")),
        "output_level_r": _extract_db_level(levels, ("output_level_r", "output_level"), ("output_right", "output")),
        "grain_phase": _coerce_float(levels.get("grain_phase"), 0.0),
    }


async def _get_current_pedalboard_items(engine: Any) -> list[dict[str, Any]]:
    getter = getattr(engine, "get_current_pedalboard", None)
    if not callable(getter):
        return []
    pedalboard = await getter()
    items = pedalboard.get("items", []) if isinstance(pedalboard, dict) else []
    return [item for item in items if isinstance(item, dict)]


def _pedalboard_item_position(item: dict[str, Any], fallback: int) -> int:
    for key in ("position", "plugin_position"):
        raw_value = item.get(key)
        try:
            position = int(raw_value)
        except (TypeError, ValueError):
            continue
        if position >= 0:
            return position
    return fallback


def _normalize_pitch_plugin_uri(plugin_uri: Optional[str]) -> Optional[str]:
    if plugin_uri is None:
        return None
    if plugin_uri not in PITCH_SHIFTER_ROUTE_URIS:
        raise HTTPException(status_code=400, detail=f"Unsupported pitch shifter plugin_uri: {plugin_uri}")
    return plugin_uri


async def _infer_pitch_plugin_uri(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[str]:
    items = await _get_current_pedalboard_items(engine)
    for index, item in enumerate(items):
        uri = item.get("uri")
        if uri not in PITCH_SHIFTER_ROUTE_URIS:
            continue
        if isinstance(plugin_position, int) and _pedalboard_item_position(item, index) == plugin_position:
            return uri
        if isinstance(instance_id, int) and item.get("instance_id") == instance_id:
            return uri
    return None


async def _resolve_pitch_target(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
    plugin_uri: Optional[str],
) -> tuple[str, Optional[int]]:
    normalized_plugin_uri = _normalize_pitch_plugin_uri(plugin_uri)
    candidate_uris: list[str] = []

    if normalized_plugin_uri is not None:
        candidate_uris.append(normalized_plugin_uri)

    if is_scoped_request(instance_id, plugin_position):
        inferred_uri = await _infer_pitch_plugin_uri(engine, instance_id, plugin_position)
        if inferred_uri is not None and inferred_uri not in candidate_uris:
            candidate_uris.append(inferred_uri)

    if not candidate_uris:
        candidate_uris.append(PITCH_SHIFTER_PLUGIN_URI)

    for candidate_uri in PITCH_SHIFTER_ROUTE_URIS:
        if candidate_uri not in candidate_uris:
            candidate_uris.append(candidate_uri)

    for candidate_uri in candidate_uris:
        scoped_instance_id = await resolve_scoped_instance_id(engine, candidate_uri, instance_id, plugin_position)
        if scoped_instance_id is not None:
            return candidate_uri, scoped_instance_id

    if is_scoped_request(instance_id, plugin_position):
        raise_scoped_not_found("Pitch shifter", instance_id, plugin_position)
    return candidate_uris[0], None


async def _read_scoped_pitch_parameters(
    engine: Any,
    plugin_uri: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    if plugin_uri == INTERVAL_SHIFTER_PLUGIN_URI:
        semitones_l = await read_scoped_actual_parameter(
            engine,
            plugin_uri,
            "semitones_l",
            scoped_instance_id,
            plugin_position,
            0.0,
        )
        semitones_r = await read_scoped_actual_parameter(
            engine,
            plugin_uri,
            "semitones_r",
            scoped_instance_id,
            plugin_position,
            0.0,
        )
        mix = await read_scoped_actual_parameter(
            engine,
            plugin_uri,
            "mix",
            scoped_instance_id,
            plugin_position,
            50.0,
        )
        bypass = actual_to_bool(
            await read_scoped_actual_parameter(
                engine,
                plugin_uri,
                "bypass",
                scoped_instance_id,
                plugin_position,
                0.0,
            ),
            False,
        )
        return {
            "pitch_l": semitones_l * 100.0,
            "pitch_r": semitones_r * 100.0,
            "delay_l": 0.0,
            "delay_r": 0.0,
            "feedback": 0.0,
            "mix": mix,
            "spread": 100.0,
            "preset": 0,
            "bypass": bypass,
        }

    return await _read_scoped_parameters(
        engine,
        plugin_uri,
        PITCH_SHIFTER_PARAMETER_SPECS,
        scoped_instance_id,
        plugin_position,
    )


async def _update_scoped_pitch_parameters(
    engine: Any,
    plugin_uri: str,
    params: PitchShifterParams,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> None:
    if plugin_uri == INTERVAL_SHIFTER_PLUGIN_URI:
        if params.delay_l not in (None, 0.0):
            raise HTTPException(status_code=400, detail="Interval shifter does not support delay_l via pitch-shifter route")
        if params.delay_r not in (None, 0.0):
            raise HTTPException(status_code=400, detail="Interval shifter does not support delay_r via pitch-shifter route")
        if params.feedback not in (None, 0.0):
            raise HTTPException(status_code=400, detail="Interval shifter does not support feedback via pitch-shifter route")
        if params.spread not in (None, 100.0):
            raise HTTPException(status_code=400, detail="Interval shifter does not support spread via pitch-shifter route")
        if params.preset not in (None, 0):
            raise HTTPException(status_code=400, detail="Interval shifter does not support EVH presets")

        if params.pitch_l is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "semitones_l", params.pitch_l / 100.0, scoped_instance_id, plugin_position)
        if params.pitch_r is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "semitones_r", params.pitch_r / 100.0, scoped_instance_id, plugin_position)
        if params.mix is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "mix", params.mix, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return

    if params.preset is not None:
        await set_scoped_actual_parameter(engine, plugin_uri, "preset", params.preset, scoped_instance_id, plugin_position)
    else:
        if params.pitch_l is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "pitch_l", params.pitch_l, scoped_instance_id, plugin_position)
        if params.pitch_r is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "pitch_r", params.pitch_r, scoped_instance_id, plugin_position)
        if params.delay_l is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "delay_l", params.delay_l, scoped_instance_id, plugin_position)
        if params.delay_r is not None:
            await set_scoped_actual_parameter(engine, plugin_uri, "delay_r", params.delay_r, scoped_instance_id, plugin_position)

    if params.feedback is not None:
        await set_scoped_actual_parameter(engine, plugin_uri, "feedback", params.feedback, scoped_instance_id, plugin_position)
    if params.mix is not None:
        await set_scoped_actual_parameter(engine, plugin_uri, "mix", params.mix, scoped_instance_id, plugin_position)
    if params.spread is not None:
        await set_scoped_actual_parameter(engine, plugin_uri, "spread", params.spread, scoped_instance_id, plugin_position)
    if params.bypass is not None:
        await set_scoped_actual_parameter(engine, plugin_uri, "bypass", params.bypass, scoped_instance_id, plugin_position)


# ========================================
# Chorus Routes
# ========================================

@router.get("/chorus")
async def get_chorus(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get chorus parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Chorus",
        CHORUS_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return {
            "parameters": dict(CHORUS_DEFAULT_PARAMETERS),
            "metering": dict(DEFAULT_MODULATION_METERING),
        }
    params = await _read_scoped_parameters(
        engine,
        CHORUS_PLUGIN_URI,
        CHORUS_PARAMETER_SPECS,
        scoped_instance_id,
        plugin_position,
    )
    metering = await _read_scoped_modulation_metering(
        engine,
        CHORUS_PLUGIN_URI,
        scoped_instance_id,
        plugin_position,
    )
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/chorus/parameters")
async def get_chorus_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get chorus parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Chorus",
        CHORUS_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return dict(CHORUS_DEFAULT_PARAMETERS)
    return await _read_scoped_parameters(
        engine,
        CHORUS_PLUGIN_URI,
        CHORUS_PARAMETER_SPECS,
        scoped_instance_id,
        plugin_position,
    )


@router.get("/chorus/metering")
async def get_chorus_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get chorus metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Chorus",
        CHORUS_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return dict(DEFAULT_MODULATION_METERING)
    return await _read_scoped_modulation_metering(
        engine,
        CHORUS_PLUGIN_URI,
        scoped_instance_id,
        plugin_position,
    )


@router.patch("/chorus/parameters")
async def update_chorus_parameters(
    params: ChorusParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update chorus parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Chorus",
        CHORUS_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Chorus instance not found")
    if params.rate is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "rate", params.rate, scoped_instance_id, plugin_position)
    if params.depth is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "depth", params.depth, scoped_instance_id, plugin_position)
    if params.centre_delay is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "centre_delay", params.centre_delay, scoped_instance_id, plugin_position)
    if params.feedback is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "feedback", params.feedback, scoped_instance_id, plugin_position)
    if params.mix is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "mix", params.mix, scoped_instance_id, plugin_position)
    if params.spread is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "spread", params.spread, scoped_instance_id, plugin_position)
    if params.bypass is not None:
        await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)

    return {
        "status": "ok",
        "parameters": await _read_scoped_parameters(
            engine,
            CHORUS_PLUGIN_URI,
            CHORUS_PARAMETER_SPECS,
            scoped_instance_id,
            plugin_position,
        ),
    }


@router.post("/chorus/bypass/{bypass}")
async def set_chorus_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set chorus bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Chorus",
        CHORUS_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Chorus instance not found")
    await set_scoped_actual_parameter(engine, CHORUS_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Phaser Routes
# ========================================

@router.get("/phaser")
async def get_phaser(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get phaser parameters and metering."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Phaser",
        PHASER_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return {
            "parameters": dict(PHASER_DEFAULT_PARAMETERS),
            "metering": dict(DEFAULT_MODULATION_METERING),
        }
    params = await _read_scoped_parameters(
        engine,
        PHASER_PLUGIN_URI,
        PHASER_PARAMETER_SPECS,
        scoped_instance_id,
        plugin_position,
    )
    metering = await _read_scoped_modulation_metering(
        engine,
        PHASER_PLUGIN_URI,
        scoped_instance_id,
        plugin_position,
    )
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/phaser/parameters")
async def get_phaser_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get phaser parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Phaser",
        PHASER_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return dict(PHASER_DEFAULT_PARAMETERS)
    return await _read_scoped_parameters(
        engine,
        PHASER_PLUGIN_URI,
        PHASER_PARAMETER_SPECS,
        scoped_instance_id,
        plugin_position,
    )


@router.get("/phaser/metering")
async def get_phaser_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get phaser metering data."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Phaser",
        PHASER_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        return dict(DEFAULT_MODULATION_METERING)
    return await _read_scoped_modulation_metering(
        engine,
        PHASER_PLUGIN_URI,
        scoped_instance_id,
        plugin_position,
    )


@router.patch("/phaser/parameters")
async def update_phaser_parameters(
    params: PhaserParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update phaser parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Phaser",
        PHASER_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Phaser instance not found")
    if params.rate is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "rate", params.rate, scoped_instance_id, plugin_position)
    if params.depth is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "depth", params.depth, scoped_instance_id, plugin_position)
    if params.centre_frequency is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "centre_frequency", params.centre_frequency, scoped_instance_id, plugin_position)
    if params.feedback is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "feedback", params.feedback, scoped_instance_id, plugin_position)
    if params.mix is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "mix", params.mix, scoped_instance_id, plugin_position)
    if params.bypass is not None:
        await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)

    return {
        "status": "ok",
        "parameters": await _read_scoped_parameters(
            engine,
            PHASER_PLUGIN_URI,
            PHASER_PARAMETER_SPECS,
            scoped_instance_id,
            plugin_position,
        ),
    }


@router.post("/phaser/bypass/{bypass}")
async def set_phaser_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set phaser bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_effect_instance(
        engine,
        "Phaser",
        PHASER_PLUGIN_URI,
        instance_id,
        plugin_position,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Phaser instance not found")
    await set_scoped_actual_parameter(engine, PHASER_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Pitch Shifter Routes
# ========================================

@router.get("/pitch-shifter")
async def get_pitch_shifter(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Get pitch shifter parameters and metering."""
    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        default_parameters = (
            dict(INTERVAL_ROUTE_DEFAULT_PARAMETERS)
            if resolved_plugin_uri == INTERVAL_SHIFTER_PLUGIN_URI
            else dict(PITCH_SHIFTER_DEFAULT_PARAMETERS)
        )
        return {
            "parameters": default_parameters,
            "metering": dict(DEFAULT_PITCH_METERING),
        }
    params = await _read_scoped_pitch_parameters(
        engine,
        resolved_plugin_uri,
        scoped_instance_id,
        plugin_position,
    )
    metering = await _read_scoped_pitch_metering(
        engine,
        resolved_plugin_uri,
        scoped_instance_id,
        plugin_position,
    )
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/pitch-shifter/parameters")
async def get_pitch_shifter_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Get pitch shifter parameters only."""
    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        return (
            dict(INTERVAL_ROUTE_DEFAULT_PARAMETERS)
            if resolved_plugin_uri == INTERVAL_SHIFTER_PLUGIN_URI
            else dict(PITCH_SHIFTER_DEFAULT_PARAMETERS)
        )
    return await _read_scoped_pitch_parameters(
        engine,
        resolved_plugin_uri,
        scoped_instance_id,
        plugin_position,
    )


@router.get("/pitch-shifter/metering")
async def get_pitch_shifter_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, float]:
    """Get pitch shifter metering data."""
    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        return dict(DEFAULT_PITCH_METERING)
    return await _read_scoped_pitch_metering(
        engine,
        resolved_plugin_uri,
        scoped_instance_id,
        plugin_position,
    )


@router.patch("/pitch-shifter/parameters")
async def update_pitch_shifter_parameters(
    params: PitchShifterParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Update pitch shifter parameters."""
    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Pitch shifter instance not found")

    await _update_scoped_pitch_parameters(
        engine,
        resolved_plugin_uri,
        params,
        scoped_instance_id,
        plugin_position,
    )

    return {
        "status": "ok",
        "parameters": await _read_scoped_pitch_parameters(
            engine,
            resolved_plugin_uri,
            scoped_instance_id,
            plugin_position,
        ),
    }


@router.post("/pitch-shifter/preset/{preset_index}")
async def set_pitch_shifter_preset(
    preset_index: int,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """
    Set pitch shifter to a Van Halen preset.

    Presets:
    0  - Manual (user settings)
    1  - Eruption (VH1 1978)
    2  - Unchained (Fair Warning 1981)
    3  - Little Guitars (Diver Down 1982)
    4  - Mean Street (Fair Warning 1981)
    5  - Drop Dead Legs (1984)
    6  - Panama (1984)
    7  - Cathedral (Diver Down 1982)
    8  - Hot For Teacher (1984)
    9  - Why Can't This Be Love (5150 1986)
    10 - Dreams (5150 1986)
    11 - Finish What Ya Started (OU812 1988)
    12 - Right Now (F.U.C.K. 1991)
    13 - Can't Stop Lovin' You (Balance 1995)
    14 - Humans Being (Twister 1996)
    """
    if preset_index < 0 or preset_index > 14:
        raise HTTPException(status_code=400, detail="Invalid preset index (0-14)")

    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Pitch shifter instance not found")
    if resolved_plugin_uri != PITCH_SHIFTER_PLUGIN_URI:
        raise HTTPException(status_code=400, detail="EVH presets are not supported for interval shifter instances")
    await set_scoped_actual_parameter(engine, resolved_plugin_uri, "preset", preset_index, scoped_instance_id, plugin_position)

    return {
        "status": "ok",
        "preset": preset_index,
        "parameters": await _read_scoped_pitch_parameters(
            engine,
            resolved_plugin_uri,
            scoped_instance_id,
            plugin_position,
        ),
    }


@router.post("/pitch-shifter/bypass/{bypass}")
async def set_pitch_shifter_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
    plugin_uri: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Set pitch shifter bypass state."""
    engine = get_audio_engine()
    resolved_plugin_uri, scoped_instance_id = await _resolve_pitch_target(
        engine,
        instance_id,
        plugin_position,
        plugin_uri,
    )
    if scoped_instance_id is None:
        raise HTTPException(status_code=404, detail="Pitch shifter instance not found")
    await set_scoped_actual_parameter(engine, resolved_plugin_uri, "bypass", bypass, scoped_instance_id, plugin_position)
    return {"status": "ok", "bypass": bypass}


@router.get("/pitch-shifter/presets")
async def get_pitch_shifter_presets() -> List[PresetInfo]:
    """
    Get all Van Halen-inspired pitch shifter presets.

    Based on documented vintage harmonizer settings from:
    - Audio equipment forums
    - VHLinks.com
    - Metropoulos Forum
    - Premier Guitar
    """
    return [
        PresetInfo(
            index=0,
            name="Manual",
            song="Custom",
            album="-",
            year="-",
            description="User-defined pitch shift settings",
            settings={}
        ),
        PresetInfo(
            index=1,
            name="Eruption",
            song="Eruption",
            album="Van Halen",
            year="1978",
            description="Classic VH1 tone - subtle +/-4c detune with 3/6ms delay stagger",
            settings={"pitch_l": 4, "pitch_r": -4, "delay_l": 3, "delay_r": 6, "mix": 40}
        ),
        PresetInfo(
            index=2,
            name="Unchained",
            song="Unchained",
            album="Fair Warning",
            year="1981",
            description="Punchy H910 detune for the main riff",
            settings={"pitch_l": 4, "pitch_r": -4, "delay_l": 3, "delay_r": 6, "mix": 35}
        ),
        PresetInfo(
            index=3,
            name="Little Guitars",
            song="Little Guitars",
            album="Diver Down",
            year="1982",
            description="Delicate shimmer for nylon-string intro",
            settings={"pitch_l": 5, "pitch_r": -5, "delay_l": 5, "delay_r": 10, "mix": 30}
        ),
        PresetInfo(
            index=4,
            name="Mean Street",
            song="Mean Street",
            album="Fair Warning",
            year="1981",
            description="Heavier detune for the slap-tap intro",
            settings={"pitch_l": 7, "pitch_r": -7, "delay_l": 8, "delay_r": 16, "mix": 45}
        ),
        PresetInfo(
            index=5,
            name="Drop Dead Legs",
            song="Drop Dead Legs",
            album="1984",
            year="1984",
            description="Sub-octave effect - left channel down 12 semitones",
            settings={"pitch_l": -1200, "pitch_r": 0, "delay_l": 0, "delay_r": 0, "mix": 25}
        ),
        PresetInfo(
            index=6,
            name="Panama",
            song="Panama",
            album="1984",
            year="1984",
            description="Classic H949 detune with staggered delay",
            settings={"pitch_l": 7, "pitch_r": -9, "delay_l": 8, "delay_r": 20, "mix": 40}
        ),
        PresetInfo(
            index=7,
            name="Cathedral",
            song="Cathedral",
            album="Diver Down",
            year="1982",
            description="Shimmer/echo effect with feedback for ethereal quality",
            settings={"pitch_l": 12, "pitch_r": -12, "delay_l": 80, "delay_r": 100, "feedback": 40, "mix": 50}
        ),
        PresetInfo(
            index=8,
            name="Hot For Teacher",
            song="Hot For Teacher",
            album="1984",
            year="1984",
            description="Punchy detune for the main riff",
            settings={"pitch_l": 6, "pitch_r": -6, "delay_l": 5, "delay_r": 12, "mix": 35}
        ),
        PresetInfo(
            index=9,
            name="Why Can't This Be Love",
            song="Why Can't This Be Love",
            album="5150",
            year="1986",
            description="Micropitch - the Sammy era signature sound",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 25, "mix": 45}
        ),
        PresetInfo(
            index=10,
            name="Dreams",
            song="Dreams",
            album="5150",
            year="1986",
            description="Wide stereo micropitch with longer delay",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 20, "delay_r": 50, "mix": 50}
        ),
        PresetInfo(
            index=11,
            name="Finish What Ya Started",
            song="Finish What Ya Started",
            album="OU812",
            year="1988",
            description="Clean subtle micropitch for acoustic tones",
            settings={"pitch_l": 6, "pitch_r": -6, "delay_l": 0, "delay_r": 15, "mix": 35}
        ),
        PresetInfo(
            index=12,
            name="Right Now",
            song="Right Now",
            album="For Unlawful Carnal Knowledge",
            year="1991",
            description="Thick micropitch for bold arena rock sound",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 25, "mix": 50}
        ),
        PresetInfo(
            index=13,
            name="Can't Stop Lovin' You",
            song="Can't Stop Lovin' You",
            album="Balance",
            year="1995",
            description="Smooth ballad tone with micropitch",
            settings={"pitch_l": 9, "pitch_r": -9, "delay_l": 0, "delay_r": 20, "mix": 40}
        ),
        PresetInfo(
            index=14,
            name="Humans Being",
            song="Humans Being",
            album="Twister Soundtrack",
            year="1996",
            description="Thick dramatic detune with feedback",
            settings={"pitch_l": 12, "pitch_r": -12, "delay_l": 0, "delay_r": 30, "feedback": 15, "mix": 55}
        ),
    ]
