import React from 'react'
import { Text } from 'ink'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function ProgressBar({ value, width = 24, label }: { value: number; width?: number; label?: string }) {
  const normalized = clamp(value)
  const filled = Math.round(normalized * width)
  const empty = Math.max(0, width - filled)
  return (
    <Text>
      {label ? `${label} ` : ''}
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text color="gray"> {(normalized * 100).toFixed(0)}%</Text>
    </Text>
  )
}
