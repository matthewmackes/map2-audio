"""Branding API — read + update the platform brand manifest at runtime.

Endpoints:

* ``GET  /api/branding``           — merged manifest (disk + override)
* ``PATCH /api/branding``          — merge a partial patch into the override
* ``POST /api/branding/reset``     — clear override, revert to disk manifest
* ``GET  /api/branding/paths``     — where the manifest and override live (debug)
* ``GET  /api/branding/os-status`` — report OS-level branding artifact state
* ``POST /api/branding/apply-os``  — render templates + rewrite systemd units
"""
from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.services.branding_service import get_branding_service

REPO_ROOT = Path(__file__).resolve().parents[2]
RENDER_SCRIPT = REPO_ROOT / "scripts" / "render_branding_templates.py"
SYSTEMD_SCRIPT = REPO_ROOT / "scripts" / "apply_branding_systemd.py"
GENERATED_ENV = REPO_ROOT / "branding" / "generated" / "branding.env"

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


def _plymouth_installed() -> bool:
    return Path("/usr/share/plymouth/themes/map2").exists()


def _login_banner_installed() -> bool:
    return Path("/etc/issue.d/map2-login.issue").exists()


def _welcome_installed() -> bool:
    return Path("/etc/profile.d/map2-welcome.sh").exists()


@router.get("/os-status")
async def os_status() -> dict[str, Any]:
    """Report whether OS-level branding artifacts are present and current.

    Read-only: performs no privileged operations.
    """
    return {
        "plymouthInstalled": _plymouth_installed(),
        "loginBannerInstalled": _login_banner_installed(),
        "welcomeInstalled": _welcome_installed(),
        "generatedEnvExists": GENERATED_ENV.exists(),
        "renderScript": str(RENDER_SCRIPT),
        "systemdScript": str(SYSTEMD_SCRIPT),
    }


class ApplyOsRequest(BaseModel):
    dryRun: bool = True
    applySystemd: bool = False
    applyTemplates: bool = True


@router.post("/apply-os")
async def apply_os(req: ApplyOsRequest) -> dict[str, Any]:
    """Render templates and optionally rewrite systemd Description lines.

    Safe by default (``dryRun=True``). Never invokes ``sudo`` or reloads
    the daemon — those are reserved for the explicit installer script.
    """
    if not RENDER_SCRIPT.exists():
        raise HTTPException(status_code=500, detail=f"renderer missing: {RENDER_SCRIPT}")

    output: dict[str, Any] = {"dryRun": req.dryRun, "steps": []}

    if req.applyTemplates:
        cmd = [sys.executable, str(RENDER_SCRIPT)]
        if req.dryRun:
            cmd.append("--dry-run")
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"render failed: {exc}")
        output["steps"].append({
            "step": "render_templates",
            "returncode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr,
        })

    if req.applySystemd:
        cmd = [sys.executable, str(SYSTEMD_SCRIPT)]
        if not req.dryRun:
            cmd.append("--write")
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"systemd rewrite failed: {exc}")
        output["steps"].append({
            "step": "apply_systemd",
            "returncode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr,
        })

    return output
