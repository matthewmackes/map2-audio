/**
 * Performance Metrics - Real-Time System Performance Graphs
 */

import { Box, Paper, Button, Grid, Switch, FormControlLabel, Typography } from '@mui/material'
import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { RefreshCw } from 'lucide-react'

interface PerformanceMetricsProps {
  autoRefresh: boolean
  onAutoRefreshChange: (value: boolean) => void
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
}: PerformanceMetricsProps) {
  const [metrics, setMetrics] = useState<MetricPoint[]>([
    { time: '00:00', cpu: 15, memory: 45, temp: 42, disk: 65 },
    { time: '01:00', cpu: 22, memory: 48, temp: 45, disk: 65 },
    { time: '02:00', cpu: 28, memory: 52, temp: 48, disk: 66 },
    { time: '03:00', cpu: 25, memory: 50, temp: 46, disk: 66 },
    { time: '04:00', cpu: 35, memory: 58, temp: 52, disk: 67 },
    { time: '05:00', cpu: 32, memory: 55, temp: 50, disk: 67 },
    { time: '06:00', cpu: 28, memory: 52, temp: 48, disk: 68 },
    { time: '07:00', cpu: 18, memory: 46, temp: 44, disk: 68 },
  ])

  // Simulate real-time data updates
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setMetrics((prev) => {
        const newPoint: MetricPoint = {
          time: new Date().toLocaleTimeString().substring(0, 5),
          cpu: Math.max(10, Math.min(95, prev[prev.length - 1].cpu + (Math.random() - 0.5) * 20)),
          memory: Math.max(30, Math.min(90, prev[prev.length - 1].memory + (Math.random() - 0.5) * 10)),
          temp: Math.max(35, Math.min(85, prev[prev.length - 1].temp + (Math.random() - 0.5) * 8)),
          disk: prev[prev.length - 1].disk + Math.random() * 0.1,
        }

        return [...prev.slice(1), newPoint]
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  const getColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.warning) return '#ef4444'
    if (value >= thresholds.good) return '#f59e0b'
    return '#10b981'
  }

  const cpuColor = getColor(metrics[metrics.length - 1]?.cpu || 0, { good: 70, warning: 85 })
  const memColor = getColor(metrics[metrics.length - 1]?.memory || 0, { good: 70, warning: 85 })
  const tempColor = getColor(metrics[metrics.length - 1]?.temp || 0, { good: 60, warning: 75 })

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
          <Button size="small" startIcon={<RefreshCw size={16} />}>
            Refresh
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
              {metrics[metrics.length - 1]?.cpu.toFixed(0)}%
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
              {metrics[metrics.length - 1]?.memory.toFixed(0)}%
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
              {metrics[metrics.length - 1]?.temp.toFixed(0)}°C
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
              {metrics[metrics.length - 1]?.disk.toFixed(0)}%
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
