import React from 'react'
import { Box, Text } from 'ink'
import { toastTone } from '../palette'

const TOAST_ICON = {
  info: '◌',
  warn: '▲',
  error: '■',
} as const

export function Toast({
  tone,
  message,
  title,
  dismissHint,
  secondsRemaining,
}: {
  tone: 'info' | 'warn' | 'error'
  message: string
  title?: string
  dismissHint?: string
  secondsRemaining?: number
}) {
  const color = toastTone(tone)
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} flexDirection="column">
      <Text color={color}>
        {TOAST_ICON[tone]} {title ?? (tone === 'error' ? 'Error' : tone === 'warn' ? 'Warning' : 'Notice')}
      </Text>
      <Text>{message}</Text>
      {(dismissHint || secondsRemaining !== undefined) ? (
        <Text color={color}>
          {[dismissHint, secondsRemaining !== undefined ? `${secondsRemaining}s` : undefined].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </Box>
  )
}
