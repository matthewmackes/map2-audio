"""
T2491-8 — Saved-connection / fast-connect persistence surface.

Persists established AVDECC ACMP connections so that on engine
startup la_avdecc's `register_saved_connection()` API can replay
them within ~2 seconds, well below the AVnu Milan §6.7 requirement
for fast-connect (sub-2-second re-establishment after power cycle).

Storage layer reuses the canonical `AvbBinding` table (T2490-2) with
`consumer_type="avdecc_stream"` and `source="acmp_persisted"`. The
`metadata_json` column carries `acmp_persisted_at` (ISO timestamp)
and `acmp_replay_pending` (true on next startup).

Endpoints:
- `POST /api/avb/connections/persist`  — operator marks a live
  ACMP connection as saved. Body: `{stream_id, talker_entity_id,
  talker_unique_id, listener_entity_id, listener_unique_id,
  stream_format?}`. The route writes (or upserts) an AvbBinding
  with `source="acmp_persisted"` and flips `acmp_replay_pending=True`.
- `GET /api/avb/connections/saved`     — return all
  `consumer_type="avdecc_stream"` bindings with
  `source="acmp_persisted"`. The C++ engine startup path
  (la_avdecc bridge) consumes this list and calls
  `register_saved_connection()` for each.

This route is intentionally read-mostly + idempotent. Cluster-pair
projections happen through the existing `binding_authority`; the
fast-connect surface is just a curated view.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class PersistConnectionRequest(BaseModel):
    stream_id: str = Field(..., description="AVTP stream id, hex-encoded")
    talker_entity_id: str
    talker_unique_id: int = Field(..., ge=0, le=0xFFFF)
    listener_entity_id: str
    listener_unique_id: int = Field(..., ge=0, le=0xFFFF)
    stream_format: Optional[str] = None
    label: Optional[str] = None
    operator: str = Field(default="unknown")


class PersistConnectionResponse(BaseModel):
    binding_id: str
    persisted_at: str
    replay_pending: bool


class SavedConnectionPayload(BaseModel):
    binding_id: str
    stream_id: Optional[str]
    stream_format: Optional[str]
    talker_entity_id: Optional[str]
    talker_unique_id: Optional[int]
    listener_entity_id: Optional[str]
    listener_unique_id: Optional[int]
    persisted_at: Optional[str]
    replay_pending: bool


class SavedConnectionsResponse(BaseModel):
    count: int
    connections: List[SavedConnectionPayload]


def _build_descriptors(
    payload: PersistConnectionRequest,
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    source = {
        "talker_entity_id": payload.talker_entity_id,
        "talker_unique_id": payload.talker_unique_id,
    }
    target = {
        "listener_entity_id": payload.listener_entity_id,
        "listener_unique_id": payload.listener_unique_id,
    }
    if payload.stream_format:
        source["stream_format"] = payload.stream_format
    return source, target


@router.post("/connections/persist", response_model=PersistConnectionResponse)
async def persist_connection(req: PersistConnectionRequest) -> PersistConnectionResponse:
    """T2491-8: write the live ACMP connection to AvbBinding so the
    next engine startup replays it via la_avdecc's
    `register_saved_connection()` for sub-2-second fast-connect."""
    try:
        from app.database import get_session
        from app.services.avb.binding_authority import AvbBindingAuthority
        from app.services.avb.binding_schemas import AvbBindingCreate
    except Exception as exc:  # pragma: no cover - import-time defensive
        logger.error("AVB binding authority unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="AVB binding authority unavailable")

    persisted_at = _utcnow_iso()
    source_descriptor, target_descriptor = _build_descriptors(req)
    consumer_id = (
        f"{req.talker_entity_id}:{req.talker_unique_id}:"
        f"{req.listener_entity_id}:{req.listener_unique_id}"
    )
    create_payload = AvbBindingCreate(
        consumer_type="avdecc_stream",
        consumer_id=consumer_id,
        consumer_label=req.label or f"ACMP {req.stream_id}",
        source_type="avdecc_talker",
        source_descriptor=source_descriptor,
        target_type="avdecc_listener",
        target_descriptor=target_descriptor,
        stream_id=req.stream_id,
        stream_format=req.stream_format,
        scope="global",
        enabled=True,
        created_by=req.operator,
        source="acmp_persisted",
        metadata={
            "acmp_persisted_at": persisted_at,
            "acmp_replay_pending": True,
        },
    )

    try:
        async with get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(create_payload)
            binding_id_str = str(created.binding_id)
    except Exception as exc:
        logger.error("Failed to persist ACMP connection: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Persist failed: {exc}")

    return PersistConnectionResponse(
        binding_id=binding_id_str,
        persisted_at=persisted_at,
        replay_pending=True,
    )


@router.get("/connections/saved", response_model=SavedConnectionsResponse)
async def list_saved_connections() -> SavedConnectionsResponse:
    """T2491-8: return every persisted ACMP connection. The engine
    startup loop consumes this list and replays each via
    la_avdecc's `register_saved_connection()` API."""
    try:
        from app.database import get_session
        from app.services.avb.binding_models import AvbBinding
        from sqlalchemy import select
    except Exception as exc:  # pragma: no cover
        logger.error("AVB binding model unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="AVB binding authority unavailable")

    payloads: List[SavedConnectionPayload] = []
    try:
        async with get_session(read_only=True) as session:
            stmt = select(AvbBinding).where(
                AvbBinding.consumer_type == "avdecc_stream",
                AvbBinding.source == "acmp_persisted",
            )
            result = await session.execute(stmt)
            for row in result.scalars().all():
                meta = dict(row.metadata_json or {})
                source_desc = dict(row.source_descriptor or {})
                target_desc = dict(row.target_descriptor or {})
                payloads.append(
                    SavedConnectionPayload(
                        binding_id=str(row.binding_id),
                        stream_id=row.stream_id,
                        stream_format=row.stream_format,
                        talker_entity_id=source_desc.get("talker_entity_id"),
                        talker_unique_id=source_desc.get("talker_unique_id"),
                        listener_entity_id=target_desc.get("listener_entity_id"),
                        listener_unique_id=target_desc.get("listener_unique_id"),
                        persisted_at=meta.get("acmp_persisted_at"),
                        replay_pending=bool(meta.get("acmp_replay_pending", False)),
                    )
                )
    except Exception as exc:
        logger.error("Failed to list saved connections: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"List failed: {exc}")

    return SavedConnectionsResponse(count=len(payloads), connections=payloads)
