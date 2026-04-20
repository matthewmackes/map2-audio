"""
EQ/Filter Processing API Routes
8-band parametric EQ control
"""

import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.juce_engine_service import get_audio_engine
from app.services.plugin_instance_id import resolve_legacy_instance_id

router = APIRouter(prefix="/api/engine/eq", tags=["eq"])

EQ_PLUGIN_URI = "map2://juce/eq/parametric"
MAX_EQ_BANDS = 8
DEFAULT_EQ_FREQUENCIES = [80.0, 160.0, 320.0, 640.0, 1280.0, 2560.0, 5120.0, 10240.0]
FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch", "peak", "lowshelf", "highshelf", "allpass"]
FILTER_TYPE_TO_ENGINE_INDEX = {name: index for index, name in enumerate(FILTER_TYPES)}
ENGINE_INDEX_TO_FILTER_TYPE = {index: name for index, name in enumerate(FILTER_TYPES)}


# ========================================
# Pydantic Models
# ========================================

class EQBandParams(BaseModel):
    """EQ band parameters"""

    type: Optional[str] = Field(None, description="Filter type (peak, lowpass, highpass, etc.)")
    frequency: Optional[float] = Field(None, ge=20.0, le=20000.0, description="Center frequency in Hz")
    gain: Optional[float] = Field(None, ge=-24.0, le=24.0, description="Gain in dB")
    q: Optional[float] = Field(None, ge=0.1, le=10.0, description="Q factor")
    enabled: Optional[bool] = Field(None, description="Band enabled state")


class EQParams(BaseModel):
    """Full EQ parameters"""

    bands: Optional[List[EQBandParams]] = Field(None, description="Band parameters (8 bands)")
    output_gain: Optional[float] = Field(None, ge=-12.0, le=12.0, description="Output gain in dB")
    bypass: Optional[bool] = Field(None, description="Bypass EQ")


class FrequencyResponseRequest(BaseModel):
    """Request for frequency response"""

    frequencies: List[float] = Field(..., description="Frequencies to evaluate (Hz)")


# ========================================
# Scoped EQ Helpers
# ========================================

def _has_plugin_position(plugin_position: Optional[int]) -> bool:
    return isinstance(plugin_position, int) and plugin_position >= 0


def _has_explicit_instance_id(instance_id: Optional[int]) -> bool:
    return isinstance(instance_id, int) and instance_id > 0


def _is_scoped_eq_request(instance_id: Optional[int], plugin_position: Optional[int]) -> bool:
    return _has_explicit_instance_id(instance_id) or _has_plugin_position(plugin_position)


def _raise_scoped_eq_not_found(instance_id: Optional[int], plugin_position: Optional[int]) -> None:
    if _has_plugin_position(plugin_position):
        raise HTTPException(status_code=404, detail=f"EQ instance not found at position: {plugin_position}")
    if _has_explicit_instance_id(instance_id):
        raise HTTPException(status_code=404, detail=f"EQ instance not found: {instance_id}")
    raise HTTPException(status_code=404, detail="EQ instance not found")


async def _resolve_scoped_instance_id(
    engine: Any,
    instance_id: Optional[int],
    plugin_position: Optional[int],
) -> Optional[int]:
    explicit_instance_id = instance_id if _has_explicit_instance_id(instance_id) else None
    resolver = getattr(engine, "resolve_instance_id", None)
    if callable(resolver):
        try:
            resolved_instance_id = await resolver(
                EQ_PLUGIN_URI,
                plugin_position,
                fallback_instance_id=explicit_instance_id,
            )
        except TypeError:
            resolved_instance_id = await resolver(EQ_PLUGIN_URI, plugin_position)
            if not isinstance(resolved_instance_id, int) or resolved_instance_id <= 0:
                resolved_instance_id = explicit_instance_id
        return resolved_instance_id if isinstance(resolved_instance_id, int) and resolved_instance_id > 0 else None

    if explicit_instance_id is not None:
        return explicit_instance_id
    if not _has_plugin_position(plugin_position):
        return None

    return await resolve_legacy_instance_id(engine, EQ_PLUGIN_URI, plugin_position)


def _band_symbol(index: int, suffix: str) -> str:
    return f"band{index + 1}_{suffix}"


def _coerce_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: Any, default: bool = False) -> bool:
    try:
        return float(value) >= 0.5
    except (TypeError, ValueError):
        return default


def _normalize_filter_type(filter_type: str) -> str:
    normalized = filter_type.strip().lower()
    if normalized not in FILTER_TYPE_TO_ENGINE_INDEX:
        raise HTTPException(status_code=400, detail=f"Invalid filter type. Must be one of: {FILTER_TYPES}")
    return normalized


