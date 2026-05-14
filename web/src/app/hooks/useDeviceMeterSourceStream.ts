// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDeviceMeterSourceStream — WS variant of useDeviceMeterSource.
//
// Run-13h cycle 1. Subscribes through the shared wsSubscriptionStore
// to /api/v1/devices/peak-meters/stream?device_ids=<id> so a per-
// device panel can stay in sync with the rest of the page without
// opening its own poll. Returns the same {source, payload, isStale,
// ageSeconds, isError, isLoading} shape useDeviceMeterSource exposes,
// so consumers can swap by changing the import — no Tag/render
// adjustments required.
//
// When the page mounts multiple per-device panels (or an overview
// tile + a panel), the store's URL-keyed dedup kicks in: every
// consumer of `?device_ids=tascam-us144mkii` shares one socket.

import { useEffect, useMemo, useState } from 'react'

import type {
  DeviceMetersRegistryEntry,
  DeviceMetersRegistryPayload,
} from './useDevicesPeakMetersRegistry'
import type {
  DeviceMeterSource,
  DeviceMeterSourcePayload,
  UseDeviceMeterSourceResult,
} from './useDeviceMeterSource'
import { subscribe as subscribeWs } from './wsSubscriptionStore'

interface StreamFrame {
  type: string
  schema_version: number
  data: DeviceMetersRegistryPayload
}

export interface UseDeviceMeterSourceStreamOptions {
  /** Default true. Pass false to hold the connection. */
  enabled?: boolean
  /** Override the connect URL for tests / shims. */
  url?: string
  /** Seconds after which the latest frame is considered stale.
   * Default 10 s (matches useDeviceMeterSource). */
  staleThresholdSeconds?: number
}

const DEFAULT_STALE_THRESHOLD_S = 10
const STALE_TICK_INTERVAL_MS = 1_000

function defaultStreamUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return '/api/v1/devices/peak-meters/stream'
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/devices/peak-meters/stream`
}

function withDeviceIdQuery(baseUrl: string, deviceId: string): string {
  const value = encodeURIComponent(deviceId)
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}device_ids=${value}`
}

function entryToPayload(
  entry: DeviceMetersRegistryEntry,
): DeviceMeterSourcePayload {
  const snapshot = entry.snapshot
  const source =
    (snapshot?.source as DeviceMeterSource | undefined) ??
    (entry.has_engine_source ? 'engine' : 'placeholder')
  return {
    device_id: entry.device_id,
    input_peak_db: snapshot?.input_peak_db ?? [],
    output_peak_db: snapshot?.output_peak_db ?? [],
    source,
    captured_at: snapshot?.captured_at ?? null,
  }
}

export function useDeviceMeterSourceStream(
  deviceId: string,
  opts?: UseDeviceMeterSourceStreamOptions,
): UseDeviceMeterSourceResult {
  const enabled = opts?.enabled ?? true
  const baseUrl = opts?.url ?? defaultStreamUrl()
  const staleThreshold =
    opts?.staleThresholdSeconds ?? DEFAULT_STALE_THRESHOLD_S

  const url = useMemo(
    () => withDeviceIdQuery(baseUrl, deviceId),
    [baseUrl, deviceId],
  )

  const [payload, setPayload] = useState<DeviceMeterSourcePayload | undefined>(
    undefined,
  )
  const [hasFirstFrame, setHasFirstFrame] = useState(false)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    setPayload(undefined)
    setHasFirstFrame(false)
    setIsError(false)
    const subscription = subscribeWs(url, {
      onFrame: (frame) => {
        const f = frame as StreamFrame | undefined
        const devices = f?.data?.devices
        if (!devices) return
        const entry = devices.find((d) => d.device_id === deviceId)
        if (entry) {
          setPayload(entryToPayload(entry))
          setHasFirstFrame(true)
          setIsError(false)
        }
      },
      onError: () => {
        setIsError(true)
      },
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [enabled, url, deviceId])

  // Mirror useDeviceMeterSource's 1 s tick so staleness flips even
  // between WS frames.
  const [, forceRender] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(
      () => forceRender((prev) => prev + 1),
      STALE_TICK_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [enabled])

  const capturedAt = payload?.captured_at ?? undefined
  let ageSeconds: number | null = null
  let isStale = false
  if (typeof capturedAt === 'number') {
    ageSeconds = Math.max(0, Date.now() / 1000 - capturedAt)
    if (ageSeconds > staleThreshold) {
      isStale = true
    }
  }

  return {
    source: payload?.source,
    payload,
    isError,
    isLoading: enabled && !hasFirstFrame,
    isStale,
    ageSeconds,
  }
}
