import type * as Api from '../api'
import type {
  IRStatus,
  IRWaveformPreview,
  IRsResponse,
  NAMModelsResponse,
  NAMStatus,
} from '../types'
import type { PluginRuntimeScopeOptions } from '../http'
import type {
  DownloadProgress,
  DownloadRequest,
  FileDownloadTask,
  IRCategoriesResponse,
  IRDetailedItem,
  IRLibrariesResponse,
  IRListResponse,
  IRSearchRequest,
  IRSearchResponse,
  SoundFontCategoriesResponse,
  SoundFontLibrariesResponse,
  SoundFontListResponse,
  SoundFontPresetResponse,
} from '../../app/types/library'
import {
  ApiError,
  appendNodeQuery,
  appendPluginRuntimeQuery,
  appendQueryParams,
  fetchJson,
} from '../http'
import { API_BASE } from '../transport'

export const irApi = {
  getStatus: (nodeId?: string | null) => fetchJson<IRStatus>(appendNodeQuery(`${API_BASE}/ir/`, nodeId)),

  getTypeStatus: (
    type: 'cabinet' | 'reverb',
    options?: { instanceId?: number; pluginPosition?: number; nodeId?: string | null },
  ) => fetchJson<IRStatus>(
    appendPluginRuntimeQuery(
      appendQueryParams(`${API_BASE}/ir/status`, { type }),
      options,
    ),
  ),

  listCabinets: (nodeId?: string | null) => fetchJson<IRsResponse>(appendNodeQuery(`${API_BASE}/ir/cabinets`, nodeId)),

  listReverbs: (nodeId?: string | null) => fetchJson<IRsResponse>(appendNodeQuery(`${API_BASE}/ir/reverbs`, nodeId)),

  getWaveformPreview: (assetPath: string, sampleCount = 192, nodeId?: string | null) =>
    fetchJson<IRWaveformPreview>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/waveform-preview`, {
          asset_path: assetPath,
          sample_count: sampleCount,
        }),
        nodeId,
      ),
    ),

  loadCabinet: (irName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(`${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`, nodeId),
      { method: 'POST' },
    ),

  loadReverb: (irName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(`${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`, nodeId),
      { method: 'POST' },
    ),

  loadCabinetToInstance: (irName: string, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  loadCabinetAtPosition: (irName: string, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  loadReverbToInstance: (irName: string, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  loadReverbAtPosition: (irName: string, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  setCabinetMixForInstance: (mix: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-cabinet-mix/${mix}`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setCabinetMixAtPosition: (mix: number, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-cabinet-mix/${mix}`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  setReverbMixForInstance: (mix: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-reverb-mix/${mix}`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setReverbMixAtPosition: (mix: number, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-reverb-mix/${mix}`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  setCabinetBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-cabinet-bypass/${bypass}`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setCabinetBypassAtPosition: (bypass: boolean, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-cabinet-bypass/${bypass}`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  setReverbBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-reverb-bypass/${bypass}`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setReverbBypassAtPosition: (bypass: boolean, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/set-reverb-bypass/${bypass}`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  navigateCabinetToInstance: (direction: 'prev' | 'next', instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/navigate-cabinet/${direction}`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  navigateCabinetAtPosition: (direction: 'prev' | 'next', pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/ir/navigate-cabinet/${direction}`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  uploadCabinet: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/ir/cabinets/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>
  },

  uploadReverb: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/ir/reverbs/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>
  },
}

export const irLibraryApi = {
  getLibraries: () =>
    fetchJson<IRLibrariesResponse>(`${API_BASE}/irs/libraries/`),

  getCategories: () =>
    fetchJson<IRCategoriesResponse>(`${API_BASE}/irs/categories/`),

  listIRs: (params?: { limit?: number; offset?: number; category?: string; library?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.library) query.set('library', params.library)
    const queryString = query.toString()
    return fetchJson<IRListResponse>(`${API_BASE}/irs/${queryString ? `?${queryString}` : ''}`)
  },

  getIR: (id: number) =>
    fetchJson<IRDetailedItem>(`${API_BASE}/irs/${id}`),

  search: (request: IRSearchRequest) =>
    fetchJson<IRSearchResponse>(`${API_BASE}/irs/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  startDownload: (request: { sources?: string[]; parallel?: number; skip_existing?: boolean; limit?: number }) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/irs/download`,
      { method: 'POST', body: JSON.stringify(request) },
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/irs/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(`${API_BASE}/irs/download/retry/${source}`, { method: 'POST' }),

  pauseDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/pause`, { method: 'POST' }),

  resumeDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/resume`, { method: 'POST' }),

  getFileTasks: () =>
    fetchJson<FileDownloadTask[]>(`${API_BASE}/irs/download/files`),

  getFileProgress: (filename: string) =>
    fetchJson<FileDownloadTask>(`${API_BASE}/irs/download/file/${filename}`),

  toggleFavorite: (id: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/irs/${id}/favorite`,
      { method: 'POST' },
    ),

  setRating: (id: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/irs/${id}/rating`,
      { method: 'PUT', body: JSON.stringify({ rating }) },
    ),

  getTone3000Status: () =>
    fetchJson<{ configured: boolean; authenticated: boolean; auth_url: string; token_expires: string | null }>(
      `${API_BASE}/irs/tone3000/status`,
    ),

  setTone3000ApiKey: (apiKey: string) =>
    fetchJson<{ status: string; configured: boolean }>(
      `${API_BASE}/irs/tone3000/api-key`,
      { method: 'POST', body: JSON.stringify({ api_key: apiKey }) },
    ),

  testTone3000Auth: () =>
    fetchJson<{ status: string; authenticated: boolean; message?: string; sample_models?: Array<{ name: string; author: string; category: string }> }>(
      `${API_BASE}/irs/tone3000/test`,
      { method: 'POST' },
    ),
}

export const namApi = {
  getStatus: (nodeId?: string | null) => fetchJson<NAMStatus>(appendNodeQuery(`${API_BASE}/nam/status`, nodeId)),

  getScopedStatus: (options?: PluginRuntimeScopeOptions) =>
    fetchJson<NAMStatus>(appendPluginRuntimeQuery(`${API_BASE}/nam/status`, options)),

  getInstanceStatus: (instanceId: number, nodeId?: string | null) =>
    namApi.getScopedStatus({ instanceId, nodeId }),

  getStatusAtPosition: (pluginPosition: number, nodeId?: string | null) =>
    namApi.getScopedStatus({ pluginPosition, nodeId }),

  getCategories: () => fetchJson<Api.NAMCategoriesResponse>(`${API_BASE}/nam/categories`),

  listModels: (params?: Api.NAMListParams, nodeId?: string | null) => {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    if (params?.category) searchParams.set('category', params.category)
    if (params?.amp_type) searchParams.set('amp_type', params.amp_type)
    if (params?.favorites_only) searchParams.set('favorites_only', 'true')
    const query = searchParams.toString()
    return fetchJson<NAMModelsResponse>(appendNodeQuery(`${API_BASE}/nam/models${query ? `?${query}` : ''}`, nodeId))
  },

  getModel: (modelId: number) =>
    fetchJson<Api.NAMModelDetail>(`${API_BASE}/nam/models/${modelId}`),

  search: (request: Api.NAMSearchRequest) =>
    fetchJson<{ results: Api.NAMModelDetail[]; count: number }>(`${API_BASE}/nam/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  loadModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; model: string }>(appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, nodeId), {
      method: 'POST',
    }),

  loadModelScoped: (modelName: string, options?: PluginRuntimeScopeOptions) =>
    fetchJson<{ status: string; model: string }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, options),
      {
        method: 'POST',
      },
    ),

  loadModelToInstance: (modelName: string, instanceId: number, nodeId?: string | null) =>
    namApi.loadModelScoped(modelName, { instanceId, nodeId }),

  loadModelAtPosition: (modelName: string, pluginPosition: number, nodeId?: string | null) =>
    namApi.loadModelScoped(modelName, { pluginPosition, nodeId }),

  activateModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; model: string }>(
      appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/activate`, nodeId),
      { method: 'POST' },
    ),

  setInputGainForInstance: (gainDb: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; input_gain: number }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/input-gain`, { instanceId, nodeId }),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      },
    ),

  setInputGainAtPosition: (gainDb: number, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; input_gain: number }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/input-gain`, { pluginPosition, nodeId }),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      },
    ),

  setOutputGainForInstance: (gainDb: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; output_gain: number }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/output-gain`, { instanceId, nodeId }),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      },
    ),

  setOutputGainAtPosition: (gainDb: number, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; output_gain: number }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/output-gain`, { pluginPosition, nodeId }),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      },
    ),

  setBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/bypass`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setBypassAtPosition: (bypass: boolean, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/bypass`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  setNormalizeForInstance: (normalize: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; normalize: boolean }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/normalize`, { instanceId, nodeId }),
      { method: 'POST' },
    ),

  setNormalizeAtPosition: (normalize: boolean, pluginPosition: number, nodeId?: string | null) =>
    fetchJson<{ status: string; normalize: boolean }>(
      appendPluginRuntimeQuery(`${API_BASE}/nam/normalize`, { pluginPosition, nodeId }),
      { method: 'POST' },
    ),

  toggleFavorite: (modelId: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/nam/models/${modelId}/favorite`,
      { method: 'POST' },
    ),

  setRating: (modelId: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/nam/models/${modelId}/rating`,
      {
        method: 'PUT',
        body: JSON.stringify({ rating }),
      },
    ),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/nam/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; model: { id: number; name: string; file_path: string } }>
  },

  deleteModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}`, nodeId),
      { method: 'DELETE' },
    ),
}

export const soundfontApi = {
  listSoundfonts: (params?: { limit?: number; offset?: number; category?: string; format?: string; include_presets?: boolean }, nodeId?: string | null) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.format) query.set('format', params.format)
    if (params?.include_presets) query.set('include_presets', 'true')
    const queryString = query.toString()
    return fetchJson<SoundFontListResponse>(appendNodeQuery(`${API_BASE}/soundfonts/${queryString ? `?${queryString}` : ''}`, nodeId))
  },

  getPresets: (path: string) =>
    fetchJson<SoundFontPresetResponse>(`${API_BASE}/soundfonts/presets/?path=${encodeURIComponent(path)}`),

  getLibraries: () =>
    fetchJson<SoundFontLibrariesResponse>(`${API_BASE}/soundfonts/libraries/`),

  getCategories: () =>
    fetchJson<SoundFontCategoriesResponse>(`${API_BASE}/soundfonts/categories/`),

  startDownload: (request: DownloadRequest) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/soundfonts/download`,
      { method: 'POST', body: JSON.stringify(request) },
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/soundfonts/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(
      `${API_BASE}/soundfonts/download/retry/${encodeURIComponent(source)}`,
      { method: 'POST' },
    ),

  pauseDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/pause`, { method: 'POST' }),

  resumeDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/resume`, { method: 'POST' }),

  getFileTasks: () =>
    fetchJson<FileDownloadTask[]>(`${API_BASE}/soundfonts/download/files`),

  getFileProgress: (filename: string) =>
    fetchJson<FileDownloadTask>(`${API_BASE}/soundfonts/download/file/${filename}`),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/soundfonts/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; filename: string; format: string; path: string }>
  },
}

