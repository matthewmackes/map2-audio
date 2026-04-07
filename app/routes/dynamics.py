"""
Dynamics Processing API Routes
Compressor, Limiter, and Noise Gate controls
"""

from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Query
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
from app.services.plugin_uris import (
    COMPRESSOR_PLUGIN_URI,
    LIMITER_PLUGIN_URI,
    NOISE_GATE_PLUGIN_URI as GATE_PLUGIN_URI,
)

router = APIRouter(prefix="/api/engine/dynamics", tags=["dynamics"])

DEFAULT_DYNAMICS_METERING = {
    "input_level": -100.0,
    "output_level": -100.0,
    "gain_reduction": 0.0,
    "input_rms": -100.0,
    "output_rms": -100.0,
}


def _as_float(value: float) -> float:
    return float(value)


def _as_bool(value: float) -> bool:
    return actual_to_bool(value, False)


_ParamParser = Callable[[float], Any]
_ParameterSpec = Dict[str, tuple[str, float, _ParamParser]]

COMPRESSOR_PARAMETER_SPECS: _ParameterSpec = {
    "threshold": ("threshold", -12.0, _as_float),
    "ratio": ("ratio", 4.0, _as_float),
    "attack": ("attack", 10.0, _as_float),
    "release": ("release", 100.0, _as_float),
    "knee": ("knee", 6.0, _as_float),
    "makeup_gain": ("makeup_gain", 0.0, _as_float),
    "auto_makeup": ("auto_makeup", 0.0, _as_bool),
    "bypass": ("bypass", 0.0, _as_bool),
}

LIMITER_PARAMETER_SPECS: _ParameterSpec = {
    "threshold": ("threshold", -1.0, _as_float),
    "release": ("release", 100.0, _as_float),
    "bypass": ("bypass", 0.0, _as_bool),
}

GATE_PARAMETER_SPECS: _ParameterSpec = {
    "threshold": ("threshold", -40.0, _as_float),
    "ratio": ("ratio", 10.0, _as_float),
    "attack": ("attack", 1.0, _as_float),
    "release": ("release", 100.0, _as_float),
    "bypass": ("bypass", 0.0, _as_bool),
}


# ========================================
# Pydantic Models
# ========================================

class CompressorParams(BaseModel):
    """Compressor parameters"""
    threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Threshold in dB")
    ratio: Optional[float] = Field(None, ge=1.0, le=100.0, description="Compression ratio")
    attack: Optional[float] = Field(None, ge=0.1, le=500.0, description="Attack time in ms")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    knee: Optional[float] = Field(None, ge=0.0, le=24.0, description="Knee width in dB")
    makeup_gain: Optional[float] = Field(None, ge=-12.0, le=24.0, description="Makeup gain in dB")
    auto_makeup: Optional[bool] = Field(None, description="Enable auto makeup gain")
    bypass: Optional[bool] = Field(None, description="Bypass compressor")


class LimiterParams(BaseModel):
    """Limiter parameters"""
    threshold: Optional[float] = Field(None, ge=-60.0, le=0.0, description="Threshold/ceiling in dB")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    bypass: Optional[bool] = Field(None, description="Bypass limiter")


class GateParams(BaseModel):
    """Noise gate parameters"""
    threshold: Optional[float] = Field(None, ge=-100.0, le=0.0, description="Threshold in dB")
    ratio: Optional[float] = Field(None, ge=1.0, le=100.0, description="Gate ratio")
    attack: Optional[float] = Field(None, ge=0.1, le=500.0, description="Attack time in ms")
    release: Optional[float] = Field(None, ge=10.0, le=5000.0, description="Release time in ms")
    bypass: Optional[bool] = Field(None, description="Bypass gate")


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


def _extract_db_level(levels: dict[str, Any], direct_key: str, fallback_linear_keys: tuple[str, ...]) -> float:
    if direct_key in levels:
        return _coerce_float(levels[direct_key], -100.0)
    linear_peak = _extract_linear_peak(levels, *fallback_linear_keys)
    if linear_peak is None:
        return -100.0
    return linear_peak_to_db(linear_peak)


