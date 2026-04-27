/**
 * useDeviceConnections — Hardware Store hot-plug subscription.
 *
 * T2459-G2. Connects to `WS /api/devices/ws` and exposes the live
 * connection set + last hot-plug event so cards can pulse on
 * connect / disconnect (Q11) and the disconnect grace badge (Q12)
 * has accurate timing.
 *
 * Reconnects with exponential backoff if the WS drops. The initial
 * `devices.snapshot` event populates state immediately so the UI
 * doesn't have to wait a full poll cycle.
 *
 * Architecture: docs/architecture/HARDWARE_STORE_INTEGRATION.md §5.
 * Worklist: T2459-G2.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

export type DeviceWsEventType =
  | 'devices.snapshot'
  | 'device.connected'
  | 'device.disconnected'
  | 'pack.degraded'
  | 'host.crash'
  | 'devices.heartbeat'

export interface DeviceWsEvent {
  type: DeviceWsEventType
  data: Record<string, unknown>
  timestamp: number
}

export interface DeviceConnectionsState {
  /** Profile keys (`<pack_id>/<model>.<kind>`) currently connected. */
  connectedKeys: Set<string>
  /** Profile keys pinned by the operator (Q12). */
  pinnedKeys: Set<string>
  /** Profile keys seen within the 24h known-window. */
  knownKeys: Set<string>
  /** Pack ids currently flagged degraded. */
  degradedPacks: Set<string>
  /** Most-recent event the bus has pushed (for animations / toasts). */
  lastEvent: DeviceWsEvent | null
  /** Connection state of the WS itself. */
  status: 'connecting' | 'open' | 'closed' | 'error'
}

const INITIAL_STATE: DeviceConnectionsState = {
  connectedKeys: new Set(),
  pinnedKeys: new Set(),
  knownKeys: new Set(),
  degradedPacks: new Set(),
  lastEvent: null,
  status: 'connecting',
}

const RECONNECT_INITIAL_MS = 500
const RECONNECT_MAX_MS = 15_000

function resolveWsUrl(): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/devices/ws`
}

export function useDeviceConnections(): DeviceConnectionsState {
  const [state, setState] = useState<DeviceConnectionsState>(INITIAL_STATE)
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(RECONNECT_INITIAL_MS)
  const reconnectTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const applyEvent = useCallback((evt: DeviceWsEvent) => {
    setState(prev => {
      const next: DeviceConnectionsState = {
        ...prev,
        connectedKeys: new Set(prev.connectedKeys),
        pinnedKeys: new Set(prev.pinnedKeys),
        knownKeys: new Set(prev.knownKeys),
        degradedPacks: new Set(prev.degradedPacks),
        lastEvent: evt,
      }
      switch (evt.type) {
        case 'devices.snapshot': {
          const data = evt.data as {
            connected_keys?: string[]
            known_keys?: string[]
            pinned_keys?: string[]
            degraded_packs?: string[]
          }
          next.connectedKeys = new Set(data.connected_keys ?? [])
          next.knownKeys = new Set(data.known_keys ?? [])
          next.pinnedKeys = new Set(data.pinned_keys ?? [])
          next.degradedPacks = new Set(data.degraded_packs ?? [])
          break
        }
        case 'device.connected': {
          const key = String(evt.data.profile_key ?? '')
          if (key) {
            next.connectedKeys.add(key)
            next.knownKeys.add(key)
          }
          break
        }
        case 'device.disconnected': {
          const key = String(evt.data.profile_key ?? '')
          if (key) {
            next.connectedKeys.delete(key)
          }
          break
        }
        case 'pack.degraded': {
          const packId = String(evt.data.pack_id ?? '')
          if (packId) next.degradedPacks.add(packId)
          break
        }
        case 'host.crash':
        case 'devices.heartbeat':
          // Surfaced via lastEvent; no state mutation here.
          break
      }
      return next
    })
  }, [])

  const scheduleReconnect = useCallback((openFn: () => void) => {
    if (!mountedRef.current) return
    const delay = Math.min(backoffRef.current, RECONNECT_MAX_MS)
    reconnectTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return
      backoffRef.current = Math.min(backoffRef.current * 2, RECONNECT_MAX_MS)
      openFn()
    }, delay)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const open = () => {
      if (!mountedRef.current) return
      const url = resolveWsUrl()
      if (!url) return
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        setState(prev => ({ ...prev, status: 'error' }))
        scheduleReconnect(open)
        return
      }
      wsRef.current = ws
      setState(prev => ({ ...prev, status: 'connecting' }))

      ws.onopen = () => {
        backoffRef.current = RECONNECT_INITIAL_MS
        setState(prev => ({ ...prev, status: 'open' }))
      }
      ws.onmessage = (e: MessageEvent) => {
        try {
          const evt = JSON.parse(e.data) as DeviceWsEvent
          applyEvent(evt)
        } catch {
          // ignore malformed frames
        }
      }
      ws.onerror = () => {
        setState(prev => ({ ...prev, status: 'error' }))
      }
      ws.onclose = () => {
        wsRef.current = null
        setState(prev => ({ ...prev, status: 'closed' }))
        scheduleReconnect(open)
      }
    }

    open()

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null
        try {
          ws.close()
        } catch {
          // ignore
        }
      }
    }
  }, [applyEvent, scheduleReconnect])

  return state
}