export const foldersApi = {
  getDisplayPaths: (nodeId?: string | null) => fetchJson<Api.DisplayPaths>(appendNodeQuery(`${API_BASE}/folders/display-paths`, nodeId)),

  getStorageInfo: () => fetchJson<Api.StorageInfo>(`${API_BASE}/folders/storage-info`),

  getPaths: () =>
    fetchJson<{ nams: string; irs: string; lv2: string }>(`${API_BASE}/folders/paths`),

  getStats: () =>
    fetchJson<{ nams: Record<string, unknown>; irs: Record<string, unknown>; lv2: Record<string, unknown> }>(
      `${API_BASE}/folders/stats`,
    ),

  getCounts: () =>
    fetchJson<{
      nams: number
      irs: { total: number; cabinets: number; reverbs: number; other: number }
      lv2: { system: number; user: number; total: number }
    }>(`${API_BASE}/folders/counts`),

  scan: (scanNams = true, scanIrs = true, scanLv2 = true) =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(`${API_BASE}/folders/scan`, {
      method: 'POST',
      body: JSON.stringify({ scan_nams: scanNams, scan_irs: scanIrs, scan_lv2: scanLv2 }),
    }),

  scanAll: (nodeId?: string | null) =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(appendNodeQuery(`${API_BASE}/folders/scan/all`, nodeId), {
      method: 'POST',
    }),

  getScanStatus: () =>
    fetchJson<{ scanning: boolean; message: string }>(`${API_BASE}/folders/scan/status`),

  getNetworkShares: () =>
    fetchJson<{
      smb_enabled: boolean
      smb_port_445: boolean
      smb_port_139: boolean
      local_ip: string
      shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>
      access_urls: { windows: string; linux: string; mac: string }
    }>(`${API_BASE}/folders/network-shares`),
}

export const uploadApi = {
  upload: async (
    file: File,
    assetType?: string,
    onProgress?: (percent: number) => void,
  ): Promise<Api.UploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(errorData.detail?.message || errorData.detail || 'Upload failed'))
          } catch {
            reject(new Error(xhr.statusText || 'Upload failed'))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

      xhr.open('POST', `${API_BASE}/upload/`)
      xhr.send(formData)
    })
  },

  uploadBatch: async (files: File[], assetType?: string): Promise<Api.BatchUploadResult> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/batch`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  validate: async (
    file: File,
    assetType?: string,
  ): Promise<{
    valid: boolean
    asset_type: string | null
    message: string
    details: Record<string, unknown>
    requires_type: boolean
  }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/validate`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  getTypes: () =>
    fetchJson<{ types: Api.UploadTypeInfo[] }>(`${API_BASE}/upload/types`),
}
