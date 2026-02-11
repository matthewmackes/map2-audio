/**
 * Health Monitor - Real-Time System Health Status
 */

import { Box, Paper, Button, Grid, LinearProgress, Typography } from '@mui/material'
import { ArrowsClockwise, Lightning, Thermometer, Wind } from '@phosphor-icons/react'
import { useState } from 'react'
import type { SystemHealthOverview } from '@/map2/types'

interface HealthMonitorProps {
  healthOverview?: SystemHealthOverview
}

export default function HealthMonitor({ healthOverview }: HealthMonitorProps) {
  const [refreshing, setRefreshing] = useState(false)

  if (!healthOverview) return null

  const health = healthOverview.overall_health || 'unknown'
  const healthColors = {
    excellent: { bg: '#d1fae5', text: '#065f46', icon: '#10b981' },
    good: { bg: '#dbeafe', text: '#0c4a6e', icon: '#3b82f6' },
    warning: { bg: '#fef3c7', text: '#78350f', icon: '#f59e0b' },
    critical: { bg: '#fee2e2', text: '#7f1d1d', icon: '#ef4444' },
  }

  const colors = (healthColors as any)[health] || healthColors.good
  const tempC = healthOverview.cpu_temp_celsius || 0
  const tempMax = healthOverview.max_temp_celsius || 100
  const tempPercent = Math.min((tempC / 100) * 100, 100)

  const getTempColor = () => {
    if (tempC >= 80) return '#ef4444'
    if (tempC >= 70) return '#f59e0b'
    if (tempC >= 60) return '#eab308'
    return '#10b981'
  }

  return (
    <Grid container spacing={2}>
      {/* Overall Health Status */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3, border: '1px solid #e5e7eb' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>System Health</Typography>
            <Button
              size="small"
              startIcon={<ArrowsClockwise size={16} weight="duotone" />}
              onClick={() => {
                setRefreshing(true)
                setTimeout(() => setRefreshing(false), 1000)
              }}
              disabled={refreshing}
            >
              Refresh
            </Button>
          </Box>

          <Box
            sx={{
              p: 2.5,
              backgroundColor: colors.bg,
              borderRadius: 1,
              textAlign: 'center',
              border: `1px solid ${colors.icon}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: colors.text,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {health === 'excellent' ? '✓' : health === 'critical' ? '⚠' : 'ℹ'} {health.toUpperCase()}
            </Typography>
          </Box>

          <Box sx={{ mt: 2, fontSize: 13, color: '#666', lineHeight: 1.8 }}>
            {healthOverview.temperature && (
              <div>
                <strong>Temperature:</strong> {healthOverview.temperature.cpu_c}°C (Max: {healthOverview.temperature.max_c}°C)
              </div>
            )}
            {healthOverview.temperature?.throttling && (
              <div style={{ color: '#ef4444', fontWeight: 600 }}>
                ⚠ Thermal throttling active
              </div>
            )}
            {healthOverview.fans && healthOverview.fans.length > 0 && (
              <div>
                <strong>Fans:</strong> {healthOverview.fans.length} detected
                {healthOverview.fans.some((f) => f.status !== 'ok') && (
                  <span style={{ color: '#f59e0b' }}> - Check fan status</span>
                )}
              </div>
            )}
            {healthOverview.power && (
              <div>
                <strong>Power:</strong> {healthOverview.power.input_voltage}V @ {healthOverview.power.current_load_percent}%
              </div>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* Temperature Gauge */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 3, border: '1px solid #e5e7eb' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Thermometer size={18} style={{ color: getTempColor() }} />
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>CPU Temperature</Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, mb: 1.5 }}>
            <Typography sx={{ fontSize: 32, fontWeight: 700, color: getTempColor() }}>
              {tempC.toFixed(1)}°C
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#999', mb: 0.5 }}>Max: {tempMax}°C</Typography>
          </Box>

          <LinearProgress
            variant="determinate"
            value={tempPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: '#f0f0f0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: getTempColor(),
              },
            }}
          />

          <Box sx={{ mt: 1.5, fontSize: 12, color: '#666' }}>
            {tempC < 50 && 'Excellent - CPU running cool'}
            {tempC >= 50 && tempC < 70 && 'Good - Normal operating temperature'}
            {tempC >= 70 && tempC < 80 && 'Warm - Monitor temperature'}
            {tempC >= 80 && 'HOT - Check cooling system'}
          </Box>
        </Paper>
      </Grid>

      {/* Fan Status */}
      {healthOverview.fans && healthOverview.fans.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 3, border: '1px solid #e5e7eb' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Wind size={18} style={{ color: '#3b82f6' }} />
              <Typography sx={{ fontWeight: 700, fontSize: 16 }}>Fan Status</Typography>
            </Box>

            <Grid container spacing={2}>
              {healthOverview.fans.map((fan, idx) => (
                <Grid item xs={12} sm={6} md={4} key={idx}>
                  <Box sx={{ p: 2, backgroundColor: '#f9fafb', borderRadius: 1, border: '1px solid #e5e7eb' }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 13, mb: 0.5 }}>
                      {fan.name}{' '}
                      <span style={{ color: fan.status === 'ok' ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {fan.status === 'ok' ? '✓' : '✗'}
                      </span>
                    </Typography>
                    <Typography sx={{ color: '#666', fontSize: 12 }}>{fan.rpm} RPM</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      )}
    </Grid>
  )
}
