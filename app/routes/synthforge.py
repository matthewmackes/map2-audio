"""
SynthForge API Routes
Phase 1 control surface for part configuration, patches, and voice metrics.
"""

import asyncio
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.juce_engine_service import get_audio_engine

router = APIRouter(prefix="/api/synthforge", tags=["synthforge"])


def _validate_part_index(part_index: int) -> None:
    if part_index < 0 or part_index > 15:
        raise HTTPException(status_code=400, detail="part_index must be in range 0..15")


def _validate_output_bus(output_bus: str) -> None:
    allowed = {
        "main",
        "aux_1",
        "aux_2",
        "aux_3",
        "aux_4",
        "aux_5",
        "aux_6",
        "aux_7",
        "aux_8",
    }
    if output_bus not in allowed:
        raise HTTPException(status_code=400, detail="output_bus must be one of main, aux_1..aux_8")


class PartConfig(BaseModel):
    part_index: int = Field(..., ge=0, le=15)
    midi_channel: int = Field(..., ge=0, le=16, description="0 = OMNI, 1..16 = specific channel")
    output_bus: str = Field("main")
    level: float = Field(1.0, ge=0.0, le=1.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    mute: bool = False
    solo: bool = False


class PatchInfo(BaseModel):
    bank: int
    program: int
    name: str
    category: str
    author: str
    description: Optional[str] = None


class LoadPatchRequest(BaseModel):
    part_index: int = Field(..., ge=0, le=15)
    bank: int = Field(..., ge=0)
    program: int = Field(..., ge=0)


class SavePatchRequest(BaseModel):
    part_index: int = Field(..., ge=0, le=15)
    bank: int = Field(..., ge=0)
    program: int = Field(..., ge=0)
    name: str = Field(..., min_length=1, max_length=128)


class ParameterUpdateRequest(BaseModel):
    param: str = Field(..., min_length=1, max_length=128)
    value: float


class SfzLoadRequest(BaseModel):
    part_index: int = Field(..., ge=0, le=15)
    sfz_path: str = Field(..., min_length=1, max_length=4096)


class SoundFontLoadRequest(BaseModel):
    part_index: int = Field(..., ge=0, le=15)
    soundfont_path: str = Field(..., min_length=1, max_length=4096)
    bank: int = Field(0, ge=0, le=16384)
    program: int = Field(0, ge=0, le=16384)
    preset_name: str = Field("", max_length=256)


class MidiNoteRequest(BaseModel):
    channel: int = Field(..., ge=1, le=16)
    note: int = Field(..., ge=0, le=127)
    velocity: int = Field(100, ge=0, le=127)


class MidiNoteOffRequest(BaseModel):
    channel: int = Field(..., ge=1, le=16)
    note: int = Field(..., ge=0, le=127)
    velocity: int = Field(0, ge=0, le=127)


class SamplerBackendRequest(BaseModel):
    backend: str = Field(..., pattern="^(native|sfizz)$")


class StreamingConfigRequest(BaseModel):
    enabled: bool = True
    preload_size: int = Field(131072, ge=16384, le=16_777_216)
    max_voices: int = Field(64, ge=8, le=512)
    interpolation: str = Field("hermite", pattern="^(linear|hermite|sinc)$")
    quality_live: int = Field(5, ge=0, le=10)
    quality_freewheeling: int = Field(8, ge=0, le=10)
    memory_limit_mb: int = Field(256, ge=64, le=8192)


class HotReloadRequest(BaseModel):
    enabled: bool
    interval_ms: int = Field(1000, ge=100, le=10000)


class ScalaTuningRequest(BaseModel):
    scala_path: str = Field(..., min_length=1, max_length=4096)
    root_key: int = Field(60, ge=0, le=127)
    reference_hz: float = Field(440.0, ge=300.0, le=500.0)


class MpeConfigRequest(BaseModel):
    enabled: bool = False
    lower_zone_channels: int = Field(0, ge=0, le=15)
    upper_zone_channels: int = Field(0, ge=0, le=15)
    pitch_bend_range_semitones: int = Field(48, ge=1, le=96)


class ModMatrixRouteModel(BaseModel):
    source: str = Field(..., min_length=1, max_length=128)
    destination: str = Field(..., min_length=1, max_length=128)
    amount: float = Field(0.0, ge=-1.0, le=1.0)
    bipolar: bool = False
    enabled: bool = True


class ModMatrixRoutesRequest(BaseModel):
    routes: List[ModMatrixRouteModel] = Field(default_factory=list)


class FreezeRequest(BaseModel):
    enabled: bool


class RenderRequest(BaseModel):
    output_path: str = Field(..., min_length=1, max_length=4096)
    duration_ms: int = Field(2000, ge=100, le=120000)


class PerformanceConfigRequest(BaseModel):
    master_transpose: int = Field(0, ge=-36, le=36)
    velocity_curve: float = Field(0.0, ge=-1.0, le=1.0)
    pitch_bend_range: int = Field(2, ge=1, le=48)
    mono_mode: bool = False
    legato: bool = False


@router.get("/parts")
async def get_parts() -> List[Dict]:
    """Get configuration for all 16 SynthForge parts."""
    engine = get_audio_engine()
    return await engine.get_synthforge_parts_config()


@router.post("/parts/{part_index}/config")
async def update_part_config(part_index: int, config: PartConfig) -> Dict[str, object]:
    """Update SynthForge configuration for a single part."""
    _validate_part_index(part_index)
    _validate_output_bus(config.output_bus)

    if config.part_index != part_index:
        raise HTTPException(status_code=400, detail="part_index in path and payload must match")

    engine = get_audio_engine()
    success = await engine.set_synthforge_part_config(part_index, config.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update SynthForge part config")

    return {"status": "ok", "part_index": part_index}


@router.get("/patches")
async def list_patches(category: Optional[str] = None) -> List[PatchInfo]:
    """List available SynthForge patches."""
    engine = get_audio_engine()
    patches = await engine.get_synthforge_patches(category)
    return [PatchInfo(**patch) for patch in patches]


@router.post("/patches/load")
async def load_patch(request: LoadPatchRequest) -> Dict[str, object]:
    """Load a SynthForge patch into a part."""
    engine = get_audio_engine()
    success = await engine.load_synthforge_patch(
        request.part_index,
        request.bank,
        request.program,
    )
    if not success:
        raise HTTPException(status_code=404, detail="SynthForge patch not found")

    return {
        "status": "ok",
        "part_index": request.part_index,
        "bank": request.bank,
        "program": request.program,
    }


@router.post("/patches/save")
async def save_patch(request: SavePatchRequest) -> Dict[str, object]:
    """Save current SynthForge part state as a patch."""
    engine = get_audio_engine()
    success = await engine.save_synthforge_patch(
        request.part_index,
        request.bank,
        request.program,
        request.name,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save SynthForge patch")

    return {
        "status": "ok",
        "part_index": request.part_index,
        "bank": request.bank,
        "program": request.program,
        "name": request.name,
    }


@router.get("/voices")
async def get_voice_metrics() -> Dict:
    """Get SynthForge voice allocation metrics."""
    engine = get_audio_engine()
    return await engine.get_synthforge_voice_metrics()


@router.get("/parameters/{part_index}")
async def get_part_parameters(part_index: int) -> Dict[str, float]:
    """Get all parameters for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_parameters(part_index)


@router.get("/parts/{part_index}/performance")
async def get_part_performance(part_index: int) -> Dict[str, object]:
    """Get SoundFont-first performance controls for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    params = await engine.get_synthforge_part_parameters(part_index)
    return {
        "master_transpose": int(params.get("global.transpose", 0)),
        "velocity_curve": float(params.get("performance.velocity_curve", 0.0)),
        "pitch_bend_range": int(params.get("performance.pitch_bend_range", 2)),
        "mono_mode": bool(params.get("performance.mono_mode", 0.0) >= 0.5),
        "legato": bool(params.get("performance.legato", 0.0) >= 0.5),
    }


@router.post("/parts/{part_index}/performance")
async def set_part_performance(part_index: int, request: PerformanceConfigRequest) -> Dict[str, object]:
    """Set SoundFont-first performance controls for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    updates = {
        "global.transpose": float(request.master_transpose),
        "performance.velocity_curve": float(request.velocity_curve),
        "performance.pitch_bend_range": float(request.pitch_bend_range),
        "performance.mono_mode": 1.0 if request.mono_mode else 0.0,
        "performance.legato": 1.0 if request.legato else 0.0,
    }

    for param, value in updates.items():
        success = await engine.set_synthforge_parameter(part_index, param, value)
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to set performance parameter: {param}")

    return {
        "status": "ok",
        "part_index": part_index,
        "performance": await get_part_performance(part_index),
    }


@router.post("/parameters/{part_index}")
async def set_part_parameter(part_index: int, request: ParameterUpdateRequest) -> Dict[str, object]:
    """Set a single SynthForge parameter on a part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_parameter(part_index, request.param, request.value)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set SynthForge parameter")

    return {"status": "ok", "part_index": part_index, "param": request.param, "value": request.value}


@router.post("/sfz/load")
async def load_part_sfz(request: SfzLoadRequest) -> Dict[str, object]:
    """Load an SFZ file into a SynthForge part sampler."""
    _validate_part_index(request.part_index)

    sfz_path = request.sfz_path.strip()
    if not sfz_path.lower().endswith(".sfz"):
        raise HTTPException(status_code=400, detail="sfz_path must point to a .sfz file")

    engine = get_audio_engine()
    success = await engine.load_synthforge_sfz(request.part_index, sfz_path)
    status = await engine.get_synthforge_part_sample_status(request.part_index)

    if not success:
        detail = status.get("last_error") or "Failed to load SFZ"
        raise HTTPException(status_code=400, detail=detail)

    return {
        "status": "ok",
        "part_index": request.part_index,
        "sample_status": status,
    }


@router.post("/soundfont/load")
async def load_part_soundfont(request: SoundFontLoadRequest) -> Dict[str, object]:
    """Load a SoundFont 2/3 file into a SynthForge part."""
    _validate_part_index(request.part_index)

    soundfont_path = request.soundfont_path.strip()
    if not soundfont_path.lower().endswith((".sf2", ".sf3")):
        raise HTTPException(status_code=400, detail="soundfont_path must point to a .sf2 or .sf3 file")

    engine = get_audio_engine()
    success = await engine.load_synthforge_soundfont(
        request.part_index,
        soundfont_path,
        request.bank,
        request.program,
        request.preset_name,
    )
    status = await engine.get_synthforge_part_sample_status(request.part_index)

    if not success:
        detail = status.get("last_error") or "Failed to load SoundFont"
        raise HTTPException(status_code=503, detail=detail)

    return {
        "status": "ok",
        "part_index": request.part_index,
        "sample_status": status,
    }


@router.get("/sfz/status/{part_index}")
async def get_part_sfz_status(part_index: int) -> Dict[str, object]:
    """Get SFZ sampler status for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_sample_status(part_index)


@router.post("/sfz/reload-if-changed/{part_index}")
async def reload_part_sfz_if_changed(part_index: int) -> Dict[str, object]:
    """Reload SFZ if source file changed on disk."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    reloaded = await engine.reload_synthforge_sfz_if_changed(part_index)
    status = await engine.get_synthforge_part_sample_status(part_index)
    hot_reload = await engine.get_synthforge_part_hot_reload_status(part_index)
    return {
        "status": "ok",
        "part_index": part_index,
        "reloaded": reloaded,
        "sample_status": status,
        "hot_reload": hot_reload,
    }


@router.post("/parts/{part_index}/sampler-backend")
async def set_part_sampler_backend(part_index: int, request: SamplerBackendRequest) -> Dict[str, object]:
    """Set sampler backend for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_sampler_backend(part_index, request.backend)
    if not success:
        raise HTTPException(status_code=400, detail="Requested sampler backend is not available")

    return {"status": "ok", "part_index": part_index, "backend": request.backend}


@router.get("/parts/{part_index}/sampler-backend")
async def get_part_sampler_backend(part_index: int) -> Dict[str, object]:
    """Get sampler backend for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    backend = await engine.get_synthforge_part_sampler_backend(part_index)
    return {"part_index": part_index, "backend": backend}


@router.post("/parts/{part_index}/streaming")
async def set_part_streaming_config(part_index: int, request: StreamingConfigRequest) -> Dict[str, object]:
    """Configure streaming/interpolation settings for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_streaming_config(part_index, request.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update streaming config")

    config = await engine.get_synthforge_part_streaming_config(part_index)
    return {"status": "ok", "part_index": part_index, "config": config}


@router.get("/parts/{part_index}/streaming")
async def get_part_streaming_config(part_index: int) -> Dict[str, object]:
    """Get streaming/interpolation settings for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_streaming_config(part_index)


@router.post("/parts/{part_index}/hot-reload")
async def set_part_hot_reload(part_index: int, request: HotReloadRequest) -> Dict[str, object]:
    """Enable/disable hot reload checks for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_hot_reload(
        part_index,
        request.enabled,
        request.interval_ms,
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update hot reload config")

    status = await engine.get_synthforge_part_hot_reload_status(part_index)
    return {"status": "ok", "part_index": part_index, "hot_reload": status}


@router.get("/parts/{part_index}/hot-reload")
async def get_part_hot_reload(part_index: int) -> Dict[str, object]:
    """Get hot reload status for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_hot_reload_status(part_index)


@router.post("/parts/{part_index}/scala")
async def load_part_scala_tuning(part_index: int, request: ScalaTuningRequest) -> Dict[str, object]:
    """Load Scala tuning for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.load_synthforge_part_scala_tuning(
        part_index,
        request.scala_path,
        request.root_key,
        request.reference_hz,
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to load Scala tuning")

    tuning = await engine.get_synthforge_part_scala_tuning(part_index)
    return {"status": "ok", "part_index": part_index, "tuning": tuning}


@router.get("/parts/{part_index}/scala")
async def get_part_scala_tuning(part_index: int) -> Dict[str, object]:
    """Get Scala tuning for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_scala_tuning(part_index)


@router.post("/parts/{part_index}/mpe")
async def set_part_mpe_config(part_index: int, request: MpeConfigRequest) -> Dict[str, object]:
    """Set MPE/channel-expression configuration for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_mpe_config(part_index, request.model_dump())
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set MPE config")

    config = await engine.get_synthforge_part_mpe_config(part_index)
    return {"status": "ok", "part_index": part_index, "mpe": config}


@router.get("/parts/{part_index}/mpe")
async def get_part_mpe_config(part_index: int) -> Dict[str, object]:
    """Get MPE/channel-expression config for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_mpe_config(part_index)


@router.post("/parts/{part_index}/mod-matrix")
async def set_part_mod_matrix_routes(part_index: int, request: ModMatrixRoutesRequest) -> Dict[str, object]:
    """Set modulation matrix routes for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_mod_matrix_routes(
        part_index,
        [route.model_dump() for route in request.routes],
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set modulation matrix routes")

    routes = await engine.get_synthforge_part_mod_matrix_routes(part_index)
    return {"status": "ok", "part_index": part_index, "routes": routes}


@router.get("/parts/{part_index}/mod-matrix")
async def get_part_mod_matrix_routes(part_index: int) -> List[Dict[str, object]]:
    """Get modulation matrix routes for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_mod_matrix_routes(part_index)


@router.post("/parts/{part_index}/freeze")
async def set_part_freeze(part_index: int, request: FreezeRequest) -> Dict[str, object]:
    """Enable/disable freeze mode for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.set_synthforge_part_freeze(part_index, request.enabled)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set freeze mode")

    status = await engine.get_synthforge_part_freeze_status(part_index)
    return {"status": "ok", "part_index": part_index, "freeze": status}


@router.get("/parts/{part_index}/freeze")
async def get_part_freeze_status(part_index: int) -> Dict[str, object]:
    """Get freeze/render status for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_freeze_status(part_index)


@router.post("/parts/{part_index}/render")
async def render_part_to_file(part_index: int, request: RenderRequest) -> Dict[str, object]:
    """Render part output to a WAV file."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    success = await engine.render_synthforge_part_to_file(part_index, request.output_path, request.duration_ms)
    status = await engine.get_synthforge_part_freeze_status(part_index)
    if not success:
        detail = status.get("last_error") or "Failed to render part"
        raise HTTPException(status_code=400, detail=detail)

    return {"status": "ok", "part_index": part_index, "freeze": status}


@router.get("/parts/{part_index}/analyzer")
async def get_part_analyzer_frame(part_index: int) -> Dict[str, object]:
    """Get analyzer frame for one part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_analyzer_frame(part_index)


@router.get("/analyzer")
async def get_analyzer_frames() -> List[Dict[str, object]]:
    """Get analyzer frames for all SynthForge parts."""
    engine = get_audio_engine()
    return await engine.get_synthforge_analyzer_frames()


@router.get("/backend-status/{part_index}")
async def get_part_backend_status(part_index: int) -> Dict[str, object]:
    """Get backend/opcode status for one part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_backend_status(part_index)


@router.get("/backend-status")
async def get_backend_status() -> List[Dict[str, object]]:
    """Get backend/opcode status for all parts."""
    engine = get_audio_engine()
    return await engine.get_synthforge_backend_status()


@router.post("/midi/note-on")
async def inject_note_on(request: MidiNoteRequest) -> Dict[str, object]:
    """Inject MIDI note-on event through the JUCE MIDI input path."""
    engine = get_audio_engine()
    success = await engine.inject_midi_note_on(
        request.channel,
        request.note,
        request.velocity,
    )
    if not success:
        raise HTTPException(status_code=503, detail="MIDI note injection unavailable")

    return {
        "status": "ok",
        "channel": request.channel,
        "note": request.note,
        "velocity": request.velocity,
    }


@router.post("/midi/note-off")
async def inject_note_off(request: MidiNoteOffRequest) -> Dict[str, object]:
    """Inject MIDI note-off event through the JUCE MIDI input path."""
    engine = get_audio_engine()
    success = await engine.inject_midi_note_off(
        request.channel,
        request.note,
        request.velocity,
    )
    if not success:
        raise HTTPException(status_code=503, detail="MIDI note injection unavailable")

    return {
        "status": "ok",
        "channel": request.channel,
        "note": request.note,
        "velocity": request.velocity,
    }


@router.websocket("/ws/metering")
async def metering_websocket(websocket: WebSocket) -> None:
    """Stream SynthForge metering and voice usage at 20 Hz."""
    await websocket.accept()
    engine = get_audio_engine()

    try:
        while True:
            payload = await engine.get_synthforge_metering()
            await websocket.send_json(payload)
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        return
