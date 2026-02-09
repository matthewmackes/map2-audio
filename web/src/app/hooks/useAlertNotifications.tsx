/**
 * Alert Notifications System - Visual and audio alerts for critical conditions
 * Supports toast notifications, sound alerts, and browser notifications
 */

import { useState, useCallback, useRef } from 'react'

export type AlertSeverity = 'warning' | 'critical'
export type AlertType = 'temperature' | 'cpu' | 'memory' | 'disk'

export interface AlertNotification {
  id: string
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  timestamp: number
}

/**
 * Hook for managing alert notifications
 */
export function useAlertNotifications() {
  const [notifications, setNotifications] = useState<AlertNotification[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const notificationPermissionRef = useRef<NotificationPermission | null>(null)

  // Request notification permission on first use
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications')
      return false
    }

    if (Notification.permission === 'granted') {
      notificationPermissionRef.current = 'granted'
      return true
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      notificationPermissionRef.current = permission
      return permission === 'granted'
    }

    return false
  }, [])

  /**
   * Get alert message based on type
   */
  const getAlertMessage = useCallback((type: AlertType, value: number, threshold: number) => {
    const diff = Math.abs(value - threshold)
    const unit = type === 'temperature' ? '°C' : '%'

    const messages: Record<AlertType, { title: string; message: string }> = {
      temperature: {
        title: '🌡️ Temperature Warning',
        message: `CPU temperature at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      cpu: {
        title: '⚙️ CPU Usage Alert',
        message: `CPU usage at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      memory: {
        title: '💾 Memory Alert',
        message: `Memory usage at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      disk: {
        title: '💿 Disk Space Alert',
        message: `Disk usage at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
    }

    return messages[type] || { title: 'Alert', message: 'System alert triggered' }
  }, [])

  /**
   * Play warning sound
   */
  const playWarningSound = useCallback(async (severity: AlertSeverity) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Different tones for different severities
      if (severity === 'critical') {
        // Critical: higher frequency, pulsing pattern
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime)
        oscillator.frequency.setValueAtTime(1200, audioContext.currentTime + 0.1)

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)

        // Play second beep
        const osc2 = audioContext.createOscillator()
        const gain2 = audioContext.createGain()
        osc2.connect(gain2)
        gain2.connect(audioContext.destination)

        osc2.frequency.setValueAtTime(1200, audioContext.currentTime + 0.6)
        gain2.gain.setValueAtTime(0.3, audioContext.currentTime + 0.6)
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.1)

        osc2.start(audioContext.currentTime + 0.6)
        osc2.stop(audioContext.currentTime + 1.1)
      } else {
        // Warning: lower frequency, single tone
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.3)
      }
    } catch (error) {
      console.warn('Could not play alert sound:', error)
    }
  }, [])

  /**
   * Show visual toast notification
   */
  const showToastNotification = useCallback((
    type: AlertType,
    severity: AlertSeverity,
    value: number,
    threshold: number
  ) => {
    const { title, message } = getAlertMessage(type, value, threshold)
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const notification: AlertNotification = {
      id,
      type,
      severity,
      title,
      message,
      timestamp: Date.now(),
    }

    setNotifications((prev) => [...prev, notification])

    // Auto-remove after 8 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    }, 8000)

    return id
  }, [getAlertMessage])

  /**
   * Show browser notification
   */
  const showBrowserNotification = useCallback(
    async (type: AlertType, severity: AlertSeverity, value: number, threshold: number) => {
      const hasPermission = await requestNotificationPermission()
      if (!hasPermission) {
        return false
      }

      const { title, message } = getAlertMessage(type, value, threshold)

      try {
        new Notification(title, {
          body: message,
          icon: severity === 'critical' ? '🚨' : '⚠️',
          badge: '/img/logo.png',
          tag: `alert_${type}`,
          requireInteraction: severity === 'critical',
          silent: false,
        })
        return true
      } catch (error) {
        console.error('Failed to show notification:', error)
        return false
      }
    },
    [requestNotificationPermission, getAlertMessage]
  )

  /**
   * Show comprehensive alert with all notification types
   */
  const showAlert = useCallback(
    async (
      type: AlertType,
      severity: AlertSeverity,
      value: number,
      threshold: number,
      options?: {
        sound?: boolean
        toast?: boolean
        notification?: boolean
      }
    ) => {
      const defaults = { sound: true, toast: true, notification: severity === 'critical' }
      const config = { ...defaults, ...options }

      if (config.sound) {
        await playWarningSound(severity)
      }

      if (config.toast) {
        showToastNotification(type, severity, value, threshold)
      }

      if (config.notification) {
        await showBrowserNotification(type, severity, value, threshold)
      }
    },
    [playWarningSound, showToastNotification, showBrowserNotification]
  )

  /**
   * Dismiss a notification
   */
  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  /**
   * Dismiss all notifications
   */
  const dismissAllNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  /**
   * Get severity badge color
   */
  const getSeverityColor = useCallback((severity: AlertSeverity): string => {
    return severity === 'critical' ? '#ef4444' : '#f59e0b'
  }, [])

  /**
   * Get type icon
   */
  const getTypeIcon = useCallback((type: AlertType): string => {
    const icons: Record<AlertType, string> = {
      temperature: '🌡️',
      cpu: '⚙️',
      memory: '💾',
      disk: '💿',
    }
    return icons[type] || '⚠️'
  }, [])

  return {
    notifications,
    showAlert,
    showToastNotification,
    showBrowserNotification,
    playWarningSound,
    dismissNotification,
    dismissAllNotifications,
    requestNotificationPermission,
    getSeverityColor,
    getTypeIcon,
  }
}

/**
 * React component for displaying alert notifications
 */
import { Box, Paper, Typography, IconButton, Collapse } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

export interface AlertNotificationsProps {
  notifications: AlertNotification[]
  onDismiss: (id: string) => void
}

export function AlertNotificationsContainer({ notifications, onDismiss }: AlertNotificationsProps) {
  const getSeverityColor = (severity: AlertSeverity) =>
    severity === 'critical' ? '#ef4444' : '#f59e0b'

  const getTypeEmoji = (type: AlertType) => {
    const emojis: Record<AlertType, string> = {
      temperature: '🌡️',
      cpu: '⚙️',
      memory: '💾',
      disk: '💿',
    }
    return emojis[type]
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 400,
      }}
    >
      {notifications.map((notification) => (
        <Paper
          key={notification.id}
          sx={{
            p: 2,
            backgroundColor: getSeverityColor(notification.severity),
            color: '#fff',
            borderRadius: 1,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            animation: 'slideIn 0.3s ease-in-out',
            '@keyframes slideIn': {
              from: {
                transform: 'translateX(400px)',
                opacity: 0,
              },
              to: {
                transform: 'translateX(0)',
                opacity: 1,
              },
            },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 0.5 }}>
                {getTypeEmoji(notification.type)} {notification.title}
              </Typography>
              <Typography sx={{ fontSize: 12, opacity: 0.95 }}>
                {notification.message}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={() => onDismiss(notification.id)}
              sx={{
                color: '#fff',
                '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
                ml: 1,
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      ))}
    </Box>
  )
}
