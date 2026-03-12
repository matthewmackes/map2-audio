"""
Rocktron IntelFX bridge routes.

Prefix: /api/intelfx
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, HTTPException, Path as FPath, Query, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.intelfx_service import get_intelfx_service
from app.services.intelfx_scene_service import get_intelfx_scene_service

router = APIRouter(prefix="/api/intelfx", tags=["intelfx"])


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
    name_hint: str = Field(default="intelfx", min_length=1, max_length=128)


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
    service = get_intelfx_service()
    return await service.get_state()


@router.get("/registry")
async def get_registry() -> Dict[str, Any]:
    service = get_intelfx_service()
    return service.get_registry()


@router.post("/param/{param_id:path}")
async def set_param(
    param_id: str = FPath(..., description="IntelFX registry parameter id"),
    request: ParamUpdateRequest = ...,
) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.set_param(param_id, request.value)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/params")
async def set_params_bulk(request: BulkParamUpdateRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.set_params_bulk([item.model_dump() for item in request.updates])
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/program/{program}")
async def set_program(program: int = FPath(..., ge=0, le=255)) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.set_program(program)
    return {"status": "ok", **result}


@router.get("/programs")
async def list_programs() -> Dict[str, Any]:
    service = get_intelfx_service()
    programs = await service.get_programs()
    return {"programs": programs, "count": len(programs)}


@router.post("/dump/all")
async def dump_all() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.start_dump_all()


@router.get("/library")
async def get_library() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.get_library()


@router.post("/library/tag")
async def tag_library(request: LibraryTagRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.tag_library(request.program, request.tag, request.action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/library/import")
async def import_library(request: LibraryImportRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.replace_library_entries(request.entries)
    return {"status": "ok", **result}


@router.get("/midi/ports")
async def get_midi_ports() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.get_midi_ports()


@router.post("/midi/connect")
async def connect_midi(request: MidiConnectRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.connect_midi(
        input_port_index=request.input_port_index,
        output_port_index=request.output_port_index,
        name_hint=request.name_hint,
    )
    if not result.get("connected", False):
        raise HTTPException(status_code=503, detail=result.get("detail", "Failed to connect IntelFX MIDI ports"))
    return {"status": "ok", **result}


@router.post("/midi/disconnect")
async def disconnect_midi() -> Dict[str, Any]:
    service = get_intelfx_service()
    await service.disconnect_midi()
    return {"status": "ok", "connected": False}


@router.get("/midi-maps")
async def get_midi_maps() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.get_midi_maps()


@router.post("/midi-maps")
async def save_midi_map(request: MidiMapSaveRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.save_midi_map(
        midi_map=request.midi_map.model_dump(),
        make_active=request.make_active,
    )
    return {"status": "ok", **result}


@router.delete("/midi-maps/{map_id}")
async def delete_midi_map(map_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.delete_midi_map(map_id)
    return {"status": "ok", **result}


@router.post("/midi-maps/{map_id}/activate")
async def activate_midi_map(map_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.activate_midi_map(map_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.post("/midi-maps/learn-target")
async def set_midi_learn_target(request: MidiLearnTargetRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.set_midi_learn_target(request.target_param_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.get("/diagnostics")
async def get_diagnostics(limit: int = Query(default=100, ge=1, le=500)) -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.get_diagnostics(limit=limit)


@router.post("/diagnostics/ping")
async def ping_diagnostics() -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        result = await service.ping_latency()
    except KeyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "ok", **result}


@router.get("/health")
async def get_health() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.get_health()


# ---------------------------------------------------------------------------
# Multi-client writer lock
# ---------------------------------------------------------------------------

class WriteLockRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=128)


# ---------------------------------------------------------------------------
# .syx import / export / audition / versioning
# ---------------------------------------------------------------------------


@router.post("/library/import-syx")
async def import_syx_file(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(default=True),
) -> Dict[str, Any]:
    """Upload a binary .syx file and merge programs into the library."""
    service = get_intelfx_service()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload")
    result = await service.import_syx_bytes(
        data, source_name=file.filename or "<upload>", skip_duplicates=skip_duplicates
    )
    return {"status": "ok", **result}


@router.get("/library/export-bundle")
async def export_bundle(
    programs: Optional[str] = Query(default=None, description="Comma-separated program numbers"),
) -> Any:
    from fastapi.responses import Response

    service = get_intelfx_service()
    program_numbers: Optional[List[int]] = None
    if programs:
        try:
            program_numbers = [int(p.strip()) for p in programs.split(",") if p.strip()]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Invalid program numbers: {exc}")
    bundle_bytes = await service.export_bundle(program_numbers)
    return Response(
        content=bundle_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=intelfx_presets.zip"},
    )


class VersionNoteRequest(BaseModel):
    note: str = Field(default="", max_length=256)


@router.post("/library/{program}/version")
async def save_preset_version(
    program: int = FPath(..., ge=0, le=255), body: VersionNoteRequest = VersionNoteRequest()
) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        return await service.save_preset_version(program, note=body.note)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/library/{program}/versions")
async def list_preset_versions(program: int = FPath(..., ge=0, le=255)) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        return await service.list_preset_versions(program)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/library/{program}/revert/{version}")
async def revert_preset_version(
    program: int = FPath(..., ge=0, le=255),
    version: int = FPath(..., ge=1),
) -> Dict[str, Any]:
    service = get_intelfx_service()
    try:
        return await service.revert_preset_version(program, version)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/library/{program}/audition")
async def audition_program(program: int = FPath(..., ge=0, le=255)) -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.audition_program(program)


@router.post("/library/audition/revert")
async def audition_revert() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.audition_revert()


@router.post("/library/audition/confirm")
async def audition_confirm() -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.audition_confirm()


@router.post("/acquire-write-lock")
async def acquire_write_lock(body: WriteLockRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    result = await service.acquire_write_lock(body.client_id)
    if not result.get("acquired"):
        raise HTTPException(status_code=423, detail=result)
    return result


@router.post("/release-write-lock")
async def release_write_lock(body: WriteLockRequest) -> Dict[str, Any]:
    service = get_intelfx_service()
    return await service.release_write_lock(body.client_id)


# ---------------------------------------------------------------------------
# Scenes, Morphing, Setlists
# ---------------------------------------------------------------------------


class SceneCaptureRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    tags: List[str] = Field(default_factory=list)


class SceneUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    tags: Optional[List[str]] = None


class MorphRequest(BaseModel):
    scene_id_a: str = Field(..., min_length=1, max_length=128)
    scene_id_b: str = Field(..., min_length=1, max_length=128)
    duration_sec: float = Field(default=2.0, ge=0.05, le=60.0)
    curve: Literal["linear", "ease_in", "ease_out", "s_curve"] = "linear"
    beat_sync: bool = False
    bpm: float = Field(default=120.0, ge=20.0, le=300.0)


class SetlistRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


class SetlistUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    songs: Optional[List[Dict[str, Any]]] = None


def _wire_intelfx_scene_service() -> None:
    """Wire the scene service to the IntelFX service on first use."""
    svc = get_intelfx_service()
    ss = get_intelfx_scene_service()
    if ss._get_shadow is None:
        ss.wire(
            get_shadow=lambda: dict(getattr(svc, "_shadow_state", {})),
            get_program=lambda: getattr(svc, "_current_program", 0),
            apply_params=lambda p: svc.set_params_bulk([{"param_id": k, "value": v} for k, v in p.items()]),
            apply_program=svc.set_program,
            is_realtime_safe=lambda pid: bool(
                next(
                    (
                        p.get("realtime_safe", True)
                        for p in getattr(svc, "_registry_params", {}).values()
                        if p.get("id") == pid
                    ),
                    True,
                )
            ),
        )


@router.post("/scenes/capture")
async def capture_scene(body: SceneCaptureRequest) -> Dict[str, Any]:
    _wire_intelfx_scene_service()
    ss = get_intelfx_scene_service()
    return ss.capture_scene(body.name, body.tags)


@router.get("/scenes")
async def list_scenes() -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    scenes = ss.list_scenes()
    return {"scenes": scenes, "count": len(scenes)}


@router.put("/scenes/{scene_id}")
async def update_scene(
    scene_id: str = FPath(..., min_length=1, max_length=128),
    body: SceneUpdateRequest = ...,
) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    try:
        return ss.update_scene(scene_id, name=body.name, tags=body.tags)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/scenes/{scene_id}")
async def delete_scene(scene_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    try:
        return ss.delete_scene(scene_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/scenes/{scene_id}/recall")
async def recall_scene(scene_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    _wire_intelfx_scene_service()
    ss = get_intelfx_scene_service()
    try:
        result = await ss.recall_scene(scene_id)
        return {"status": "ok", **result}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/scenes/{scene_id_a}/diff/{scene_id_b}")
async def diff_scenes(
    scene_id_a: str = FPath(..., min_length=1, max_length=128),
    scene_id_b: str = FPath(..., min_length=1, max_length=128),
) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    try:
        diffs = ss.diff_scenes(scene_id_a, scene_id_b)
        return {"diffs": diffs, "count": len(diffs)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/scenes/morph")
async def start_morph(body: MorphRequest) -> Dict[str, Any]:
    _wire_intelfx_scene_service()
    ss = get_intelfx_scene_service()
    try:
        job_id = await ss.start_morph(
            body.scene_id_a,
            body.scene_id_b,
            duration_sec=body.duration_sec,
            curve=body.curve,
            beat_sync=body.beat_sync,
            bpm=body.bpm,
        )
        return {"status": "ok", "job_id": job_id}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/scenes/morph/{job_id}/cancel")
async def cancel_morph(job_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    return await ss.cancel_morph(job_id)


@router.post("/scenes/{scene_id}/momentary/press")
async def momentary_press(scene_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    _wire_intelfx_scene_service()
    ss = get_intelfx_scene_service()
    try:
        return await ss.momentary_press(scene_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/scenes/{scene_id}/momentary/release")
async def momentary_release(scene_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    _wire_intelfx_scene_service()
    ss = get_intelfx_scene_service()
    return await ss.momentary_release(scene_id)


# Setlists


@router.post("/setlists")
async def create_setlist(body: SetlistRequest) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    return ss.create_setlist(body.name)


@router.get("/setlists")
async def list_setlists() -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    setlists = ss.list_setlists()
    return {"setlists": setlists, "count": len(setlists)}


@router.put("/setlists/{setlist_id}")
async def update_setlist(
    setlist_id: str = FPath(..., min_length=1, max_length=128),
    body: SetlistUpdateRequest = ...,
) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    try:
        return ss.update_setlist(setlist_id, name=body.name, songs=body.songs)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/setlists/{setlist_id}")
async def delete_setlist(setlist_id: str = FPath(..., min_length=1, max_length=128)) -> Dict[str, Any]:
    ss = get_intelfx_scene_service()
    try:
        return ss.delete_setlist(setlist_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.websocket("/ws")
async def websocket_state(websocket: WebSocket) -> None:
    service = get_intelfx_service()
    await websocket.accept()
    client_id = f"intelfx-{uuid.uuid4()}"
    queue = await service.register_ws_client(client_id)

    try:
        await websocket.send_json({"type": "intelfx:state", "data": await service.get_state()})
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=10.0)
                await websocket.send_json(message)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "intelfx:heartbeat", "data": await service.get_health()})
    except WebSocketDisconnect:
        return
    finally:
        service.unregister_ws_client(client_id)
