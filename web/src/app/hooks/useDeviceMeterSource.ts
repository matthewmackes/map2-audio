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

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

// Pivot-13b cycle 1 added the engine-side 'engine_unavailable' state.
// Frontend treats it as a first-class signal so the Tag can render a
// red "Engine unavailable" pill distinct from the warm-gray
// "Awaiting engine wire-up".
export type DeviceMeterSource = 'placeholder' | 'engine' | 'engine_unavailable'

export interface DeviceMeterSourcePayload {
  device_id: string
  input_peak_db: number[]
  output_peak_db: number[]
  source: DeviceMeterSource
  captured_at?: number | null
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
  /**
   * Seconds after which a snapshot is considered "stale". When the
   * difference between the current wall-clock and the payload's
   * `captured_at` exceeds this threshold, `isStale` flips true and
   * downstream Tag UIs can render a "Stale" pill.
   *
   * Pivot-13c cycle 3. Default 10 s — twice the default poll cadence
   * so a single missed tick doesn't flip the tag.
   */
  staleThresholdSeconds?: number
}

export interface UseDeviceMeterSourceResult {
  source: DeviceMeterSource | undefined
  payload: DeviceMeterSourcePayload | undefined
  isError: boolean
  isLoading: boolean
  /**
   * True when the latest payload's `captured_at` is older than
   * `staleThresholdSeconds`. False when the snapshot is fresh, no
   * payload yet, or the backend hasn't surfaced `captured_at`.
   */
  isStale: boolean
  /** Seconds since the snapshot was captured. ``null`` when the
   * payload lacks `captured_at`. */
  ageSeconds: number | null
}

const DEFAULT_REFETCH_MS = 5_000
const DEFAULT_STALE_THRESHOLD_S = 10
const STALE_TICK_INTERVAL_MS = 1_000

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
  const staleThreshold = opts?.staleThresholdSeconds ?? DEFAULT_STALE_THRESHOLD_S

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

  // Re-evaluate staleness once per second even between polls so a
  // long-paused engine surfaces as "Stale" the moment it crosses the
  // threshold, not on the next refetch. Cheap — just bumps a counter.
  const [, forceRender] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(
      () => forceRender((prev) => prev + 1),
      STALE_TICK_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [enabled])

  const capturedAt = query.data?.captured_at
  let ageSeconds: number | null = null
  let isStale = false
  if (typeof capturedAt === 'number') {
    ageSeconds = Math.max(0, Date.now() / 1000 - capturedAt)
    if (ageSeconds > staleThreshold) {
      isStale = true
    }
  }

  return {
    source: query.data?.source,
    payload: query.data,
    isError: query.isError,
    isLoading: query.isLoading,
    isStale,
    ageSeconds,
  }
}
