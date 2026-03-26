import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <Box flexDirection="column">
      <Text color={oledPalette.accent}>{columns.join(' | ')}</Text>
      {rows.map((row, index) => (
        <Text key={`row-${index}`}>{row.join(' | ')}</Text>
      ))}
    </Box>
  )
}
