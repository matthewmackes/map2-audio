import React from 'react'
import { Box, Text } from 'ink'

export function FormField({ label, value, focused = false }: { label: string; value: string; focused?: boolean }) {
  return (
    <Box>
      <Text color={focused ? 'cyan' : 'gray'}>{label.padEnd(14)}</Text>
      <Text>{value}</Text>
    </Box>
  )
}
