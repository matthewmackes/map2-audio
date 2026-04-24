"""T2431-J — `map2 authority doctor` API surface.

Exposes the deployment-mode authority doctor so operators (and the T2431-I
single-node doctor workflow + the eventual CLI) can diagnose drift between
the canonical authority file and its generated projections, and trigger a
repair that regenerates every projection from the authority (never the
other direction).

Endpoints:
- GET  /api/authority/doctor/deployment-mode   → DoctorReport
- POST /api/authority/doctor/deployment-mode/repair → DoctorReport after repair
- GET  /api/authority/doctor/config-layers     → LayeredConfigLoader summary
  (non-mutating introspection so the Config Authority Model audit can
  surface forbidden overrides that got dropped at load time).
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from app.deployment.authority import (
    DeploymentModeAuthority,
    DeploymentModeDoctor,
)
from app.services.layered_config_loader import LayeredConfigLoader

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/authority", tags=["Authority Doctor"])


def _doctor() -> DeploymentModeDoctor:
    return DeploymentModeDoctor(DeploymentModeAuthority())


@router.get("/doctor/deployment-mode")
async def get_deployment_mode_authority_report() -> Dict[str, Any]:
    """Return the current deployment-mode authority drift report."""
    return _doctor().check().to_dict()


@router.post("/doctor/deployment-mode/repair")
async def repair_deployment_mode_projections() -> Dict[str, Any]:
    """Regenerate every deployment-mode projection from the authority.

    Raises 409 when the authority file does not exist — the doctor cannot
    repair nothing into something. The installer or operator must create
    the authority first.
    """
    doctor = _doctor()
    initial = doctor.check()
    if not initial.authority_exists:
        raise HTTPException(
            status_code=409,
            detail=(
                "Deployment-mode authority file does not exist. Create "
                "/etc/map2/mode.json via the installer or `map2 authority "
                "doctor --create-authority <mode>` before running repair."
            ),
        )
    return doctor.repair().to_dict()


@router.get("/doctor/config-layers")
async def get_config_layer_summary() -> Dict[str, Any]:
    """Surface the layered-config loader's per-plane contributions.

    Non-mutating: loads a fresh view from disk each call so operators can
    see exactly which plane is setting which key and which user-plane
    overrides were dropped as forbidden.
    """
    result = LayeredConfigLoader().load()
    return result.summary()
