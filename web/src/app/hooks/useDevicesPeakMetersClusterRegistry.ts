// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersClusterRegistry — TanStack wrapper around the
// /api/v1/devices/peak-meters/cluster/registry fan-out route shipped
// in run-13f cycle 1. Returns the local registry slice plus per-peer
// slices and a failed-peer error map.

import { useQuery } from '@tanstack/react-query'

import type {
  DeviceMetersRegistryEntry,
  DeviceMetersRegistryPayload,
} from './useDevicesPeakMetersRegistry'

export interface DeviceMetersClusterPeerSlice {
  node_id: string
  hostname: string
  devices: DeviceMetersRegistryEntry[]
  /** NodeHealthService projection — "ok" / "warn" / "critical" /
   * "offline" / "unreachable" / etc. Baked into the response so the
   * frontend doesn't need a second fetch. */
  health: string
}

export interface DeviceMetersClusterRegistryPayload {
  local: DeviceMetersRegistryPayload
  peers: DeviceMetersClusterPeerSlice[]
  errors: Record<string, string>
}

export interface UseDevicesPeakMetersClusterRegistryOptions {
  /** Polling cadence in ms. Default 5 s — slow enough for an
   * overview tile that summarizes cluster wire-up state. */
  refetchIntervalMs?: number
  /** Default true. Pass false to hold the query (e.g. while
   * navigating between Devices subroutes). */
  enabled?: boolean
  /** When true, request inline snapshots for every device in every
   * peer's registry. Mirrors the local registry's include_snapshot
   * parameter so a cluster dashboard can render both wire-up state
   * and the latest reading in one round-trip. */
  includeSnapshot?: boolean
}

export interface UseDevicesPeakMetersClusterRegistryResult {
  local: DeviceMetersRegistryPayload | undefined
  peers: DeviceMetersClusterPeerSlice[]
  errors: Record<string, string>
  isError: boolean
  isLoading: boolean
}

const DEFAULT_REFETCH_MS = 5_000

export function useDevicesPeakMetersClusterRegistry(
  opts?: UseDevicesPeakMetersClusterRegistryOptions,
): UseDevicesPeakMetersClusterRegistryResult {
  const refetchInterval = opts?.refetchIntervalMs ?? DEFAULT_REFETCH_MS
  const enabled = opts?.enabled ?? true
  const includeSnapshot = opts?.includeSnapshot ?? false

  const url = includeSnapshot
    ? '/api/v1/devices/peak-meters/cluster/registry?include_snapshot=true'
    : '/api/v1/devices/peak-meters/cluster/registry'

  const query = useQuery<DeviceMetersClusterRegistryPayload>({
    queryKey: [
      'devices-peak-meters-cluster-registry',
      includeSnapshot ? 'with-snapshot' : 'flat',
    ],
    queryFn: async () => {
      const resp = await fetch(url)
      if (!resp.ok) {
        throw new Error(
          `peak-meters/cluster/registry HTTP ${resp.status}`,
        )
      }
      return resp.json()
    },
    refetchInterval,
    staleTime: 0,
    retry: false,
    enabled,
  })

  return {
    local: query.data?.local,
    peers: query.data?.peers ?? [],
    errors: query.data?.errors ?? {},
    isError: query.isError,
    isLoading: query.isLoading,
  }
}
