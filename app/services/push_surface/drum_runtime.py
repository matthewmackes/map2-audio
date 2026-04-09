"""Typed Push drum-machine session and runtime projection helpers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from app.services.push_surface.drum_registry import DrumMachineInstanceDescriptor, get_drum_instance_registry


PushDrumCommandName = Literal[
    "select_instance",
    "confirm_instance_switch",
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
    reason: str
    target_instance_id: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PushDrumSessionState:
    device_fingerprint: str
    selected_instance_id: str | None = None
    bank_index: int = 0
    last_command: str | None = None
    pending_confirmation: PushDrumPendingConfirmation | None = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.pending_confirmation is not None:
            payload["pending_confirmation"] = self.pending_confirmation.to_dict()
        return payload


class DrumMachineRuntimeFacade:
    """Current façade over the global drum service, keyed by a future-safe instance descriptor."""

    def __init__(self, descriptor: DrumMachineInstanceDescriptor) -> None:
        self.descriptor = descriptor

    def _service(self):
        from app.services.drum_machine_service import get_drum_machine_service

        return get_drum_machine_service()

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
            "trigger_pad",
            "stop_pad",
            "confirm_instance_switch",
        }:
            return {"status": "accepted", "command": command, "payload": payload, **self.get_projection()}
        raise ValueError(f"unsupported drum command: {command}")


class PushDrumSessionService:
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

    def _normalize_session_selection(
        self,
        session: PushDrumSessionState,
        instances: list[DrumMachineInstanceDescriptor],
    ) -> tuple[DrumMachineInstanceDescriptor | None, int | None]:
        if not instances:
            session.selected_instance_id = None
            session.bank_index = 0
            session.pending_confirmation = None
            return None, None

        selected_index = next(
            (index for index, item in enumerate(instances) if item.instance_id == session.selected_instance_id),
            None,
        )
        if selected_index is not None:
            session.bank_index = selected_index
            return instances[selected_index], selected_index

        session.selected_instance_id = None
        live_index = next((index for index, item in enumerate(instances) if item.is_live), None)
        if live_index is not None:
            session.selected_instance_id = instances[live_index].instance_id
            session.bank_index = live_index
            return instances[live_index], live_index

        session.bank_index = self._clamp_bank_index(session.bank_index, len(instances))
        return None, None

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

    async def get_surface_state(self, device_fingerprint: str) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        instances = await get_drum_instance_registry().list_instances()
        selected, selected_index = self._normalize_session_selection(session, instances)
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
        needs_confirmation = bool(require_confirmation) or (instance.is_live and session.selected_instance_id not in {None, instance_id})
        if needs_confirmation:
            session.pending_confirmation = PushDrumPendingConfirmation(reason="guarded_live_switch", target_instance_id=instance_id)
            session.last_command = "select_instance"
            return await self.get_surface_state(device_fingerprint)
        session.selected_instance_id = instance_id
        instances = await get_drum_instance_registry().list_instances()
        session.bank_index = next(
            (index for index, item in enumerate(instances) if item.instance_id == instance_id),
            session.bank_index,
        )
        session.pending_confirmation = None
        session.last_command = "select_instance"
        return await self.get_surface_state(device_fingerprint)

    async def confirm_instance_switch(self, device_fingerprint: str) -> dict[str, Any]:
        session = self._get_session(device_fingerprint)
        if session.pending_confirmation is not None:
            session.selected_instance_id = session.pending_confirmation.target_instance_id
        session.pending_confirmation = None
        session.last_command = "confirm_instance_switch"
        return await self.get_surface_state(device_fingerprint)

    async def dispatch_command(self, device_fingerprint: str, command: PushDrumCommandName, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        body = dict(payload or {})
        session = self._get_session(device_fingerprint)
        if command == "select_instance":
            instances = await get_drum_instance_registry().list_instances()
            target = self._resolve_target_instance(session=session, instances=instances, payload=body)
            return await self.select_instance(
                device_fingerprint,
                target.instance_id,
                require_confirmation=bool(body.get("require_confirmation", False)),
            )
        if command == "confirm_instance_switch":
            return await self.confirm_instance_switch(device_fingerprint)

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
