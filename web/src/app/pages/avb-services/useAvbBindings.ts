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

async function fetchAvbBindingsCount(): Promise<number> {
  const response = await fetch('/api/avb/bindings/count')
  if (!response.ok) throw new Error(`avb bindings count failed: ${response.status}`)
  const value = (await response.json()) as number
  return typeof value === 'number' ? value : 0
}

async function fetchAvbBindingsByScope(scope: string): Promise<AvbBindingRecord[]> {
  // Use the scope filter so we can pull every row without a 400. Calling
  // the route with `scope=global` returns all global-scoped bindings;
  // T2490-3 will replace this with a dedicated /matrix endpoint that
  // also covers snapshot- and node-scoped rows.
  const params = new URLSearchParams({ scope })
  const response = await fetch(`/api/avb/bindings?${params.toString()}`)
  if (!response.ok) return []
  return (await response.json()) as AvbBindingRecord[]
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
 * Returns every binding the canonical authority knows about, summed
 * across global / snapshot / node / cluster scopes via four parallel
 * queries. T2490-3 will replace this with a server-side aggregation
 * (analogous to MIDI's /api/midi/bindings/matrix).
 */
export function useAvbBindingsAllScopes() {
  const globals = useQuery({
    queryKey: ['avb-bindings', 'global'],
    queryFn: () => fetchAvbBindingsByScope('global'),
    refetchInterval: 5000,
    staleTime: 0,
  })
  const snapshots = useQuery({
    queryKey: ['avb-bindings', 'snapshot'],
    queryFn: () => fetchAvbBindingsByScope('snapshot'),
    refetchInterval: 5000,
    staleTime: 0,
  })
  const nodes = useQuery({
    queryKey: ['avb-bindings', 'node'],
    queryFn: () => fetchAvbBindingsByScope('node'),
    refetchInterval: 5000,
    staleTime: 0,
  })
  const clusters = useQuery({
    queryKey: ['avb-bindings', 'cluster'],
    queryFn: () => fetchAvbBindingsByScope('cluster'),
    refetchInterval: 5000,
    staleTime: 0,
  })

  const data: AvbBindingRecord[] = [
    ...(globals.data ?? []),
    ...(snapshots.data ?? []),
    ...(nodes.data ?? []),
    ...(clusters.data ?? []),
  ]

  return {
    data,
    isLoading: globals.isLoading || snapshots.isLoading || nodes.isLoading || clusters.isLoading,
    isError: globals.isError || snapshots.isError || nodes.isError || clusters.isError,
  }
}
