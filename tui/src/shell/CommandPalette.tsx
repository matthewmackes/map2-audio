import React from 'react'
import { Box } from 'ink'
import { BoxPanel } from '../components/BoxPanel'
import { FilterableList } from '../components/FilterableList'
import type { ScreenDefinition } from '../navigation/types'

export function CommandPalette({
  query,
  screens,
  activeIndex,
}: {
  query: string
  screens: ScreenDefinition[]
  activeIndex: number
}) {
  return (
    <Box>
      <BoxPanel title="Screen Palette">
        <FilterableList
          filter={query}
          activeIndex={activeIndex}
          items={screens.map((screen) => `${screen.title} — ${screen.description}`)}
        />
      </BoxPanel>
    </Box>
  )
}
