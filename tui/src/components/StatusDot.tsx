import React from 'react'
import { Text } from 'ink'

export function StatusDot({ status }: { status: 'ok' | 'warn' | 'error' | 'idle' }) {
  const color = status === 'ok' ? 'green' : status === 'warn' ? 'yellow' : status === 'error' ? 'red' : 'gray'
  return <Text color={color}>●</Text>
}
