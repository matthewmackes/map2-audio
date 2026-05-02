"""Consolidated `/api/avb/bindings/*` routes for the AVB Services authority.

T2490-2. Mirrors `app/services/midi/routes.py` shape-for-shape so the
operator-tooling consumers can treat both surfaces interchangeably.

The router is mounted in `app/main.py` near the MIDI Services mount.
T2490-3..T2490-9 progressively build matrix / cluster endpoints on top
of this baseline.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.database import get_session
from app.services.avb.binding_authority import AvbBindingAuthority, AvbBindingNotFound
from app.services.avb.binding_schemas import (
    AvbBindingConsumerType,
    AvbBindingCreate,
    AvbBindingRead,
    AvbBindingScope,
    AvbBindingUpdate,
)


router = APIRouter(prefix="/api/avb", tags=["AVB Services"])


# IMPORTANT: route ordering matters in FastAPI. /bindings/count MUST
# come before /bindings/{binding_id} so a literal "count" doesn't
# accidentally match the parameterized binding_id slot.


@router.get("/bindings/count", response_model=int)
async def count_bindings() -> int:
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        return await authority.count()


@router.get("/bindings", response_model=list[AvbBindingRead])
async def list_bindings(
    consumer_type: Optional[AvbBindingConsumerType] = Query(default=None),
    consumer_id: Optional[str] = Query(default=None),
    stream_id: Optional[str] = Query(default=None),
    talker_node_id: Optional[str] = Query(default=None),
    listener_node_id: Optional[str] = Query(default=None),
    scope: Optional[AvbBindingScope] = Query(default=None),
    scope_id: Optional[str] = Query(default=None),
    enabled_only: bool = Query(default=False),
) -> list[AvbBindingRead]:
    """List bindings, with optional filters. Filter precedence:
    consumer (consumer_type+consumer_id) > stream_id > cluster pair > scope.

    At least one filter is required (unfiltered queries are rejected so
    a misconfigured frontend can't accidentally fan out the whole table).
    """
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        if consumer_type is not None and consumer_id is not None:
            return await authority.list_for_consumer(
                consumer_type, consumer_id, enabled_only=enabled_only
            )
        if stream_id is not None:
            return await authority.list_for_stream(stream_id, enabled_only=enabled_only)
        if talker_node_id is not None or listener_node_id is not None:
            return await authority.list_for_cluster_pair(
                talker_node_id, listener_node_id, enabled_only=enabled_only
            )
        if scope is not None:
            return await authority.list_in_scope(scope, scope_id, enabled_only=enabled_only)
        raise HTTPException(
            status_code=400,
            detail=(
                "must filter by consumer_type+consumer_id, stream_id, "
                "talker_node_id, listener_node_id, or scope"
            ),
        )


@router.get("/bindings/{binding_id}", response_model=AvbBindingRead)
async def get_binding(binding_id: str) -> AvbBindingRead:
    async with get_session(read_only=True) as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.get(binding_id)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


# ---------- Write ----------


@router.post("/bindings", response_model=AvbBindingRead, status_code=201)
async def create_binding(payload: AvbBindingCreate) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        return await authority.create(payload)


@router.patch("/bindings/{binding_id}", response_model=AvbBindingRead)
async def update_binding(binding_id: str, patch: AvbBindingUpdate) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.update(binding_id, patch)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.delete("/bindings/{binding_id}", status_code=204)
async def delete_binding(binding_id: str) -> None:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        deleted = await authority.delete(binding_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/disable", response_model=AvbBindingRead)
async def disable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.disable(binding_id, modified_by=modified_by)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


@router.post("/bindings/{binding_id}/enable", response_model=AvbBindingRead)
async def enable_binding(
    binding_id: str,
    modified_by: str = Query(default="api"),
) -> AvbBindingRead:
    async with get_session() as session:
        authority = AvbBindingAuthority(session)
        try:
            return await authority.enable(binding_id, modified_by=modified_by)
        except AvbBindingNotFound:
            raise HTTPException(status_code=404, detail=f"binding not found: {binding_id}")


__all__ = ["router"]
