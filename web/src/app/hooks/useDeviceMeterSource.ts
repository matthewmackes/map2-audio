// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDeviceMeterSource — shared hook for the per-device meter-source
// banner row introduced in T2519 (tenth Continue run).
//
// Wraps the generic /api/v1/devices/{device_id}/peak-meters route and
// exposes a tight {source, isError, isLoading} surface so every device
// panel (TASCAM, UA-1000, Hotone JoGG, MPX-1, future) renders the same
// status Tag without duplicating the fetch/refetch boilerplate.
//
// Cadence: defaults to 5 s — slow enough to keep Carbon Status surfaces
// quiet but fast enough that an engine-side source registration flips
// the Tag from "Awaiting engine wire-up" to "Live" within one panel
// interaction. Per-panel callers can override.

import { useQuery } from '@tanstack/react-query'

export type DeviceMeterSource = 'placeholder' | 'engine'

export interface DeviceMeterSourcePayload {
  device_id: string
  input_peak_db: number[]
  output_peak_db: number[]
  source: DeviceMeterSource
}

export interface UseDeviceMeterSourceOptions {
  /**
   * Polling cadence in milliseconds. Default 5 s — slow enough for
   * a top-of-panel banner row. Pass a smaller value (e.g. 250) when
   * actually rendering per-channel peak values from this hook.
   */
  refetchIntervalMs?: number
  /**
   * If false, the hook does not fire — useful when the panel hasn't
   * confirmed yet that the device is reachable on the current node.
   * Defaults to true.
   */
  enabled?: boolean
}

export interface UseDeviceMeterSourceResult {
  source: DeviceMeterSource | undefined
  payload: DeviceMeterSourcePayload | undefined
  isError: boolean
  isLoading: boolean
}

const DEFAULT_REFETCH_MS = 5_000

/**
 * Read the live meter-source state for one device.
 *
 * @param deviceId — registry id (e.g. 'tascam-us144mkii', 'edirol-ua-1000',
 *   'hotone-jogg', 'lexicon-mpx1'). Must match the registry's DEVICE_ID.
 * @param opts — optional refetch cadence + enabled gate.
 */
export function useDeviceMeterSource(
  deviceId: string,
  opts?: UseDeviceMeterSourceOptions,
): UseDeviceMeterSourceResult {
  const refetchInterval = opts?.refetchIntervalMs ?? DEFAULT_REFETCH_MS
  const enabled = opts?.enabled ?? true

  const query = useQuery<DeviceMeterSourcePayload>({
    queryKey: ['device-meter-source', deviceId],
    queryFn: async () => {
      const resp = await fetch(`/api/v1/devices/${deviceId}/peak-meters`)
      if (!resp.ok) throw new Error(`peak-meters HTTP ${resp.status}`)
      return resp.json()
    },
    refetchInterval,
    staleTime: 0,
    retry: false,
    enabled,
  })

  return {
    source: query.data?.source,
    payload: query.data,
    isError: query.isError,
    isLoading: query.isLoading,
  }
}
