"""Projection helpers for legacy cluster/MIDI route surfaces backed by PlatformEvents."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any

from .envelope import PlatformEvent
from .store import PlatformEventStore

MIDI_EVENT_PREFIXES: tuple[str, ...] = ("midi.",)
UPDATE_EVENT_KINDS: tuple[str, ...] = (
    "cluster.update.started",
    "cluster.update.completed",
    "cluster.update.failed",
    "cluster.update.rolled_back",
)
CLUSTER_EVENT_PREFIXES: tuple[str, ...] = (
    "node.",
    "config.",
    "cluster.update.",
    "failover.",
    "maintenance.",
    "metrics.",
    "midi.",
)
CLUSTER_EVENT_KINDS: tuple[str, ...] = (
    "system.performance.alert",
    "system.status",
    "system.health.degraded",
    "system.health.recovered",
    "system.health.critical",
)


def isoformat_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def platform_event_affected_nodes(event: PlatformEvent) -> list[str]:
    raw = event.context.get("affected_nodes") if isinstance(event.context, dict) else None
    return [str(node).strip() for node in list(raw or []) if str(node).strip()]


def platform_event_details(event: PlatformEvent) -> dict[str, Any]:
    details = dict(event.context or {})
    details.pop("affected_nodes", None)
    details.pop("federated_from", None)
    if event.resource is not None:
        details.setdefault("resource", dict(event.resource))
    if event.workflow is not None:
        details.setdefault("workflow", dict(event.workflow))
    return details


def platform_event_to_cluster_dict(event: PlatformEvent) -> dict[str, Any]:
    return {
        "event_type": event.kind,
        "timestamp": isoformat_utc(event.occurred_at) or "",
        "severity": event.severity.value,
        "source_node_id": event.source_node,
        "affected_nodes": platform_event_affected_nodes(event),
        "message": event.message,
        "details": platform_event_details(event),
        "correlation_id": event.correlation_id or "",
        "event_id": event.event_id,
        "title": event.title,
    }


def query_cluster_events(
    store: PlatformEventStore,
    *,
    limit: int,
    hours: int,
    source_node: str | None = None,
    severities: list[str] | tuple[str, ...] | None = None,
    kinds: list[str] | tuple[str, ...] | None = None,
    kind_prefixes: list[str] | tuple[str, ...] | None = None,
) -> list[PlatformEvent]:
    prefixes = tuple(kind_prefixes or CLUSTER_EVENT_PREFIXES)
    requested_kinds = list(CLUSTER_EVENT_KINDS)
    if kinds:
        requested_kinds.extend(str(kind).strip() for kind in kinds if str(kind).strip())
    return store.query_events(
        limit=limit,
        hours=hours,
        source_node=source_node,
        severities=severities,
        kinds=requested_kinds,
        kind_prefixes=prefixes,
    )


def query_midi_events(
    store: PlatformEventStore,
    *,
    limit: int,
    hours: int,
    source_node: str | None = None,
    severities: list[str] | tuple[str, ...] | None = None,
    kinds: list[str] | tuple[str, ...] | None = None,
) -> list[PlatformEvent]:
    return store.query_events(
        limit=limit,
        hours=hours,
        source_node=source_node,
        severities=severities,
        kinds=kinds,
        kind_prefixes=MIDI_EVENT_PREFIXES,
    )


def cluster_event_statistics(events: list[PlatformEvent]) -> dict[str, Any]:
    by_kind = Counter(event.kind for event in events)
    by_severity = Counter(event.severity.value for event in events)
    node_counter = Counter(event.source_node for event in events)
    return {
        "total_events": len(events),
        "events_by_type": dict(sorted(by_kind.items())),
        "events_by_severity": dict(sorted(by_severity.items())),
        "top_nodes": [
            {"node_id": node_id, "count": count}
            for node_id, count in node_counter.most_common(10)
        ],
    }
