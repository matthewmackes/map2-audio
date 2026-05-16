/**
 * T2490-4 — TanStack Query helpers for the canonical
 * `/api/avb/bindings/*` surface (T2490-2).
 *
 * Single hook used by:
 *   - AvbServicesConnectionsPage (this iter)
 *   - AvbServicesBindingsPage (T2490-3+ filter-first list)
 *   - AvbServicesOverviewPage (count tile, future)
 */

import { useQuery } from '@tanstack/react-query'

import type {
  AvbBindingConsumerType,
  AvbBindingScope,
  AvbBindingSourceType,
  AvbBindingTargetType,
  AvbSrpClass,
} from '../../types/avbBindingTypes'

// Re-export the narrowed enum types so existing consumers can import
// them from `useAvbBindings` without learning about the new types module.
export type {
  AvbBindingConsumerType,
  AvbBindingScope,
  AvbBindingSourceType,
  AvbBindingTargetType,
  AvbSrpClass,
} from '../../types/avbBindingTypes'

export interface AvbBindingRecord {
  binding_id: string
  consumer_type: AvbBindingConsumerType
  consumer_id: string
  consumer_label: string
  source_type: AvbBindingSourceType
  source_descriptor: Record<string, unknown>
  target_type: AvbBindingTargetType
  target_descriptor: Record<string, unknown>
  stream_id: string | null
  stream_format: string | null
  srp_class: AvbSrpClass | null
  talker_node_id: string | null
  listener_node_id: string | null
  scope: AvbBindingScope
  scope_id: string | null
  enabled: boolean
  source: string
  metadata: Record<string, unknown>
  created_at: string
  created_by: string
  modified_at: string
  modified_by: string
}

export interface AvbMatrixCell {
  count: number
  enabled_count: number
}

export interface AvbBindingsMatrixResponse {
  matrix: Record<string, Record<string, AvbMatrixCell>>
  total_bindings: number
  bindings: AvbBindingRecord[]
}

async function fetchAvbBindingsCount(): Promise<number> {
  const response = await fetch('/api/avb/bindings/count')
  if (!response.ok) throw new Error(`avb bindings count failed: ${response.status}`)
  const value = (await response.json()) as number
  return typeof value === 'number' ? value : 0
}

async function fetchAvbBindingsMatrix(includeRouter = false): Promise<AvbBindingsMatrixResponse> {
  const url = includeRouter
    ? '/api/avb/bindings/matrix?include_router=true'
    : '/api/avb/bindings/matrix'
  const response = await fetch(url)
  if (!response.ok) throw new Error(`avb bindings matrix failed: ${response.status}`)
  return (await response.json()) as AvbBindingsMatrixResponse
}

export interface AvbClusterPeerMatrix {
  node_id: string
  hostname: string
  matrix: Record<string, Record<string, AvbMatrixCell>>
  total_bindings: number
  health: 'ok' | 'warn' | 'critical' | 'offline' | 'unreachable' | string
}

export interface AvbClusterBindingsMatrixResponse {
  local: AvbBindingsMatrixResponse
  peers: AvbClusterPeerMatrix[]
  errors: Record<string, string>
}

async function fetchAvbClusterMatrix(): Promise<AvbClusterBindingsMatrixResponse> {
  const response = await fetch('/api/avb/cluster/bindings/matrix')
  if (!response.ok) {
    throw new Error(`avb cluster matrix failed: ${response.status}`)
  }
  return (await response.json()) as AvbClusterBindingsMatrixResponse
}

/**
 * T2490-7 — cluster-wide AVB matrix with per-peer health tags.
 * Polls every 5s. The local node's matrix is in `data.local`; peer
 * slices in `data.peers`. Failed peers populate `data.errors` keyed
 * by node_id.
 */
export function useAvbClusterMatrix() {
  return useQuery({
    queryKey: ['avb-cluster-matrix'],
    queryFn: fetchAvbClusterMatrix,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvbBindingsCount() {
  return useQuery({
    queryKey: ['avb-bindings-count'],
    queryFn: fetchAvbBindingsCount,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

/**
 * T2490-2b — single round-trip aggregation. Replaces the iter-3
 * 4-query fan-out (one query per scope) with one server-side
 * aggregation. Mirrors MIDI's `/api/midi/bindings/matrix`.
 *
 * T2490-3a — pass `includeRouter: true` to additionally fold the
 * live `AvbRouter` projection into the response so the Connections
 * DataTable shows real router state alongside durable authority rows.
 */
export function useAvbBindingsMatrix(opts: { includeRouter?: boolean } = {}) {
  const includeRouter = opts.includeRouter ?? false
  return useQuery({
    queryKey: ['avb-bindings-matrix', includeRouter ? 'with-router' : 'authority-only'],
    queryFn: () => fetchAvbBindingsMatrix(includeRouter),
    refetchInterval: 5000,
    staleTime: 0,
  })
}

/**
 * Backwards-compatible name; returns just the binding rows from the
 * matrix endpoint. T2490-3a — opts into router projection so the
 * Connections DataTable shows real live router state alongside
 * durable authority rows.
 */
export function useAvbBindingsAllScopes() {
  const matrix = useAvbBindingsMatrix({ includeRouter: true })
  return {
    data: matrix.data?.bindings ?? [],
    isLoading: matrix.isLoading,
    isError: matrix.isError,
  }
}

/**
 * T2490-3a — true iff the binding is a router-projection synthetic row
 * (carries the deterministic `proj-` binding_id prefix or the
 * `metadata.projection_source` flag).
 */
export function isProjectedAvbBinding(b: AvbBindingRecord): boolean {
  if (b.binding_id.startsWith('proj-')) return true
  return b.metadata?.projection_source === 'avb_router'
}