async def _resolve_scoped_dynamics_instance(
    engine: Any,
    label: str,
    plugin_uri: str,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> int:
    scoped_instance_id = await resolve_scoped_instance_id(engine, plugin_uri, instance_id, plugin_position)
    if scoped_instance_id is None:
        raise_scoped_not_found(label, instance_id, plugin_position)
    return scoped_instance_id


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


async def _read_scoped_metering(
    engine: Any,
    plugin_uri: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, float]:
    levels = await get_scoped_vu_levels(engine, plugin_uri, scoped_instance_id, plugin_position)
    if not isinstance(levels, dict):
        return dict(DEFAULT_DYNAMICS_METERING)

    input_level = _extract_db_level(levels, "input_level", ("input", "input_left", "input_right"))
    output_level = _extract_db_level(levels, "output_level", ("output", "output_left", "output_right"))
    input_rms = _coerce_float(levels.get("input_rms"), input_level)
    output_rms = _coerce_float(levels.get("output_rms"), output_level)
    gain_reduction = _coerce_float(levels.get("gain_reduction"), 0.0)

    return {
        "input_level": input_level,
        "output_level": output_level,
        "gain_reduction": gain_reduction,
        "input_rms": input_rms,
        "output_rms": output_rms,
    }


# ========================================
# Compressor Routes
# ========================================

@router.get("/compressor")
async def get_compressor(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get compressor parameters and metering."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Compressor",
            COMPRESSOR_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return {
            "parameters": await _read_scoped_parameters(
                engine,
                COMPRESSOR_PLUGIN_URI,
                COMPRESSOR_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
            "metering": await _read_scoped_metering(
                engine,
                COMPRESSOR_PLUGIN_URI,
                scoped_instance_id,
                plugin_position,
            ),
        }
    params = await engine.get_compressor_parameters()
    metering = await engine.get_compressor_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/compressor/parameters")
async def get_compressor_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get compressor parameters only."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Compressor",
            COMPRESSOR_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_parameters(
            engine,
            COMPRESSOR_PLUGIN_URI,
            COMPRESSOR_PARAMETER_SPECS,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_compressor_parameters()


@router.get("/compressor/metering")
async def get_compressor_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get compressor metering data."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Compressor",
            COMPRESSOR_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_metering(
            engine,
            COMPRESSOR_PLUGIN_URI,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_compressor_metering()


@router.patch("/compressor")
async def update_compressor(
    params: CompressorParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update compressor parameters."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Compressor",
            COMPRESSOR_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        if params.threshold is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "threshold", params.threshold, scoped_instance_id, plugin_position)
        if params.ratio is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "ratio", params.ratio, scoped_instance_id, plugin_position)
        if params.attack is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "attack", params.attack, scoped_instance_id, plugin_position)
        if params.release is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "release", params.release, scoped_instance_id, plugin_position)
        if params.knee is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "knee", params.knee, scoped_instance_id, plugin_position)
        if params.makeup_gain is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "makeup_gain", params.makeup_gain, scoped_instance_id, plugin_position)
        if params.auto_makeup is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "auto_makeup", params.auto_makeup, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_parameters(
                engine,
                COMPRESSOR_PLUGIN_URI,
                COMPRESSOR_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
        }

    if params.threshold is not None:
        await engine.set_compressor_threshold(params.threshold)
    if params.ratio is not None:
        await engine.set_compressor_ratio(params.ratio)
    if params.attack is not None:
        await engine.set_compressor_attack(params.attack)
    if params.release is not None:
        await engine.set_compressor_release(params.release)
    if params.knee is not None:
        await engine.set_compressor_knee(params.knee)
    if params.makeup_gain is not None:
        await engine.set_compressor_makeup_gain(params.makeup_gain)
    if params.auto_makeup is not None:
        await engine.set_compressor_auto_makeup(params.auto_makeup)
    if params.bypass is not None:
        await engine.set_compressor_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_compressor_parameters()}


