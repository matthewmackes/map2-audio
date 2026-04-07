"""Routes for the Enriched_MIDI_Physical_Surfaces shared stack."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.services.enriched_midi_physical_surfaces import (
    get_enriched_midi_physical_surfaces_service,
)
from app.services.enriched_surface_session import get_enriched_surface_session_service

router = APIRouter(
    prefix="/api/enriched-midi-physical-surfaces",
    tags=["enriched-midi-physical-surfaces"],
)


class EnrichedPhysicalSurfaceViewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    view_id: str | None = None
    source: str | None = None


class EnrichedPhysicalSurfaceRecentTargetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_id: str
    label: str | None = None
    kind: str | None = None
    source: str | None = None


async def _get_unit_from_summary(unit_id: str) -> dict[str, Any]:
    service = get_enriched_midi_physical_surfaces_service()
    summary = await service.get_summary()
    unit = next((candidate for candidate in summary.get("units", []) if candidate.get("unit_id") == unit_id), None)
    if unit is None:
        raise HTTPException(status_code=404, detail=f"unknown surface unit: {unit_id}")
    return unit


@router.get("/summary")
async def get_enriched_midi_physical_surfaces_summary() -> dict[str, Any]:
    service = get_enriched_midi_physical_surfaces_service()
    return {
        "status": "ok",
        "summary": await service.get_summary(),
    }


@router.get("/units/{unit_id}")
async def get_enriched_midi_physical_surface_unit(unit_id: str) -> dict[str, Any]:
    return {
        "status": "ok",
        "unit": await _get_unit_from_summary(unit_id),
    }


@router.put("/units/{unit_id}/view")
async def update_enriched_midi_physical_surface_view(
    unit_id: str,
    request: EnrichedPhysicalSurfaceViewRequest,
) -> dict[str, Any]:
    unit = await _get_unit_from_summary(unit_id)
    available_views = [str(view.get("view_id") or "") for view in unit.get("view_state", {}).get("views", [])]
    view_id = str(request.view_id or "").strip() or None
    if view_id is not None and view_id not in available_views:
        raise HTTPException(status_code=400, detail=f"unknown view_id for {unit_id}: {view_id}")
    session = await get_enriched_surface_session_service().set_view_override(
        unit_id,
        view_id=view_id,
        source=str(request.source or "operator"),
    )
    updated_unit = await _get_unit_from_summary(unit_id)
    return {
        "status": "ok",
        "session": session,
        "unit": updated_unit,
    }


@router.put("/units/{unit_id}/recent-target")
async def update_enriched_midi_physical_surface_recent_target(
    unit_id: str,
    request: EnrichedPhysicalSurfaceRecentTargetRequest,
) -> dict[str, Any]:
    await _get_unit_from_summary(unit_id)
    session = await get_enriched_surface_session_service().set_recent_target(
        unit_id,
        target_id=request.target_id,
        label=request.label,
        kind=request.kind,
        source=str(request.source or "operator"),
    )
    updated_unit = await _get_unit_from_summary(unit_id)
    return {
        "status": "ok",
        "session": session,
        "unit": updated_unit,
    }
