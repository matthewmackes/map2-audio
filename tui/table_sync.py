from __future__ import annotations

from typing import Iterable, Sequence

from textual.widgets import DataTable


def ensure_columns(table: DataTable, *columns: str) -> None:
    if table.columns:
        return
    table.add_columns(*columns)
    table.cursor_type = "row"
    if columns:
        loading_row = ["Loading"]
        if len(columns) > 1:
            loading_row.append("Waiting for first payload")
        loading_row.extend("" for _ in range(max(0, len(columns) - len(loading_row))))
        table.add_row(*loading_row, key="loading")


def sync_table_rows(
    table: DataTable,
    rows: Iterable[Sequence[object]],
    *,
    row_keys: Iterable[str] | None = None,
    sort_columns: Sequence[str] | None = None,
    reverse: bool = False,
) -> None:
    current_row_key = None
    if table.cursor_row is not None and 0 <= table.cursor_row < table.row_count:
        current_row_key = table.ordered_rows[table.cursor_row].key

    column_keys = list(table.columns)
    width = len(column_keys)
    keyed_rows: list[tuple[str, tuple[object, ...]]] = []
    keys = list(row_keys) if row_keys is not None else []

    for index, row in enumerate(rows):
        values = list(row[:width]) if isinstance(row, tuple) else list(row)
        if len(values) < width:
            values.extend("" for _ in range(width - len(values)))
        keyed_rows.append((keys[index] if index < len(keys) else f"row-{index}", tuple(values[:width])))

    target_keys = {row_key for row_key, _row in keyed_rows}
    for existing_key in list(table.rows.keys()):
        if str(existing_key) == "loading" or getattr(existing_key, "value", None) == "loading":
            table.remove_row(existing_key)
            continue
        if existing_key not in target_keys and str(existing_key) not in target_keys:
            table.remove_row(existing_key)

    for row_key, values in keyed_rows:
        if row_key not in table.rows:
            table.add_row(*values, key=row_key)
            continue
        existing_values = table.get_row(row_key)
        for index, value in enumerate(values):
            if existing_values[index] != value:
                table.update_cell(row_key, column_keys[index], value, update_width=True)

    if sort_columns:
        table.sort(*sort_columns, reverse=reverse)

    if table.row_count == 0:
        return

    selected_key = current_row_key if current_row_key in table.rows else table.ordered_rows[0].key
    table.move_cursor(row=table.get_row_index(selected_key), column=0, animate=False, scroll=False)
