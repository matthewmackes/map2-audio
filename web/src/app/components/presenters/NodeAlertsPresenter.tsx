import { useEffect, useMemo } from 'react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'
import { usePlatformStore } from '../../stores/platformStore'

export function NodeAlertsPresenter() {
  const { decisions, events } = usePlatformEventDecisions()
  const setPlatformAlerts = usePlatformStore((state) => state.setAlerts)
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.event_id, event])),
    [events],
  )

  useEffect(() => {
    const nodeAlerts = filterPlatformEventDecisions(decisions, 'node_alert')

    useNodeAlertStore.setState((state) => {
      const nextAlerts = nodeAlerts.map((decision) => ({
        id: decision.eventId,
        node_id: decision.nodeId,
        hostname: decision.nodeId,
        severity: decision.alert.severity === 'critical' ? ('critical' as const) : ('warn' as const),
        message: decision.alert.subtitle,
        timestamp: eventById.get(decision.eventId)?.occurred_at ?? new Date().toISOString(),
        dismissed: false,
      }))

      return {
        ...state,
        alerts: nextAlerts,
        toasts: nextAlerts.slice(0, 3),
      }
    })

    setPlatformAlerts(nodeAlerts.map((decision) => decision.alert))
  }, [decisions, eventById, setPlatformAlerts])

  return null
}
