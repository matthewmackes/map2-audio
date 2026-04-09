type DataRow = Array<string | number>

function padCell(value: string, width: number): string {
  return value.padEnd(width, ' ')
}

export function buildDataTableFrame(
  columns: string[],
  rows: DataRow[],
  {
    selectedIndex = -1,
    sortBy,
    reverse = false,
  }: {
    selectedIndex?: number
    sortBy?: number
    reverse?: boolean
  } = {},
) {
  const indexedRows = rows.map((row, index) => ({ row: row.map((cell) => String(cell)), index }))
  const orderedRows = sortBy === undefined
    ? indexedRows
    : [...indexedRows].sort((left, right) => {
      const leftValue = left.row[sortBy] ?? ''
      const rightValue = right.row[sortBy] ?? ''
      return reverse ? rightValue.localeCompare(leftValue, undefined, { numeric: true }) : leftValue.localeCompare(rightValue, undefined, { numeric: true })
    })

  const widths = columns.map((column, columnIndex) => {
    const contentWidths = orderedRows.map(({ row }) => (row[columnIndex] ?? '').length)
    return Math.max(column.length, ...contentWidths, 1)
  })
  const header = columns.map((column, index) => padCell(column, widths[index])).join('  ')
  const separator = widths.map((width) => '─'.repeat(width)).join('  ')

  return {
    header,
    separator,
    rows: orderedRows.map(({ row, index }) => ({
      key: `row-${index}`,
      cells: row.map((cell, columnIndex) => padCell(cell ?? '', widths[columnIndex])).join('  '),
      isSelected: index === selectedIndex,
    })),
  }
}
