import { fetchJson } from '../http'
import { API_BASE } from '../transport'

// ===========================================================================
// State Authority — tonechaser URI catalog + schema introspection
// ===========================================================================

export type StateAuthorityCatalogType = 'fx' | 'io' | 'sys' | 'ctrl'

export interface StateAuthorityCatalogEntry {
  uri: string
  type: StateAuthorityCatalogType
  name: string
  label: string
  description: string
  category: string
  default_parameters: Record<string, number>
  default_state: Record<string, unknown>
  aliases: string[]
  is_system_managed: boolean
}

export interface StateAuthorityCatalogResponse {
  entries: StateAuthorityCatalogEntry[]
  count: number
}

export interface StateAuthorityUriResolveResponse {
  input: string
  canonical: string
  entry: StateAuthorityCatalogEntry | null
}

export interface StateAuthorityMorphState {
  x: number
  y: number
  configured_corners: string[]
}

export interface StateAuthorityDocument {
  snapshot_id: number | null
  snapshot_name: string | null
  is_live: boolean
  document: Record<string, unknown>
}

export interface StateAuthorityReconciliationMetrics {
  metrics: {
    local_runs_total: number
    local_drift_detected_total: number
    local_corrections_applied_total: number
    local_reactivations_required_total: number
    cluster_runs_total: number
    cluster_nodes_with_drift_total: number
    last_local_reconcile_unix_s: number
    last_cluster_reconcile_unix_s: number
    last_local_status: string
    last_cluster_status: string
    last_local_error: string | null
    last_cluster_error: string | null
  }
  prometheus: string
}

export const stateAuthorityApi = {
  getCatalog: async (): Promise<StateAuthorityCatalogResponse> =>
    fetchJson<StateAuthorityCatalogResponse>(`${API_BASE}/state-authority/uri-catalog`),

  getCatalogByType: async (
    catalogType: StateAuthorityCatalogType,
  ): Promise<StateAuthorityCatalogResponse> =>
    fetchJson<StateAuthorityCatalogResponse>(
      `${API_BASE}/state-authority/uri-catalog/${catalogType}`,
    ),

  resolveUri: async (uri: string): Promise<StateAuthorityUriResolveResponse> =>
    fetchJson<StateAuthorityUriResolveResponse>(
      `${API_BASE}/state-authority/uri-resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ uri }),
      },
    ),

  getSchema: async (): Promise<Record<string, unknown>> =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/state-authority/schema`),

  setMorphPosition: async (x: number, y: number): Promise<StateAuthorityMorphState> =>
    fetchJson<StateAuthorityMorphState>(`${API_BASE}/state-authority/morph/position`, {
      method: 'POST',
      body: JSON.stringify({ x, y }),
    }),

  getMorphState: async (): Promise<StateAuthorityMorphState> =>
    fetchJson<StateAuthorityMorphState>(`${API_BASE}/state-authority/morph/state`),

  getReconciliationMetrics: async (): Promise<StateAuthorityReconciliationMetrics> =>
    fetchJson<StateAuthorityReconciliationMetrics>(
      `${API_BASE}/state-authority/reconciliation/metrics`,
    ),

  getLiveDocument: async (): Promise<StateAuthorityDocument> =>
    fetchJson<StateAuthorityDocument>(`${API_BASE}/state-authority/live-document`),

  getSnapshotDocument: async (snapshotId: number): Promise<StateAuthorityDocument> =>
    fetchJson<StateAuthorityDocument>(
      `${API_BASE}/state-authority/snapshots/${snapshotId}/document`,
    ),
}
