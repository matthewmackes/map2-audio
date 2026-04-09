import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'
import { StatusDot } from '../components/StatusDot'

export function Header({
  title,
  subtitle,
  pathContext,
  statusLabel,
  statusTone,
  pendingJobs,
  environment,
  workspace,
}: {
  title: string
  subtitle: string
  pathContext: string
  statusLabel: string
  statusTone: 'ok' | 'warn' | 'error' | 'idle'
  pendingJobs: number
  environment: string
  workspace: string
}) {
  return (
    <Box justifyContent="space-between" borderStyle="round" borderColor={oledPalette.border} paddingX={1}>
      <Box flexDirection="column">
        <Text color={oledPalette.accent}>{title}</Text>
        <Text color={oledPalette.muted}>{subtitle}</Text>
        <Text color={oledPalette.focus}>{pathContext}</Text>
      </Box>
      <Box flexDirection="column" alignItems="flex-end">
        <Box>
          <StatusDot status={statusTone} />
          <Text color={oledPalette.text}> {statusLabel}</Text>
          <Text color={oledPalette.muted}>{` · jobs ${pendingJobs}`}</Text>
        </Box>
        <Text color={oledPalette.muted}>{`${environment} · ${workspace}`}</Text>
      </Box>
    </Box>
  )
}
