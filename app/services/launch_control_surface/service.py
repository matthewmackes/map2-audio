from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.database import get_session
from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.transport_service import get_transport_service
from app.utils.singleton import Singleton

from .daemon import LaunchControlSurfaceDaemon
from .colors import resolve_led_feedback
from .protocol import (
    MAP2_TEMPLATE_INDEX,
    build_led_note_message,
    build_map2_template_manifest,
    build_select_template_sysex,
    detect_launch_control_variant,
    is_launch_control_port_name,
    parse_launch_control_message,
)

logger = logging.getLogger(__name__)


def _coerce_int(value: Any, *, minimum: int, maximum: int) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, parsed))


class LaunchControlSurfaceService(Singleton):
    def __init__(
        self,
        *,
        midi_hub: Any = None,
        publisher: Optional[RealtimeMessagePublisher] = None,
        poll_interval_s: float = 1.5,
    ) -> None:
        self._publisher = publisher or event_publisher
        self._midi_hub = midi_hub
        self._midi_hub_loop: asyncio.AbstractEventLoop | None = None
        self._poll_interval_s = max(0.25, float(poll_interval_s))
        self._subscriber_id = f"launch_control_surface:{id(self)}"
        self._task: asyncio.Task[None] | None = None
        self._known_destination_ports: set[str] = set()
        self._detected_ports: list[dict[str, Any]] = []
        self._template_state_by_port: dict[str, dict[str, Any]] = {}
        self._recent_events: list[dict[str, Any]] = []
        self._push_count = 0
        self._last_push: dict[str, Any] | None = None
        self._active_snapshot_mapping: dict[str, Any] | None = None
        self._last_activation_push: dict[str, Any] | None = None
        self._daemon = LaunchControlSurfaceDaemon(
            get_ports=self._list_output_ports,
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
            topics=(topic, "launch_control_surface"),
        )

    def _subscribe_to_midi_hub(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            self._midi_hub = get_midi_hub()
            self._midi_hub.subscribe(self._subscriber_id, self._on_midi_hub_message)
        except Exception:
            logger.debug("Launch Control surface service started without MIDI Hub subscription.", exc_info=True)

    async def start(self) -> None:
        await self.ensure_daemon_started()
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run_poll_loop(), name="launch-control-surface")

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
                logger.debug("Launch Control surface service unsubscribe failed.", exc_info=True)
        await self._daemon.stop()

    async def ensure_daemon_started(self) -> None:
        await self._daemon.ensure_started()

    async def _run_poll_loop(self) -> None:
        while True:
            try:
                await self.refresh_devices()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.debug("Launch Control surface poll failed.", exc_info=True)
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
            logger.debug("Launch Control callback scheduling failed.", exc_info=True)

    @staticmethod
    def _matches_source(*, source_port: str, metadata: dict[str, Any] | None = None) -> bool:
        payload = dict(metadata or {})
        profile_id = str(payload.get("profile_id") or payload.get("device_profile_id") or "").strip().lower()
        if profile_id == "novation_launch_control":
            return True
        if is_launch_control_port_name(source_port):
            return True
        return is_launch_control_port_name(str(payload.get("port_name") or payload.get("source_port_name") or ""))

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
            if not is_launch_control_port_name(name):
                continue
            matches.append(
                {
                    "port_id": str(getattr(port, "port_id", "") or ""),
                    "name": name,
                    "direction": str(getattr(port, "direction", "") or ""),
                    "variant": detect_launch_control_variant(name),
                }
            )
        self._detected_ports = matches
        return matches

    async def refresh_devices(self) -> dict[str, Any]:
        matches = self.list_matching_ports()
        output_ports = [
            port
            for port in matches
            if str(port.get("direction") or "").strip().lower() in {"output", "duplex", "bidirectional", "inout", "input/output"}
        ]
        for port in output_ports:
            port_id = str(port.get("port_id") or "")
            if not port_id or port_id in self._known_destination_ports:
                continue
            await self.push_map2_template(destination_port=port_id, variant=str(port.get("variant") or "launch_control"))
            self._known_destination_ports.add(port_id)
        if self._active_snapshot_mapping is not None:
            try:
                await self._refresh_live_snapshot_feedback()
            except Exception:
                logger.debug("Launch Control live feedback refresh failed.", exc_info=True)
        return {
            "detected_ports": matches,
            "output_port_count": len(output_ports),
            "push_count": self._push_count,
        }

    @staticmethod
    def _normalize_snapshot_mapping_entries(entries: Any) -> list[dict[str, Any]]:
        if not isinstance(entries, list):
            return []
        normalized: list[dict[str, Any]] = []
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            control_id = str(entry.get("control_id") or entry.get("id") or f"launch-control-{index + 1}").strip()
            if not control_id:
                control_id = f"launch-control-{index + 1}"
            note = entry.get("note")
            try:
                note_value = max(0, min(0x7F, int(note))) if note is not None else None
            except (TypeError, ValueError):
                note_value = None
            controller = entry.get("controller")
            try:
                controller_value = max(0, min(0x7F, int(controller))) if controller is not None else None
            except (TypeError, ValueError):
                controller_value = None
            channel = entry.get("channel")
            try:
                channel_value = max(1, min(16, int(channel))) if channel is not None else 1
            except (TypeError, ValueError):
                channel_value = 1
            normalized.append(
                {
                    "control_id": control_id,
                    "control_type": str(entry.get("control_type") or entry.get("type") or "button").strip().lower(),
                    "channel": channel_value,
                    "note": note_value,
                    "controller": controller_value,
                    "assignment": dict(entry.get("assignment") or {}) if isinstance(entry.get("assignment"), dict) else {},
                    "effect_type": str(entry.get("effect_type") or entry.get("effectType") or "").strip() or None,
                    "led_override": (
                        dict(entry.get("led_override") or entry.get("ledOverride"))
                        if isinstance(entry.get("led_override") or entry.get("ledOverride"), dict)
                        else entry.get("led_override") or entry.get("ledOverride")
                    ),
                    "label": str(entry.get("label") or control_id),
                }
            )
        return normalized

    @staticmethod
    def _resolve_snapshot_mapping_entries(extension_payload: dict[str, Any]) -> list[dict[str, Any]]:
        mappings = extension_payload.get("mappings")
        if not isinstance(mappings, list):
            mappings = extension_payload.get("controls")
        return LaunchControlSurfaceService._normalize_snapshot_mapping_entries(mappings)

    def _list_output_ports(self) -> list[dict[str, Any]]:
        return [
            dict(port)
            for port in self.list_matching_ports()
            if str(port.get("direction") or "").strip().lower() in {"output", "duplex", "bidirectional", "inout", "input/output"}
        ]

    async def _repush_live_snapshot_assignments(self) -> dict[str, Any]:
        live_snapshot_payload = await self._get_live_snapshot_payload()
        if not isinstance(live_snapshot_payload, dict):
            return {
                "status": "skipped",
                "status_label": "No live snapshot is active.",
                "reason": "missing_live_snapshot",
            }
        extensions = live_snapshot_payload.get("extensions")
        if not isinstance(extensions, dict):
            return {
                "status": "skipped",
                "status_label": "Live snapshot has no Launch Control extension.",
                "reason": "missing_extensions",
            }
        extension_payload = extensions.get("launch_control")
        if not isinstance(extension_payload, dict):
            return {
                "status": "skipped",
                "status_label": "Live snapshot has no Launch Control mapping payload.",
                "reason": "missing_launch_control_extension",
            }
        result = await self.push_snapshot_activation(
            snapshot_id=int(live_snapshot_payload.get("id") or 0),
            snapshot_name=str(live_snapshot_payload.get("name") or "Live Snapshot"),
            extension_payload=extension_payload,
        )
        if result.get("status") == "completed":
            result["status_label"] = "Live snapshot mappings and LED state re-pushed."
        return result

    @staticmethod
    def _iter_live_input_mappings(live_snapshot_payload: dict[str, Any]) -> list[dict[str, Any]]:
        extensions = live_snapshot_payload.get("extensions")
        if not isinstance(extensions, dict):
            return []
        launch_control_payload = extensions.get("launch_control")
        if not isinstance(launch_control_payload, dict):
            return []
        return LaunchControlSurfaceService._resolve_snapshot_mapping_entries(launch_control_payload)

    @staticmethod
    def _mapping_matches_event(mapping: dict[str, Any], event: dict[str, Any]) -> bool:
        event_type = str(event.get("event_type") or "").strip().lower()
        channel = _coerce_int(mapping.get("channel"), minimum=1, maximum=16)
        if channel is not None and channel != int(event.get("channel") or 1):
            return False
        if event_type == "control_change":
            controller = _coerce_int(mapping.get("controller"), minimum=0, maximum=127)
            return controller is not None and controller == int(event.get("controller") or -1)
        if event_type == "note":
            note = _coerce_int(mapping.get("note"), minimum=0, maximum=127)
            if note is None or note != int(event.get("note") or -1):
                return False
            threshold = _coerce_int(mapping.get("value_threshold"), minimum=0, maximum=127)
            velocity = int(event.get("velocity") or 0)
            return threshold is None or velocity >= threshold
        return False

    @staticmethod
    def _resolve_assignment_payload(mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = mapping.get("assignment")
        if isinstance(assignment, dict):
            return dict(assignment)
        return dict(mapping)

    @staticmethod
    def _resolve_action_type(mapping: dict[str, Any]) -> str:
        assignment = LaunchControlSurfaceService._resolve_assignment_payload(mapping)
        return str(
            assignment.get("kind")
            or assignment.get("action_type")
            or assignment.get("action")
            or mapping.get("action_type")
            or mapping.get("action")
            or ""
        ).strip().lower()

    async def _get_live_snapshot_payload(self) -> dict[str, Any] | None:
        async with get_session() as session:
            return await SnapshotRuntimeStateService(session).get_live_snapshot_payload()

    async def _find_audio_grid_block(
        self,
        *,
        session: Any,
        action_payload: dict[str, Any],
    ) -> tuple[Any, dict[str, Any] | None]:
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
        from app.services.snapshot_service import SnapshotService

        assignment = self._resolve_assignment_payload(mapping)
        snapshot_id = int(live_snapshot_payload.get("id") or 0)
        chain_id = _coerce_int(
            assignment.get("snapshot_chain_id", assignment.get("chain_id")),
            minimum=1,
            maximum=1_000_000_000,
        )
        plugin_position = _coerce_int(
            assignment.get("target_plugin_position", assignment.get("plugin_position")),
            minimum=0,
            maximum=1024,
        )
        param_id = str(assignment.get("param_id") or assignment.get("symbol") or "").strip()
        if not snapshot_id or chain_id is None or plugin_position is None or not param_id:
            raise ValueError("parameter mapping requires snapshot_id, snapshot_chain_id, plugin_position, and param_id")
        raw_value = int(event.get("value") or 0)
        input_min = _coerce_int(assignment.get("input_min", assignment.get("cc_min", 0)), minimum=0, maximum=127) or 0
        input_max = _coerce_int(assignment.get("input_max", assignment.get("cc_max", 127)), minimum=0, maximum=127) or 127
        output_min = float(assignment.get("out_min", assignment.get("min", 0.0)) or 0.0)
        output_max = float(assignment.get("out_max", assignment.get("max", 1.0)) or 1.0)
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
            logger.debug("Launch Control parameter engine apply failed.", exc_info=True)
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
        selected = next(
            (candidate for candidate in projection.get("blocks", []) if candidate.get("block_id") == block["block_id"]),
            None,
        )
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
            "plugin_uri": str(block.get("plugin_uri") or ""),
            "plugin_position": int(block.get("plugin_position") or 0),
        }

    async def _dispatch_transport_action(self, *, mapping: dict[str, Any]) -> dict[str, Any]:
        assignment = self._resolve_assignment_payload(mapping)
        action = str(
            assignment.get("transport_action")
            or assignment.get("transport")
            or assignment.get("action")
            or ""
        ).strip().lower()
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
        if action_type == "parameter":
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
        raise ValueError(f"Unsupported Launch Control mapping action: {action_type}")

    async def _refresh_live_snapshot_feedback(self, live_snapshot_payload: dict[str, Any] | None = None) -> dict[str, Any]:
        if self._midi_hub is None:
            return {"status": "skipped", "reason": "missing_midi_hub"}
        if live_snapshot_payload is None:
            live_snapshot_payload = await self._get_live_snapshot_payload()
        if not isinstance(live_snapshot_payload, dict):
            return {"status": "skipped", "reason": "missing_live_snapshot"}
        mappings = self._iter_live_input_mappings(live_snapshot_payload)
        if not mappings:
            return {"status": "skipped", "reason": "missing_mappings"}
        async with get_session() as session:
            from app.services.maschine_service import get_maschine_service

            audio_grid = await get_maschine_service().get_audio_grid_projection(session)
        selected_block_id = str(audio_grid.get("selected_block_id") or "")
        blocks = [dict(block) for block in audio_grid.get("blocks", []) if isinstance(block, dict)]
        transport_state = get_transport_service().get_state()
        owner_state = {}
        for owner in transport_state.get("owners", []):
            if owner.get("active"):
                owner_state = owner.get("state") if isinstance(owner.get("state"), dict) else {}
                break
        destination_ports: list[str] = []
        led_push_count = 0
        for port in self._list_output_ports():
            destination_port = str(port.get("port_id") or "")
            if not destination_port:
                continue
            destination_ports.append(destination_port)
            for mapping in mappings:
                if mapping.get("note") is None:
                    continue
                assignment = self._resolve_assignment_payload(mapping)
                action_type = self._resolve_action_type(mapping)
                led_feedback = resolve_led_feedback(mapping.get("effect_type"), mapping.get("led_override"))
                velocity = int(led_feedback["velocity"])
                if action_type in {"toggle_plugin", "bypass"}:
                    block = next(
                        (
                            candidate
                            for candidate in blocks
                            if str(candidate.get("block_id") or "") == str(assignment.get("block_id") or "")
                            or (
                                str(candidate.get("plugin_uri") or "") == str(assignment.get("target_plugin_uri", assignment.get("plugin_uri")) or "")
                                and _coerce_int(candidate.get("plugin_position"), minimum=0, maximum=1024)
                                == _coerce_int(assignment.get("target_plugin_position", assignment.get("plugin_position")), minimum=0, maximum=1024)
                            )
                        ),
                        None,
                    )
                    if isinstance(block, dict) and bool(block.get("bypassed")):
                        velocity = 0x0C
                elif action_type in {"focus_block", "focus"}:
                    target_block_id = str(assignment.get("block_id") or "")
                    if target_block_id and target_block_id != selected_block_id:
                        velocity = 0x0C
                elif action_type == "transport":
                    desired_action = str(
                        assignment.get("transport_action")
                        or assignment.get("transport")
                        or assignment.get("action")
                        or ""
                    ).strip().lower()
                    if str(owner_state.get("last_action") or "").strip().lower() != desired_action:
                        velocity = 0x0C
                if not self._midi_hub.send(
                    source_port="map2:launch_control_surface",
                    destination_port=destination_port,
                    data=build_led_note_message(
                        note=int(mapping["note"]),
                        velocity=velocity,
                        channel=int(mapping.get("channel") or 1),
                    ),
                    metadata={
                        "profile_id": "novation_launch_control",
                        "message_type": "live_feedback_refresh",
                        "snapshot_id": int(live_snapshot_payload.get("id") or 0),
                        "control_id": mapping["control_id"],
                    },
                ):
                    continue
                led_push_count += 1
        result = {
            "status": "completed",
            "snapshot_id": int(live_snapshot_payload.get("id") or 0),
            "mapping_count": len(mappings),
            "destination_ports": destination_ports,
            "led_push_count": led_push_count,
        }
        self._last_activation_push = dict(result)
        return result

    async def push_snapshot_activation(
        self,
        *,
        snapshot_id: int,
        snapshot_name: str,
        extension_payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not isinstance(extension_payload, dict):
            return {"status": "skipped", "reason": "missing_extension_payload", "snapshot_id": int(snapshot_id)}
        mappings = self._resolve_snapshot_mapping_entries(extension_payload)
        if not mappings:
            return {"status": "skipped", "reason": "missing_mappings", "snapshot_id": int(snapshot_id)}
        output_ports = self._list_output_ports()
        if not output_ports:
            self._active_snapshot_mapping = {
                "snapshot_id": int(snapshot_id),
                "snapshot_name": str(snapshot_name or ""),
                "template_index": MAP2_TEMPLATE_INDEX,
                "mapping_count": len(mappings),
                "mappings": [dict(entry) for entry in mappings],
                "destination_ports": [],
            }
            return {
                "status": "skipped",
                "reason": "no_launch_control_outputs",
                "snapshot_id": int(snapshot_id),
                "mapping_count": len(mappings),
            }

        destination_ports: list[str] = []
        led_push_count = 0
        for port in output_ports:
            destination_port = str(port.get("port_id") or "")
            if not destination_port:
                continue
            variant = str(
                (self._template_state_by_port.get(destination_port) or {}).get("variant")
                or port.get("variant")
                or detect_launch_control_variant(str(port.get("name") or ""))
            )
            await self.push_map2_template(destination_port=destination_port, variant=variant)
            destination_ports.append(destination_port)
            for mapping in mappings:
                note = mapping.get("note")
                if note is None:
                    continue
                led_feedback = resolve_led_feedback(mapping.get("effect_type"), mapping.get("led_override"))
                if not self._midi_hub.send(
                    source_port="map2:launch_control_surface",
                    destination_port=destination_port,
                    data=build_led_note_message(
                        note=int(note),
                        velocity=int(led_feedback["velocity"]),
                        channel=int(mapping.get("channel") or 1),
                    ),
                    metadata={
                        "profile_id": "novation_launch_control",
                        "message_type": "snapshot_led_feedback",
                        "snapshot_id": int(snapshot_id),
                        "snapshot_name": str(snapshot_name or ""),
                        "control_id": mapping["control_id"],
                        "effect_type": mapping.get("effect_type"),
                        "device_color": led_feedback.get("device_color"),
                    },
                ):
                    continue
                led_push_count += 1
        self._active_snapshot_mapping = {
            "snapshot_id": int(snapshot_id),
            "snapshot_name": str(snapshot_name or ""),
            "template_index": MAP2_TEMPLATE_INDEX,
            "mapping_count": len(mappings),
            "mappings": [dict(entry) for entry in mappings],
            "destination_ports": list(destination_ports),
        }
        payload = {
            "status": "completed",
            "snapshot_id": int(snapshot_id),
            "snapshot_name": str(snapshot_name or ""),
            "mapping_count": len(mappings),
            "destination_ports": list(destination_ports),
            "led_push_count": led_push_count,
        }
        self._last_activation_push = dict(payload)
        await self._emit("launch_control_surface:snapshot_activation", payload)
        return payload

    async def handle_inbound_message(
        self,
        data: bytes,
        *,
        source_port: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._matches_source(source_port=source_port, metadata=metadata):
            return {"status": "skipped", "reason": "non_launch_control_source"}
        event = parse_launch_control_message(data)
        if event is None:
            return {"status": "skipped", "reason": "unsupported_message"}
        if event.get("event_type") == "template_changed":
            self._template_state_by_port[source_port] = {
                "template_index": int(event.get("template_index") or 0),
                "variant": str(event.get("variant") or detect_launch_control_variant(source_port)),
                "manifest": build_map2_template_manifest(variant=str(event.get("variant") or detect_launch_control_variant(source_port))),
            }
        dispatch_result: dict[str, Any] | None = None
        if event.get("event_type") in {"control_change", "note"}:
            async with get_session() as session:
                live_snapshot_payload = await SnapshotRuntimeStateService(session).get_live_snapshot_payload()
                if isinstance(live_snapshot_payload, dict):
                    mappings = self._iter_live_input_mappings(live_snapshot_payload)
                    matched = [mapping for mapping in mappings if self._mapping_matches_event(mapping, event)]
                    if matched:
                        results: list[dict[str, Any]] = []
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
                        await self._refresh_live_snapshot_feedback(live_snapshot_payload)
        payload = {
            "status": "completed",
            "source_port": source_port,
            "event": event,
            "dispatch": dispatch_result,
        }
        self._recent_events.append(payload)
        self._recent_events = self._recent_events[-64:]
        await self._emit("launch_control_surface:event", payload)
        return payload

    async def push_map2_template(self, *, destination_port: str, variant: str) -> bool:
        if self._midi_hub is None:
            return False
        manifest = build_map2_template_manifest(variant=variant)
        ok = bool(
            self._midi_hub.send(
                source_port="map2:launch_control_surface",
                destination_port=destination_port,
                data=build_select_template_sysex(variant=variant, template_index=MAP2_TEMPLATE_INDEX),
                metadata={
                    "profile_id": "novation_launch_control",
                    "message_type": "template_select",
                    "template_index": MAP2_TEMPLATE_INDEX,
                    "template_name": manifest["template_name"],
                },
            )
        )
        if ok:
            self._push_count += 1
            self._last_push = {
                "destination_port": destination_port,
                "variant": variant,
                "template_index": MAP2_TEMPLATE_INDEX,
                "template_name": manifest["template_name"],
            }
            self._template_state_by_port[destination_port] = {
                "template_index": MAP2_TEMPLATE_INDEX,
                "variant": variant,
                "manifest": manifest,
            }
            await self._emit(
                "launch_control_surface:template_push",
                {
                    "destination_port": destination_port,
                    "variant": variant,
                    "template_index": MAP2_TEMPLATE_INDEX,
                    "manifest": manifest,
                },
            )
        return ok

    def get_state_snapshot(self) -> dict[str, Any]:
        return {
            "detected_ports": [dict(port) for port in self._detected_ports],
            "template_state_by_port": {key: dict(value) for key, value in self._template_state_by_port.items()},
            "push_count": self._push_count,
            "last_push": dict(self._last_push) if isinstance(self._last_push, dict) else None,
            "active_snapshot_mapping": (
                dict(self._active_snapshot_mapping)
                if isinstance(self._active_snapshot_mapping, dict)
                else None
            ),
            "last_activation_push": (
                dict(self._last_activation_push)
                if isinstance(self._last_activation_push, dict)
                else None
            ),
            "daemon_status": self._daemon.snapshot(),
            "recent_events": [dict(item) for item in self._recent_events[-16:]],
        }


def get_launch_control_surface_service() -> LaunchControlSurfaceService:
    return LaunchControlSurfaceService.get_instance()


def reset_launch_control_surface_service() -> None:
    LaunchControlSurfaceService.reset_instance()
