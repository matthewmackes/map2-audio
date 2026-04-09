import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function EmptyState({
  icon = '○',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description: string
  action?: string
}) {
  return (
    <Box borderStyle="round" borderColor={oledPalette.border} paddingX={1} paddingY={0} flexDirection="column">
      <Text color={oledPalette.accent}>{icon} {title}</Text>
      <Text color={oledPalette.muted}>{description}</Text>
      {action ? <Text color={oledPalette.focus}>{action}</Text> : null}
    </Box>
  )
}
