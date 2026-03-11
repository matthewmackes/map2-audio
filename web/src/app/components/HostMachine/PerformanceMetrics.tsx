/**
 * Performance Metrics - Real-Time System Performance Graphs
 */

import { Box, Paper, Button, Grid, Switch, FormControlLabel, Typography } from '@mui/material'
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { useDiskHealth, useHealthOverview } from '@/app/hooks/useHostMachine'

interface PerformanceMetricsProps {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
  nodeId?: string | null
}

interface MetricPoint {
  time: string
  cpu: number
  memory: number
  temp: number
  disk: number
}

export default function PerformanceMetrics({
  autoRefresh,
  onAutoRefreshChange,
  nodeId,
}: PerformanceMetricsProps) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([])

  const healthOverviewQuery = useHealthOverview(autoRefresh ? 2000 : undefined, nodeId)
  const diskHealthQuery = useDiskHealth(autoRefresh ? 5000 : undefined, nodeId)

  useEffect(() => {
    if (!healthOverviewQuery.data) return

    const diskPercent =
      diskHealthQuery.data?.use_percent ??
      diskHealthQuery.data?.disks?.[0]?.use_percent ??
      0

    const nextPoint: MetricPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: healthOverviewQuery.data.cpu_usage_percent ?? 0,
      memory: healthOverviewQuery.data.memory_usage_percent ?? 0,
      temp: healthOverviewQuery.data.cpu_temp_celsius ?? 0,
      disk: diskPercent,
    }

    setMetrics(prev => {
      const last = prev[prev.length - 1]
      const unchanged =
        last &&
        Math.abs(last.cpu - nextPoint.cpu) < 0.01 &&
        Math.abs(last.memory - nextPoint.memory) < 0.01 &&
        Math.abs(last.temp - nextPoint.temp) < 0.01 &&
        Math.abs(last.disk - nextPoint.disk) < 0.01

      if (unchanged) {
        return prev
      }

      return [...prev.slice(-23), nextPoint]
    })
  }, [healthOverviewQuery.data, diskHealthQuery.data])

  const getColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.warning) return '#ef4444'
    if (value >= thresholds.good) return '#f59e0b'
    return '#10b981'
  }

  const cpuColor = getColor(metrics[metrics.length - 1]?.cpu || 0, { good: 70, warning: 85 })
  const memColor = getColor(metrics[metrics.length - 1]?.memory || 0, { good: 70, warning: 85 })
  const tempColor = getColor(metrics[metrics.length - 1]?.temp || 0, { good: 60, warning: 75 })
  const latest = metrics[metrics.length - 1] ?? { cpu: 0, memory: 0, temp: 0, disk: 0 }

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Real-Time Performance Monitoring</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch checked={autoRefresh} onChange={(e) => onAutoRefreshChange(e.target.checked)} size="small" />
            }
            label="Auto-refresh"
          />
          <Button
            size="small"
            onClick={() => {
              healthOverviewQuery.refetch()
              diskHealthQuery.refetch()
            }}
            disabled={healthOverviewQuery.isFetching || diskHealthQuery.isFetching}
            startIcon={<ArrowsClockwise size={16} weight="duotone" />}
          >
            {healthOverviewQuery.isFetching || diskHealthQuery.isFetching ? 'Refreshing...' : 'Force Refresh'}
          </Button>
        </Box>
      </Box>

      {/* Quick Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, border: '1px solid #e5e7eb' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
              CPU Usage
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: cpuColor }}>
              {latest.cpu.toFixed(0)}%
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#999', mt: 0.5 }}>
              {cpuColor === '#ef4444' ? 'High - Monitor' : cpuColor === '#f59e0b' ? 'Moderate' : 'Normal'}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, border: '1px solid #e5e7eb' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
              Memory Usage
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: memColor }}>
              {latest.memory.toFixed(0)}%
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#999', mt: 0.5 }}>
              {memColor === '#ef4444' ? 'High' : memColor === '#f59e0b' ? 'Good' : 'Excellent'}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, border: '1px solid #e5e7eb' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
              Temperature
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: tempColor }}>
              {latest.temp.toFixed(0)}°C
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#999', mt: 0.5 }}>
              {tempColor === '#ef4444' ? 'Hot' : tempColor === '#f59e0b' ? 'Warm' : 'Cool'}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, border: '1px solid #e5e7eb' }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
              Disk Usage
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
              {latest.disk.toFixed(0)}%
            </Typography>
            <Typography sx={{ fontSize: 10, color: '#999', mt: 0.5 }}>Good Headroom</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* CPU & Memory Trend */}
      <Paper sx={{ p: 2.5, mb: 2.5, border: '1px solid #e5e7eb' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5 }}>
          CPU & Memory Utilization
        </Typography>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={metrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" stroke="#999" style={{ fontSize: 12 }} />
            <YAxis stroke="#999" style={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
              }}
            />
            <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} name="CPU %" />
            <Line type="monotone" dataKey="memory" stroke="#ef4444" strokeWidth={2} dot={false} name="Memory %" />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Temperature & Disk Trend */}
      <Paper sx={{ p: 2.5, border: '1px solid #e5e7eb' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5 }}>
          Temperature & Disk Usage
        </Typography>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={metrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" stroke="#999" style={{ fontSize: 12 }} />
            <YAxis stroke="#999" style={{ fontSize: 12 }} yAxisId="left" />
            <YAxis stroke="#999" style={{ fontSize: 12 }} yAxisId="right" orientation="right" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="temp"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Temp °C"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="disk"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="Disk %"
            />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Performance Tips */}
      <Paper sx={{ p: 2.5, mt: 2.5, backgroundColor: '#f0f7ff', border: '1px solid #dbeafe' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#003da5', mb: 1 }}>
          💡 Performance Optimization Tips
        </Typography>
        <ul style={{ margin: 0, paddingLeft: 20, color: '#555', fontSize: 12 }}>
          <li>Keep CPU usage below 75% for reliable real-time audio</li>
          <li>Monitor temperature - sustained high temps may reduce performance</li>
          <li>Allocate dedicated cores to audio engine via CPU Core Config</li>
          <li>Use the Performance tab for live monitoring during critical sessions</li>
        </ul>
      </Paper>
    </Box>
  )
}
