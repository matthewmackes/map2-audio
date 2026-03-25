import React from 'react'
import { Box, Text } from 'ink'

export function StatusBar({ left, right }: { left: string; right: string }) {
  return (
    <Box justifyContent="space-between">
      <Text color="gray">{left}</Text>
      <Text color="gray">{right}</Text>
    </Box>
  )
}
