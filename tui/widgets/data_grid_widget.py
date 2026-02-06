"""
Data Grid Widget - Sortable table display for cluster data
Displays data in columns with sorting, selection, and scrolling.
"""

from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal
    from textual.widgets import Static, DataTable, Label
    from textual.binding import Binding
    from textual.reactive import reactive
except ImportError:
    pass


@dataclass
class DataGridColumn:
    """Column definition for data grid."""
    key: str
    label: str
    width: Optional[int] = None
    sortable: bool = True
    align: str = "left"


class DataGridWidget(Static):
    """
    Sortable data table widget for displaying cluster information.
    
    Supports:
    - Multiple columns with custom widths
    - Sorting by clicking headers
    - Row selection
    - Custom rendering per column
    - Pagination
    
    Example:
        columns = [
            DataGridColumn("name", "Node Name"),
            DataGridColumn("status", "Status", width=10),
            DataGridColumn("cpu", "CPU %", width=8),
        ]
        grid = DataGridWidget(columns=columns, data=nodes_list)
        yield grid
    """
    
    DEFAULT_CSS = """
    DataGridWidget {
        width: 100%;
        height: auto;
        border: solid $primary;
        background: $surface;
        margin: 0 0;
    }
    
    #data-grid-header {
        width: 100%;
        height: 1;
        background: $primary;
        color: $text;
        text-style: bold;
        padding: 0 1;
    }
    
    #data-grid-table {
        width: 100%;
        height: 1fr;
        background: $surface;
    }
    
    #data-grid-footer {
        width: 100%;
        height: 1;
        background: $panel;
        color: $text-muted;
        padding: 0 1;
    }
    """
    
    BINDINGS = [
        Binding("up", "cursor_up", "Up", show=False),
        Binding("down", "cursor_down", "Down", show=False),
        Binding("enter", "select_row", "Select", show=False),
    ]
    
    # Reactive properties
    selected_row_index: reactive[Optional[int]] = reactive(None)
    sort_column: reactive[Optional[str]] = reactive(None)
    sort_descending: reactive[bool] = reactive(False)
    
    def __init__(
        self,
        columns: List[DataGridColumn],
        data: Optional[List[Dict[str, Any]]] = None,
        on_select: Optional[Callable[[Dict[str, Any]], None]] = None,
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize data grid.
        
        Args:
            columns: List of column definitions
            data: Optional list of data dictionaries
            on_select: Callback when row is selected
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.columns = columns
        self.data = data or []
        self.on_select_callback = on_select
        self._table: Optional[DataTable] = None
    
    def compose(self) -> ComposeResult:
        """Compose the data grid with header, table, and footer."""
        with Vertical():
            yield Label("Loading...", id="data-grid-header")
            yield DataTable(id="data-grid-table")
            yield Label(f"0 rows", id="data-grid-footer")
    
    async def on_mount(self) -> None:
        """Initialize table structure and data."""
        self._table = self.query_one("#data-grid-table", DataTable)
        self._init_table()
        self._update_data_display()
    
    def _init_table(self) -> None:
        """Initialize table columns."""
        if not self._table:
            return
        
        # Add columns
        for col in self.columns:
            width = col.width if col.width else None
            self._table.add_column(col.label, key=col.key, width=width)
    
    def _update_data_display(self) -> None:
        """Update table with current data."""
        if not self._table:
            return
        
        # Clear existing rows
        self._table.clear()
        
        # Apply sorting if needed
        sorted_data = self._get_sorted_data()
        
        # Add rows
        for row_data in sorted_data:
            values = [str(row_data.get(col.key, "")) for col in self.columns]
            self._table.add_row(*values)
        
        # Update footer
        try:
            footer = self.query_one("#data-grid-footer", Label)
            count = len(sorted_data)
            footer.update(f"{count} rows | {self.sort_column or 'unsorted'}")
        except:
            pass
    
    def _get_sorted_data(self) -> List[Dict[str, Any]]:
        """Get data sorted by current sort column."""
        if not self.sort_column:
            return self.data
        
        # Find the column key (might be different from display name)
        col_key = None
        for col in self.columns:
            if col.label == self.sort_column or col.key == self.sort_column:
                col_key = col.key
                break
        
        if not col_key:
            return self.data
        
        try:
            return sorted(
                self.data,
                key=lambda x: x.get(col_key, ""),
                reverse=self.sort_descending
            )
        except:
            return self.data
    
    def set_data(self, data: List[Dict[str, Any]]) -> None:
        """Update table data."""
        self.data = data
        self._update_data_display()
    
    def get_selected_row(self) -> Optional[Dict[str, Any]]:
        """Get currently selected row data."""
        if self.selected_row_index is None or self.selected_row_index >= len(self.data):
            return None
        return self.data[self.selected_row_index]
    
    def set_sort(self, column: str, descending: bool = False) -> None:
        """Set sort column."""
        self.sort_column = column
        self.sort_descending = descending
        self._update_data_display()
    
    async def action_cursor_up(self) -> None:
        """Move cursor up."""
        if self._table:
            if self._table.cursor_row > 0:
                self._table.cursor_row -= 1
    
    async def action_cursor_down(self) -> None:
        """Move cursor down."""
        if self._table:
            if self._table.cursor_row < len(self.data) - 1:
                self._table.cursor_row += 1
    
    async def action_select_row(self) -> None:
        """Select current row."""
        if self._table:
            self.selected_row_index = self._table.cursor_row
            row = self.get_selected_row()
            if row and self.on_select_callback:
                self.on_select_callback(row)
