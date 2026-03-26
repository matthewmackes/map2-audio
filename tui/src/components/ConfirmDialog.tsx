import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function ConfirmDialog({ title, body }: { title: string; body: string }) {
  return (
    <Box flexDirection="column" borderStyle="double" borderColor={oledPalette.warning} paddingX={1}>
      <Text color={oledPalette.warning}>{title}</Text>
      <Text>{body}</Text>
      <Text color={oledPalette.muted}>Press y to confirm or n to cancel.</Text>
    </Box>
  )
}
