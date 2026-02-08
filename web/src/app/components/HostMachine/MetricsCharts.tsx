/**
 * Metrics Charts Component - Real-time visualization of system metrics
 * Uses Recharts for responsive, interactive charts with min/max/avg statistics
 */

import { useMemo, useState } from 'react'
import { Box, Paper, Typography, Select, MenuItem, FormControl } from '@mui/material'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { HistoricalMetric } from '@/app/hooks/useHealthMonitoring'

interface MetricsChartsProps {
  metrics: HistoricalMetric[]
  timeRange?: 'last-hour' | 'last-6h' | 'last-24h' | 'all'
}

interface ChartMetric {
  time: string
  timestamp: number
  temperature: number
  cpuUsage: number
  memoryUsage: number
}

interface MetricStats {
  min: number
  max: number
  avg: number
  count: number
}

const getChartData = (metrics: HistoricalMetric[], range: string): ChartMetric[] => {
  const now = Date.now()
  const rangeMs = {
    'last-hour': 60 * 60 * 1000,
    'last-6h': 6 * 60 * 60 * 1000,
    'last-24h': 24 * 60 * 60 * 1000,
    all: Infinity,
  }[range as string] || Infinity

  return metrics
    .filter((m) => now - m.timestamp <= rangeMs)
    .map((m) => ({
      time: new Date(m.timestamp).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      timestamp: m.timestamp,
      temperature: parseFloat(m.cpuTemp.toFixed(1)),
      cpuUsage: parseFloat(m.cpuUsage.toFixed(1)),
      memoryUsage: parseFloat(m.memoryUsage.toFixed(1)),
    }))
}

const calculateStats = (values: number[]): MetricStats => {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0 }
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    count: values.length,
  }
}

export default function MetricsCharts({ metrics, timeRange: initialRange = 'last-hour' }: MetricsChartsProps) {
  const [timeRange, setTimeRange] = useState<'last-hour' | 'last-6h' | 'last-24h' | 'all'>(initialRange)

  const { chartData, tempStats, cpuStats, memStats } = useMemo(() => {
    const data = getChartData(metrics, timeRange)
    const temperatures = data.map((d) => d.temperature)
    const cpuUsages = data.map((d) => d.cpuUsage)
    const memUsages = data.map((d) => d.memoryUsage)

    return {
      chartData: data,
      tempStats: calculateStats(temperatures),
      cpuStats: calculateStats(cpuUsages),
      memStats: calculateStats(memUsages),
    }
  }, [metrics, timeRange])

  if (chartData.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', color: '#999' }}>
        <Typography>No historical data available. Start monitoring to collect metrics.</Typography>
      </Paper>
    )
  }

  const CustomTooltip = (props: any) => {
    const { active, payload } = props
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '8px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          <Typography sx={{ fontSize: 12, color: '#333' }}>
            {new Date(data.timestamp).toLocaleTimeString()}
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
            Temp: {data.temperature}°C
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600 }}>
            CPU: {data.cpuUsage}%
          </Typography>
          <Typography sx={{ fontSize: 11, color: '#ec4899', fontWeight: 600 }}>
            Memory: {data.memoryUsage}%
          </Typography>
        </Box>
      )
    }
    return null
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header with time range selector */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
            Historical Metrics
          </Typography>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value as any)}>
              <MenuItem value="last-hour">Last Hour</MenuItem>
              <MenuItem value="last-6h">Last 6 Hours</MenuItem>
              <MenuItem value="last-24h">Last 24 Hours</MenuItem>
              <MenuItem value="all">All Data</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Temperature Chart */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>
            CPU Temperature (°C)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Min</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>
                {tempStats.min.toFixed(1)}°C
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Max</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>
                {tempStats.max.toFixed(1)}°C
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Avg</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                {tempStats.avg.toFixed(1)}°C
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Samples</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#666' }}>
                {tempStats.count}
              </Typography>
            </Box>
          </Box>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#999" style={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#999" style={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="temperature"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorTemp)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* CPU Usage Chart */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>
            CPU Usage (%)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Min</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6' }}>
                {cpuStats.min.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Max</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>
                {cpuStats.max.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Avg</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                {cpuStats.avg.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Samples</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#666' }}>
                {cpuStats.count}
              </Typography>
            </Box>
          </Box>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#999" style={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#999" style={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="cpuUsage"
                stroke="#8b5cf6"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Paper>

      {/* Memory Usage Chart */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>
            Memory Usage (%)
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Min</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#ec4899' }}>
                {memStats.min.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Max</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#f87171' }}>
                {memStats.max.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Avg</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                {memStats.avg.toFixed(1)}%
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Samples</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#666' }}>
                {memStats.count}
              </Typography>
            </Box>
          </Box>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#999" style={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="#999" style={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="memoryUsage"
                stroke="#ec4899"
                fillOpacity={1}
                fill="url(#colorMem)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Box>
  )
}
