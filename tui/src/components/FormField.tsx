import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function FormField({ label, value, focused = false }: { label: string; value: string; focused?: boolean }) {
  return (
    <Box>
      <Text color={focused ? oledPalette.focus : oledPalette.muted}>{label.padEnd(14)}</Text>
      <Text>{value}</Text>
    </Box>
  )
}
