import { useQuery } from '@tanstack/react-query'
import { WarningCircle, CheckCircle, Lightning, Cpu, HardDrive, WifiHigh, Play, Pause, ArrowCounterClockwise } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { TopologyGraph } from './TopologyGraph'
import { useClusterSimulation } from '../../hooks/useClusterSimulation'

interface ClusterOverviewTabProps {
  simulationMode: boolean
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

  const { data: deploymentMode } = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: async () => {
      const res = await fetch('/api/deployment/mode')
      if (!res.ok) throw new Error('Failed to fetch deployment mode')
      return res.json()
    },
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

  // Simulation mode - realistic 5-node cluster
  const simulation = useClusterSimulation(simulationMode)

  // Choose data source based on mode
  const clusterData = simulationMode ? simulation.nodes : clusterStatus?.all_nodes
  const nodesList = simulationMode ? simulation.nodes : nodesData?.nodes
  const metrics = simulationMode
    ? {
        avg_cpu_percent: simulation.nodes.reduce((sum, n) => sum + n.cpu_percent, 0) / simulation.nodes.length,
        avg_memory_percent:
          simulation.nodes.reduce((sum, n) => sum + (n.memory_used_gb / n.memory_total_gb) * 100, 0) / simulation.nodes.length,
        avg_dsp_load_percent:
          simulation.nodes.filter(n => n.role === 'AUDIO-NODE').reduce((sum, n) => sum + n.dsp_load_percent, 0) /
            Math.max(1, simulation.nodes.filter(n => n.role === 'AUDIO-NODE').length) || 0,
        max_latency_ms: Math.max(...simulation.nodes.map(n => n.latency_ms)),
      }
    : clusterMetrics

  const stats = useMemo(() => {
    if (!clusterData && !simulationMode) return null

    const nodeValues = Array.isArray(clusterData) ? clusterData : Object.values(clusterData || {})

    const totalCpu = nodeValues.reduce((sum, n: any) => sum + (n.metadata?.cpu_cores || 1), 0)
    const totalMemory = nodeValues.reduce((sum, n: any) => sum + (n.metadata?.total_memory_gb || 8), 0)

    return {
      totalCpu,
      totalMemory,
      avgCpuUsage: metrics?.avg_cpu_percent || 0,
      avgMemoryUsage: metrics?.avg_memory_percent || 0,
      avgDspLoad: metrics?.avg_dsp_load_percent || 0,
      totalLatency: metrics?.max_latency_ms || 0,
      nodeCount: simulationMode ? simulation.nodes.length : clusterStatus?.total_count || 0,
      onlineCount: simulationMode ? simulation.nodes.filter(n => n.status === 'ONLINE').length : clusterStatus?.online_count || 0,
      healthScore: simulationMode
        ? (simulation.nodes.reduce((sum, n) => sum + n.health_score, 0) / simulation.nodes.length || 0)
        : clusterStatus?.aggregate_health_score || 0,
    }
  }, [clusterData, metrics, simulationMode, simulation, clusterStatus])

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
        <TopologyGraph nodes={nodesList || []} edges={[]} />
      </div>

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