async def _read_scoped_parameter(
    engine: Any,
    symbol: str,
    scoped_instance_id: int,
    plugin_position: Optional[int],
    default: float,
) -> float:
    value = await engine.get_parameter(
        EQ_PLUGIN_URI,
        symbol,
        instance_id=scoped_instance_id,
        plugin_position=plugin_position,
    )
    return _coerce_float(value, default)


async def _read_scoped_eq_band(
    engine: Any,
    index: int,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    default_frequency = DEFAULT_EQ_FREQUENCIES[index]
    type_index = round(
        await _read_scoped_parameter(
            engine,
            _band_symbol(index, "type"),
            scoped_instance_id,
            plugin_position,
            FILTER_TYPE_TO_ENGINE_INDEX["peak"],
        )
    )
    type_index = max(0, min(len(FILTER_TYPES) - 1, int(type_index)))

    return {
        "type": ENGINE_INDEX_TO_FILTER_TYPE.get(type_index, "peak"),
        "frequency": await _read_scoped_parameter(
            engine,
            _band_symbol(index, "freq"),
            scoped_instance_id,
            plugin_position,
            default_frequency,
        ),
        "gain": await _read_scoped_parameter(
            engine,
            _band_symbol(index, "gain"),
            scoped_instance_id,
            plugin_position,
            0.0,
        ),
        "q": await _read_scoped_parameter(
            engine,
            _band_symbol(index, "q"),
            scoped_instance_id,
            plugin_position,
            1.0,
        ),
        "enabled": _coerce_bool(
            await _read_scoped_parameter(
                engine,
                _band_symbol(index, "enabled"),
                scoped_instance_id,
                plugin_position,
                1.0,
            ),
            True,
        ),
    }


async def _read_scoped_eq_parameters(
    engine: Any,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> Dict[str, Any]:
    bands = [
        await _read_scoped_eq_band(engine, index, scoped_instance_id, plugin_position)
        for index in range(MAX_EQ_BANDS)
    ]
    return {
        "bands": bands,
        "output_gain": await _read_scoped_parameter(
            engine,
            "outputGain",
            scoped_instance_id,
            plugin_position,
            0.0,
        ),
        "bypass": _coerce_bool(
            await _read_scoped_parameter(
                engine,
                "bypass",
                scoped_instance_id,
                plugin_position,
                0.0,
            ),
            False,
        ),
    }


async def _set_scoped_parameter(
    engine: Any,
    symbol: str,
    value: float,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> None:
    updated = await engine.set_parameter(
        EQ_PLUGIN_URI,
        symbol,
        value,
        instance_id=scoped_instance_id,
        plugin_position=plugin_position,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"EQ instance not found: {scoped_instance_id}")


async def _apply_scoped_eq_band_update(
    engine: Any,
    index: int,
    params: EQBandParams,
    scoped_instance_id: int,
    plugin_position: Optional[int],
) -> None:
    if params.frequency is not None:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "freq"),
            float(params.frequency),
            scoped_instance_id,
            plugin_position,
        )
    if params.gain is not None:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "gain"),
            float(params.gain),
            scoped_instance_id,
            plugin_position,
        )
    if params.q is not None:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "q"),
            float(params.q),
            scoped_instance_id,
            plugin_position,
        )
    if params.type is not None:
        normalized_type = _normalize_filter_type(params.type)
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "type"),
            float(FILTER_TYPE_TO_ENGINE_INDEX[normalized_type]),
            scoped_instance_id,
            plugin_position,
        )
    if params.enabled is not None:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "enabled"),
            1.0 if params.enabled else 0.0,
            scoped_instance_id,
            plugin_position,
        )


def _calculate_band_frequency_response(band: Dict[str, Any], frequencies: List[float]) -> List[float]:
    response = [0.0] * len(frequencies)
    if not band.get("enabled", True):
        return response

    fc = max(_coerce_float(band.get("frequency"), 1000.0), 20.0)
    gain = _coerce_float(band.get("gain"), 0.0)
    q = max(_coerce_float(band.get("q"), 1.0), 0.1)
    filter_type = str(band.get("type", "peak"))

    for index, frequency in enumerate(frequencies):
        ratio = max(frequency / fc, 1e-9)

        if filter_type == "lowpass":
            response[index] = -20.0 * math.log10(math.sqrt(1.0 + math.pow(ratio, 4.0)))
        elif filter_type == "highpass":
            response[index] = -20.0 * math.log10(math.sqrt(1.0 + math.pow(1.0 / ratio, 4.0)))
        elif filter_type == "peak":
            log_ratio = math.log2(ratio)
            bandwidth = 1.0 / q
            bell_curve = math.exp(-0.5 * math.pow(log_ratio / bandwidth, 2.0))
            response[index] = gain * bell_curve
        elif filter_type == "lowshelf":
            transition = 1.0 / (1.0 + math.pow(ratio, 2.0))
            response[index] = gain * transition
        elif filter_type == "highshelf":
            transition = 1.0 / (1.0 + math.pow(1.0 / ratio, 2.0))
            response[index] = gain * transition
        elif filter_type == "bandpass":
            bandwidth = fc / q
            delta = abs(frequency - fc)
            response[index] = -20.0 * math.log10(1.0 + math.pow(delta / bandwidth, 2.0))
        elif filter_type == "notch":
            bandwidth = fc / q
            delta = abs(frequency - fc)
            if delta < bandwidth * 0.5:
                response[index] = -60.0 * (1.0 - delta / (bandwidth * 0.5))

    return response


