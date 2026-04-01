"""Shared transport ownership and action dispatch."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.services.midi_hub.recorder import MidiRecorder, get_midi_recorder
from app.services.transport_owner import TransportOwner


def _session_id(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}"


class MidiHubRecorderTransportOwner(TransportOwner):
    name = "midi_recorder"

    def __init__(self, recorder: MidiRecorder | None = None) -> None:
        self._recorder = recorder or get_midi_recorder()
        self._current_session_id: str | None = None
        self._last_action: str | None = None

    async def play(self) -> dict[str, Any]:
        session_id = self._current_session_id or _session_id("maschine-play")
        result = self._recorder.start_recording(session_id=session_id, name="Maschine Transport")
        self._current_session_id = session_id
        self._last_action = "play"
        return {"ok": True, "transport": result}

    async def stop(self) -> dict[str, Any]:
        result = self._recorder.stop_recording()
        self._last_action = "stop"
        return {"ok": result is not None, "transport": result}

    async def record(self) -> dict[str, Any]:
        if self._current_session_id:
            self._recorder.stop_recording()
        session_id = _session_id("maschine-record")
        result = self._recorder.start_recording(session_id=session_id, name="Maschine Layer")
        self._current_session_id = session_id
        self._last_action = "record"
        return {"ok": True, "transport": result}

    async def restart(self) -> dict[str, Any]:
        if self._current_session_id:
            self._recorder.stop_recording()
        session_id = _session_id("maschine-restart")
        result = self._recorder.start_recording(session_id=session_id, name="Maschine Restart")
        self._current_session_id = session_id
        self._last_action = "restart"
        return {"ok": True, "transport": result}

    async def erase(self) -> dict[str, Any]:
        stopped = self._recorder.stop_recording()
        deleted = False
        if self._current_session_id:
            deleted = self._recorder.delete_session(self._current_session_id)
            self._current_session_id = None
        self._last_action = "erase"
        return {"ok": bool(stopped or deleted), "transport": {"stopped": stopped, "deleted": deleted}}

    def get_state(self) -> dict[str, Any]:
        active_session = (
            self._recorder.get_session(self._current_session_id)
            if self._current_session_id
            else None
        )
        return {
            "name": self.name,
            "current_session_id": self._current_session_id,
            "active_session": active_session,
            "last_action": self._last_action,
        }


@dataclass
class _OwnerRegistration:
    name: str
    owner: TransportOwner
    priority: int = 0


class TransportService:
    def __init__(self) -> None:
        self._owners: dict[str, _OwnerRegistration] = {}
        self._active_owner_name: str | None = None
        self.register_transport_owner("midi_recorder", MidiHubRecorderTransportOwner(), priority=10)

    def register_transport_owner(self, name: str, owner: TransportOwner, *, priority: int = 0) -> dict[str, Any]:
        registration = _OwnerRegistration(name=name, owner=owner, priority=int(priority))
        self._owners[name] = registration
        if self._active_owner_name is None:
            self._active_owner_name = name
        else:
            active = self._owners.get(self._active_owner_name)
            if active is None or registration.priority >= active.priority:
                self._active_owner_name = name
        return self.get_state()

    def transfer_ownership(self, name: str) -> dict[str, Any]:
        if name not in self._owners:
            raise ValueError("transport_owner_not_found")
        self._active_owner_name = name
        return self.get_state()

    def get_active_transport_owner(self) -> TransportOwner:
        if self._active_owner_name and self._active_owner_name in self._owners:
            return self._owners[self._active_owner_name].owner
        raise RuntimeError("transport_owner_unavailable")

    def get_state(self) -> dict[str, Any]:
        owners = [
            {
                "name": registration.name,
                "priority": registration.priority,
                "state": registration.owner.get_state(),
                "active": registration.name == self._active_owner_name,
            }
            for registration in sorted(self._owners.values(), key=lambda item: (-item.priority, item.name))
        ]
        return {
            "active_owner": self._active_owner_name,
            "owners": owners,
        }

    async def dispatch(self, action: str) -> dict[str, Any]:
        owner = self.get_active_transport_owner()
        normalized_action = str(action or "").strip().lower()
        if normalized_action not in {"play", "stop", "record", "restart", "erase"}:
            raise ValueError("transport_action_invalid")
        result = await getattr(owner, normalized_action)()
        return {
            "ok": bool(result.get("ok", True)),
            "action": normalized_action,
            "owner": owner.name,
            "transport": result.get("transport"),
            "owner_state": owner.get_state(),
        }


_transport_service_singleton: TransportService | None = None


def get_transport_service() -> TransportService:
    global _transport_service_singleton
    if _transport_service_singleton is None:
        _transport_service_singleton = TransportService()
    return _transport_service_singleton


def reset_transport_service() -> None:
    global _transport_service_singleton
    _transport_service_singleton = None
