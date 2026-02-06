"""
Searchable List Widget - Filterable list with search
Displays list of items with real-time search/filter capability.
"""

from typing import List, Dict, Any, Optional, Callable

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal
    from textual.widgets import Static, Input, ListView, ListItem, Label
    from textual.binding import Binding
    from textual.reactive import reactive
except ImportError:
    pass


class SearchableListWidget(Static):
    """
    Searchable list widget with filtering.
    
    Displays items in a filterable list with search input.
    
    Example:
        items = [
            {"id": "1", "name": "Node 1", "status": "online"},
            {"id": "2", "name": "Node 2", "status": "offline"},
        ]
        search_list = SearchableListWidget(
            items=items,
            search_fields=["name", "status"],
            on_select=lambda item: print(f"Selected: {item}")
        )
        yield search_list
    """
    
    DEFAULT_CSS = """
    SearchableListWidget {
        width: 100%;
        height: auto;
        border: solid $primary;
        background: $surface;
        padding: 0;
        margin: 0;
    }
    
    #search-input {
        width: 100%;
        height: 1;
        padding: 0 1;
        border-top: none;
        border-left: none;
        border-right: none;
    }
    
    #search-list {
        width: 100%;
        height: 1fr;
        background: $surface;
    }
    
    .search-item {
        width: 100%;
        height: auto;
        padding: 0 1;
        margin: 0;
    }
    
    .search-item:hover {
        background: $primary;
    }
    """
    
    BINDINGS = [
        Binding("up", "cursor_up", "Up", show=False),
        Binding("down", "cursor_down", "Down", show=False),
        Binding("enter", "select_item", "Select", show=False),
        Binding("ctrl+a", "select_all", "Select All", show=False),
        Binding("escape", "clear_search", "Clear", show=False),
    ]
    
    # Reactive properties
    search_query: reactive[str] = reactive("")
    selected_item_index: reactive[Optional[int]] = reactive(None)
    
    def __init__(
        self,
        items: Optional[List[Dict[str, Any]]] = None,
        search_fields: Optional[List[str]] = None,
        display_field: str = "name",
        on_select: Optional[Callable[[Dict[str, Any]], None]] = None,
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize searchable list.
        
        Args:
            items: List of item dictionaries
            search_fields: Fields to search in
            display_field: Field to display in list
            on_select: Callback when item selected
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.all_items = items or []
        self.search_fields = search_fields or ["name"]
        self.display_field = display_field
        self.on_select_callback = on_select
        self.filtered_items: List[Dict[str, Any]] = []
    
    def compose(self) -> ComposeResult:
        """Compose search list."""
        with Vertical():
            yield Input(
                placeholder="Search...",
                id="search-input"
            )
            yield ListView(id="search-list")
    
    async def on_mount(self) -> None:
        """Initialize list on mount."""
        search_input = self.query_one("#search-input", Input)
        search_input.focus()
        self._update_list()
    
    async def on_input_changed(self, event: "Input.Changed") -> None:
        """Update search results as user types."""
        self.search_query = event.value
        self._filter_items()
        self._update_list()
    
    def _filter_items(self) -> None:
        """Filter items based on search query."""
        if not self.search_query:
            self.filtered_items = self.all_items
            return
        
        query = self.search_query.lower()
        filtered = []
        
        for item in self.all_items:
            # Check if query matches any search field
            for field in self.search_fields:
                value = str(item.get(field, "")).lower()
                if query in value:
                    filtered.append(item)
                    break
        
        self.filtered_items = filtered
    
    def _update_list(self) -> None:
        """Update list display."""
        try:
            list_view = self.query_one("#search-list", ListView)
            list_view.clear()
            
            for item in self.filtered_items:
                display_text = str(item.get(self.display_field, ""))
                label = Label(display_text, classes="search-item")
                list_view.append(ListItem(label))
        except:
            pass
    
    def set_items(self, items: List[Dict[str, Any]]) -> None:
        """Update items list."""
        self.all_items = items
        self._filter_items()
        self._update_list()
    
    def get_selected_item(self) -> Optional[Dict[str, Any]]:
        """Get selected item."""
        if self.selected_item_index is None or self.selected_item_index >= len(self.filtered_items):
            return None
        return self.filtered_items[self.selected_item_index]
    
    async def action_cursor_up(self) -> None:
        """Move cursor up."""
        try:
            list_view = self.query_one("#search-list", ListView)
            if list_view.index > 0:
                list_view.index -= 1
        except:
            pass
    
    async def action_cursor_down(self) -> None:
        """Move cursor down."""
        try:
            list_view = self.query_one("#search-list", ListView)
            if list_view.index < len(self.filtered_items) - 1:
                list_view.index += 1
        except:
            pass
    
    async def action_select_item(self) -> None:
        """Select current item."""
        try:
            list_view = self.query_one("#search-list", ListView)
            self.selected_item_index = list_view.index
            item = self.get_selected_item()
            if item and self.on_select_callback:
                self.on_select_callback(item)
        except:
            pass
    
    async def action_select_all(self) -> None:
        """Select all items."""
        try:
            list_view = self.query_one("#search-list", ListView)
            list_view.index = 0
        except:
            pass
    
    async def action_clear_search(self) -> None:
        """Clear search."""
        try:
            search_input = self.query_one("#search-input", Input)
            search_input.value = ""
            search_input.focus()
        except:
            pass
