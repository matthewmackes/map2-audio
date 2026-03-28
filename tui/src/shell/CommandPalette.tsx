import React from 'react'
import { Box, Text } from 'ink'
import { BoxPanel } from '../components/BoxPanel'
import { oledPalette } from '../palette'
import type { CommandPaletteEntry } from './commandPaletteEntries'

export function CommandPalette({
  query,
  entries,
  activeIndex,
}: {
  query: string
  entries: CommandPaletteEntry[]
  activeIndex: number
}) {
  return (
    <Box>
      <BoxPanel title="Command Palette">
        <Text color={oledPalette.muted}>Filter: {query || 'all commands'}</Text>
        {entries.length ? entries.map((entry, index) => (
          <Text key={entry.id} color={index === activeIndex ? oledPalette.focus : oledPalette.text}>
            {index === activeIndex ? '›' : ' '}
            <Text color={entry.kind === 'action' ? oledPalette.warning : oledPalette.accent}>
              [{entry.kind === 'action' ? 'ACT' : 'SCR'}]
            </Text>
            {entry.hint ? <Text color={oledPalette.muted}> {entry.hint}</Text> : null}
            <Text> {entry.title}</Text>
            <Text color={oledPalette.muted}> — {entry.description}</Text>
          </Text>
        )) : <Text color={oledPalette.muted}>No commands match the current filter.</Text>}
      </BoxPanel>
    </Box>
  )
}
