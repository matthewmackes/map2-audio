import type { ScreenDefinition, ScreenId } from '../navigation/types'

export type CommandPaletteActionId = 'help' | 'clear' | 'exit'

export interface ScreenPaletteEntry {
  id: `screen:${ScreenId}`
  kind: 'screen'
  title: string
  description: string
  hint?: string
  searchText: string
  screenId: ScreenId
}

export interface ActionPaletteEntry {
  id: `action:${CommandPaletteActionId}`
  kind: 'action'
  title: string
  description: string
  hint: string
  searchText: string
  actionId: CommandPaletteActionId
}

export type CommandPaletteEntry = ScreenPaletteEntry | ActionPaletteEntry

const actionEntries: ActionPaletteEntry[] = [
  {
    id: 'action:help',
    kind: 'action',
    actionId: 'help',
    title: 'Show Help',
    description: 'Open the global key and operator help overlay',
    hint: '?',
    searchText: 'show help keys shortcuts overlay',
  },
  {
    id: 'action:clear',
    kind: 'action',
    actionId: 'clear',
    title: 'Clear Canvas',
    description: 'Clear the terminal canvas and redraw the active screen',
    hint: 'Ctrl+L',
    searchText: 'clear canvas terminal redraw refresh cls',
  },
  {
    id: 'action:exit',
    kind: 'action',
    actionId: 'exit',
    title: 'Exit map2-tui',
    description: 'Leave the Ink shell immediately',
    hint: 'q / Ctrl+Q',
    searchText: 'exit quit close leave shell terminal',
  },
]

export function buildCommandPaletteEntries(screens: ScreenDefinition[]): CommandPaletteEntry[] {
  const screenEntries: ScreenPaletteEntry[] = screens.map((screen) => ({
    id: `screen:${screen.id}`,
    kind: 'screen',
    title: screen.title,
    description: screen.description,
    hint: screen.keyHint,
    searchText: `${screen.id} ${screen.shortTitle} ${screen.title} ${screen.description} ${screen.keyHint ?? ''}`.toLowerCase(),
    screenId: screen.id,
  }))

  return [...screenEntries, ...actionEntries]
}

export function filterCommandPaletteEntries(entries: CommandPaletteEntry[], query: string): CommandPaletteEntry[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return entries
  }

  return entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.description} ${entry.hint ?? ''} ${entry.searchText}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })
}
