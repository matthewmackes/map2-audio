import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'
import { StatusDot } from '../components/StatusDot'
import { formatStatusLine } from './statusLine'

export function StatusBar({
  left,
  right,
  columns,
  statusLabel,
  statusTone,
}: {
  left: string
  right: string
  columns: number
  statusLabel: string
  statusTone: 'ok' | 'warn' | 'error' | 'idle'
}) {
  const line = formatStatusLine(left, right, Math.max(columns - statusLabel.length - 4, 20))

  return (
    <Box>
      <StatusDot status={statusTone} />
      <Text color={oledPalette.text}> {statusLabel}</Text>
      <Text color={oledPalette.muted}>{` · ${line}`}</Text>
    </Box>
  )
}
