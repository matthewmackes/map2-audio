/**
 * Multi-System Dashboard Component - Monitor and compare multiple host systems
 * Side-by-side metrics, aggregated statistics, and performance comparisons
 */

import { useMemo } from 'react'
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import { useMultiSystemMonitoring } from '@/app/hooks/useMultiSystemMonitoring'

export default function MultiSystemDashboard() {
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
        return '#999'
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

  if (systems.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center', color: '#999' }}>
        <Typography sx={{ fontSize: 18, mb: 2 }}>
          📊 No systems being monitored
        </Typography>
        <Typography sx={{ fontSize: 14 }}>
          Add systems to the multi-system dashboard to compare metrics and track performance
        </Typography>
      </Paper>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header */}
      <Paper sx={{ p: 3, backgroundColor: '#f3f4f6' }}>
        <Typography sx={{ fontWeight: 700, fontSize: 20, mb: 2 }}>
          🖥️ Multi-System Dashboard
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666' }}>Total Systems</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
                {stats.totalSystems}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666' }}>Online</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
                {stats.onlineSystems}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666' }}>Offline</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#6b7280' }}>
                {stats.offlineSystems}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 12, color: '#666' }}>Avg CPU</Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>
                {stats.avgCpuUsage}%
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Systems Overview Cards */}
      <Box>
        <Typography sx={{ fontWeight: 600, fontSize: 16, mb: 2 }}>
          System Status Overview
        </Typography>
        <Grid container spacing={2}>
          {systems.map((system) => (
            <Grid item xs={12} sm={6} md={4} key={system.systemId}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                      {system.systemName}
                    </Typography>
                    <Chip
                      icon={<span>{getStatusIcon(system.status)}</span>}
                      label={system.status.toUpperCase()}
                      size="small"
                      sx={{
                        backgroundColor: getStatusColor(system.status),
                        color: '#fff',
                      }}
                    />
                  </Box>

                  {system.health && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: 12, color: '#666' }}>CPU</Typography>
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
                              backgroundColor: '#8b5cf6',
                            },
                          }}
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: 12, color: '#666' }}>Memory</Typography>
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
                              backgroundColor: '#ec4899',
                            },
                          }}
                        />
                      </Box>

                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography sx={{ fontSize: 12, color: '#666' }}>Temperature</Typography>
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
                    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #e5e7eb' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 12, color: '#666' }}>Disk</Typography>
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

                  <Typography sx={{ fontSize: 11, color: '#999', mt: 1.5 }}>
                    Last update: {new Date(system.lastUpdate).toLocaleTimeString()}
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
          <Typography sx={{ fontWeight: 600, fontSize: 16, mb: 2 }}>
            📊 Metric Comparisons
          </Typography>
          <Grid container spacing={2}>
            {comparisons.map((comparison) => (
              <Grid item xs={12} md={6} key={comparison.metric}>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead sx={{ backgroundColor: '#f3f4f6' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>System</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {comparison.metric} ({comparison.unit})
                        </TableCell>
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
                              sx={{
                                backgroundColor: isHighest
                                  ? 'rgba(239, 68, 68, 0.1)'
                                  : isLowest
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : 'transparent',
                              }}
                            >
                              <TableCell sx={{ fontWeight: 500 }}>
                                {index + 1}. {system?.systemName || systemId}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {value.toFixed(1)}
                                {isHighest && <span style={{ color: '#ef4444' }}> 🔴</span>}
                                {isLowest && <span style={{ color: '#10b981' }}> 🟢</span>}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      <TableRow sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>
                        <TableCell>Average</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#3b82f6' }}>
                          {comparison.average.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Top Performers */}
      {rankedByCpu.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 16, mb: 2 }}>
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
                  borderLeft: `4px solid ${['#fbbf24', '#d1d5db', '#cd7f32', '#999', '#999'][index]}`,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 18, minWidth: 30 }}>
                    #{index + 1}
                  </Typography>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>{system.systemName}</Typography>
                    <Typography sx={{ fontSize: 12, color: '#666' }}>
                      {system.status}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#8b5cf6' }}>
                    {system.health?.cpu_usage_percent.toFixed(1) || 'N/A'}%
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: '#666' }}>CPU Usage</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  )
}
