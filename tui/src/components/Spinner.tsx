import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function Spinner({ label = 'Loading' }: { label?: string }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % FRAMES.length)
    }, 80)

    return () => clearInterval(timer)
  }, [])

  return (
    <Box borderStyle="round" borderColor={oledPalette.border} paddingX={1}>
      <Text color={oledPalette.accent}>{FRAMES[index]} {label}</Text>
    </Box>
  )
}
