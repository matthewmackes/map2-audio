import { useEffect, useRef } from 'react'

import { useNodeTopology } from '../../hooks/useNodeTopology'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'
import type { NodeStatus } from '../../types/node'
import { normalizeAlertTopologyNodes, syncNodeAlerts } from '../../utils/nodeAlertSync'

export function NodeAlertMonitor() {
  const topologyQuery = useNodeTopology()
  const upsertAlert = useNodeAlertStore((state) => state.upsertAlert)
  const dismissAlert = useNodeAlertStore((state) => state.dismissAlert)
  const enqueueToast = useNodeAlertStore((state) => state.enqueueToast)
  const previousStatusesRef = useRef<Record<string, NodeStatus>>({})

  useEffect(() => {
    const nodes = normalizeAlertTopologyNodes(topologyQuery.data)
    previousStatusesRef.current = syncNodeAlerts(nodes, previousStatusesRef.current, {
      upsertAlert,
      dismissAlert,
      enqueueToast,
    })
  }, [dismissAlert, enqueueToast, topologyQuery.data?.nodes, upsertAlert])

  return null
}
