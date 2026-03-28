import type { Chain } from '../../../web/src/map2/types'
import { buildLivePluginSlots, formatBypassEvent, formatChainActivationEvent, getActiveChain, getAdjacentChain, getPluginIdentity } from './signalChainsLive'

function buildChain(overrides?: Partial<Chain>): Chain {
  return {
    id: 7,
    name: 'Sunday Live',
    is_active: true,
    created_at: '',
    updated_at: '',
    plugins: [],
    ...overrides,
  }
}

describe('signalChainsLive helpers', () => {
  it('prefers the active chain when one is flagged', () => {
    const chains = [
      buildChain({ id: 1, name: 'A', is_active: false }),
      buildChain({ id: 2, name: 'B', is_active: true }),
    ]
    expect(getActiveChain(chains)?.id).toBe(2)
  })

  it('builds exactly 8 hotkey slots and preserves the first 8 plugin positions', () => {
    const chain = buildChain({
      plugins: Array.from({ length: 10 }, (_, index) => {
        const position = 9 - index
        return {
          uri: `urn:map2:test:${position}`,
          name: `Plugin ${position + 1}`,
          position,
          bypassed: index % 2 === 0,
          parameters: {},
          format: 'LV2',
        }
      }),
    })

    const slots = buildLivePluginSlots(chain)
    expect(slots).toHaveLength(8)
    expect(slots[0]?.plugin?.position).toBe(0)
    expect(slots[7]?.plugin?.position).toBe(7)
    expect(slots[7]?.primaryLabel).toBe('Plugin 8')
  })

  it('builds clear identity labels for plugin slots', () => {
    const identity = getPluginIdentity({
      uri: 'urn:map2:plugins:amp-stack',
      name: 'Amp Stack',
      plugin_display_type: 'Amp',
      position: 0,
      bypassed: false,
      parameters: {},
      format: 'LV2',
    })

    expect(identity.primaryLabel).toBe('Amp Stack')
    expect(identity.secondaryLabel).toContain('Amp')
    expect(identity.secondaryLabel).toContain('LV2')
  })

  it('formats live bypass events with slot identity', () => {
    const slots = buildLivePluginSlots(buildChain({
      plugins: [{
        uri: 'urn:map2:plugins:delay',
        name: 'Delay',
        position: 0,
        bypassed: false,
        parameters: {},
      }],
    }))

    const event = formatBypassEvent('Sunday Live', slots[0], true, new Date('2026-03-26T15:15:16'))
    expect(event).toBe('15:15:16 Sunday Live · 1 Delay -> BYPASSED')
  })

  it('cycles to adjacent chains in both directions with wraparound', () => {
    const chains = [
      buildChain({ id: 10, name: 'Clean', is_active: false }),
      buildChain({ id: 11, name: 'Crunch', is_active: true }),
      buildChain({ id: 12, name: 'Lead', is_active: false }),
    ]

    expect(getAdjacentChain(chains, 11, -1)?.id).toBe(10)
    expect(getAdjacentChain(chains, 11, 1)?.id).toBe(12)
    expect(getAdjacentChain(chains, 10, -1)?.id).toBe(12)
  })

  it('formats chain activation events for the live event strip', () => {
    const event = formatChainActivationEvent('Lead', new Date('2026-03-28T11:22:23'))
    expect(event).toBe('11:22:23 Active chain -> Lead')
  })
})
