import React from 'react'
import { Box, Text } from 'ink'

export function TabBar({ tabs, activeId }: { tabs: Array<{ id: string; label: string }>; activeId: string }) {
  return (
    <Box>
      {tabs.map((tab, index) => (
        <Text key={tab.id} color={tab.id === activeId ? 'cyan' : 'gray'}>
          {index > 0 ? '  ' : ''}{tab.id === activeId ? `▸ ${tab.label}` : `  ${tab.label}`}
        </Text>
      ))}
    </Box>
  )
}
