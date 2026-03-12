import { Select, SelectItem } from '@carbon/react'
import { memo, useMemo } from 'react'

import { useCluster } from '../../contexts/ClusterContext'

export const NodeSelector = memo(function NodeSelector() {
  const { nodes, activeNodeId, setActiveNode, isClusterMode, localNodeId } = useCluster()

  const options = useMemo(() => {
    const base = nodes.map((n) => ({
      value: n.nodeId,
      label: `${n.hostname}${n.nodeId === localNodeId ? ' (local)' : ''}`,
      online: n.isOnline,
      latency: n.latencyMs,
    }))
    return base
  }, [nodes, localNodeId])

  if (!isClusterMode) {
    return null
  }

  return (
    <div className="node-selector">
      <Select
        id="cluster-node-selector"
        aria-label="Select cluster node"
        labelText="Cluster node"
        hideLabel
        size="sm"
        value={activeNodeId ?? localNodeId}
        onChange={(event) => {
          const value = event.currentTarget.value
          setActiveNode(value === localNodeId ? null : value)
        }}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            text={`${option.online ? 'Online' : 'Offline'} · ${option.label}${option.latency !== null ? ` · ${option.latency.toFixed(1)}ms` : ''}`}
          />
        ))}
        <SelectItem value="all" text="Online · All nodes" />
      </Select>
    </div>
  )
})

export default NodeSelector
