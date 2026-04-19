/**
 * Alert Notifications System - Visual and audio alerts for critical conditions
 * Supports toast notifications, sound alerts, and browser notifications
 */

import './useAlertNotifications.css'

import { useCallback, useMemo, useRef } from 'react'
import { Activity, Close, DataBase, TemperatureHot, WarningAltFilled } from '@carbon/icons-react'
import { useNotifications as useAppNotifications } from '../components/Toasts'

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
  const notificationPermissionRef = useRef<NotificationPermission | null>(null)
  const {
    notifications: appNotifications,
    pushNotification,
    dismissNotification: dismissAppNotification,
  } = useAppNotifications()

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
    const unit = type === 'temperature' ? '°C' : '%'

    const messages: Record<AlertType, { title: string; message: string }> = {
      temperature: {
        title: 'Temperature Warning',
        message: `CPU temperature at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      cpu: {
        title: 'CPU Usage Alert',
        message: `CPU usage at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      memory: {
        title: 'Memory Alert',
        message: `Memory usage at ${value}${unit} (threshold: ${threshold}${unit})`,
      },
      disk: {
        title: 'Disk Space Alert',
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
    const id = `system-alert:${type}`
    pushNotification(message, severity === 'critical' ? 'error' : 'warn', {
      id,
      title,
      persistent: severity === 'critical',
      durationMs: 8000,
      stage: {
        kind: severity === 'critical' ? 'critical_alert' : 'warning_alert',
        severity: severity === 'critical' ? 'critical' : 'warning',
        resource: {
          kind: 'device',
          id: type,
        },
        compactLabel: title,
        sourceLabel: 'System monitor',
        replaceLiveBanner: true,
      },
    })

    return id
  }, [getAlertMessage, pushNotification])

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
    dismissAppNotification(id)
  }, [dismissAppNotification])

  /**
   * Dismiss all notifications
   */
  const dismissAllNotifications = useCallback(() => {
    appNotifications
      .filter((notification) => notification.id.startsWith('system-alert:'))
      .forEach((notification) => dismissAppNotification(notification.id))
  }, [appNotifications, dismissAppNotification])

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
      temperature: 'temperature',
      cpu: 'cpu',
      memory: 'memory',
      disk: 'disk',
    }
    return icons[type] || 'alert'
  }, [])

  const notifications = useMemo<AlertNotification[]>(() => (
    appNotifications
      .filter((notification) => notification.id.startsWith('system-alert:'))
      .map((notification) => {
        const type = notification.id.replace('system-alert:', '') as AlertType
        return {
          id: notification.id,
          type,
          severity: notification.tone === 'error' ? 'critical' : 'warning',
          title: notification.title,
          message: notification.message,
          timestamp: notification.updatedAt,
        }
      })
  ), [appNotifications])

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

export interface AlertNotificationsProps {
  notifications: AlertNotification[]
  onDismiss: (id: string) => void
}

export function AlertNotificationsContainer({ notifications, onDismiss }: AlertNotificationsProps) {
  const getTypeIconNode = (type: AlertType) => {
    const icons: Record<AlertType, React.ReactNode> = {
      temperature: <TemperatureHot size={16} />,
      cpu: <Activity size={16} />,
      memory: <DataBase size={16} />,
      disk: <DataBase size={16} />,
    }
    return icons[type] || <WarningAltFilled size={16} />
  }

  return (
    <div className="alert-notification-stack" aria-live="assertive">
      {notifications.map((notification) => (
        <section
          key={notification.id}
          className={`alert-notification-card alert-notification-card--${notification.severity}`}
          role="alert"
        >
          <div className="alert-notification-card__body">
            <p className="alert-notification-card__title">
              {getTypeIconNode(notification.type)}
              <span>{notification.title}</span>
            </p>
            <p className="alert-notification-card__message">{notification.message}</p>
          </div>
          <button
            type="button"
            className="alert-notification-card__dismiss"
            aria-label={`Dismiss ${notification.title}`}
            title={`Dismiss ${notification.title}`}
            onClick={() => onDismiss(notification.id)}
          >
            <Close size={16} />
          </button>
        </section>
      ))}
    </div>
  )
}
