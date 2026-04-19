import type {
  Chain,
  ChainTemplate,
  ChainsResponse,
  PluginOrderRef,
  Snapshot,
} from '../types'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'
import {
  getChainReorderCompatibilityKey,
  getLegacyUriOnlyPluginOrder,
  isLegacyUriOnlyReorderValidationError,
  normalizeReorderPluginsResponse,
  type RawReorderPluginsResponse,
} from '../reorderPluginsCompat'

const legacyUriOnlyChainReorderNodes = new Set<string>()

async function postLegacyUriOnlyChainReorder(
  url: string,
  pluginOrder: PluginOrderRef[],
): Promise<{ status: string; chain_id: number; plugins: PluginOrderRef[] }> {
  const response = await fetchJson<RawReorderPluginsResponse>(url, {
    method: 'POST',
    body: JSON.stringify(getLegacyUriOnlyPluginOrder(pluginOrder)),
  })

  return normalizeReorderPluginsResponse(response, pluginOrder)
}

export const chainsApi = {
  list: (nodeId?: string | null) =>
    fetchJson<ChainsResponse>(appendNodeQuery(`${API_BASE}/chains/`, nodeId), { cache: 'no-store' }),

  get: (chainId: number, nodeId?: string | null) =>
    fetchJson<Chain>(appendNodeQuery(`${API_BASE}/chains/${chainId}`, nodeId), { cache: 'no-store' }),

  create: (name: string, nodeId?: string | null) =>
    fetchJson<Chain>(appendNodeQuery(`${API_BASE}/chains/`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  delete: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/${chainId}`, nodeId), {
      method: 'DELETE',
    }),

  rename: (chainId: number, newName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; name: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/rename?new_name=${encodeURIComponent(newName)}`, nodeId),
      { method: 'PUT' },
    ),

  activate: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/activate`, nodeId),
      { method: 'POST' },
    ),

  deactivate: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/deactivate`, nodeId),
      { method: 'POST' },
    ),

  addPlugin: (chainId: number, pluginUri: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; plugins_count: number; plugin_position?: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`, nodeId),
      { method: 'POST' },
    ),

  removePlugin: (chainId: number, pluginUri: string, pluginPosition?: number, nodeId?: string | null) => {
    const params = new URLSearchParams({ plugin_uri: pluginUri })
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition)) {
      params.set('plugin_position', String(pluginPosition))
    }
    return fetchJson<{ status: string; chain_id: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/plugins?${params.toString()}`, nodeId),
      { method: 'DELETE' },
    )
  },

  reorderPlugins: async (chainId: number, pluginOrder: PluginOrderRef[], nodeId?: string | null) => {
    const url = appendNodeQuery(`${API_BASE}/chains/${chainId}/reorder`, nodeId)
    const compatibilityKey = getChainReorderCompatibilityKey(nodeId)

    if (legacyUriOnlyChainReorderNodes.has(compatibilityKey)) {
      return postLegacyUriOnlyChainReorder(url, pluginOrder)
    }

    try {
      const response = await fetchJson<RawReorderPluginsResponse>(url, {
        method: 'POST',
        body: JSON.stringify(pluginOrder),
      })
      return normalizeReorderPluginsResponse(response, pluginOrder)
    } catch (error) {
      if (!isLegacyUriOnlyReorderValidationError(error)) {
        throw error
      }

      legacyUriOnlyChainReorderNodes.add(compatibilityKey)
      return postLegacyUriOnlyChainReorder(url, pluginOrder)
    }
  },

  togglePluginBypass: (chainId: number, pluginUri: string, bypass: boolean, pluginPosition?: number, nodeId?: string | null) => {
    const params = new URLSearchParams({ bypass: String(bypass) })
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition)) {
      params.set('plugin_position', String(pluginPosition))
    }
    return fetchJson<{ status: string; chain_id: number; plugin: string; bypass: boolean }>(
      appendNodeQuery(
        `${API_BASE}/chains/${chainId}/plugins/${encodeURIComponent(pluginUri)}/bypass?${params.toString()}`,
        nodeId,
      ),
      { method: 'POST' },
    )
  },

  savePreset: (chainId: number, presetName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; preset_id: number; name: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/preset/save?preset_name=${encodeURIComponent(presetName)}`, nodeId),
      { method: 'POST' },
    ),

  listPresets: (nodeId?: string | null) =>
    fetchJson<{ presets: Snapshot[]; count: number }>(appendNodeQuery(`${API_BASE}/chains/presets`, nodeId)),

  loadPreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/preset/${presetId}/load`, nodeId), {
      method: 'POST',
    }),

  deletePreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; preset_id: number }>(appendNodeQuery(`${API_BASE}/chains/preset/${presetId}`, nodeId), {
      method: 'DELETE',
    }),

  listTemplates: (nodeId?: string | null) =>
    fetchJson<{ templates: ChainTemplate[]; count: number }>(appendNodeQuery(`${API_BASE}/chains/templates/list`, nodeId)),

  loadTemplate: (templateName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain: Chain }>(
      appendNodeQuery(`${API_BASE}/chains/templates/load?template_name=${encodeURIComponent(templateName)}`, nodeId),
      { method: 'POST' },
    ),
}
