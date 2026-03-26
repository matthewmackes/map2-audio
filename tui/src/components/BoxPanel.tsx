import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function BoxPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={oledPalette.border} paddingX={1} paddingY={0} marginBottom={1}>
      <Text color={oledPalette.accent}>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  )
}
