/**
 * T2503 Set 9 — plugin inventory client.
 *
 * Wraps /api/v1/plugin-inventory. Consumed by both the live engine UI
 * (plugin-card pickers) and the DAW reference UI (plugin-rack browser).
 */
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export type PluginFormat = 'lv2' | 'native'

export interface PluginDescriptor {
  uri: string
  name: string
  vendor: string
  category: string
  format: PluginFormat
  audio_inputs: number
  audio_outputs: number
  is_instrument: boolean
}

export interface PluginInventoryResponse {
  plugins: PluginDescriptor[]
  last_scan_at: number | null
  size: number
}

export const pluginInventoryApi = {
  list: () =>
    fetchJson<PluginInventoryResponse>(
      `${API_BASE}/v1/plugin-inventory/`,
    ),

  get: (uri: string) =>
    fetchJson<PluginDescriptor>(
      `${API_BASE}/v1/plugin-inventory/${encodeURIComponent(uri)}`,
    ),
}
