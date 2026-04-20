from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.database import get_session
from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.midi_device_profiles import device_profile_service
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.transport_service import get_transport_service
from app.utils.singleton import Singleton

from .daemon import MidiCommanderSurfaceDaemon
from .protocol import (
    MIDI_COMMANDER_PROFILE_ID,
    build_default_layout,
    detect_midi_commander_variant,
    is_midi_commander_port_name,
    parse_midi_commander_message,
)

logger = logging.getLogger(__name__)


def _coerce_int(value: Any, *, minimum: int, maximum: int) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, parsed))


def _coerce_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _normalize_control_entry(entry: dict[str, Any], *, fallback: dict[str, Any]) -> dict[str, Any]:
    assignment = entry.get("assignment")
    return {
        **dict(fallback),
        **dict(entry),
        "control_id": str(entry.get("control_id") or fallback.get("control_id") or "").strip() or str(fallback["control_id"]),
        "control_type": str(entry.get("control_type") or fallback.get("control_type") or "button").strip().lower(),
        "label": str(entry.get("label") or fallback.get("label") or fallback["control_id"]),
        "message_type": str(entry.get("message_type") or fallback.get("message_type") or "").strip().lower(),
        "channel": _coerce_int(entry.get("channel", fallback.get("channel", 1)), minimum=1, maximum=16) or 1,
        "controller": _coerce_int(entry.get("controller", fallback.get("controller")), minimum=0, maximum=127),
        "program": _coerce_int(entry.get("program", fallback.get("program")), minimum=0, maximum=127),
        "assignment": dict(assignment) if isinstance(assignment, dict) else {},
    }


