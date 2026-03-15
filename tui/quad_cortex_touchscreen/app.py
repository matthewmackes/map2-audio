"""Standalone Quad Cortex touchscreen clone rendered with Textual and Carbon."""

from __future__ import annotations

from pathlib import Path

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container
from textual.events import Resize
from textual.widgets import ContentSwitcher

from ..api import MAP2APIClient
from ..theme.carbon import DEFAULT_THEME_NAME, register_carbon_themes
from .backend import TouchscreenBackendController, build_state_from_snapshot
from .model import FocusRegion, OperatingMode, TouchscreenView, TouchscreenState, build_placeholder_state
from .widgets import ContextPanel, FooterHints, GigTile, GigView, GridCell, GridView, HeaderBar, HeaderControl, ModeBadge


class QuadCortexTouchscreenApp(App[None]):
    """Quad Cortex touchscreen experience adapted to IBM Carbon."""

    CSS_PATH = Path(__file__).resolve().parents[1] / "styles" / "carbon.tcss"
    POLL_INTERVAL_SECONDS = 2.0
    VISUAL_INTERVAL_SECONDS = 0.75
    BINDINGS = [
        Binding("g", "go_grid", show=False),
        Binding("v", "toggle_gig_view", show=False),
        Binding("1", "set_chain_mode", show=False),
        Binding("2", "set_stomp_mode", show=False),
        Binding("left", "move_left", show=False),
        Binding("right", "move_right", show=False),
        Binding("up", "move_up", show=False),
        Binding("down", "move_down", show=False),
        Binding("enter", "activate_current", show=False),
        Binding("space", "activate_current", show=False),
        Binding("tab", "cycle_focus_region", show=False),
        Binding("shift+tab", "focus_previous_region", show=False),
        Binding("b", "arm_stomp", show=False),
        Binding("n", "next_chain", show=False),
        Binding("p", "previous_chain", show=False),
        Binding("s", "save_current_chain", show=False),
        Binding("q", "quit", show=False),
    ]

    def __init__(
        self,
        *,
        api_url: str = "http://localhost:8080",
        api_client: MAP2APIClient | None = None,
        controller: TouchscreenBackendController | None = None,
        animate: bool = True,
    ) -> None:
        super().__init__()
        self.title = "Quad Cortex Touchscreen"
        self.sub_title = "Carbon for Textual"
        self.state: TouchscreenState = build_placeholder_state()
        self.flow_phase = 0
        self._animate = animate
        self._layout_sync_pending = False
        self._backend_busy = False
        self._controller = controller or TouchscreenBackendController(api_client=api_client, api_url=api_url)
        register_carbon_themes(self)
        self.theme = DEFAULT_THEME_NAME

    def compose(self) -> ComposeResult:
        with Container(id="qc-root"):
            yield HeaderBar()
            with Container(id="qc-main-surface"):
                with ContentSwitcher(initial="qc-grid-view", id="qc-content-switcher"):
                    yield GridView()
                    yield GigView()
            yield ContextPanel()
            yield FooterHints()

    def on_mount(self) -> None:
        self._sync_view()
        self._request_refresh()
        if self._animate:
            self._schedule_visual_tick()
        self._schedule_poll()

    async def on_unmount(self) -> None:
        await self._controller.close()

    def on_resize(self, _event: Resize) -> None:
        if self.is_mounted:
            self.call_after_refresh(self._sync_view)

    def _schedule_visual_tick(self) -> None:
        self.set_timer(self.VISUAL_INTERVAL_SECONDS, self._handle_visual_tick)

    def _handle_visual_tick(self) -> None:
        self.flow_phase = (self.flow_phase + 1) % 3
        self.state.tick_visuals()
        self._sync_view()
        if self._animate:
            self._schedule_visual_tick()

    def _schedule_poll(self) -> None:
        self.set_timer(self.POLL_INTERVAL_SECONDS, self._handle_poll_tick)

    def _handle_poll_tick(self) -> None:
        self._request_refresh()
        self._schedule_poll()

    def _request_refresh(self, *, preferred_chain_id: int | None = None, status_override: str | None = None) -> None:
        if self._backend_busy:
            return
        self.run_worker(
            self._refresh_from_backend(preferred_chain_id=preferred_chain_id, status_override=status_override),
            thread=False,
        )

    async def _refresh_from_backend(
        self,
        *,
        preferred_chain_id: int | None = None,
        status_override: str | None = None,
    ) -> None:
        self._backend_busy = True
        try:
            snapshot = await self._controller.fetch_snapshot(preferred_chain_id or self.state.active_chain_id)
            self.state = build_state_from_snapshot(self.state, snapshot, status_override=status_override)
            self._sync_view()
        except Exception as exc:
            self.state.backend_connected = False
            self.state.backend_message = str(exc)
            self.state.footer_status = str(exc)
            self._sync_view()
        finally:
            self._backend_busy = False

    def _sync_view(self) -> None:
        self._render_view()
        if self.is_mounted and not self._layout_sync_pending:
            self._layout_sync_pending = True
            self.call_after_refresh(self._sync_view_after_layout)

    def _sync_view_after_layout(self) -> None:
        self._layout_sync_pending = False
        if self.is_mounted:
            self._render_view()

    def _render_view(self) -> None:
        self.query_one(HeaderBar).sync(self.state)
        self.query_one(GridView).sync(self.state, flow_phase=self.flow_phase)
        self.query_one(GigView).sync(self.state)
        self.query_one(ContextPanel).sync(self.state)
        self.query_one(FooterHints).sync(self.state)
        switcher = self.query_one("#qc-content-switcher", ContentSwitcher)
        switcher.current = "qc-gig-view" if self.state.view is TouchscreenView.GIG else "qc-grid-view"

    def action_go_grid(self) -> None:
        self.state.set_view(TouchscreenView.GRID)
        self._sync_view()

    def action_toggle_gig_view(self) -> None:
        self.state.toggle_view()
        self._sync_view()

    def action_set_chain_mode(self) -> None:
        self.state.set_mode(OperatingMode.CHAIN)
        self._sync_view()

    def action_set_stomp_mode(self) -> None:
        self.state.set_mode(OperatingMode.STOMP)
        self._sync_view()

    def action_move_left(self) -> None:
        self._move_navigation(dx=-1, dy=0)

    def action_move_right(self) -> None:
        self._move_navigation(dx=1, dy=0)

    def action_move_up(self) -> None:
        self._move_navigation(dx=0, dy=-1)

    def action_move_down(self) -> None:
        self._move_navigation(dx=0, dy=1)

    def _move_navigation(self, *, dx: int, dy: int) -> None:
        if self.state.focus_region is FocusRegion.HEADER:
            if dx:
                self.state.move_header_focus(dx)
        elif self.state.focus_region is FocusRegion.CONTENT:
            self.state.move_selection(dx, dy)
        self._sync_view()

    def action_activate_current(self) -> None:
        if self.state.focus_region is FocusRegion.HEADER:
            if self.state.header_focus_index == 0:
                self.state.toggle_view()
            else:
                self._toggle_mode()
            self._sync_view()
            return

        if self.state.focus_region is not FocusRegion.CONTENT:
            return
        if self.state.view is TouchscreenView.GRID:
            self._request_selected_block_bypass_toggle()
        else:
            self._request_selected_gig_activation()

    def action_cycle_focus_region(self) -> None:
        self.state.cycle_focus_region(forward=True)
        self._sync_view()

    def action_focus_previous_region(self) -> None:
        self.state.cycle_focus_region(forward=False)
        self._sync_view()

    def action_arm_stomp(self) -> None:
        self._request_selected_block_stomp_toggle()

    def action_next_chain(self) -> None:
        self._request_chain_offset(1)

    def action_previous_chain(self) -> None:
        self._request_chain_offset(-1)

    def action_save_current_chain(self) -> None:
        chain_id = self.state.active_chain_id
        if chain_id is None:
            self.state.footer_status = "No active chain to save"
            self._sync_view()
            return
        self._queue_backend_action(
            pending_status=f"Saving {self.state.chain_name}",
            coroutine=self._save_current_chain(chain_id, self.state.chain_name),
        )

    def on_grid_cell_selected(self, message: GridCell.Selected) -> None:
        self.state.focus_region = FocusRegion.CONTENT
        self.state.selected_grid_index = message.index
        self._sync_view()

    def on_gig_tile_activated(self, message: GigTile.Activated) -> None:
        self.state.focus_region = FocusRegion.CONTENT
        self.state.selected_gig_index = message.index
        self._sync_view()
        self._request_selected_gig_activation()

    def on_header_control_activated(self, message: HeaderControl.Activated) -> None:
        self.state.focus_region = FocusRegion.HEADER
        self.state.header_focus_index = 0
        if message.control_name == "view":
            self.state.toggle_view()
        self._sync_view()

    def on_mode_badge_activated(self, _message: ModeBadge.Activated) -> None:
        self.state.focus_region = FocusRegion.HEADER
        self.state.header_focus_index = 1
        self._toggle_mode()
        self._sync_view()

    def _toggle_mode(self) -> None:
        next_mode = OperatingMode.STOMP if self.state.mode is OperatingMode.CHAIN else OperatingMode.CHAIN
        self.state.set_mode(next_mode)

    def _request_chain_offset(self, delta: int) -> None:
        next_index = self.state.next_chain_index(delta)
        if next_index is None:
            self.state.footer_status = "No chains available"
            self._sync_view()
            return
        chain = self.state.chains[next_index]
        if chain.chain_id is None:
            return
        self._queue_backend_action(
            pending_status=f"Loading {chain.name}",
            coroutine=self._activate_chain(chain.chain_id),
        )

    def _request_selected_block_bypass_toggle(self) -> None:
        block = self.state.selected_block()
        chain_id = self.state.active_chain_id
        if block is None or not block.can_toggle or chain_id is None:
            self.state.footer_status = "Selected slot has no bypassable block"
            self._sync_view()
            return
        self._queue_backend_action(
            pending_status=f"Updating {block.name}",
            coroutine=self._toggle_block_bypass(chain_id, block.plugin_uri or "", block.plugin_position, not block.bypassed, block.name),
        )

    def _request_selected_block_stomp_toggle(self) -> None:
        chain_id = self.state.active_chain_id
        updated_assignments = self.state.build_updated_stomp_assignments_for_selected_block()
        block = self.state.selected_block()
        if chain_id is None or updated_assignments is None or block is None:
            self.state.footer_status = "Select a block before arming a stomp"
            self._sync_view()
            return
        self._queue_backend_action(
            pending_status=f"Updating stomp for {block.name}",
            coroutine=self._persist_stomp_assignments(chain_id, updated_assignments),
        )

    def _request_selected_gig_activation(self) -> None:
        if self.state.mode is OperatingMode.CHAIN:
            chain = self.state.chain_for_gig_index(self.state.selected_gig_index)
            if chain is None or chain.chain_id is None:
                self.state.footer_status = "Selected tile has no chain"
                self._sync_view()
                return
            self._queue_backend_action(
                pending_status=f"Loading {chain.name}",
                coroutine=self._activate_chain(chain.chain_id),
            )
            return

        assignment = self.state.selected_stomp_assignment()
        chain_id = self.state.active_chain_id
        if assignment is None or not assignment.assigned or chain_id is None:
            self.state.footer_status = f"S{self.state.selected_gig_index + 1} is unassigned"
            self._sync_view()
            return
        block = self.state.selected_block()
        block_name = assignment.label if assignment.label else (block.name if block is not None else f"S{assignment.slot}")
        self._queue_backend_action(
            pending_status=f"Toggling {block_name}",
            coroutine=self._toggle_block_bypass(
                chain_id,
                assignment.plugin_uri or "",
                assignment.plugin_position,
                assignment.bypassed,
                block_name,
            ),
        )

    def _queue_backend_action(self, *, pending_status: str, coroutine) -> None:
        if self._backend_busy:
            return
        self.state.footer_status = pending_status
        self._sync_view()
        self.run_worker(coroutine, thread=False)

    async def _activate_chain(self, chain_id: int) -> None:
        self._backend_busy = True
        try:
            message = await self._controller.activate_chain(chain_id)
            snapshot = await self._controller.fetch_snapshot(chain_id)
            self.state = build_state_from_snapshot(self.state, snapshot, status_override=message)
            self._sync_view()
        except Exception as exc:
            self.state.footer_status = str(exc)
            self._sync_view()
        finally:
            self._backend_busy = False

    async def _toggle_block_bypass(
        self,
        chain_id: int,
        plugin_uri: str,
        plugin_position: int | None,
        bypass: bool,
        block_name: str,
    ) -> None:
        self._backend_busy = True
        try:
            message = await self._controller.toggle_plugin_bypass(
                chain_id=chain_id,
                plugin_uri=plugin_uri,
                plugin_position=plugin_position,
                bypass=bypass,
                block_name=block_name,
            )
            snapshot = await self._controller.fetch_snapshot(chain_id)
            self.state = build_state_from_snapshot(self.state, snapshot, status_override=message)
            self._sync_view()
        except Exception as exc:
            self.state.footer_status = str(exc)
            self._sync_view()
        finally:
            self._backend_busy = False

    async def _persist_stomp_assignments(self, chain_id: int, assignments) -> None:
        self._backend_busy = True
        try:
            message = await self._controller.persist_stomp_assignments(chain_id=chain_id, assignments=assignments)
            snapshot = await self._controller.fetch_snapshot(chain_id)
            self.state = build_state_from_snapshot(self.state, snapshot, status_override=message)
            self._sync_view()
        except Exception as exc:
            self.state.footer_status = str(exc)
            self._sync_view()
        finally:
            self._backend_busy = False

    async def _save_current_chain(self, chain_id: int, chain_name: str) -> None:
        self._backend_busy = True
        try:
            message = await self._controller.save_chain_preset(chain_id=chain_id, chain_name=chain_name)
            snapshot = await self._controller.fetch_snapshot(chain_id)
            self.state = build_state_from_snapshot(self.state, snapshot, status_override=message)
            self._sync_view()
        except Exception as exc:
            self.state.footer_status = str(exc)
            self._sync_view()
        finally:
            self._backend_busy = False
