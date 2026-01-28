"""
Favorites Tab - Original TUI
=============================
Browse and manage plugin favorites with persistent storage.
"""

from pathlib import Path
from typing import Optional, Dict, Any, List
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import Static, Label, Button, DataTable, Input
from textual.app import ComposeResult
from textual.reactive import reactive
from textual import work

from api_client import MAP2APIClient


class FavoritesTab(Container):
    """
    Favorites management tab.
    
    Features:
    - Browse favorite plugins
    - Quick access panel
    - Search and sort
    - Add/remove favorites
    """
    
    DEFAULT_CSS = """
    FavoritesTab {
        width: 100%;
        height: 100%;
        padding: 1;
    }
    
    FavoritesTab .tab-title {
        width: 100%;
        height: 2;
        background: $primary;
        text-style: bold;
        padding: 0 1;
        margin-bottom: 1;
    }
    
    FavoritesTab .controls {
        width: 100%;
        height: 3;
        margin-bottom: 1;
    }
    
    FavoritesTab Button {
        margin-right: 1;
    }
    
    FavoritesTab .favorites-table {
        width: 100%;
        height: 1fr;
    }
    """
    
    plugins: reactive[List[Dict]] = reactive([])
    
    def __init__(self, api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.favorites_file = Path.home() / ".map2" / "favorites.json"
        self.favorites_file.parent.mkdir(parents=True, exist_ok=True)
    
    def compose(self) -> ComposeResult:
        yield Label("⭐ PLUGIN FAVORITES", classes="tab-title")
        
        with Horizontal(classes="controls"):
            yield Button("Refresh", id="btn-refresh-favs", variant="primary")
            yield Button("Add", id="btn-add-fav", variant="success")
            yield Button("Remove", id="btn-remove-fav", variant="error")
            yield Button("Clear All", id="btn-clear-favs", variant="warning")
        
        # Favorites table
        table = DataTable(id="fav-table", classes="favorites-table")
        table.add_columns("Name", "Brand", "Category", "Status")
        yield table
        
        # Stats
        yield Static("Total: 0", id="fav-count")
    
    async def on_mount(self) -> None:
        """Load favorites on mount."""
        await self.refresh_favorites()
    
    @work(exclusive=True)
    async def refresh_favorites(self) -> None:
        """Refresh favorites display."""
        try:
            # Get favorites list
            result = await self.api_client.get_favorites()
            if result.success:
                favorites = result.data.get("favorites", [])
            else:
                favorites = []
            
            # Update table
            table = self.query_one("#fav-table", DataTable)
            table.clear()
            
            if not favorites:
                table.add_row("No favorites yet", "", "", "")
                self.query_one("#fav-count", Static).update("Total: 0")
                return
            
            for fav in favorites:
                name = fav.get("name", "Unknown")
                brand = fav.get("brand", "")
                category = fav.get("category", "")
                status = "✓"
                table.add_row(name, brand, category, status)
            
            self.query_one("#fav-count", Static).update(f"Total: {len(favorites)}")
            self.notify("Favorites updated")
            
        except Exception as e:
            self.notify(f"Failed to load favorites: {e}", severity="error")
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        btn_id = event.button.id
        
        if btn_id == "btn-refresh-favs":
            await self.refresh_favorites()
        elif btn_id == "btn-add-fav":
            self.notify("Use Plugins tab to add favorites", severity="information")
        elif btn_id == "btn-remove-fav":
            self.notify("Use Plugins tab to remove favorites", severity="information")
        elif btn_id == "btn-clear-favs":
            result = await self.api_client.toggle_favorite("plugin", "*")
            if result.success:
                await self.refresh_favorites()
                self.notify("Favorites cleared")
