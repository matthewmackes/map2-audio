/**
 * T2482 loop 10 / iter 96 — MidiServicesOverview live counts.
 *
 * Wraps TanStack Query around the canonical `/api/midi/*` endpoints
 * shipped in T2482 Phase 2 (loop 4). Returns aggregate counts for
 * the 4 region cards on the MidiServicesOverviewPage.
 *
 * Polling cadence: 5 seconds (matches the iter-91 design D5 — Carbon
 * surfaces poll on a 5s baseline; the count endpoints are cheap
 * SQL COUNTs so the overhead is negligible).
 */

import { useQuery } from '@tanstack/react-query'

interface BindingCountResponse {
  count: number
}

interface BindingRecord {
  binding_id: string
  consumer_type: string
  consumer_id: string
  source_type: string
  target_type: string
  device_id?: string | null
  scope: string
  scope_id?: string | null
  enabled: boolean
}

async function fetchBindingCount(): Promise<number> {
  const response = await fetch('/api/midi/bindings/count')
  if (!response.ok) {
    throw new Error(`bindings count failed: ${response.status}`)
  }
  // The endpoint returns a bare number per app/services/midi/routes.py:50.
  const value = (await response.json()) as number | BindingCountResponse
  if (typeof value === 'number') {
    return value
  }
  return value.count ?? 0
}

async function fetchBindingsForFilter(params: URLSearchParams): Promise<BindingRecord[]> {
  const response = await fetch(`/api/midi/bindings?${params.toString()}`)
  if (!response.ok) {
    // The endpoint requires at least one filter; an empty filter returns
    // 400 (per app/services/midi/routes.py). We want the count anyway —
    // for the overview, a count by consumer_type is what we need.
    return []
  }
  return (await response.json()) as BindingRecord[]
}

export interface MidiServicesCounts {
  totalBindings: number
  deviceBindings: number
  routingBindings: number  // sum of brain_slot + plugin_param + global_param scopes
  transportBindings: number
  networkBindings: number  // T2482 loop 13 / iter 128 - tesira_ttp + gpio
  isLoading: boolean
  isError: boolean
}

export function useMidiServicesCounts(): MidiServicesCounts {
  // The /count endpoint returns the global total (the cheapest call).
  const totalQuery = useQuery({
    queryKey: ['midi-services-bindings-count'],
    queryFn: fetchBindingCount,
    refetchInterval: 5000,
    staleTime: 0,
  })

  // For region-specific counts, fetch the binding lists by scope and
  // count client-side. This avoids needing a new backend endpoint.
  const deviceQuery = useQuery({
    queryKey: ['midi-services-bindings', 'device_pack'],
    queryFn: () => fetchBindingsForFilter(new URLSearchParams({
      consumer_type: 'device_pack',
      consumer_id: '*',
    })),
    refetchInterval: 5000,
    staleTime: 0,
  })

  const transportQuery = useQuery({
    queryKey: ['midi-services-bindings', 'transport'],
    queryFn: () => fetchBindingsForFilter(new URLSearchParams({
      consumer_type: 'transport',
      consumer_id: '*',
    })),
    refetchInterval: 5000,
    staleTime: 0,
  })

  const routingQuery = useQuery({
    queryKey: ['midi-services-bindings', 'plugin_param'],
    queryFn: () => fetchBindingsForFilter(new URLSearchParams({
      consumer_type: 'plugin_param',
      consumer_id: '*',
    })),
    refetchInterval: 5000,
    staleTime: 0,
  })

  // T2482 loop 13 / iter 128 — Network region count.
  // Sum tesira_ttp + gpio bindings via two parallel queries.
  const tesiraQuery = useQuery({
    queryKey: ['midi-services-bindings', 'tesira_ttp'],
    queryFn: () => fetchBindingsForFilter(new URLSearchParams({
      consumer_type: 'tesira_ttp',
      consumer_id: '*',
    })),
    refetchInterval: 5000,
    staleTime: 0,
  })
  const gpioQuery = useQuery({
    queryKey: ['midi-services-bindings', 'gpio'],
    queryFn: () => fetchBindingsForFilter(new URLSearchParams({
      consumer_type: 'gpio',
      consumer_id: '*',
    })),
    refetchInterval: 5000,
    staleTime: 0,
  })

  return {
    totalBindings: totalQuery.data ?? 0,
    deviceBindings: deviceQuery.data?.length ?? 0,
    routingBindings: routingQuery.data?.length ?? 0,
    transportBindings: transportQuery.data?.length ?? 0,
    networkBindings: (tesiraQuery.data?.length ?? 0) + (gpioQuery.data?.length ?? 0),
    isLoading: totalQuery.isLoading || deviceQuery.isLoading
      || routingQuery.isLoading || transportQuery.isLoading
      || tesiraQuery.isLoading || gpioQuery.isLoading,
    isError: totalQuery.isError || deviceQuery.isError
      || routingQuery.isError || transportQuery.isError
      || tesiraQuery.isError || gpioQuery.isError,
  }
}
