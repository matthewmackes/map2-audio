"""
Effects Loops Routes

REST contracts for external Tesira AVB effects loops.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.database import get_session
from app.services.effects_loops import EffectsLoopService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["effects-loops"])


class EffectsLoopCreateRequest(BaseModel):
    loop_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    channels: int = Field(2, ge=1, le=8)
    topology: str = "serial_insert"
    tesira_device_id: Optional[str] = None
    template_id: Optional[str] = None
    send_endpoint_id: Optional[str] = None
    return_endpoint_id: Optional[str] = None


class EffectsLoopUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    channels: Optional[int] = Field(default=None, ge=1, le=8)
    topology: Optional[str] = None
    tesira_device_id: Optional[str] = None
    template_id: Optional[str] = None
    send_endpoint_id: Optional[str] = None
    return_endpoint_id: Optional[str] = None
    state_desired: Optional[str] = None
    state_actual: Optional[str] = None
    health_status: Optional[str] = None
    health_reason: Optional[str] = None
    measured_added_latency_ms: Optional[float] = None
    compensation_samples: Optional[int] = None
    calibration_status: Optional[str] = None


class LoopActivationRequest(BaseModel):
    audition_mode: bool = False


class LoopBypassRequest(BaseModel):
    bypass: bool = True


class LoopCalibrationRequest(BaseModel):
    options: Dict[str, Any] = Field(default_factory=dict)


class TesiraLoopTemplatePutRequest(BaseModel):
    tesira_device_id: str = Field(..., min_length=1)
    stream_in_tags: List[str] = Field(default_factory=list)
    stream_out_tags: List[str] = Field(default_factory=list)
    crosspoint_tags: List[str] = Field(default_factory=list)
    input_router_tag: Optional[str] = None
    output_router_tag: Optional[str] = None
    meter_tags: List[str] = Field(default_factory=list)
    bypass_tags: List[str] = Field(default_factory=list)
    channel_map_policy: str = "direct"


class ChainLoopInsertionCreateRequest(BaseModel):
    insertion_id: Optional[str] = None
    loop_id: str = Field(..., min_length=1)
    slot_index: int = Field(..., ge=0)
    enabled: bool = True
    mode: str = "serial_insert"
    blend_pct: float = 100.0
    send_gain_db: float = 0.0
    return_gain_db: float = 0.0
    crossfade_ms: int = 12
    band_split_hz: List[float] = Field(default_factory=list)


class ChainLoopInsertionUpdateRequest(BaseModel):
    loop_id: Optional[str] = None
    slot_index: Optional[int] = Field(default=None, ge=0)
    enabled: Optional[bool] = None
    mode: Optional[str] = None
    blend_pct: Optional[float] = None
    send_gain_db: Optional[float] = None
    return_gain_db: Optional[float] = None
    crossfade_ms: Optional[int] = None
    band_split_hz: Optional[List[float]] = None


@router.get("/effects-loops")
async def list_effects_loops() -> Dict[str, Any]:
    async with get_session() as session:
        service = EffectsLoopService(session)
        loops = await service.list_loops()
    return {"loops": loops, "count": len(loops)}


@router.post("/effects-loops")
async def create_effects_loop(request: EffectsLoopCreateRequest) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.create_loop(request.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/effects-loops/{loop_id}")
async def get_effects_loop(loop_id: str) -> Dict[str, Any]:
    async with get_session() as session:
        service = EffectsLoopService(session)
        loop = await service.get_loop(loop_id)
    if loop is None:
        raise HTTPException(status_code=404, detail=f"Loop '{loop_id}' not found")
    return loop


@router.patch("/effects-loops/{loop_id}")
async def patch_effects_loop(loop_id: str, request: EffectsLoopUpdateRequest) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            updated = await service.update_loop(loop_id, request.model_dump(exclude_none=True))
        if updated is None:
            raise HTTPException(status_code=404, detail=f"Loop '{loop_id}' not found")
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/effects-loops/{loop_id}")
async def delete_effects_loop(loop_id: str) -> Dict[str, Any]:
    async with get_session() as session:
        service = EffectsLoopService(session)
        deleted = await service.delete_loop(loop_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Loop '{loop_id}' not found")
    return {"status": "deleted", "loop_id": loop_id}


@router.post("/effects-loops/{loop_id}/activate")
async def activate_effects_loop(loop_id: str, request: LoopActivationRequest) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            result = await service.activate_loop(loop_id, request.model_dump())
        if not result.get("success", False):
            return result
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/effects-loops/{loop_id}/bypass")
async def bypass_effects_loop(loop_id: str, request: LoopBypassRequest) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.set_loop_bypass(loop_id, request.bypass)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/effects-loops/{loop_id}/calibrate")
async def calibrate_effects_loop(loop_id: str, request: LoopCalibrationRequest) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.calibrate_loop(loop_id, request.options)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/effects-loops/{loop_id}/metrics")
async def get_effects_loop_metrics(loop_id: str) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.get_metrics(loop_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tesira/loop-templates")
async def list_tesira_loop_templates() -> Dict[str, Any]:
    async with get_session() as session:
        service = EffectsLoopService(session)
        templates = await service.list_templates()
    return {"templates": templates, "count": len(templates)}


@router.put("/tesira/loop-templates/{template_id}")
async def upsert_tesira_loop_template(
    template_id: str,
    request: TesiraLoopTemplatePutRequest,
) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.upsert_template(template_id, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tesira/loop-templates/{template_id}/validate")
async def validate_tesira_loop_template(template_id: str) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.validate_template(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tesira/loop-templates/{template_id}/runtime-status")
async def get_tesira_loop_template_runtime_status(template_id: str) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.get_template_runtime_status(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/chains/{chain_id}/loops/insert")
async def insert_chain_loop(
    chain_id: int,
    request: ChainLoopInsertionCreateRequest,
) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.insert_chain_loop(chain_id, request.model_dump(exclude_none=True))
    except ValueError as exc:
        message = str(exc)
        status = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status, detail=message) from exc


@router.patch("/chains/{chain_id}/loops/{insertion_id}")
async def patch_chain_loop_insertion(
    chain_id: int,
    insertion_id: str,
    request: ChainLoopInsertionUpdateRequest,
) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            updated = await service.update_chain_insertion(
                chain_id,
                insertion_id,
                request.model_dump(exclude_none=True),
            )
        if updated is None:
            raise HTTPException(
                status_code=404,
                detail=f"Insertion '{insertion_id}' not found in chain {chain_id}",
            )
        return {"chain_id": chain_id, "insertion": updated}
    except ValueError as exc:
        message = str(exc)
        status = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status, detail=message) from exc


@router.delete("/chains/{chain_id}/loops/{insertion_id}")
async def delete_chain_loop_insertion(chain_id: int, insertion_id: str) -> Dict[str, Any]:
    async with get_session() as session:
        service = EffectsLoopService(session)
        deleted = await service.delete_chain_insertion(chain_id, insertion_id)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Insertion '{insertion_id}' not found in chain {chain_id}",
        )
    return {"status": "deleted", "chain_id": chain_id, "insertion_id": insertion_id}


@router.get("/chains/{chain_id}/loops")
async def list_chain_loops(chain_id: int) -> Dict[str, Any]:
    try:
        async with get_session() as session:
            service = EffectsLoopService(session)
            return await service.list_chain_insertions(chain_id)
    except ValueError as exc:
        message = str(exc)
        status = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status, detail=message) from exc
