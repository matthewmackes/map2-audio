"""Consolidated `/api/midi/*` routes for the MIDI Services canonical authority.

T2482-P3.1 prep (iter 18) — backend route scaffold. The `/midi`
canonical surface (Phase 3) consumes these endpoints exclusively.
Per the four-services discipline, every binding read/write goes
through MidiBindingAuthority via this single route file.

This file is **not yet wired** into app/main.py — that's iter 19's
deliverable, so the routes exist on disk for testing but aren't
exposed publicly until P3.1 ships proper. Tests use APIRouter
introspection to verify the route shape without needing a live mount.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.services.midi.authority import MidiBindingAuthority, MidiBindingNotFound
from app.services.midi.schemas import (
    BindingConsumerType,
    BindingScope,
    MidiBindingCreate,
    MidiBindingRead,
    MidiBindingUpdate,
)


router = APIRouter(prefix="/api/midi", tags=["MIDI Services"])


async def _authority_dep(
    session: AsyncSession = Depends(get_session),
) -> MidiBindingAuthority:
    """FastAPI dependency: yield a per-request MidiBindingAuthority."""
    return MidiBindingAuthority(session)


# ---------- Read ----------


@router.get("/bindings", response_model=list[MidiBindingRead])
async def list_bindings(
    consumer_type: Optional[BindingConsumerType] = Query(default=None),
    consumer_id: Optional[str] = Query(default=None),
    device_id: Optional[str] = Query(default=None),
    scope: Optional[BindingScope] = Query(default=None),
    scope_id: Optional[str] = Query(default=None),
    enabled_only: bool = Query(default=False),
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> list[MidiBindingRead]:
    """List bindings, with optional filters. Filter precedence:
    consumer (consumer_type+consumer_id) > device > scope > unfiltered.
    """
    if consumer_type is not None and consumer_id is not None:
        return await authority.list_for_consumer(
            consumer_type, consumer_id, enabled_only=enabled_only
        )
    if device_id is not None:
        return await authority.list_for_device(device_id, enabled_only=enabled_only)
    if scope is not None:
        return await authority.list_in_scope(scope, scope_id, enabled_only=enabled_only)
    raise HTTPException(
        status_code=400,
        detail="must filter by consumer_type+consumer_id, device_id, or scope",
    )


@router.get("/bindings/{binding_id}", response_model=MidiBindingRead)
async def get_binding(
    binding_id: str,
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> MidiBindingRead:
    try:
        return await authority.get(binding_id)
    except MidiBindingNotFound:
        raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.get("/bindings/count", response_model=int)
async def count_bindings(
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> int:
    return await authority.count()


# ---------- Write ----------


@router.post("/bindings", response_model=MidiBindingRead, status_code=201)
async def create_binding(
    payload: MidiBindingCreate,
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> MidiBindingRead:
    return await authority.create(payload)


@router.patch("/bindings/{binding_id}", response_model=MidiBindingRead)
async def update_binding(
    binding_id: str,
    patch: MidiBindingUpdate,
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> MidiBindingRead:
    try:
        return await authority.update(binding_id, patch)
    except MidiBindingNotFound:
        raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.delete("/bindings/{binding_id}", status_code=204)
async def delete_binding(
    binding_id: str,
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> None:
    deleted = await authority.delete(binding_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/disable", response_model=MidiBindingRead)
async def disable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> MidiBindingRead:
    try:
        return await authority.disable(binding_id, modified_by=modified_by)
    except MidiBindingNotFound:
        raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/enable", response_model=MidiBindingRead)
async def enable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
    authority: MidiBindingAuthority = Depends(_authority_dep),
) -> MidiBindingRead:
    try:
        return await authority.enable(binding_id, modified_by=modified_by)
    except MidiBindingNotFound:
        raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


__all__ = ["router"]
