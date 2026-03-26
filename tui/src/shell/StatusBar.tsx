import React from 'react'
import { Text } from 'ink'
import { oledPalette } from '../palette'
import { formatStatusLine } from './statusLine'

export function StatusBar({ left, right, columns }: { left: string; right: string; columns: number }) {
  return <Text color={oledPalette.muted}>{formatStatusLine(left, right, columns)}</Text>
}
