import React from 'react'
import { Text } from 'ink'
import { oledPalette } from '../palette'

export function KeyHint({ keys, description }: { keys: string; description: string }) {
  return (
    <Text>
      <Text color={oledPalette.focus}>{keys}</Text>
      <Text color={oledPalette.muted}> {description}</Text>
    </Text>
  )
}