def _calculate_eq_frequency_response(parameters: Dict[str, Any], frequencies: List[float]) -> List[float]:
    response = [0.0] * len(frequencies)
    for band in parameters.get("bands", []):
        band_response = _calculate_band_frequency_response(band, frequencies)
        for index, value in enumerate(band_response):
            response[index] += value

    output_gain = _coerce_float(parameters.get("output_gain"), 0.0)
    return [value + output_gain for value in response]


def _build_default_frequency_axis() -> List[float]:
    return [20.0 * math.pow(10, index * 3.0 / 63.0) for index in range(64)]


# ========================================
# Band Routes
# ========================================

@router.get("/bands/{index}")
async def get_eq_band(
    index: int,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get EQ band parameters."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        return await _read_scoped_eq_band(engine, index, scoped_instance_id, plugin_position)
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    return await engine.get_eq_band(index)


@router.patch("/bands/{index}")
async def update_eq_band(
    index: int,
    params: EQBandParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update EQ band parameters."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _apply_scoped_eq_band_update(engine, index, params, scoped_instance_id, plugin_position)
        return {
            "status": "ok",
            "band": await _read_scoped_eq_band(engine, index, scoped_instance_id, plugin_position),
        }
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    if params.frequency is not None:
        await engine.set_eq_band_frequency(index, params.frequency)
    if params.gain is not None:
        await engine.set_eq_band_gain(index, params.gain)
    if params.q is not None:
        await engine.set_eq_band_q(index, params.q)
    if params.type is not None:
        await engine.set_eq_band_type(index, _normalize_filter_type(params.type))
    if params.enabled is not None:
        await engine.set_eq_band_enabled(index, params.enabled)

    return {"status": "ok", "band": await engine.get_eq_band(index)}


@router.post("/bands/{index}/frequency/{hz}")
async def set_eq_band_frequency(
    index: int,
    hz: float,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ band frequency."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not 20.0 <= hz <= 20000.0:
        raise HTTPException(status_code=400, detail="Frequency must be 20-20000 Hz")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "freq"),
            float(hz),
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "index": index, "frequency": hz}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_band_frequency(index, hz)
    return {"status": "ok", "index": index, "frequency": hz}


@router.post("/bands/{index}/gain/{db}")
async def set_eq_band_gain(
    index: int,
    db: float,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ band gain."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not -24.0 <= db <= 24.0:
        raise HTTPException(status_code=400, detail="Gain must be -24 to +24 dB")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "gain"),
            float(db),
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "index": index, "gain": db}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_band_gain(index, db)
    return {"status": "ok", "index": index, "gain": db}


@router.post("/bands/{index}/q/{q}")
async def set_eq_band_q(
    index: int,
    q: float,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ band Q factor."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")
    if not 0.1 <= q <= 10.0:
        raise HTTPException(status_code=400, detail="Q must be 0.1 to 10")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "q"),
            float(q),
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "index": index, "q": q}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_band_q(index, q)
    return {"status": "ok", "index": index, "q": q}


@router.post("/bands/{index}/type/{filter_type}")
async def set_eq_band_type(
    index: int,
    filter_type: str,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ band filter type."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    normalized_filter_type = _normalize_filter_type(filter_type)
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "type"),
            float(FILTER_TYPE_TO_ENGINE_INDEX[normalized_filter_type]),
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "index": index, "type": normalized_filter_type}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_band_type(index, normalized_filter_type)
    return {"status": "ok", "index": index, "type": normalized_filter_type}


