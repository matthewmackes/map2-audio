import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function LogStream({ lines }: { lines: string[] }) {
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} color={oledPalette.muted}>
          {line}
        </Text>
      ))}
    </Box>
  )
}
