"""State Authority correction-receiving routes.

These routes are the **remote side** of the Layer 2 cluster reconciler's
tier handlers (`state_authority_cluster_transport.py`). When a management
node's reconciler detects drift on a worker node, it POSTs through the
existing `/api/node/{id}/proxy/...` middleware which forwards the request
to the worker's local copy of these routes. The handlers apply the
correction to the local engine + asset registry.

Routes land here (not in `state_authority.py`) to keep the read-only
catalog/schema surface separate from the mutation surface that requires
an active snapshot + engine.

Endpoints:
- POST /api/snapshots/{snapshot_id}/apply-parameters
    Apply a desired-state payload's parameter map to the running engine.
- POST /api/assets/{asset_hash}/deploy
    Acknowledge (or re-acknowledge) that the hashed asset is locally
    available in `~/.map2/assets/{sha256}/...`; return 404 if it isn't.

Both return the standard error envelope on failure.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.juce_engine_service import get_audio_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["State Authority Corrections"])


_ASSET_ROOT = Path.home() / ".map2" / "assets"


class ApplyParametersRequest(BaseModel):
    """Payload pushed by the management node's cluster reconciler."""

    desired: dict[str, Any] = Field(
        ...,
        description="Full live-snapshot payload whose parameter map the worker should apply.",
    )


class ApplyParametersResponse(BaseModel):
    applied: int
    skipped: int
    total_observed: int


@router.post(
    "/snapshots/{snapshot_id}/apply-parameters",
    response_model=ApplyParametersResponse,
)
async def post_apply_parameters(
    snapshot_id: str,  # noqa: ARG001 — snapshot_id validated by the caller's routing
    payload: ApplyParametersRequest,
) -> ApplyParametersResponse:
    """Apply every parameter in the desired payload to the local engine.

    Walks `desired.chains[*].plugins[*].parameters` and calls
    `engine.set_parameter(uri, symbol, value, plugin_position=...)` for
    each entry. The current engine interprets parameter keys as symbol
    strings (post plan Q61 canonicalization).

    Returns counts so the reconciler can report partial-success correctly.
    """
    engine = get_audio_engine()
    if engine is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "engine_unavailable",
                    "message": "Audio engine not running; parameter corrections cannot apply.",
                    "details": None,
                }
            },
        )

    set_parameter = getattr(engine, "set_parameter", None)
    if set_parameter is None:
        raise HTTPException(
            status_code=501,
            detail={
                "error": {
                    "code": "set_parameter_not_exposed",
                    "message": "engine.set_parameter is not available on the current build.",
                    "details": None,
                }
            },
        )

    applied = 0
    skipped = 0
    total = 0

    chains = payload.desired.get("chains") or []
    if not isinstance(chains, list):
        chains = []

    for chain in chains:
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins") or []:
            if not isinstance(plugin, dict):
                continue
            uri = str(plugin.get("uri") or "")
            if not uri:
                continue
            position = plugin.get("plugin_position", plugin.get("position", 0))
            try:
                position_int = int(position or 0)
            except (TypeError, ValueError):
                position_int = 0
            parameters = plugin.get("parameters") or {}
            if not isinstance(parameters, dict):
                continue
            for symbol, value in parameters.items():
                total += 1
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    skipped += 1
                    continue
                try:
                    ok = await set_parameter(uri, str(symbol), numeric, plugin_position=position_int)
                except Exception as exc:  # noqa: BLE001
                    logger.debug(
                        "apply-parameters: set_parameter(%s, %s) raised %s",
                        uri, symbol, exc,
                    )
                    skipped += 1
                    continue
                if ok:
                    applied += 1
                else:
                    skipped += 1

    return ApplyParametersResponse(
        applied=applied,
        skipped=skipped,
        total_observed=total,
    )


class AssetDeployResponse(BaseModel):
    asset_hash: str
    local_path: str
    size_bytes: int


@router.post("/assets/{asset_hash}/deploy", response_model=AssetDeployResponse)
async def post_asset_deploy(asset_hash: str) -> AssetDeployResponse:
    """Confirm a content-addressed asset is locally present.

    The cluster transport expects a 2xx when the worker has the referenced
    asset on disk at the canonical path
    `~/.map2/assets/{sha256}/{file}`. If the asset is missing, the worker
    returns 404 so the management node can escalate to a full asset-sync
    operation (follow-up).

    Path segment is the full `sha256:abc123…` hash — callers MUST URL-escape
    the colon or use the path variable verbatim (FastAPI accepts it).
    """
    normalized = str(asset_hash or "").strip()
    if not normalized.startswith("sha256:") or len(normalized) != len("sha256:") + 64:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "invalid_asset_hash",
                    "message": "asset_hash must be a sha256:<64-hex-chars> reference.",
                    "details": {"received": normalized},
                }
            },
        )

    asset_dir = _ASSET_ROOT / normalized[len("sha256:"):]
    if not asset_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "asset_not_local",
                    "message": "Asset directory not found on this node; escalate to full asset-sync.",
                    "details": {"expected_dir": str(asset_dir)},
                }
            },
        )

    # The asset-registry contract stores one file per sha256 dir.
    candidates = [child for child in asset_dir.iterdir() if child.is_file()]
    if not candidates:
        raise HTTPException(
            status_code=404,
            detail={
                "error": {
                    "code": "asset_directory_empty",
                    "message": "Asset directory present but empty; needs re-sync.",
                    "details": {"dir": str(asset_dir)},
                }
            },
        )

    target = candidates[0]
    try:
        stat = target.stat()
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "asset_stat_failed",
                    "message": f"Failed to stat local asset file: {exc}",
                    "details": {"path": str(target)},
                }
            },
        ) from exc

    return AssetDeployResponse(
        asset_hash=normalized,
        local_path=str(target),
        size_bytes=int(stat.st_size),
    )
