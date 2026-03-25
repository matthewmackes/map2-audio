from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.plugin_appearance_service import (
    MAX_CUSTOM_SVG_BYTES,
    PluginAppearanceService,
    get_plugin_appearance_service,
)


router = APIRouter(prefix="/api/plugin-appearances", tags=["plugin-appearances"])


class PluginAppearanceOverride(BaseModel):
    uri: str
    accent_color: Optional[str] = None
    dark_variant: Optional[str] = None
    light_variant: Optional[str] = None
    icon_identifier: Optional[str] = None
    custom_svg: Optional[str] = None
    description: Optional[str] = None


class PluginAppearanceListResponse(BaseModel):
    items: List[PluginAppearanceOverride]
    count: int


class PluginAppearanceUpdateRequest(BaseModel):
    accent_color: Optional[str] = Field(default=None)
    dark_variant: Optional[str] = Field(default=None)
    light_variant: Optional[str] = Field(default=None)
    icon_identifier: Optional[str] = Field(default=None)
    custom_svg: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)


def _service() -> PluginAppearanceService:
    return get_plugin_appearance_service()


def _response_model(uri: str, payload: Dict[str, Any] | None) -> PluginAppearanceOverride:
    return PluginAppearanceOverride.model_validate({"uri": uri, **(payload or {})})


@router.get("", response_model=PluginAppearanceListResponse)
async def list_plugin_appearance_overrides() -> PluginAppearanceListResponse:
    items = [
        PluginAppearanceOverride.model_validate(payload)
        for _, payload in sorted(_service().list_overrides().items(), key=lambda item: item[0].lower())
    ]
    return PluginAppearanceListResponse(items=items, count=len(items))


@router.get("/{uri:path}", response_model=PluginAppearanceOverride)
async def get_plugin_appearance_override(uri: str) -> PluginAppearanceOverride:
    return _response_model(uri, _service().get_override(uri))


@router.put("/{uri:path}", response_model=PluginAppearanceOverride)
async def put_plugin_appearance_override(uri: str, request: PluginAppearanceUpdateRequest) -> PluginAppearanceOverride:
    try:
        payload = _service().put_override(uri, request.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _response_model(uri, payload)


@router.delete("/{uri:path}")
async def delete_plugin_appearance_override(uri: str) -> Dict[str, Any]:
    removed = _service().delete_override(uri)
    return {"status": "deleted" if removed else "not_found", "uri": uri, "removed": removed}


@router.post("/{uri:path}/icon-upload", response_model=PluginAppearanceOverride)
async def upload_plugin_appearance_icon(uri: str, file: UploadFile = File(...)) -> PluginAppearanceOverride:
    if not file.filename.lower().endswith(".svg"):
        raise HTTPException(status_code=400, detail="Custom icon uploads must use an .svg file.")

    content = await file.read()
    if len(content) > MAX_CUSTOM_SVG_BYTES:
        raise HTTPException(status_code=400, detail=f"Custom SVG payload exceeds {MAX_CUSTOM_SVG_BYTES} bytes.")

    try:
        svg_text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="Custom SVG uploads must be valid UTF-8 text.") from exc

    try:
        payload = _service().put_custom_icon(uri, svg_text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _response_model(uri, payload)
