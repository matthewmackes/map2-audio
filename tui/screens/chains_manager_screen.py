"""
Enhanced Chains Manager Screen - Real chain management reflecting web API
Features: Chain list with DSP load, A/B comparison with blend, Presets, Templates
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.containers import Vertical, Horizontal
from textual.widgets import Static, Label, DataTable
from textual.binding import Binding

logger = logging.getLogger(__name__)


class ChainsListWidget(Static):
    """Display list of available chains with stats in a table."""

    DEFAULT_CSS = """
    #chains-list {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #chains-table {
        width: 100%;
        height: auto;
        min-height: 8;
        margin: 1 0;
    }

    #chains-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "chains-list"
        self._chains = []
        self._ab_status = {}

    def compose(self) -> ComposeResult:
        """Compose chains list with table."""
        yield Label("🎸 CHAINS", id="chains-title")
        yield DataTable(id="chains-table")
        yield Label("Actions:", id="chains-actions-label")
        yield DataTable(id="chains-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Chains table
        table = self.query_one("#chains-table", DataTable)
        if not table.columns:
            table.add_columns("Status", "Name", "Plugins", "DSP", "A/B")
            table.add_row("...", "Loading...", "...", "...", "...")

        # Actions table
        actions = self.query_one("#chains-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("n", "New Chain", "Create a new effect chain")
            actions.add_row("i", "Import", "Import chain from file")
            actions.add_row("e", "Export", "Export selected chain")
            actions.add_row("d", "Delete", "Delete selected chain")
            actions.add_row("a", "Set as A", "Set chain for A/B slot A")
            actions.add_row("b", "Set as B", "Set chain for A/B slot B")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real chain data from API."""
        if not self.api_client:
            return

        try:
            # Fetch chains - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            # Fetch A/B mode status - /api/chains/ab-mode/status
            ab_result = await self.api_client.get_ab_mode_status()
            if ab_result.success and ab_result.data:
                self._ab_status = ab_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching chains: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#chains-table", DataTable)
            table.clear()

            # Get A/B chain IDs
            chain_a_id = self._ab_status.get("chain_a_id")
            chain_b_id = self._ab_status.get("chain_b_id")

            if not self._chains:
                table.add_row("-", "No chains found", "-", "-", "-")
                return

            for chain in self._chains:
                chain_id = chain.get("id") or chain.get("chain_id")
                name = chain.get("name", "Unnamed")
                plugins = chain.get("plugins", [])
                plugin_count = len(plugins) if isinstance(plugins, list) else 0

                # DSP load (calculate from plugins or use stored value)
                dsp_load = chain.get("dsp_load", 0)
                if not dsp_load and isinstance(plugins, list):
                    # Estimate DSP load from plugin count
                    dsp_load = plugin_count * 2

                # Status (active/inactive)
                active = chain.get("active", False) or chain.get("is_active", False)
                status = "🟢" if active else "⚪"

                # A/B assignment
                ab_slot = "-"
                if chain_id == chain_a_id:
                    ab_slot = "A"
                elif chain_id == chain_b_id:
                    ab_slot = "B"

                table.add_row(status, name, str(plugin_count), f"{dsp_load}%", ab_slot)

        except Exception as e:
            logger.debug(f"Error updating chains display: {e}")


class ABComparisonWidget(Static):
    """Display A/B comparison with blend control in tables."""

    DEFAULT_CSS = """
    #ab-comparison {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #ab-status-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #ab-blend-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #ab-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "ab-comparison"
        self._ab_status = {}
        self._chains = []

    def compose(self) -> ComposeResult:
        """Compose A/B comparison with tables."""
        yield Label("⚖️ A/B COMPARISON & BLEND", id="ab-title")
        yield DataTable(id="ab-status-table")
        yield Label("Blend Control:", id="blend-label")
        yield DataTable(id="ab-blend-table")
        yield Label("Actions:", id="ab-actions-label")
        yield DataTable(id="ab-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # A/B Status table
        status = self.query_one("#ab-status-table", DataTable)
        if not status.columns:
            status.add_columns("Slot", "Chain", "Effects", "DSP Load", "Status")
            status.add_row("A", "Loading...", "...", "...", "...")
            status.add_row("B", "Loading...", "...", "...", "...")

        # Blend presets table (static - these are always the same options)
        blend = self.query_one("#ab-blend-table", DataTable)
        if not blend.columns:
            blend.add_columns("Key", "Blend", "A%", "B%")
            blend.add_row("[", "100% A", "100", "0")
            blend.add_row("1", "75/25", "75", "25")
            blend.add_row("=", "50/50", "50", "50")
            blend.add_row("2", "25/75", "25", "75")
            blend.add_row("]", "100% B", "0", "100")

        # Actions table (static)
        actions = self.query_one("#ab-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("x", "Swap A↔B", "Swap chains between A and B slots")
            actions.add_row("D", "Duplicate", "Duplicate current chain")
            actions.add_row("L", "Link", "Link parameter between A and B")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(3.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real A/B mode data from API."""
        if not self.api_client:
            return

        try:
            # Fetch A/B mode status - /api/chains/ab-mode/status
            ab_result = await self.api_client.get_ab_mode_status()
            if ab_result.success and ab_result.data:
                self._ab_status = ab_result.data

            # Fetch chains for details - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching A/B status: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            status = self.query_one("#ab-status-table", DataTable)
            status.clear()

            enabled = self._ab_status.get("enabled", False)
            chain_a_id = self._ab_status.get("chain_a_id")
            chain_b_id = self._ab_status.get("chain_b_id")
            blend = self._ab_status.get("blend", 50)

            # Find chain details
            chain_a_name = "Not assigned"
            chain_b_name = "Not assigned"
            chain_a_plugins = 0
            chain_b_plugins = 0
            chain_a_dsp = 0
            chain_b_dsp = 0

            for chain in self._chains:
                cid = chain.get("id") or chain.get("chain_id")
                plugins = chain.get("plugins", [])
                plugin_count = len(plugins) if isinstance(plugins, list) else 0
                dsp = chain.get("dsp_load", plugin_count * 2)

                if cid == chain_a_id:
                    chain_a_name = chain.get("name", "Chain A")
                    chain_a_plugins = plugin_count
                    chain_a_dsp = dsp
                elif cid == chain_b_id:
                    chain_b_name = chain.get("name", "Chain B")
                    chain_b_plugins = plugin_count
                    chain_b_dsp = dsp

            if enabled:
                a_percent = 100 - blend
                b_percent = blend
                status.add_row("A", chain_a_name, str(chain_a_plugins), f"{chain_a_dsp}%", f"🟢 {a_percent}%")
                status.add_row("B", chain_b_name, str(chain_b_plugins), f"{chain_b_dsp}%", f"🟢 {b_percent}%")
                total_plugins = chain_a_plugins + chain_b_plugins
                total_dsp = chain_a_dsp + chain_b_dsp
                linked = self._ab_status.get("linked_params", 0)
                status.add_row("Total", "-", str(total_plugins), f"{total_dsp}%", f"Linked: {linked} pairs")
            else:
                status.add_row("A", chain_a_name, str(chain_a_plugins) if chain_a_id else "-", f"{chain_a_dsp}%" if chain_a_id else "-", "⚪ Off")
                status.add_row("B", chain_b_name, str(chain_b_plugins) if chain_b_id else "-", f"{chain_b_dsp}%" if chain_b_id else "-", "⚪ Off")
                status.add_row("Mode", "Disabled", "-", "-", "Select chains to enable")

        except Exception as e:
            logger.debug(f"Error updating A/B display: {e}")


class PresetsWidget(Static):
    """Display chain presets with categories and tags in tables."""

    DEFAULT_CSS = """
    #presets {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #presets-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #presets-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "presets"
        self._presets = []
        self._categories = {}

    def compose(self) -> ComposeResult:
        """Compose presets with tables."""
        yield Label("🎚️ PRESETS | Loading...", id="presets-title")
        yield DataTable(id="presets-table")
        yield Label("Actions:", id="presets-actions-label")
        yield DataTable(id="presets-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Presets table
        table = self.query_one("#presets-table", DataTable)
        if not table.columns:
            table.add_columns("★", "Name", "Category", "Chain", "Modified")
            table.add_row("...", "Loading...", "...", "...", "...")

        # Actions table (static)
        actions = self.query_one("#presets-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("Enter", "Load", "Load selected preset")
            actions.add_row("s", "Save As", "Save current chain as preset")
            actions.add_row("m", "Manage", "Open preset manager")
            actions.add_row("e", "Export", "Export preset to file")
            actions.add_row("i", "Import", "Import preset from file")
            actions.add_row("f", "Favorite", "Toggle favorite status")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real preset data from API."""
        if not self.api_client:
            return

        try:
            # Fetch presets - /api/presets/
            presets_result = await self.api_client.list_presets()
            if presets_result.success and presets_result.data:
                self._presets = presets_result.data if isinstance(presets_result.data, list) else presets_result.data.get("presets", [])

            # Build category counts
            self._categories = {}
            for preset in self._presets:
                category = preset.get("category", "General")
                if category not in self._categories:
                    self._categories[category] = 0
                self._categories[category] += 1

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching presets: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with counts
            total = len(self._presets)
            favorites = sum(1 for p in self._presets if p.get("favorite", False) or p.get("is_favorite", False))
            categories = len(self._categories)
            title = self.query_one("#presets-title", Label)
            title.update(f"🎚️ PRESETS ({total} total) | Favorites: {favorites} | Categories: {categories}")

            # Update table
            table = self.query_one("#presets-table", DataTable)
            table.clear()

            if not self._presets:
                table.add_row("-", "No presets found", "-", "-", "-")
                return

            # Show recent presets (up to 8)
            for preset in self._presets[:8]:
                name = preset.get("name", "Unnamed")
                category = preset.get("category", "General")
                chain_name = preset.get("chain_name", preset.get("chain", "-"))
                favorite = preset.get("favorite", False) or preset.get("is_favorite", False)
                star = "★" if favorite else ""

                # Format modified time
                modified = preset.get("modified", preset.get("updated_at", ""))
                if modified:
                    # Simple time formatting (could be enhanced)
                    modified_str = str(modified)[:10] if len(str(modified)) > 10 else str(modified)
                else:
                    modified_str = "-"

                table.add_row(star, name, category, chain_name, modified_str)

        except Exception as e:
            logger.debug(f"Error updating presets display: {e}")


class ChainTemplatesWidget(Static):
    """Display chain templates in tables."""

    DEFAULT_CSS = """
    #templates {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }

    #templates-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #history-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #templates-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "templates"
        self._sessions = []
        self._history = []
        self._history_status = {}

    def compose(self) -> ComposeResult:
        """Compose chain templates with tables."""
        yield Label("📋 CHAIN TEMPLATES", id="templates-title")
        yield DataTable(id="templates-table")
        yield Label("History (Loading...):", id="history-label")
        yield DataTable(id="history-table")
        yield Label("Actions:", id="templates-actions-label")
        yield DataTable(id="templates-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Templates table
        table = self.query_one("#templates-table", DataTable)
        if not table.columns:
            table.add_columns("Name", "Chains", "Presets", "Last Used")
            table.add_row("Loading...", "...", "...", "...")

        # History table
        history = self.query_one("#history-table", DataTable)
        if not history.columns:
            history.add_columns("Action", "Target", "Time", "Undo")
            history.add_row("Loading...", "...", "...", "...")

        # Actions table (static)
        actions = self.query_one("#templates-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("c", "Create", "Create new template from current setup")
            actions.add_row("Enter", "Browse", "Browse and load templates")
            actions.add_row("z", "Undo", "Undo last action")
            actions.add_row("y", "Redo", "Redo last undone action")
            actions.add_row("r", "Restore", "Restore from history entry")
            actions.add_row("C", "Clear", "Clear history")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real template and history data from API."""
        if not self.api_client:
            return

        try:
            # Fetch sessions (templates) - /api/sessions/list
            sessions_result = await self.api_client.list_sessions()
            if sessions_result.success and sessions_result.data:
                self._sessions = sessions_result.data if isinstance(sessions_result.data, list) else sessions_result.data.get("sessions", [])

            # Fetch history status - /api/history/status
            history_result = await self.api_client.get_history_status()
            if history_result.success and history_result.data:
                self._history_status = history_result.data

            # Fetch history entries - /api/history/
            try:
                history_entries_result = await self.api_client.get_history()
                if history_entries_result.success and history_entries_result.data:
                    self._history = history_entries_result.data if isinstance(history_entries_result.data, list) else history_entries_result.data.get("entries", [])
            except Exception:
                # History endpoint might not exist
                self._history = []

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching templates/history: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update templates table
            table = self.query_one("#templates-table", DataTable)
            table.clear()

            if self._sessions:
                for session in self._sessions[:5]:
                    name = session.get("name", "Unnamed")
                    chains = session.get("chain_count", session.get("chains", 0))
                    if isinstance(chains, list):
                        chains = len(chains)
                    presets = session.get("preset_count", session.get("presets", 0))
                    if isinstance(presets, list):
                        presets = len(presets)
                    last_used = session.get("last_used", session.get("updated_at", "-"))
                    if last_used and len(str(last_used)) > 10:
                        last_used = str(last_used)[:10]
                    table.add_row(name, str(chains), str(presets), str(last_used))
            else:
                table.add_row("No templates found", "-", "-", "-")

            # Update history label
            history_count = self._history_status.get("history_count", len(self._history))
            history_label = self.query_one("#history-label", Label)
            history_label.update(f"History ({history_count} entries):")

            # Update history table
            history = self.query_one("#history-table", DataTable)
            history.clear()

            can_undo = self._history_status.get("can_undo", False)

            if self._history:
                for entry in self._history[:5]:
                    action = entry.get("action", entry.get("type", "Unknown"))
                    target = entry.get("target", entry.get("description", "-"))
                    timestamp = entry.get("timestamp", entry.get("time", "-"))
                    if timestamp and len(str(timestamp)) > 10:
                        timestamp = str(timestamp)[:10]
                    undoable = "✓" if entry.get("undoable", True) else ""
                    history.add_row(action, target, str(timestamp), undoable)
            else:
                undo_status = "Undo available" if can_undo else "No history"
                history.add_row(undo_status, "-", "-", "")

        except Exception as e:
            logger.debug(f"Error updating templates display: {e}")


class ChainsManagerScreen(Static):
    """
    Enhanced Chains Manager Screen - Reflects web API features.
    
    Shows:
    - Active chains with DSP load per chain
    - A/B comparison with blend mixing
    - Presets with categories and favorites
    - Chain templates for quick setup
    - Full undo/redo history
    """
    
    DEFAULT_CSS = """
    ChainsManagerScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """
    
    BINDINGS = [
        Binding("space", "toggle_ab_mode", "A/B Mode", show=True),
        Binding("a", "select_chain_a", "Select A", show=False),
        Binding("b", "select_chain_b", "Select B", show=False),
        Binding("x", "swap_ab", "Swap", show=False),
        Binding("n", "new_chain", "New", show=True),
        Binding("z", "undo", "Undo", show=True),
        Binding("y", "redo", "Redo", show=False),
    ]
    
    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
    
    def compose(self) -> ComposeResult:
        """Compose chains manager with real features."""
        with Vertical(id="chains-container"):
            yield ChainsListWidget(self.api_client)
            yield ABComparisonWidget(self.api_client)
            yield PresetsWidget(self.api_client)
            yield ChainTemplatesWidget(self.api_client)
    
    async def action_toggle_ab_mode(self) -> None:
        """Toggle A/B comparison mode."""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=2)
            return
        try:
            # Get current status
            status = await self.api_client.get_ab_mode_status()
            if status.success and status.data:
                enabled = status.data.get("enabled", False)
                if enabled:
                    result = await self.api_client.disable_ab_mode()
                    if result.success:
                        self.app.notify("A/B Mode disabled", severity="warning", timeout=2)
                    else:
                        self.app.notify(f"Failed: {result.error}", severity="error", timeout=3)
                else:
                    self.app.notify("Select chains with 'a' and 'b' keys first", severity="information", timeout=3)
            else:
                self.app.notify("Could not get A/B status", severity="error", timeout=2)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_select_chain_a(self) -> None:
        """Select chain for A slot - placeholder, needs chain selection UI."""
        self.app.notify("Use chain list to select chain A (not yet implemented)", severity="information", timeout=3)

    async def action_select_chain_b(self) -> None:
        """Select chain for B slot - placeholder, needs chain selection UI."""
        self.app.notify("Use chain list to select chain B (not yet implemented)", severity="information", timeout=3)

    async def action_swap_ab(self) -> None:
        """Swap A and B chains."""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=2)
            return
        try:
            result = await self.api_client.swap_ab_chains()
            if result.success:
                self.app.notify("A and B chains swapped!", severity="information", timeout=2)
            else:
                self.app.notify(f"Swap failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_new_chain(self) -> None:
        """Create new chain."""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=2)
            return
        try:
            # Generate a default name
            result = await self.api_client.create_chain("New Chain")
            if result.success:
                chain_data = result.data or {}
                chain_name = chain_data.get("name", "New Chain")
                self.app.notify(f"Created chain: {chain_name}", severity="information", timeout=3)
            else:
                self.app.notify(f"Failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_undo(self) -> None:
        """Undo last action."""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=2)
            return
        try:
            result = await self.api_client.undo()
            if result.success:
                action_name = result.data.get("undone_action", "action") if result.data else "action"
                self.app.notify(f"Undone: {action_name}", severity="information", timeout=2)
            else:
                error = result.error or "Nothing to undo"
                self.app.notify(f"Undo: {error}", severity="warning", timeout=2)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_redo(self) -> None:
        """Redo last action."""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=2)
            return
        try:
            result = await self.api_client.redo()
            if result.success:
                action_name = result.data.get("redone_action", "action") if result.data else "action"
                self.app.notify(f"Redone: {action_name}", severity="information", timeout=2)
            else:
                error = result.error or "Nothing to redo"
                self.app.notify(f"Redo: {error}", severity="warning", timeout=2)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)
