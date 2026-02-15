import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material'
import { TopologyGraph } from './TopologyGraph'
import { normalizeClusterNodes, normalizeClusterMetrics, summarizeClusterMetrics } from './clusterData'

function formatLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 'N/A'
  return `${latencyMs.toFixed(1)} ms`
}

export function AVBNetworkTab() {
  const { data: nodesPayload, isLoading: isNodesLoading, error: nodesError } = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/nodes')
      if (!res.ok) throw new Error('Failed to fetch cluster nodes')
      return res.json()
    },
    refetchInterval: 5000,
  })

  const { data: metricsPayload } = useQuery({
    queryKey: ['cluster', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/metrics')
      if (!res.ok) throw new Error('Failed to fetch cluster metrics')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const nodes = useMemo(() => normalizeClusterNodes(nodesPayload), [nodesPayload])
  const metrics = useMemo(() => normalizeClusterMetrics(metricsPayload), [metricsPayload])
  const metricSummary = useMemo(
    () => summarizeClusterMetrics(metricsPayload, metrics),
    [metricsPayload, metrics]
  )

  const latestMetricsByNode = useMemo(() => {
    const latest = new Map<string, (typeof metrics)[number]>()
    metrics.forEach(sample => {
      const current = latest.get(sample.nodeId)
      if (!current || sample.timestampMs > current.timestampMs) {
        latest.set(sample.nodeId, sample)
      }
    })
    return latest
  }, [metrics])

  const topologyNodes = useMemo(
    () =>
      nodes.map(node => {
        const latest = latestMetricsByNode.get(node.nodeId)
        const memoryTotal = node.totalMemoryGb || 0
        const memoryUsed = latest ? (latest.memoryPercent / 100) * memoryTotal : 0
        return {
          node_id: node.nodeId,
          hostname: node.hostname,
          role: node.role,
          status: node.status,
          health_score: node.healthScore,
          cpu_percent: latest?.cpuPercent ?? 0,
          memory_used_gb: memoryUsed,
          memory_total_gb: memoryTotal,
          latency_ms: latest?.latencyMs ?? 0,
        }
      }),
    [nodes, latestMetricsByNode]
  )

  const totalNodes = nodes.length
  const onlineNodes = nodes.filter(node => node.status === 'ONLINE').length
  const degradedNodes = nodes.filter(node => node.status === 'DEGRADED').length
  const offlineNodes = nodes.filter(node => node.status === 'OFFLINE').length
  const avbReadyNodes = nodes.filter(
    node =>
      (node.role.includes('AUDIO') || node.role.includes('MANAGEMENT') || node.role.includes('CONTROL')) &&
      node.status === 'ONLINE'
  ).length

  return (
    <Box sx={{ maxWidth: '1600px', mx: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Paper
        sx={{
          p: 4,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)',
          color: '#fff',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 28, mb: 1 }}>
          AVB/TSN Network Audio
        </Typography>
        <Typography sx={{ fontSize: 14, opacity: 0.92 }}>
          Live cluster network view using current node status and telemetry from `/api/cluster/nodes` and `/api/cluster/metrics`.
        </Typography>
      </Paper>

      {nodesError && (
        <Paper sx={{ p: 2, border: '1px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.08)' }}>
          <Typography sx={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>Failed to load cluster node data</Typography>
          <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 0.5 }}>
            Ensure `/api/cluster/nodes` is reachable and returning data.
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          Network Summary
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #3b82f6' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Total Nodes</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>{totalNodes}</Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #10b981' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Online</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#047857' }}>{onlineNodes}</Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #f59e0b' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Degraded</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#b45309' }}>{degradedNodes}</Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #ef4444' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Offline</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#b91c1c' }}>{offlineNodes}</Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #6366f1' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>AVB-Ready Nodes</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#4338ca' }}>{avbReadyNodes}</Typography>
          </Box>
          <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', borderLeft: '4px solid #0ea5e9' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Max Latency</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#0369a1' }}>
              {metricSummary.maxLatencyMs.toFixed(1)} ms
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          Live Topology
        </Typography>
        {isNodesLoading ? (
          <Box sx={{ p: 2 }}>
            <LinearProgress />
            <Typography sx={{ fontSize: 12, color: '#64748b', mt: 1 }}>Loading topology...</Typography>
          </Box>
        ) : (
          <TopologyGraph nodes={topologyNodes} edges={[]} />
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          Node Network Status
        </Typography>
        {nodes.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>No nodes are currently registered.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Node</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Health</TableCell>
                  <TableCell align="right">Latency</TableCell>
                  <TableCell align="right">CPU</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nodes.map(node => {
                  const latest = latestMetricsByNode.get(node.nodeId)
                  return (
                    <TableRow key={node.nodeId}>
                      <TableCell>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{node.hostname}</Typography>
                        <Typography sx={{ fontSize: 11, color: '#6b7280' }}>{node.nodeId}</Typography>
                      </TableCell>
                      <TableCell>{node.role}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={node.status}
                          color={
                            node.status === 'ONLINE'
                              ? 'success'
                              : node.status === 'DEGRADED'
                                ? 'warning'
                                : 'default'
                          }
                          variant={node.status === 'OFFLINE' ? 'outlined' : 'filled'}
                        />
                      </TableCell>
                      <TableCell align="right">{node.healthScore.toFixed(1)}%</TableCell>
                      <TableCell align="right">{formatLatency(latest?.latencyMs ?? 0)}</TableCell>
                      <TableCell align="right">
                        {latest ? `${latest.cpuPercent.toFixed(1)}%` : 'N/A'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid #dbeafe', backgroundColor: '#f8fbff' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1, color: '#1d4ed8' }}>
          Operational Notes
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
          This view is now live and data-backed. For full AVB validation (gPTP lock state, AVTP stream counters, and AVDECC entity discovery), backend endpoints for those metrics still need to be surfaced and wired into this tab.
        </Typography>
      </Paper>
    </Box>
  )
}
