import { useMemo } from 'react'
import { useCluster } from '../contexts/useCluster'
import { useDeviceLocation } from './useDeviceLocation'
import type {
  DeviceIssue,
  DeviceKey,
  DeviceNodeContextValue,
  DeviceNodeState,
} from '../components/DeviceContext/deviceContextTypes'

// Audit Arch-14 (cycle 43): the parameter type is the central `DeviceKey`
// union. New devices should be added to deviceContextTypes.ts; the type
// system will then guide every shell/banner/dialog touchpoint that needs
// to know about the new key. Consumers that genuinely need to pass a
// dynamically-derived string (e.g. URL params) cast through `as DeviceKey`
// at the boundary so the widening is explicit and reviewable.
export function useDeviceNodeContext(deviceKey: DeviceKey | DeviceKey[]): DeviceNodeContextValue {
  const { activeNodeId, localNodeId, nodes } = useCluster()
  const { location, matches, isLoading } = useDeviceLocation(deviceKey)

  const selectedNodeId = useMemo(
    () => (activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId),
    [activeNodeId, localNodeId],
  )

  const currentNode = useMemo(
    () => nodes.find((n) => n.nodeId === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  const targetNode = useMemo(
    () => (location ? (nodes.find((n) => n.nodeId === location.nodeId) ?? null) : null),
    [location, nodes],
  )

  const deviceState = useMemo((): DeviceNodeState => {
    if (isLoading) return 'loading'
    if (!location) return 'not_found'
    if (targetNode && !targetNode.isOnline) return 'node_offline'
    if (selectedNodeId !== location.nodeId) return 'needs_switch'
    return 'ready'
  }, [isLoading, location, selectedNodeId, targetNode])

  const issues = useMemo((): DeviceIssue[] => {
    const result: DeviceIssue[] = []

    if (deviceState === 'not_found') {
      result.push({
        id: 'not-found',
        severity: 'error',
        title: 'Device not detected',
        detail: 'This device is not currently visible on any cluster node. Check that it is connected and powered on.',
      })
    }

    if (deviceState === 'needs_switch' && targetNode) {
      result.push({
        id: 'needs-switch',
        severity: 'info',
        title: 'Device on a different node',
        detail: `This device is connected to ${targetNode.hostname}. Switch your managing context to control it.`,
      })
    }

    if (deviceState === 'node_offline' && targetNode) {
      result.push({
        id: 'node-offline',
        severity: 'error',
        title: 'Node is offline',
        detail: `${targetNode.hostname} is not reachable. The device cannot be controlled until that node comes back online.`,
      })
    }

    // Additional warning: high latency on target node (can combine with needs_switch)
    if (
      targetNode &&
      targetNode.latencyMs !== null &&
      targetNode.latencyMs > 200 &&
      deviceState !== 'node_offline'
    ) {
      result.push({
        id: 'high-latency',
        severity: 'warning',
        title: 'Degraded connection to node',
        detail: `${targetNode.hostname} is responding with ${targetNode.latencyMs}ms latency. Control commands may be slow or unreliable.`,
      })
    }

    return result
  }, [deviceState, targetNode])

  const canSwitch =
    (deviceState === 'needs_switch') &&
    Boolean(targetNode?.isOnline)

  return {
    deviceState,
    deviceLocation: location,
    allNodesWithDevice: matches,
    currentNode,
    targetNode,
    issues,
    canSwitch,
    isLoading,
  }
}
