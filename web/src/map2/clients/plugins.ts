import type {
  Plugin,
  PluginAppearanceListResponse,
  PluginAppearanceOverride,
  PluginsResponse,
} from '../types'
import type { ParameterDescriptor, ParameterRegistry } from '../../app/data/parameterSchema'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'
import { dispatchRuntimeEvent } from '../runtime'

const BATCH_DELAY_MS = 50
const MAX_BATCH_SIZE = 20

interface ParameterUpdate {
  plugin_uri: string
  param_index: number
  value: number
  instance_id?: number
  plugin_position?: number
}

class ParameterBatcher {
  private queue: ParameterUpdate[] = []
  private timeout: ReturnType<typeof setTimeout> | null = null
  private pendingPromises: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }> = []

  private static updateIdentityKey(
    update: Pick<ParameterUpdate, 'plugin_uri' | 'param_index' | 'instance_id' | 'plugin_position'>,
  ): string {
    if (typeof update.instance_id === 'number' && Number.isFinite(update.instance_id) && update.instance_id > 0) {
      return `instance:${update.instance_id}:${update.param_index}`
    }
    if (typeof update.plugin_position === 'number' && Number.isFinite(update.plugin_position) && update.plugin_position >= 0) {
      return `position:${update.plugin_uri}:${update.plugin_position}:${update.param_index}`
    }
    return `uri:${update.plugin_uri}:${update.param_index}`
  }

  async queueUpdate(
    pluginUri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const normalizedInstanceId = typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0
        ? Math.trunc(instanceId)
        : undefined
      const normalizedPluginPosition = typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0
        ? Math.trunc(pluginPosition)
        : undefined
      const nextUpdate: ParameterUpdate = {
        plugin_uri: pluginUri,
        param_index: paramIndex,
        value,
        ...(normalizedInstanceId !== undefined ? { instance_id: normalizedInstanceId } : {}),
        ...(normalizedPluginPosition !== undefined ? { plugin_position: normalizedPluginPosition } : {}),
      }

      const existingIndex = this.queue.findIndex(
        (u) => ParameterBatcher.updateIdentityKey(u) === ParameterBatcher.updateIdentityKey(nextUpdate),
      )
      if (existingIndex >= 0) {
        this.queue[existingIndex] = nextUpdate
      } else {
        this.queue.push(nextUpdate)
      }

      this.pendingPromises.push({ resolve, reject })

      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          void this.flush()
        }, BATCH_DELAY_MS)
      }

      if (this.queue.length >= MAX_BATCH_SIZE) {
        void this.flush()
      }
    })
  }

  async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (this.queue.length === 0) {
      return
    }

    const updates = [...this.queue]
    const promises = [...this.pendingPromises]
    this.queue = []
    this.pendingPromises = []

    try {
      await fetchJson(`${API_BASE}/plugins/batch/parameters`, {
        method: 'POST',
        body: JSON.stringify({ updates }),
      })
      promises.forEach((promise) => promise.resolve())
    } catch (error) {
      promises.forEach((promise) => promise.reject(error as Error))
    }
  }

  get size(): number {
    return this.queue.length
  }
}

const parameterBatcher = new ParameterBatcher()

export interface PluginDiscoverResponse extends PluginsResponse {
  cached?: boolean
  warning?: string
  error?: string
}

export interface PluginParameterSchemaEntry {
  pluginId: string
  paramKey: string
  index: number
  name: string
  symbol: string
  descriptor: ParameterDescriptor
  isLog: boolean
  isToggled: boolean
  source: 'native' | 'lv2' | 'hardware' | 'plugin'
  format?: string
}

export interface PluginParameterSchemaPlugin {
  pluginId: string
  name: string
  format?: string
  source: 'native' | 'lv2' | 'hardware' | 'plugin'
  parameterCount: number
  parameters: PluginParameterSchemaEntry[]
}

export interface PluginParameterSchemaResponse {
  schema: ParameterRegistry
  plugins: PluginParameterSchemaPlugin[]
  count: number
  cached?: boolean
  warning?: string
  error?: string
}

