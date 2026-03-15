import type { Plugin } from '../../map2/types'
import { sortPluginsForBrowser } from './pluginBrowserSort'

function createPlugin(overrides: Partial<Plugin>): Plugin {
  return {
    uri: 'urn:test:plugin',
    name: 'Plugin',
    author: '',
    category: 'Utility',
    format: 'LV2',
    bypassed: false,
    position: 0,
    in_ports: 2,
    out_ports: 2,
    parameters: {},
    ...overrides,
  } as Plugin
}

describe('sortPluginsForBrowser', () => {
  it('sorts plugins by display name, then author, then URI', () => {
    const plugins = [
      createPlugin({ uri: 'urn:test:zeta', name: 'Zeta Delay', author: 'Gamma Audio' }),
      createPlugin({ uri: 'urn:test:beta-2', name: 'Beta Mod', author: 'Zulu Labs' }),
      createPlugin({ uri: 'urn:test:beta-1', name: 'Beta Mod', author: 'Alpha Labs' }),
      createPlugin({ uri: 'urn:test:beta-0', name: 'Beta Mod', author: 'Alpha Labs' }),
    ]

    expect(sortPluginsForBrowser(plugins).map((plugin) => plugin.uri)).toEqual([
      'urn:test:beta-0',
      'urn:test:beta-1',
      'urn:test:beta-2',
      'urn:test:zeta',
    ])
  })

  it('uses sanitized display names for restricted plugin labels', () => {
    const plugins = [
      createPlugin({ uri: 'urn:test:plain', name: 'Vintage Delay' }),
      createPlugin({ uri: 'map2://juce/effects/eventide-h9', name: 'Eventide H9' }),
    ]

    expect(sortPluginsForBrowser(plugins).map((plugin) => plugin.uri)).toEqual([
      'map2://juce/effects/eventide-h9',
      'urn:test:plain',
    ])
  })
})
