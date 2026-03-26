import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function Header({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <Box justifyContent="space-between">
      <Text color={oledPalette.accent}>{title}</Text>
      <Text color={oledPalette.muted}>{subtitle}</Text>
    </Box>
  )
}
