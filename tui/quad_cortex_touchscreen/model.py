"""State model for the Quad Cortex touchscreen Textual app."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import StrEnum


GRID_ROWS = 4
GRID_COLUMNS = 8
GIG_ROWS = 2
GIG_COLUMNS = 4
STOMP_SLOTS = 8
GRID_PLUGIN_START_INDEX = 1
GRID_PLUGIN_END_INDEX = (GRID_ROWS * GRID_COLUMNS) - 2


class OperatingMode(StrEnum):
    """User-facing Quad Cortex modes in scope for this app."""

    CHAIN = "chain"
    STOMP = "stomp"

    @property
    def label(self) -> str:
        return self.value.upper()


class TouchscreenView(StrEnum):
    """Primary touchscreen surfaces."""

    GRID = "grid"
    GIG = "gig"

    @property
    def label(self) -> str:
        return "GIG VIEW" if self is TouchscreenView.GIG else "THE GRID"


class FocusRegion(StrEnum):
    """High-level focus groups for Tab cycling."""

    HEADER = "header"
    CONTENT = "content"
    CONTEXT = "context"


class EffectFamily(StrEnum):
    """Color-coded effect families."""

    SIGNAL_IO = "signal-io"
    DYNAMICS = "dynamics"
    DRIVE = "drive"
    AMP = "amp"
    MODULATION = "modulation"
    DELAY = "delay"
    REVERB = "reverb"
    PITCH_FILTER = "pitch-filter"
    UTILITY = "utility"

    @property
    def css_class(self) -> str:
        return f"fx-{self.value}"


@dataclass(slots=True)
class MidiStatus:
    """Live MIDI status shown in the header."""

    available: bool = False
    enabled: bool = False
    connected: bool = False
    last_message: str = "Awaiting MIDI"
    pulse_step: int = 0
    recent_activity: bool = False

    @property
    def pulse(self) -> str:
        if not self.connected and not self.enabled:
            return "--"
        frames = ("..", "o.", "oo", ".o")
        return frames[self.pulse_step % len(frames)]

    def tick(self) -> None:
        if self.connected or self.enabled:
            self.pulse_step = (self.pulse_step + 1) % 4


@dataclass(slots=True)
class AudioStatus:
    """Live audio engine status shown in the header."""

    available: bool = False
    running: bool = False
    latency_ms: float = 0.0
    cpu_load: float = 0.0
    sample_rate: int = 0
    buffer_size: int = 0
    xruns: int = 0

    @property
    def io_status(self) -> str:
        if self.sample_rate <= 0 or self.buffer_size <= 0:
            return "I/O Unavailable"
        rate_khz = self.sample_rate / 1000.0
        return f"{rate_khz:.1f}k / {self.buffer_size}"

    @property
    def running_label(self) -> str:
        if not self.available:
            return "AUDIO DOWN"
        return "AUDIO RUN" if self.running else "AUDIO IDLE"


@dataclass(slots=True)
class BlockState:
    """A single routing slot in the 4x8 grid."""

    block_id: str
    plugin_uri: str | None
    plugin_position: int | None
    row: int
    column: int
    category: str
    family: EffectFamily
    name: str
    short_name: str
    detail: str
    params: str
    route_hint: str
    bypassed: bool = False
    stomp_slot: int | None = None
    virtual: bool = False

    @property
    def can_toggle(self) -> bool:
        return not self.virtual and self.plugin_uri is not None

    @property
    def is_assigned(self) -> bool:
        return self.stomp_slot is not None


@dataclass(slots=True)
class StompAssignment:
    """A live stomp slot shown in Gig View."""

    slot: int
    label: str
    block_id: str | None
    plugin_uri: str | None
    plugin_position: int | None
    family: EffectFamily | None
    bypassed: bool = True

    @property
    def assigned(self) -> bool:
        return self.block_id is not None and self.plugin_uri is not None


@dataclass(slots=True)
class ChainState:
    """One live backend chain shown on the touchscreen."""

    chain_id: int | None
    name: str
    descriptor: str
    display_family: EffectFamily
    is_active: bool = False
    plugin_count: int = 0
    blocks: list[BlockState] = field(default_factory=list)
    stomp_assignments: list[StompAssignment] = field(default_factory=list)
    overflow_count: int = 0


@dataclass(slots=True)
class GigTileState:
    """Normalized Gig View tile content."""

    index: int
    title: str
    subtitle: str
    family: EffectFamily | None
    active: bool
    assigned: bool
    bypassed: bool = False


@dataclass(slots=True)
class TouchscreenState:
    """Top-level app state."""

    chains: list[ChainState] = field(default_factory=list)
    mode: OperatingMode = OperatingMode.CHAIN
    view: TouchscreenView = TouchscreenView.GRID
    focus_region: FocusRegion = FocusRegion.CONTENT
    selected_grid_index: int = GRID_PLUGIN_START_INDEX
    selected_gig_index: int = 0
    header_focus_index: int = 0
    midi_status: MidiStatus = field(default_factory=MidiStatus)
    audio_status: AudioStatus = field(default_factory=AudioStatus)
    footer_status: str = "Connecting to backend"
    backend_connected: bool = False
    backend_message: str = "Connecting to backend"
    current_chain_index: int = 0

    @property
    def active_chain(self) -> ChainState:
        if self.chains:
            index = min(max(self.current_chain_index, 0), len(self.chains) - 1)
            return self.chains[index]
        return build_placeholder_chain(
            name="NO ACTIVE CHAIN",
            descriptor=self.backend_message,
            family=EffectFamily.UTILITY,
            active=False,
        )

    @property
    def active_chain_id(self) -> int | None:
        return self.active_chain.chain_id

    @property
    def chain_name(self) -> str:
        return self.active_chain.name

    def grid_blocks(self) -> dict[tuple[int, int], BlockState]:
        return {(block.row, block.column): block for block in self.active_chain.blocks}

    def block_at(self, row: int, column: int) -> BlockState | None:
        return self.grid_blocks().get((row, column))

    def selected_grid_position(self) -> tuple[int, int]:
        return divmod(self.selected_grid_index, GRID_COLUMNS)

    def selected_tile_position(self) -> tuple[int, int]:
        return divmod(self.selected_gig_index, GIG_COLUMNS)

    def selected_block(self) -> BlockState | None:
        row, column = self.selected_grid_position()
        return self.block_at(row, column)

    def selected_stomp_assignment(self) -> StompAssignment | None:
        if self.mode is not OperatingMode.STOMP:
            return None
        if not self.active_chain.stomp_assignments:
            return None
        if self.selected_gig_index < 0 or self.selected_gig_index >= len(self.active_chain.stomp_assignments):
            return None
        return self.active_chain.stomp_assignments[self.selected_gig_index]

    def selected_block_summary(self) -> str:
        if not self.chains or self.active_chain.chain_id is None:
            return self.backend_message
        block = self.selected_block()
        if block is None:
            return "Empty slot"
        state = "BYPASSED" if block.bypassed else "ACTIVE"
        stomp = f"S{block.stomp_slot}" if block.stomp_slot is not None else "--"
        return f"{block.name}  {state}  {stomp}"

    def chain_page_start(self) -> int:
        if not self.chains:
            return 0
        return (self.current_chain_index // STOMP_SLOTS) * STOMP_SLOTS

    def chain_for_gig_index(self, index: int) -> ChainState | None:
        global_index = self.chain_page_start() + index
        if global_index < 0 or global_index >= len(self.chains):
            return None
        return self.chains[global_index]

    def gig_tiles(self) -> list[GigTileState]:
        if self.mode is OperatingMode.CHAIN:
            tiles: list[GigTileState] = []
            for index in range(STOMP_SLOTS):
                chain = self.chain_for_gig_index(index)
                if chain is None or chain.chain_id is None:
                    tiles.append(
                        GigTileState(
                            index=index,
                            title=f"C{self.chain_page_start() + index + 1}",
                            subtitle="No Chain",
                            family=None,
                            active=False,
                            assigned=False,
                        )
                    )
                    continue
                tiles.append(
                    GigTileState(
                        index=index,
                        title=chain.name,
                        subtitle=chain.descriptor,
                        family=chain.display_family,
                        active=(self.chain_page_start() + index) == self.current_chain_index,
                        assigned=True,
                    )
                )
            return tiles

        assignments = list(self.active_chain.stomp_assignments)
        while len(assignments) < STOMP_SLOTS:
            slot = len(assignments) + 1
            assignments.append(
                StompAssignment(
                    slot=slot,
                    label="Unassigned",
                    block_id=None,
                    plugin_uri=None,
                    plugin_position=None,
                    family=None,
                    bypassed=True,
                )
            )

        return [
            GigTileState(
                index=assignment.slot - 1,
                title=f"S{assignment.slot}",
                subtitle=assignment.label,
                family=assignment.family,
                active=assignment.assigned and not assignment.bypassed,
                assigned=assignment.assigned,
                bypassed=assignment.bypassed,
            )
            for assignment in assignments[:STOMP_SLOTS]
        ]

    def set_mode(self, mode: OperatingMode) -> None:
        self.mode = mode
        self.selected_gig_index = self.current_chain_index % STOMP_SLOTS if mode is OperatingMode.CHAIN else 0
        self.footer_status = f"Mode set to {mode.label}"

    def set_view(self, view: TouchscreenView) -> None:
        self.view = view
        if view is TouchscreenView.GIG:
            self.selected_gig_index = self.current_chain_index % STOMP_SLOTS if self.mode is OperatingMode.CHAIN else 0
        self.footer_status = f"View set to {view.label}"

    def toggle_view(self) -> None:
        if self.view is TouchscreenView.GRID:
            self.set_view(TouchscreenView.GIG)
        else:
            self.set_view(TouchscreenView.GRID)

    def cycle_focus_region(self, *, forward: bool = True) -> None:
        order = [FocusRegion.HEADER, FocusRegion.CONTENT, FocusRegion.CONTEXT]
        current_index = order.index(self.focus_region)
        delta = 1 if forward else -1
        self.focus_region = order[(current_index + delta) % len(order)]
        self.footer_status = f"Focus: {self.focus_region.value}"

    def move_header_focus(self, delta: int) -> None:
        self.header_focus_index = (self.header_focus_index + delta) % 2

    def move_selection(self, dx: int, dy: int) -> None:
        if self.view is TouchscreenView.GRID:
            row, column = self.selected_grid_position()
            row = (row + dy) % GRID_ROWS
            column = (column + dx) % GRID_COLUMNS
            self.selected_grid_index = row * GRID_COLUMNS + column
            self.footer_status = f"Selected grid slot R{row + 1} C{column + 1}"
            return

        row, column = self.selected_tile_position()
        row = (row + dy) % GIG_ROWS
        column = (column + dx) % GIG_COLUMNS
        self.selected_gig_index = row * GIG_COLUMNS + column
        self.footer_status = f"Selected tile {self.selected_gig_index + 1}"

    def next_chain_index(self, delta: int) -> int | None:
        if not self.chains:
            return None
        return (self.current_chain_index + delta) % len(self.chains)

    def build_updated_stomp_assignments_for_selected_block(self) -> list[StompAssignment] | None:
        block = self.selected_block()
        if block is None or not block.can_toggle:
            return None

        assignments = [replace(assignment) for assignment in self.active_chain.stomp_assignments]
        if not assignments:
            assignments = empty_stomp_assignments()

        for assignment in assignments:
            if assignment.block_id == block.block_id:
                assignment.label = "Unassigned"
                assignment.block_id = None
                assignment.plugin_uri = None
                assignment.plugin_position = None
                assignment.family = None
                assignment.bypassed = True
                return assignments

        empty_slot = next((assignment for assignment in assignments if not assignment.assigned), None)
        if empty_slot is None:
            return None

        empty_slot.label = block.name
        empty_slot.block_id = block.block_id
        empty_slot.plugin_uri = block.plugin_uri
        empty_slot.plugin_position = block.plugin_position
        empty_slot.family = block.family
        empty_slot.bypassed = block.bypassed
        return assignments

    def tick_visuals(self) -> None:
        self.midi_status.tick()


def empty_stomp_assignments() -> list[StompAssignment]:
    return [
        StompAssignment(
            slot=slot,
            label="Unassigned",
            block_id=None,
            plugin_uri=None,
            plugin_position=None,
            family=None,
            bypassed=True,
        )
        for slot in range(1, STOMP_SLOTS + 1)
    ]


def build_placeholder_chain(
    *,
    name: str,
    descriptor: str,
    family: EffectFamily,
    active: bool,
) -> ChainState:
    return ChainState(
        chain_id=None,
        name=name,
        descriptor=descriptor,
        display_family=family,
        is_active=active,
        plugin_count=0,
        blocks=[],
        stomp_assignments=empty_stomp_assignments(),
        overflow_count=0,
    )


def build_placeholder_state(message: str = "Connecting to backend") -> TouchscreenState:
    return TouchscreenState(
        chains=[],
        footer_status=message,
        backend_connected=False,
        backend_message=message,
    )
