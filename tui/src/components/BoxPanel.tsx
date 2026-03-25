import React from 'react'
import { Box, Text } from 'ink'

export function BoxPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0} marginBottom={1}>
      <Text color="cyan">{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  )
}
