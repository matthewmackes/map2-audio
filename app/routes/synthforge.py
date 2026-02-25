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


@router.get("/sfz/status/{part_index}")
async def get_part_sfz_status(part_index: int) -> Dict[str, object]:
    """Get SFZ sampler status for a SynthForge part."""
    _validate_part_index(part_index)
    engine = get_audio_engine()
    return await engine.get_synthforge_part_sample_status(part_index)


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
