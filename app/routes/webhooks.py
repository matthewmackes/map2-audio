"""HTTP routes for the outbound PlatformEvent webhook dispatcher."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, HttpUrl

from app.services.webhook_dispatcher_service import (
    WebhookFilter,
    get_webhook_dispatcher_service,
)

router = APIRouter(prefix="/api/webhooks", tags=["Webhooks"])


class WebhookFilterSpec(BaseModel):
    kinds: list[str] = Field(default_factory=list)
    severities: list[str] = Field(default_factory=list)
    nodes: list[str] = Field(default_factory=list)
    min_priority: float = Field(default=0.0, ge=0.0, le=1.0)


class RegisterWebhookRequest(BaseModel):
    url: HttpUrl
    filter: WebhookFilterSpec = Field(default_factory=WebhookFilterSpec)
    secret: str | None = Field(default=None, max_length=512)
    enabled: bool = True


class WebhookTargetPayload(BaseModel):
    id: str
    url: str
    filter: WebhookFilterSpec
    enabled: bool
    created_at: str
    last_attempt_at: str | None = None
    last_status: str | None = None
    has_secret: bool = False


class WebhooksListResponse(BaseModel):
    targets: list[WebhookTargetPayload]
    count: int


class DeliveryAttemptPayload(BaseModel):
    id: str
    target_id: str
    event_id: str
    attempt: int
    status_code: int | None
    ok: bool
    error: str | None
    duration_ms: int
    sent_at: str


class DeliveriesResponse(BaseModel):
    deliveries: list[DeliveryAttemptPayload]
    count: int


def _target_to_payload(target: Any) -> WebhookTargetPayload:
    data = target.to_dict(include_secret=False)
    return WebhookTargetPayload(**data)


@router.get("", response_model=WebhooksListResponse)
async def list_webhooks() -> WebhooksListResponse:
    service = get_webhook_dispatcher_service()
    payloads = [_target_to_payload(t) for t in service.list_targets()]
    return WebhooksListResponse(targets=payloads, count=len(payloads))


@router.post("", response_model=WebhookTargetPayload, status_code=status.HTTP_201_CREATED)
async def register_webhook(request: RegisterWebhookRequest) -> WebhookTargetPayload:
    service = get_webhook_dispatcher_service()
    filter_spec = WebhookFilter(
        kinds=list(request.filter.kinds),
        severities=list(request.filter.severities),
        nodes=list(request.filter.nodes),
        min_priority=request.filter.min_priority,
    )
    try:
        target = service.register_target(
            url=str(request.url),
            filter_spec=filter_spec,
            secret=request.secret,
            enabled=request.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _target_to_payload(target)


@router.delete("/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(target_id: str) -> None:
    service = get_webhook_dispatcher_service()
    if not service.delete_target(target_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="webhook not found")


@router.get("/{target_id}/deliveries", response_model=DeliveriesResponse)
async def list_deliveries(
    target_id: str, limit: int = Query(default=100, ge=1, le=1000)
) -> DeliveriesResponse:
    service = get_webhook_dispatcher_service()
    if service.get_target(target_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="webhook not found")
    deliveries = service.list_deliveries(target_id, limit=limit)
    payloads = [DeliveryAttemptPayload(**d.to_dict()) for d in deliveries]
    return DeliveriesResponse(deliveries=payloads, count=len(payloads))
