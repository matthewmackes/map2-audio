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

export const stateAuthorityApi = {
  getCatalog: async (): Promise<StateAuthorityCatalogResponse> =>
    fetchJson<StateAuthorityCatalogResponse>(`${API_BASE}/api/state-authority/uri-catalog`),

  getCatalogByType: async (
    catalogType: StateAuthorityCatalogType,
  ): Promise<StateAuthorityCatalogResponse> =>
    fetchJson<StateAuthorityCatalogResponse>(
      `${API_BASE}/api/state-authority/uri-catalog/${catalogType}`,
    ),

  resolveUri: async (uri: string): Promise<StateAuthorityUriResolveResponse> =>
    fetchJson<StateAuthorityUriResolveResponse>(
      `${API_BASE}/api/state-authority/uri-resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ uri }),
      },
    ),

  getSchema: async (): Promise<Record<string, unknown>> =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/api/state-authority/schema`),
}
