"""
Runtime profile API.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.native_inventory import evaluate_inventory_gate
from app.services.rt_hardening import apply_rt_hardening, verify_rt_hardening
from app.services.runtime_profiles import (
    PROFILE_EDIT,
    PROFILE_PERFORMANCE,
    apply_runtime_profile,
    get_capability_matrix,
    get_runtime_profile_status,
    get_standard_defaults_matrix,
    is_audio_capable_node,
)

router = APIRouter(prefix="/api/runtime-profiles", tags=["runtime-profiles"])


class RuntimeProfileSwitchRequest(BaseModel):
    profile: str = Field(..., description="Runtime profile target: Edit or Performance")
    dry_run: bool = Field(default=False, description="Only evaluate preflight; do not apply settings")
    force: bool = Field(default=False, description="Allow apply when preflight contains blocking checks")


class RTHardeningApplyRequest(BaseModel):
    dry_run: bool = Field(default=True, description="Run setup_realtime in dry-run mode")
    auto_yes: bool = Field(default=True, description="Pass --yes to setup script")


def _normalize_profile(value: str) -> str:
    candidate = str(value or "").strip().lower()
    if candidate == "edit":
        return PROFILE_EDIT
    if candidate in {"performance", "perf"}:
        return PROFILE_PERFORMANCE
    return ""


async def _collect_preflight(target_profile: str) -> Dict[str, Any]:
    status = get_runtime_profile_status()
    checks: List[Dict[str, Any]] = []
    blocking = False

    if not is_audio_capable_node(status["node_type"]):
        checks.append(
            {
                "name": "node_type_support",
                "ok": False,
                "blocking": True,
                "detail": f"Node type {status['node_type']} does not support audio runtime profiles.",
            }
        )
        return {"checks": checks, "blocking": True}

    checks.append(
        {
            "name": "node_type_support",
            "ok": True,
            "blocking": False,
            "detail": f"Node type {status['node_type']} supports {target_profile}.",
        }
    )

    if target_profile == PROFILE_PERFORMANCE:
        rt_verify = verify_rt_hardening(quick=True)
        rt_ok = bool(rt_verify.get("ok", False)) and bool(rt_verify.get("grade"))
        checks.append(
            {
                "name": "rt_hardening",
                "ok": rt_ok,
                "blocking": True,
                "detail": f"verify_rt_config grade={rt_verify.get('grade') or 'unavailable'}",
            }
        )
        blocking = blocking or not rt_ok

        inventory = await evaluate_inventory_gate(probe_load=True)
        inv_ok = bool(inventory.get("gate_pass", False))
        checks.append(
            {
                "name": "native_inventory_gate",
                "ok": inv_ok,
                "blocking": bool(inventory.get("required", True)),
                "detail": (
                    f"loadable={inventory.get('loadable_count', 0)}/"
                    f"{inventory.get('probe_count', 0)} state={inventory.get('state')}"
                ),
                "inventory": inventory,
            }
        )
        if bool(inventory.get("required", True)) and not inv_ok:
            blocking = True

    return {"checks": checks, "blocking": blocking}


@router.get("/matrix")
async def get_matrix():
    return {"matrix": get_capability_matrix()}


@router.get("/defaults-matrix")
async def get_defaults_matrix():
    return {"defaults": get_standard_defaults_matrix()}


@router.get("/status")
async def get_status():
    return get_runtime_profile_status()


@router.post("/switch")
async def switch_runtime_profile(request: RuntimeProfileSwitchRequest):
    target_profile = _normalize_profile(request.profile)
    if not target_profile:
        raise HTTPException(status_code=400, detail="Invalid profile. Use Edit or Performance.")

    preflight = await _collect_preflight(target_profile)
    if preflight["blocking"] and not request.force:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Preflight checks failed. Pass force=true to override.",
                "preflight": preflight,
            },
        )

    if request.dry_run:
        return {
            "status": "dry_run",
            "target_profile": target_profile,
            "preflight": preflight,
            "current": get_runtime_profile_status(),
        }

    try:
        applied = apply_runtime_profile(target_profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "status": "applied",
        "target_profile": target_profile,
        "preflight": preflight,
        "applied": applied,
        "current": get_runtime_profile_status(),
    }


@router.post("/rt-harden/verify")
async def rt_hardening_verify():
    return verify_rt_hardening(quick=True)


@router.post("/rt-harden/apply")
async def rt_hardening_apply(request: RTHardeningApplyRequest):
    return apply_rt_hardening(dry_run=request.dry_run, auto_yes=request.auto_yes)


@router.get("/native-inventory")
async def native_inventory_status(probe_load: bool = False):
    return await evaluate_inventory_gate(probe_load=probe_load)
