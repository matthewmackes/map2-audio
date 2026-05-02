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

export interface AvbBindingRecord {
  binding_id: string
  consumer_type: string
  consumer_id: string
  consumer_label: string
  source_type: string
  source_descriptor: Record<string, unknown>
  target_type: string
  target_descriptor: Record<string, unknown>
  stream_id: string | null
  stream_format: string | null
  srp_class: 'A' | 'B' | null
  talker_node_id: string | null
  listener_node_id: string | null
  scope: 'global' | 'snapshot' | 'node' | 'cluster'
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

async function fetchAvbBindingsMatrix(): Promise<AvbBindingsMatrixResponse> {
  const response = await fetch('/api/avb/bindings/matrix')
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
 */
export function useAvbBindingsMatrix() {
  return useQuery({
    queryKey: ['avb-bindings-matrix'],
    queryFn: fetchAvbBindingsMatrix,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

/**
 * Backwards-compatible name; returns just the binding rows from the
 * matrix endpoint so existing call sites keep working.
 */
export function useAvbBindingsAllScopes() {
  const matrix = useAvbBindingsMatrix()
  return {
    data: matrix.data?.bindings ?? [],
    isLoading: matrix.isLoading,
    isError: matrix.isError,
  }
}
