import React from 'react'
import { Text } from 'ink'

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
      <Text color="green">{'▮'.repeat(safe)}</Text>
      <Text color="yellow">{'▮'.repeat(warn)}</Text>
      <Text color="red">{'▮'.repeat(danger)}</Text>
      <Text color="gray">{'▯'.repeat(Math.max(0, segments - active))}</Text>
      <Text color="gray"> {(normalized * 100).toFixed(0)}%</Text>
    </Text>
  )
}
