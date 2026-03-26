import React from 'react'
import { Text } from 'ink'
import { oledPalette } from '../palette'

export function Badge({ label, color = oledPalette.accent }: { label: string; color?: Parameters<typeof Text>[0]['color'] }) {
  return <Text color={color}>[{label}]</Text>
}
