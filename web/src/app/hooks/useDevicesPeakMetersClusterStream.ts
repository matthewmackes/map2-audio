// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDevicesPeakMetersClusterStream — WebSocket subscription to
// /api/v1/devices/peak-meters/cluster/stream shipped in run-13g
// cycle 3. Pushes cluster registry snapshots at ~5 fps so a
// multi-node devices dashboard renders without polling each peer.
//
// Subscribes through wsSubscriptionStore so a page that mounts both
// the local and cluster overviews pays for two sockets (one per URL)
// regardless of how many tiles reference each.

import { useEffect, useMemo, useState } from 'react'

import type {
  DeviceMetersClusterPeerSlice,
  DeviceMetersClusterRegistryPayload,
} from './useDevicesPeakMetersClusterRegistry'
import type { DeviceMetersRegistryPayload } from './useDevicesPeakMetersRegistry'
import { subscribe as subscribeWs } from './wsSubscriptionStore'

interface ClusterStreamFrame {
  type: string
  schema_version: number
  data: DeviceMetersClusterRegistryPayload
}

export interface UseDevicesPeakMetersClusterStreamOptions {
  /** Default true. Pass false to hold the connection (e.g. while the
   * page is not visible). */
  enabled?: boolean
  /** Override the connect URL for tests / shims. Defaults to the
   * canonical `/api/v1/devices/peak-meters/cluster/stream` path on the
   * current host. */
  url?: string
  /** When true, request inline snapshots for every device in every
   * peer's registry. */
  includeSnapshot?: boolean
  /** Restrict the stream to a specific node list. Translated to the
   * canonical `?node_ids=a,b,c` query parameter (run-13i cycle 2).
   * Use `"local"` for the local-node slice; other entries match
   * peer.node_id or peer.hostname. Empty list / undefined means
   * "no filter — return every node". Sorted before URL construction
   * so a re-ordered prop doesn't tear down the socket. Run-13i
   * cycle 3. */
  nodeIds?: readonly string[]
}

export interface UseDevicesPeakMetersClusterStreamResult {
  local: DeviceMetersRegistryPayload | undefined
  peers: DeviceMetersClusterPeerSlice[]
  errors: Record<string, string>
  /** True when an initial frame has been received. */
  hasFirstFrame: boolean
  /** True if the connection is currently open. */
  isConnected: boolean
  /** Last error message from the socket, or null. */
  lastError: string | null
}

function defaultClusterStreamUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return '/api/v1/devices/peak-meters/cluster/stream'
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/v1/devices/peak-meters/cluster/stream`
}

export function useDevicesPeakMetersClusterStream(
  opts?: UseDevicesPeakMetersClusterStreamOptions,
): UseDevicesPeakMetersClusterStreamResult {
  const enabled = opts?.enabled ?? true
  const baseUrl = opts?.url ?? defaultClusterStreamUrl()
  const includeSnapshot = opts?.includeSnapshot ?? false

  // Memoize via a stable join so re-ordered props don't bounce the
  // shared subscription.
  const nodeIdsKey = (opts?.nodeIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .sort()
    .join(',')

  const url = useMemo(() => {
    let next = baseUrl
    const params: string[] = []
    if (includeSnapshot) params.push('include_snapshot=true')
    if (nodeIdsKey) {
      params.push(`node_ids=${encodeURIComponent(nodeIdsKey)}`)
    }
    if (params.length === 0) return next
    const separator = next.includes('?') ? '&' : '?'
    return `${next}${separator}${params.join('&')}`
  }, [baseUrl, includeSnapshot, nodeIdsKey])

  const [local, setLocal] = useState<DeviceMetersRegistryPayload | undefined>(
    undefined,
  )
  const [peers, setPeers] = useState<DeviceMetersClusterPeerSlice[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasFirstFrame, setHasFirstFrame] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    const subscription = subscribeWs(url, {
      onFrame: (frame) => {
        const f = frame as ClusterStreamFrame | undefined
        if (f?.data && typeof f.data === 'object') {
          setLocal(f.data.local)
          setPeers(f.data.peers ?? [])
          setErrors(f.data.errors ?? {})
          setHasFirstFrame(true)
          setLastError(null)
        }
      },
      onStateChange: (state) => {
        setIsConnected(state === 'open')
      },
      onError: (message) => {
        setLastError(message)
      },
    })
    return () => {
      subscription.unsubscribe()
    }
  }, [enabled, url])

  return {
    local,
    peers,
    errors,
    hasFirstFrame,
    isConnected,
    lastError,
  }
}
