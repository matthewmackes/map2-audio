"""Shared state models for Push pages and bridges."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any

from app.services.push_surface.models.capabilities import SurfaceColor
from app.services.push_surface.models.render_state import RenderFrame


class PageId(str, Enum):
    """Hardware pages exposed by the surface."""

    HOME = "home"
    CHAINS = "chains"
    NODE_DETAIL = "node_detail"
    PARAMETERS = "parameters"
    PRESETS = "presets"
    ROUTING = "routing"
    CLUSTER = "cluster"
    DIAGNOSTICS = "diagnostics"


class ParameterKind(str, Enum):
    """Supported parameter scaling/display modes."""

    LINEAR = "linear"
    LOGARITHMIC = "logarithmic"
    ENUM = "enumerated"
    TOGGLE = "toggle"
    BIPOLAR = "bipolar"
    STEPPED = "stepped"


@dataclass(frozen=True)
class ParameterModel:
    """Normalized parameter model for a selected node."""

    id: str
    name: str
    kind: ParameterKind = ParameterKind.LINEAR
    value: float | int | str | bool = 0.0
    default_value: float | int | str | bool = 0.0
    min_value: float = 0.0
    max_value: float = 1.0
    display_value: str | None = None
    step_values: tuple[float | int | str | bool, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)

    def with_adjusted_value(self, delta: int, *, fine: bool = False, acceleration: float = 1.0) -> "ParameterModel":
        if self.kind == ParameterKind.TOGGLE:
            next_value = bool(delta > 0) if delta != 0 else bool(self.value)
            return replace(self, value=next_value)

        if self.kind in {ParameterKind.ENUM, ParameterKind.STEPPED} and self.step_values:
            current_index = 0
            try:
                current_index = self.step_values.index(self.value)
            except ValueError:
                current_index = 0
            direction = 1 if delta > 0 else -1 if delta < 0 else 0
            next_index = min(max(current_index + direction, 0), len(self.step_values) - 1)
            return replace(self, value=self.step_values[next_index])

        try:
            current_value = float(self.value)
        except (TypeError, ValueError):
            current_value = float(self.min_value)

        span = max(self.max_value - self.min_value, 1e-6)
        divisor = 256.0 if fine else 96.0
        step_size = (span / divisor) * max(1.0, float(acceleration))
        next_value = current_value + (step_size * float(delta))
        next_value = min(max(next_value, self.min_value), self.max_value)
        if self.kind == ParameterKind.STEPPED:
            next_value = round(next_value)
        return replace(self, value=next_value)

    @property
    def display_text(self) -> str:
        if self.display_value:
            return self.display_value
        value = self.value
        if isinstance(value, bool):
            return "On" if value else "Off"
        if isinstance(value, float):
            return f"{value:.3f}".rstrip("0").rstrip(".")
        return str(value)


@dataclass(frozen=True)
class NodeSummary:
    """Normalized plugin/node summary."""

    id: str
    chain_id: str
    name: str
    node_type: str
    category: str
    bypassed: bool = False
    selected: bool = False
    color_hint: SurfaceColor = SurfaceColor.CYAN
    parameters: tuple[ParameterModel, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ChainSummary:
    """Normalized chain summary."""

    id: str
    name: str
    nodes: tuple[NodeSummary, ...] = ()
    is_active: bool = False
    health: str = "healthy"
    warning: str | None = None
    selected: bool = False


@dataclass(frozen=True)
class PresetSummary:
    """Normalized preset/snapshot summary."""

    id: str
    name: str
    program_number: int | None = None
    is_active: bool = False
    is_favorite: bool = False
    selected: bool = False


@dataclass(frozen=True)
class RoutingSlot:
    """One routing matrix cell."""

    source_id: str
    destination_id: str
    active: bool = False
    preview: bool = False
    label: str | None = None


@dataclass(frozen=True)
class RoutingState:
    """Normalized routing matrix and selection state."""

    mode: str = "parallel_blend"
    sources: tuple[str, ...] = ()
    destinations: tuple[str, ...] = ()
    slots: tuple[RoutingSlot, ...] = ()
    selected_source: str | None = None
    selected_destination: str | None = None
    pending_confirmation: bool = False


@dataclass(frozen=True)
class ClusterNode:
    """Normalized cluster-node summary."""

    id: str
    label: str
    status: str
    selected: bool = False
    cpu_percent: float | None = None
    response_time_ms: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DiagnosticsSnapshot:
    """Current diagnostics view state."""

    raw_events: tuple[str, ...] = ()
    decoded_events: tuple[str, ...] = ()
    last_render_summary: str = ""
    render_count: int = 0
    midi_events_in: int = 0
    midi_events_out: int = 0


@dataclass
class PushSurfaceState:
    """Mutable controller state backing page selection and render output."""

    active_page: PageId = PageId.HOME
    selected_preset_id: str | None = None
    selected_chain_id: str | None = None
    selected_node_id: str | None = None
    selected_cluster_node_id: str | None = None
    parameter_bank_index: int = 0
    shift_pressed: bool = False
    encoder_fine_mode: bool = False
    safe_mode: bool = True
    pending_route_source: str | None = None
    pending_route_destination: str | None = None
    chains: list[ChainSummary] = field(default_factory=list)
    presets: list[PresetSummary] = field(default_factory=list)
    routing: RoutingState = field(default_factory=RoutingState)
    cluster_nodes: list[ClusterNode] = field(default_factory=list)
    diagnostics: DiagnosticsSnapshot = field(default_factory=DiagnosticsSnapshot)
    warnings: list[str] = field(default_factory=list)
    faults: list[str] = field(default_factory=list)
    last_render: RenderFrame | None = None

    def current_chain(self) -> ChainSummary | None:
        if not self.chains:
            return None
        if self.selected_chain_id is not None:
            for chain in self.chains:
                if chain.id == self.selected_chain_id:
                    return chain
        return self.chains[0]

    def current_node(self) -> NodeSummary | None:
        chain = self.current_chain()
        if chain is None or not chain.nodes:
            return None
        if self.selected_node_id is not None:
            for node in chain.nodes:
                if node.id == self.selected_node_id:
                    return node
        return chain.nodes[0]

    def current_preset(self) -> PresetSummary | None:
        if not self.presets:
            return None
        if self.selected_preset_id is not None:
            for preset in self.presets:
                if preset.id == self.selected_preset_id:
                    return preset
        for preset in self.presets:
            if preset.is_active:
                return preset
        return self.presets[0]