@router.post("/bands/{index}/enabled/{enabled}")
async def set_eq_band_enabled(
    index: int,
    enabled: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Enable/disable EQ band."""
    if index < 0 or index >= MAX_EQ_BANDS:
        raise HTTPException(status_code=400, detail="Band index must be 0-7")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            _band_symbol(index, "enabled"),
            1.0 if enabled else 0.0,
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "index": index, "enabled": enabled}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_band_enabled(index, enabled)
    return {"status": "ok", "index": index, "enabled": enabled}


# ========================================
# Global EQ Routes
# ========================================

@router.get("/")
async def get_eq(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get all EQ parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        params = await _read_scoped_eq_parameters(engine, scoped_instance_id, plugin_position)
        return {
            "parameters": params,
            "bypass": params["bypass"],
        }
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    params = await engine.get_eq_parameters()
    bypass = await engine.is_eq_bypassed()
    return {
        "parameters": params,
        "bypass": bypass,
    }


@router.get("/parameters")
async def get_eq_parameters(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get EQ parameters only."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        return await _read_scoped_eq_parameters(engine, scoped_instance_id, plugin_position)
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    return await engine.get_eq_parameters()


@router.patch("/")
async def update_eq(
    params: EQParams,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Update EQ parameters."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        if params.output_gain is not None:
            await _set_scoped_parameter(
                engine,
                "outputGain",
                float(params.output_gain),
                scoped_instance_id,
                plugin_position,
            )
        if params.bypass is not None:
            await _set_scoped_parameter(
                engine,
                "bypass",
                1.0 if params.bypass else 0.0,
                scoped_instance_id,
                plugin_position,
            )
        if params.bands:
            for index, band in enumerate(params.bands[:MAX_EQ_BANDS]):
                await _apply_scoped_eq_band_update(engine, index, band, scoped_instance_id, plugin_position)

        return {
            "status": "ok",
            "parameters": await _read_scoped_eq_parameters(engine, scoped_instance_id, plugin_position),
        }
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    if params.output_gain is not None:
        await engine.set_eq_output_gain(params.output_gain)
    if params.bypass is not None:
        await engine.set_eq_bypass(params.bypass)

    if params.bands:
        for index, band in enumerate(params.bands[:MAX_EQ_BANDS]):
            if band.frequency is not None:
                await engine.set_eq_band_frequency(index, band.frequency)
            if band.gain is not None:
                await engine.set_eq_band_gain(index, band.gain)
            if band.q is not None:
                await engine.set_eq_band_q(index, band.q)
            if band.type is not None:
                await engine.set_eq_band_type(index, _normalize_filter_type(band.type))
            if band.enabled is not None:
                await engine.set_eq_band_enabled(index, band.enabled)

    return {"status": "ok", "parameters": await engine.get_eq_parameters()}


@router.post("/bypass/{bypass}")
async def set_eq_bypass(
    bypass: bool,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ bypass state."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            "bypass",
            1.0 if bypass else 0.0,
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "bypass": bypass}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_bypass(bypass)
    return {"status": "ok", "bypass": bypass}


@router.post("/output-gain/{db}")
async def set_eq_output_gain(
    db: float,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Set EQ output gain."""
    if not -12.0 <= db <= 12.0:
        raise HTTPException(status_code=400, detail="Output gain must be -12 to +12 dB")

    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        await _set_scoped_parameter(
            engine,
            "outputGain",
            float(db),
            scoped_instance_id,
            plugin_position,
        )
        return {"status": "ok", "output_gain": db}
    if _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)

    await engine.set_eq_output_gain(db)
    return {"status": "ok", "output_gain": db}


# ========================================
# Frequency Response
# ========================================

@router.post("/frequency-response")
async def get_frequency_response(
    request: FrequencyResponseRequest,
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get EQ frequency response at given frequencies."""
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        params = await _read_scoped_eq_parameters(engine, scoped_instance_id, plugin_position)
        response = _calculate_eq_frequency_response(params, request.frequencies)
    elif _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)
    else:
        response = await engine.get_eq_frequency_response(request.frequencies)

    return {
        "frequencies": request.frequencies,
        "response": response,
    }


@router.get("/frequency-response/default")
async def get_default_frequency_response(
    instance_id: Optional[int] = Query(None),
    plugin_position: Optional[int] = Query(None),
) -> Dict[str, Any]:
    """Get frequency response at standard frequencies (20Hz to 20kHz)."""
    frequencies = _build_default_frequency_axis()
    engine = get_audio_engine()
    scoped_instance_id = await _resolve_scoped_instance_id(engine, instance_id, plugin_position)
    if isinstance(scoped_instance_id, int) and scoped_instance_id > 0:
        params = await _read_scoped_eq_parameters(engine, scoped_instance_id, plugin_position)
        response = _calculate_eq_frequency_response(params, frequencies)
    elif _is_scoped_eq_request(instance_id, plugin_position):
        _raise_scoped_eq_not_found(instance_id, plugin_position)
    else:
        response = await engine.get_eq_frequency_response(frequencies)

    return {
        "frequencies": frequencies,
        "response": response,
    }
