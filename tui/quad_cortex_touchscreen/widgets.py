"""Widgets for the Quad Cortex touchscreen Textual app."""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Grid, Horizontal, Vertical
from textual.events import Click, MouseDown
from textual.message import Message
from textual.widget import Widget
from textual.widgets import Static

from .model import (
    EffectFamily,
    FocusRegion,
    GIG_COLUMNS,
    GIG_ROWS,
    GRID_COLUMNS,
    GRID_ROWS,
    GigTileState,
    OperatingMode,
    TouchscreenState,
)


class HeaderControl(Static):
    """Compact clickable control in the header."""

    can_focus = True

    class Activated(Message):
        """Raised when a header control is activated."""

        def __init__(self, control_name: str) -> None:
            self.control_name = control_name
            super().__init__()

    def __init__(self, control_name: str, *, control_id: str) -> None:
        super().__init__("", id=control_id, classes="qc-header-control")
        self.control_name = control_name

    def sync(self, label: str, *, focused: bool) -> None:
        self.update(label)
        self.set_class(focused, "-focused")

    def on_click(self, event: Click) -> None:
        event.stop()
        self.post_message(self.Activated(self.control_name))

    def on_mouse_down(self, event: MouseDown) -> None:
        event.stop()
        self.post_message(self.Activated(self.control_name))


class ModeBadge(Static):
    """Current mode indicator in the top-right header cluster."""

    can_focus = True

    class Activated(Message):
        """Raised when the mode badge is clicked."""

        def __init__(self) -> None:
            super().__init__()

    def __init__(self) -> None:
        super().__init__("", id="qc-mode-badge")

    def sync(self, mode: OperatingMode, *, focused: bool) -> None:
        self.update(f"MODE  {mode.label}")
        self.set_class(focused, "-focused")

    def on_click(self, event: Click) -> None:
        event.stop()
        self.post_message(self.Activated())

    def on_mouse_down(self, event: MouseDown) -> None:
        event.stop()
        self.post_message(self.Activated())


class HeaderBar(Widget):
    """Preset header and mode/status region."""

    def compose(self) -> ComposeResult:
        with Horizontal(id="qc-header-shell"):
            with Vertical(id="qc-header-left"):
                yield Static("", id="qc-chain-name")
                yield Static("", id="qc-chain-meta")
            with Vertical(id="qc-header-right"):
                with Horizontal(id="qc-header-control-strip"):
                    yield HeaderControl("view", control_id="qc-view-chip")
                    yield ModeBadge()
                yield Static("", id="qc-status-strip")

    def sync(self, state: TouchscreenState) -> None:
        focused_header = state.focus_region is FocusRegion.HEADER
        compact = self.app.size.width < 110
        narrow = self.app.size.width < 92
        self.query_one("#qc-chain-name", Static).update(state.chain_name)
        if state.chains:
            chain_meta = f"{state.active_chain.descriptor}  |  {state.selected_block_summary()}"
        else:
            chain_meta = state.backend_message
        if compact:
            block = state.selected_block()
            if state.chains:
                chain_meta = f"{state.active_chain.descriptor}  |  {block.short_name if block else 'EMPTY'}"
            else:
                chain_meta = state.backend_message
        if narrow:
            chain_meta = state.selected_block_summary()
        self.query_one("#qc-chain-meta", Static).update(chain_meta)
        self.query_one("#qc-view-chip", HeaderControl).sync(
            f"VIEW  {state.view.label}",
            focused=focused_header and state.header_focus_index == 0,
        )
        self.query_one("#qc-mode-badge", ModeBadge).sync(
            state.mode,
            focused=focused_header and state.header_focus_index == 1,
        )
        audio = state.audio_status
        midi = state.midi_status
        if narrow:
            status = "  ".join(
                (
                    f"C {audio.cpu_load:.0f}%",
                    f"L {audio.latency_ms:.2f}",
                    f"M {midi.pulse}",
                )
            )
        elif compact:
            status = "  ".join(
                (
                    audio.running_label,
                    f"CPU {audio.cpu_load:.0f}%",
                    f"I/O {audio.io_status}",
                    f"MIDI {midi.pulse}",
                )
            )
        else:
            status = "  ".join(
                (
                    audio.running_label,
                    f"CPU {audio.cpu_load:.0f}%",
                    f"LAT {audio.latency_ms:.2f}ms",
                    f"I/O {audio.io_status}",
                    f"XRUN {audio.xruns}",
                    f"MIDI {midi.pulse} {midi.last_message}",
                )
            )
        self.query_one("#qc-status-strip", Static).update(status)


