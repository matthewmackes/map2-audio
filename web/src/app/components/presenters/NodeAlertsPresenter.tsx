import { useEffect } from 'react'

import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import { routePlatformEvent } from '../../services/platformEventRouter'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'
import { usePlatformStore } from '../../stores/platformStore'

export function NodeAlertsPresenter() {
  const { events } = usePlatformEvents()
  const setPlatformAlerts = usePlatformStore((state) => state.setAlerts)

  useEffect(() => {
    const nodeAlerts = events.flatMap((event) => routePlatformEvent(event).filter((decision) => decision.target === 'node_alert'))

    useNodeAlertStore.setState((state) => {
      const nextAlerts = nodeAlerts.map((decision) => ({
        id: decision.eventId,
        node_id: decision.nodeId,
        hostname: decision.nodeId,
        severity: decision.alert.severity === 'critical' ? ('critical' as const) : ('warn' as const),
        message: decision.alert.subtitle,
        timestamp: events.find((event) => event.event_id === decision.eventId)?.occurred_at ?? new Date().toISOString(),
        dismissed: false,
      }))

      return {
        ...state,
        alerts: nextAlerts,
        toasts: nextAlerts.slice(0, 3),
      }
    })

    setPlatformAlerts(nodeAlerts.map((decision) => decision.alert))
  }, [events, setPlatformAlerts])

  return null
}
