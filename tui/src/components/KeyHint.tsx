import React from 'react'
import { Text } from 'ink'

export function KeyHint({ keys, description }: { keys: string; description: string }) {
  return (
    <Text>
      <Text color="cyan">{keys}</Text>
      <Text color="gray"> {description}</Text>
    </Text>
  )
}
