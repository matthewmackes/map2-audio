"""PlatformEvent factory helpers and dedupe-key conventions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .envelope import PlatformEvent
from .kind import kind_for_lcd_surface_type
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


def config_dedupe_key(key_path: str, scope: str) -> str:
    normalized_key = str(key_path or "").strip() or "unknown"
    normalized_scope = str(scope or "").strip() or "cluster"
    return f"config:{normalized_scope}:{normalized_key}"


def midi_profile_dedupe_key(profile_id: str) -> str:
    return f"midi:profile:{profile_id}"


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


def make_cluster_platform_event(
    *,
    kind: str,
    severity: Severity,
    source_node: str,
    source_service: str,
    title: str,
    message: str,
    context: dict[str, Any] | None = None,
    affected_nodes: list[str] | None = None,
    correlation_id: str | None = None,
    dedupe_key: str | None = None,
    target_nodes: list[str] | None = None,
    target_surfaces: list[str] | None = None,
    resource: dict[str, Any] | None = None,
    occurred_at: datetime | str | None = None,
    ttl_seconds: int = 300,
    broadcast: bool = True,
) -> PlatformEvent:
    payload_context = dict(context or {})
    if affected_nodes:
        payload_context.setdefault("affected_nodes", list(affected_nodes))
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node=source_node,
        source_service=source_service,
        occurred_at=_normalize_occurred_at(occurred_at) or datetime.now(timezone.utc),
        title=title,
        message=message,
        dedupe_key=dedupe_key,
        context=payload_context,
        correlation_id=correlation_id,
        ttl_seconds=max(0, int(ttl_seconds)),
        target_nodes=list(target_nodes or []),
        target_surfaces=list(target_surfaces or []),
        resource=dict(resource) if resource else None,
        broadcast=bool(broadcast),
    )


def make_midi_cluster_event(
    *,
    kind: str,
    severity: Severity,
    source_node: str,
    source_service: str,
    title: str,
    message: str,
    node_id: str | None = None,
    remote_node_id: str | None = None,
    port_name: str | None = None,
    destination_port: str | None = None,
    transport: str | None = None,
    latency_ms: float | None = None,
    connection_id: str | None = None,
    affected_nodes: list[str] | None = None,
    context: dict[str, Any] | None = None,
    correlation_id: str | None = None,
    dedupe_key: str | None = None,
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    payload_context = dict(context or {})
    if node_id is not None:
        payload_context.setdefault("node_id", str(node_id))
    if remote_node_id is not None:
        payload_context.setdefault("remote_node_id", str(remote_node_id))
    if port_name is not None:
        payload_context.setdefault("port_name", str(port_name))
    if destination_port is not None:
        payload_context.setdefault("destination_port", str(destination_port))
    if transport is not None:
        payload_context.setdefault("transport", str(transport))
    if latency_ms is not None:
        payload_context.setdefault("latency_ms", float(latency_ms))
    if connection_id is not None:
        payload_context.setdefault("connection_id", str(connection_id))
    resource = None
    if connection_id:
        resource = {"type": "midi_connection", "id": str(connection_id)}
    elif node_id:
        resource = {"type": "node", "id": str(node_id)}
    return make_cluster_platform_event(
        kind=kind,
        severity=severity,
        source_node=source_node,
        source_service=source_service,
        title=title,
        message=message,
        context=payload_context,
        affected_nodes=affected_nodes,
        correlation_id=correlation_id,
        dedupe_key=dedupe_key,
        resource=resource,
        occurred_at=occurred_at,
    )


def make_config_changed_event(
    *,
    source_node: str,
    source_service: str,
    key_path: str,
    value: Any,
    scope: str,
    action: str = "modified",
    occurred_at: datetime | str | None = None,
) -> PlatformEvent:
    normalized_key = str(key_path or "").strip()
    normalized_scope = str(scope or "cluster").strip() or "cluster"
    return make_cluster_platform_event(
        kind="config.changed",
        severity=Severity.INFO,
        source_node=source_node,
        source_service=source_service,
        occurred_at=occurred_at,
        title="Configuration changed",
        message=f"Configuration changed: {normalized_key}",
        dedupe_key=config_dedupe_key(normalized_key, normalized_scope),
        context={
            "key": normalized_key,
            "value": value,
            "scope": normalized_scope,
            "action": str(action or "modified"),
            "source_node_id": source_node,
        },
    )


def make_lcd_surface_event(
    *,
    event_type: str,
    severity: Severity,
    source_node: str,
    source_service: str,
    title: str,
    message: str,
    icon: str | None = None,
    color: str | None = None,
    sound: bool | None = None,
    dismiss_auto: bool | None = None,
    broadcast: bool = True,
    target_nodes: list[str] | None = None,
    target_surfaces: list[str] | None = None,
    context: dict[str, Any] | None = None,
    workflow: dict[str, Any] | None = None,
    resource: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
    occurred_at: datetime | str | None = None,
    ttl_seconds: int = 300,
) -> PlatformEvent:
    normalized_event_type = str(event_type or "").strip().lower()
    kind = (
        normalized_event_type
        if normalized_event_type.startswith("lcd.")
        else kind_for_lcd_surface_type(normalized_event_type)
    )
    lcd_target_surfaces = list(target_surfaces or [])
    if "lcd" not in lcd_target_surfaces:
        lcd_target_surfaces.append("lcd")

    payload_context = dict(context or {})
    if normalized_event_type and not normalized_event_type.startswith("lcd."):
        payload_context.setdefault("lcd_event_type", normalized_event_type)
    if dismiss_auto is not None:
        payload_context.setdefault("lcd_dismiss_auto", bool(dismiss_auto))

    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node=source_node,
        source_service=source_service,
        occurred_at=_normalize_occurred_at(occurred_at) or datetime.now(timezone.utc),
        title=title,
        message=message,
        dedupe_key=dedupe_key,
        context=payload_context,
        workflow=dict(workflow) if workflow else None,
        target_surfaces=lcd_target_surfaces,
        resource=dict(resource) if resource else None,
        ttl_seconds=max(0, int(ttl_seconds)),
        icon=icon,
        color=color,
        sound=sound,
        sticky=False if dismiss_auto is None else not bool(dismiss_auto),
        broadcast=bool(broadcast),
        target_nodes=list(target_nodes or []),
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
