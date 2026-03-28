import {
  API_BASE,
  chainsApi,
  drumsApi,
  healthApi,
  pluginAppearancesApi,
  pluginsApi,
  wwwApi,
} from './api'
import { chainsApi as splitChainsApi } from './clients/chains'
import { drumsApi as splitDrumsApi } from './clients/drums'
import { healthApi as splitHealthApi, wwwApi as splitWwwApi } from './clients/status'
import {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginAppearancesApi as splitPluginAppearancesApi,
  pluginsApi as splitPluginsApi,
} from './clients/plugins'
import { API_BASE as splitApiBase } from './transport'

describe('map2 api compatibility barrel', () => {
  it('re-exports the split client modules and transport base intact', () => {
    expect(API_BASE).toBe(splitApiBase)
    expect(chainsApi).toBe(splitChainsApi)
    expect(pluginsApi).toBe(splitPluginsApi)
    expect(pluginAppearancesApi).toBe(splitPluginAppearancesApi)
    expect(drumsApi).toBe(splitDrumsApi)
    expect(healthApi).toBe(splitHealthApi)
    expect(wwwApi).toBe(splitWwwApi)
    expect(PLUGIN_INVENTORY_CHANGED_EVENT).toBe('map2:plugins-changed')
  })
})
