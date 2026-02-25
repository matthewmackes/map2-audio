"""
Lexicon MPX1 bridge routes.

Prefix: /api/mpx1
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Path as FPath, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.mpx1_service import get_mpx1_service

router = APIRouter(prefix="/api/mpx1", tags=["mpx1"])


class ParamUpdateRequest(BaseModel):
    value: float


class BulkParamUpdateItem(BaseModel):
    param_id: str = Field(..., min_length=1, max_length=256)
    value: float


class BulkParamUpdateRequest(BaseModel):
    updates: List[BulkParamUpdateItem]


class LibraryTagRequest(BaseModel):
    program: int = Field(..., ge=0)
    tag: str = Field(..., min_length=1, max_length=64)
    action: Literal["add", "remove"] = "add"


class LibraryImportRequest(BaseModel):
    entries: List[Dict[str, Any]] = Field(default_factory=list)


class MidiConnectRequest(BaseModel):
    input_port_index: Optional[int] = Field(default=None, ge=0)
    output_port_index: Optional[int] = Field(default=None, ge=0)
    name_hint: str = Field(default="mpx", min_length=1, max_length=128)


class MidiMappingRequest(BaseModel):
    id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    name: Optional[str] = Field(default=None, max_length=128)
    cc: int = Field(..., ge=0, le=127)
    channel: int = Field(default=1, ge=0, le=16)
    target_param_id: str = Field(..., min_length=1, max_length=256)
    source_min: int = Field(default=0, ge=0, le=127)
    source_max: int = Field(default=127, ge=0, le=127)
    target_min: float = 0.0
    target_max: float = 127.0
    curve: Literal["linear", "log", "exp", "s_curve", "reverse"] = "linear"
    smoothing_ms: float = Field(default=40.0, ge=0.0, le=5000.0)
    polarity: Literal["normal", "inverted"] = "normal"
    mode: Literal["continuous", "momentary", "toggle"] = "continuous"
    enabled: bool = True
    macro_group: Optional[str] = Field(default=None, max_length=128)


class MidiMapRequest(BaseModel):
    id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    active: bool = False
    mappings: List[MidiMappingRequest] = Field(default_factory=list)


class MidiMapSaveRequest(BaseModel):
    midi_map: MidiMapRequest
    make_active: bool = False


class MidiLearnTargetRequest(BaseModel):
    target_param_id: Optional[str] = Field(default=None, min_length=1, max_length=256)


@router.get("/state")
async def get_state() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_state()


@router.get("/registry")
async def get_registry() -> Dict[str, Any]:
    service = get_mpx1_service()
    return service.get_registry()


@router.post("/param/{param_id:path}")
async def set_param(
    param_id: str = FPath(..., description="MPX1 registry parameter id"),
    request: ParamUpdateRequest = ...,
) -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.set_param(param_id, request.value)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/params")
async def set_params_bulk(request: BulkParamUpdateRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.set_params_bulk([item.model_dump() for item in request.updates])
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/program/{program}")
async def set_program(program: int = FPath(..., ge=0)) -> Dict[str, Any]:
    service = get_mpx1_service()
    result = await service.set_program(program)
    return {"status": "ok", **result}


@router.get("/programs")
async def list_programs() -> Dict[str, Any]:
    service = get_mpx1_service()
    programs = await service.get_programs()
    return {"programs": programs, "count": len(programs)}


@router.post("/dump/all")
async def dump_all() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.start_dump_all()


@router.get("/library")
async def get_library() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_library()


@router.post("/library/tag")
async def tag_library(request: LibraryTagRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.tag_library(request.program, request.tag, request.action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/library/import")
async def import_library(request: LibraryImportRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    result = await service.replace_library_entries(request.entries)
    return {"status": "ok", **result}


@router.get("/midi/ports")
async def get_midi_ports() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_midi_ports()


@router.post("/midi/connect")
async def connect_midi(request: MidiConnectRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    result = await service.connect_midi(
        input_port_index=request.input_port_index,
        output_port_index=request.output_port_index,
        name_hint=request.name_hint,
    )
    if not result.get("connected", False):
        raise HTTPException(status_code=503, detail=result.get("detail", "Failed to connect MPX1 MIDI ports"))
    return {"status": "ok", **result}


@router.post("/midi/disconnect")
async def disconnect_midi() -> Dict[str, Any]:
    service = get_mpx1_service()
    await service.disconnect_midi()
    return {"status": "ok", "connected": False}


@router.get("/midi-maps")
async def get_midi_maps() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_midi_maps()


@router.post("/midi-maps")
async def save_midi_map(request: MidiMapSaveRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    result = await service.save_midi_map(
        midi_map=request.midi_map.model_dump(),
        make_active=request.make_active,
    )
    return {"status": "ok", **result}


@router.delete("/midi-maps/{map_id}")
async def delete_midi_map(map_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    service = get_mpx1_service()
    result = await service.delete_midi_map(map_id)
    return {"status": "ok", **result}


@router.post("/midi-maps/{map_id}/activate")
async def activate_midi_map(map_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.activate_midi_map(map_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/midi-maps/learn-target")
async def set_midi_learn_target(request: MidiLearnTargetRequest) -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.set_midi_learn_target(request.target_param_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.get("/diagnostics")
async def get_diagnostics(limit: int = Query(default=100, ge=1, le=500)) -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_diagnostics(limit=limit)


@router.post("/diagnostics/ping")
async def ping_diagnostics() -> Dict[str, Any]:
    service = get_mpx1_service()
    try:
        result = await service.ping_latency()
    except KeyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.get("/health")
async def get_health() -> Dict[str, Any]:
    service = get_mpx1_service()
    return await service.get_health()


@router.websocket("/ws")
async def websocket_state(websocket: WebSocket) -> None:
    service = get_mpx1_service()
    await websocket.accept()
    client_id = f"mpx1-{uuid.uuid4()}"
    queue = await service.register_ws_client(client_id)

    try:
        await websocket.send_json({"type": "mpx1:state", "data": await service.get_state()})
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=10.0)
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "mpx1:heartbeat", "data": await service.get_health()})
    except WebSocketDisconnect:
        return
    finally:
        service.unregister_ws_client(client_id)
