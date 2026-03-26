import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function TabBar({ tabs, activeId }: { tabs: Array<{ id: string; label: string }>; activeId: string }) {
  return (
    <Box>
      {tabs.map((tab, index) => (
        <Text key={tab.id} color={tab.id === activeId ? oledPalette.focus : oledPalette.muted}>
          {index > 0 ? '  ' : ''}{tab.id === activeId ? `▸ ${tab.label}` : `  ${tab.label}`}
        </Text>
      ))}
    </Box>
  )
}
