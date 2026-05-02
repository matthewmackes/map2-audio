/**
 * T2482 loop 10 / iter 98 — `device_pack` consumer bindings hook.
 *
 * Pulls the canonical `/api/midi/bindings?consumer_type=device_pack`
 * list and rolls it up by `consumer_id` (one row per device-pack
 * profile). Each row carries the binding count + an enabled flag
 * (true if any binding row in the group has enabled=true).
 *
 * Per the iter-97 audit: /midi/devices is an INDEX surface — this
 * hook backs both the iter-98 DataTable and the iter-99 detail pane.
 */

import { useMemo } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export interface DevicePackBindingRecord {
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

export interface DevicePackProfileRow {
  profileKey: string  // canonical consumer_id, e.g. "native-instruments/maschine-mk1.midi"
  vendor: string  // first segment before "/"
  profile: string  // last segment after "/"
  bindingCount: number
  enabled: boolean  // true if ANY binding row in the group has enabled=true
}

async function fetchDevicePackBindings(): Promise<DevicePackBindingRecord[]> {
  const params = new URLSearchParams({
    consumer_type: 'device_pack',
    consumer_id: '*',
  })
  const response = await fetch(`/api/midi/bindings?${params.toString()}`)
  if (!response.ok) {
    return []
  }
  return (await response.json()) as DevicePackBindingRecord[]
}

function rollUpByProfile(rows: DevicePackBindingRecord[]): DevicePackProfileRow[] {
  const groups = new Map<string, DevicePackBindingRecord[]>()
  for (const row of rows) {
    const list = groups.get(row.consumer_id) ?? []
    list.push(row)
    groups.set(row.consumer_id, list)
  }
  const out: DevicePackProfileRow[] = []
  for (const [profileKey, group] of groups) {
    const slashIdx = profileKey.indexOf('/')
    const vendor = slashIdx >= 0 ? profileKey.slice(0, slashIdx) : '(unknown)'
    const profile = slashIdx >= 0 ? profileKey.slice(slashIdx + 1) : profileKey
    out.push({
      profileKey,
      vendor,
      profile,
      bindingCount: group.length,
      enabled: group.some((r) => r.enabled),
    })
  }
  out.sort((a, b) => a.profileKey.localeCompare(b.profileKey))
  return out
}

export interface UseDevicePackBindingsResult {
  rows: DevicePackProfileRow[]
  rawBindings: DevicePackBindingRecord[]
  isLoading: boolean
  isError: boolean
  query: UseQueryResult<DevicePackBindingRecord[]>
}

export function useDevicePackBindings(): UseDevicePackBindingsResult {
  const query = useQuery({
    queryKey: ['midi-services-device-pack-bindings'],
    queryFn: fetchDevicePackBindings,
    refetchInterval: 5000,
    staleTime: 0,
  })
  const rows = useMemo(() => rollUpByProfile(query.data ?? []), [query.data])
  return {
    rows,
    rawBindings: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    query,
  }
}
