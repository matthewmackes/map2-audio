/**
 * Metrics Charts Component - Real-time visualization of system metrics
 * Uses Recharts for responsive, interactive charts
 */

import { useMemo } from 'react'
import { Box, Paper, Grid, Typography, Select, MenuItem, FormControl } from '@mui/material'
import type { HistoricalMetric } from '@/app/hooks/useHealthMonitoring'

interface MetricsChartsProps {
  metrics: HistoricalMetric[]
  timeRange?: 'last-hour' | 'last-6h' | 'last-24h' | 'all'
}

const getChartData = (metrics: HistoricalMetric[], range: string) => {
  const now = Date.now()
  const rangeMs = {
    'last-hour': 60 * 60 * 1000,
    'last-6h': 6 * 60 * 60 * 1000,
    'last-24h': 24 * 60 * 60 * 1000,
    all: Infinity,
  }[range as string] || Infinity

  return metrics.filter((m) => now - m.timestamp <= rangeMs)
}

export default function MetricsCharts({ metrics, timeRange = 'last-hour' }: MetricsChartsProps) {
  const chartData = useMemo(() => {
    return getChartData(metrics, timeRange).map((m) => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      temperature: m.cpuTemp.toFixed(1),
      cpuUsage: m.cpuUsage.toFixed(1),
      memoryUsage: m.memoryUsage.toFixed(1),
      timestamp: m.timestamp,
    }))
  }, [metrics, timeRange])

  if (chartData.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', color: '#999' }}>
        <Typography>No historical data available. Start monitoring to collect metrics.</Typography>
      </Paper>
    )
  }

  // Simple chart implementation using CSS and canvas would go here
  // For now, showing chart data summary
  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
            Historical Metrics - {timeRange}
          </Typography>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select defaultValue={timeRange}>
              <MenuItem value="last-hour">Last Hour</MenuItem>
              <MenuItem value="last-6h">Last 6 Hours</MenuItem>
              <MenuItem value="last-24h">Last 24 Hours</MenuItem>
              <MenuItem value="all">All Data</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Charts would be rendered here using Recharts or similar */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 1 }}>
              CPU Temperature (°C)
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
              {chartData[chartData.length - 1]?.temperature}°C
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#999', mt: 1 }}>
              Data points: {chartData.length}
            </Typography>
          </Box>

          <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 1 }}>
              CPU Usage (%)
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>
              {chartData[chartData.length - 1]?.cpuUsage}%
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#999', mt: 1 }}>
              Data points: {chartData.length}
            </Typography>
          </Box>

          <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 1 }}>
              Memory Usage (%)
            </Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 700, color: '#ec4899' }}>
              {chartData[chartData.length - 1]?.memoryUsage}%
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#999', mt: 1 }}>
              Data points: {chartData.length}
            </Typography>
          </Box>

          <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 12, color: '#666', mb: 1 }}>
              Time Range
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#333' }}>
              {new Date(chartData[0]?.timestamp).toLocaleString()} to{'\n'}
              {new Date(chartData[chartData.length - 1]?.timestamp).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Typography sx={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
        💡 Recharts integration coming in next update for interactive graphs
      </Typography>
    </Box>
  )
}
