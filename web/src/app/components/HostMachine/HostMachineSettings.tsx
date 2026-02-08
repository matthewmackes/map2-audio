/**
 * Host Machine Settings Component
 * Configure alarms, thresholds, and monitoring preferences
 */

import { useState, useCallback } from 'react'
import { Box, Paper, Typography, TextField, Button, Grid, Switch, FormControlLabel, Divider } from '@mui/material'
import type { HealthThresholds } from '@/app/hooks/useHealthMonitoring'
import { DEFAULT_THRESHOLDS } from '@/app/hooks/useHealthMonitoring'

interface HostMachineSettingsProps {
  thresholds: HealthThresholds
  onThresholdsChange: (thresholds: HealthThresholds) => void
  enableWebSocket: boolean
  onWebSocketToggle: (enabled: boolean) => void
}

export default function HostMachineSettings({
  thresholds,
  onThresholdsChange,
  enableWebSocket,
  onWebSocketToggle,
}: HostMachineSettingsProps) {
  const [localThresholds, setLocalThresholds] = useState(thresholds)
  const [isModified, setIsModified] = useState(false)

  const handleThresholdChange = useCallback(
    (key: keyof HealthThresholds, value: number) => {
      setLocalThresholds((prev) => ({
        ...prev,
        [key]: value,
      }))
      setIsModified(true)
    },
    []
  )

  const handleSave = useCallback(() => {
    onThresholdsChange(localThresholds)
    setIsModified(false)
  }, [localThresholds, onThresholdsChange])

  const handleReset = useCallback(() => {
    setLocalThresholds(DEFAULT_THRESHOLDS)
    setIsModified(true)
  }, [])

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Temperature Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>Temperature Thresholds (°C)</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Warning Threshold"
              type="number"
              value={localThresholds.temperatureWarning}
              onChange={(e) => handleThresholdChange('temperatureWarning', parseInt(e.target.value))}
              fullWidth
              helperText="Alert when temperature exceeds this value"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Critical Threshold"
              type="number"
              value={localThresholds.temperatureCritical}
              onChange={(e) => handleThresholdChange('temperatureCritical', parseInt(e.target.value))}
              fullWidth
              helperText="Critical alert when temperature exceeds this value"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* CPU Usage Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>CPU Usage Thresholds (%)</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Warning Threshold"
              type="number"
              value={localThresholds.cpuUsageWarning}
              onChange={(e) => handleThresholdChange('cpuUsageWarning', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Critical Threshold"
              type="number"
              value={localThresholds.cpuUsageCritical}
              onChange={(e) => handleThresholdChange('cpuUsageCritical', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Memory Usage Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>Memory Usage Thresholds (%)</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Warning Threshold"
              type="number"
              value={localThresholds.memoryUsageWarning}
              onChange={(e) => handleThresholdChange('memoryUsageWarning', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Critical Threshold"
              type="number"
              value={localThresholds.memoryUsageCritical}
              onChange={(e) => handleThresholdChange('memoryUsageCritical', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Disk Usage Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>Disk Usage Thresholds (%)</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Warning Threshold"
              type="number"
              value={localThresholds.diskUsageWarning}
              onChange={(e) => handleThresholdChange('diskUsageWarning', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Critical Threshold"
              type="number"
              value={localThresholds.diskUsageCritical}
              onChange={(e) => handleThresholdChange('diskUsageCritical', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Streaming Settings */}
      <Paper sx={{ p: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, mb: 2 }}>Data Streaming</Typography>
        <FormControlLabel
          control={<Switch checked={enableWebSocket} onChange={(e) => onWebSocketToggle(e.target.checked)} />}
          label="Use WebSocket for Real-time Updates (reduces server load)"
        />
        <Typography sx={{ fontSize: 12, color: '#666', mt: 1 }}>
          When enabled, metrics stream via WebSocket instead of polling. Falls back to polling if connection fails.
        </Typography>
      </Paper>

      {/* Action Buttons */}
      <Divider />
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          onClick={handleReset}
          variant="outlined"
          disabled={!isModified}
        >
          Reset to Defaults
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!isModified}
        >
          Save Settings
        </Button>
      </Box>

      {/* Info */}
      <Typography sx={{ fontSize: 12, color: '#999', textAlign: 'center', mt: 2 }}>
        Settings are saved locally. Changes apply immediately to new alerts.
      </Typography>
    </Box>
  )
}
