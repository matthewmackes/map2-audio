/**
 * Multi-Node Monitoring Tab - Comprehensive per-node service monitoring
 *
 * Displays detailed breakdowns for each node in the cluster including:
 * - JUCE Audio Engine status (sample rate, buffer, xruns, CPU load)
 * - Cluster Services (mDNS, RAFT, Health Monitor, Config Distributor, Event Producer)
 * - AVB/TSN Network (PTP sync, streams, entities)
 * - System Resources (CPU, memory, temperature, disk)
 */

import { useMemo } from 'react'
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
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Tooltip,
  Divider,
} from '@mui/material'
import { useMultiSystemMonitoring } from '@/app/hooks/useMultiSystemMonitoring'
import './MultiNodeMonitoringTab.css'

export function MultiNodeMonitoringTab() {
  const { systems, getComparisons, getStats, getSystemsRankedBy } = useMultiSystemMonitoring()

  const stats = useMemo(() => getStats(), [getStats])
  const comparisons = useMemo(() => getComparisons(), [getComparisons])
  const rankedByCpu = useMemo(() => getSystemsRankedBy('cpu'), [getSystemsRankedBy])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#10b981'
      case 'offline':
        return '#6b7280'
      case 'error':
        return '#ef4444'
      default:
        return '#9ca3af'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return '✅'
      case 'offline':
        return '⏸️'
      case 'error':
        return '❌'
      default:
        return '❓'
    }
  }

  const getRaftRoleColor = (role?: string) => {
    switch (role) {
      case 'leader':
        return '#10b981'
      case 'follower':
        return '#60a5fa'
      case 'candidate':
        return '#f59e0b'
      default:
        return '#6b7280'
    }
  }

  const renderServiceStatus = (enabled: boolean, status?: string) => {
    if (!enabled) return <Chip label="DISABLED" size="small" sx={{ backgroundColor: '#6b7280', color: '#fff' }} />

    const color = status === 'active' ? '#10b981' : status === 'error' ? '#ef4444' : '#f59e0b'
    const icon = status === 'active' ? '✓' : status === 'error' ? '✗' : '⚠'

    return <Chip icon={<span>{icon}</span>} label={status?.toUpperCase()} size="small" sx={{ backgroundColor: color, color: '#fff' }} />
  }

  if (systems.length === 0) {
    return (
      <Box sx={{ maxWidth: '1400px', mx: 'auto', p: 3 }}>
        <Paper sx={{ p: 6, textAlign: 'center', color: '#9ca3af', backgroundColor: '#f9fafb' }}>
          <Typography sx={{ fontSize: 24, fontWeight: 600, mb: 3, color: '#374151' }}>
            🖥️ Multi-Node Monitoring
          </Typography>
          <Typography sx={{ fontSize: 16, mb: 2 }}>
            No nodes are currently being monitored
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#6b7280', maxWidth: '600px', mx: 'auto' }}>
            This tab provides comprehensive monitoring for MAP2 Audio Platform cluster nodes.
            Nodes will appear here automatically as they come online and begin reporting telemetry.
          </Typography>
        </Paper>
      </Box>
    )
  }

  return (
    <Box
      className="cluster-monitoring-page"
      sx={{ maxWidth: '1600px', mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}
    >
      {/* Cluster-Wide Statistics */}
      <Paper sx={{ p: 3, backgroundColor: '#f9fafb' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 3, color: '#374151' }}>
          📊 Cluster-Wide Statistics
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Total MAP2 nodes in the cluster">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #3b82f6' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>Total Systems</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>
                  {stats.totalSystems}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Nodes currently connected and responding">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #10b981' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>Online</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>
                  {stats.onlineSystems}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Average CPU usage across all nodes">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #60a5fa' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>Avg CPU</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#60a5fa' }}>
                  {stats.avgCpuUsage}%
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Average JUCE audio engine CPU load">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #8b5cf6' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>Avg Audio CPU</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#8b5cf6' }}>
                  {stats.avgAudioCpuLoad}%
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Total audio xruns (buffer underruns) across all nodes">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #ef4444' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>Total Xruns</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>
                  {stats.totalXruns}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Nodes with AVB/TSN network audio enabled">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #6366f1' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>AVB Nodes</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#6366f1' }}>
                  {stats.avbNodesActive}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Nodes synchronized via IEEE 802.1AS gPTP">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #10b981' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>PTP Synced</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>
                  {stats.ptpSyncedNodes}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
          <Grid item xs={6} sm={4} md={3}>
            <Tooltip title="Total IEEE 1722 AVB audio streams (talker + listener)">
              <Box sx={{ p: 2, backgroundColor: '#fff', borderRadius: 2, borderLeft: '4px solid #f59e0b' }}>
                <Typography sx={{ fontSize: 12, color: '#6b7280', mb: 0.5 }}>AVB Streams</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>
                  {stats.totalAvbStreams}
                </Typography>
              </Box>
            </Tooltip>
          </Grid>
        </Grid>
      </Paper>

      {/* Detailed System Cards */}
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 2, color: '#374151' }}>
          🖥️ Node Details
        </Typography>
        <Grid container spacing={3}>
          {systems.map((system) => (
            <Grid item xs={12} lg={6} key={system.systemId}>
              <Card sx={{ height: '100%', borderTop: `4px solid ${getStatusColor(system.status)}` }}>
                <CardContent>
                  {/* System Header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 18, color: '#374151' }}>
                      {system.systemName}
                    </Typography>
                    <Chip
                      icon={<span>{getStatusIcon(system.status)}</span>}
                      label={system.status.toUpperCase()}
                      size="small"
                      sx={{
                        backgroundColor: getStatusColor(system.status),
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    />
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* Audio Engine Section */}
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5, color: '#6366f1' }}>
                      🎵 JUCE Audio Engine
                    </Typography>
                    {system.audioEngine ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Status</Typography>
                          <Chip
                            label={system.audioEngine.isRunning ? 'RUNNING' : 'STOPPED'}
                            size="small"
                            sx={{
                              backgroundColor: system.audioEngine.isRunning ? '#10b981' : '#6b7280',
                              color: '#fff',
                              fontSize: 11,
                            }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Device</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.audioEngine.deviceName} ({system.audioEngine.deviceType})
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Sample Rate / Buffer</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.audioEngine.sampleRate} Hz / {system.audioEngine.bufferSize} samples
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Channels (In/Out)</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.audioEngine.inputChannels} / {system.audioEngine.outputChannels}
                          </Typography>
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Audio CPU Load</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                              {system.audioEngine.cpuLoad.toFixed(1)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(100, system.audioEngine.cpuLoad)}
                            sx={{
                              backgroundColor: '#e5e7eb',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: system.audioEngine.cpuLoad > 80 ? '#ef4444' : '#8b5cf6',
                              },
                            }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Xruns</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: system.audioEngine.xrunCount > 0 ? '#ef4444' : '#10b981' }}>
                            {system.audioEngine.xrunCount}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                        Audio engine data unavailable
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* Cluster Services Section */}
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5, color: '#f59e0b' }}>
                      🔗 Cluster Services
                    </Typography>
                    {system.clusterServices ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="Multicast DNS service discovery for automatic node detection">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>mDNS Discovery</Typography>
                          </Tooltip>
                          {renderServiceStatus(system.clusterServices.mdnsDiscovery.enabled, system.clusterServices.mdnsDiscovery.status)}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="RAFT consensus protocol for distributed state management">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>RAFT Consensus</Typography>
                          </Tooltip>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {renderServiceStatus(system.clusterServices.raftConsensus.enabled,
                              system.clusterServices.raftConsensus.role !== 'offline' ? 'active' : 'inactive')}
                            {system.clusterServices.raftConsensus.enabled && (
                              <Chip
                                label={system.clusterServices.raftConsensus.role.toUpperCase()}
                                size="small"
                                sx={{
                                  backgroundColor: getRaftRoleColor(system.clusterServices.raftConsensus.role),
                                  color: '#fff',
                                  fontSize: 10,
                                }}
                              />
                            )}
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="Real-time health monitoring and alerting">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Health Monitor</Typography>
                          </Tooltip>
                          {renderServiceStatus(system.clusterServices.healthMonitor.enabled, system.clusterServices.healthMonitor.status)}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="Configuration distribution across cluster nodes">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Config Distributor</Typography>
                          </Tooltip>
                          {renderServiceStatus(system.clusterServices.configDistributor.enabled, system.clusterServices.configDistributor.status)}
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="Event producer for telemetry and monitoring">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Event Producer</Typography>
                          </Tooltip>
                          {renderServiceStatus(system.clusterServices.eventProducer.enabled, system.clusterServices.eventProducer.status)}
                        </Box>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                        Cluster services data unavailable
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* AVB/TSN Network Section */}
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5, color: '#6366f1' }}>
                      🌐 AVB/TSN Network Audio
                    </Typography>
                    {system.avbNetwork && system.avbNetwork.enabled ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tooltip title="IEEE 802.1AS gPTP synchronization status">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>PTP Sync</Typography>
                          </Tooltip>
                          <Chip
                            icon={<span>{system.avbNetwork.ptpSynced ? '✓' : '✗'}</span>}
                            label={system.avbNetwork.ptpSynced ? 'SYNCED' : 'NOT SYNCED'}
                            size="small"
                            sx={{
                              backgroundColor: system.avbNetwork.ptpSynced ? '#10b981' : '#ef4444',
                              color: '#fff',
                              fontSize: 11,
                            }}
                          />
                        </Box>
                        {system.avbNetwork.ptpSynced && (
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>PTP Offset</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                              {system.avbNetwork.ptpOffsetNs} ns
                            </Typography>
                          </Box>
                        )}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Tooltip title="AVDECC entities discovered via IEEE 1722.1">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Discovered Entities</Typography>
                          </Tooltip>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.avbNetwork.discoveredEntities}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Tooltip title="IEEE 1722 AVTP audio streams (talker/listener)">
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Active Streams</Typography>
                          </Tooltip>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.avbNetwork.activeStreams.talker} TX / {system.avbNetwork.activeStreams.listener} RX
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Interface</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.avbNetwork.interfaceName} ({system.avbNetwork.linkSpeed})
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                        AVB/TSN not enabled on this node
                      </Typography>
                    )}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* System Resources */}
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5, color: '#3b82f6' }}>
                      💻 System Resources
                    </Typography>
                    {system.health && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>CPU</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                              {system.health.cpu_usage_percent.toFixed(1)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={system.health.cpu_usage_percent}
                            sx={{
                              backgroundColor: '#e5e7eb',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: '#60a5fa',
                              },
                            }}
                          />
                        </Box>

                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Memory</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                              {system.health.memory_usage_percent.toFixed(1)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={system.health.memory_usage_percent}
                            sx={{
                              backgroundColor: '#e5e7eb',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: '#60a5fa',
                              },
                            }}
                          />
                        </Box>

                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Temperature</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                              {system.health.cpu_temp_celsius.toFixed(1)}°C
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(
                              100,
                              (system.health.cpu_temp_celsius / 95) * 100
                            )}
                            sx={{
                              backgroundColor: '#e5e7eb',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: '#3b82f6',
                              },
                            }}
                          />
                        </Box>
                      </Box>
                    )}

                    {system.disk && (
                      <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: 12, color: '#6b7280' }}>Disk</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                            {system.disk.use_percent.toFixed(1)}%
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={system.disk.use_percent}
                          sx={{
                            backgroundColor: '#e5e7eb',
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: '#f59e0b',
                            },
                          }}
                        />
                      </Box>
                    )}
                  </Box>

                  <Typography sx={{ fontSize: 11, color: '#9ca3af', mt: 2, pt: 2, borderTop: '1px solid #e5e7eb' }}>
                    Last update: {new Date(system.lastUpdate).toLocaleString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Comparison Tables */}
      {comparisons.length > 0 && (
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 2, color: '#374151' }}>
            📊 Metric Comparisons
          </Typography>
          <Grid container spacing={2}>
            {comparisons.map((comparison) => (
              <Grid item xs={12} md={6} key={comparison.metric}>
                <Box className="cluster-grid-scroll-wrap">
                  <Paper>
                    <TableContainer>
                      <Table size="sm" className="cluster-grid-table multi-node-monitoring-tab__comparison-table">
                        <TableHead>
                          <TableRow>
                            <TableHeader className="multi-node-monitoring-tab__table-header">System</TableHeader>
                            <TableHeader className="multi-node-monitoring-tab__table-header multi-node-monitoring-tab__cell--right">
                              {comparison.metric} ({comparison.unit})
                            </TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(comparison.values)
                            .sort(([, a], [, b]) => b - a)
                            .map(([systemId, value], index) => {
                              const system = systems.find((s) => s.systemId === systemId)
                              const isHighest = systemId === comparison.highest.systemId
                              const isLowest = systemId === comparison.lowest.systemId

                              return (
                                <TableRow
                                  key={systemId}
                                  className={
                                    isHighest
                                      ? 'multi-node-monitoring-tab__comparison-row is-highest'
                                      : isLowest
                                        ? 'multi-node-monitoring-tab__comparison-row is-lowest'
                                        : 'multi-node-monitoring-tab__comparison-row'
                                  }
                                >
                                  <TableCell className="multi-node-monitoring-tab__system-cell">
                                    {index + 1}. {system?.systemName || systemId}
                                  </TableCell>
                                  <TableCell className="multi-node-monitoring-tab__cell--right multi-node-monitoring-tab__value-cell">
                                    <span>{value.toFixed(1)}</span>
                                    {isHighest && (
                                      <Tag size="sm" type="red">
                                        High
                                      </Tag>
                                    )}
                                    {isLowest && (
                                      <Tag size="sm" type="green">
                                        Low
                                      </Tag>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          <TableRow className="multi-node-monitoring-tab__comparison-row is-average">
                            <TableCell className="multi-node-monitoring-tab__system-cell">Average</TableCell>
                            <TableCell className="multi-node-monitoring-tab__cell--right multi-node-monitoring-tab__average-cell">
                              {comparison.average.toFixed(1)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                  <Box className="cluster-grid-scroll-hint" aria-hidden="true" />
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Top Performers */}
      {rankedByCpu.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 2, color: '#374151' }}>
            🏆 Performance Rankings (by CPU Usage)
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rankedByCpu.slice(0, 5).map((system, index) => (
              <Box
                key={system.systemId}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.5,
                  backgroundColor: index === 0 ? '#fef3c7' : '#f9fafb',
                  borderRadius: 1,
                  borderLeft: `4px solid ${['#fbbf24', '#d1d5db', '#cd7f32', '#9ca3af', '#9ca3af'][index]}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 18, minWidth: 30 }}>
                    #{index + 1}
                  </Typography>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{system.systemName}</Typography>
                    <Typography sx={{ fontSize: 12, color: '#6b7280' }}>
                      {system.status}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#60a5fa' }}>
                    {system.health?.cpu_usage_percent.toFixed(1) || 'N/A'}%
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: '#6b7280' }}>CPU Usage</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  )
}
