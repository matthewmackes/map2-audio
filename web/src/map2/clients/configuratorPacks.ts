/**
 * Configurator pack-discovery client.
 *
 * Cycle 9 / 2026-05-09 — calls GET /api/midi/configurator/packs to
 * fetch the lightweight metadata list. The frontend Configurator
 * merges this with its locally-registered descriptor library by
 * `pack_id` (snake_case from backend → camelCase locally).
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export interface ConfiguratorPackEntry {
  pack_id: string
  display_name: string
  vendor_name?: string | null
  summary?: string | null
  bespoke_route?: string | null
  available: boolean
}

export interface ConfiguratorPacksResponse {
  packs: ConfiguratorPackEntry[]
}

export const configuratorPacksApi = {
  list: (options?: { includeUnavailable?: boolean }) => {
    const query = options?.includeUnavailable ? '?include_unavailable=true' : ''
    return fetchJson<ConfiguratorPacksResponse>(
      `${API_BASE}/midi/configurator/packs${query}`,
      { cache: 'no-store' },
    )
  },
}
