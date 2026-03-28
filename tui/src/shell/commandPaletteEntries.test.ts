import { screenRegistry } from '../navigation/screenRegistry'
import { buildCommandPaletteEntries, filterCommandPaletteEntries } from './commandPaletteEntries'

describe('command palette entries', () => {
  it('builds both screen navigation entries and global action entries', () => {
    const entries = buildCommandPaletteEntries(screenRegistry)

    expect(entries.find((entry) => entry.id === 'screen:home')?.kind).toBe('screen')
    expect(entries.find((entry) => entry.id === 'action:exit')?.kind).toBe('action')
    expect(entries.find((entry) => entry.id === 'action:clear')?.hint).toBe('Ctrl+L')
  })

  it('filters by screen metadata and action aliases', () => {
    const entries = buildCommandPaletteEntries(screenRegistry)

    expect(filterCommandPaletteEntries(entries, 'tesira').map((entry) => entry.id)).toContain('screen:tesira')
    expect(filterCommandPaletteEntries(entries, 'quit').map((entry) => entry.id)).toContain('action:exit')
    expect(filterCommandPaletteEntries(entries, 'shortcuts').map((entry) => entry.id)).toContain('action:help')
  })
})
