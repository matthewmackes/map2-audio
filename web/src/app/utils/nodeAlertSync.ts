import type { NodeAlert } from '../stores/nodeAlertStore'
import type { NodeStatus, NodeSummary } from '../types/node'
import { buildNodeAlertMessage } from './nodeDisplay'

type NodeAlertSyncActions = {
  upsertAlert: (alert: NodeAlert) => void
  dismissAlert: (nodeId: string) => void
  enqueueToast: (alert: NodeAlert) => void
}

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

export function normalizeAlertTopologyNodes(topology: { nodes?: unknown } | undefined): NodeSummary[] {
  return Array.isArray(topology?.nodes) ? topology.nodes as NodeSummary[] : []
}

export function syncNodeAlerts(
  nodes: NodeSummary[],
  previousStatuses: Record<string, NodeStatus>,
  actions: NodeAlertSyncActions,
): Record<string, NodeStatus> {
  const nextStatuses: Record<string, NodeStatus> = {}

  nodes.forEach((node) => {
    const previousStatus = previousStatuses[node.node_id]
    nextStatuses[node.node_id] = node.status

    if (node.status === 'ok') {
      actions.dismissAlert(node.node_id)
      return
    }

    const message = buildNodeAlertMessage(node)

    if (node.status === 'warn') {
      if (previousStatus !== 'warn') {
        actions.upsertAlert(createAlert(node.node_id, node.hostname, 'warn', message))
      }
      return
    }

    if (previousStatus === 'critical' || previousStatus === 'offline') {
      return
    }

    const alert = createAlert(node.node_id, node.hostname, 'critical', message)
    actions.upsertAlert(alert)
    actions.enqueueToast(alert)
  })

  Object.keys(previousStatuses).forEach((nodeId) => {
    if (!(nodeId in nextStatuses)) {
      actions.dismissAlert(nodeId)
    }
  })

  return nextStatuses
}
