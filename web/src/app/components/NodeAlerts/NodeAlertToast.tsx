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
