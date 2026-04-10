from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.database import get_session
from app.services.mcu_surface import get_mcu_snapshot_editor_bridge_service, get_mcu_surface_service
from app.services.transport_service import get_transport_service

router = APIRouter(prefix="/api/mcu", tags=["mcu"])


class McuEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: dict[str, Any] = Field(default_factory=dict)
    destination_port: str | None = None

@router.get("/status")
async def get_mcu_status() -> dict[str, Any]:
    service = get_mcu_surface_service()
    await service.ensure_daemon_started()
    service_state = service.get_state_snapshot()
    matched_ports = service.list_matching_ports()
    identity = service_state.get("identity") if isinstance(service_state.get("identity"), dict) else None
    recent_events = service_state.get("recent_events") if isinstance(service_state.get("recent_events"), list) else []
    daemon_status = service_state.get("daemon_status") if isinstance(service_state.get("daemon_status"), dict) else None
    return {
        "status": "ok",
        "state": {
            "connected": bool(identity or matched_ports or (daemon_status or {}).get("available")),
            "matched_ports": matched_ports,
            "matched_port_count": len(matched_ports),
            "identity": identity,
            "recent_event_count": len(recent_events),
            "last_event": recent_events[-1] if recent_events else None,
            "daemon_status": daemon_status,
        },
    }


@router.get("/projection")
async def get_mcu_projection() -> dict[str, Any]:
    async with get_session(read_only=True) as session:
        projection = await get_mcu_snapshot_editor_bridge_service().build_projection(session)
    return {
        "status": "ok",
        "projection": projection,
        "transport": get_transport_service().get_state(),
    }


@router.post("/event")
async def dispatch_mcu_event(request: McuEventRequest) -> dict[str, Any]:
    async with get_session() as session:
        result = await get_mcu_snapshot_editor_bridge_service().handle_surface_event(
            session,
            request.event,
            destination_port=request.destination_port,
        )
    return {
        "status": "ok",
        "result": result,
    }
