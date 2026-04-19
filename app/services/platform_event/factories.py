"""PlatformEvent factory helpers and dedupe-key conventions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .envelope import PlatformEvent
from .severity import Severity


def node_dedupe_key(node_id: str, kind: str) -> str:
    return f"node:{node_id}:{kind}"


def system_dedupe_key(resource: str, node_id: str) -> str:
    return f"system:{resource}:{node_id}"


def audio_xrun_dedupe_key(node_id: str) -> str:
    return f"audio:xrun:{node_id}"


def snapshot_activation_dedupe_key(snapshot_id: str) -> str:
    return f"snapshot:{snapshot_id}:activation"


def download_dedupe_key(download_id: str) -> str:
    return f"download:{download_id}"


def workflow_dedupe_key(workflow_id: str) -> str:
    return f"workflow:{workflow_id}"


def midi_connection_dedupe_key(connection_id: str) -> str:
    return f"midi:conn:{connection_id}"


def _normalize_occurred_at(value: datetime | str | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        return datetime.fromisoformat(normalized)
    return value


def make_event(
    *,
    kind: str,
    severity: Severity,
    source_node: str,
    source_service: str,
    title: str,
    message: str,
    dedupe_key: str | None = None,
    context: dict[str, Any] | None = None,
    workflow: dict[str, Any] | None = None,
    target_surfaces: list[str] | None = None,
    resource: dict[str, Any] | None = None,
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node=source_node,
        source_service=source_service,
        occurred_at=_normalize_occurred_at(occurred_at) or datetime.now(timezone.utc),
        title=title,
        message=message,
        dedupe_key=dedupe_key,
        context=dict(context or {}),
        workflow=dict(workflow) if workflow else None,
        target_surfaces=list(target_surfaces or []),
        resource=dict(resource) if resource else None,
    )


def make_node_online(
    *,
    node_id: str,
    source_service: str,
    response_time_ms: float | None = None,
    metadata: dict[str, Any] | None = None,
    first_seen: bool = False,
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    context: dict[str, Any] = {"node_id": node_id}
    if response_time_ms is not None:
        context["response_time_ms"] = response_time_ms
    if metadata is not None:
        context["metadata"] = dict(metadata)
    if first_seen:
        context["first_seen"] = True
    return make_event(
        kind="node.online",
        severity=Severity.INFO,
        source_node=node_id,
        source_service=source_service,
        occurred_at=occurred_at,
        title="Node online",
        message=f"{node_id} is online",
        dedupe_key=node_dedupe_key(node_id, "node.online"),
        context=context,
        resource={"type": "node", "id": node_id},
    )


def make_node_offline(
    *,
    node_id: str,
    source_service: str,
    consecutive_failures: int | None = None,
    last_error: str | None = None,
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    context: dict[str, Any] = {"node_id": node_id}
    if consecutive_failures is not None:
        context["consecutive_failures"] = consecutive_failures
    if last_error:
        context["last_error"] = last_error
    return make_event(
        kind="node.offline",
        severity=Severity.ERROR,
        source_node=node_id,
        source_service=source_service,
        occurred_at=occurred_at,
        title="Node offline",
        message=f"{node_id} is offline",
        dedupe_key=node_dedupe_key(node_id, "node.offline"),
        context=context,
        resource={"type": "node", "id": node_id},
    )


def make_node_failover(
    *,
    source_node: str,
    source_service: str,
    payload: dict[str, Any],
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    failed_node = str(payload.get("failed_node") or payload.get("node_id") or source_node or "").strip()
    resource = {"type": "node", "id": failed_node} if failed_node else None
    dedupe_key = node_dedupe_key(failed_node, "node.failover") if failed_node else None
    message = (
        f"Failover completed for {failed_node}"
        if failed_node
        else "Standby node assumed primary role"
    )
    return make_event(
        kind="node.failover",
        severity=Severity.WARNING,
        source_node=failed_node or source_node,
        source_service=source_service,
        occurred_at=occurred_at or payload.get("timestamp"),
        title="Node failover",
        message=message,
        dedupe_key=dedupe_key,
        context=dict(payload),
        resource=resource,
    )
