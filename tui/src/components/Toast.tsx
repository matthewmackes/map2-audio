import React from 'react'
import { Box, Text } from 'ink'

export function Toast({ tone, message }: { tone: 'info' | 'warn' | 'error'; message: string }) {
  const color = tone === 'error' ? 'red' : tone === 'warn' ? 'yellow' : 'cyan'
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color}>{message}</Text>
    </Box>
  )
}
