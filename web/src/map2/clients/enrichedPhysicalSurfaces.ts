import { fetchJson } from '../http'
import { API_BASE } from '../transport'
import type { EnrichedPhysicalSurfaceUnit, EnrichedPhysicalSurfacesSummary } from '../types'

const ENRICHED_PHYSICAL_SURFACES_API_BASE = `${API_BASE}/enriched-midi-physical-surfaces`

export interface EnrichedPhysicalSurfacesSummaryResponse {
  status: string
  summary: EnrichedPhysicalSurfacesSummary
}

export interface EnrichedPhysicalSurfaceUnitResponse {
  status: string
  unit: EnrichedPhysicalSurfaceUnit
}

export const enrichedPhysicalSurfacesApi = {
  getSummary: () =>
    fetchJson<EnrichedPhysicalSurfacesSummaryResponse>(
      `${ENRICHED_PHYSICAL_SURFACES_API_BASE}/summary`,
      { cache: 'no-store' },
    ),
  getUnit: (surfaceId: string) =>
    fetchJson<EnrichedPhysicalSurfaceUnitResponse>(
      `${ENRICHED_PHYSICAL_SURFACES_API_BASE}/units/${encodeURIComponent(surfaceId)}`,
      { cache: 'no-store' },
    ),
  setUnitView: (surfaceId: string, viewId: string | null, source = 'operator') =>
    fetchJson<EnrichedPhysicalSurfaceUnitResponse>(
      `${ENRICHED_PHYSICAL_SURFACES_API_BASE}/units/${encodeURIComponent(surfaceId)}/view`,
      {
        method: 'PUT',
        body: JSON.stringify({ view_id: viewId, source }),
      },
    ),
}

export default enrichedPhysicalSurfacesApi
