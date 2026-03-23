import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import {
  Box,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  Stack,
  Divider,
  Alert,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import { TopologyGraph } from './TopologyGraph'
import {
  normalizeClusterNodes,
  normalizeClusterMetrics,
  summarizeClusterMetrics,
} from './clusterData'
import { useAVBStatus, useAVBStreams, useAVBDiscovery, usePTPStatus, useTsnStatus, useAvbRealtimeSync } from '../../hooks/useAvbStatus'
import { useAvbDevices, useAvdeccEntities, useAvdeccStats } from '../AvbRouting/hooks/useAvbApi'
import './AVBNetworkTab.css'

type UnknownRecord = Record<string, unknown>

function formatNumber(value: unknown, fallback = 0): number {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? next : fallback
}

function formatInteger(value: unknown, fallback = 0): number {
  return Math.max(0, Math.round(formatNumber(value, fallback)))
}

function formatLatency(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 'N/A'
  return `${latencyMs.toFixed(1)} ms`
}

function formatBoolStatus(value: unknown, label = { trueLabel: 'Yes', falseLabel: 'No' }) {
  return value ? label.trueLabel : label.falseLabel
}

function toRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as UnknownRecord
}

function isPtpLocked(ptp: unknown): boolean {
  const payload = toRecord(ptp)
  if (typeof payload.locked === 'boolean') {
    return payload.locked
  }
  return ['locked', 'synced', 'master', 'slave'].includes(
    toStringValue(payload.state).toLowerCase()
  )
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return fallback
}

function stateColor(status: string) {
  if (status === 'running' || status === 'synced' || status === 'master' || status === 'slave') {
    return 'success'
  }
  if (status === 'error' || status === 'warning') {
    return 'error'
  }
  return 'warning'
}

function streamStateTagType(status: string): 'green' | 'red' | 'warm-gray' {
  if (status === 'running' || status === 'synced' || status === 'master' || status === 'slave') {
    return 'green'
  }
  if (status === 'error' || status === 'warning') {
    return 'red'
  }
  return 'warm-gray'
}

