import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Cpu, HardDrive, Zap, Monitor } from 'lucide-react'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

interface ClusterNode {
  node_id: string
  hostname: string
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'maintenance'
  cpu_percent?: number
  memory_used_gb?: number
  memory_total_gb?: number
  has_gpu?: boolean
  gpu_name?: string | null
  assigned_flows?: Array<{ flow_id: string; type: 'primary' | 'standby' }>
  flow_count?: number
}

interface DeploymentModeResponse {
  mode: string
  description: string
}

async function fetchDeploymentMode(): Promise<DeploymentModeResponse> {
  const res = await fetch(`${API_BASE}/deployment/mode`)
  if (!res.ok) throw new Error('Failed to fetch deployment mode')
  return res.json()
}

async function fetchClusterNodes(): Promise<{ nodes: ClusterNode[] }> {
  const res = await fetch(`${API_BASE}/cluster/nodes`)
  if (!res.ok) {
    throw new Error('Failed to fetch cluster nodes')
  }
  const data = await res.json()
  return {
    nodes: (data.nodes || []).map((node: ClusterNode) => {
      const statusRaw = (node.status || 'OFFLINE') as string
      const status = statusRaw.toLowerCase() === 'maintenance'
        ? 'maintenance'
        : (statusRaw.toUpperCase() as ClusterNode['status'])
      return { ...node, status }
    }),
  }
}

export function ClusterDashboard() {
  const deploymentQuery = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: fetchDeploymentMode,
    staleTime: 30000,
  })

  const isAllInOne = deploymentQuery.data?.mode === 'ALL-IN-ONE'

  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: fetchClusterNodes,
    refetchInterval: 2000,
    enabled: !isAllInOne,
  })

  const nodes = data?.nodes || []

  const toggleMaintenance = async (node: ClusterNode) => {
    const enabled = node.status !== 'maintenance'
    await fetch(`${API_BASE}/cluster/nodes/${node.node_id}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    refetch()
  }

  if (isAllInOne) {
    return (
      <div className="cluster-dashboard cluster-dashboard-compact">
        <div className="cluster-dashboard-header">
          <Monitor size={16} />
          <h3>Cluster Nodes</h3>
          <span className="cluster-aio-badge">ALL-IN-ONE</span>
          <span className="cluster-aio-status">All services running on local node</span>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="cluster-dashboard">
        <div className="cluster-dashboard-header">
          <h3>Cluster Nodes</h3>
        </div>
        <div className="cluster-dashboard-empty">Loading nodes...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="cluster-dashboard">
        <div className="cluster-dashboard-header">
          <h3>Cluster Nodes</h3>
        </div>
        <div className="cluster-dashboard-empty">Failed to load cluster nodes</div>
      </div>
    )
  }

  return (
    <div className="cluster-dashboard">
      <div className="cluster-dashboard-header">
        <h3>Cluster Nodes ({nodes.length})</h3>
        <button className="cluster-dashboard-refresh" onClick={() => refetch()}>
          <RefreshCw size={16} />
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="cluster-dashboard-empty">No nodes detected</div>
      ) : (
        <div className="cluster-nodes-grid">
          {nodes.map(node => (
            <ClusterNodeCard key={node.node_id} node={node} onToggleMaintenance={toggleMaintenance} />
          ))}
        </div>
      )}
    </div>
  )
}

function ClusterNodeCard({ node, onToggleMaintenance }: { node: ClusterNode; onToggleMaintenance: (node: ClusterNode) => void }) {
  const statusColor = {
    ONLINE: '#22c55e',
    OFFLINE: '#ef4444',
    DEGRADED: '#f59e0b',
    maintenance: '#64748b',
  }[node.status]

  const cpuPercent = node.cpu_percent ?? 0
  const memoryUsed = node.memory_used_gb ?? 0
  const memoryTotal = node.memory_total_gb ?? 0
  const memoryPercent = memoryTotal > 0 ? (memoryUsed / memoryTotal) * 100 : 0

  const cpuBarColor = cpuPercent > 80 ? '#ef4444' : cpuPercent > 60 ? '#f59e0b' : '#22c55e'

  return (
    <div className="cluster-node-card" style={{ borderColor: statusColor }}>
      <div className="cluster-node-header">
        <div className="cluster-node-status" style={{ backgroundColor: statusColor }} />
        <h4>{node.hostname}</h4>
        {node.has_gpu && (
          <span className="cluster-node-gpu-badge" title={node.gpu_name || 'GPU'}>
            🎮
          </span>
        )}
        {node.status !== 'OFFLINE' && (
          <button
            className="cluster-node-maintenance"
            onClick={() => onToggleMaintenance(node)}
            title={node.status === 'maintenance' ? 'Disable maintenance' : 'Enable maintenance'}
          >
            🔧
          </button>
        )}
      </div>

      <div className="cluster-node-resources">
        <div className="cluster-resource-row">
          <Cpu size={14} />
          <span className="cluster-resource-label">CPU</span>
          <div className="cluster-resource-bar">
            <div className="cluster-resource-bar-fill" style={{ width: `${cpuPercent}%`, backgroundColor: cpuBarColor }} />
          </div>
          <span className="cluster-resource-value">{cpuPercent.toFixed(0)}%</span>
        </div>

        <div className="cluster-resource-row">
          <HardDrive size={14} />
          <span className="cluster-resource-label">RAM</span>
          <div className="cluster-resource-bar">
            <div className="cluster-resource-bar-fill" style={{ width: `${memoryPercent}%`, backgroundColor: '#3b82f6' }} />
          </div>
          <span className="cluster-resource-value">
            {memoryUsed.toFixed(1)}/{memoryTotal.toFixed(1)}GB
          </span>
        </div>
      </div>

      <div className="cluster-node-flows">
        <div className="cluster-node-flows-header">
          <Zap size={12} />
          <span>Flows: {node.flow_count ?? (node.assigned_flows?.length ?? 0)}</span>
        </div>
        <div className="cluster-node-flows-list">
          {(node.assigned_flows || []).map(assignment => (
            <div key={`${node.node_id}-${assignment.flow_id}`} className={`cluster-flow-badge ${assignment.type}`}>
              {assignment.flow_id}
              {assignment.type === 'standby' && <span className="standby-indicator">●</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
