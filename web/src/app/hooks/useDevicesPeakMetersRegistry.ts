// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersRegistry — thin TanStack wrapper around the
// GET /api/v1/devices/peak-meters/registry route added in cycle 10
// of the eleventh Continue run. Returns the alphabetically-sorted
// list of every device registered with the meter-source primitive
// plus a has_engine_source flag.

import { useQuery } from '@tanstack/react-query'

export interface DeviceMetersRegistrySnapshot {
  input_peak_db: number[]
  output_peak_db: number[]
  source: 'placeholder' | 'engine'
  /** Unix timestamp (seconds since epoch, float) when the snapshot
   * was produced. Added in pivot-13b-1; may be absent on older
   * backends. */
  captured_at?: number | null
}

export interface DeviceMetersRegistryEntry {
  device_id: string
  input_channels: number
  output_channels: number
  has_engine_source: boolean
  snapshot?: DeviceMetersRegistrySnapshot | null
}

export interface DeviceMetersRegistryPayload {
  devices: DeviceMetersRegistryEntry[]
}

export interface UseDevicesPeakMetersRegistryOptions {
  /** Polling cadence in ms. Default 5 s — slow enough for a
   * surface that summarizes per-device wire-up state. */
  refetchIntervalMs?: number
  /** Default true. Pass false to hold the query (e.g. while
   * navigating between Devices subroutes). */
  enabled?: boolean
  /** When true, asks the registry route to inline a peak-meter
   * snapshot for every device (single round-trip dashboard). */
  includeSnapshot?: boolean
}

export interface UseDevicesPeakMetersRegistryResult {
  devices: DeviceMetersRegistryEntry[]
  isError: boolean
  isLoading: boolean
}

const DEFAULT_REFETCH_MS = 5_000

export function useDevicesPeakMetersRegistry(
  opts?: UseDevicesPeakMetersRegistryOptions,
): UseDevicesPeakMetersRegistryResult {
  const refetchInterval = opts?.refetchIntervalMs ?? DEFAULT_REFETCH_MS
  const enabled = opts?.enabled ?? true
  const includeSnapshot = opts?.includeSnapshot ?? false

  const url = includeSnapshot
    ? '/api/v1/devices/peak-meters/registry?include_snapshot=true'
    : '/api/v1/devices/peak-meters/registry'

  const query = useQuery<DeviceMetersRegistryPayload>({
    queryKey: ['devices-peak-meters-registry', includeSnapshot ? 'with-snapshot' : 'flat'],
    queryFn: async () => {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`peak-meters/registry HTTP ${resp.status}`)
      return resp.json()
    },
    refetchInterval,
    staleTime: 0,
    retry: false,
    enabled,
  })

  return {
    devices: query.data?.devices ?? [],
    isError: query.isError,
    isLoading: query.isLoading,
  }
}
