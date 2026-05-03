"""
T2491-5 — Milan v1.2 §5 MVU REST surface.

Operator-facing endpoints for the four MVU commands:
  - GET  /api/avb/milan/{entity_id}/info
  - GET  /api/avb/milan/{entity_id}/system_unique_id
  - POST /api/avb/milan/{entity_id}/system_unique_id
  - GET  /api/avb/milan/{entity_id}/media_clock_reference_info

Honest-state envelope: every endpoint returns
`{available, source, data?, error?}`. When la_avdecc + the engine
+ a real AVDECC peer are wired, `available=True` and `data` carries
the projected MVU response. When the engine controller is not
running (typical development), `available=False` with a clear
reason — no fake data ever surfaces.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class _Envelope(BaseModel):
    available: bool
    source: str = Field(default="la_avdecc")
    data: Dict[str, Any] | None = None
    error: str | None = None


class SetSystemUniqueIdRequest(BaseModel):
    value: int = Field(..., ge=0, le=0xFFFFFFFFFFFFFFFF)


@router.get("/milan/{entity_id}/info", response_model=_Envelope)
async def get_milan_info(entity_id: str) -> _Envelope:
    from app.services.avb.milan_capabilities import get_milan_capabilities

    provider = get_milan_capabilities()
    info = provider.get_milan_info(entity_id)
    if info is None:
        return _Envelope(
            available=False,
            error=(
                "Milan MVU GET_MILAN_INFO unavailable — engine + la_avdecc "
                "controller not reachable for this entity"
            ),
        )
    return _Envelope(available=True, data=info.to_dict())


@router.get("/milan/{entity_id}/system_unique_id", response_model=_Envelope)
async def get_system_unique_id(entity_id: str) -> _Envelope:
    from app.services.avb.milan_capabilities import get_milan_capabilities

    provider = get_milan_capabilities()
    sysid = provider.get_system_unique_id(entity_id)
    if sysid is None:
        return _Envelope(
            available=False,
            error="Milan MVU GET_SYSTEM_UNIQUE_ID unavailable",
        )
    return _Envelope(available=True, data=sysid.to_dict())


@router.post("/milan/{entity_id}/system_unique_id", response_model=_Envelope)
async def set_system_unique_id(
    entity_id: str, req: SetSystemUniqueIdRequest
) -> _Envelope:
    from app.services.avb.milan_capabilities import get_milan_capabilities

    provider = get_milan_capabilities()
    ok = provider.set_system_unique_id(entity_id, req.value)
    if not ok:
        return _Envelope(
            available=False,
            error=(
                "Milan MVU SET_SYSTEM_UNIQUE_ID failed — controller "
                "rejected or engine not reachable"
            ),
        )
    return _Envelope(available=True, data={"value": f"0x{req.value:016x}"})


@router.get(
    "/milan/{entity_id}/media_clock_reference_info",
    response_model=_Envelope,
)
async def get_media_clock_reference_info(entity_id: str) -> _Envelope:
    from app.services.avb.milan_capabilities import get_milan_capabilities

    provider = get_milan_capabilities()
    records = provider.get_media_clock_reference_info(entity_id)
    if records is None:
        return _Envelope(
            available=False,
            error="Milan MVU GET_MEDIA_CLOCK_REFERENCE_INFO unavailable",
        )
    return _Envelope(
        available=True,
        data={"records": [r.to_dict() for r in records]},
    )
