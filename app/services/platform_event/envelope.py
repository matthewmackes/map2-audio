"""Pydantic PlatformEvent envelope."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from time import monotonic_ns
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .kind import normalize_platform_event_kind
from .severity import Severity


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class PlatformEvent(BaseModel):
    """Canonical event envelope shared across platform surfaces."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    kind: str
    severity: Severity
    source_node: str
    source_service: str
    occurred_at: datetime = Field(default_factory=_utc_now)
    monotonic_ns: int | None = Field(default_factory=monotonic_ns)
    title: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=1, max_length=200)
    context: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str | None = None
    dedupe_key: str | None = None
    ttl_seconds: int = Field(default=300, ge=0)
    expires_at: datetime | None = None
    priority: float = Field(default=0.0, ge=0.0, le=1.0)
    icon: str | None = None
    color: str | None = None
    sound: bool | None = None
    sticky: bool = False
    resource: dict[str, Any] | None = None
    broadcast: bool = True
    target_nodes: list[str] = Field(default_factory=list)
    target_surfaces: list[str] = Field(default_factory=list)
    workflow: dict[str, Any] | None = None
    supersedes: str | None = None
    ack_required: bool = False

    @field_validator("kind")
    @classmethod
    def _validate_kind(cls, value: str) -> str:
        return normalize_platform_event_kind(value)

    @field_validator("occurred_at", "expires_at", mode="before")
    @classmethod
    def _normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _coerce_utc(value)

    @model_validator(mode="after")
    def _apply_expiry_defaults(self) -> "PlatformEvent":
        if self.expires_at is None and self.ttl_seconds > 0:
            self.expires_at = self.occurred_at + timedelta(seconds=self.ttl_seconds)
        if self.ttl_seconds == 0:
            self.expires_at = None
        return self
