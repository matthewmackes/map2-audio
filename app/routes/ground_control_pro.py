from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.ground_control_pro import get_ground_control_pro_service
from app.services.ground_control_pro.model import GroundControlTransportOptions

router = APIRouter(prefix="/api/ground-control-pro", tags=["ground-control-pro"])


class SessionModelRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    model: Dict[str, Any]


class SessionOnlyRequest(BaseModel):
    session_id: str = Field(..., min_length=1)


class ExportRequest(SessionOnlyRequest):
    model: Optional[Dict[str, Any]] = None


class TransportRequest(BaseModel):
    input_port_index: Optional[int] = Field(default=None, ge=0)
    output_port_index: Optional[int] = Field(default=None, ge=0)
    input_port_name: Optional[str] = None
    output_port_name: Optional[str] = None
    timeout_seconds: float = Field(default=30.0, gt=0.0, le=600.0)
    inter_message_delay_ms: float = Field(default=0.0, ge=0.0, le=10000.0)
    chunk_size: Optional[int] = Field(default=None, ge=1, le=65535)
    allow_unsafe_segmented_send: bool = False
    debug: bool = False
    dry_run_path: Optional[str] = None

    def to_options(self) -> GroundControlTransportOptions:
        allowed_fields = set(GroundControlTransportOptions.__dataclass_fields__.keys())
        payload = self.model_dump()
        return GroundControlTransportOptions(**{key: value for key, value in payload.items() if key in allowed_fields})


class BackupRequest(TransportRequest):
    create_session: bool = True


class PushRequest(TransportRequest):
    compiled_artifact_id: Optional[str] = None
    session_id: Optional[str] = None
    model: Optional[Dict[str, Any]] = None
    force: bool = False


class RedumpVerifyRequest(TransportRequest):
    compiled_artifact_id: str = Field(..., min_length=1)


class DiffRequest(BaseModel):
    left_artifact_id: Optional[str] = None
    right_artifact_id: Optional[str] = None
    left_fixture: Optional[str] = None
    right_fixture: Optional[str] = None


@router.get("/ports")
async def get_ports() -> Dict[str, Any]:
    return await get_ground_control_pro_service().get_ports()


@router.get("/field-map")
async def get_field_map() -> Dict[str, Any]:
    return await get_ground_control_pro_service().get_field_map()


@router.post("/import")
async def import_dump(file: UploadFile = File(...)) -> Dict[str, Any]:
    data = await file.read()
    try:
        return await get_ground_control_pro_service().import_syx_bytes(data, source_name=file.filename or "upload.syx")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/export/json")
async def export_json(request: ExportRequest) -> Dict[str, Any]:
    service = get_ground_control_pro_service()
    return await service.export_json(request.session_id, request.model)


@router.post("/export/yaml")
async def export_yaml(request: ExportRequest) -> Dict[str, Any]:
    service = get_ground_control_pro_service()
    return await service.export_yaml(request.session_id, request.model)


@router.post("/compile")
async def compile_session(request: SessionModelRequest) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().compile_session(request.session_id, request.model)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/backup")
async def backup(request: BackupRequest) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().backup(request.to_options(), create_session=request.create_session)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/push")
async def push(request: PushRequest) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().push(
            compiled_artifact_id=request.compiled_artifact_id,
            session_id=request.session_id,
            model_payload=request.model,
            options=request.to_options(),
            force=request.force,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/redump-verify")
async def redump_verify(request: RedumpVerifyRequest) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().redump_verify(request.compiled_artifact_id, request.to_options())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/diff")
async def diff(request: DiffRequest) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().diff(**request.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> Dict[str, Any]:
    try:
        return await get_ground_control_pro_service().get_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/artifacts/{artifact_id}", response_model=None)
async def get_artifact(artifact_id: str, download: bool = Query(default=False)) -> Any:
    service = get_ground_control_pro_service()
    try:
        payload = await service.get_artifact(artifact_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if download:
        return FileResponse(path=payload["path"], filename=Path(payload["path"]).name)
    return payload
