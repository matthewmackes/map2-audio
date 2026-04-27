/**
 * useHotPlugToast — Q11 hot-plug toast.
 *
 * T2459-G4. Watches the `lastEvent` field of `useDeviceConnections`
 * and emits a Carbon toast on `device.connected` / `device.disconnected`.
 * Pack-degraded and host-crash events also surface so operators see
 * the same alerts that drive the diagnostics aggregate (Q19) without
 * having to navigate away from the Hardware Store.
 *
 * Toasts are deduped: the same event timestamp will not produce a
 * second toast across rerenders.
 */

import { useEffect, useRef } from 'react'
import { useToasts } from '../../Toasts'
import type { DeviceWsEvent } from './useDeviceConnections'

export function useHotPlugToast(lastEvent: DeviceWsEvent | null): void {
  const { pushToast } = useToasts()
  const lastSeenTsRef = useRef<number>(0)

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.timestamp <= lastSeenTsRef.current) return
    lastSeenTsRef.current = lastEvent.timestamp

    switch (lastEvent.type) {
      case 'device.connected': {
        const key = String(lastEvent.data?.profile_key ?? 'unknown profile')
        pushToast(`Device connected: ${key}`, 'success', { durationMs: 4000 })
        break
      }
      case 'device.disconnected': {
        const key = String(lastEvent.data?.profile_key ?? 'unknown profile')
        pushToast(`Device disconnected: ${key}`, 'warn', { durationMs: 4000 })
        break
      }
      case 'pack.degraded': {
        const packId = String(lastEvent.data?.pack_id ?? 'unknown pack')
        pushToast(
          `Pack degraded: ${packId}`,
          'error',
          { durationMs: 6000, title: 'Hardware Store' },
        )
        break
      }
      case 'host.crash': {
        const restartCount = Number(lastEvent.data?.restart_count ?? 0)
        pushToast(
          `Controller host restarted (${restartCount} crashes in window)`,
          'error',
          { durationMs: 6000, title: 'Hardware Store' },
        )
        break
      }
      default:
        break
    }
  }, [lastEvent, pushToast])
}
