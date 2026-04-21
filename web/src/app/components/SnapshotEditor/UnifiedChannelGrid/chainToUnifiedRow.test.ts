import type { Chain, Plugin } from '../../../../map2/types'

import { chainToUnifiedRow } from './chainToUnifiedRow'
import { SLOT_COUNT } from './gridConstants'

function meta(uri: string, category: string, name = uri): Plugin {
  return { uri, name, category } as Plugin
}

function chainFixture(plugins: Array<Partial<Chain['plugins'][number]>>): Chain {
  return {
    id: 1,
    name: 'Main',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    plugins: plugins.map((p, i) => ({
      uri: p.uri ?? `plugin://p${i}`,
      name: p.name ?? 'P',
      position: p.position ?? i,
      bypassed: p.bypassed ?? false,
      parameters: {},
      ...p,
    })) as Chain['plugins'],
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: null,
  } as unknown as Chain
}

describe('chainToUnifiedRow', () => {
  it('returns an empty row of SLOT_COUNT slots when chain is null', () => {
    const row = chainToUnifiedRow(null, {}, { rowId: 'r1', rowName: 'Empty' })
    expect(row.slots).toHaveLength(SLOT_COUNT)
    expect(row.slots.every((s) => s.kind === null)).toBe(true)
    expect(row.id).toBe('r1')
    expect(row.name).toBe('Empty')
  })

  it('places plugins into slots by position and maps category → kind', () => {
    const pluginMeta: Record<string, Plugin> = {
      'plugin://drive': meta('plugin://drive', 'Distortion', 'Drive'),
      'plugin://eq': meta('plugin://eq', 'EQ', 'EQ'),
    }
    const chain = chainFixture([
      { uri: 'plugin://drive', position: 0 },
      { uri: 'plugin://eq', position: 2 },
    ])

    const row = chainToUnifiedRow(chain, pluginMeta)

    expect(row.slots[0].uri).toBe('plugin://drive')
    expect(row.slots[0].category).toBe('Distortion')
    expect(row.slots[0].kind).toBe('plugin') // Distortion has no CATEGORY_TO_KIND mapping → plugin
    expect(row.slots[1].kind).toBeNull()
    expect(row.slots[2].uri).toBe('plugin://eq')
    expect(row.slots[2].category).toBe('EQ')
    expect(row.slots[2].kind).toBe('eq')
  })

  it('clamps positions beyond SLOT_COUNT to the last slot', () => {
    const pluginMeta: Record<string, Plugin> = {
      'plugin://x': meta('plugin://x', 'Utility'),
    }
    const chain = chainFixture([{ uri: 'plugin://x', position: 42 }])
    const row = chainToUnifiedRow(chain, pluginMeta)
    expect(row.slots[SLOT_COUNT - 1].uri).toBe('plugin://x')
  })

  it('detects NAM plugins and maps kind=nam regardless of category', () => {
    const pluginMeta: Record<string, Plugin> = {
      'map2://juce/nam': meta('map2://juce/nam', 'Amplifier', 'NAM'),
    }
    const chain = chainFixture([{ uri: 'map2://juce/nam', position: 0 }])
    const row = chainToUnifiedRow(chain, pluginMeta)
    expect(row.slots[0].kind).toBe('nam')
  })

  it('propagates muted/solo/stereo/sidechain into the row', () => {
    const row = chainToUnifiedRow(chainFixture([]), {}, {
      muted: true,
      solo: true,
      stereo: true,
      sidechainSourceLabel: 'KEY SEND',
    })
    expect(row.muted).toBe(true)
    expect(row.solo).toBe(true)
    expect(row.stereo).toBe(true)
  })

  it('sets bypass on the slot when plugin.bypassed is true', () => {
    const pluginMeta: Record<string, Plugin> = { 'plugin://a': meta('plugin://a', 'EQ') }
    const chain = chainFixture([{ uri: 'plugin://a', position: 0, bypassed: true }])
    const row = chainToUnifiedRow(chain, pluginMeta)
    expect(row.slots[0].bypass).toBe(true)
  })
})
