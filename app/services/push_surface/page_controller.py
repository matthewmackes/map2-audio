"""Page/state controller for the Push surface subsystem."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any

from app.services.push_surface.config import PushSurfaceConfig
from app.services.push_surface.models.events import Map2Event, Map2EventType, SurfaceEvent, SurfaceEventType
from app.services.push_surface.models.render_state import RenderFrame
from app.services.push_surface.models.state import ChainSummary, ClusterNode, PageId, ParameterModel, PresetSummary, PushSurfaceState, RoutingState
from app.services.push_surface.pages.chains import build_chains_page
from app.services.push_surface.pages.cluster import build_cluster_page
from app.services.push_surface.pages.diagnostics import build_diagnostics_page
from app.services.push_surface.pages.home import build_home_page
from app.services.push_surface.pages.node_detail import build_node_detail_page
from app.services.push_surface.pages.parameters import build_parameters_page
from app.services.push_surface.pages.presets import build_presets_page
from app.services.push_surface.pages.routing import build_routing_page


class SurfaceCommandType(str, Enum):
    """Commands emitted by page interactions."""

    LOAD_PRESET = "load_preset"
    SET_PARAMETER = "set_parameter"
    TOGGLE_BYPASS = "toggle_bypass"
    UPDATE_ROUTING = "update_routing"
    SEND_TEST_PATTERN = "send_test_pattern"
    EXPORT_DIAGNOSTICS = "export_diagnostics"
    DUMP_CAPABILITIES = "dump_capabilities"


@dataclass(frozen=True)
class SurfaceCommand:
    """One action for the manager to execute against the bridge or diagnostics."""

    command_type: SurfaceCommandType
    payload: dict[str, Any] = field(default_factory=dict)
    refresh_after: bool = True


class PushPageController:
    """Hold controller state and translate events into page actions."""

    def __init__(self, config: PushSurfaceConfig):
        self.config = config
        self.state = PushSurfaceState(safe_mode=bool(config.safe_mode))
        self._last_pad_press_control_id: str | None = None
        self._last_pad_press_page: PageId | None = None

    def replace_data(
        self,
        *,
        presets: list[PresetSummary] | None = None,
        chains: list[ChainSummary] | None = None,
        routing: RoutingState | None = None,
        cluster_nodes: list[ClusterNode] | None = None,
        diagnostics=None,
        warnings: list[str] | None = None,
        faults: list[str] | None = None,
    ) -> None:
        if presets is not None:
            self.state.presets = list(presets)
        if chains is not None:
            self.state.chains = list(chains)
        if routing is not None:
            self.state.routing = routing
        if cluster_nodes is not None:
            self.state.cluster_nodes = list(cluster_nodes)
        if diagnostics is not None:
            self.state.diagnostics = diagnostics
        if warnings is not None:
            self.state.warnings = list(warnings)
        if faults is not None:
            self.state.faults = list(faults)
        self._normalize_selection()

    def handle_event(self, event: SurfaceEvent) -> list[SurfaceCommand]:
        commands: list[SurfaceCommand] = []
        if event.control_id in {"page_home", "page_chains", "page_node_detail", "page_parameters", "page_presets", "page_routing", "page_cluster", "page_diagnostics"} and event.event_type == SurfaceEventType.BUTTON_PRESS:
            self.state.active_page = PageId(event.control_id.removeprefix("page_"))
            self._normalize_selection()
            return commands

        if event.control_id in {"back", "home"} and event.event_type == SurfaceEventType.BUTTON_PRESS:
            self.state.active_page = PageId.HOME
            return commands

        if event.control_id == "shift":
            self.state.shift_pressed = event.event_type == SurfaceEventType.BUTTON_PRESS
            self.state.encoder_fine_mode = self.state.shift_pressed
            return commands

        if event.control_id == "nav_left" and event.event_type == SurfaceEventType.BUTTON_PRESS:
            if self.state.active_page == PageId.PARAMETERS:
                self.state.parameter_bank_index = max(0, self.state.parameter_bank_index - 1)
            return commands

        if event.control_id == "nav_right" and event.event_type == SurfaceEventType.BUTTON_PRESS:
            if self.state.active_page == PageId.PARAMETERS:
                self.state.parameter_bank_index += 1
            return commands

        if event.control_id == "bypass" and event.event_type == SurfaceEventType.BUTTON_PRESS:
            node = self.state.current_node()
            if node is not None:
                commands.append(
                    SurfaceCommand(
                        command_type=SurfaceCommandType.TOGGLE_BYPASS,
                        payload={"node_id": node.id},
                    )
                )
            return commands

        if event.event_type == SurfaceEventType.PAD_PRESS:
            commands.extend(self._handle_pad_press(event.control_id))
            return commands

        if event.event_type == SurfaceEventType.ENCODER_TURN and self.state.active_page == PageId.PARAMETERS:
            commands.extend(self._handle_encoder_turn(event.control_id, event.delta))
            return commands

        if event.control_id == "confirm" and event.event_type == SurfaceEventType.BUTTON_PRESS:
            commands.extend(self._confirm_pending_route())
            return commands

        return commands

    def apply_map2_event(self, event: Map2Event) -> None:
        if event.event_type == Map2EventType.PRESET_LOADED:
            preset_id = event.payload.get("preset_id")
            if preset_id is not None:
                self.state.selected_preset_id = str(preset_id)
        elif event.event_type == Map2EventType.CHAIN_SELECTED:
            chain_id = event.payload.get("chain_id")
            if chain_id is not None:
                self.state.selected_chain_id = str(chain_id)
        elif event.event_type == Map2EventType.NODE_SELECTED:
            node_id = event.payload.get("node_id")
            if node_id is not None:
                self.state.selected_node_id = str(node_id)
        elif event.event_type == Map2EventType.WARNING_RAISED:
            warning = str(event.payload.get("message") or "")
            if warning:
                self.state.warnings.append(warning)
        elif event.event_type == Map2EventType.FAULT_RAISED:
            fault = str(event.payload.get("message") or "")
            if fault:
                self.state.faults.append(fault)
        self._normalize_selection()

    def build_render_frame(self) -> RenderFrame:
        page_map = {
            PageId.HOME: build_home_page,
            PageId.CHAINS: build_chains_page,
            PageId.NODE_DETAIL: build_node_detail_page,
            PageId.PARAMETERS: build_parameters_page,
            PageId.PRESETS: build_presets_page,
            PageId.ROUTING: build_routing_page,
            PageId.CLUSTER: build_cluster_page,
            PageId.DIAGNOSTICS: build_diagnostics_page,
        }
        frame = page_map[self.state.active_page](self.state, self.config)
        self.state.last_render = frame
        return frame

    def _handle_pad_press(self, control_id: str) -> list[SurfaceCommand]:
        commands: list[SurfaceCommand] = []
        index = self._grid_index_for_control(control_id)
        if index is None:
            return commands

        if self.state.active_page == PageId.HOME:
            if index >= len(self.state.chains):
                return commands
            chain = self.state.chains[index]
            open_requested = (
                self._last_pad_press_page == PageId.HOME
                and self._last_pad_press_control_id == control_id
            )
            if open_requested:
                self.state.active_page = PageId.CHAINS
            self.state.selected_chain_id = chain.id
            self.state.selected_node_id = None
            self._last_pad_press_control_id = control_id
            self._last_pad_press_page = PageId.HOME
            return commands

        if self.state.active_page == PageId.CHAINS:
            chain = self.state.current_chain()
            if chain is None or index >= len(chain.nodes):
                return commands
            node = chain.nodes[index]
            open_requested = (
                self._last_pad_press_page == PageId.CHAINS
                and self._last_pad_press_control_id == control_id
            )
            if open_requested:
                self.state.active_page = PageId.NODE_DETAIL
            self.state.selected_node_id = node.id
            self._last_pad_press_control_id = control_id
            self._last_pad_press_page = PageId.CHAINS
            return commands

        if self.state.active_page == PageId.PRESETS:
            if index >= len(self.state.presets):
                return commands
            preset = self.state.presets[index]
            self.state.selected_preset_id = preset.id
            commands.append(
                SurfaceCommand(
                    command_type=SurfaceCommandType.LOAD_PRESET,
                    payload={"preset_id": preset.id},
                )
            )
            return commands

        if self.state.active_page == PageId.ROUTING:
            routing = self.state.routing
            x = index % 8
            y = index // 8
            if x >= len(routing.sources) or y >= len(routing.destinations):
                return commands
            self.state.pending_route_source = routing.sources[x]
            self.state.pending_route_destination = routing.destinations[y]
            if self.state.safe_mode:
                self.state.routing = replace(routing, pending_confirmation=True)
                return commands
            return self._confirm_pending_route()

        if self.state.active_page == PageId.CLUSTER:
            if index >= len(self.state.cluster_nodes):
                return commands
            self.state.selected_cluster_node_id = self.state.cluster_nodes[index].id
            return commands

        if self.state.active_page == PageId.DIAGNOSTICS:
            if index == 0:
                commands.append(SurfaceCommand(command_type=SurfaceCommandType.SEND_TEST_PATTERN, refresh_after=False))
            elif index == 1:
                commands.append(SurfaceCommand(command_type=SurfaceCommandType.EXPORT_DIAGNOSTICS, refresh_after=False))
            elif index == 2:
                commands.append(SurfaceCommand(command_type=SurfaceCommandType.DUMP_CAPABILITIES, refresh_after=False))
            return commands

        return commands

    def _handle_encoder_turn(self, control_id: str, delta: int) -> list[SurfaceCommand]:
        node = self.state.current_node()
        if node is None:
            return []
        try:
            encoder_index = int(control_id.rsplit("_", 1)[1])
        except (IndexError, ValueError):
            return []
        bank_size = max(1, int(self.config.bank_size))
        parameter_index = (self.state.parameter_bank_index * bank_size) + encoder_index
        if parameter_index >= len(node.parameters):
            return []
        parameter = node.parameters[parameter_index]
        updated_parameter = parameter.with_adjusted_value(
            delta,
            fine=self.state.encoder_fine_mode,
            acceleration=float(self.config.encoder_acceleration),
        )
        updated_params = list(node.parameters)
        updated_params[parameter_index] = updated_parameter
        updated_node = replace(node, parameters=tuple(updated_params))
        self._replace_current_node(updated_node)
        return [
            SurfaceCommand(
                command_type=SurfaceCommandType.SET_PARAMETER,
                payload={
                    "node_id": node.id,
                    "parameter_id": updated_parameter.id,
                    "value": updated_parameter.value,
                },
            )
        ]

    def _confirm_pending_route(self) -> list[SurfaceCommand]:
        if not self.state.pending_route_source or not self.state.pending_route_destination:
            return []
        routing = self.state.routing
        self.state.routing = replace(routing, pending_confirmation=False)
        command = SurfaceCommand(
            command_type=SurfaceCommandType.UPDATE_ROUTING,
            payload={
                "source_id": self.state.pending_route_source,
                "destination_id": self.state.pending_route_destination,
            },
        )
        self.state.pending_route_source = None
        self.state.pending_route_destination = None
        return [command]

    def _replace_current_node(self, replacement_node) -> None:
        chain = self.state.current_chain()
        if chain is None:
            return
        updated_nodes = [replacement_node if node.id == replacement_node.id else node for node in chain.nodes]
        updated_chain = replace(chain, nodes=tuple(updated_nodes))
        self.state.chains = [updated_chain if item.id == updated_chain.id else item for item in self.state.chains]

    def _normalize_selection(self) -> None:
        current_preset = self.state.current_preset()
        if current_preset is not None:
            self.state.selected_preset_id = current_preset.id

        current_chain = self.state.current_chain()
        if current_chain is not None:
            self.state.selected_chain_id = current_chain.id
            if current_chain.nodes:
                node = self.state.current_node()
                if node is not None:
                    self.state.selected_node_id = node.id
        else:
            self.state.selected_chain_id = None
            self.state.selected_node_id = None

    @staticmethod
    def _grid_index_for_control(control_id: str) -> int | None:
        if not control_id.startswith("grid_"):
            return None
        try:
            _prefix, x_str, y_str = control_id.split("_", 2)
            return (int(y_str) * 8) + int(x_str)
        except (TypeError, ValueError):
            return None
