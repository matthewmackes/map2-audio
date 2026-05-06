// NodeAlertToast — kept (audit Dead-2b clarified 2026-05-06).
// Returns null. This is the side-effect bridge that mirrors
// `nodeAlertStore` state into the global `useToasts()` queue
// (with `replaceLiveBanner: true` so the platform notification
// path picks the same alert up). The Unified Node Pill handles
// in-context alert rows when its popover is open; this toast
// covers the platform-wide notification surface when the popover
// is closed. NodeAlertBar (the deprecated peer) was a separate
// page-level banner and has been removed.
import { useEffect, useRef } from 'react'

import { useToasts } from '../Toasts'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'

export function NodeAlertToast() {
  const alerts = useNodeAlertStore((state) => state.alerts)
  const { pushToast, dismissToast } = useToasts()
  const previousIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const nextIds = new Set<string>()

    alerts.forEach((alert) => {
      const toastId = `node-alert:${alert.node_id}`
      nextIds.add(toastId)
      pushToast(`${alert.hostname}: ${alert.message}`, alert.severity === 'critical' ? 'error' : 'warn', {
        id: toastId,
        persistent: true,
        title: 'Node critical',
        stage: {
          kind: alert.severity === 'critical' ? 'critical_alert' : 'warning_alert',
          severity: alert.severity === 'critical' ? 'critical' : 'warning',
          resource: {
            kind: 'node',
            id: alert.node_id,
          },
          compactLabel: alert.hostname,
          sourceLabel: alert.hostname,
          replaceLiveBanner: true,
        },
      })
    })

    previousIdsRef.current.forEach((id) => {
      if (!nextIds.has(id)) {
        dismissToast(id)
      }
    })

    previousIdsRef.current = nextIds
  }, [alerts, dismissToast, pushToast])

  return null
}
