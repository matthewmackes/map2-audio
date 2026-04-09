import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'
import { buildDataTableFrame } from './dataTableFrame'

type DataRow = Array<string | number>

export function DataTable({
  columns,
  rows,
  selectedIndex,
  sortBy,
  reverse,
}: {
  columns: string[]
  rows: DataRow[]
  selectedIndex?: number
  sortBy?: number
  reverse?: boolean
}) {
  const frame = buildDataTableFrame(columns, rows, { selectedIndex, sortBy, reverse })

  return (
    <Box flexDirection="column">
      <Text bold color={oledPalette.accent}>{frame.header}</Text>
      <Text color={oledPalette.border}>{frame.separator}</Text>
      {frame.rows.map((row) => (
        <Text key={row.key} color={row.isSelected ? oledPalette.focus : oledPalette.text}>
          {row.isSelected ? '› ' : '  '}
          {row.cells}
        </Text>
      ))}
    </Box>
  )
}
