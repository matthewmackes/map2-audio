import type * as Api from '../api'
import type {
  CreateSnapshotRequest,
  EffectsLoop,
  HistoryEntry,
  HistoryStatus,
  LoopInsertion,
  Session,
  SessionListItem,
  SessionsResponse,
  SnapshotCategory,
  SnapshotsResponse,
} from '../types'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'

export const effectsLoopsApi = {
  list: (nodeId?: string | null) =>
    fetchJson<{ loops: EffectsLoop[]; count: number }>(appendNodeQuery(`${API_BASE}/effects-loops`, nodeId)),

  create: (payload: Partial<EffectsLoop> & { name: string; channels: number; topology: string }, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (loopId: string, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId)),

  patch: (loopId: string, payload: Partial<EffectsLoop>, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (loopId: string, nodeId?: string | null) =>
    fetchJson<{ status: string; loop_id: string }>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId), {
      method: 'DELETE',
    }),

  activate: (loopId: string, payload: { audition_mode?: boolean } = {}, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/activate`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bypass: (loopId: string, bypass: boolean, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/bypass`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ bypass }),
    }),

  calibrate: (loopId: string, options: Record<string, unknown> = {}, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/calibrate`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ options }),
    }),

  getMetrics: (loopId: string, nodeId?: string | null) =>
    fetchJson<Api.LoopMetrics>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/metrics`, nodeId)),

  listTemplates: (nodeId?: string | null) =>
    fetchJson<{ templates: Api.TesiraLoopTemplate[]; count: number }>(appendNodeQuery(`${API_BASE}/tesira/loop-templates`, nodeId)),

  upsertTemplate: (
    templateId: string,
    payload: Omit<Api.TesiraLoopTemplate, 'template_id' | 'validation_status' | 'validation_error' | 'created_at' | 'updated_at'>,
    nodeId?: string | null,
  ) =>
    fetchJson<Api.TesiraLoopTemplate>(appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  validateTemplate: (templateId: string, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/validate`, nodeId), {
      method: 'POST',
    }),

  getTemplateRuntimeStatus: (templateId: string, nodeId?: string | null) =>
    fetchJson<{ template_id: string; tesira_device_id: string; runtime_status: Api.TesiraTemplateRuntimeStatus }>(
      appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/runtime-status`, nodeId),
    ),

  listChainInsertions: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; loop_insertions: LoopInsertion[]; effects_loops: EffectsLoop[]; count: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops`, nodeId),
    ),

  insertChainLoop: (chainId: number, payload: Partial<LoopInsertion> & { loop_id: string; slot_index: number }, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion; effects_loop: EffectsLoop }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/insert`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  patchChainLoop: (chainId: number, insertionId: string, payload: Partial<LoopInsertion>, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`, nodeId),
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),

  deleteChainLoop: (chainId: number, insertionId: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; insertion_id: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`, nodeId),
      { method: 'DELETE' },
    ),
}

export const snapshotsApi = {
  list: (options?: { category?: string; tags?: string; favorites_only?: boolean; search?: string }) => {
    const params = new URLSearchParams()
    if (options?.category) params.set('category', options.category)
    if (options?.tags) params.set('tags', options.tags)
    if (options?.favorites_only) params.set('favorites_only', 'true')
    if (options?.search) params.set('search', options.search)
    const query = params.toString()
    return fetchJson<SnapshotsResponse>(`${API_BASE}/snapshots/${query ? `?${query}` : ''}`)
  },

  create: (request: CreateSnapshotRequest) =>
    fetchJson<{ status: string; snapshot_id: number; message: string }>(`${API_BASE}/snapshots/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (
    snapshotId: number,
    updates: { name?: string; tags?: string[]; category?: string; description?: string; is_favorite?: boolean },
  ) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (snapshotId: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (snapshotId: number) =>
    fetchJson<{ status: string; is_favorite: boolean; message: string }>(
      `${API_BASE}/snapshots/${snapshotId}/favorite`,
      { method: 'POST' },
    ),

  getCategories: () => fetchJson<{ categories: SnapshotCategory[]; count: number }>(`${API_BASE}/snapshots/categories`),

  getTags: () => fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/snapshots/tags`),
}

export const historyApi = {
  getStatus: () => fetchJson<HistoryStatus>(`${API_BASE}/history/status`),

  getList: () => fetchJson<{ history: HistoryEntry[]; count: number }>(`${API_BASE}/history/list`),

  undo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_undo?: string }>(
      `${API_BASE}/history/undo`,
      { method: 'POST' },
    ),

  redo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_redo?: string }>(
      `${API_BASE}/history/redo`,
      { method: 'POST' },
    ),

  clear: () => fetchJson<{ status: string; message: string }>(`${API_BASE}/history/clear`, { method: 'POST' }),

  getSnapshots: () => fetchJson<{ snapshots: unknown[]; count: number }>(`${API_BASE}/history/snapshots`),

  restoreSnapshot: (index: number) =>
    fetchJson<{ status: string; message: string; state: unknown }>(
      `${API_BASE}/history/snapshots/${index}/restore`,
      { method: 'POST' },
    ),
}

export const sessionsApi = {
  list: () => fetchJson<SessionsResponse>(`${API_BASE}/sessions/list`),

  getCurrent: () => fetchJson<Session>(`${API_BASE}/sessions/current`),

  create: (name: string, description?: string, author?: string, tags?: string[]) =>
    fetchJson<{ status: string; message: string; session: Session }>(`${API_BASE}/sessions/create`, {
      method: 'POST',
      body: JSON.stringify({ name, description, author, tags }),
    }),

  save: (sessionData: Record<string, unknown>, createBackup = true) =>
    fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/save`, {
      method: 'POST',
      body: JSON.stringify({ session_data: sessionData, create_backup: createBackup }),
    }),

  load: (path: string) =>
    fetchJson<{ status: string; message: string; session: Session }>(
      `${API_BASE}/sessions/load?path=${encodeURIComponent(path)}`,
    ),

  delete: (path: string, createBackup = true) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/sessions/delete?path=${encodeURIComponent(path)}&create_backup=${createBackup}`,
      { method: 'DELETE' },
    ),

  export: (exportPath?: string) => {
    const query = exportPath ? `?export_path=${encodeURIComponent(exportPath)}` : ''
    return fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/export${query}`, {
      method: 'POST',
    })
  },

  search: (query?: string, tags?: string[], author?: string) => {
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (tags && tags.length > 0) params.set('tags', tags.join(','))
    if (author) params.set('author', author)
    const queryString = params.toString()
    return fetchJson<{ results: SessionListItem[]; count: number }>(
      `${API_BASE}/sessions/search${queryString ? `?${queryString}` : ''}`,
    )
  },
}

// T2431-H: flowSnapshotsApi removed. Callers use snapshotsApi from
// clients/snapshots.ts directly.
