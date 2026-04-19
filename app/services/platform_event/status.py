"""Health/readiness snapshots for the canonical PlatformEvent control plane."""

from __future__ import annotations

from typing import Any

from app.services.ws_federation import get_ws_federator

from .store import get_platform_event_store


def get_platform_event_status_snapshot() -> dict[str, Any]:
    return {
        "legacy_buses_removed": True,
        "dual_emitters_remaining": 0,
        "platform_event_store": get_platform_event_store().status_snapshot(),
        "platform_event_federation": get_ws_federator().status_snapshot(),
    }

