"""FastAPI routes for the controller / mapping / device-pack subsystem.

T2459-A3 lands the read-side surface (list packs, list profiles, get
profile, resolve by hardware-id / ALSA card / ALSA client) plus the
mapping assignment endpoints. Carbon ``<DeviceProfilePanel/>`` (T2459-
C1) is the primary consumer.

Routes:

- ``GET    /api/devices/packs``                            list packs
- ``GET    /api/devices/profiles?kind=audio|midi|hid``    list profiles
- ``GET    /api/devices/profiles/{pack_id}/{model}/{kind}`` profile detail
- ``POST   /api/devices/profiles/reload/{pack_id}``        reload one pack
- ``GET    /api/devices/resolve``                          resolve by id
- ``GET    /api/devices/mappings``                         active mappings
- ``POST   /api/devices/mappings/assign``                  assign mapping
- ``POST   /api/devices/mappings/clear``                   clear mapping

Worklist: ``T2459-A3``.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.controllers import get_controller_service
from app.services.controllers.mapping_file_handler import MappingLoadError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/devices", tags=["Devices"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AssignMappingRequest(BaseModel):
    controller_key: str = Field(
        ..., description="Canonical controller identifier (hardware_id or "
                         "alsa-seq:<client>:<port>).",
    )
    pack_id: str
    model: str
    kind: str = Field(..., pattern="^(midi|hid)$")


class ClearMappingRequest(BaseModel):
    controller_key: str


# ---------------------------------------------------------------------------
# Read endpoints
# ---------------------------------------------------------------------------

@router.get("/packs")
async def list_packs() -> dict[str, Any]:
    svc = get_controller_service()
    packs = svc.list_packs()
    return {"packs": packs, "count": len(packs)}


@router.get("/profiles")
async def list_profiles(
    kind: str | None = Query(default=None, pattern="^(audio|midi|hid)$"),
) -> dict[str, Any]:
    svc = get_controller_service()
    profiles = svc.list_profiles(kind=kind)
    return {"profiles": profiles, "count": len(profiles)}


@router.get("/profiles/{pack_id}/{model}/{kind}")
async def get_profile(pack_id: str, model: str, kind: str) -> dict[str, Any]:
    if kind not in {"audio", "midi", "hid"}:
        raise HTTPException(status_code=400, detail={
            "error": {"code": "invalid_kind",
                      "message": "kind must be audio, midi, or hid",
                      "details": None}
        })
    svc = get_controller_service()
    profile = svc.get_profile(pack_id, model, kind)
    if profile is None:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Profile {pack_id}/{model}.{kind} not found",
                      "details": None}
        })
    return {"profile": profile}


@router.post("/profiles/reload/{pack_id}")
async def reload_pack(pack_id: str) -> dict[str, Any]:
    svc = get_controller_service()
    ok = svc.reload_pack(pack_id)
    if not ok:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "not_found",
                      "message": f"Pack {pack_id} not found",
                      "details": None}
        })
    return {"reloaded": pack_id}


@router.get("/resolve")
async def resolve(
    hardware_id: str | None = Query(default=None),
    alsa_card: str | None = Query(default=None),
    alsa_client: str | None = Query(default=None),
) -> dict[str, Any]:
    svc = get_controller_service()
    matches: list[dict[str, Any]] = []
    if hardware_id:
        matches += svc.resolve_for_hardware_id(hardware_id)
    if alsa_card:
        matches += svc.resolve_for_alsa_card(alsa_card)
    if alsa_client:
        matches += svc.resolve_for_alsa_client(alsa_client)
    if not (hardware_id or alsa_card or alsa_client):
        raise HTTPException(status_code=400, detail={
            "error": {
                "code": "missing_query",
                "message": "Provide at least one of hardware_id, alsa_card, alsa_client.",
                "details": None,
            }
        })
    return {"matches": matches, "count": len(matches)}


# ---------------------------------------------------------------------------
# Mapping assignment
# ---------------------------------------------------------------------------

@router.get("/mappings")
async def list_active_mappings() -> dict[str, Any]:
    svc = get_controller_service()
    mappings = svc.active_mappings()
    return {"active_mappings": mappings, "count": len(mappings)}


@router.post("/mappings/assign")
async def assign_mapping(req: AssignMappingRequest) -> dict[str, Any]:
    svc = get_controller_service()
    try:
        descriptor = svc.load_mapping(req.pack_id, req.model, req.kind)
    except MappingLoadError as exc:
        raise HTTPException(status_code=404, detail={
            "error": {"code": "mapping_load_failed",
                      "message": str(exc),
                      "details": None}
        }) from exc
    svc.assign_mapping(req.controller_key, descriptor)
    return {
        "assigned": True,
        "controller_key": req.controller_key,
        "pack_id": descriptor.pack_id,
        "model": descriptor.model,
        "kind": descriptor.kind,
        "control_count": len(descriptor.controls),
    }


@router.post("/mappings/clear")
async def clear_mapping(req: ClearMappingRequest) -> dict[str, Any]:
    svc = get_controller_service()
    svc.clear_mapping(req.controller_key)
    return {"cleared": req.controller_key}
