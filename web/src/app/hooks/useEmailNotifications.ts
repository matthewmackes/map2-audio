/**
 * useEmailNotifications Hook - Send email alerts for critical conditions
 * Integrates with backend email service
 */

import { useCallback, useRef } from 'react'

export interface EmailNotificationConfig {
  recipients: string[]
  enabled: boolean
  criticalOnly: boolean
  throttleMinutes: number
}

export interface EmailAlert {
  id: string
  recipient: string
  type: 'temperature' | 'cpu' | 'memory' | 'disk'
  severity: 'warning' | 'critical'
  value: number
  threshold: number
  timestamp: number
  status: 'pending' | 'sent' | 'failed'
  error?: string
}

/**
 * Hook for managing email notifications
 */
export function useEmailNotifications() {
  const lastEmailTimeRef = useRef<Record<string, number>>({})

  /**
   * Check if email should be sent based on throttling
   */
  const shouldSendEmail = useCallback(
    (recipients: string[], throttleMinutes: number, key: string): boolean => {
      const now = Date.now()
      const lastSentTime = lastEmailTimeRef.current[key] || 0
      const throttleMs = throttleMinutes * 60 * 1000

      if (now - lastSentTime >= throttleMs) {
        lastEmailTimeRef.current[key] = now
        return true
      }

      return false
    },
    []
  )

  /**
   * Send email alert for condition
   */
  const sendEmailAlert = useCallback(
    async (
      recipients: string[],
      type: 'temperature' | 'cpu' | 'memory' | 'disk',
      severity: 'warning' | 'critical',
      value: number,
      threshold: number,
      config: Omit<EmailNotificationConfig, 'recipients'>
    ): Promise<EmailAlert | null> => {
      // Check if email sending is enabled
      if (!config.enabled) {
        return null
      }

      // Check if we should send (not critical-only, or it's critical)
      if (config.criticalOnly && severity !== 'critical') {
        return null
      }

      // Check throttling
      const key = `${type}_${severity}`
      if (!shouldSendEmail(recipients, config.throttleMinutes, key)) {
        return null
      }

      const emailAlert: EmailAlert = {
        id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipient: recipients.join(', '),
        type,
        severity,
        value,
        threshold,
        timestamp: Date.now(),
        status: 'pending',
      }

      try {
        // Call backend API to send email
        const response = await fetch('/api/notifications/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipients,
            type,
            severity,
            value,
            threshold,
            timestamp: new Date(emailAlert.timestamp).toISOString(),
          }),
        })

        if (!response.ok) {
          throw new Error(`Email API returned ${response.status}`)
        }

        emailAlert.status = 'sent'
        return emailAlert
      } catch (error) {
        emailAlert.status = 'failed'
        emailAlert.error = error instanceof Error ? error.message : 'Unknown error'
        console.error('Failed to send email alert:', error)
        return emailAlert
      }
    },
    [shouldSendEmail]
  )

  /**
   * Send test email
   */
  const sendTestEmail = useCallback(async (recipients: string[]): Promise<boolean> => {
    try {
      const response = await fetch('/api/notifications/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipients }),
      })

      return response.ok
    } catch (error) {
      console.error('Test email failed:', error)
      return false
    }
  }, [])

  /**
   * Verify email addresses
   */
  const verifyEmails = useCallback(async (recipients: string[]): Promise<Record<string, boolean>> => {
    try {
      const response = await fetch('/api/notifications/email/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipients }),
      })

      if (response.ok) {
        return await response.json()
      }

      return {}
    } catch (error) {
      console.error('Email verification failed:', error)
      return {}
    }
  }, [])

  /**
   * Reset throttle for a specific alert type
   */
  const resetThrottle = useCallback((key: string) => {
    delete lastEmailTimeRef.current[key]
  }, [])

  /**
   * Reset all throttles
   */
  const resetAllThrottles = useCallback(() => {
    lastEmailTimeRef.current = {}
  }, [])

  /**
   * Get throttle status for a type
   */
  const getThrottleStatus = useCallback(
    (key: string, throttleMinutes: number): { isThrottled: boolean; minutesUntilSend: number } => {
      const now = Date.now()
      const lastSentTime = lastEmailTimeRef.current[key] || 0
      const throttleMs = throttleMinutes * 60 * 1000
      const timeSinceLast = now - lastSentTime
      const isThrottled = timeSinceLast < throttleMs
      const minutesUntilSend = isThrottled
        ? Math.ceil((throttleMs - timeSinceLast) / 60000)
        : 0

      return { isThrottled, minutesUntilSend }
    },
    []
  )

  return {
    sendEmailAlert,
    sendTestEmail,
    verifyEmails,
    resetThrottle,
    resetAllThrottles,
    getThrottleStatus,
  }
}
