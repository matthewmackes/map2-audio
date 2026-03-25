import React from 'react'
import { Box, Text } from 'ink'

export function Header({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <Box justifyContent="space-between">
      <Text color="cyan">{title}</Text>
      <Text color="gray">{subtitle}</Text>
    </Box>
  )
}