export const pluginAppearancesApi = {
  list: () => fetchJson<PluginAppearanceListResponse>(`${API_BASE}/plugin-appearances`),

  get: (uri: string) =>
    fetchJson<PluginAppearanceOverride>(`${API_BASE}/plugin-appearances/${encodeURIComponent(uri)}`),

  put: (uri: string, payload: Partial<Omit<PluginAppearanceOverride, 'uri'>>) =>
    fetchJson<PluginAppearanceOverride>(`${API_BASE}/plugin-appearances/${encodeURIComponent(uri)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  remove: (uri: string) =>
    fetchJson<{ status: string; uri: string; removed: boolean }>(`${API_BASE}/plugin-appearances/${encodeURIComponent(uri)}`, {
      method: 'DELETE',
    }),

  uploadIcon: (uri: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<PluginAppearanceOverride>(`${API_BASE}/plugin-appearances/${encodeURIComponent(uri)}/icon-upload`, {
      method: 'POST',
      body: formData,
    })
  },
}

export const PLUGIN_INVENTORY_CHANGED_EVENT = 'map2:plugins-changed'

function notifyPluginInventoryChanged(): void {
  dispatchRuntimeEvent(new CustomEvent(PLUGIN_INVENTORY_CHANGED_EVENT))
}

export const pluginsApi = {
  discover: (refresh = false, nodeId?: string | null) =>
    fetchJson<PluginDiscoverResponse>(
      appendNodeQuery(`${API_BASE}/plugins/discover${refresh ? '?refresh=true' : ''}`, nodeId),
    ),

  getAll: (nodeId?: string | null) =>
    fetchJson<Plugin[]>(appendNodeQuery(`${API_BASE}/plugins/all`, nodeId)),

  refresh: async () => {
    const response = await fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/refresh`, { method: 'POST' })
    notifyPluginInventoryChanged()
    return response
  },

  clearCache: async () => {
    const response = await fetchJson<{ status: string; plugins_cleared: number }>(`${API_BASE}/plugins/cache`, { method: 'DELETE' })
    notifyPluginInventoryChanged()
    return response
  },

  list: () =>
    fetchJson<{ loaded: Plugin[]; count: number; parked?: Plugin[]; parked_count?: number }>(`${API_BASE}/plugins/list`),

  load: async (uri: string) => {
    const response = await fetchJson<{ status: string; plugin: Plugin }>(`${API_BASE}/plugins/load?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    })
    notifyPluginInventoryChanged()
    return response
  },

  unload: async (uri: string, instanceId?: number) => {
    const params = new URLSearchParams({ uri })
    if (typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0) {
      params.set('instance_id', String(Math.trunc(instanceId)))
    }
    const response = await fetchJson<{ status: string; uri: string; instance_id?: number }>(`${API_BASE}/plugins/unload?${params.toString()}`, {
      method: 'POST',
    })
    notifyPluginInventoryChanged()
    return response
  },

  getParameterSchema: (refresh = false) =>
    fetchJson<PluginParameterSchemaResponse>(`${API_BASE}/plugins/parameter-schema${refresh ? '?refresh=true' : ''}`),

  delete: (uri: string, nodeId?: string | null) =>
    fetchJson<{ status: string; uri: string; path: string; removed: number }>(
      appendNodeQuery(`${API_BASE}/plugins/${encodeURIComponent(uri)}`, nodeId),
      { method: 'DELETE' },
    ),

  getParameters: (uri: string) =>
    fetchJson<{ uri: string; parameters: unknown[] }>(`${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters`),

  setParameter: (uri: string, paramIndex: number, value: number, instanceId?: number, pluginPosition?: number) => {
    const params = new URLSearchParams({ value: String(value) })
    if (typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0) {
      params.set('instance_id', String(Math.trunc(instanceId)))
    }
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0) {
      params.set('plugin_position', String(Math.trunc(pluginPosition)))
    }
    return fetchJson<{ uri: string; param: number; value: number }>(
      `${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters/${paramIndex}?${params.toString()}`,
      { method: 'POST' },
    )
  },

  setParameterBatched: (uri: string, paramIndex: number, value: number, instanceId?: number, pluginPosition?: number) =>
    parameterBatcher.queueUpdate(uri, paramIndex, value, instanceId, pluginPosition),

  flushParameterBatch: () => parameterBatcher.flush(),

  getPendingBatchSize: () => parameterBatcher.size,

  batchSetParameters: (updates: Array<{ uri: string; paramIndex: number; value: number; instanceId?: number; pluginPosition?: number }>) =>
    fetchJson<{
      status: string
      applied: number
      errors: number
      results: Array<{ plugin_uri: string; param_index: number; value: number }>
      error_details?: Array<{ plugin_uri: string; param_index: number; error: string }>
    }>(`${API_BASE}/plugins/batch/parameters`, {
      method: 'POST',
      body: JSON.stringify({
        updates: updates.map((update) => ({
          plugin_uri: update.uri,
          param_index: update.paramIndex,
          value: update.value,
          ...(typeof update.instanceId === 'number' && Number.isFinite(update.instanceId) && update.instanceId > 0
            ? { instance_id: Math.trunc(update.instanceId) }
            : {}),
          ...(typeof update.pluginPosition === 'number' && Number.isFinite(update.pluginPosition) && update.pluginPosition >= 0
            ? { plugin_position: Math.trunc(update.pluginPosition) }
            : {}),
        })),
      }),
    }),
}
