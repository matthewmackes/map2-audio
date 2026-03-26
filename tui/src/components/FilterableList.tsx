import React from 'react'
import { Box, Text } from 'ink'
import { oledPalette } from '../palette'

export function FilterableList({
  filter,
  items,
  activeIndex = 0,
}: {
  filter: string
  items: string[]
  activeIndex?: number
}) {
  const filtered = items.filter((item) => item.toLowerCase().includes(filter.toLowerCase()))
  return (
    <Box flexDirection="column">
      <Text color={oledPalette.muted}>Filter: {filter || 'all'}</Text>
      {filtered.map((item, index) => (
        <Text key={item} color={index === activeIndex ? oledPalette.focus : oledPalette.text}>
          {index === activeIndex ? '›' : ' '} {item}
        </Text>
      ))}
    </Box>
  )
}
