"""Typed Push drum-machine session and runtime projection helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from dataclasses import asdict, dataclass
from time import time
from typing import Any, Literal
from uuid import uuid4

import aiohttp

from app.services.juce_engine_service import get_audio_engine
from app.services.push_surface.drum_registry import (
    DrumMachineInstanceDescriptor,
    _local_node_id,
    get_drum_instance_registry,
)
from app.services.transport_service import get_transport_service
from app.services.websocket_manager import ws_manager


PUSH_PENDING_CONFIRMATION_TOPIC = "push_surface:pending_confirmation"


PushDrumCommandName = Literal[
    "select_instance",
    "accept_pending_confirmation",
    "reject_pending_confirmation",
    "confirm_instance_switch",
    "play",
    "stop",
    "record",
    "trigger_pad",
    "stop_pad",
    "set_pad_velocity_mode",
    "set_64_pad_bank",
    "set_repeat",
    "set_fixed_length",
    "set_quantize",
    "set_loop_selector",
    "set_step",
    "clear_step",
    "set_step_automation",
    "browse_pad_source",
    "load_pad_source",
    "request_surface_state",
]


@dataclass
class PushDrumPendingConfirmation:
    action_id: str
    action_type: str
    reason: str
    device_fingerprint: str
    target_instance_id: str
    target_display_name: str
    target_node_id: str
    target_node_label: str
    created_at: float
    expires_at: float
    timeout_ms: int
    accept_command: str = "accept_pending_confirmation"
    reject_command: str = "reject_pending_confirmation"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PushDrumConfirmationResolution:
    action_id: str
    action_type: str
    status: str
    reason: str
    device_fingerprint: str
    target_instance_id: str
    resolved_at: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PushDrumSessionState:
    device_fingerprint: str
    selected_instance_id: str | None = None
    bank_index: int = 0
    last_command: str | None = None
    pending_confirmation: PushDrumPendingConfirmation | None = None
    last_confirmation_resolution: PushDrumConfirmationResolution | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.pending_confirmation is not None:
            payload["pending_confirmation"] = self.pending_confirmation.to_dict()
        if self.last_confirmation_resolution is not None:
            payload["last_confirmation_resolution"] = self.last_confirmation_resolution.to_dict()
        return payload


class DrumMachineRuntimeFacade:
    """Current façade over the global drum service, keyed by a future-safe instance descriptor."""

    def __init__(self, descriptor: DrumMachineInstanceDescriptor) -> None:
        self.descriptor = descriptor

    def _service(self):
        from app.services.drum_machine_service import get_drum_machine_service

        return get_drum_machine_service()

    @staticmethod
    def _coerce_pad_index(payload: dict[str, Any]) -> int:
        if "pad" not in payload:
            raise ValueError("pad is required")
        pad = int(payload["pad"])
        if pad < 0 or pad >= 16:
            raise ValueError("pad must be between 0 and 15")
        return pad

    def _resolve_pad_note_channel(self, pad: int, payload: dict[str, Any]) -> tuple[int, int]:
        if "note" in payload:
            note = int(payload["note"])
        else:
            mapping = self._service().get_midi_mapping()
            pads = list(mapping.get("pads") or [])
            pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == pad), None)
            notes = list((pad_mapping or {}).get("notes") or [])
            if not notes:
                raise ValueError(f"pad {pad} has no MIDI note mapping")
            note = int(notes[0])

        if note < 0 or note > 127:
            raise ValueError("note must be between 0 and 127")

        if "channel" in payload:
            channel = int(payload["channel"])
        else:
            mapping = self._service().get_midi_mapping()
            pads = list(mapping.get("pads") or [])
            pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == pad), None)
            channel = int((pad_mapping or {}).get("midi_channel", mapping.get("global_midi_channel", 0)))
        if channel < 0 or channel > 16:
            raise ValueError("channel must be between 0 and 16")
        return note, channel

    async def _dispatch_pad_trigger(self, payload: dict[str, Any], *, note_on: bool) -> dict[str, Any]:
        pad = self._coerce_pad_index(payload)
        velocity = int(payload.get("velocity", 127 if note_on else 0))
        if velocity < 0 or velocity > 127:
            raise ValueError("velocity must be between 0 and 127")
        note, channel = self._resolve_pad_note_channel(pad, payload)
        engine = get_audio_engine()
        injector = engine.inject_midi_note_on if note_on else engine.inject_midi_note_off
        ok = await injector(channel, note, velocity)
        if not ok:
            raise RuntimeError("audio engine rejected drum pad trigger")
        return {
            "status": "accepted",
            "command": "trigger_pad" if note_on else "stop_pad",
            "pad": pad,
            "note": note,
            "channel": channel,
            "velocity": velocity,
            **self.get_projection(),
        }

    async def _dispatch_transport_command(self, command: PushDrumCommandName, payload: dict[str, Any]) -> dict[str, Any]:
        service = self._service()
        if command == "play":
            transport = service.update_transport({"is_playing": True})
            await service.publish_transport_update()
            await service.publish_position_update()
            return {"status": "accepted", "command": command, "transport": transport, **self.get_projection()}
        if command == "stop":
            transport = service.update_transport({"is_playing": False})
            await service.publish_transport_update()
            await service.publish_position_update()
            return {"status": "accepted", "command": command, "transport": transport, **self.get_projection()}
        if command == "record":
            transport_result = await get_transport_service().dispatch("record")
            return {
                "status": "accepted",
                "command": command,
                "transport_owner_result": transport_result,
                **self.get_projection(),
            }
        raise ValueError(f"unsupported transport command: {command}")

    def get_projection(self) -> dict[str, Any]:
        service = self._service()
        state = service.get_state()
        transport = service.get_transport()
        active_kit = None
        try:
            from app.services.drum_kit_service import get_drum_kit_service

            active_kit = get_drum_kit_service().get_active_kit()
        except Exception:
            active_kit = None
        return {
            "instance": self.descriptor.to_dict(),
            "state": state,
            "transport": transport,
            "active_kit": active_kit,
            "pad_count": 16,
        }

    async def apply_command(self, command: PushDrumCommandName, payload: dict[str, Any]) -> dict[str, Any]:
        if command == "request_surface_state":
            return self.get_projection()
        if command in {"play", "stop", "record"}:
            return await self._dispatch_transport_command(command, payload)
        if command == "trigger_pad":
            return await self._dispatch_pad_trigger(payload, note_on=True)
        if command == "stop_pad":
            return await self._dispatch_pad_trigger(payload, note_on=False)
        if command in {
            "set_repeat",
            "set_quantize",
            "set_fixed_length",
            "set_64_pad_bank",
            "set_pad_velocity_mode",
            "set_loop_selector",
            "browse_pad_source",
            "load_pad_source",
            "set_step_automation",
            "clear_step",
            "set_step",
            "accept_pending_confirmation",
            "reject_pending_confirmation",
            "confirm_instance_switch",
        }:
            return {"status": "accepted", "command": command, "payload": payload, **self.get_projection()}
        raise ValueError(f"unsupported drum command: {command}")


class PushDrumSessionService:
    _confirmation_timeout_ms = 15_000

    def __init__(self) -> None:
        self._sessions: dict[str, PushDrumSessionState] = {}

    def _get_session(self, device_fingerprint: str) -> PushDrumSessionState:
        if device_fingerprint not in self._sessions:
            self._sessions[device_fingerprint] = PushDrumSessionState(device_fingerprint=device_fingerprint)
        return self._sessions[device_fingerprint]

    @staticmethod
    def _clamp_bank_index(bank_index: int, count: int) -> int:
        if count <= 0:
            return 0
        return max(0, min(bank_index, count - 1))

    @staticmethod
    def _now() -> float:
        return time()

    def _record_confirmation_resolution(
        self,
        session: PushDrumSessionState,
        pending: PushDrumPendingConfirmation,
        *,
        status: str,
        reason: str | None = None,
    ) -> None:
        session.last_confirmation_resolution = PushDrumConfirmationResolution(
            action_id=pending.action_id,
            action_type=pending.action_type,
            status=status,
            reason=reason or pending.reason,
            device_fingerprint=session.device_fingerprint,
            target_instance_id=pending.target_instance_id,
            resolved_at=self._now(),
        )

    def _clear_pending_confirmation(
        self,
        session: PushDrumSessionState,
        *,
        status: str,
        reason: str | None = None,
    ) -> None:
        pending = session.pending_confirmation
        if pending is None:
            return
        self._record_confirmation_resolution(session, pending, status=status, reason=reason)
        session.pending_confirmation = None

    def _expire_pending_confirmation(self, session: PushDrumSessionState) -> None:
        pending = session.pending_confirmation
        if pending is None:
            return
        if pending.expires_at > self._now():
            return
        self._clear_pending_confirmation(session, status="expired", reason="confirmation_timeout")

    def _build_pending_confirmation(
        self,
        session: PushDrumSessionState,
        descriptor: DrumMachineInstanceDescriptor,
        *,
        reason: str,
    ) -> PushDrumPendingConfirmation:
        created_at = self._now()
        timeout_ms = self._confirmation_timeout_ms
        return PushDrumPendingConfirmation(
            action_id=f"push-confirm-{uuid4().hex}",
            action_type="instance_switch",
            reason=reason,
            device_fingerprint=session.device_fingerprint,
            target_instance_id=descriptor.instance_id,
            target_display_name=descriptor.display_name,
            target_node_id=descriptor.node_id,
            target_node_label=descriptor.node_label,
            created_at=created_at,
            expires_at=created_at + (timeout_ms / 1000.0),
            timeout_ms=timeout_ms,
        )

    def _normalize_session_selection(
        self,
        session: PushDrumSessionState,
        instances: list[DrumMachineInstanceDescriptor],
    ) -> tuple[DrumMachineInstanceDescriptor | None, int | None, bool]:
        pending_changed = False
        before_pending_id = session.pending_confirmation.action_id if session.pending_confirmation is not None else None
        self._expire_pending_confirmation(session)
        if not instances:
            session.selected_instance_id = None
            session.bank_index = 0
            session.pending_confirmation = None
            return None, None, before_pending_id is not None

        if session.pending_confirmation is not None and not any(
            item.instance_id == session.pending_confirmation.target_instance_id for item in instances
        ):
            self._clear_pending_confirmation(session, status="expired", reason="target_unavailable")
            pending_changed = True

        selected_index = next(
            (index for index, item in enumerate(instances) if item.instance_id == session.selected_instance_id),
            None,
        )
        if selected_index is not None:
            session.bank_index = selected_index
            return instances[selected_index], selected_index, pending_changed or before_pending_id != (
                session.pending_confirmation.action_id if session.pending_confirmation is not None else None
            )

        session.selected_instance_id = None
        live_index = next((index for index, item in enumerate(instances) if item.is_live), None)
        if live_index is not None:
            session.selected_instance_id = instances[live_index].instance_id
            session.bank_index = live_index
            return instances[live_index], live_index, pending_changed or before_pending_id != (
                session.pending_confirmation.action_id if session.pending_confirmation is not None else None
            )

        session.bank_index = self._clamp_bank_index(session.bank_index, len(instances))
        return None, None, pending_changed or before_pending_id != (
            session.pending_confirmation.action_id if session.pending_confirmation is not None else None
        )

    def _build_pending_confirmation_summary(self, pending: PushDrumPendingConfirmation) -> dict[str, Any]:
        return {
            **pending.to_dict(),
            "device_identity": pending.device_fingerprint,
        }

    def get_pending_confirmation_summary(self) -> dict[str, Any]:
        for session in self._sessions.values():
            self._expire_pending_confirmation(session)
        pending = [
            session.pending_confirmation
            for session in self._sessions.values()
            if session.pending_confirmation is not None
        ]
        pending.sort(key=lambda item: item.created_at, reverse=True)
        current = pending[0] if pending else None
        return {
            "pending_confirmation": self._build_pending_confirmation_summary(current) if current is not None else None,
            "pending_count": len(pending),
        }

    async def _broadcast_pending_confirmation_summary(self) -> None:
        summary = self.get_pending_confirmation_summary()
        await ws_manager.broadcast_json(
            {
                "type": "push_surface_pending_confirmation",
                "topic": PUSH_PENDING_CONFIRMATION_TOPIC,
                "data": summary,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            topic=PUSH_PENDING_CONFIRMATION_TOPIC,
        )

    def _resolve_target_instance(
        self,
        *,
        session: PushDrumSessionState,
        instances: list[DrumMachineInstanceDescriptor],
        payload: dict[str, Any],
    ) -> DrumMachineInstanceDescriptor:
        instance_id = str(payload.get("instance_id") or "").strip()
        if instance_id:
            instance = next((item for item in instances if item.instance_id == instance_id), None)
            if instance is None:
                raise ValueError(f"unknown drum instance: {instance_id}")
            session.bank_index = next(index for index, item in enumerate(instances) if item.instance_id == instance_id)
            return instance

        if not instances:
            raise ValueError("no drum instances available")

        if "bank_index" in payload:
            session.bank_index = self._clamp_bank_index(int(payload.get("bank_index") or 0), len(instances))
        elif "bank_delta" in payload:
            delta = int(payload.get("bank_delta") or 0)
            session.bank_index = self._clamp_bank_index(session.bank_index + delta, len(instances))
        else:
            session.bank_index = self._clamp_bank_index(session.bank_index, len(instances))
        return instances[session.bank_index]

    async def _activate_instance(self, descriptor: DrumMachineInstanceDescriptor) -> bool:
        snapshot_id = descriptor.snapshot_id
        if snapshot_id is None:
            return False
        if descriptor.node_id == _local_node_id():
            from app.database import get_session
            from app.services.snapshot_service import SnapshotService

            async with get_session() as session:
                await SnapshotService(session).activate_snapshot(int(snapshot_id), triggered_by="push_surface")
            return True

        from app.services.cluster.node_visibility import get_visible_remote_nodes

        _summary, visible_nodes = get_visible_remote_nodes()
        remote_node = visible_nodes.get(descriptor.node_id)
        api_url = str(getattr(remote_node, "api_url", "") or "").rstrip("/")
        if not api_url:
            return False
        try:
            async with aiohttp.ClientSession() as client:
                async with client.post(f"{api_url}/api/snapshots/{int(snapshot_id)}/activate", timeout=5) as response:
                    return response.status == 200
        except Exception:
            return False

    @staticmethod
    def _guard_reason(
        session: PushDrumSessionState,
        instance: DrumMachineInstanceDescriptor,
        instances: list[DrumMachineInstanceDescriptor],
    ) -> str | None:
        if instance.node_id != _local_node_id():
            return "remote_instance"
        if instance.is_audible:
            return "target_already_audible"
        if any(item.is_live and item.instance_id != instance.instance_id for item in instances):
            return "replace_live_instance"
        return None

    async def get_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        instances = await get_drum_instance_registry().list_instances()
        selected, selected_index, pending_changed = self._normalize_session_selection(session, instances)
        if pending_changed:
            await self._broadcast_pending_confirmation_summary()
        projection = DrumMachineRuntimeFacade(selected).get_projection() if selected is not None else None
        return {
            "session": session.to_dict(),
            "available_instances": [instance.to_dict() for instance in instances],
            "selected_projection": projection,
            "banked_instance_id": instances[session.bank_index].instance_id if instances else None,
            "selected_instance_index": selected_index,
        }

    async def select_instance(self, device_fingerprint: str, instance_id: str, require_confirmation: bool | None = None) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        instance = await get_drum_instance_registry().get_instance(instance_id)
        if instance is None:
            raise ValueError(f"unknown drum instance: {instance_id}")
        instances = await get_drum_instance_registry().list_instances()
        guard_reason = self._guard_reason(session, instance, instances)
        if bool(require_confirmation) or guard_reason is not None:
            if session.pending_confirmation is not None:
                self._clear_pending_confirmation(session, status="superseded")
            session.pending_confirmation = self._build_pending_confirmation(
                session,
                instance,
                reason=guard_reason or "guarded_live_switch",
            )
            session.last_command = "select_instance"
            await self._broadcast_pending_confirmation_summary()
            return await self.get_surface_state(device_fingerprint)
        activated = await self._activate_instance(instance)
        if not activated:
            raise RuntimeError(f"failed to activate drum instance: {instance_id}")
        session.selected_instance_id = instance_id
        session.bank_index = next(
            (index for index, item in enumerate(instances) if item.instance_id == instance_id),
            session.bank_index,
        )
        session.pending_confirmation = None
        session.last_command = "select_instance"
        await self._broadcast_pending_confirmation_summary()
        return await self.get_surface_state(device_fingerprint)

    async def accept_pending_confirmation(self, device_fingerprint: str, action_id: str | None = None) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        self._expire_pending_confirmation(session)
        if session.pending_confirmation is not None:
            if action_id and session.pending_confirmation.action_id != action_id:
                raise ValueError(f"stale pending confirmation: {action_id}")
            descriptor = await get_drum_instance_registry().get_instance(session.pending_confirmation.target_instance_id)
            if descriptor is None or not await self._activate_instance(descriptor):
                raise RuntimeError(f"failed to activate drum instance: {session.pending_confirmation.target_instance_id}")
            session.selected_instance_id = session.pending_confirmation.target_instance_id
            session.bank_index = next(
                (index for index, item in enumerate(await get_drum_instance_registry().list_instances()) if item.instance_id == descriptor.instance_id),
                session.bank_index,
            )
            self._clear_pending_confirmation(session, status="accepted")
        session.last_command = "accept_pending_confirmation"
        await self._broadcast_pending_confirmation_summary()
        return await self.get_surface_state(device_fingerprint)

    async def reject_pending_confirmation(self, device_fingerprint: str, action_id: str | None = None) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        self._expire_pending_confirmation(session)
        if session.pending_confirmation is not None:
            if action_id and session.pending_confirmation.action_id != action_id:
                raise ValueError(f"stale pending confirmation: {action_id}")
            self._clear_pending_confirmation(session, status="rejected")
        session.last_command = "reject_pending_confirmation"
        await self._broadcast_pending_confirmation_summary()
        return await self.get_surface_state(device_fingerprint)

    async def confirm_instance_switch(self, device_fingerprint: str, action_id: str | None = None) -> dict[str, Any]:
        state = await self.accept_pending_confirmation(device_fingerprint, action_id=action_id)
        session = self._get_session(device_fingerprint)
        session.last_command = "confirm_instance_switch"
        return await self.get_surface_state(device_fingerprint)

    async def dispatch_command(self, device_fingerprint: str, command: PushDrumCommandName, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = dict(payload or {})
        session = self._get_session(device_fingerprint)
        self._expire_pending_confirmation(session)
        if command == "select_instance":
            instances = await get_drum_instance_registry().list_instances()
            target = self._resolve_target_instance(session=session, instances=instances, payload=body)
            return await self.select_instance(
                device_fingerprint,
                target.instance_id,
                require_confirmation=bool(body.get("require_confirmation", False)),
            )
        if command == "accept_pending_confirmation":
            return await self.accept_pending_confirmation(device_fingerprint, action_id=str(body.get("action_id") or "").strip() or None)
        if command == "reject_pending_confirmation":
            return await self.reject_pending_confirmation(device_fingerprint, action_id=str(body.get("action_id") or "").strip() or None)
        if command == "confirm_instance_switch":
            return await self.confirm_instance_switch(device_fingerprint, action_id=str(body.get("action_id") or "").strip() or None)

        if session.selected_instance_id is None:
            raise ValueError("no drum instance selected")
        descriptor = await get_drum_instance_registry().get_instance(session.selected_instance_id)
        if descriptor is None:
            raise ValueError(f"selected drum instance missing: {session.selected_instance_id}")
        session.last_command = command
        result = await DrumMachineRuntimeFacade(descriptor).apply_command(command, body)
        surface_state = await self.get_surface_state(device_fingerprint)
        return {"status": "ok", "command_result": result, **surface_state}


_push_drum_session_service: PushDrumSessionService | None = None


def get_push_drum_session_service() -> PushDrumSessionService:
    global _push_drum_session_service
    if _push_drum_session_service is None:
        _push_drum_session_service = PushDrumSessionService()
    return _push_drum_session_service
