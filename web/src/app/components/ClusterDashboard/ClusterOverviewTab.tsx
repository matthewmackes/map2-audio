import { useQuery } from '@tanstack/react-query'
import { WarningAlt as WarningCircle, CheckmarkFilled as CheckCircle, Flash as Lightning, Activity as Cpu, DataBase as HardDrive, Wifi as WifiHigh } from '@carbon/icons-react'
import { useMemo } from 'react'
import { LegacyTile } from '../shared/LegacyTile'
import { LoadingState } from '../shared/LoadingState'

interface ClusterOverviewTabProps {
  simulationMode: boolean
}

export function ClusterOverviewTab({ simulationMode }: ClusterOverviewTabProps) {
  const { data: clusterStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/status')
      if (!res.ok) throw new Error('Failed to fetch cluster status')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const { data: deploymentMode } = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: async () => {
      const res = await fetch('/api/deployment/mode')
      if (!res.ok) throw new Error('Failed to fetch deployment mode')
      return res.json()
    },
  })

  const { data: runtimeProfile } = useQuery({
    queryKey: ['runtime-profiles', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/runtime-profiles/status')
      if (!res.ok) throw new Error('Failed to fetch runtime profile status')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const { data: clusterMetrics } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const stats = useMemo(() => {
    if (!clusterStatus || !clusterMetrics) return null

    const nodes = clusterStatus.all_nodes || {}
    const nodeValues = Object.values(nodes) as any[]

    const totalCpu = nodeValues.reduce((sum, n) => sum + (n.metadata?.cpu_cores || 0), 0)
    const totalMemory = nodeValues.reduce((sum, n) => sum + (n.metadata?.total_memory_gb || 0), 0)
    const avgCpuUsage = clusterMetrics.avg_cpu_percent || 0
    const avgMemoryUsage = clusterMetrics.avg_memory_percent || 0
    const avgDspLoad = clusterMetrics.avg_dsp_load_percent || 0
    const totalLatency = clusterMetrics.max_latency_ms || 0

    return {
      totalCpu,
      totalMemory,
      avgCpuUsage,
      avgMemoryUsage,
      avgDspLoad,
      totalLatency,
      nodeCount: clusterStatus.total_count,
      onlineCount: clusterStatus.online_count,
      healthScore: clusterStatus.aggregate_health_score || 0,
    }
  }, [clusterStatus, clusterMetrics])

  if (statusLoading || !stats) {
    return <LoadingState description="Loading cluster overview" />
  }

  const healthColor = stats.healthScore >= 80 ? '#00ff41' : stats.healthScore >= 60 ? '#ffaa00' : '#ff3333'

  return (
    <div className="cluster-overview-tab" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Health Summary Cards */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {/* Health Score */}
        <LegacyTile
          style={{
            background: `linear-gradient(155deg, rgba(0, 255, 65, 0.1), rgba(37, 99, 235, 0.1))`,
            borderColor: healthColor,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Cluster Health
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: healthColor, marginTop: 8 }}>
                {stats.healthScore.toFixed(0)}%
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: `rgba(37, 99, 235, 0.1)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {stats.healthScore >= 80 ? <CheckCircle size={20} style={{ color: healthColor }} /> : <WarningCircle size={20} style={{ color: healthColor }} />}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>
            {stats.onlineCount === stats.nodeCount ? 'All nodes healthy' : `${stats.nodeCount - stats.onlineCount} node(s) offline`}
          </div>
        </LegacyTile>

        {/* Nodes */}
        <LegacyTile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>Nodes</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb', marginTop: 8 }}>
                {stats.onlineCount}/{stats.nodeCount}
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WifiHigh size={20} style={{ color: '#2563eb' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>
            {stats.nodeCount === 1 ? 'Single node deployment' : `${stats.nodeCount} node cluster`}
          </div>
        </LegacyTile>

        {/* CPU */}
        <LegacyTile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Avg CPU
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#ffa726', marginTop: 8 }}>
                {stats.avgCpuUsage.toFixed(0)}%
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(255, 167, 38, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Cpu size={20} style={{ color: '#ffa726' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>{stats.totalCpu} cores available</div>
        </LegacyTile>

        {/* Memory */}
        <LegacyTile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Avg Memory
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6', marginTop: 8 }}>
                {stats.avgMemoryUsage.toFixed(0)}%
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HardDrive size={20} style={{ color: '#3b82f6' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>{stats.totalMemory} GB available</div>
        </LegacyTile>

        {/* DSP */}
        <LegacyTile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Audio DSP
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e', marginTop: 8 }}>
                {stats.avgDspLoad.toFixed(0)}%
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lightning size={20} style={{ color: '#22c55e' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>Cluster audio load</div>
        </LegacyTile>

        {/* Network Latency */}
        <LegacyTile>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#a0a0a0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Max Latency
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fbbf24', marginTop: 8 }}>
                {stats.totalLatency.toFixed(1)}ms
              </div>
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: 'rgba(251, 191, 36, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WifiHigh size={20} style={{ color: '#fbbf24' }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#a0a0a0' }}>Inter-node latency</div>
        </LegacyTile>
      </div>

      {/* Deployment Mode Info */}
      {deploymentMode && (
        <div
          style={{
            background: 'linear-gradient(155deg, #2d2d2d, #333333)',
            border: '2px solid #444',
            borderRadius: 12,
            padding: '20px',
          }}
        >
          <div style={{ fontSize: 12, color: '#a0a0a0', marginBottom: 8 }}>Deployment Mode</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#2563eb' }}>{deploymentMode.mode}</div>
          {runtimeProfile && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#e5e7eb', lineHeight: 1.6 }}>
              Runtime Profile: <strong>{runtimeProfile.current_profile}</strong>
              {' · '}
              Graph Policy: <strong>{runtimeProfile.profile_policy?.graph_mutation_policy ?? 'unknown'}</strong>
              {' · '}
              Residency: <strong>{runtimeProfile.profile_policy?.effect_residency_default ? 'on' : 'off'}</strong>
            </div>
          )}
          <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 12, lineHeight: 1.6 }}>
            {deploymentMode.mode === 'ALL-IN-ONE' &&
              'All services running on a single node. Multi-node deployments provide redundancy and load distribution.'}
            {deploymentMode.mode === 'AUDIO-NODE' &&
              'Dedicated audio processing node. Typically paired with a CONTROL-NODE for UI management.'}
            {deploymentMode.mode === 'CONTROL-NODE' &&
              'Management and UI node. Controls remote audio nodes via network API.'}
            {deploymentMode.mode === 'FRONTEND-ONLY' &&
              'Lightweight frontend node proxying to a remote backend cluster.'}
          </div>
        </div>
      )}

      {/* Simulation Mode Notice */}
      {simulationMode && (
        <div
          style={{
            background: 'rgba(255, 170, 0, 0.1)',
            border: '2px solid #ffaa00',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 13,
            color: '#ffaa00',
          }}
        >
          <strong>🎯 Simulation Mode Active:</strong> Showing example 5-node cluster configuration. This is for demonstration
          only.
        </div>
      )}
    </div>
  )
}
