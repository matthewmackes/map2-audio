import { useMemo, useEffect } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { WifiHigh, Database, WarningCircle, CheckCircle } from '@phosphor-icons/react'

interface ClusterNode {
  node_id?: string
  id?: string
  hostname?: string
  role?: string
  status?: string
  health_score?: number
  latency_ms?: number
  cpu_percent?: number
  memory_percent?: number
  memory_used_gb?: number
  memory_total_gb?: number
}

interface TopologyGraphProps {
  nodes: ClusterNode[]
  edges: Array<{ source: string; target: string; latency: number }>
  simulationMode?: boolean
}

interface TopologyNodeVisualData {
  hostname: string
  role: string
  status: string
  health_score?: number
  cpu_percent?: number
  memory_used_gb?: number
  memory_total_gb?: number
}

// Custom Node Component
function AudioNodeVisual({ data }: { data: TopologyNodeVisualData }) {
  const statusColor = {
    ONLINE: '#00ff41',
    OFFLINE: '#ff3333',
    DEGRADED: '#ffaa00',
  }[data.status] || '#888'

  const healthScore = data.health_score || 0
  const cpuPercent = data.cpu_percent || 0
  const memPercent = data.memory_used_gb && data.memory_total_gb
    ? (data.memory_used_gb / data.memory_total_gb) * 100
    : 0

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%)',
        border: `2px solid ${statusColor}`,
        borderRadius: 12,
        padding: '16px',
        width: 220,
        boxShadow: `0 0 20px ${statusColor}40`,
      }}
    >
      <Handle type="target" position={Position.Top} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: statusColor,
            animation: data.status === 'ONLINE' ? 'pulse 2s infinite' : 'none',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#d0d0d0' }}>{data.hostname}</div>
          <div style={{ fontSize: 10, color: '#a0a0a0' }}>{data.role}</div>
        </div>
      </div>

      {/* Health Score */}
      <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: '#a0a0a0', marginBottom: 4 }}>Health</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2563eb' }}>{healthScore.toFixed(0)}%</div>
          {healthScore >= 80 ? (
            <CheckCircle size={12} weight="duotone" color="#00ff41" />
          ) : healthScore >= 60 ? (
            <WarningCircle size={12} weight="duotone" color="#ffaa00" />
          ) : (
            <WarningCircle size={12} weight="duotone" color="#ff3333" />
          )}
        </div>
      </div>

      {/* CPU & Memory */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div style={{ padding: '6px', background: 'rgba(255,167,38,0.1)', borderRadius: 4 }}>
          <div style={{ fontSize: 9, color: '#ffa726' }}>CPU</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d0d0d0' }}>{cpuPercent.toFixed(0)}%</div>
        </div>
        <div style={{ padding: '6px', background: 'rgba(59,130,246,0.1)', borderRadius: 4 }}>
          <div style={{ fontSize: 9, color: '#3b82f6' }}>RAM</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d0d0d0' }}>{memPercent.toFixed(0)}%</div>
        </div>
      </div>

      {/* Status Text */}
      <div
        style={{
          fontSize: 10,
          padding: '6px 8px',
          background: statusColor + '20',
          border: `1px solid ${statusColor}`,
          borderRadius: 4,
          color: statusColor,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        {data.status}
      </div>

      <Handle type="source" position={Position.Bottom} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

function ManagementNodeVisual({ data }: { data: TopologyNodeVisualData }) {
  const statusColor = data.status === 'ONLINE' ? '#2563eb' : '#ff3333'

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1a3a4a 0%, #0d2a3a 100%)',
        border: `2px solid ${statusColor}`,
        borderRadius: 12,
        padding: '16px',
        width: 220,
        boxShadow: `0 0 20px ${statusColor}40`,
      }}
    >
      <Handle type="target" position={Position.Top} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: statusColor,
            animation: data.status === 'ONLINE' ? 'pulse 2s infinite' : 'none',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb' }}>{data.hostname}</div>
          <div style={{ fontSize: 10, color: '#a0a0a0' }}>{data.role}</div>
        </div>
      </div>

      {/* Services */}
      <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
        <div style={{ fontSize: 10, color: '#a0a0a0', marginBottom: 6 }}>Services</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 9, color: '#d0d0d0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Database size={10} weight="duotone" /> CMDB
          </div>
          <div style={{ fontSize: 9, color: '#d0d0d0', display: 'flex', alignItems: 'center', gap: 4 }}>
            <WifiHigh size={10} weight="duotone" /> Orchestrator
          </div>
        </div>
      </div>

      {/* Status Text */}
      <div
        style={{
          fontSize: 10,
          padding: '6px 8px',
          background: statusColor + '20',
          border: `1px solid ${statusColor}`,
          borderRadius: 4,
          color: statusColor,
          textAlign: 'center',
          fontWeight: 600,
        }}
      >
        {data.status}
      </div>

      <Handle type="source" position={Position.Bottom} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export function TopologyGraph({ nodes: clusterNodes, edges: inputEdges, simulationMode = false }: TopologyGraphProps) {
  // Convert cluster data to React Flow nodes and edges
  const { nodes: flowNodes, edges: flowEdges } = useMemo(() => {
    if (!clusterNodes || clusterNodes.length === 0) {
      return { nodes: [], edges: [] }
    }

    const normalizedNodes = clusterNodes.map((node, index) => {
      const nodeId = node.node_id || node.id || node.hostname || `node-${index + 1}`
      const role = (node.role || 'UNKNOWN').toUpperCase()
      const status = (node.status || 'OFFLINE').toUpperCase()
      const memoryPercent = node.memory_percent
      const memoryTotalGb = typeof node.memory_total_gb === 'number' ? node.memory_total_gb : 0
      const computedMemoryUsed =
        typeof node.memory_used_gb === 'number'
          ? node.memory_used_gb
          : memoryPercent && memoryTotalGb > 0
            ? (memoryPercent / 100) * memoryTotalGb
            : 0

      return {
        ...node,
        node_id: nodeId,
        hostname: node.hostname || nodeId,
        role,
        status,
        memory_total_gb: memoryTotalGb > 0 ? memoryTotalGb : typeof node.memory_total_gb === 'number' ? node.memory_total_gb : 0,
        memory_used_gb: computedMemoryUsed,
      }
    })

    const flowNodesList: Node[] = []
    const edgesList: Edge[] = []

    // Management nodes at top
    const mgmtNodes = normalizedNodes.filter(
      node =>
        node.role === 'MANAGEMENT-NODE' ||
        node.role === 'CONTROL-NODE' ||
        node.role === 'STANDBY-MANAGEMENT'
    )
    mgmtNodes.forEach((node, idx) => {
      flowNodesList.push({
        id: node.node_id,
        data: {
          hostname: node.hostname,
          role: node.role,
          status: node.status,
          health_score: node.health_score,
        },
        position: { x: idx * 250, y: 0 },
        type: 'management',
      })
    })

    // Audio nodes below
    const audioNodes = normalizedNodes.filter(node => node.role.includes('AUDIO'))
    audioNodes.forEach((node, idx) => {
      const x = 50 + idx * 280
      const y = 200
      flowNodesList.push({
        id: node.node_id,
        data: {
          hostname: node.hostname,
          role: node.role,
          status: node.status,
          health_score: node.health_score,
          cpu_percent: node.cpu_percent,
          memory_used_gb: node.memory_used_gb,
          memory_total_gb: node.memory_total_gb,
        },
        position: { x, y },
        type: 'audio',
      })

      // Connect to management
      mgmtNodes.forEach(mgmt => {
        edgesList.push({
          id: `${mgmt.node_id}-${node.node_id}`,
          source: mgmt.node_id,
          target: node.node_id,
          label: node.latency_ms ? `${node.latency_ms.toFixed(1)}ms` : undefined,
          animated: node.status === 'ONLINE' || simulationMode,
          style: {
            stroke: node.latency_ms && node.latency_ms > 50 ? '#ffaa00' : '#2563eb',
            strokeWidth: 2,
          },
        })
      })
    })

    inputEdges.forEach((edge, index) => {
      edgesList.push({
        id: `edge-${index}-${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: `${edge.latency.toFixed(1)}ms`,
        animated: simulationMode,
        style: {
          stroke: edge.latency > 50 ? '#ffaa00' : '#2563eb',
          strokeWidth: 2,
        },
      })
    })

    return { nodes: flowNodesList, edges: edgesList }
  }, [clusterNodes, inputEdges, simulationMode])

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges)

  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  const nodeTypes = useMemo(
    () => ({
      audio: AudioNodeVisual,
      management: ManagementNodeVisual,
    }),
    []
  )

  return (
    <div
      style={{
        width: '100%',
        height: 500,
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#333" gap={16} />
        <Controls style={{ background: 'transparent' }} />
        <MiniMap
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid #333',
          }}
          nodeColor="#2563eb"
        />
      </ReactFlow>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 12,
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid #333',
          borderRadius: 6,
          padding: '12px 14px',
          fontSize: 11,
          color: '#d0d0d0',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Legend</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#00ff41' }} />
            Online
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ffaa00' }} />
            Degraded
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ff3333' }} />
            Offline
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid #444', fontSize: 10 }}>
            Animated lines = active connections
          </div>
        </div>
      </div>
    </div>
  )
}
