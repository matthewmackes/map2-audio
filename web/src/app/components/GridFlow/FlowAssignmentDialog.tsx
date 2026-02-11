import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DesktopTower } from '@phosphor-icons/react'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

interface FlowAssignmentDialogProps {
  isOpen: boolean
  flowId: string | null
  chainId: number | null
  availableNodes: Array<{
    node_id: string
    hostname: string
    cpu_percent?: number
    memory_used_gb?: number
    memory_total_gb?: number
    has_gpu?: boolean
  }>
  onAssign: (nodeId: string, redundancyEnabled: boolean) => void
  onCancel: () => void
}

export function FlowAssignmentDialog({
  isOpen,
  flowId,
  chainId,
  availableNodes,
  onAssign,
  onCancel,
}: FlowAssignmentDialogProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const [redundancyEnabled, setRedundancyEnabled] = useState(false)

  const { data: chainAnalysis } = useQuery({
    queryKey: ['chains', chainId, 'analysis'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/chains/${chainId}/analysis`)
      if (!res.ok) throw new Error('Failed to load chain analysis')
      return res.json()
    },
    enabled: !!chainId,
  })

  const isSuitableNode = (node: { has_gpu?: boolean; cpu_percent?: number }) => {
    if (!chainAnalysis) return true
    if (chainAnalysis.requires_gpu && !node.has_gpu) return false
    const projectedCpu = (node.cpu_percent ?? 0) + (chainAnalysis.estimated_cpu_percent ?? 0)
    return projectedCpu <= 85
  }

  const recommendedNodes = (() => {
    if (!chainAnalysis) return []
    return [...availableNodes]
      .filter(isSuitableNode)
      .sort((a, b) => {
        let scoreA = 0
        let scoreB = 0
        if (chainAnalysis.gpu_recommended) {
          scoreA += a.has_gpu ? 100 : 0
          scoreB += b.has_gpu ? 100 : 0
        }
        scoreA -= a.cpu_percent ?? 0
        scoreB -= b.cpu_percent ?? 0
        return scoreB - scoreA
      })
  })()

  if (!isOpen || !flowId) return null

  return (
    <div className="flow-assignment-dialog-overlay" onClick={onCancel}>
      <div className="flow-assignment-dialog" onClick={e => e.stopPropagation()}>
        <div className="flow-assignment-dialog-header">
          <h2>Assign Flow: {flowId}</h2>
          <button className="flow-assignment-dialog-close" onClick={onCancel}>✕</button>
        </div>

        <div className="flow-assignment-dialog-body">
          <div className="flow-assignment-section">
            <label>Select Target Node</label>
            {recommendedNodes.length > 0 && (
              <div className="flow-assignment-recommended">
                <span>Recommended:</span>
                {recommendedNodes.slice(0, 3).map(node => (
                  <button
                    key={`rec-${node.node_id}`}
                    className="flow-assignment-recommended-btn"
                    onClick={() => setSelectedNodeId(node.node_id)}
                  >
                    ⭐ {node.hostname}
                  </button>
                ))}
              </div>
            )}
            <div className="flow-assignment-node-list">
              {availableNodes.map(node => (
                <button
                  key={node.node_id}
                  className={`flow-assignment-node ${selectedNodeId === node.node_id ? 'selected' : ''} ${!isSuitableNode(node) ? 'unsuitable' : ''}`}
                  onClick={() => isSuitableNode(node) && setSelectedNodeId(node.node_id)}
                >
                  <div className="flow-assignment-node-header">
                    <DesktopTower size={16} weight="duotone" />
                    <span>{node.hostname}</span>
                    {node.has_gpu && <span className="flow-assignment-gpu">🎮</span>}
                  </div>
                  <div className="flow-assignment-node-stats">
                    <span>CPU: {node.cpu_percent ?? 0}%</span>
                    <span>RAM: {(node.memory_used_gb ?? 0).toFixed(1)}/{(node.memory_total_gb ?? 0).toFixed(1)}GB</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {chainAnalysis && (
            <div className="flow-assignment-section">
              <label>Chain Requirements</label>
              <div className="flow-assignment-requirements">
                <div>CPU: {chainAnalysis.estimated_cpu_percent}%</div>
                <div>Memory: {chainAnalysis.estimated_memory_mb}MB</div>
                {chainAnalysis.requires_gpu && (
                  <div className="flow-assignment-warning">GPU required for this chain</div>
                )}
              </div>
            </div>
          )}

          <div className="flow-assignment-section">
            <label className="flow-assignment-checkbox">
              <input
                type="checkbox"
                checked={redundancyEnabled}
                onChange={e => setRedundancyEnabled(e.target.checked)}
              />
              <span>Enable redundancy (standby nodes)</span>
            </label>
          </div>
        </div>

        <div className="flow-assignment-dialog-footer">
          <button className="flow-assignment-btn cancel" onClick={onCancel}>Cancel</button>
          <button
            className="flow-assignment-btn primary"
            onClick={() => onAssign(selectedNodeId, redundancyEnabled)}
            disabled={!selectedNodeId}
          >
            Assign Flow
          </button>
        </div>
      </div>
    </div>
  )
}
