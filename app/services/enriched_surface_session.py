"""Shared per-surface session state for Enriched_MIDI_Physical_Surfaces."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.utils.singleton import Singleton


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class EnrichedSurfaceSessionService(Singleton):
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sessions: dict[str, dict[str, Any]] = {}

    async def get_session(self, unit_id: str) -> dict[str, Any]:
        async with self._lock:
            return deepcopy(self._sessions.get(unit_id) or {})

    async def set_view_override(self, unit_id: str, *, view_id: str | None, source: str = "operator") -> dict[str, Any]:
        async with self._lock:
            session = deepcopy(self._sessions.get(unit_id) or {})
            if view_id:
                session["current_view_override"] = str(view_id)
                session["current_view_override_source"] = str(source or "operator")
            else:
                session.pop("current_view_override", None)
                session.pop("current_view_override_source", None)
            session["updated_at"] = _utcnow_iso()
            self._sessions[unit_id] = session
            return deepcopy(session)

    async def set_recent_target(
        self,
        unit_id: str,
        *,
        target_id: str,
        label: str | None = None,
        kind: str | None = None,
        source: str = "operator",
    ) -> dict[str, Any]:
        async with self._lock:
            session = deepcopy(self._sessions.get(unit_id) or {})
            session["recent_target"] = {
                "target_id": str(target_id),
                "label": str(label or target_id),
                "kind": str(kind or "operator-target"),
                "source": str(source or "operator"),
                "updated_at": _utcnow_iso(),
            }
            session["updated_at"] = session["recent_target"]["updated_at"]
            self._sessions[unit_id] = session
            return deepcopy(session)

    async def resolve_session(
        self,
        unit_id: str,
        *,
        derived_view_id: str,
        derived_view_source: str,
        available_view_ids: list[str],
        derived_recent_target: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with self._lock:
            stored = deepcopy(self._sessions.get(unit_id) or {})

        override_view = str(stored.get("current_view_override") or "").strip()
        is_override_active = bool(override_view and override_view in available_view_ids)
        current_view_id = override_view if is_override_active else derived_view_id
        current_view_source = (
            str(stored.get("current_view_override_source") or "operator-override")
            if is_override_active
            else derived_view_source
        )
        recent_target = deepcopy(derived_recent_target or stored.get("recent_target"))

        return {
            "current_view_id": current_view_id,
            "current_view_source": current_view_source,
            "is_override_active": is_override_active,
            "recent_target": recent_target,
            "updated_at": stored.get("updated_at"),
        }


def get_enriched_surface_session_service() -> EnrichedSurfaceSessionService:
    return EnrichedSurfaceSessionService.get_instance()


def reset_enriched_surface_session_service() -> None:
    EnrichedSurfaceSessionService.reset_instance()