@router.post("/compressor/bypass/{bypass}")
async def set_compressor_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set compressor bypass state."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Compressor",
            COMPRESSOR_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        await set_scoped_actual_parameter(engine, COMPRESSOR_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_compressor_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Limiter Routes
# ========================================

@router.get("/limiter")
async def get_limiter(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get limiter parameters and metering."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Limiter",
            LIMITER_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return {
            "parameters": await _read_scoped_parameters(
                engine,
                LIMITER_PLUGIN_URI,
                LIMITER_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
            "metering": await _read_scoped_metering(
                engine,
                LIMITER_PLUGIN_URI,
                scoped_instance_id,
                plugin_position,
            ),
        }
    params = await engine.get_limiter_parameters()
    metering = await engine.get_limiter_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/limiter/parameters")
async def get_limiter_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get limiter parameters only."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Limiter",
            LIMITER_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_parameters(
            engine,
            LIMITER_PLUGIN_URI,
            LIMITER_PARAMETER_SPECS,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_limiter_parameters()


@router.get("/limiter/metering")
async def get_limiter_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get limiter metering data."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Limiter",
            LIMITER_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_metering(
            engine,
            LIMITER_PLUGIN_URI,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_limiter_metering()


@router.patch("/limiter")
async def update_limiter(
    params: LimiterParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update limiter parameters."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Limiter",
            LIMITER_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        if params.threshold is not None:
            await set_scoped_actual_parameter(engine, LIMITER_PLUGIN_URI, "threshold", params.threshold, scoped_instance_id, plugin_position)
        if params.release is not None:
            await set_scoped_actual_parameter(engine, LIMITER_PLUGIN_URI, "release", params.release, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, LIMITER_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_parameters(
                engine,
                LIMITER_PLUGIN_URI,
                LIMITER_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
        }

    if params.threshold is not None:
        await engine.set_limiter_threshold(params.threshold)
    if params.release is not None:
        await engine.set_limiter_release(params.release)
    if params.bypass is not None:
        await engine.set_limiter_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_limiter_parameters()}


@router.post("/limiter/bypass/{bypass}")
async def set_limiter_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set limiter bypass state."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Limiter",
            LIMITER_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        await set_scoped_actual_parameter(engine, LIMITER_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_limiter_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Noise Gate Routes
# ========================================

@router.get("/gate")
async def get_gate(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get noise gate parameters and metering."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Gate",
            GATE_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return {
            "parameters": await _read_scoped_parameters(
                engine,
                GATE_PLUGIN_URI,
                GATE_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
            "metering": await _read_scoped_metering(
                engine,
                GATE_PLUGIN_URI,
                scoped_instance_id,
                plugin_position,
            ),
        }
    params = await engine.get_gate_parameters()
    metering = await engine.get_gate_metering()
    return {
        "parameters": params,
        "metering": metering
    }


@router.get("/gate/parameters")
async def get_gate_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get noise gate parameters only."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Gate",
            GATE_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_parameters(
            engine,
            GATE_PLUGIN_URI,
            GATE_PARAMETER_SPECS,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_gate_parameters()


@router.get("/gate/metering")
async def get_gate_metering(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, float]:
    """Get noise gate metering data."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Gate",
            GATE_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        return await _read_scoped_metering(
            engine,
            GATE_PLUGIN_URI,
            scoped_instance_id,
            plugin_position,
        )
    return await engine.get_gate_metering()


@router.patch("/gate")
async def update_gate(
    params: GateParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update noise gate parameters."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Gate",
            GATE_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        if params.threshold is not None:
            await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "threshold", params.threshold, scoped_instance_id, plugin_position)
        if params.ratio is not None:
            await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "ratio", params.ratio, scoped_instance_id, plugin_position)
        if params.attack is not None:
            await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "attack", params.attack, scoped_instance_id, plugin_position)
        if params.release is not None:
            await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "release", params.release, scoped_instance_id, plugin_position)
        if params.bypass is not None:
            await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "bypass", params.bypass, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "parameters": await _read_scoped_parameters(
                engine,
                GATE_PLUGIN_URI,
                GATE_PARAMETER_SPECS,
                scoped_instance_id,
                plugin_position,
            ),
        }

    if params.threshold is not None:
        await engine.set_gate_threshold(params.threshold)
    if params.ratio is not None:
        await engine.set_gate_ratio(params.ratio)
    if params.attack is not None:
        await engine.set_gate_attack(params.attack)
    if params.release is not None:
        await engine.set_gate_release(params.release)
    if params.bypass is not None:
        await engine.set_gate_bypass(params.bypass)

    return {"status": "ok", "parameters": await engine.get_gate_parameters()}


@router.post("/gate/bypass/{bypass}")
async def set_gate_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set noise gate bypass state."""
    engine = get_audio_engine()
    if is_scoped_request(instance_id, plugin_position):
        scoped_instance_id = await _resolve_scoped_dynamics_instance(
            engine,
            "Gate",
            GATE_PLUGIN_URI,
            instance_id,
            plugin_position,
        )
        await set_scoped_actual_parameter(engine, GATE_PLUGIN_URI, "bypass", bypass, scoped_instance_id, plugin_position)
        return {"status": "ok", "bypass": bypass}
    await engine.set_gate_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


# ========================================
# Combined Dynamics Routes
# ========================================

@router.get("/")
async def get_all_dynamics() -> Dict[str, Any]:
    """Get all dynamics processor states."""
    engine = get_audio_engine()

    return {
        "compressor": {
            "parameters": await engine.get_compressor_parameters(),
            "metering": await engine.get_compressor_metering()
        },
        "limiter": {
            "parameters": await engine.get_limiter_parameters(),
            "metering": await engine.get_limiter_metering()
        },
        "gate": {
            "parameters": await engine.get_gate_parameters(),
            "metering": await engine.get_gate_metering()
        }
    }


@router.get("/metering")
async def get_dynamics_metering() -> Dict[str, Dict[str, float]]:
    """Get all dynamics metering data (for real-time display)."""
    engine = get_audio_engine()
    return await engine.get_dynamics_metering()
