/**
 * Disk Health Card - SMART Health Monitoring
 */

import { Box, Paper, Grid, LinearProgress, Typography, Chip } from '@mui/material'
import { HardDrive, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import type { DiskHealthData } from '@/map2/types'

interface DiskHealthCardProps {
  diskHealth: DiskHealthData
}

const getHealthColor = (status: string) => {
  switch (status) {
    case 'passing':
      return { bg: '#d1fae5', text: '#065f46', icon: '#10b981' }
    case 'warning':
      return { bg: '#fef3c7', text: '#78350f', icon: '#f59e0b' }
    case 'failing':
      return { bg: '#fee2e2', text: '#7f1d1d', icon: '#ef4444' }
    default:
      return { bg: '#f3f4f6', text: '#374151', icon: '#6b7280' }
  }
}

const getHealthIcon = (status: string) => {
  switch (status) {
    case 'passing':
      return <CheckCircle size={16} />
    case 'warning':
      return <AlertCircle size={16} />
    case 'failing':
      return <AlertTriangle size={16} />
    default:
      return <HardDrive size={16} />
  }
}

export default function DiskHealthCard({ diskHealth }: DiskHealthCardProps) {
  if (!diskHealth?.disks || diskHealth.disks.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', color: '#999' }}>
        <Typography>No disk information available</Typography>
      </Paper>
    )
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 2.5 }}>
      {diskHealth.disks.map((disk, idx) => {
        // Map overall_health to individual disk status
        const overallStatus = diskHealth.overall_health === 'excellent' || diskHealth.overall_health === 'good' 
          ? 'passing' 
          : diskHealth.overall_health === 'warning' 
          ? 'warning' 
          : 'failing'
        
        const colors = getHealthColor(overallStatus)

        return (
          <Paper key={idx} sx={{ p: 3, border: '1px solid #e5e7eb' }}>
            {/* Disk Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HardDrive size={18} style={{ color: colors.icon }} />
                  {disk.device.toUpperCase()}
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#666', mt: 0.5 }}>{disk.mount_point}</Typography>
              </Box>

              <Chip
                icon={getHealthIcon(overallStatus)}
                label={diskHealth.overall_health.toUpperCase()}
                size="small"
                sx={{
                  backgroundColor: colors.bg,
                  color: colors.text,
                  fontWeight: 600,
                  fontSize: 10,
                }}
              />
            </Box>

            {/* Capacity & Usage */}
            <Box sx={{ mt: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: '#333' }}>Capacity</span>
                <span style={{ color: '#666' }}>
                  {disk.use_percent.toFixed(1)}% of {disk.total_gb} GB used
                </span>
              </Box>
              <LinearProgress
                variant="determinate"
                value={disk.use_percent}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: '#f0f0f0',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: disk.use_percent > 85 ? '#ef4444' : disk.use_percent > 75 ? '#f59e0b' : '#3b82f6',
                  },
                }}
              />
            </Box>

            {/* SMART Status & Temperature */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
              {disk.temperature_c !== undefined && (
                <Box sx={{ p: 1.5, backgroundColor: '#f9fafb', borderRadius: 1 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
                    Temperature
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: disk.temperature_c > 50 ? '#f59e0b' : '#666' }}>
                    {disk.temperature_c}°C
                  </Typography>
                </Box>
              )}
              {disk.smart_status && (
                <Box sx={{ p: 1.5, backgroundColor: '#f9fafb', borderRadius: 1 }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#666', mb: 0.5 }}>
                    SMART Status
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: disk.smart_status.includes('PASSED') ? '#10b981' : '#ef4444',
                    }}
                  >
                    {disk.smart_status.includes('PASSED') ? '✓ PASSED' : '✗ FAILED'}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Health Indicators */}
            <Box sx={{ borderTop: '1px solid #f0f0f0', pt: 1.5, fontSize: 12, color: '#666' }}>
              {disk.reallocated_sectors !== undefined && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Reallocated:</strong> {disk.reallocated_sectors} sectors
                  {disk.reallocated_sectors > 10 && <span style={{ color: '#f59e0b' }}> (monitor closely)</span>}
                </div>
              )}
              {disk.uncorrectable_errors !== undefined && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Errors:</strong> {disk.uncorrectable_errors}
                  {disk.uncorrectable_errors > 0 && <span style={{ color: '#ef4444' }}> (critical)</span>}
                </div>
              )}
              {disk.power_on_hours !== undefined && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Power On:</strong> {(disk.power_on_hours / 24).toFixed(0)} days
                </div>
              )}
              {disk.estimated_lifespan_percent !== undefined && (
                <div>
                  <strong>Lifespan:</strong>{' '}
                  <span style={{ color: disk.estimated_lifespan_percent < 70 ? '#f59e0b' : '#10b981' }}>
                    {disk.estimated_lifespan_percent}% estimated
                  </span>
                </div>
              )}
            </Box>
          </Paper>
        )
      })}
    </Box>
  )
}
