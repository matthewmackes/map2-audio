import { CaretDown, CheckCircle } from '@phosphor-icons/react'
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
    <div className="node-selector" style={{ marginRight: 8 }}>
      <div className="node-selector-label" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e5e7eb' }}>
        <CheckCircle size={14} weight="duotone" color="#22c55e" />
        <span style={{ fontSize: 12 }}>Node</span>
      </div>
      <div className="node-selector-control" style={{ position: 'relative' }}>
        <select
          value={activeNodeId ?? localNodeId}
          onChange={(e) => {
            const value = e.target.value
            setActiveNode(value === localNodeId ? null : value)
          }}
          style={{
            background: '#0f172a',
            border: '1px solid #1f2937',
            color: '#e5e7eb',
            padding: '6px 28px 6px 10px',
            borderRadius: 6,
            fontSize: 12,
            minWidth: 150,
            appearance: 'none',
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.online ? '●' : '○'} {o.label} {o.latency !== null ? `· ${o.latency.toFixed(1)}ms` : ''}
            </option>
          ))}
          <option value="all">● All nodes</option>
        </select>
        <CaretDown
          size={12}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}
        />
      </div>
    </div>
  )
})

export default NodeSelector
