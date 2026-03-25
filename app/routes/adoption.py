"""
Operator-facing adoption APIs for unmanaged MAP2 nodes.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config import config_get
from app.services.cluster.adoption import (
    AdoptionConflictError,
    AdoptionNotFoundError,
    AdoptionRecord,
    AdoptionService,
    AdoptionTransitionError,
    ReadinessReport,
    get_adoption_service,
)
from app.services.cluster.node_visibility import get_visible_remote_nodes

router = APIRouter(prefix="/api/adoption", tags=["adoption"])
logger = logging.getLogger(__name__)


class AdoptionCheckResponse(BaseModel):
    id: str
    status: str
    message: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class ReadinessResponse(BaseModel):
    candidate_id: str
    status: str
    checks: List[AdoptionCheckResponse] = Field(default_factory=list)
    computed_at: str


class ReadinessSummaryResponse(BaseModel):
    status: str
    blocking_count: int = 0
    warning_count: int = 0
    computed_at: Optional[str] = None


class AvbAutoProvisionResponse(BaseModel):
    state: str
    reason: Optional[str] = None
    connected: int = 0
    failed: int = 0
    candidate_pairs: int = 0
    last_run_at: Optional[str] = None
    error: Optional[str] = None


class AdoptionCandidateResponse(BaseModel):
    candidate_id: str
    remote_node_id: Optional[str] = None
    node_id: Optional[str] = None
    hostname: str
    display_name: Optional[str] = None
    api_url: Optional[str] = None
    addresses: List[str] = Field(default_factory=list)
    software_version: Optional[str] = None
    capabilities: Dict[str, Any] = Field(default_factory=dict)
    trust_state: str
    adoption_state: str
    activation_state: str
    registered: bool = False
    visible: bool = True
    routing_ready: bool = False
    readiness: Optional[ReadinessSummaryResponse] = None
    avb_auto_provision: Optional[AvbAutoProvisionResponse] = None


class AdoptionCandidateListResponse(BaseModel):
    items: List[AdoptionCandidateResponse] = Field(default_factory=list)


class CloneSourceResponse(BaseModel):
    node_id: str
    hostname: str
    display_name: Optional[str] = None
    role: Optional[str] = None
    deployment_mode: Optional[str] = None
    api_url: Optional[str] = None
    is_local: bool = False
    status: Optional[str] = None
    version: Optional[str] = None


class CloneSourceListResponse(BaseModel):
    items: List[CloneSourceResponse] = Field(default_factory=list)


class ClonePreviewItemResponse(BaseModel):
    key: str
    label: str
    value: str


class ClonePreviewGroupResponse(BaseModel):
    id: str
    label: str
    description: str
    default_selected: bool = True
    items: List[ClonePreviewItemResponse] = Field(default_factory=list)


class ClonePreviewResponse(BaseModel):
    source: CloneSourceResponse
    target: AdoptionCandidateResponse
    groups: List[ClonePreviewGroupResponse] = Field(default_factory=list)


class ClaimCandidateRequest(BaseModel):
    pairing_code: Optional[str] = None
    bootstrap_token: Optional[str] = None
    requested_by: Optional[str] = None


class AdoptCandidateRequest(BaseModel):
    display_name: Optional[str] = None
    role: str = "AUDIO-NODE"
    activation_mode: str = "standby"


class PromoteNodeRequest(BaseModel):
    activation_scope: str = "all"
    requested_by: Optional[str] = None


class CloneProfileRequest(BaseModel):
    source_node_id: str
    group_ids: List[str] = Field(default_factory=list)
    requested_by: Optional[str] = None


class AdoptionActionResponse(BaseModel):
    status: str
    message: str
    candidate: Optional[AdoptionCandidateResponse] = None


class CloneApplyResponse(AdoptionActionResponse):
    source: Optional[CloneSourceResponse] = None
    applied_group_ids: List[str] = Field(default_factory=list)


def _serialize_readiness(candidate_id: str, readiness: ReadinessReport) -> ReadinessResponse:
    return ReadinessResponse(
        candidate_id=candidate_id,
        status=readiness.status,
        checks=[
            AdoptionCheckResponse(
                id=check.id,
                status=check.status,
                message=check.message,
                details=dict(check.details),
            )
            for check in readiness.checks
        ],
        computed_at=readiness.computed_at.isoformat(),
    )


def _serialize_candidate(record: AdoptionRecord) -> AdoptionCandidateResponse:
    _, visible_nodes = get_visible_remote_nodes()
    visible = None
    if record.remote_node_id:
        visible = visible_nodes.get(record.remote_node_id)
    if visible is None and record.node_id:
        visible = visible_nodes.get(record.node_id)

    readiness_summary = record.readiness.summary() if record.readiness else None

    avb_payload = record.metadata.get("avb_auto_provision") if isinstance(record.metadata, dict) else None
    return AdoptionCandidateResponse(
        candidate_id=record.candidate_id,
        remote_node_id=record.remote_node_id,
        node_id=record.node_id,
        hostname=record.hostname,
        display_name=record.display_name,
        api_url=record.api_url,
        addresses=list(record.addresses),
        software_version=record.software_version,
        capabilities=dict(record.capabilities),
        trust_state=record.trust_state,
        adoption_state=record.adoption_state,
        activation_state=record.activation_state,
        registered=bool(record.registered),
        visible=bool(visible.visible if visible is not None else record.visible),
        routing_ready=bool(visible.routing_ready if visible is not None else False),
        readiness=ReadinessSummaryResponse(**readiness_summary) if readiness_summary else None,
        avb_auto_provision=AvbAutoProvisionResponse(**avb_payload) if isinstance(avb_payload, dict) else None,
    )


def _serialize_clone_source(source: Dict[str, Any]) -> CloneSourceResponse:
    return CloneSourceResponse(
        node_id=str(source.get("node_id") or "unknown"),
        hostname=str(source.get("hostname") or source.get("node_id") or "unknown"),
        display_name=source.get("display_name"),
        role=source.get("role"),
        deployment_mode=source.get("deployment_mode"),
        api_url=source.get("api_url"),
        is_local=bool(source.get("is_local", False)),
        status=source.get("status"),
        version=source.get("version"),
    )


def _service() -> AdoptionService:
    return get_adoption_service()


def _strict_avb_auto_provision_enabled() -> bool:
    return bool(
        config_get("avb.enabled", False)
        and config_get("avb.auto_connect", True)
        and config_get("avb.avdecc_enabled", False)
        and config_get("avb.srp.enabled", True)
        and config_get("avb.srp.required", True)
    )


async def _trigger_post_adoption_avb_auto_provision(
    service: AdoptionService,
    record,
    *,
    role: Optional[str],
    reason: str,
) -> None:
    node_id = record.node_id
    normalized_role = str(role or "").strip().upper()
    if not node_id or normalized_role not in {"AUDIO-NODE", "ALL-IN-ONE", "MANAGEMENT-NODE"}:
        return
    if not _strict_avb_auto_provision_enabled():
        record.metadata["avb_auto_provision"] = {
            "state": "skipped",
            "reason": f"{reason}:{node_id}",
            "connected": 0,
            "failed": 0,
            "candidate_pairs": 0,
            "error": "strict_srp_avdecc_not_enabled",
        }
        service.store.upsert_record(record)
        return

    try:
        from app.services.avb.avb_router import get_avb_router

        summary = await get_avb_router().trigger_auto_connect(reason=f"{reason}:{node_id}")
        record.metadata["avb_auto_provision"] = {
            "state": "completed_with_issues" if int(summary.get("failed", 0) or 0) > 0 or summary.get("error") else "completed",
            "reason": str(summary.get("reason") or f"{reason}:{node_id}"),
            "connected": int(summary.get("connected", 0) or 0),
            "failed": int(summary.get("failed", 0) or 0),
            "candidate_pairs": int(summary.get("candidate_pairs", 0) or 0),
            "last_run_at": summary.get("last_run_at"),
            "error": summary.get("error"),
        }
        service.store.upsert_record(record)
        if int(summary.get("failed", 0) or 0) > 0 or summary.get("error"):
            logger.warning("Post-adoption AVB auto-provision completed with issues for %s: %s", node_id, summary)
        else:
            logger.info("Post-adoption AVB auto-provision completed for %s: %s", node_id, summary)
    except Exception as exc:
        record.metadata["avb_auto_provision"] = {
            "state": "failed",
            "reason": f"{reason}:{node_id}",
            "connected": 0,
            "failed": 1,
            "candidate_pairs": 0,
            "error": str(exc),
        }
        service.store.upsert_record(record)
        logger.warning("Post-adoption AVB auto-provision trigger failed for %s: %s", node_id, exc)


def _map_service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AdoptionNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, AdoptionConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, AdoptionTransitionError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get("/candidates", response_model=AdoptionCandidateListResponse)
async def list_candidates():
    service = _service()
    records = service.list_candidates(refresh=True)
    return AdoptionCandidateListResponse(items=[_serialize_candidate(record) for record in records])


@router.get("/candidates/{candidate_id}", response_model=AdoptionCandidateResponse)
async def get_candidate(candidate_id: str):
    service = _service()
    record = service.get_candidate(candidate_id, refresh=True)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Candidate {candidate_id} not found")
    return _serialize_candidate(record)


@router.get("/candidates/{candidate_id}/readiness", response_model=ReadinessResponse)
async def get_candidate_readiness(candidate_id: str):
    service = _service()
    try:
        readiness = service.compute_readiness(candidate_id)
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    return _serialize_readiness(candidate_id, readiness)


@router.post("/candidates/{candidate_id}/claim", response_model=AdoptionActionResponse)
async def claim_candidate(candidate_id: str, request: ClaimCandidateRequest):
    service = _service()
    if not request.pairing_code and not request.bootstrap_token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="pairing_code or bootstrap_token is required")
    try:
        record = service.claim_candidate(
            candidate_id,
            request.pairing_code,
            request.requested_by,
            bootstrap_token=request.bootstrap_token,
        )
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    return AdoptionActionResponse(
        status="ok",
        message=f"Candidate {candidate_id} claimed successfully",
        candidate=_serialize_candidate(record),
    )


@router.post("/candidates/{candidate_id}/adopt", response_model=AdoptionActionResponse)
async def adopt_candidate(candidate_id: str, request: AdoptCandidateRequest):
    service = _service()
    activation_mode = str(request.activation_mode or "standby").strip().lower()
    if activation_mode not in {"standby", "active"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="activation_mode must be 'standby' or 'active'")
    try:
        record = service.adopt_candidate(
            candidate_id,
            display_name=request.display_name,
            role=request.role,
            activation_mode=activation_mode,  # type: ignore[arg-type]
            actor_node_id=None,
        )
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    await _trigger_post_adoption_avb_auto_provision(
        service,
        record,
        role=request.role,
        reason="adoption",
    )
    return AdoptionActionResponse(
        status="ok",
        message=f"Candidate {candidate_id} adopted successfully",
        candidate=_serialize_candidate(record),
    )


@router.get("/nodes/{node_id}/clone/sources", response_model=CloneSourceListResponse)
async def list_clone_sources(node_id: str):
    service = _service()
    try:
        if service.get_node(node_id, refresh=True) is None:
            raise AdoptionNotFoundError(f"Node {node_id} not found")
        sources = service.list_clone_sources(target_node_id=node_id)
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    return CloneSourceListResponse(items=[_serialize_clone_source(source) for source in sources])


@router.get("/nodes/{node_id}/clone/preview", response_model=ClonePreviewResponse)
async def preview_clone(node_id: str, source_node_id: str):
    service = _service()
    try:
        preview = service.preview_clone_profile(node_id, source_node_id=source_node_id)
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    return ClonePreviewResponse(
        source=_serialize_clone_source(preview["source"]),
        target=_serialize_candidate(preview["target"]),
        groups=[
            ClonePreviewGroupResponse(
                id=str(group.get("id") or "unknown"),
                label=str(group.get("label") or "Unknown group"),
                description=str(group.get("description") or ""),
                default_selected=bool(group.get("default_selected", True)),
                items=[
                    ClonePreviewItemResponse(
                        key=str(item.get("key") or "unknown"),
                        label=str(item.get("label") or item.get("key") or "Unknown item"),
                        value=str(item.get("value") or ""),
                    )
                    for item in group.get("items", [])
                    if isinstance(item, dict)
                ],
            )
            for group in preview.get("groups", [])
            if isinstance(group, dict)
        ],
    )


@router.post("/nodes/{node_id}/clone", response_model=CloneApplyResponse)
async def apply_clone(node_id: str, request: CloneProfileRequest):
    service = _service()
    if not request.group_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one group_id is required")
    try:
        result = service.apply_clone_profile(
            node_id,
            source_node_id=request.source_node_id,
            group_ids=list(request.group_ids),
            actor_node_id=request.requested_by,
        )
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    record = result["record"]
    return CloneApplyResponse(
        status="ok",
        message=f"Clone profile applied to node {node_id}",
        candidate=_serialize_candidate(record),
        source=_serialize_clone_source(result["source"]),
        applied_group_ids=list(result["applied_group_ids"]),
    )


@router.post("/nodes/{node_id}/promote", response_model=AdoptionActionResponse)
async def promote_node(node_id: str, request: PromoteNodeRequest):
    if str(request.activation_scope or "all").strip().lower() != "all":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="activation_scope must be 'all' in v1")
    service = _service()
    try:
        record = service.promote_node(node_id, request.requested_by)
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    await _trigger_post_adoption_avb_auto_provision(
        service,
        record,
        role=record.metadata.get("requested_role"),
        reason="promotion",
    )
    return AdoptionActionResponse(
        status="ok",
        message=f"Node {node_id} promoted successfully",
        candidate=_serialize_candidate(record),
    )


@router.delete("/candidates/{candidate_id}", response_model=AdoptionActionResponse)
async def forget_candidate(candidate_id: str):
    service = _service()
    try:
        service.forget_candidate(candidate_id)
    except Exception as exc:  # pragma: no cover - mapped deterministically below
        raise _map_service_error(exc) from exc
    return AdoptionActionResponse(
        status="ok",
        message=f"Candidate {candidate_id} forgotten successfully",
        candidate=None,
    )
