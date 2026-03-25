import React from 'react'
import { Box, Text } from 'ink'

export function DataTable({
  columns,
  rows,
}: {
  columns: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <Box flexDirection="column">
      <Text color="cyan">{columns.join(' | ')}</Text>
      {rows.map((row, index) => (
        <Text key={`row-${index}`}>{row.join(' | ')}</Text>
      ))}
    </Box>
  )
}
