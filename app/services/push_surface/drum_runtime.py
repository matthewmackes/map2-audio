"""Typed Push drum-machine session and runtime projection helpers."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from dataclasses import asdict, dataclass
from time import time
from typing import Any, Literal
from uuid import uuid4

import aiohttp

from app.services.juce_engine_service import get_audio_engine
from app.services.push_surface.drum_browser import get_push_drum_browser_service
from app.services.push_surface.drum_projection import build_push_drum_projection
from app.services.push_surface.drum_registry import (
    DrumMachineInstanceDescriptor,
    _local_node_id,
    get_drum_instance_registry,
)
from app.services.transport_service import get_transport_service
from app.services.websocket_manager import ws_manager


PUSH_PENDING_CONFIRMATION_TOPIC = "push_surface:pending_confirmation"
PUSH_DRUM_64_PAD_BANK_COUNT = 4
PUSH_DRUM_PADS_PER_BANK = 16
PUSH_DRUM_TOTAL_PAD_COUNT = PUSH_DRUM_64_PAD_BANK_COUNT * PUSH_DRUM_PADS_PER_BANK
PUSH_DRUM_16_VELOCITY_LEVELS = (
    8,
    16,
    24,
    32,
    40,
    48,
    56,
    64,
    72,
    80,
    88,
    96,
    104,
    112,
    120,
    127,
)
PUSH_DRUM_FIXED_LENGTH_PRESETS: dict[str, dict[str, Any]] = {
    "1/2": {"bars": 0.5, "beats": 2, "steps": 8},
    "1": {"bars": 1, "beats": 4, "steps": 16},
    "2": {"bars": 2, "beats": 8, "steps": 32},
    "4": {"bars": 4, "beats": 16, "steps": 64},
    "8": {"bars": 8, "beats": 32, "steps": 128},
    "16": {"bars": 16, "beats": 64, "steps": 256},
    "32": {"bars": 32, "beats": 128, "steps": 512},
}
PUSH_DRUM_REPEAT_RATES: dict[str, dict[str, Any]] = {
    "1/4": {"beats": 1.0},
    "1/8": {"beats": 0.5},
    "1/16": {"beats": 0.25},
    "1/32": {"beats": 0.125},
    "triplet": {"beats": 1.0 / 3.0},
}
PUSH_DRUM_QUANTIZE_GRIDS: dict[str, dict[str, Any]] = {
    "1/4": {"step_interval": 4},
    "1/8": {"step_interval": 2},
    "1/16": {"step_interval": 1},
    "1/32": {"step_interval": 1},
}


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
    pad_bank_index: int = 0
    pad_velocity_mode_enabled: bool = False
    pad_velocity_source_pad: int | None = None
    repeat_enabled: bool = False
    repeat_rate: str | None = None
    quantize_enabled: bool = False
    quantize_grid: str | None = None
    quantize_strength: int = 100
    fixed_length_enabled: bool = False
    fixed_length_preset: str | None = None
    step_grid_page: int = 0
    selected_step_index: int | None = None
    selected_step_instrument: int | None = None
    loop_selector_enabled: bool = False
    loop_selector_page: int = 0
    loop_start_step: int | None = None
    loop_end_step: int | None = None
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

    def get_position(self) -> dict[str, Any]:
        getter = getattr(self._service(), "get_position", None)
        if callable(getter):
            position = getter()
            if isinstance(position, dict):
                return dict(position)
        return {"pattern_id": 0, "pattern": 0, "step": 0, "bar": 1, "beat": 1}

    @staticmethod
    def _coerce_pad_index(payload: dict[str, Any]) -> int:
        if "pad" not in payload:
            raise ValueError("pad is required")
        pad = int(payload["pad"])
        if pad < 0 or pad >= PUSH_DRUM_PADS_PER_BANK:
            raise ValueError("pad must be between 0 and 15")
        return pad

    @staticmethod
    def _resolve_absolute_pad_index(physical_pad: int, session: PushDrumSessionState) -> int:
        return (session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK) + physical_pad

    def _resolve_pad_note_channel(self, pad: int, payload: dict[str, Any]) -> tuple[int, int]:
        template_pad = pad % PUSH_DRUM_PADS_PER_BANK
        bank_offset = (pad // PUSH_DRUM_PADS_PER_BANK) * PUSH_DRUM_PADS_PER_BANK
        if "note" in payload:
            note = int(payload["note"])
        else:
            mapping = self._service().get_midi_mapping()
            pads = list(mapping.get("pads") or [])
            pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == pad), None)
            if pad_mapping is None:
                pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == template_pad), None)
            notes = list((pad_mapping or {}).get("notes") or [])
            if not notes:
                raise ValueError(f"pad {pad} has no MIDI note mapping")
            note = int(notes[0]) + bank_offset

        if note < 0 or note > 127:
            raise ValueError("note must be between 0 and 127")

        if "channel" in payload:
            channel = int(payload["channel"])
        else:
            mapping = self._service().get_midi_mapping()
            pads = list(mapping.get("pads") or [])
            pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == pad), None)
            if pad_mapping is None:
                pad_mapping = next((item for item in pads if int(item.get("pad", -1)) == template_pad), None)
            channel = int((pad_mapping or {}).get("midi_channel", mapping.get("global_midi_channel", 0)))
        if channel < 0 or channel > 16:
            raise ValueError("channel must be between 0 and 16")
        return note, channel

    async def _dispatch_pad_trigger(
        self,
        payload: dict[str, Any],
        *,
        note_on: bool,
        session: PushDrumSessionState,
    ) -> dict[str, Any]:
        pad = self._coerce_pad_index(payload)
        resolved_pad = self._resolve_absolute_pad_index(pad, session)
        source_pad = resolved_pad
        velocity = int(payload.get("velocity", 127 if note_on else 0))
        velocity_mode_velocity = None
        if note_on and session.pad_velocity_mode_enabled:
            source_pad = session.pad_velocity_source_pad if session.pad_velocity_source_pad is not None else resolved_pad
            velocity_mode_velocity = PUSH_DRUM_16_VELOCITY_LEVELS[pad]
            velocity = int(payload.get("velocity", velocity_mode_velocity))
        if velocity < 0 or velocity > 127:
            raise ValueError("velocity must be between 0 and 127")
        note, channel = self._resolve_pad_note_channel(source_pad, payload)
        engine = get_audio_engine()
        injector = engine.inject_midi_note_on if note_on else engine.inject_midi_note_off
        ok = await injector(channel, note, velocity)
        if not ok:
            raise RuntimeError("audio engine rejected drum pad trigger")
        return {
            "status": "accepted",
            "command": "trigger_pad" if note_on else "stop_pad",
            "pad": pad,
            "resolved_pad": resolved_pad,
            "source_pad": source_pad,
            "note": note,
            "channel": channel,
            "velocity": velocity,
            "velocity_mode_velocity": velocity_mode_velocity,
            **self.get_projection(),
        }

    async def _dispatch_transport_command(self, command: PushDrumCommandName, payload: dict[str, Any]) -> dict[str, Any]:
        service = self._service()
        if command == "play":
            transport = service.update_transport({"is_playing": True})
            await service.publish_transport_update()
            await service.publish_position_update()
            return {**self.get_projection(), "status": "accepted", "command": command, "transport": transport}
        if command == "stop":
            transport = service.update_transport({"is_playing": False})
            await service.publish_transport_update()
            await service.publish_position_update()
            return {**self.get_projection(), "status": "accepted", "command": command, "transport": transport}
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
        position = self.get_position()
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
            "position": position,
            "active_kit": active_kit,
            "pad_count": PUSH_DRUM_PADS_PER_BANK,
            "total_pad_count": PUSH_DRUM_TOTAL_PAD_COUNT,
        }

    async def apply_command(
        self,
        command: PushDrumCommandName,
        payload: dict[str, Any],
        *,
        session: PushDrumSessionState | None = None,
    ) -> dict[str, Any]:
        runtime_session = session or PushDrumSessionState(device_fingerprint="facade-direct")
        if command == "request_surface_state":
            return self.get_projection()
        if command in {"play", "stop", "record"}:
            return await self._dispatch_transport_command(command, payload)
        if command == "trigger_pad":
            return await self._dispatch_pad_trigger(payload, note_on=True, session=runtime_session)
        if command == "stop_pad":
            return await self._dispatch_pad_trigger(payload, note_on=False, session=runtime_session)
        if command == "browse_pad_source":
            return {
                "status": "accepted",
                "command": command,
                "browser": get_push_drum_browser_service().browse(payload),
                **self.get_projection(),
            }
        if command == "load_pad_source":
            return {
                "status": "accepted",
                "command": command,
                "load_result": get_push_drum_browser_service().load(payload),
                **self.get_projection(),
            }
        if command in {
            "set_repeat",
            "set_quantize",
            "set_fixed_length",
            "set_64_pad_bank",
            "set_pad_velocity_mode",
            "set_loop_selector",
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
        self._repeat_tasks: dict[tuple[str, int], asyncio.Task[Any]] = {}

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
    def _clamp_pad_bank_index(bank_index: int) -> int:
        return max(0, min(bank_index, PUSH_DRUM_64_PAD_BANK_COUNT - 1))

    @staticmethod
    def _normalize_fixed_length_preset(value: Any) -> str:
        preset = str(value or "").strip()
        if not preset:
            raise ValueError("fixed length preset is required")
        if preset not in PUSH_DRUM_FIXED_LENGTH_PRESETS:
            raise ValueError(f"unsupported fixed length preset: {preset}")
        return preset

    @staticmethod
    def _build_fixed_length_state(session: PushDrumSessionState) -> dict[str, Any]:
        preset = session.fixed_length_preset
        preset_config = PUSH_DRUM_FIXED_LENGTH_PRESETS.get(preset or "")
        return {
            "enabled": session.fixed_length_enabled,
            "preset": preset,
            "bars": preset_config.get("bars") if preset_config is not None else None,
            "beats": preset_config.get("beats") if preset_config is not None else None,
            "steps": preset_config.get("steps") if preset_config is not None else None,
            "available_presets": list(PUSH_DRUM_FIXED_LENGTH_PRESETS.keys()),
        }

    @staticmethod
    def _normalize_repeat_rate(value: Any) -> str:
        rate = str(value or "").strip()
        if not rate:
            raise ValueError("repeat rate is required")
        if rate not in PUSH_DRUM_REPEAT_RATES:
            raise ValueError(f"unsupported repeat rate: {rate}")
        return rate

    @staticmethod
    def _normalize_quantize_grid(value: Any) -> str:
        grid = str(value or "").strip()
        if not grid:
            raise ValueError("quantize grid is required")
        if grid not in PUSH_DRUM_QUANTIZE_GRIDS:
            raise ValueError(f"unsupported quantize grid: {grid}")
        return grid

    @staticmethod
    def _repeat_interval_seconds(rate: str, bpm: float) -> float:
        beats = float(PUSH_DRUM_REPEAT_RATES[rate]["beats"])
        clamped_bpm = max(1.0, float(bpm or 120.0))
        return max(0.01, (60.0 / clamped_bpm) * beats)

    @staticmethod
    def _loop_page_to_step(page: int, pad: int) -> int:
        return max(0, min(63, (page * PUSH_DRUM_PADS_PER_BANK) + pad))

    @staticmethod
    def _normalize_loop_page(value: Any) -> int:
        return max(0, min(3, int(value or 0)))

    @staticmethod
    def _normalize_step_grid_page(value: Any) -> int:
        return max(0, min(3, int(value or 0)))

    def _build_pad_grid(self, session: PushDrumSessionState) -> list[dict[str, Any]]:
        source_pad = session.pad_velocity_source_pad
        source_pad_bank = (source_pad // PUSH_DRUM_PADS_PER_BANK) if source_pad is not None else None
        velocity_enabled = session.pad_velocity_mode_enabled
        return [
            {
                "physical_pad": physical_pad,
                "logical_pad": (session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK) + physical_pad,
                "velocity": PUSH_DRUM_16_VELOCITY_LEVELS[physical_pad] if velocity_enabled else None,
                "velocity_mode_active": velocity_enabled,
                "velocity_mode_source_pad": source_pad,
                "is_velocity_mode_source": velocity_enabled
                and source_pad_bank == session.pad_bank_index
                and source_pad is not None
                and (source_pad % PUSH_DRUM_PADS_PER_BANK) == physical_pad,
            }
            for physical_pad in range(PUSH_DRUM_PADS_PER_BANK)
        ]

    def _build_surface_modes(self, session: PushDrumSessionState) -> dict[str, Any]:
        return {
            "pad_velocity_mode": {
                "enabled": session.pad_velocity_mode_enabled,
                "source_pad": session.pad_velocity_source_pad,
                "velocity_levels": list(PUSH_DRUM_16_VELOCITY_LEVELS),
            },
            "repeat": {
                "enabled": session.repeat_enabled,
                "rate": session.repeat_rate,
                "available_rates": list(PUSH_DRUM_REPEAT_RATES.keys()),
            },
            "quantize": {
                "enabled": session.quantize_enabled,
                "grid": session.quantize_grid,
                "strength": session.quantize_strength,
                "available_grids": list(PUSH_DRUM_QUANTIZE_GRIDS.keys()),
            },
            "pad_bank": {
                "index": session.pad_bank_index,
                "count": PUSH_DRUM_64_PAD_BANK_COUNT,
                "pads_per_bank": PUSH_DRUM_PADS_PER_BANK,
                "logical_pad_start": session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK,
                "logical_pad_end": (session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK) + (PUSH_DRUM_PADS_PER_BANK - 1),
            },
            "fixed_length": self._build_fixed_length_state(session),
            "step_grid": {
                "page": session.step_grid_page,
                "selected_step_index": session.selected_step_index,
                "selected_step_instrument": session.selected_step_instrument,
            },
            "loop_selector": {
                "enabled": session.loop_selector_enabled,
                "page": session.loop_selector_page,
                "start_step": session.loop_start_step,
                "end_step": session.loop_end_step,
                "length_steps": (
                    (session.loop_end_step - session.loop_start_step + 1)
                    if session.loop_start_step is not None and session.loop_end_step is not None
                    else None
                ),
            },
        }

    def _build_drum_projection(
        self,
        *,
        descriptor: DrumMachineInstanceDescriptor | None,
        session: PushDrumSessionState,
    ) -> dict[str, Any] | None:
        if descriptor is None:
            return None
        projection = DrumMachineRuntimeFacade(descriptor).get_projection()
        from app.services.drum_sequencer_service import get_drum_sequencer_service

        position = dict(projection.get("position") or {})
        pattern_id = int(position.get("pattern_id", position.get("pattern", 0)))
        try:
            pattern = get_drum_sequencer_service().get_pattern(pattern_id)
        except Exception:
            pattern = None
        return build_push_drum_projection(
            descriptor=descriptor,
            state=dict(projection.get("state") or {}),
            transport=dict(projection.get("transport") or {}),
            position=position,
            active_kit=projection.get("active_kit") if isinstance(projection.get("active_kit"), dict) else None,
            session=session,
            pattern=pattern if isinstance(pattern, dict) else None,
        )

    def _set_pad_velocity_mode(self, session: PushDrumSessionState, payload: dict[str, Any]) -> dict[str, Any]:
        enabled = bool(payload.get("enabled", True))
        if enabled:
            source_pad = payload.get("source_pad", payload.get("pad", session.pad_velocity_source_pad))
            if source_pad is None:
                source_pad = session.pad_bank_index * PUSH_DRUM_PADS_PER_BANK
            source_pad_int = int(source_pad)
            if source_pad_int < 0 or source_pad_int >= PUSH_DRUM_TOTAL_PAD_COUNT:
                raise ValueError("source_pad must be between 0 and 63")
            session.pad_velocity_mode_enabled = True
            session.pad_velocity_source_pad = source_pad_int
        else:
            session.pad_velocity_mode_enabled = False
            session.pad_velocity_source_pad = None
        return {
            "status": "accepted",
            "command": "set_pad_velocity_mode",
            "pad_velocity_mode": self._build_surface_modes(session)["pad_velocity_mode"],
            "pad_grid": self._build_pad_grid(session),
        }

    def _set_64_pad_bank(self, session: PushDrumSessionState, payload: dict[str, Any]) -> dict[str, Any]:
        if "bank_index" in payload:
            session.pad_bank_index = self._clamp_pad_bank_index(int(payload.get("bank_index") or 0))
        elif "bank_delta" in payload:
            session.pad_bank_index = self._clamp_pad_bank_index(session.pad_bank_index + int(payload.get("bank_delta") or 0))
        else:
            session.pad_bank_index = self._clamp_pad_bank_index(int(payload.get("bank") or session.pad_bank_index))
        return {
            "status": "accepted",
            "command": "set_64_pad_bank",
            "pad_bank": self._build_surface_modes(session)["pad_bank"],
            "pad_grid": self._build_pad_grid(session),
        }

    def _set_fixed_length(self, session: PushDrumSessionState, payload: dict[str, Any]) -> dict[str, Any]:
        enabled = bool(payload.get("enabled", True))
        if enabled:
            session.fixed_length_enabled = True
            session.fixed_length_preset = self._normalize_fixed_length_preset(payload.get("preset"))
        else:
            session.fixed_length_enabled = False
            session.fixed_length_preset = None
        return {
            "status": "accepted",
            "command": "set_fixed_length",
            "fixed_length": self._build_fixed_length_state(session),
        }

    def _set_repeat(self, session: PushDrumSessionState, payload: dict[str, Any]) -> dict[str, Any]:
        enabled = bool(payload.get("enabled", True))
        if enabled:
            session.repeat_enabled = True
            session.repeat_rate = self._normalize_repeat_rate(payload.get("rate"))
        else:
            session.repeat_enabled = False
            session.repeat_rate = None
        return {
            "status": "accepted",
            "command": "set_repeat",
            "repeat": self._build_surface_modes(session)["repeat"],
        }

    def _set_quantize(self, session: PushDrumSessionState, payload: dict[str, Any]) -> dict[str, Any]:
        enabled = bool(payload.get("enabled", True))
        if enabled:
            session.quantize_enabled = True
            session.quantize_grid = self._normalize_quantize_grid(payload.get("grid"))
            session.quantize_strength = max(0, min(100, int(payload.get("strength", session.quantize_strength or 100))))
        else:
            session.quantize_enabled = False
            session.quantize_grid = None
            session.quantize_strength = 100
        return {
            "status": "accepted",
            "command": "set_quantize",
            "quantize": self._build_surface_modes(session)["quantize"],
        }

    def _resolve_current_pattern_id(self, descriptor: DrumMachineInstanceDescriptor) -> int:
        service = DrumMachineRuntimeFacade(descriptor)._service()
        position_getter = getattr(service, "get_position", None)
        if callable(position_getter):
            position = position_getter()
            if isinstance(position, dict):
                return int(position.get("pattern_id", position.get("pattern", 0)))
        state_getter = getattr(service, "get_state", None)
        if callable(state_getter):
            state = state_getter()
            if isinstance(state, dict):
                return int(state.get("pattern", 0))
        return 0

    def _resolve_step_grid_instrument(self, session: PushDrumSessionState, payload: dict[str, Any]) -> int:
        instrument = payload.get("instrument")
        if instrument is None:
            instrument = payload.get("source_pad")
        if instrument is None:
            instrument = session.selected_step_instrument
        if instrument is None:
            instrument = session.pad_velocity_source_pad if session.pad_velocity_source_pad is not None else 0
        instrument_index = int(instrument) % PUSH_DRUM_PADS_PER_BANK
        return max(0, min(PUSH_DRUM_PADS_PER_BANK - 1, instrument_index))

    def _resolve_step_index(self, session: PushDrumSessionState, payload: dict[str, Any]) -> int:
        if "step" in payload:
            return max(0, min(63, int(payload.get("step") or 0)))
        page = self._normalize_step_grid_page(payload.get("page", session.step_grid_page))
        pad = int(payload.get("pad", payload.get("grid_pad", 0)) or 0)
        return max(0, min(63, (page * PUSH_DRUM_PADS_PER_BANK) + max(0, min(15, pad))))

    def _set_step(
        self,
        session: PushDrumSessionState,
        descriptor: DrumMachineInstanceDescriptor,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.drum_sequencer_service import get_drum_sequencer_service

        session.step_grid_page = self._normalize_step_grid_page(payload.get("page", session.step_grid_page))
        pattern_id = self._resolve_current_pattern_id(descriptor)
        sequencer = get_drum_sequencer_service()
        instrument = self._resolve_step_grid_instrument(session, payload)
        step_index = self._resolve_step_index(session, payload)
        current_step = sequencer.get_step(pattern_id, instrument, step_index)
        enabled = payload.get("enabled")
        if enabled is None:
            enabled = int(current_step.get("velocity", 0)) <= 0 and not bool(current_step.get("accent", False))
        if bool(enabled):
            velocity = int(payload.get("velocity", current_step.get("velocity", 100) or 100))
            pattern = sequencer.update_step(
                pattern_id,
                instrument,
                step_index,
                velocity=velocity,
                accent=bool(payload.get("accent", current_step.get("accent", False))),
            )
        else:
            pattern = sequencer.clear_step(pattern_id, instrument, step_index)
        session.selected_step_index = step_index
        session.selected_step_instrument = instrument
        return {
            "status": "accepted",
            "command": "set_step",
            "pattern_id": pattern_id,
            "instrument": instrument,
            "step": step_index,
            "step_page": session.step_grid_page,
            "active": bool(enabled),
            "pattern": pattern,
        }

    def _clear_step(
        self,
        session: PushDrumSessionState,
        descriptor: DrumMachineInstanceDescriptor,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.drum_sequencer_service import get_drum_sequencer_service

        session.step_grid_page = self._normalize_step_grid_page(payload.get("page", session.step_grid_page))
        pattern_id = self._resolve_current_pattern_id(descriptor)
        instrument = self._resolve_step_grid_instrument(session, payload)
        step_index = self._resolve_step_index(session, payload)
        pattern = get_drum_sequencer_service().clear_step(pattern_id, instrument, step_index)
        session.selected_step_index = step_index
        session.selected_step_instrument = instrument
        return {
            "status": "accepted",
            "command": "clear_step",
            "pattern_id": pattern_id,
            "instrument": instrument,
            "step": step_index,
            "step_page": session.step_grid_page,
            "pattern": pattern,
        }

    def _set_step_automation(
        self,
        session: PushDrumSessionState,
        descriptor: DrumMachineInstanceDescriptor,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.drum_sequencer_service import get_drum_sequencer_service

        session.step_grid_page = self._normalize_step_grid_page(payload.get("page", session.step_grid_page))
        pattern_id = self._resolve_current_pattern_id(descriptor)
        sequencer = get_drum_sequencer_service()
        instrument = self._resolve_step_grid_instrument(session, payload)
        step_index = self._resolve_step_index(session, payload) if ("step" in payload or "pad" in payload or "grid_pad" in payload) else session.selected_step_index
        if step_index is None:
            raise ValueError("step selection is required before editing automation")
        current_step = sequencer.get_step(pattern_id, instrument, step_index)
        changes: dict[str, Any] = {}
        if "velocity" in payload:
            changes["velocity"] = int(payload["velocity"])
        elif int(current_step.get("velocity", 0)) <= 0:
            changes["velocity"] = 100
        if "pitch" in payload:
            changes["lock_pitch"] = None if payload["pitch"] is None else float(payload["pitch"])
        if "probability" in payload:
            changes["probability"] = float(payload["probability"])
        if "length" in payload:
            changes["gate_length"] = None if payload["length"] is None else float(payload["length"])
        if "micro_timing" in payload:
            changes["micro_timing"] = int(payload["micro_timing"])
        if "accent" in payload:
            changes["accent"] = bool(payload["accent"])
        pattern = sequencer.update_step(pattern_id, instrument, step_index, **changes)
        session.selected_step_index = step_index
        session.selected_step_instrument = instrument
        return {
            "status": "accepted",
            "command": "set_step_automation",
            "pattern_id": pattern_id,
            "instrument": instrument,
            "step": step_index,
            "step_page": session.step_grid_page,
            "automation": {
                "velocity": changes.get("velocity"),
                "pitch": changes.get("lock_pitch"),
                "length": changes.get("gate_length"),
                "probability": changes.get("probability"),
                "micro_timing": changes.get("micro_timing"),
            },
            "pattern": pattern,
        }

    def _set_loop_selector(self, session: PushDrumSessionState, descriptor: DrumMachineInstanceDescriptor, payload: dict[str, Any]) -> dict[str, Any]:
        from app.services.drum_sequencer_service import get_drum_sequencer_service

        enabled = bool(payload.get("enabled", True))
        session.loop_selector_page = self._normalize_loop_page(payload.get("page", session.loop_selector_page))
        pattern_id = self._resolve_current_pattern_id(descriptor)
        sequencer = get_drum_sequencer_service()

        if not enabled:
            session.loop_selector_enabled = False
            session.loop_start_step = None
            session.loop_end_step = None
            return {
                "status": "accepted",
                "command": "set_loop_selector",
                "loop_selector": self._build_surface_modes(session)["loop_selector"],
            }

        session.loop_selector_enabled = True
        action = str(payload.get("action") or "set_range").strip()
        loop_result: dict[str, Any]
        if action == "duplicate":
            loop_result = sequencer.duplicate_loop_region(pattern_id)
            region = loop_result["loop_region"]
        elif action == "halve":
            region = sequencer.halve_loop_region(pattern_id)
            loop_result = {"loop_region": region}
        else:
            start_pad = int(payload.get("start_pad", payload.get("pad_start", 0)))
            end_pad = int(payload.get("end_pad", payload.get("pad_end", start_pad)))
            region = sequencer.set_loop_region(
                pattern_id,
                self._loop_page_to_step(session.loop_selector_page, start_pad),
                self._loop_page_to_step(session.loop_selector_page, end_pad),
            )
            loop_result = {"loop_region": region}

        session.loop_start_step = int(region["start_step"])
        session.loop_end_step = int(region["end_step"])
        return {
            "status": "accepted",
            "command": "set_loop_selector",
            "loop_selector": self._build_surface_modes(session)["loop_selector"],
            "pattern_id": pattern_id,
            **loop_result,
        }

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

    async def _repeat_pad_loop(
        self,
        *,
        device_fingerprint: str,
        descriptor: DrumMachineInstanceDescriptor,
        payload: dict[str, Any],
        session: PushDrumSessionState,
        pad: int,
    ) -> None:
        repeat_key = (device_fingerprint, pad)
        facade = DrumMachineRuntimeFacade(descriptor)
        try:
            while self._repeat_tasks.get(repeat_key) is asyncio.current_task():
                if not session.repeat_enabled or not session.repeat_rate:
                    break
                transport = facade._service().get_transport()
                bpm = float((transport or {}).get("bpm", 120) if isinstance(transport, dict) else 120)
                interval = self._repeat_interval_seconds(session.repeat_rate, bpm)
                await asyncio.sleep(interval)
                if self._repeat_tasks.get(repeat_key) is not asyncio.current_task():
                    break
                await facade.apply_command("trigger_pad", payload, session=session)
                await asyncio.sleep(min(0.05, interval / 2.0))
                if self._repeat_tasks.get(repeat_key) is not asyncio.current_task():
                    break
                await facade.apply_command("stop_pad", {"pad": pad}, session=session)
        except asyncio.CancelledError:
            raise
        finally:
            if self._repeat_tasks.get(repeat_key) is asyncio.current_task():
                self._repeat_tasks.pop(repeat_key, None)

    def _start_repeat_task(
        self,
        *,
        device_fingerprint: str,
        descriptor: DrumMachineInstanceDescriptor,
        payload: dict[str, Any],
        session: PushDrumSessionState,
        pad: int,
    ) -> None:
        self._stop_repeat_task(device_fingerprint=device_fingerprint, pad=pad)
        self._repeat_tasks[(device_fingerprint, pad)] = asyncio.create_task(
            self._repeat_pad_loop(
                device_fingerprint=device_fingerprint,
                descriptor=descriptor,
                payload=dict(payload),
                session=session,
                pad=pad,
            ),
            name=f"push_drum_repeat_{device_fingerprint}_{pad}",
        )

    def _stop_repeat_task(self, *, device_fingerprint: str, pad: int) -> None:
        task = self._repeat_tasks.pop((device_fingerprint, pad), None)
        if task is not None:
            task.cancel()

    def _capture_quantized_step(
        self,
        *,
        descriptor: DrumMachineInstanceDescriptor,
        session: PushDrumSessionState,
        command_result: dict[str, Any],
    ) -> dict[str, Any] | None:
        if not session.quantize_enabled or not session.quantize_grid:
            return None

        from app.services.drum_sequencer_service import get_drum_sequencer_service

        service = DrumMachineRuntimeFacade(descriptor)._service()
        position_getter = getattr(service, "get_position", None)
        position = position_getter() if callable(position_getter) else {}
        if not isinstance(position, dict):
            position = {}
        pattern_id = int(position.get("pattern_id", position.get("pattern", 0)))
        raw_step = max(0, min(63, int(position.get("step", 0))))
        interval = int(PUSH_DRUM_QUANTIZE_GRIDS[session.quantize_grid]["step_interval"])
        quantized_target = round(raw_step / interval) * interval
        blended_step = raw_step + ((quantized_target - raw_step) * (session.quantize_strength / 100.0))
        step_index = max(0, min(63, int(round(blended_step))))
        instrument = int(command_result.get("source_pad", command_result.get("resolved_pad", 0))) % PUSH_DRUM_PADS_PER_BANK
        velocity = int(command_result.get("velocity", 127))
        pattern = get_drum_sequencer_service().set_step(pattern_id, instrument, step_index, velocity, False)
        return {
            "pattern_id": pattern_id,
            "instrument": instrument,
            "captured_step": raw_step,
            "quantized_step": step_index,
            "grid": session.quantize_grid,
            "strength": session.quantize_strength,
            "pattern": pattern,
        }

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
        drum_projection = self._build_drum_projection(descriptor=selected, session=session)
        return {
            "session": session.to_dict(),
            "available_instances": [instance.to_dict() for instance in instances],
            "selected_projection": projection,
            "drum_projection": drum_projection,
            "banked_instance_id": instances[session.bank_index].instance_id if instances else None,
            "selected_instance_index": selected_index,
            "surface_modes": self._build_surface_modes(session),
            "pad_grid": self._build_pad_grid(session),
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
        if command == "set_pad_velocity_mode":
            session.last_command = command
            command_result = self._set_pad_velocity_mode(session, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_64_pad_bank":
            session.last_command = command
            command_result = self._set_64_pad_bank(session, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_fixed_length":
            session.last_command = command
            command_result = self._set_fixed_length(session, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_repeat":
            session.last_command = command
            command_result = self._set_repeat(session, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_quantize":
            session.last_command = command
            command_result = self._set_quantize(session, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}

        if session.selected_instance_id is None:
            raise ValueError("no drum instance selected")
        descriptor = await get_drum_instance_registry().get_instance(session.selected_instance_id)
        if descriptor is None:
            raise ValueError(f"selected drum instance missing: {session.selected_instance_id}")
        if command == "set_loop_selector":
            session.last_command = command
            command_result = self._set_loop_selector(session, descriptor, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_step":
            session.last_command = command
            command_result = self._set_step(session, descriptor, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "clear_step":
            session.last_command = command
            command_result = self._clear_step(session, descriptor, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        if command == "set_step_automation":
            session.last_command = command
            command_result = self._set_step_automation(session, descriptor, body)
            surface_state = await self.get_surface_state(device_fingerprint)
            return {"status": "ok", "command_result": command_result, **surface_state}
        session.last_command = command
        result = await DrumMachineRuntimeFacade(descriptor).apply_command(command, body, session=session)
        if command == "trigger_pad" and session.quantize_enabled:
            quantized = self._capture_quantized_step(descriptor=descriptor, session=session, command_result=result)
            if quantized is not None:
                result["quantized_capture"] = quantized
        if command == "trigger_pad" and session.repeat_enabled and session.repeat_rate:
            self._start_repeat_task(
                device_fingerprint=device_fingerprint,
                descriptor=descriptor,
                payload=body,
                session=session,
                pad=int(result["pad"]),
            )
        if command == "stop_pad":
            self._stop_repeat_task(device_fingerprint=device_fingerprint, pad=int(result["pad"]))
        surface_state = await self.get_surface_state(device_fingerprint)
        return {"status": "ok", "command_result": result, **surface_state}


_push_drum_session_service: PushDrumSessionService | None = None


def get_push_drum_session_service() -> PushDrumSessionService:
    global _push_drum_session_service
    if _push_drum_session_service is None:
        _push_drum_session_service = PushDrumSessionService()
    return _push_drum_session_service
