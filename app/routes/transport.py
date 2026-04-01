"""Transport-owner routes for Maschine and future sequencers."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.services.transport_service import get_transport_service

router = APIRouter(prefix="/api/transport", tags=["transport"])


class TransportOwnerTransferRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner: str


@router.get("/state")
async def get_transport_state() -> dict:
    return {"status": "ok", **get_transport_service().get_state()}


@router.post("/owner")
async def transfer_transport_owner(request: TransportOwnerTransferRequest) -> dict:
    service = get_transport_service()
    try:
        state = service.transfer_ownership(request.owner)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", **state}


@router.post("/{action}")
async def dispatch_transport_action(action: str) -> dict:
    service = get_transport_service()
    try:
        payload = await service.dispatch(action)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", **payload}
