import { useEffect, useRef } from 'react'

import { useNodeTopology } from '../../hooks/useNodeTopology'
import { useNodeAlertStore, type NodeAlert } from '../../stores/nodeAlertStore'
import type { NodeStatus } from '../../types/node'
import { buildNodeAlertMessage } from '../../utils/nodeDisplay'

function createAlert(nodeId: string, hostname: string, severity: 'warn' | 'critical', message: string): NodeAlert {
  return {
    id: `${severity}:${nodeId}:${message}`,
    node_id: nodeId,
    hostname,
    severity,
    message,
    timestamp: new Date().toISOString(),
    dismissed: false,
  }
}

export function NodeAlertMonitor() {
  const topologyQuery = useNodeTopology()
  const upsertAlert = useNodeAlertStore((state) => state.upsertAlert)
  const dismissAlert = useNodeAlertStore((state) => state.dismissAlert)
  const enqueueToast = useNodeAlertStore((state) => state.enqueueToast)
  const previousStatusesRef = useRef<Record<string, NodeStatus>>({})

  useEffect(() => {
    const nodes = topologyQuery.data?.nodes
    if (!nodes) {
      return
    }

    const nextStatuses: Record<string, NodeStatus> = {}

    nodes.forEach((node) => {
      const previousStatus = previousStatusesRef.current[node.node_id]
      nextStatuses[node.node_id] = node.status

      if (node.status === 'ok') {
        dismissAlert(node.node_id)
        return
      }

      const message = buildNodeAlertMessage(node)

      if (node.status === 'warn') {
        if (previousStatus !== 'warn') {
          upsertAlert(createAlert(node.node_id, node.hostname, 'warn', message))
        }
        return
      }

      if (previousStatus === 'critical' || previousStatus === 'offline') {
        return
      }

      const alert = createAlert(node.node_id, node.hostname, 'critical', message)
      upsertAlert(alert)
      enqueueToast(alert)
    })

    Object.keys(previousStatusesRef.current).forEach((nodeId) => {
      if (!(nodeId in nextStatuses)) {
        dismissAlert(nodeId)
      }
    })

    previousStatusesRef.current = nextStatuses
  }, [dismissAlert, enqueueToast, topologyQuery.data?.nodes, upsertAlert])

  return null
}