class GridCell(Static):
    """A single cell inside the 4x8 routing matrix."""

    can_focus = True

    class Selected(Message):
        """Raised when a grid cell is selected."""

        def __init__(self, index: int) -> None:
            self.index = index
            super().__init__()

    def __init__(self, index: int) -> None:
        row, column = divmod(index, GRID_COLUMNS)
        super().__init__("", id=f"qc-grid-cell-{index}", classes="qc-grid-cell")
        self.index = index
        self.row = row
        self.column = column

    def sync(self, state: TouchscreenState, *, flow_phase: int) -> None:
        block = state.block_at(self.row, self.column)
        selected = state.selected_grid_index == self.index
        content_active = state.focus_region is FocusRegion.CONTENT and state.view.value == "grid"
        density = _density_mode(self.region.width or self.size.width, self.region.height or self.size.height)

        for family in EffectFamily:
            self.remove_class(family.css_class)

        self.set_class(selected, "-selected")
        self.set_class(content_active and selected, "-region-active")
        self.set_class(block is None, "-empty")
        self.set_class(block is not None and block.bypassed, "-bypassed")

        if block is None:
            self.update(_render_empty_grid_cell(self.row, self.column, density))
            return

        self.add_class(block.family.css_class)
        flow = _flow_frame(block.route_hint, flow_phase)
        badge = f"S{block.stomp_slot}" if block.stomp_slot is not None else "--"
        state_line = "BYP" if block.bypassed else "LIVE"
        self.update(_render_grid_cell(block.short_name, block.category, block.params, badge, state_line, flow, density))

    def on_click(self, event: Click) -> None:
        event.stop()
        self.post_message(self.Selected(self.index))

    def on_mouse_down(self, event: MouseDown) -> None:
        event.stop()
        self.post_message(self.Selected(self.index))


class GridView(Widget):
    """Primary 4x8 routing view."""

    def __init__(self) -> None:
        super().__init__(id="qc-grid-view")
        self._cells: list[GridCell] = [GridCell(index) for index in range(GRID_ROWS * GRID_COLUMNS)]

    def compose(self) -> ComposeResult:
        with Horizontal(id="qc-grid-shell"):
            with Vertical(id="qc-grid-rows"):
                for row_label in ("A", "B", "C", "D"):
                    yield Static(f"ROW {row_label}", classes="qc-row-label")
            with Grid(id="qc-grid-layout"):
                for cell in self._cells:
                    yield cell

    def sync(self, state: TouchscreenState, *, flow_phase: int) -> None:
        for cell in self._cells:
            cell.sync(state, flow_phase=flow_phase)


class GigTile(Static):
    """One tile inside the 4x2 Gig View."""

    can_focus = True

    class Activated(Message):
        """Raised when a Gig View tile is activated."""

        def __init__(self, index: int) -> None:
            self.index = index
            super().__init__()

    def __init__(self, index: int) -> None:
        super().__init__("", id=f"qc-gig-tile-{index}", classes="qc-gig-tile")
        self.index = index

    def sync(self, tile: GigTileState, state: TouchscreenState) -> None:
        selected = state.selected_gig_index == self.index
        content_active = state.focus_region is FocusRegion.CONTENT and state.view.value == "gig"
        density = _density_mode(self.region.width or self.size.width, self.region.height or self.size.height)

        for family in EffectFamily:
            self.remove_class(family.css_class)

        self.set_class(selected, "-selected")
        self.set_class(content_active and selected, "-region-active")
        self.set_class(not tile.assigned, "-empty")
        self.set_class(tile.active, "-active")
        self.set_class(tile.bypassed and tile.assigned, "-bypassed")

        if tile.family is not None:
            self.add_class(tile.family.css_class)

        if state.mode is OperatingMode.CHAIN:
            heading = f"C{state.chain_page_start() + tile.index + 1}"
            primary = tile.title if tile.assigned else "No Chain"
            detail = tile.subtitle if tile.assigned else "Empty"
            status = "ACTIVE" if tile.active else ("EMPTY" if not tile.assigned else "READY")
        else:
            heading = tile.title
            primary = tile.subtitle if tile.assigned else "Unassigned"
            detail = "ACTIVE" if tile.active else ("EMPTY" if not tile.assigned else "BYPASS")
            status = detail

        self.update(_render_gig_tile(heading, primary, detail, status, density))

    def on_click(self, event: Click) -> None:
        event.stop()
        self.post_message(self.Activated(self.index))

    def on_mouse_down(self, event: MouseDown) -> None:
        event.stop()
        self.post_message(self.Activated(self.index))


class GigView(Widget):
    """Full-screen Gig View tile matrix."""

    def __init__(self) -> None:
        super().__init__(id="qc-gig-view")
        self._tiles: list[GigTile] = [GigTile(index) for index in range(GIG_ROWS * GIG_COLUMNS)]

    def compose(self) -> ComposeResult:
        with Grid(id="qc-gig-layout"):
            for tile in self._tiles:
                yield tile

    def sync(self, state: TouchscreenState) -> None:
        tiles = state.gig_tiles()
        for tile_widget, tile_state in zip(self._tiles, tiles, strict=True):
            tile_widget.sync(tile_state, state)


