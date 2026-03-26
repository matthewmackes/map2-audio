import React from 'react'
import { Text } from 'ink'
import { statusTone } from '../palette'

export function StatusDot({ status }: { status: 'ok' | 'warn' | 'error' | 'idle' }) {
  return <Text color={statusTone(status)}>●</Text>
}
