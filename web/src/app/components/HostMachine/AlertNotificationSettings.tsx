/**
 * Alert Notifications Display Component
 * Shows browser notifications, sound controls, and notification preferences
 */

import { useState, useEffect } from 'react'
import { Box, Paper, Typography, Switch, FormControlLabel, Button, Grid, Chip, Alert } from '@mui/material'
import { Bell, Volume2, Vibrate, X } from 'lucide-react'
import type { AlertNotification } from '@/app/hooks/useAlertNotifications'

export interface NotificationConfig {
  enabled: boolean
  sound: boolean
  vibrate: boolean
  types: string[]
  notificationsEnabled?: boolean
  soundEnabled?: boolean
  vibrateEnabled?: boolean
  requireInteraction?: boolean
}

interface AlertNotificationSettingsProps {
  config: NotificationConfig
  onConfigChange: (config: NotificationConfig) => void
}

export default function AlertNotificationSettings({
  config,
  onConfigChange,
}: AlertNotificationSettingsProps) {
  const [notificationsSupported, setNotificationsSupported] = useState(false)
  const [audioSupported, setAudioSupported] = useState(false)
  const [vibrateSupported, setVibrateSupported] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    // Check feature support
    setNotificationsSupported('Notification' in window)
    setAudioSupported(typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined')
    setVibrateSupported('vibrate' in navigator)

    // Check notification permission
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  const handleRequestPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
    }
  }

  const handleConfigChange = (key: keyof NotificationConfig, value: boolean) => {
    onConfigChange({
      ...config,
      [key]: value,
    })
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      {/* Permission Status */}
      {notificationsSupported && notificationPermission === 'denied' && (
        <Alert severity="warning">
          Notifications are blocked. Enable them in browser settings to receive alerts.
        </Alert>
      )}

      {/* Notifications */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bell size={20} />
            <Typography sx={{ fontWeight: 600 }}>Browser Notifications</Typography>
          </Box>
          {!notificationsSupported && <Chip label="Not Supported" size="small" color="default" />}
        </Box>

        {notificationsSupported ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={config.notificationsEnabled && notificationPermission === 'granted'}
                  onChange={(e) => handleConfigChange('notificationsEnabled', e.target.checked)}
                  disabled={notificationPermission !== 'granted'}
                />
              }
              label={
                notificationPermission === 'granted'
                  ? 'Show browser notifications for alerts'
                  : 'Permission required'
              }
            />

            {notificationPermission === 'default' && (
              <Button size="small" onClick={handleRequestPermission} sx={{ mt: 1 }}>
                Enable Notifications
              </Button>
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={config.requireInteraction}
                  onChange={(e) => handleConfigChange('requireInteraction', e.target.checked)}
                  disabled={!config.notificationsEnabled}
                />
              }
              label="Require user interaction to dismiss critical alerts"
            />

            <Typography sx={{ fontSize: 12, color: '#666', mt: 1 }}>
              Get instant notifications when system thresholds are exceeded. Works even when you're not
              viewing the page.
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: '#999' }}>
            Browser notifications are not supported in your browser.
          </Typography>
        )}
      </Paper>

      {/* Audio Alerts */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Volume2 size={20} />
            <Typography sx={{ fontWeight: 600 }}>Audio Alerts</Typography>
          </Box>
          {!audioSupported && <Chip label="Not Supported" size="small" color="default" />}
        </Box>

        {audioSupported ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={config.soundEnabled}
                  onChange={(e) => handleConfigChange('soundEnabled', e.target.checked)}
                />
              }
              label="Play sound for critical alerts"
            />

            <Typography sx={{ fontSize: 12, color: '#666', mt: 1 }}>
              Emits an alert tone when critical system alerts are triggered, even if you're away from
              the page.
            </Typography>

            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f3f4f6', borderRadius: 1 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>Alert Tones:</Typography>
              <Typography sx={{ fontSize: 11, color: '#666' }}>
                • Warning: Single beep (880 Hz)
                <br />• Critical: Triple pulse (1000-1400 Hz)
              </Typography>
            </Box>
          </>
        ) : (
          <Typography sx={{ fontSize: 12, color: '#999' }}>
            Web Audio API is not supported in your browser.
          </Typography>
        )}
      </Paper>

      {/* Vibration */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Vibrate size={20} />
            <Typography sx={{ fontWeight: 600 }}>Vibration Alerts</Typography>
          </Box>
          {!vibrateSupported && <Chip label="Mobile Only" size="small" color="default" />}
        </Box>

        {vibrateSupported ? (
          <FormControlLabel
            control={
              <Switch
                checked={config.vibrateEnabled}
                onChange={(e) => handleConfigChange('vibrateEnabled', e.target.checked)}
              />
            }
            label="Vibrate on critical alerts (mobile devices)"
          />
        ) : (
          <Typography sx={{ fontSize: 12, color: '#999' }}>
            Vibration is only available on mobile devices with vibration motors.
          </Typography>
        )}
      </Paper>

      {/* Alert Preferences Summary */}
      <Paper sx={{ p: 2, bgcolor: '#f9fafb' }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1.5 }}>Your Alert Preferences</Typography>

        <Grid container spacing={1}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e5e7eb' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#666', mb: 0.5 }}>
                Notifications
              </Typography>
              <Chip
                size="small"
                label={config.notificationsEnabled ? 'Enabled' : 'Disabled'}
                color={config.notificationsEnabled ? 'success' : 'default'}
                variant="outlined"
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e5e7eb' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#666', mb: 0.5 }}>
                Audio Alerts
              </Typography>
              <Chip
                size="small"
                label={config.soundEnabled ? 'Enabled' : 'Disabled'}
                color={config.soundEnabled ? 'success' : 'default'}
                variant="outlined"
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e5e7eb' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#666', mb: 0.5 }}>
                Vibration
              </Typography>
              <Chip
                size="small"
                label={config.vibrateEnabled ? 'Enabled' : 'Disabled'}
                color={config.vibrateEnabled ? 'success' : 'default'}
                variant="outlined"
              />
            </Box>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 1, bgcolor: 'white', borderRadius: 1, border: '1px solid #e5e7eb' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#666', mb: 0.5 }}>
                Require Interaction
              </Typography>
              <Chip
                size="small"
                label={config.requireInteraction ? 'Yes' : 'No'}
                color={config.requireInteraction ? 'warning' : 'default'}
                variant="outlined"
              />
            </Box>
          </Grid>
        </Grid>

        <Typography sx={{ fontSize: 11, color: '#999', mt: 2 }}>
          These settings are saved to your browser's local storage and will persist across sessions.
        </Typography>
      </Paper>
    </Box>
  )
}
