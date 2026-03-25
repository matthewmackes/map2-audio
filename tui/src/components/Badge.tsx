import React from 'react'
import { Text } from 'ink'

export function Badge({ label, color = 'cyan' }: { label: string; color?: Parameters<typeof Text>[0]['color'] }) {
  return <Text color={color}>[{label}]</Text>
}