class ContextPanel(Static):
    """Compact details panel below the main matrix."""

    def __init__(self) -> None:
        super().__init__("", id="qc-context-panel")

    def sync(self, state: TouchscreenState) -> None:
        self.set_class(state.focus_region is FocusRegion.CONTEXT, "-focused")
        block = state.selected_block()
        density = _density_mode(self.region.width or self.size.width, self.region.height or self.size.height)
        if block is None:
            if density == "compact":
                self.update("EMPTY SLOT | Select a block")
            elif density == "medium":
                self.update("SLOT EMPTY\nSelect a slot and select a live block")
            else:
                self.update(
                    "\n".join(
                        (
                            "SLOT  EMPTY",
                            "CATEGORY  --",
                            f"ACTION  {state.backend_message if not state.chains else 'Select a slot and select a live block'}",
                        )
                    )
                )
            return

        stomp = f"S{block.stomp_slot}" if block.stomp_slot is not None else "--"
        bypass = "BYPASSED" if block.bypassed else "ACTIVE"
        if density == "compact":
            self.update(f"{block.short_name} {bypass} {stomp} {block.params}")
        elif density == "medium":
            self.update(f"{block.name} | {block.category.upper()}\n{bypass}  {stomp}  {block.params}")
        else:
            self.update(
                "\n".join(
                    (
                        f"{block.name}  |  {block.category.upper()}",
                        f"STATE  {bypass}    STOMP  {stomp}    DETAIL  {block.detail}",
                        f"PARAM  {block.params}    ROUTE  {block.route_hint}",
                    )
                )
            )


class FooterHints(Static):
    """Compact shortcut strip."""

    def __init__(self) -> None:
        super().__init__("", id="qc-footer-hints")

    def sync(self, state: TouchscreenState) -> None:
        mode_hint = "Enter toggles stomp" if state.mode is OperatingMode.STOMP and state.view.value == "gig" else "Enter toggles bypass"
        if state.mode is OperatingMode.CHAIN and state.view.value == "gig":
            mode_hint = "Enter recalls chain"
        width = self.app.size.width
        if width < 92:
            text = "  ".join(
                (
                    "G",
                    "V",
                    "1",
                    "2",
                    "ENT",
                    "B",
                    f"ST {state.footer_status}",
                )
            )
        elif width < 120:
            text = "  ".join(
                (
                    "G Grid",
                    "V Gig",
                    "1 Chain",
                    "2 Stomp",
                    "Enter Act",
                    "B Arm",
                    "N Next",
                    f"STATUS {state.footer_status}",
                )
            )
        else:
            text = "  ".join(
                (
                    "G Grid",
                    "V Gig",
                    "1 Chain",
                    "2 Stomp",
                    "Arrows Move",
                    mode_hint,
                    "Tab Regions",
                    "B Arm",
                    "N Next Chain",
                    "S Save Chain",
                    f"STATUS {state.footer_status}",
                )
            )
        self.update(text)


def _flow_frame(route_hint: str, flow_phase: int) -> str:
    active_phases = (">..", ".>.", "..>")
    if route_hint in {"IN>", "OUT", "SPL", "MRG"}:
        return route_hint
    return active_phases[flow_phase % len(active_phases)]


def _density_mode(width: int, height: int) -> str:
    if height <= 1 or width <= 10:
        return "compact"
    if height <= 2 or width <= 12:
        return "medium"
    return "full"


def _render_empty_grid_cell(row: int, column: int, density: str) -> str:
    if density == "compact":
        return f"R{row + 1}C{column + 1} ---"
    if density == "medium":
        return f"R{row + 1} C{column + 1}\nEMPTY"
    return f"R{row + 1} C{column + 1}\nEMPTY\nLoad block"


def _render_grid_cell(short_name: str, category: str, params: str, badge: str, state_line: str, flow: str, density: str) -> str:
    if density == "compact":
        return f"{_fit(short_name, 3)} {badge} {state_line[:2]}"
    if density == "medium":
        return "\n".join((f"{flow} {category[:3].upper()} {badge}", f"{_fit(short_name, 6)} {state_line[:3]}"))
    return "\n".join(
        (
            f"{flow:<4}{category[:4].upper():<4}{badge:>3}",
            f"[b]{short_name}[/b]",
            f"{state_line:<4}{params[:8]}",
        )
    )


def _render_gig_tile(heading: str, primary: str, detail: str, status: str, density: str) -> str:
    if density == "compact":
        return f"{heading} {_fit(primary, 7)}"
    if density == "medium":
        return "\n".join((heading, _fit(primary, 12)))
    return "\n".join((heading, f"[b]{primary}[/b]", detail if detail else status))


def _fit(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    if limit <= 1:
        return value[:limit]
    return f"{value[: limit - 1]}+"
