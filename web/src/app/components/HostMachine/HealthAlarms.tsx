/**
 * Health Alarms Component - Display and manage system health alerts
 */

import { Box, Paper, Chip, Typography, Button, IconButton } from '@mui/material'
import { AlertTriangle, AlertCircle, X, Bell } from 'lucide-react'
import type { HealthAlert } from '@/app/hooks/useHealthMonitoring'

interface HealthAlarmsProps {
  alerts: HealthAlert[]
  onAcknowledge: (alertId: string) => void
  onClearAll: () => void
}

export default function HealthAlarms({ alerts, onAcknowledge, onClearAll }: HealthAlarmsProps) {
  if (alerts.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#d1fae5', borderLeft: '4px solid #10b981' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <Bell size={20} style={{ color: '#10b981' }} />
          <Typography sx={{ color: '#065f46', fontWeight: 600 }}>
            All systems healthy - no active alerts
          </Typography>
        </Box>
      </Paper>
    )
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return (
    <Paper sx={{ p: 3 }}>
      {/* Alert Summary */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {criticalCount > 0 && (
            <Chip
              icon={<AlertTriangle size={16} />}
              label={`${criticalCount} Critical`}
              color="error"
              variant="filled"
            />
          )}
          {warningCount > 0 && (
            <Chip
              icon={<AlertCircle size={16} />}
              label={`${warningCount} Warning`}
              color="warning"
              variant="filled"
            />
          )}
        </Box>
        {alerts.length > 0 && (
          <Button size="small" onClick={onClearAll} variant="outlined" color="inherit">
            Dismiss All
          </Button>
        )}
      </Box>

      {/* Alert List */}
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {alerts.map((alert) => {
          const isWarning = alert.severity === 'warning'
          const bgColor = isWarning ? '#fef3c7' : '#fee2e2'
          const borderColor = isWarning ? '#f59e0b' : '#ef4444'
          const iconColor = isWarning ? '#f59e0b' : '#ef4444'
          const textColor = isWarning ? '#78350f' : '#7f1d1d'

          return (
            <Box
              key={alert.id}
              sx={{
                display: 'flex',
                gap: 2,
                p: 2,
                bgcolor: bgColor,
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: 1,
                alignItems: 'flex-start',
              }}
            >
              {/* Icon */}
              <Box sx={{ mt: 0.5 }}>
                {alert.severity === 'critical' ? (
                  <AlertTriangle size={20} style={{ color: iconColor }} />
                ) : (
                  <AlertCircle size={20} style={{ color: iconColor }} />
                )}
              </Box>

              {/* Content */}
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, color: textColor, mb: 0.5 }}>
                  {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} {alert.severity === 'critical' ? 'Alert' : 'Warning'}
                </Typography>
                <Typography sx={{ fontSize: 14, color: textColor, mb: 0.5 }}>
                  {alert.message}
                </Typography>
                <Typography sx={{ fontSize: 12, color: textColor, opacity: 0.7 }}>
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </Typography>
              </Box>

              {/* Dismiss Button */}
              <IconButton
                size="small"
                onClick={() => onAcknowledge(alert.id)}
                sx={{ color: textColor, opacity: 0.7, '&:hover': { opacity: 1 } }}
              >
                <X size={16} />
              </IconButton>
            </Box>
          )
        })}
      </Box>

      {/* Settings Hint */}
      <Typography sx={{ fontSize: 12, color: '#999', mt: 3, textAlign: 'center' }}>
        💡 Customize alert thresholds in Settings
      </Typography>
    </Paper>
  )
}
