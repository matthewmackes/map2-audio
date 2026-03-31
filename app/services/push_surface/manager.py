"""Lifecycle manager for the Push surface subsystem."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from time import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from app.services.midi_hub.hub import MidiHub, get_midi_hub
from app.services.midi_hub.ports import MidiMessage, MidiPortInfo
from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.device_profile import GENERIC_PUSH_PROFILE, PushDeviceProfile, guess_profile_for_ports
from app.services.push_surface.diagnostics import PushSurfaceDiagnostics
from app.services.push_surface.input_parser import PushInputParser
from app.services.push_surface.labs_store import get_push_surface_labs_store
from app.services.push_surface.map2_bridge import DirectMap2SurfaceBridge, Map2SurfaceAPI, RestWebSocketMap2SurfaceBridge
from app.services.push_surface.models.render_state import RenderFrame
from app.services.push_surface.models.state import PageId
from app.services.push_surface.output_renderer import PushOutputRenderer
from app.services.push_surface.page_controller import PushPageController, SurfaceCommand, SurfaceCommandType
from app.services.push_surface.welcome_runtime import build_render_frame_from_welcome_step

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DiscoveredPushDevice:
    """One paired input/output device ready for Push surface control."""

    device_id: str
    input_port_id: str
    output_port_id: str
    input_port_name: str
    output_port_name: str
    profile: PushDeviceProfile

    @property
    def capabilities(self):
        return self.profile.capabilities


class PushSurfaceManager:
    """Top-level subsystem manager for device I/O, state, and rendering."""

    def __init__(
        self,
        *,
        hub: MidiHub | None = None,
        bridge: Map2SurfaceAPI | None = None,
        config: PushSurfaceConfig | None = None,
        diagnostics: PushSurfaceDiagnostics | None = None,
        start_hub_if_needed: bool = True,
    ) -> None:
        self.hub = hub or get_midi_hub()
        self.config = config or PushSurfaceConfig.load()
        self.bridge = bridge or self._default_bridge(self.config)
        self.diagnostics = diagnostics or PushSurfaceDiagnostics()
        self.controller = PushPageController(self.config)
        self.start_hub_if_needed = start_hub_if_needed

        self.active_device: DiscoveredPushDevice | None = None
        self.parser: PushInputParser | None = None
        self.renderer: PushOutputRenderer | None = None

        self._running = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._input_queue: asyncio.Queue[MidiMessage] = asyncio.Queue()
        self._midi_task: asyncio.Task[None] | None = None
        self._hotplug_task: asyncio.Task[None] | None = None
        self._bridge_task: asyncio.Task[None] | None = None
        self._welcome_task: asyncio.Task[None] | None = None
        self._welcome_skip_event: asyncio.Event | None = None
        self._welcome_pending = False
        self._welcome_runtime_status: dict[str, Any] | None = None
        self._pending_param_values: dict[tuple[str, str], Any] = {}
        self._pending_param_tasks: dict[tuple[str, str], asyncio.Task[None]] = {}
        self._subscriber_id = "push_surface_manager"
        self.reconnect_count = 0
        self.unknown_messages = 0
        self._last_capability_dump: dict[str, Any] | None = None
        self._last_diagnostics_export: str | None = None

    @staticmethod
    def _default_bridge(config: PushSurfaceConfig) -> Map2SurfaceAPI:
        if str(config.default_bridge).strip().lower() in {"rest", "rest_ws", "websocket"}:
            return RestWebSocketMap2SurfaceBridge(
                base_url=config.rest_base_url,
                websocket_url=config.websocket_url,
            )
        return DirectMap2SurfaceBridge()

    @property
    def running(self) -> bool:
        return self._running

    async def start(self) -> None:
        if self._running:
            return

        self._loop = asyncio.get_running_loop()
        if self.start_hub_if_needed and not self.hub.running:
            self.hub.start()
        self.hub.subscribe(self._subscriber_id, self._on_hub_message)
        self._running = True

        await self.scan_devices()
        await self.refresh_state()
        if not await self._maybe_start_welcome():
            await self.render()

        self._midi_task = asyncio.create_task(self._consume_midi(), name="push-surface-midi")
        self._hotplug_task = asyncio.create_task(self._hotplug_loop(), name="push-surface-hotplug")
        self._bridge_task = asyncio.create_task(self._bridge_events_loop(), name="push-surface-bridge")
        logger.info("Push surface manager started")

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        self.hub.unsubscribe(self._subscriber_id)

        for task in list(self._pending_param_tasks.values()):
            task.cancel()
        self._pending_param_tasks.clear()

        await self._cancel_welcome_task()

        for task in (self._midi_task, self._hotplug_task, self._bridge_task):
            if task is None:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._midi_task = None
        self._hotplug_task = None
        self._bridge_task = None
        logger.info("Push surface manager stopped")

    async def apply_config(self, config: PushSurfaceConfig) -> None:
        """Apply a new operator config to the live manager."""

        self.config = config
        self.controller.config = config
        self.controller.state.safe_mode = bool(config.safe_mode)

        desired_bridge = self._default_bridge(config)
        replace_bridge = False
        if isinstance(self.bridge, (DirectMap2SurfaceBridge, RestWebSocketMap2SurfaceBridge)):
            if type(desired_bridge) is not type(self.bridge):
                replace_bridge = True
            elif isinstance(self.bridge, RestWebSocketMap2SurfaceBridge) and isinstance(desired_bridge, RestWebSocketMap2SurfaceBridge):
                replace_bridge = (
                    self.bridge.base_url != desired_bridge.base_url
                    or self.bridge.websocket_url != desired_bridge.websocket_url
                )
        if replace_bridge:
            self.bridge = desired_bridge
            if self._bridge_task is not None:
                self._bridge_task.cancel()
                try:
                    await self._bridge_task
                except asyncio.CancelledError:
                    pass
                self._bridge_task = None
            if self._running:
                self._bridge_task = asyncio.create_task(self._bridge_events_loop(), name="push-surface-bridge")

        if self._running:
            await self.scan_devices()
            await self.refresh_state()
            if not await self._maybe_start_welcome():
                await self.render()

    async def send_test_pattern(self) -> int:
        """Emit the diagnostics LED test pattern immediately."""

        if self.renderer is None or self.active_device is None:
            return 0
        frame = self.diagnostics.build_test_pattern()
        payloads = self.renderer.render(frame, urgent_controls=set(), experimental_protocol=False)
        for payload in payloads:
            self.hub.send(
                source_port="push_surface",
                destination_port=self.active_device.output_port_id,
                data=payload,
                metadata={"subsystem": "push_surface", "diagnostic": "test_pattern"},
            )
        self.diagnostics.record_render(frame, emitted_messages=len(payloads))
        return len(payloads)

    async def export_diagnostics_bundle(self) -> str:
        """Export the current diagnostics bundle and return its directory path."""

        export_path = self.diagnostics.export_bundle(directory=Path(self.config.diagnostics_directory))
        self._last_diagnostics_export = str(export_path)
        return self._last_diagnostics_export

    async def dump_capabilities(self) -> dict[str, Any] | None:
        """Capture and return the current capability dump for the active device."""

        if self.active_device is None:
            self._last_capability_dump = None
            return None
        self._last_capability_dump = self.diagnostics.dump_capabilities(self.active_device.capabilities)
        return self._last_capability_dump

    async def get_state_snapshot(self) -> dict[str, Any]:
        """Return a JSON-safe snapshot of controller state and render context."""

        if self.controller.state.last_render is None:
            self.controller.build_render_frame()
        snapshot = {
            "running": self._running,
            "active_page": self.controller.state.active_page,
            "active_device_id": self.active_device.device_id if self.active_device is not None else None,
            "state": asdict(self.controller.state),
            "welcome_runtime": self._welcome_runtime_status,
        }
        return json.loads(json.dumps(snapshot, default=str))

    async def scan_devices(self) -> DiscoveredPushDevice | None:
        ports = self.hub.list_ports()
        device = self._resolve_device(ports)
        if device is None:
            if self.active_device is not None:
                self.reconnect_count += 1
            await self._cancel_welcome_task()
            self._welcome_pending = False
            self.active_device = None
            self.parser = None
            self.renderer = None
            return None

        if self.active_device != device:
            await self._cancel_welcome_task()
            self.reconnect_count += 1 if self.active_device is not None else 0
            self.active_device = device
            self.parser = PushInputParser(device.profile)
            self.renderer = PushOutputRenderer(device.profile)
            self._welcome_pending = True
            self.config.input_port_id = device.input_port_id
            self.config.output_port_id = device.output_port_id
            self.config.input_port_name = device.input_port_name
            self.config.output_port_name = device.output_port_name
            self.config.preferred_profile = device.profile.profile_id
            self.config.save()
            logger.info(
                "Push surface selected device %s (%s -> %s)",
                device.device_id,
                device.input_port_name,
                device.output_port_name,
            )
        return self.active_device

    async def refresh_state(self) -> None:
        presets = await self.bridge.list_presets()
        selected_preset_id = self.controller.state.selected_preset_id
        if not selected_preset_id:
            for preset in presets:
                if preset.is_active:
                    selected_preset_id = preset.id
                    break
        if not selected_preset_id and presets:
            selected_preset_id = presets[0].id
        chains = await self.bridge.list_chains(selected_preset_id)
        routing = await self.bridge.get_routing_state(selected_preset_id)
        cluster_nodes = await self.bridge.get_cluster_nodes()
        self.controller.replace_data(
            presets=presets,
            chains=chains,
            routing=routing,
            cluster_nodes=cluster_nodes,
            diagnostics=self.diagnostics.snapshot(),
        )

    async def _send_frame(
        self,
        frame: RenderFrame,
        *,
        urgent_controls: set[str] | None = None,
        force: bool = False,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if self.active_device is None or self.renderer is None:
            return
        if self._welcome_task is not None and not self._welcome_task.done() and not force:
            return
        payloads = self.renderer.render(
            frame,
            urgent_controls=urgent_controls,
            experimental_protocol=bool(self.config.experimental_protocol),
        )
        for payload in payloads:
            payload_metadata = {"subsystem": "push_surface"}
            if metadata:
                payload_metadata.update(metadata)
            self.hub.send(
                source_port="push_surface",
                destination_port=self.active_device.output_port_id,
                data=payload,
                metadata=payload_metadata,
            )
        self.diagnostics.record_render(frame, emitted_messages=len(payloads))

    async def render(self, *, urgent_controls: set[str] | None = None, force: bool = False) -> None:
        frame = self.controller.build_render_frame()
        await self._send_frame(frame, urgent_controls=urgent_controls, force=force)

    @staticmethod
    def _should_skip_welcome(parsed_event) -> bool:
        event_name = getattr(parsed_event.event_type, "value", "")
        return event_name not in {
            "button_release",
            "pad_release",
            "encoder_release",
            "unknown_midi_event",
        }

    async def _skip_welcome_playback(self) -> None:
        task = self._welcome_task
        if task is None or task.done():
            return
        if self._welcome_skip_event is not None:
            self._welcome_skip_event.set()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=0.35)
        except asyncio.TimeoutError:
            logger.debug("Push surface welcome skip timed out waiting for playback shutdown")

    async def _cancel_welcome_task(self) -> None:
        task = self._welcome_task
        if task is None:
            self._welcome_runtime_status = None
            self._welcome_skip_event = None
            return
        if self._welcome_skip_event is not None:
            self._welcome_skip_event.set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        self._welcome_task = None
        self._welcome_skip_event = None
        self._welcome_runtime_status = None

    def _resolve_handoff_page(self, value: str | None) -> PageId:
        normalized = str(value or "home").strip().lower()
        try:
            return PageId(normalized)
        except ValueError:
            return PageId.HOME

    def _current_welcome_stats(self) -> dict[str, str]:
        preset = self.controller.state.current_preset()
        cluster_node = None
        if self.controller.state.selected_cluster_node_id:
            for node in self.controller.state.cluster_nodes:
                if node.id == self.controller.state.selected_cluster_node_id:
                    cluster_node = node
                    break
        if cluster_node is None and self.controller.state.cluster_nodes:
            cluster_node = self.controller.state.cluster_nodes[0]
        cpu_percent = cluster_node.cpu_percent if cluster_node is not None else None
        if cpu_percent is None:
            cpu_percent = 0.0
        if cluster_node is not None and cluster_node.status.lower() in {"offline", "fault", "critical"}:
            node_score = 0
        else:
            node_score = max(0, min(10, round(10 - (float(cpu_percent) / 12.5))))
        return {
            "node_name": cluster_node.label if cluster_node is not None else "MAP2 Node",
            "firmware_profile": self.active_device.profile.display_name if self.active_device is not None else "Push",
            "current_preset": preset.name if preset is not None else "No preset",
            "current_snapshot": preset.name if preset is not None else "No snapshot",
            "cpu_load": f"{float(cpu_percent):.1f}%",
            "node_score": str(node_score),
            "cluster_status": cluster_node.status.title() if cluster_node is not None else "Standalone",
        }

    @staticmethod
    def _serialize_render_frame(frame: RenderFrame) -> dict[str, Any]:
        return {
            "pad_lights": {
                control_id: {
                    "color": state.color.name,
                    "brightness": state.brightness,
                    "pulse": state.pulse,
                    "blink": state.blink,
                    "label": state.label,
                }
                for control_id, state in frame.pad_lights.items()
            },
            "button_lights": {
                control_id: {
                    "color": state.color.name,
                    "brightness": state.brightness,
                    "pulse": state.pulse,
                    "blink": state.blink,
                    "label": state.label,
                }
                for control_id, state in frame.button_lights.items()
            },
            "display": {
                "title": frame.display.title,
                "lines": list(frame.display.lines),
            } if frame.display is not None else None,
        }

    async def _maybe_start_welcome(self) -> bool:
        if not self._running or not self._welcome_pending or self.active_device is None:
            return False
        if self._welcome_task is not None and not self._welcome_task.done():
            return True

        self._welcome_pending = False
        store = get_push_surface_labs_store()
        state = store.load_state()
        routine = store.selected_welcome_routine(state)
        if not isinstance(routine, dict):
            return False
        if not bool(routine.get("run_on_connect")):
            return False
        steps = routine.get("steps")
        if not isinstance(steps, list) or not steps:
            return False
        self._welcome_task = asyncio.create_task(
            self._run_welcome_routine(routine),
            name="push-surface-welcome",
        )
        return True

    async def _run_welcome_routine(self, routine: dict[str, Any]) -> None:
        if self.active_device is None:
            return
        started_device_id = self.active_device.device_id
        steps = routine.get("steps")
        if not isinstance(steps, list) or not steps:
            return
        self._welcome_skip_event = asyncio.Event()
        skipped = False
        handoff_page = self._resolve_handoff_page(str(routine.get("handoff_page") or "home"))

        try:
            for step_index, raw_step in enumerate(steps):
                if not isinstance(raw_step, dict):
                    continue
                if not self._running or self.active_device is None or self.active_device.device_id != started_device_id:
                    return
                if self._welcome_skip_event.is_set():
                    skipped = True
                    break
                frame = build_render_frame_from_welcome_step(raw_step, self._current_welcome_stats())
                self._welcome_runtime_status = {
                    "active": True,
                    "routine_id": str(routine.get("id") or ""),
                    "routine_name": str(routine.get("name") or "Welcome"),
                    "handoff_page": handoff_page.value,
                    "step_index": step_index,
                    "step_id": str(raw_step.get("id") or f"step-{step_index}"),
                    "total_steps": len(steps),
                    "started_at": time(),
                    "frame": self._serialize_render_frame(frame),
                }
                await self._send_frame(
                    frame,
                    force=True,
                    metadata={
                        "event": "welcome_routine",
                        "routine_id": str(routine.get("id") or ""),
                        "step_id": str(raw_step.get("id") or f"step-{step_index}"),
                    },
                )
                duration_s = max(0.05, float(raw_step.get("duration_ms") or 0) / 1000.0)
                try:
                    await asyncio.wait_for(self._welcome_skip_event.wait(), timeout=duration_s)
                    skipped = True
                    break
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            self._welcome_runtime_status = None
            raise
        finally:
            if self._welcome_task is asyncio.current_task():
                self._welcome_task = None
            self._welcome_skip_event = None

        if not self._running or self.active_device is None or self.active_device.device_id != started_device_id:
            self._welcome_runtime_status = None
            return

        self._welcome_runtime_status = None
        self.controller.state.active_page = handoff_page
        logger.info(
            "Push surface welcome routine completed",
            extra={
                "subsystem": "push_surface",
                "device": self.active_device.profile.profile_id,
                "event": "welcome_complete",
                "page": handoff_page.value,
                "skipped": skipped,
            },
        )
        await self.render(force=True)

    async def handle_surface_event(self, event: MidiMessage) -> None:
        if self.active_device is None or self.parser is None:
            return
        self.diagnostics.record_raw(event)
        parsed = self.parser.parse(event, device_id=self.active_device.device_id)
        self.diagnostics.record_decoded(parsed)
        if self._should_skip_welcome(parsed):
            await self._skip_welcome_playback()
        if parsed.event_type.value == "unknown_midi_event":
            self.unknown_messages += 1
        commands = self.controller.handle_event(parsed)
        for command in commands:
            await self._execute_command(command)
        self.controller.replace_data(diagnostics=self.diagnostics.snapshot())
        await self.render(urgent_controls={parsed.control_id})

    async def _execute_command(self, command: SurfaceCommand) -> None:
        if command.command_type == SurfaceCommandType.LOAD_PRESET:
            await self.bridge.load_preset(str(command.payload["preset_id"]))
            await self.refresh_state()
            return

        if command.command_type == SurfaceCommandType.TOGGLE_BYPASS:
            await self.bridge.toggle_bypass(str(command.payload["node_id"]))
            await self.refresh_state()
            return

        if command.command_type == SurfaceCommandType.UPDATE_ROUTING:
            await self.bridge.update_routing(
                str(command.payload["source_id"]),
                str(command.payload["destination_id"]),
            )
            await self.refresh_state()
            return

        if command.command_type == SurfaceCommandType.SET_PARAMETER:
            await self._schedule_parameter_write(
                str(command.payload["node_id"]),
                str(command.payload["parameter_id"]),
                command.payload["value"],
            )
            return

        if command.command_type == SurfaceCommandType.SEND_TEST_PATTERN:
            await self.send_test_pattern()
            return

        if command.command_type == SurfaceCommandType.EXPORT_DIAGNOSTICS:
            await self.export_diagnostics_bundle()
            return

        if command.command_type == SurfaceCommandType.DUMP_CAPABILITIES:
            await self.dump_capabilities()
            return

    async def _schedule_parameter_write(self, node_id: str, parameter_id: str, value: Any) -> None:
        key = (node_id, parameter_id)
        self._pending_param_values[key] = value
        task = self._pending_param_tasks.get(key)
        if task is not None and not task.done():
            task.cancel()
        self._pending_param_tasks[key] = asyncio.create_task(
            self._flush_parameter_write(key),
            name=f"push-surface-param-{parameter_id}",
        )

    async def _flush_parameter_write(self, key: tuple[str, str]) -> None:
        try:
            await asyncio.sleep(0.03)
            node_id, parameter_id = key
            value = self._pending_param_values.pop(key)
            await self.bridge.set_parameter(node_id, parameter_id, value)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Push surface parameter write failed for %s: %s", key, exc)
        finally:
            self._pending_param_tasks.pop(key, None)

    async def _consume_midi(self) -> None:
        while self._running:
            message = await self._input_queue.get()
            try:
                await self.handle_surface_event(message)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Push surface MIDI processing failed: %s", exc)

    async def _hotplug_loop(self) -> None:
        while self._running:
            await asyncio.sleep(max(0.25, float(self.config.auto_reconnect_interval_s)))
            try:
                previous = self.active_device
                current = await self.scan_devices()
                if previous != current:
                    await self.refresh_state()
                    if not await self._maybe_start_welcome():
                        await self.render()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("Push surface hotplug scan failed: %s", exc)

    async def _bridge_events_loop(self) -> None:
        while self._running:
            try:
                async for event in self.bridge.subscribe_events():
                    self.controller.apply_map2_event(event)
                    await self.refresh_state()
                    await self.render()
                    if not self._running:
                        return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.debug("Push surface bridge event loop failed: %s", exc)
                await asyncio.sleep(1.0)

    def _on_hub_message(self, message: MidiMessage) -> None:
        if not self._running or self.active_device is None or self._loop is None:
            return
        if message.source_port != self.active_device.input_port_id:
            return

        def _enqueue() -> None:
            self._input_queue.put_nowait(message)

        self._loop.call_soon_threadsafe(_enqueue)

    def _resolve_device(self, ports: list[MidiPortInfo]) -> DiscoveredPushDevice | None:
        inputs = [port for port in ports if port.direction in {"input", "duplex"}]
        outputs = [port for port in ports if port.direction in {"output", "duplex"}]
        if not inputs or not outputs:
            return None

        explicit_input = self._find_port(ports, self.config.input_port_id, self.config.input_port_name, directions={"input", "duplex"})
        explicit_output = self._find_port(ports, self.config.output_port_id, self.config.output_port_name, directions={"output", "duplex"})
        if explicit_input is not None and explicit_output is not None:
            profile = guess_profile_for_ports(
                [explicit_input.name, explicit_output.name],
                preferred_profile=self.config.preferred_profile,
            )
            return self._build_device(explicit_input, explicit_output, profile)

        best_device: DiscoveredPushDevice | None = None
        best_score = -1
        for input_port in inputs:
            for output_port in outputs:
                score = self._pair_score(input_port, output_port)
                if score < best_score:
                    continue
                profile = guess_profile_for_ports(
                    [input_port.name, output_port.name],
                    preferred_profile=self.config.preferred_profile,
                )
                if profile == GENERIC_PUSH_PROFILE and "push" not in input_port.name.lower() + output_port.name.lower():
                    continue
                best_score = score
                best_device = self._build_device(input_port, output_port, profile)
        return best_device

    @staticmethod
    def _build_device(input_port: MidiPortInfo, output_port: MidiPortInfo, profile: PushDeviceProfile) -> DiscoveredPushDevice:
        base = PushSurfaceManager._normalized_port_base(input_port.name or output_port.name)
        return DiscoveredPushDevice(
            device_id=f"{profile.profile_id}:{base}",
            input_port_id=input_port.port_id,
            output_port_id=output_port.port_id,
            input_port_name=input_port.name,
            output_port_name=output_port.name,
            profile=profile,
        )

    @staticmethod
    def _find_port(
        ports: list[MidiPortInfo],
        port_id: str | None,
        port_name: str | None,
        *,
        directions: set[str],
    ) -> MidiPortInfo | None:
        for port in ports:
            if port.direction not in directions:
                continue
            if port_id and port.port_id == port_id:
                return port
            if port_name and port.name == port_name:
                return port
        return None

    @staticmethod
    def _normalized_port_base(name: str) -> str:
        normalized = str(name or "").strip().lower()
        normalized = re.sub(r"\b(input|output|in|out|midi|port|sim)\b", "", normalized)
        normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
        return normalized or "push"

    @classmethod
    def _pair_score(cls, input_port: MidiPortInfo, output_port: MidiPortInfo) -> int:
        if input_port.port_id == output_port.port_id:
            return 1_000
        input_base = cls._normalized_port_base(input_port.name)
        output_base = cls._normalized_port_base(output_port.name)
        score = 0
        if input_base == output_base:
            score += 100
        common_tokens = set(input_base.split("-")) & set(output_base.split("-"))
        score += len({token for token in common_tokens if token}) * 10
        if "push" in input_port.name.lower() + output_port.name.lower():
            score += 50
        return score

    async def get_health(self) -> dict[str, Any]:
        bridge_health = await self.bridge.get_health()
        return {
            "running": self._running,
            "active_device": asdict(self.active_device) if self.active_device is not None else None,
            "device_capabilities": asdict(self.active_device.capabilities) if self.active_device is not None else None,
            "midi_events_in": self.diagnostics.midi_events_in,
            "midi_events_out": self.diagnostics.midi_events_out,
            "dropped_renders": self.renderer.metrics.dropped_renders if self.renderer is not None else 0,
            "reconnect_count": self.reconnect_count,
            "unknown_messages": self.unknown_messages,
            "protocol_errors": self.renderer.metrics.protocol_errors if self.renderer is not None else 0,
            "bridge": bridge_health,
            "last_capability_dump": self._last_capability_dump,
            "last_diagnostics_export": self._last_diagnostics_export,
            "welcome_runtime": self._welcome_runtime_status,
        }


_push_surface_manager: PushSurfaceManager | None = None


def get_push_surface_manager() -> PushSurfaceManager:
    """Return the process-wide Push surface manager singleton."""

    global _push_surface_manager
    if _push_surface_manager is None:
        _push_surface_manager = PushSurfaceManager()
    return _push_surface_manager
