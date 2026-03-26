import React from 'react'
import { Box, Text } from 'ink'
import { toastTone } from '../palette'

export function Toast({ tone, message }: { tone: 'info' | 'warn' | 'error'; message: string }) {
  const color = toastTone(tone)
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color}>{message}</Text>
    </Box>
  )
}
