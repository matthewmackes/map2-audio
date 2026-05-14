// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersStream — WebSocket subscription to the
// /api/v1/devices/peak-meters/stream fan-out shipped in
// pivot-13b cycle 2. Pushes registry snapshots at 30 fps so a
// Devices landing page renders without per-device polling cost.
//
// Pick-1 of the eleventh Continue run handoff.

import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  DeviceMetersRegistryEntry,
  DeviceMetersRegistryPayload,
} from './useDevicesPeakMetersRegistry'

interface StreamFrame {
  type: string
  schema_version: number
  data: DeviceMetersRegistryPayload
}

export interface UseDevicesPeakMetersStreamOptions {
  /** Default true. Pass false to hold the connection (e.g. while
   * the page is not visible). */
  enabled?: boolean
  /** Override the connect URL for tests / shims. Defaults to the
   * canonical `/api/v1/devices/peak-meters/stream` path on the
   * current host. */
  url?: string
  /** Reconnect backoff ceiling, in ms. Default 5 s. */
  maxReconnectDelayMs?: number
  /** Restrict the stream to a specific device list. Translated to the
   * canonical `?device_ids=a,b,c` query parameter the backend reads
   * (pivot-13c cycle 2). When undefined or empty, the stream returns
   * every registered device on every tick. Updating this prop
   * re-establishes the connection with the new filter set. */
  deviceIds?: readonly string[]
}

export interface UseDevicesPeakMetersStreamResult {
  devices: DeviceMetersRegistryEntry[]
  /** True when an initial frame has been received. Lets the consumer
   * skip rendering a stale registry payload during the first
   * round-trip. */
  hasFirstFrame: boolean
  /** True if the connection is currently open. */
  isConnected: boolean
  /** Last error message from the socket, or null. */
  lastError: string | null
}

function defaultStreamUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return '/api/v1/devices/peak-meters/stream'
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/devices/peak-meters/stream`
}

function appendDeviceIdsParam(
  baseUrl: string,
  deviceIds: readonly string[] | undefined,
): string {
  if (!deviceIds || deviceIds.length === 0) return baseUrl
  const joined = deviceIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  if (joined.length === 0) return baseUrl
  const value = encodeURIComponent(joined.join(','))
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}device_ids=${value}`
}

export function useDevicesPeakMetersStream(
  opts?: UseDevicesPeakMetersStreamOptions,
): UseDevicesPeakMetersStreamResult {
  const enabled = opts?.enabled ?? true
  const baseUrl = opts?.url ?? defaultStreamUrl()
  // Memoize the device list so a fresh array literal on each render
  // doesn't tear down the socket. Joined value is the stable identity.
  const deviceIdsKey = (opts?.deviceIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .sort()
    .join(',')
  const url = useMemo(
    () =>
      deviceIdsKey
        ? appendDeviceIdsParam(baseUrl, deviceIdsKey.split(','))
        : baseUrl,
    [baseUrl, deviceIdsKey],
  )
  const maxBackoff = opts?.maxReconnectDelayMs ?? 5000

  const [devices, setDevices] = useState<DeviceMetersRegistryEntry[]>([])
  const [hasFirstFrame, setHasFirstFrame] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelayRef = useRef<number>(250)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    cancelledRef.current = false

    const connect = (): void => {
      if (cancelledRef.current) return
      try {
        const ws = new WebSocket(url)
        socketRef.current = ws
        ws.onopen = () => {
          setIsConnected(true)
          reconnectDelayRef.current = 250
        }
        ws.onmessage = (event) => {
          try {
            const frame = JSON.parse(event.data) as StreamFrame
            if (frame?.data?.devices) {
              setDevices(frame.data.devices)
              setHasFirstFrame(true)
              setLastError(null)
            }
          } catch (err) {
            setLastError((err as Error).message ?? 'frame parse failed')
          }
        }
        ws.onerror = () => {
          setLastError('websocket error')
        }
        ws.onclose = () => {
          setIsConnected(false)
          socketRef.current = null
          if (cancelledRef.current) return
          const delay = reconnectDelayRef.current
          reconnectDelayRef.current = Math.min(maxBackoff, delay * 2)
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
      } catch (err) {
        setLastError((err as Error).message ?? 'websocket construct failed')
      }
    }

    connect()

    return () => {
      cancelledRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const ws = socketRef.current
      socketRef.current = null
      if (ws) {
        try {
          ws.close()
        } catch {
          // ignored — disposal best-effort
        }
      }
    }
  }, [enabled, url, maxBackoff])

  return useMemo(
    () => ({ devices, hasFirstFrame, isConnected, lastError }),
    [devices, hasFirstFrame, isConnected, lastError],
  )
}
