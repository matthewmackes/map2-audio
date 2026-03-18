"""
Drum Machine API routes.

This route set preserves the current drum page/card contract while moving the
implementation onto a typed, persistence-backed service.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services.drum_machine_service import (
    DrumMachineStateModel,
    DrumMachineStateUpdateModel,
    DrumMachineService,
    DrumMeteringModel,
    DrumTransportStateModel,
    DrumTransportUpdateModel,
    get_drum_machine_service,
)

router = APIRouter()


class DrumStateResponse(BaseModel):
    status: str = "ok"
    state: DrumMachineStateModel


class DrumPackUploadResponse(BaseModel):
    status: str
    path: str
    pack_id: str


def _get_service() -> DrumMachineService:
    return get_drum_machine_service()


@router.get("/api/engine/drums/state", response_model=DrumMachineStateModel)
def get_drum_machine_state() -> Dict[str, Any]:
    return _get_service().get_state()


@router.post("/api/engine/drums/state", response_model=DrumStateResponse)
def set_drum_machine_state(state: DrumMachineStateUpdateModel) -> DrumStateResponse:
    updated = _get_service().update_state(state.model_dump(exclude_unset=True))
    return DrumStateResponse(state=DrumMachineStateModel.model_validate(updated))


@router.get("/api/engine/drums/transport", response_model=DrumTransportStateModel)
def get_drum_transport() -> Dict[str, Any]:
    return _get_service().get_transport()


@router.post("/api/engine/drums/transport", response_model=DrumTransportStateModel)
def set_drum_transport(update: DrumTransportUpdateModel) -> Dict[str, Any]:
    return _get_service().update_transport(update.model_dump(exclude_unset=True))


@router.get("/api/engine/drums/metering", response_model=DrumMeteringModel)
def get_drum_metering() -> Dict[str, Any]:
    return _get_service().get_metering()


@router.get("/api/engine/drums/packs/factory")
def get_factory_packs() -> List[Dict[str, Any]]:
    return _get_service().list_factory_packs()


@router.get("/api/engine/drums/packs/generated")
def get_generated_packs() -> List[Dict[str, Any]]:
    return _get_service().list_generated_packs()


@router.get("/api/engine/drums/packs/factory/{pack_id}")
def get_factory_pack_details(pack_id: str) -> Dict[str, Any]:
    try:
        return _get_service().get_factory_pack_details(pack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pack not found")


@router.get("/api/engine/drums/packs/generated/{pack_id}")
def get_generated_pack_details(pack_id: str) -> Dict[str, Any]:
    try:
        return _get_service().get_generated_pack_details(pack_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Pack not found")


@router.post("/api/engine/drums/packs/upload", response_model=DrumPackUploadResponse)
async def upload_user_pack(file: UploadFile = File(...)) -> DrumPackUploadResponse:
    try:
        content = await file.read()
        pack = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc.msg}")

    if not isinstance(pack, dict):
        raise HTTPException(status_code=400, detail="Pack payload must be a JSON object")

    try:
        saved = _get_service().save_generated_pack(pack)
    except Exception as exc:  # pragma: no cover - defensive route boundary
        raise HTTPException(status_code=400, detail=str(exc))

    return DrumPackUploadResponse(**saved)
