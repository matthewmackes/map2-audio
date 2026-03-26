import React from 'react'
import { Text } from 'ink'
import { oledPalette } from '../palette'

const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function Sparkline({ values }: { values: number[] }) {
  if (!values.length) {
    return <Text color={oledPalette.muted}>n/a</Text>
  }

  const max = Math.max(...values, 1)
  return <Text color={oledPalette.accent}>{values.map((value) => BARS[Math.min(BARS.length - 1, Math.floor((value / max) * (BARS.length - 1))) || 0]).join('')}</Text>
}
