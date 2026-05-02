/**
 * T2490-5 — TanStack Query helpers for the AVB Devices index page.
 *
 * Pulls data from:
 *   - GET /api/avb/discovery        → talker / listener node summaries
 *   - GET /api/avb/avdecc/entities  → AVDECC entity records
 *
 * Both endpoints exist today (mounted by `app/routes/avb/__init__.py`);
 * the Devices index just needs a uniform projection so the Carbon
 * DataTable renders one row per discovered AVB device.
 */

import { useQuery } from '@tanstack/react-query'

export interface AvbDiscoveredNode {
  node_id: string
  hostname?: string
  role?: string
  ip_address?: string
  talkers?: number
  listeners?: number
  state?: string
  last_seen?: string
}

export interface AvbDiscoveryResponse {
  enabled: boolean
  total_discovered: number
  talker_nodes: number
  listener_nodes: number
  nodes: AvbDiscoveredNode[]
}

export interface AvbAvdeccEntity {
  entity_id: string
  entity_name?: string
  vendor_name?: string
  model_name?: string
  firmware_version?: string
  capabilities?: string[]
  talker_streams?: number
  listener_streams?: number
  online?: boolean
  state?: string
}

export interface AvbAvdeccEntitiesResponse {
  enabled: boolean
  entities: AvbAvdeccEntity[]
  error?: string | null
  source_node_id?: string
}

async function fetchAvbDiscovery(): Promise<AvbDiscoveryResponse> {
  const response = await fetch('/api/avb/discovery')
  if (!response.ok) throw new Error(`avb discovery failed: ${response.status}`)
  return (await response.json()) as AvbDiscoveryResponse
}

async function fetchAvdeccEntities(): Promise<AvbAvdeccEntitiesResponse> {
  const response = await fetch('/api/avb/avdecc/entities')
  if (!response.ok) throw new Error(`avdecc entities failed: ${response.status}`)
  return (await response.json()) as AvbAvdeccEntitiesResponse
}

export function useAvbDiscovery() {
  return useQuery({
    queryKey: ['avb-discovery'],
    queryFn: fetchAvbDiscovery,
    refetchInterval: 5000,
    staleTime: 0,
  })
}

export function useAvdeccEntities() {
  return useQuery({
    queryKey: ['avb-avdecc-entities'],
    queryFn: fetchAvdeccEntities,
    refetchInterval: 5000,
    staleTime: 0,
  })
}
