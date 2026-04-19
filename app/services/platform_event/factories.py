"""PlatformEvent factory helpers and dedupe-key conventions."""

from __future__ import annotations

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
) -> PlatformEvent:
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node=source_node,
        source_service=source_service,
        title=title,
        message=message,
        dedupe_key=dedupe_key,
        context=dict(context or {}),
        workflow=dict(workflow) if workflow else None,
        target_surfaces=list(target_surfaces or []),
    )
