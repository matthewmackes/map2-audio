/**
 * Host Machine Settings Component
 * Configure alarms, thresholds, and monitoring preferences
 * Uses localStorage for persistence
 */

import { useCallback } from 'react'
import { Notification, Reset, Save, WarningAlt, WarningAltFilled } from '@carbon/icons-react'
import { Box, Paper, Typography, Button, Grid, Switch, FormControlLabel, Divider, Alert } from '@mui/material'
import { useHealthSettings, useWebSocketPreference } from '@/app/hooks/useLocalStorage'
import { NumberInput } from '../Controls/NumberInput'

export default function HostMachineSettings() {
  const { settings, updateSettings, resetToDefaults } = useHealthSettings()
  const { enabled: webSocketEnabled, setEnabled: setWebSocketEnabled } = useWebSocketPreference()

  const handleNumberChange = useCallback(
    (field: keyof typeof settings, value: number) => {
      if (value >= 0 && value <= 100) {
        updateSettings({ [field]: value })
      }
    },
    [updateSettings]
  )

  const handleSaveAll = useCallback(() => {
    // Settings are auto-saved via localStorage, show confirmation
    console.log('Settings saved:', settings)
  }, [settings])

  const renderThresholdPair = (
    label: string,
    warningKey: keyof typeof settings,
    criticalKey: keyof typeof settings,
    suffix: string
  ) => (
    <Paper sx={{ p: 3, mb: 2 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 2 }}>
        {label}
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <Typography sx={{ fontSize: 12, color: '#666', mb: 1 }}>
            Warning Threshold
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NumberInput
              value={settings[warningKey]}
              min={0}
              max={100}
              step={1}
              profile="integer"
              onChange={(value) => handleNumberChange(warningKey, value)}
              size="small"
              showLabel={false}
              style={{ width: 100 }}
            />
            <Typography sx={{ fontSize: 12, color: '#666' }}>{suffix}</Typography>
          </Box>
          <Typography sx={{ fontSize: 11, color: '#f59e0b', fontWeight: 500, mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAlt size={14} /> Alert when exceeded
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Typography sx={{ fontSize: 12, color: '#666', mb: 1 }}>
            Critical Threshold
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NumberInput
              value={settings[criticalKey]}
              min={0}
              max={100}
              step={1}
              profile="integer"
              onChange={(value) => handleNumberChange(criticalKey, value)}
              size="small"
              showLabel={false}
              style={{ width: 100 }}
            />
            <Typography sx={{ fontSize: 12, color: '#666' }}>{suffix}</Typography>
          </Box>
          <Typography sx={{ fontSize: 11, color: '#ef4444', fontWeight: 500, mt: 1, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <WarningAltFilled size={14} /> Critical alert when exceeded
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  )

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Settings are automatically saved to your browser's local storage. They persist across sessions.
      </Alert>

      {/* Temperature Settings */}
      {renderThresholdPair(
        'CPU Temperature',
        'tempWarning',
        'tempCritical',
        '°C'
      )}

      {/* CPU Usage Settings */}
      {renderThresholdPair(
        'CPU Usage',
        'cpuWarning',
        'cpuCritical',
        '%'
      )}

      {/* Memory Usage Settings */}
      {renderThresholdPair(
        'Memory Usage',
        'memWarning',
        'memCritical',
        '%'
      )}

      {/* Disk Usage Settings */}
      {renderThresholdPair(
        'Disk Usage',
        'diskWarning',
        'diskCritical',
        '%'
      )}

      <Divider sx={{ my: 2 }} />

      {/* WebSocket Settings */}
      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 2 }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <Notification size={16} /> Monitoring Preferences
          </Box>
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={webSocketEnabled}
              onChange={(e) => setWebSocketEnabled(e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography sx={{ fontWeight: 500 }}>
                Real-time WebSocket Updates
              </Typography>
                <Typography sx={{ fontSize: 12, color: '#666' }}>
                {webSocketEnabled
                  ? 'WebSocket enabled - Instant updates with lower bandwidth'
                  : 'Polling mode - Standard polling every 2-5 seconds'}
              </Typography>
            </Box>
          }
        />
      </Paper>

      <Divider sx={{ my: 2 }} />

      {/* Action Buttons */}
      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<Save size={16} />}
              onClick={handleSaveAll}
              sx={{
                backgroundColor: '#10b981',
                '&:hover': { backgroundColor: '#059669' },
              }}
            >
              Save All Settings
            </Button>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<Reset size={16} />}
              onClick={resetToDefaults}
              sx={{
                borderColor: '#6b7280',
                color: '#6b7280',
                '&:hover': { borderColor: '#374151', color: '#374151' },
              }}
            >
              Reset to Defaults
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Current Settings Summary */}
      <Paper sx={{ p: 3, backgroundColor: '#f9fafb' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 2 }}>
          Current Thresholds Summary
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Temp Warning</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                {settings.tempWarning}°C
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Temp Critical</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                {settings.tempCritical}°C
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>CPU Warning</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                {settings.cpuWarning}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>CPU Critical</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                {settings.cpuCritical}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Mem Warning</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                {settings.memWarning}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Mem Critical</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                {settings.memCritical}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Disk Warning</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                {settings.diskWarning}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography sx={{ fontSize: 11, color: '#666' }}>Disk Critical</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                {settings.diskCritical}%
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  )
}