class MidiCommanderSurfaceService(Singleton):
    def __init__(
        self,
        *,
        midi_hub: Any = None,
        publisher: Optional[RealtimeMessagePublisher] = None,
        poll_interval_s: float = 2.0,
    ) -> None:
        self._publisher = publisher or event_publisher
        self._midi_hub = midi_hub
        self._midi_hub_loop: asyncio.AbstractEventLoop | None = None
        self._subscriber_id = f"midi_commander_surface:{id(self)}"
        self._task: asyncio.Task[None] | None = None
        self._poll_interval_s = max(0.25, float(poll_interval_s))
        self._detected_ports: list[dict[str, Any]] = []
        self._recent_events: list[dict[str, Any]] = []
        self._active_snapshot_mapping: dict[str, Any] | None = None
        self._last_activation_push: dict[str, Any] | None = None
        self._daemon = MidiCommanderSurfaceDaemon(
            get_ports=self._list_input_ports,
            repush_surface_state=self._repush_live_snapshot_assignments,
            emit=self._emit,
        )
        if self._midi_hub is None:
            self._subscribe_to_midi_hub()
        elif hasattr(self._midi_hub, "subscribe"):
            self._midi_hub.subscribe(self._subscriber_id, self._on_midi_hub_message)

    async def _emit(self, topic: str, payload: dict[str, Any]) -> None:
        await self._publisher.publish_message(
            {"type": topic, "data": payload},
            topics=(topic, "midi_commander_surface"),
        )

    def _subscribe_to_midi_hub(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            self._midi_hub = get_midi_hub()
            self._midi_hub.subscribe(self._subscriber_id, self._on_midi_hub_message)
        except Exception:
            logger.debug("MIDI Commander surface service started without MIDI Hub subscription.", exc_info=True)

    async def start(self) -> None:
        await self.ensure_daemon_started()
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run_poll_loop(), name="midi-commander-surface")

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if self._midi_hub is not None and hasattr(self._midi_hub, "unsubscribe"):
            try:
                self._midi_hub.unsubscribe(self._subscriber_id)
            except Exception:
                logger.debug("MIDI Commander surface service unsubscribe failed.", exc_info=True)
        await self._daemon.stop()

    async def ensure_daemon_started(self) -> None:
        await self._daemon.ensure_started()

    async def _run_poll_loop(self) -> None:
        while True:
            try:
                self.list_matching_ports()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.debug("MIDI Commander poll failed.", exc_info=True)
            await asyncio.sleep(self._poll_interval_s)

    def _on_midi_hub_message(self, message: Any) -> None:
        if self._midi_hub_loop is None:
            try:
                self._midi_hub_loop = asyncio.get_running_loop()
            except RuntimeError:
                return
        payload = bytes(getattr(message, "data", b"") or b"")
        if not payload:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.handle_inbound_message(
                    payload,
                    source_port=str(getattr(message, "source_port", "") or ""),
                    metadata=dict(getattr(message, "metadata", {}) or {}),
                ),
                self._midi_hub_loop,
            )
        except Exception:
            logger.debug("MIDI Commander callback scheduling failed.", exc_info=True)

    @staticmethod
    def _matches_source(*, source_port: str, metadata: dict[str, Any] | None = None) -> bool:
        payload = dict(metadata or {})
        profile_id = str(payload.get("profile_id") or payload.get("device_profile_id") or "").strip().lower()
        if profile_id == MIDI_COMMANDER_PROFILE_ID:
            return True
        if is_midi_commander_port_name(source_port):
            return True
        return is_midi_commander_port_name(str(payload.get("port_name") or payload.get("source_port_name") or ""))

    def list_matching_ports(self) -> list[dict[str, Any]]:
        midi_hub = self._midi_hub
        if midi_hub is None or not hasattr(midi_hub, "list_ports"):
            return []
        try:
            ports = midi_hub.list_ports()
        except Exception:
            return []
        matches: list[dict[str, Any]] = []
        for port in ports:
            name = str(getattr(port, "name", "") or "")
            if not is_midi_commander_port_name(name):
                continue
            matches.append(
                {
                    "port_id": str(getattr(port, "port_id", "") or ""),
                    "name": name,
                    "direction": str(getattr(port, "direction", "") or ""),
                    "variant": detect_midi_commander_variant(name),
                }
            )
        self._detected_ports = matches
        return matches

    def _list_input_ports(self) -> list[dict[str, Any]]:
        return [
            dict(port)
            for port in self.list_matching_ports()
            if str(port.get("direction") or "").strip().lower() in {"input", "duplex", "bidirectional", "inout", "input/output"}
        ]

    async def _get_live_snapshot_payload(self) -> dict[str, Any] | None:
        async with get_session() as session:
            return await SnapshotRuntimeStateService(session).get_live_snapshot_payload()

    @staticmethod
    def _resolve_assignment_payload(mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = mapping.get("assignment")
        if isinstance(assignment, dict):
            return dict(assignment)
        return dict(mapping)

    @staticmethod
    def _resolve_action_type(mapping: dict[str, Any]) -> str:
        assignment = MidiCommanderSurfaceService._resolve_assignment_payload(mapping)
        return str(
            assignment.get("kind")
            or assignment.get("action_type")
            or assignment.get("action")
            or mapping.get("action_type")
            or mapping.get("action")
            or ""
        ).strip().lower()

    @staticmethod
    def _manual_setup_lines(mappings: list[dict[str, Any]]) -> list[str]:
        lines = [
            "This controller does not expose a MAP2 SysEx template push path.",
            "Keep the device on the factory/default MIDI Commander layout: top row CC switches 80/81/82/14, bottom row PC switches 0-3, expression pedals CC7 and CC1.",
        ]
        for mapping in mappings:
            assignment = MidiCommanderSurfaceService._resolve_assignment_payload(mapping)
            summary = str(
                assignment.get("kind")
                or assignment.get("action_type")
                or assignment.get("action")
                or "unassigned"
            )
            lines.append(f"{mapping['control_id']}: {summary}")
        return lines

    @staticmethod
    def _normalize_extension_payload(extension_payload: dict[str, Any]) -> list[dict[str, Any]]:
        by_id = {entry["control_id"]: dict(entry) for entry in build_default_layout()}
        raw_mappings = extension_payload.get("mappings")
        if isinstance(raw_mappings, list):
            for entry in raw_mappings:
                if not isinstance(entry, dict):
                    continue
                control_id = str(entry.get("control_id") or "").strip()
                if not control_id or control_id not in by_id:
                    continue
                by_id[control_id] = _normalize_control_entry(entry, fallback=by_id[control_id])
        return list(by_id.values())

    @staticmethod
    def _iter_live_input_mappings(live_snapshot_payload: dict[str, Any]) -> list[dict[str, Any]]:
        extensions = live_snapshot_payload.get("extensions")
        if not isinstance(extensions, dict):
            return build_default_layout()
        payload = extensions.get("midi_commander")
        if not isinstance(payload, dict):
            return build_default_layout()
        return MidiCommanderSurfaceService._normalize_extension_payload(payload)

    @staticmethod
    def _mapping_matches_event(mapping: dict[str, Any], event: dict[str, Any]) -> bool:
        if str(mapping.get("control_id") or "").strip() == str(event.get("control_id") or "").strip():
            return True
        if str(mapping.get("message_type") or "") != str(event.get("message_type") or ""):
            return False
        channel = _coerce_int(mapping.get("channel"), minimum=1, maximum=16)
        if channel is not None and channel != int(event.get("channel") or 1):
            return False
        if event.get("message_type") == "program_change":
            program = _coerce_int(mapping.get("program"), minimum=0, maximum=127)
            return program is not None and program == int(event.get("program") or -1)
        controller = _coerce_int(mapping.get("controller"), minimum=0, maximum=127)
        return controller is not None and controller == int(event.get("controller") or -1)

    async def _find_audio_grid_block(self, *, session: Any, action_payload: dict[str, Any]) -> tuple[Any, dict[str, Any] | None]:
        from app.services.maschine_service import get_maschine_service

        maschine_service = get_maschine_service()
        projection = await maschine_service.get_audio_grid_projection(session)
        blocks = projection.get("blocks") if isinstance(projection.get("blocks"), list) else []
        target_block_id = str(action_payload.get("block_id") or "").strip()
        if target_block_id:
            block = next(
                (
                    dict(candidate)
                    for candidate in blocks
                    if isinstance(candidate, dict) and str(candidate.get("block_id") or "") == target_block_id
                ),
                None,
            )
            return maschine_service, block

        plugin_uri = str(action_payload.get("target_plugin_uri", action_payload.get("plugin_uri")) or "").strip()
        plugin_position = _coerce_int(
            action_payload.get("target_plugin_position", action_payload.get("plugin_position")),
            minimum=0,
            maximum=1024,
        )
        for candidate in blocks:
            if not isinstance(candidate, dict):
                continue
            if plugin_uri and str(candidate.get("plugin_uri") or "") != plugin_uri:
                continue
            if plugin_position is not None and int(candidate.get("plugin_position") or -1) != plugin_position:
                continue
            return maschine_service, dict(candidate)
        return maschine_service, None

    async def _dispatch_parameter_mapping(
        self,
        *,
        session: Any,
        live_snapshot_payload: dict[str, Any],
        mapping: dict[str, Any],
        event: dict[str, Any],
    ) -> dict[str, Any]:
        from app.services.juce_engine_service import get_audio_engine
        from app.services.snapshot import SnapshotService

        assignment = self._resolve_assignment_payload(mapping)
        snapshot_id = int(live_snapshot_payload.get("id") or 0)
        chain_id = _coerce_int(assignment.get("snapshot_chain_id", assignment.get("chain_id")), minimum=1, maximum=1_000_000_000)
        plugin_position = _coerce_int(assignment.get("target_plugin_position", assignment.get("plugin_position")), minimum=0, maximum=1024)
        param_id = str(assignment.get("param_id") or assignment.get("symbol") or "").strip()
        if not snapshot_id or chain_id is None or plugin_position is None or not param_id:
            raise ValueError("parameter mapping requires snapshot_id, snapshot_chain_id, plugin_position, and param_id")
        raw_value = int(event.get("value") or 0)
        input_min = _coerce_int(assignment.get("input_min", 0), minimum=0, maximum=127) or 0
        input_max = _coerce_int(assignment.get("input_max", 127), minimum=0, maximum=127) or 127
        output_min = _coerce_float(assignment.get("out_min", assignment.get("min", 0.0)), 0.0)
        output_max = _coerce_float(assignment.get("out_max", assignment.get("max", 1.0)), 1.0)
        normalized_input = 0.0 if input_max <= input_min else (raw_value - input_min) / float(input_max - input_min)
        normalized_input = max(0.0, min(1.0, normalized_input))
        mapped_value = output_min + ((output_max - output_min) * normalized_input)

        detail = await SnapshotService(session).update_plugin_parameter_by_position(
            snapshot_id,
            chain_id,
            plugin_position,
            param_id,
            mapped_value,
        )
        engine_applied = False
        try:
            engine = get_audio_engine()
            if engine is not None:
                engine_applied = bool(
                    await engine.set_parameter(
                        str(assignment.get("target_plugin_uri", assignment.get("plugin_uri")) or ""),
                        param_id,
                        mapped_value,
                        plugin_position=plugin_position,
                    )
                )
        except Exception:
            logger.debug("MIDI Commander parameter engine apply failed.", exc_info=True)
        return {
            "status": "completed" if detail is not None else "failed",
            "action_type": "parameter",
            "snapshot_id": snapshot_id,
            "snapshot_chain_id": chain_id,
            "plugin_position": plugin_position,
            "param_id": param_id,
            "value": mapped_value,
            "engine_applied": engine_applied,
        }

    async def _dispatch_toggle_plugin(self, *, session: Any, mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = self._resolve_assignment_payload(mapping)
        maschine_service, block = await self._find_audio_grid_block(session=session, action_payload=assignment)
        if block is None or not block.get("block_id"):
            raise ValueError("toggle_plugin mapping target could not be resolved in the audio grid")
        projection = await maschine_service.toggle_audio_grid_block_bypass(session, str(block["block_id"]))
        selected = next((candidate for candidate in projection.get("blocks", []) if candidate.get("block_id") == block["block_id"]), None)
        return {
            "status": "completed",
            "action_type": "toggle_plugin",
            "block_id": str(block["block_id"]),
            "bypassed": bool((selected or {}).get("bypassed", False)),
        }

    async def _dispatch_focus_block(self, *, session: Any, mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = self._resolve_assignment_payload(mapping)
        maschine_service, block = await self._find_audio_grid_block(session=session, action_payload=assignment)
        if block is None or not block.get("block_id"):
            raise ValueError("focus_block mapping target could not be resolved in the audio grid")
        projection = await maschine_service.select_audio_grid_block(session, str(block["block_id"]))
        return {
            "status": "completed",
            "action_type": "focus_block",
            "selected_block_id": str(projection.get("selected_block_id") or ""),
        }

    async def _dispatch_transport_action(self, *, mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = self._resolve_assignment_payload(mapping)
        action = str(assignment.get("transport_action") or assignment.get("transport") or assignment.get("action") or "").strip().lower()
        if action not in {"play", "stop", "record", "rew", "ff", "restart", "erase"}:
            raise ValueError("transport mapping requires a valid transport action")
        result = await get_transport_service().dispatch(action)
        return {
            "status": "completed" if result.get("ok") else "failed",
            "action_type": "transport",
            "transport_action": action,
            "transport": result,
        }

    async def _dispatch_live_mapping(
        self,
        *,
        session: Any,
        live_snapshot_payload: dict[str, Any],
        mapping: dict[str, Any],
        event: dict[str, Any],
    ) -> dict[str, Any]:
        action_type = self._resolve_action_type(mapping)
        if action_type in {"parameter", "expression_target"}:
            return await self._dispatch_parameter_mapping(
                session=session,
                live_snapshot_payload=live_snapshot_payload,
                mapping=mapping,
                event=event,
            )
        if action_type in {"toggle_plugin", "bypass"}:
            return await self._dispatch_toggle_plugin(session=session, mapping=mapping)
        if action_type in {"focus_block", "focus"}:
            return await self._dispatch_focus_block(session=session, mapping=mapping)
        if action_type == "transport":
            return await self._dispatch_transport_action(mapping=mapping)
        return {
            "status": "skipped",
            "action_type": action_type or "unassigned",
            "reason": "unsupported_or_unassigned_action",
        }

    async def _repush_live_snapshot_assignments(self) -> dict[str, Any]:
        live_snapshot_payload = await self._get_live_snapshot_payload()
        if not isinstance(live_snapshot_payload, dict):
            return {"status": "skipped", "status_label": "No live snapshot is active.", "reason": "missing_live_snapshot"}
        extensions = live_snapshot_payload.get("extensions")
        extension_payload = extensions.get("midi_commander") if isinstance(extensions, dict) else None
        result = await self.push_snapshot_activation(
            snapshot_id=int(live_snapshot_payload.get("id") or 0),
            snapshot_name=str(live_snapshot_payload.get("name") or "Live Snapshot"),
            extension_payload=dict(extension_payload) if isinstance(extension_payload, dict) else {},
        )
        if result.get("status") == "completed":
            result["status_label"] = "Current snapshot mappings and manual setup guidance refreshed."
        return result

    async def push_snapshot_activation(
        self,
        *,
        snapshot_id: int,
        snapshot_name: str,
        extension_payload: dict[str, Any],
    ) -> dict[str, Any]:
        mappings = self._normalize_extension_payload(extension_payload if isinstance(extension_payload, dict) else {})
        manual_setup = {
            "supported": False,
            "transport": "manual_setup",
            "lines": self._manual_setup_lines(mappings),
        }
        self._active_snapshot_mapping = {
            "snapshot_id": int(snapshot_id),
            "snapshot_name": str(snapshot_name or ""),
            "mapping_count": len(mappings),
            "mappings": [dict(entry) for entry in mappings],
            "manual_setup": manual_setup,
        }
        payload = {
            "status": "completed",
            "snapshot_id": int(snapshot_id),
            "snapshot_name": str(snapshot_name or ""),
            "mapping_count": len(mappings),
            "configuration_transport": "manual_setup",
            "manual_setup": manual_setup,
        }
        self._last_activation_push = dict(payload)
        await self._emit("midi_commander_surface:snapshot_activation", payload)
        return payload

    async def handle_inbound_message(
        self,
        data: bytes,
        *,
        source_port: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._matches_source(source_port=source_port, metadata=metadata):
            return {"status": "skipped", "reason": "non_midi_commander_source"}
        event = parse_midi_commander_message(data)
        if event is None:
            return {"status": "skipped", "reason": "unsupported_message"}
        dispatch_result: dict[str, Any] | None = None
        if event.get("event_type") == "bank" and int(event.get("value") or 0) >= 64:
            if event.get("direction") == "up":
                dispatch_result = {"status": "completed", "bank": device_profile_service.bank_up()}
            else:
                dispatch_result = {"status": "completed", "bank": device_profile_service.bank_down()}
        elif event.get("event_type") in {"button", "expression"}:
            async with get_session() as session:
                live_snapshot_payload = await SnapshotRuntimeStateService(session).get_live_snapshot_payload()
                if isinstance(live_snapshot_payload, dict):
                    mappings = self._iter_live_input_mappings(live_snapshot_payload)
                    matched = [mapping for mapping in mappings if self._mapping_matches_event(mapping, event)]
                    if matched:
                        results = []
                        for mapping in matched:
                            results.append(
                                await self._dispatch_live_mapping(
                                    session=session,
                                    live_snapshot_payload=live_snapshot_payload,
                                    mapping=mapping,
                                    event=event,
                                )
                            )
                        dispatch_result = {
                            "status": "completed",
                            "snapshot_id": int(live_snapshot_payload.get("id") or 0),
                            "matched_count": len(results),
                            "results": results,
                        }
        payload = {
            "status": "completed",
            "source_port": source_port,
            "event": event,
            "dispatch": dispatch_result,
        }
        self._recent_events.append(payload)
        self._recent_events = self._recent_events[-64:]
        await self._emit("midi_commander_surface:event", payload)
        return payload

    def get_state_snapshot(self) -> dict[str, Any]:
        active_profile = device_profile_service.get_active_profile()
        return {
            "detected_ports": [dict(port) for port in self._detected_ports],
            "active_snapshot_mapping": dict(self._active_snapshot_mapping) if isinstance(self._active_snapshot_mapping, dict) else None,
            "last_activation_push": dict(self._last_activation_push) if isinstance(self._last_activation_push, dict) else None,
            "active_profile": dict(active_profile) if isinstance(active_profile, dict) else None,
            "current_bank": int(device_profile_service.get_current_bank("meloaudio_commander")),
            "expression_calibrations": dict(device_profile_service.get_all_expression_calibrations()),
            "daemon_status": self._daemon.snapshot(),
            "recent_events": [dict(item) for item in self._recent_events[-16:]],
        }


def get_midi_commander_surface_service() -> MidiCommanderSurfaceService:
    return MidiCommanderSurfaceService.get_instance()


def reset_midi_commander_surface_service() -> None:
    MidiCommanderSurfaceService.reset_instance()
