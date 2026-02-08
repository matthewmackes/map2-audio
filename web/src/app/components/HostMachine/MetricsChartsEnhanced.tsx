/**
 * Metrics Charts Component - Interactive Recharts Visualization
 * Real-time visualization of system metrics with zoom, pan, and export
 */

import { useMemo, useState } from 'react'
import { Box, Paper, Grid, Typography, Select, MenuItem, FormControl, Button, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { DownloadCloud, TrendingUp } from 'lucide-react'
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
  ComposedChart,
} from 'recharts'
import type { HistoricalMetric } from '@/app/hooks/useHealthMonitoring'

interface MetricsChartsProps {
  metrics: HistoricalMetric[]
  timeRange?: 'last-hour' | 'last-6h' | 'last-24h' | 'all'
  onTimeRangeChange?: (range: string) => void
}

const getChartData = (metrics: HistoricalMetric[], range: string) => {
  const now = Date.now()
  const rangeMs = {
    'last-hour': 60 * 60 * 1000,
    'last-6h': 6 * 60 * 60 * 1000,
    'last-24h': 24 * 60 * 60 * 1000,
    all: Infinity,
  }[range as string] || Infinity

  return metrics
    .filter((m) => now - m.timestamp <= rangeMs)
    .map((m, idx) => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      temperature: parseFloat(m.cpuTemp.toFixed(1)),
      maxTemp: parseFloat(m.maxTemp.toFixed(1)),
      cpuUsage: parseFloat(m.cpuUsage.toFixed(1)),
      memoryUsage: parseFloat(m.memoryUsage.toFixed(1)),
      timestamp: m.timestamp,
      index: idx,
    }))
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          bgcolor: 'rgba(0,0,0,0.8)',
          p: 1.5,
          borderRadius: 1,
          color: '#fff',
          fontSize: 12,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.5 }}>
          {payload[0]?.payload?.time}
        </Typography>
        {payload.map((entry: any, idx: number) => (
          <Typography key={idx} sx={{ fontSize: 11, color: entry.color }}>
            {entry.name}: {entry.value}
            {entry.unit || ''}
          </Typography>
        ))}
      </Box>
    )
  }
  return null
}

export default function MetricsCharts({
  metrics,
  timeRange = 'last-hour',
  onTimeRangeChange,
}: MetricsChartsProps) {
  const [chartType, setChartType] = useState<'line' | 'area'>('line')
  const [visibleMetrics, setVisibleMetrics] = useState({
    temperature: true,
    cpuUsage: true,
    memoryUsage: true,
  })

  const chartData = useMemo(() => getChartData(metrics, timeRange), [metrics, timeRange])

  if (chartData.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', color: '#999' }}>
        <Typography>No historical data available. Start monitoring to collect metrics.</Typography>
      </Paper>
    )
  }

  // Calculate min/max for scaling
  const temperatures = chartData.map((d) => d.temperature)
  const tempMin = Math.floor(Math.min(...temperatures) / 10) * 10
  const tempMax = Math.ceil(Math.max(...temperatures) / 10) * 10

  const handleExportCSV = () => {
    const csv = [
      ['Time', 'Temperature (°C)', 'Max Temp (°C)', 'CPU Usage (%)', 'Memory Usage (%)'],
      ...chartData.map((d) => [d.time, d.temperature, d.maxTemp, d.cpuUsage, d.memoryUsage]),
    ]
      .map((row) => row.join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `metrics-${new Date().toISOString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Controls */}
      <Paper sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={timeRange} onChange={(e) => onTimeRangeChange?.(e.target.value)}>
              <MenuItem value="last-hour">Last Hour</MenuItem>
              <MenuItem value="last-6h">Last 6 Hours</MenuItem>
              <MenuItem value="last-24h">Last 24 Hours</MenuItem>
              <MenuItem value="all">All Data</MenuItem>
            </Select>
          </FormControl>

          <ToggleButtonGroup size="small" value={chartType} exclusive onChange={(_, newType) => newType && setChartType(newType)}>
            <ToggleButton value="line">Line</ToggleButton>
            <ToggleButton value="area">Area</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Button size="small" startIcon={<DownloadCloud size={16} />} onClick={handleExportCSV}>
          Export CSV
        </Button>
      </Paper>

      {/* Temperature Chart */}
      {visibleMetrics.temperature && (
        <Paper sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>CPU Temperature</Typography>
          <ResponsiveContainer width="100%" height={300}>
            {chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={[tempMin, tempMax]} tick={{ fontSize: 12 }} label={{ value: '°C', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="temperature" stroke="#3b82f6" fill="url(#tempGradient)" name="Current" />
                <Line type="monotone" dataKey="maxTemp" stroke="#f59e0b" strokeDasharray="5 5" name="Max" />
              </AreaChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={[tempMin, tempMax]} tick={{ fontSize: 12 }} label={{ value: '°C', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="temperature" stroke="#3b82f6" name="Current" dot={false} />
                <Line type="monotone" dataKey="maxTemp" stroke="#f59e0b" strokeDasharray="5 5" name="Max" dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </Paper>
      )}

      {/* CPU & Memory Chart */}
      {(visibleMetrics.cpuUsage || visibleMetrics.memoryUsage) && (
        <Paper sx={{ p: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>CPU & Memory Usage</Typography>
          <ResponsiveContainer width="100%" height={300}>
            {chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {visibleMetrics.cpuUsage && <Area type="monotone" dataKey="cpuUsage" stroke="#8b5cf6" fill="url(#cpuGradient)" name="CPU" />}
                {visibleMetrics.memoryUsage && <Area type="monotone" dataKey="memoryUsage" stroke="#ec4899" fill="url(#memGradient)" name="Memory" />}
              </AreaChart>
            ) : (
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} label={{ value: '%', angle: -90, position: 'insideLeft' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {visibleMetrics.cpuUsage && <Line type="monotone" dataKey="cpuUsage" stroke="#8b5cf6" name="CPU" dot={false} />}
                {visibleMetrics.memoryUsage && <Line type="monotone" dataKey="memoryUsage" stroke="#ec4899" name="Memory" dot={false} />}
              </LineChart>
            )}
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Statistics Summary */}
      <Grid container spacing={2}>
        {visibleMetrics.temperature && (
          <>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 0.5 }}>
                  Avg Temperature
                </Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
                  {(chartData.reduce((a, d) => a + d.temperature, 0) / chartData.length).toFixed(1)}°C
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 0.5 }}>
                  Max Temperature
                </Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>
                  {Math.max(...chartData.map((d) => d.temperature)).toFixed(1)}°C
                </Typography>
              </Box>
            </Grid>
          </>
        )}
        {visibleMetrics.cpuUsage && (
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 0.5 }}>
                Avg CPU Usage
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#8b5cf6' }}>
                {(chartData.reduce((a, d) => a + d.cpuUsage, 0) / chartData.length).toFixed(1)}%
              </Typography>
            </Box>
          </Grid>
        )}
        {visibleMetrics.memoryUsage && (
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 0.5 }}>
                Avg Memory Usage
              </Typography>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#ec4899' }}>
                {(chartData.reduce((a, d) => a + d.memoryUsage, 0) / chartData.length).toFixed(1)}%
              </Typography>
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  )
}
