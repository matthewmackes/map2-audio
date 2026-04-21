"""Branding API — read + update the platform brand manifest at runtime.

Endpoints:

* ``GET  /api/branding``           — merged manifest (disk + override)
* ``PATCH /api/branding``          — merge a partial patch into the override
* ``POST /api/branding/reset``     — clear override, revert to disk manifest
* ``GET  /api/branding/paths``     — where the manifest and override live (debug)
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.services.branding_service import get_branding_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/branding", tags=["branding"])


class BrandingPalette(BaseModel):
    primary: Optional[str] = None
    primarySoft: Optional[str] = None
    onPrimary: Optional[str] = None
    background: Optional[str] = None
    surface: Optional[str] = None
    accent: Optional[str] = None

    class Config:
        extra = "allow"


class BrandingCopy(BaseModel):
    welcomeHeadline: Optional[str] = None
    welcomeSubline: Optional[str] = None
    loginBanner: Optional[str] = None
    systemdPrefix: Optional[str] = None

    class Config:
        extra = "allow"


class BrandingPatch(BaseModel):
    model_config = ConfigDict(protected_namespaces=(), populate_by_name=True)

    productName: Optional[str] = None
    shortName: Optional[str] = None
    tagline: Optional[str] = None
    vendor: Optional[str] = None
    homepage: Optional[str] = None
    assets: Optional[dict[str, str]] = None
    palette: Optional[BrandingPalette] = None
    copy_: Optional[BrandingCopy] = Field(default=None, alias="copy")

    def to_patch(self) -> dict[str, Any]:
        raw = self.model_dump(exclude_none=True, by_alias=True)
        if "palette" in raw and isinstance(raw["palette"], dict):
            raw["palette"] = {k: v for k, v in raw["palette"].items() if v is not None}
        if "copy" in raw and isinstance(raw["copy"], dict):
            raw["copy"] = {k: v for k, v in raw["copy"].items() if v is not None}
        return raw


@router.get("")
async def get_branding() -> dict[str, Any]:
    return get_branding_service().get()


@router.patch("")
async def patch_branding(patch: BrandingPatch) -> dict[str, Any]:
    try:
        payload = patch.to_patch()
        if not payload:
            raise HTTPException(status_code=400, detail="empty patch")
        return get_branding_service().update(payload)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("branding patch failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/reset")
async def reset_branding() -> dict[str, Any]:
    return get_branding_service().reset()


@router.get("/paths")
async def get_paths() -> dict[str, str]:
    svc = get_branding_service()
    return {
        "manifest": str(svc.paths.manifest),
        "override": str(svc.paths.override),
        "override_exists": str(svc.paths.override.exists()).lower(),
    }
