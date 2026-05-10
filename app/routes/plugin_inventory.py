"""T2503 Set 9 — plugin inventory FastAPI surface.

Surfaces the unified plugin inventory at ``/api/v1/plugin-inventory``.
Consumed by both the live engine UI (plugin-card pickers) and the DAW
reference UI (plugin-rack browser).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.plugin_inventory_service import (
    PluginDescriptor as ServiceDescriptor,
    PluginFormat,
    get_plugin_inventory_service,
)

router = APIRouter(prefix="/api/v1/plugin-inventory", tags=["plugin-inventory"])


class PluginDescriptorResponse(BaseModel):
    uri: str
    name: str
    vendor: str
    category: str
    format: PluginFormat
    audio_inputs: int = Field(ge=0)
    audio_outputs: int = Field(ge=0)
    is_instrument: bool = False

    @classmethod
    def from_service(cls, p: ServiceDescriptor) -> "PluginDescriptorResponse":
        return cls(
            uri=p.uri,
            name=p.name,
            vendor=p.vendor,
            category=p.category,
            format=p.format,
            audio_inputs=p.audio_inputs,
            audio_outputs=p.audio_outputs,
            is_instrument=p.is_instrument,
        )


class PluginInventoryResponse(BaseModel):
    plugins: List[PluginDescriptorResponse]
    last_scan_at: Optional[float] = None
    size: int


@router.get(
    "/",
    response_model=PluginInventoryResponse,
    operation_id="plugin_inventory_list",
)
async def list_plugins() -> PluginInventoryResponse:
    svc = get_plugin_inventory_service()
    inv = svc.inventory()
    return PluginInventoryResponse(
        plugins=[PluginDescriptorResponse.from_service(p) for p in inv],
        last_scan_at=svc.last_scan_at(),
        size=len(inv),
    )


@router.get(
    "/{uri:path}",
    response_model=PluginDescriptorResponse,
    operation_id="plugin_inventory_get",
)
async def get_plugin(uri: str) -> PluginDescriptorResponse:
    svc = get_plugin_inventory_service()
    p = svc.find(uri)
    if p is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "plugin_not_found",
                    "message": f"plugin URI {uri!r} not in inventory",
                    "details": None,
                }
            },
        )
    return PluginDescriptorResponse.from_service(p)
