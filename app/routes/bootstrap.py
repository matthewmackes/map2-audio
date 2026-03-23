"""
Remote bootstrap endpoints used by the adoption claim handshake.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.services.cluster.adoption_bootstrap import (
    BootstrapClaimError,
    get_adoption_bootstrap_service,
)

router = APIRouter(prefix="/api/bootstrap", tags=["bootstrap"])


class BootstrapStatusResponse(BaseModel):
    node_id: str
    hostname: str
    remote_fingerprint: str
    pairing_required: bool = True
    pairing_code_hint: str
    pairing_code_expires_at: str
    pairing_code: Optional[str] = None
    active_claims: int = 0


class BootstrapClaimRequest(BaseModel):
    pairing_code: Optional[str] = None
    bootstrap_token: Optional[str] = None
    requester_node_id: Optional[str] = None


class BootstrapClaimResponse(BaseModel):
    claim_token: str
    token_expires_at: str
    node_id: str
    hostname: str
    remote_fingerprint: str


class BootstrapFinalizeRequest(BaseModel):
    claim_token: str
    requester_node_id: Optional[str] = None
    adopted_node_id: Optional[str] = None


class BootstrapFinalizeResponse(BaseModel):
    status: str
    node_id: str
    hostname: str
    remote_fingerprint: str
    adopted_node_id: Optional[str] = None


class BootstrapTokenIssueRequest(BaseModel):
    issuer_api_url: Optional[str] = None
    target_node_id: Optional[str] = None
    target_hostname: Optional[str] = None
    target_api_url: Optional[str] = None
    expires_in_seconds: Optional[int] = None


class BootstrapTokenIssueResponse(BaseModel):
    bootstrap_token: str
    expires_at: str
    issuer_node_id: str
    issuer_api_url: str
    target_node_id: Optional[str] = None
    target_hostname: Optional[str] = None


class BootstrapTokenVerifyRequest(BaseModel):
    bootstrap_token: str
    requester_node_id: Optional[str] = None
    remote_node_id: Optional[str] = None
    remote_hostname: Optional[str] = None


class BootstrapTokenVerifyResponse(BaseModel):
    scope: str
    issuer_node_id: str
    issuer_api_url: str
    issuer_fingerprint: Optional[str] = None
    issued_at: str
    expires_at: str
    token_id: str
    target_node_id: Optional[str] = None
    target_hostname: Optional[str] = None
    requester_node_id: Optional[str] = None


def _allow_pairing_code_echo(request: Request) -> bool:
    client_host = getattr(request.client, "host", "") if request.client else ""
    if client_host in {"127.0.0.1", "::1", "localhost", "testclient"}:
        return True
    return os.getenv("MAP2_BOOTSTRAP_ALLOW_REMOTE_CODE", "false").lower() in {"1", "true", "yes", "on"}


def _resolve_request_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.get("/status", response_model=BootstrapStatusResponse)
async def get_bootstrap_status(
    request: Request,
    include_pairing_code: bool = Query(False),
) -> BootstrapStatusResponse:
    service = get_adoption_bootstrap_service()
    return BootstrapStatusResponse(
        **service.get_status(include_pairing_code=bool(include_pairing_code and _allow_pairing_code_echo(request)))
    )


@router.post("/claim", response_model=BootstrapClaimResponse)
async def claim_bootstrap(request: BootstrapClaimRequest) -> BootstrapClaimResponse:
    service = get_adoption_bootstrap_service()
    if not request.pairing_code and not request.bootstrap_token:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="pairing_code or bootstrap_token is required")
    try:
        payload = service.verify_claim(
            pairing_code=request.pairing_code,
            bootstrap_token=request.bootstrap_token,
            requester_node_id=request.requester_node_id,
        )
    except BootstrapClaimError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return BootstrapClaimResponse(**payload)


@router.post("/finalize", response_model=BootstrapFinalizeResponse)
async def finalize_bootstrap(request: BootstrapFinalizeRequest) -> BootstrapFinalizeResponse:
    service = get_adoption_bootstrap_service()
    try:
        payload = service.finalize_claim(
            claim_token=request.claim_token,
            requester_node_id=request.requester_node_id,
            adopted_node_id=request.adopted_node_id,
        )
    except BootstrapClaimError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return BootstrapFinalizeResponse(**payload)


@router.post("/tokens/issue", response_model=BootstrapTokenIssueResponse)
async def issue_bootstrap_token(request: Request, payload: BootstrapTokenIssueRequest) -> BootstrapTokenIssueResponse:
    service = get_adoption_bootstrap_service()
    issuer_api_url = payload.issuer_api_url or _resolve_request_base_url(request)
    token_payload = service.issue_bootstrap_token(
        issuer_api_url=issuer_api_url,
        target_node_id=payload.target_node_id,
        target_hostname=payload.target_hostname,
        target_api_url=payload.target_api_url,
        expires_in_seconds=payload.expires_in_seconds,
    )
    return BootstrapTokenIssueResponse(**token_payload)


@router.post("/tokens/verify", response_model=BootstrapTokenVerifyResponse)
async def verify_bootstrap_token(request: BootstrapTokenVerifyRequest) -> BootstrapTokenVerifyResponse:
    service = get_adoption_bootstrap_service()
    try:
        payload = service.verify_bootstrap_token(
            bootstrap_token=request.bootstrap_token,
            remote_node_id=request.remote_node_id,
            remote_hostname=request.remote_hostname,
        )
    except BootstrapClaimError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    payload["requester_node_id"] = request.requester_node_id
    return BootstrapTokenVerifyResponse(**payload)
