import React from 'react'
import { Text } from 'ink'
import { oledPalette } from '../palette'

export function VuMeter({ level, label }: { level: number; label: string }) {
  const normalized = Math.max(0, Math.min(1, level))
  const segments = 16
  const active = Math.round(normalized * segments)
  const safe = Math.min(active, 10)
  const warn = Math.max(0, Math.min(active - 10, 4))
  const danger = Math.max(0, active - 14)

  return (
    <Text>
      {label.padEnd(8)}
      <Text color={oledPalette.success}>{'▮'.repeat(safe)}</Text>
      <Text color={oledPalette.warning}>{'▮'.repeat(warn)}</Text>
      <Text color={oledPalette.danger}>{'▮'.repeat(danger)}</Text>
      <Text color={oledPalette.idle}>{'▯'.repeat(Math.max(0, segments - active))}</Text>
      <Text color={oledPalette.muted}> {(normalized * 100).toFixed(0)}%</Text>
    </Text>
  )
}