function nodeStatusTagType(status: string): 'green' | 'red' | 'warm-gray' {
  if (status === 'ONLINE') {
    return 'green'
  }
  if (status === 'OFFLINE') {
    return 'red'
  }
  return 'warm-gray'
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

  const { data: avbStatus, error: avbStatusError } = useAVBStatus()
  const avbRuntimeEnabled = avbStatus?.enabled === true
  const avbRuntimeAvailable = avbStatus?.available === true
  useAvbRealtimeSync(avbRuntimeEnabled)

  const { data: avbStreamsPayload } = useAVBStreams(avbRuntimeEnabled)
  const { data: avbDiscoveryPayload } = useAVBDiscovery(avbRuntimeEnabled)
  const { data: ptpPayload } = usePTPStatus(avbRuntimeEnabled)
  const { data: tsnPayload } = useTsnStatus(avbRuntimeEnabled)
  const { data: avbDevicesPayload } = useAvbDevices()
  const { data: avdeccEntitiesPayload } = useAvdeccEntities()
  const { data: avdeccStatsPayload } = useAvdeccStats()

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

  const streams = avbStreamsPayload?.streams ?? []
  const discoveredNodes = avbDiscoveryPayload?.nodes ?? []
  const avdeccEntities = avdeccEntitiesPayload?.entities ?? []
  const discoveredAvbDevices = avbDevicesPayload?.discovered_devices ?? []

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

  const runningStreams = streams.filter(stream => stream.state === 'running').length
  const readyStreams = streams.filter(stream => stream.health?.ready).length
  const ptpLockedStreams = streams.filter(stream => isPtpLocked(stream.health?.ptp)).length
  const tsnConformedStreams = streams.filter(stream => {
    const tsn = stream.health?.tsn
    return Boolean(tsn?.available && tsn?.mqprio_configured && tsn?.cbs_configured && tsn?.etf_configured && tsn?.vlan_configured)
  }).length

  const avbStreamErrors = streams.filter(stream => stream.state === 'error' || Boolean(stream.error)).length

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
          Live cluster telemetry plus AVB/TSN stack status from `/api/cluster/*` and `/api/avb/*` endpoints.
        </Typography>
      </Paper>

      {(nodesError || avbStatusError) && (
        <Paper sx={{ p: 2, border: '1px solid #ef4444', backgroundColor: 'rgba(239,68,68,0.08)' }}>
          <Typography sx={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>Failed to load service data</Typography>
          <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 0.5 }}>
            {nodesError ? 'Cluster node endpoint is unavailable.' : 'AVB status endpoint is unavailable.'}
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          Cluster Network Summary
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
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 1, color: '#374151' }}>
          AVB Runtime State
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#64748b', mb: 2 }}>
          Overall AVB enablement, gPTP sync status, TSN setup checks, and discovered devices.
        </Typography>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ mb: 2 }} useFlexGap>
          <Box sx={{ flex: 1, minWidth: 220, p: 2, backgroundColor: '#f8fafc', borderRadius: 2, borderLeft: '4px solid #0f766e' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Enabled / Available</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: avbRuntimeEnabled ? '#0f766e' : '#b91c1c' }}>
              {avbRuntimeEnabled ? 'Enabled' : 'Disabled'} / {avbRuntimeAvailable ? 'Available' : 'Unavailable'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#334155' }}>
              Interface: {avbStatus?.interface || 'Not configured'}
            </Typography>
            {avbStatus?.reason && (
              <Typography sx={{ fontSize: 11, color: '#d97706', mt: 0.5 }}>
                {avbStatus.reason}
              </Typography>
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 220, p: 2, backgroundColor: '#f8fafc', borderRadius: 2, borderLeft: '4px solid #2563eb' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>PTP / gPTP</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>
              {ptpPayload?.state || 'unknown'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#334155' }}>
              Offset: {formatLatency(formatNumber(ptpPayload?.offset_ns))}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#334155', mt: 0.5 }}>
              Mean delay: {formatLatency(formatNumber(ptpPayload?.mean_path_delay_ns))}
            </Typography>
            {!ptpPayload?.available && ptpPayload?.error && (
              <Typography sx={{ fontSize: 11, color: '#b91c1c', mt: 0.5 }}>{ptpPayload.error}</Typography>
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 220, p: 2, backgroundColor: '#f8fafc', borderRadius: 2, borderLeft: '4px solid #4f46e5' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>TSN Status</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#4f46e5' }}>
              {tsnPayload?.available ? 'Configured' : 'Not configured'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#334155' }}>
              Interface: {toStringValue(tsnPayload?.interface, 'unknown')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap>
              <Chip size="small" color={tsnPayload?.mqprio_configured ? 'success' : 'default'} label={`MQPRIO ${formatBoolStatus(tsnPayload?.mqprio_configured)}`} />
              <Chip size="small" color={tsnPayload?.cbs_configured ? 'success' : 'default'} label={`CBS ${formatBoolStatus(tsnPayload?.cbs_configured)}`} />
            </Stack>
          </Box>
          <Box sx={{ flex: 1, minWidth: 220, p: 2, backgroundColor: '#f8fafc', borderRadius: 2, borderLeft: '4px solid #9333ea' }}>
            <Typography sx={{ fontSize: 11, color: '#64748b' }}>Streams</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#7e22ce' }}>
              {streams.length} total, {runningStreams} running
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#334155' }}>
              Ready: {readyStreams}, Transport-ready: {tsnConformedStreams}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#334155', mt: 0.5 }}>
              PTP-locked: {ptpLockedStreams} · Error: {avbStreamErrors}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ my: 2 }} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap>
          <Box sx={{ flex: 1, minWidth: 250, p: 2, backgroundColor: '#f0f9ff', borderRadius: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#0c4a6e', mb: 1 }}>
              Device Inventory
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              JUCE-selectable names: {avbDevicesPayload?.count || 0}
            </Typography>
            <List dense sx={{ mt: 1 }}>
              {(avbDevicesPayload?.device_names || ['No JUCE names']).slice(0, 3).map(device => (
                <ListItem key={device} sx={{ px: 0 }}>
                  <ListItemText
                    primary={device}
                    sx={{ '& .MuiListItemText-primary': { fontSize: 12 } }}
                  />
                </ListItem>
              ))}
            </List>
            <Typography sx={{ fontSize: 11, color: '#475569' }}>
              Discovered cache devices: {avbDevicesPayload?.discovered_count || 0}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 250, p: 2, backgroundColor: '#f0fdf4', borderRadius: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#14532d', mb: 1 }}>
              AVDECC
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Enabled: {formatBoolStatus(avdeccEntitiesPayload?.enabled)}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Entities: {avdeccEntitiesPayload?.entities.length || 0}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Active Connections: {formatInteger(avdeccStatsPayload?.connections_active)}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Discovered: {formatInteger(avdeccStatsPayload?.entities_discovered)}
            </Typography>
            {avdeccStatsPayload?.error && (
              <Alert severity="warning" sx={{ mt: 1 }} variant="outlined">
                {avdeccStatsPayload.error}
              </Alert>
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 250, p: 2, backgroundColor: '#fff7ed', borderRadius: 2 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#92400e', mb: 1 }}>
              Discovery
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              AVB Nodes: {discoveredNodes.length}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Talker Nodes: {formatInteger(avbDiscoveryPayload?.talker_nodes)}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Listener Nodes: {formatInteger(avbDiscoveryPayload?.listener_nodes)}
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Total Discovered: {formatInteger(avbDiscoveryPayload?.total_discovered)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          AVB Streams
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Chip
            size="small"
            color={stateColor(avbStreamsPayload?.available ? 'running' : 'error') as 'success' | 'warning' | 'error'}
            label={avbStreamsPayload?.available ? 'Stream API Ready' : 'Stream API Not Available'}
          />
          {avbStreamErrors > 0 ? (
            <Chip size="small" color="error" label={`${avbStreamErrors} stream errors`} />
          ) : (
            <Chip size="small" color="success" label="No stream errors"/>
          )}
        </Stack>
        {streams.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: '#6b7280' }}>
            No active AVB streams detected for this node.
          </Typography>
        ) : (
          <TableContainer className="avb-network-tab__table-container">
            <Table size="sm" className="avb-network-tab__table">
              <TableHead>
                <TableRow>
                  <TableHeader>Stream</TableHeader>
                  <TableHeader className="avb-network-tab__cell--center">Direction</TableHeader>
                  <TableHeader className="avb-network-tab__cell--center">State</TableHeader>
                  <TableHeader className="avb-network-tab__cell--right">Cfg</TableHeader>
                  <TableHeader className="avb-network-tab__cell--right">Frames sent</TableHeader>
                  <TableHeader className="avb-network-tab__cell--right">Errors</TableHeader>
                  <TableHeader>Readiness</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {streams.map(stream => {
                  const cfg = toRecord(stream.config)
                  const stats = toRecord(stream.stats)
                  const health = toRecord(stream.health)
                  const healthIssues = Array.isArray(health.issues) ? health.issues.length : 0
                  const ptpHealth = toRecord(health.ptp)
                  const tsnHealth = toRecord(health.tsn)
                  const streamPtpLocked = isPtpLocked(ptpHealth)
                  const frameErrors = formatInteger(stats.frames_sent) + formatInteger(stats.receive_errors)

                  return (
                    <TableRow key={stream.stream_id}>
                      <TableCell>
                        <div className="avb-network-tab__cell-primary">{stream.stream_id}</div>
                        <div className="avb-network-tab__cell-secondary">
                          {toStringValue(cfg.interface || stream.interface, 'unknown interface')}
                        </div>
                      </TableCell>
                      <TableCell className="avb-network-tab__cell--center">{stream.direction}</TableCell>
                      <TableCell className="avb-network-tab__cell--center">
                        <Tag type={streamStateTagType(stream.state)}>{stream.state}</Tag>
                      </TableCell>
                      <TableCell className="avb-network-tab__cell--right">
                        {formatInteger(cfg.channels || stream.channels)}ch @{' '}
                        {formatInteger(cfg.sample_rate || stream.sample_rate, 48000)} Hz
                      </TableCell>
                      <TableCell className="avb-network-tab__cell--right">
                        {formatInteger(stats.frames_sent)} / {formatInteger(stats.frames_received)}
                      </TableCell>
                      <TableCell className={`avb-network-tab__cell--right ${frameErrors > 0 ? 'is-error' : 'is-ok'}`}>
                        {frameErrors}
                      </TableCell>
                      <TableCell>
                        <div className="avb-network-tab__tag-list">
                          <Tag type={health.ready ? 'green' : 'warm-gray'}>{formatBoolStatus(health.ready)}</Tag>
                          {(healthIssues > 0 || ptpHealth.locked !== undefined || typeof ptpHealth.state === 'string') && (
                            <Tag type={streamPtpLocked ? 'green' : 'warm-gray'}>
                              {`PTP ${formatBoolStatus(streamPtpLocked, { trueLabel: 'Locked', falseLabel: 'Unlocked' })}`}
                            </Tag>
                          )}
                          {(healthIssues > 0 || tsnHealth.available !== undefined || tsnHealth.interface !== undefined) && (
                            <Tag type={tsnHealth.available ? 'green' : 'warm-gray'}>
                              {`TSN ${formatBoolStatus(tsnHealth.available)}`}
                            </Tag>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 18, mb: 2, color: '#374151' }}>
          Topology & Node Health
        </Typography>
        {isNodesLoading ? (
          <Box sx={{ p: 2 }}>
            <LinearProgress />
            <Typography sx={{ fontSize: 12, color: '#64748b', mt: 1 }}>Loading topology...</Typography>
          </Box>
        ) : (
          <TopologyGraph nodes={topologyNodes} edges={[]} />
        )}

        <Divider sx={{ my: 2 }} />
        <TableContainer className="avb-network-tab__table-container">
          <Table size="sm" className="avb-network-tab__table">
            <TableHead>
              <TableRow>
                <TableHeader>Node</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="avb-network-tab__cell--right">Health</TableHeader>
                <TableHeader className="avb-network-tab__cell--right">Latency</TableHeader>
                <TableHeader className="avb-network-tab__cell--right">CPU</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {nodes.map(node => {
                const latest = latestMetricsByNode.get(node.nodeId)
                return (
                  <TableRow key={node.nodeId}>
                    <TableCell>
                      <div className="avb-network-tab__cell-primary">{node.hostname}</div>
                      <div className="avb-network-tab__cell-secondary">{node.nodeId}</div>
                    </TableCell>
                    <TableCell>{node.role}</TableCell>
                    <TableCell>
                      <Tag type={nodeStatusTagType(node.status)}>{node.status}</Tag>
                    </TableCell>
                    <TableCell className="avb-network-tab__cell--right">{node.healthScore.toFixed(1)}%</TableCell>
                    <TableCell className="avb-network-tab__cell--right">{formatLatency(latest?.latencyMs ?? 0)}</TableCell>
                    <TableCell className="avb-network-tab__cell--right">
                      {latest ? `${latest.cpuPercent.toFixed(1)}%` : 'N/A'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 3, border: '1px solid #dbeafe', backgroundColor: '#f8fbff' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 1, color: '#1d4ed8' }}>
          AVDECC / AVB Discovery Details
        </Typography>
        {avdeccEntities.length === 0 && discoveredNodes.length === 0 && discoveredAvbDevices.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            Discovery is active but no AVDECC entities or discovered AVB cache entries are currently exposed to the dashboard.
          </Typography>
        ) : (
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} useFlexGap>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#334155', mb: 1 }}>AVB Devices (engine cache)</Typography>
              <List dense>
                {discoveredAvbDevices.slice(0, 4).map(device => (
                  <ListItem key={device.endpoint_id} disablePadding>
                    <ListItemText
                      primary={device.device_name}
                      secondary={`${device.direction} · ${device.device_type} · ${device.channels}ch @ ${device.sample_rate} Hz`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#334155', mb: 1 }}>AVDECC Entities</Typography>
              <List dense>
                {avdeccEntities.slice(0, 4).map(entity => (
                  <ListItem key={entity.entity_id} disablePadding>
                    <ListItemText
                      primary={entity.entity_name || entity.entity_id}
                      secondary={`Talker: ${entity.capabilities.talker_streams}, Listener: ${entity.capabilities.listener_streams} · ${formatBoolStatus(entity.available)}`}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 13, color: '#334155', mb: 1 }}>Protocol Stats</Typography>
              <List dense>
                <ListItem disablePadding>
                  <ListItemText
                    primary="AVDECC ADP"
                    secondary={`${formatInteger(avdeccStatsPayload?.adp?.messages_sent)} / ${formatInteger(avdeccStatsPayload?.adp?.messages_received)}`}
                  />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemText
                    primary="AVDECC ACMP"
                    secondary={`${formatInteger(avdeccStatsPayload?.acmp?.messages_sent)} / ${formatInteger(avdeccStatsPayload?.acmp?.messages_received)}`}
                  />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemText
                    primary="AVDECC AECP"
                    secondary={`${formatInteger(avdeccStatsPayload?.aecp?.messages_sent)} / ${formatInteger(avdeccStatsPayload?.aecp?.messages_received)}`}
                  />
                </ListItem>
              </List>
            </Box>
          </Stack>
        )}
      </Paper>
    </Box>
  )
}
