import { useQuery } from '@tanstack/react-query'
import { WarningCircle, CheckCircle, Lightning, WifiHigh, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { TopologyGraph } from './TopologyGraph'
import { useClusterSimulation } from '../../hooks/useClusterSimulation'
import { normalizeClusterNodes, normalizeClusterMetrics, summarizeClusterMetrics } from './clusterData'

interface ClusterOverviewTabProps {
  simulationMode: boolean
}

interface ClusterHardwareNode {
  node_id: string
  hostname: string
  usb_audio_devices: Array<Record<string, unknown>>
  midi_devices: Array<Record<string, unknown>>
  audio_interfaces: string[]
  pipewire_devices: Array<Record<string, unknown>>
  status: string
}

interface ClusterHardwareInventoryResponse {
  nodes?: Record<string, ClusterHardwareNode>
  summary?: {
    node_count: number
    usb_audio_device_count: number
    midi_device_count: number
    pipewire_device_count: number
  }
}

function formatHardwareDevice(device: Record<string, unknown>): string {
  const label =
    (typeof device.name === 'string' && device.name) ||
    (typeof device.product === 'string' && device.product) ||
    (typeof device.description === 'string' && device.description) ||
    'Unknown device'
  const direction = typeof device.direction === 'string' ? device.direction : ''
  const vidPid =
    (typeof device.vid_pid === 'string' && device.vid_pid) ||
    (typeof device.vendor_id === 'string' && typeof device.product_id === 'string'
      ? `${device.vendor_id}:${device.product_id}`
      : '')

  return [label, direction ? `(${direction})` : '', vidPid ? `[${vidPid}]` : '']
    .filter(Boolean)
    .join(' ')
}

export function ClusterOverviewTabEnhanced({ simulationMode }: ClusterOverviewTabProps) {
  const [simulationScenario, setSimulationScenario] = useState<string | null>(null)

  // Fetch real cluster data
  const { data: clusterStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/status')
      if (!res.ok) throw new Error('Failed to fetch cluster status')
      return res.json()
    },
    refetchInterval: 5000,
    enabled: !simulationMode,
  })

  const { data: clusterMetrics } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 10000,
    enabled: !simulationMode,
  })

  // Get real nodes for topology
  const { data: nodesData } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      if (!res.ok) throw new Error('Failed to fetch nodes')
      return res.json()
    },
    refetchInterval: 5000,
    enabled: !simulationMode,
  })

  const { data: hardwareInventory } = useQuery<ClusterHardwareInventoryResponse>({
    queryKey: ['cluster', 'hardware'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/health/extended/devices')
      if (!res.ok) throw new Error('Failed to fetch cluster hardware inventory')
      return res.json()
    },
    refetchInterval: 15000,
    enabled: !simulationMode,
  })

  // Simulation mode - realistic 5-node cluster
  const simulation = useClusterSimulation(simulationMode)

  const normalizedNodes = useMemo(() => normalizeClusterNodes(nodesData), [nodesData])
  const metricSamples = useMemo(() => normalizeClusterMetrics(clusterMetrics), [clusterMetrics])
  const metricSummary = useMemo(
    () => summarizeClusterMetrics(clusterMetrics, metricSamples),
    [clusterMetrics, metricSamples]
  )
  const hardwareNodes = useMemo(
    () => Object.values(hardwareInventory?.nodes ?? {}),
    [hardwareInventory]
  )
  const hardwareSummary = useMemo(() => {
    if (hardwareInventory?.summary) {
      return hardwareInventory.summary
    }

    return {
      node_count: hardwareNodes.length,
      usb_audio_device_count: hardwareNodes.reduce((sum, node) => sum + node.usb_audio_devices.length, 0),
      midi_device_count: hardwareNodes.reduce((sum, node) => sum + node.midi_devices.length, 0),
      pipewire_device_count: hardwareNodes.reduce((sum, node) => sum + node.pipewire_devices.length, 0),
    }
  }, [hardwareInventory, hardwareNodes])

  const topologyNodes = useMemo(() => {
    if (simulationMode) {
      return simulation.nodes
    }
    return normalizedNodes.map(node => {
      const raw = node.raw as Record<string, unknown>
      return {
        node_id: node.nodeId,
        hostname: node.hostname,
        role: node.role,
        status: node.status,
        health_score: node.healthScore,
        cpu_percent: Number(raw['cpu_percent'] ?? 0),
        memory_used_gb: Number(raw['memory_used_gb'] ?? 0),
        memory_total_gb: Number(raw['memory_total_gb'] ?? 0),
        latency_ms: Number(raw['latency_ms'] ?? 0),
      }
    })
  }, [simulationMode, simulation.nodes, normalizedNodes])

  const stats = useMemo(() => {
    if (!simulationMode && normalizedNodes.length === 0 && !clusterStatus) return null

    const simulationNodeCount = simulation.nodes.length
    const simulationAudioNodes = simulation.nodes.filter(n => n.role === 'AUDIO-NODE')
    const simulationCpu =
      simulationNodeCount > 0
        ? simulation.nodes.reduce((sum, n) => sum + n.cpu_percent, 0) / simulationNodeCount
        : 0
    const simulationMemory =
      simulationNodeCount > 0
        ? simulation.nodes.reduce((sum, n) => sum + (n.memory_used_gb / n.memory_total_gb) * 100, 0) / simulationNodeCount
        : 0
    const simulationDsp =
      simulationAudioNodes.length > 0
        ? simulationAudioNodes.reduce((sum, n) => sum + n.dsp_load_percent, 0) / simulationAudioNodes.length
        : 0
    const simulationLatency =
      simulationNodeCount > 0
        ? Math.max(...simulation.nodes.map(n => n.latency_ms))
        : 0
    const simulationHealth =
      simulationNodeCount > 0
        ? simulation.nodes.reduce((sum, n) => sum + n.health_score, 0) / simulationNodeCount
        : 0

    return {
      totalCpu: simulationMode
        ? simulation.nodes.reduce((sum, n) => sum + (n.role.includes('MANAGEMENT') ? 4 : 8), 0)
        : normalizedNodes.reduce((sum, node) => sum + node.cpuCores, 0),
      totalMemory: simulationMode
        ? simulation.nodes.reduce((sum, n) => sum + n.memory_total_gb, 0)
        : normalizedNodes.reduce((sum, node) => sum + node.totalMemoryGb, 0),
      avgCpuUsage: simulationMode ? simulationCpu : metricSummary.avgCpuPercent,
      avgMemoryUsage: simulationMode ? simulationMemory : metricSummary.avgMemoryPercent,
      avgDspLoad: simulationMode ? simulationDsp : metricSummary.avgDspLoadPercent,
      totalLatency: simulationMode ? simulationLatency : metricSummary.maxLatencyMs,
      nodeCount: simulationMode
        ? simulationNodeCount
        : Number(clusterStatus?.total_count ?? clusterStatus?.total_nodes ?? normalizedNodes.length),
      onlineCount: simulationMode
        ? simulation.nodes.filter(n => n.status === 'ONLINE').length
        : Number(
            clusterStatus?.online_count ??
              clusterStatus?.online_nodes ??
              normalizedNodes.filter(node => node.status === 'ONLINE').length
          ),
      healthScore: simulationMode
        ? simulationHealth
        : Number(
            clusterStatus?.aggregate_health_score ??
              clusterStatus?.avg_health ??
              (normalizedNodes.length > 0
                ? normalizedNodes.reduce((sum, node) => sum + node.healthScore, 0) / normalizedNodes.length
                : 0)
          ),
    }
  }, [simulationMode, simulation.nodes, normalizedNodes, metricSummary, clusterStatus])

  if (statusLoading && !simulationMode) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#a0a0a0' }}>
        Loading cluster overview...
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#a0a0a0' }}>
        No cluster data available
      </div>
    )
  }

  const healthColor = stats.healthScore >= 80 ? '#00ff41' : stats.healthScore >= 60 ? '#ffaa00' : '#ff3333'

  return (
    <div className="cluster-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Quick Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card" style={{ background: `linear-gradient(155deg, rgba(0, 255, 65, 0.1), rgba(37, 99, 235, 0.1))`, borderColor: healthColor }}>
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>Health</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: healthColor, marginTop: 8 }}>{stats.healthScore.toFixed(0)}%</div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>Nodes</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb', marginTop: 8 }}>
            {stats.onlineCount}/{stats.nodeCount}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>CPU</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ffa726', marginTop: 8 }}>{stats.avgCpuUsage.toFixed(0)}%</div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>RAM</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6', marginTop: 8 }}>{stats.avgMemoryUsage.toFixed(0)}%</div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>DSP</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', marginTop: 8 }}>{stats.avgDspLoad.toFixed(0)}%</div>
        </div>

        <div className="stat-card">
          <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>Latency</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', marginTop: 8 }}>{stats.totalLatency.toFixed(1)}ms</div>
        </div>
      </div>

      {/* Cluster Topology */}
      <div
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 12,
          padding: '20px',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0', marginBottom: 16 }}>
          🌐 Cluster Topology
        </div>
        <TopologyGraph nodes={topologyNodes || []} edges={[]} simulationMode={simulationMode} />
      </div>

      {!simulationMode && (
        <div
          style={{
            background: '#111827',
            border: '1px solid rgba(96, 165, 250, 0.2)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#dbeafe', marginBottom: 16 }}>
            Attached Hardware Inventory
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div className="stat-card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Nodes</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#60a5fa', marginTop: 8 }}>{hardwareSummary.node_count}</div>
            </div>
            <div className="stat-card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>USB Audio</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#34d399', marginTop: 8 }}>{hardwareSummary.usb_audio_device_count}</div>
            </div>
            <div className="stat-card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>MIDI</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', marginTop: 8 }}>{hardwareSummary.midi_device_count}</div>
            </div>
            <div className="stat-card" style={{ margin: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>PipeWire</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f472b6', marginTop: 8 }}>{hardwareSummary.pipewire_device_count}</div>
            </div>
          </div>

          {hardwareNodes.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>
              No cluster hardware inventory available yet.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {hardwareNodes.map((node) => (
                <div
                  key={node.node_id}
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    borderRadius: 10,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{node.hostname}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{node.node_id}</div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        color: node.status === 'online' ? '#34d399' : '#f87171',
                        border: `1px solid ${node.status === 'online' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(248, 113, 113, 0.35)'}`,
                        borderRadius: 999,
                        padding: '4px 8px',
                      }}
                    >
                      {node.status}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>USB Audio</div>
                    <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                      {node.usb_audio_devices.length
                        ? node.usb_audio_devices.map(formatHardwareDevice).join(', ')
                        : 'None detected'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>MIDI</div>
                    <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                      {node.midi_devices.length
                        ? node.midi_devices.map(formatHardwareDevice).join(', ')
                        : 'None detected'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Audio Interfaces</div>
                    <div style={{ color: '#e2e8f0', fontSize: 13 }}>
                      {node.audio_interfaces.length ? node.audio_interfaces.join(', ') : 'No interfaces reported'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Simulation Controls */}
      {simulationMode && (
        <div
          style={{
            background: 'linear-gradient(155deg, rgba(255, 170, 0, 0.1), rgba(255, 107, 53, 0.1))',
            border: '2px solid #ffaa00',
            borderRadius: 12,
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ffaa00', marginBottom: 14 }}>
            🎯 Simulation Controls
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <button
              onClick={() => {
                setSimulationScenario('high-load')
                simulation.simulateHighLoad()
              }}
              disabled={simulationScenario !== null}
              style={{
                padding: '10px 12px',
                background: simulationScenario === 'high-load' ? '#ff6b35' : '#ffaa00',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: simulationScenario === null ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: simulationScenario !== null ? 0.5 : 1,
              }}
            >
              <Lightning size={14} weight="duotone" />
              Simulate High Load
            </button>

            <button
              onClick={() => {
                setSimulationScenario('degraded')
                const audioNode = simulation.nodes.find(n => n.role === 'AUDIO-NODE')
                if (audioNode) simulation.simulateDegradedNode(audioNode.node_id)
              }}
              disabled={simulationScenario !== null}
              style={{
                padding: '10px 12px',
                background: simulationScenario === 'degraded' ? '#ff6b35' : '#ffaa00',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: simulationScenario === null ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: simulationScenario !== null ? 0.5 : 1,
              }}
            >
              <WarningCircle size={14} weight="duotone" />
              Degrade Node
            </button>

            <button
              onClick={() => {
                setSimulationScenario('failure')
                const audioNode = simulation.nodes.find(n => n.role === 'AUDIO-NODE')
                if (audioNode) simulation.simulateNodeFailure(audioNode.node_id)
              }}
              disabled={simulationScenario !== null}
              style={{
                padding: '10px 12px',
                background: simulationScenario === 'failure' ? '#ff6b35' : '#ffaa00',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: simulationScenario === null ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: simulationScenario !== null ? 0.5 : 1,
              }}
            >
              <WifiHigh size={14} weight="duotone" />
              Node Failure
            </button>

            <button
              onClick={() => {
                setSimulationScenario('failover')
                const audioNode = simulation.nodes.find(n => n.role === 'AUDIO-NODE')
                if (audioNode) simulation.simulateFailover(audioNode.node_id)
              }}
              disabled={simulationScenario !== null}
              style={{
                padding: '10px 12px',
                background: simulationScenario === 'failover' ? '#ff6b35' : '#ffaa00',
                color: '#000',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: simulationScenario === null ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: simulationScenario !== null ? 0.5 : 1,
              }}
            >
              <CheckCircle size={14} weight="duotone" />
              Trigger Failover
            </button>

            <button
              onClick={() => {
                setSimulationScenario(null)
                simulation.clearScenario()
              }}
              style={{
                padding: '10px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#d0d0d0',
                border: '1px solid #444',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <ArrowCounterClockwise size={14} weight="duotone" />
              Clear Scenario
            </button>
          </div>

          {simulationScenario && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 11 }}>
              <div style={{ color: '#ffaa00', fontWeight: 600, marginBottom: 4 }}>Active Scenario:</div>
              <div style={{ color: '#d0d0d0' }}>
                {simulationScenario === 'high-load' && '⚡ High Load simulation - all nodes experiencing CPU spike'}
                {simulationScenario === 'degraded' && '⚠️ Degraded Node - audio node experiencing issues'}
                {simulationScenario === 'failure' && '🔴 Node Failure - audio node offline, flows fail over'}
                {simulationScenario === 'failover' && '🔄 Failover - demonstrating primary to standby switch'}
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: '#a0a0a0' }}>
                Time remaining: {30 - Math.floor(simulation.scenarioTime)} seconds
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
