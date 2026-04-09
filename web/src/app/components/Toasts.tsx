import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react'
import { ActionableNotification, Button, ToastNotification } from '@carbon/react'
import './Toasts.css'

export type NotificationTone = 'info' | 'success' | 'warn' | 'error'

export interface NotificationAction {
  label: string
  onClick: () => void
}

export interface NotificationOptions {
  id?: string
  persistent?: boolean
  durationMs?: number
  action?: NotificationAction
}

interface Notification {
  id: string
  message: string
  tone: NotificationTone
  timestamp: number
  persistent: boolean
  action?: NotificationAction
}

interface NotificationContextValue {
  pushNotification: (message: string, tone?: NotificationTone, options?: NotificationOptions) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
  notifications: Notification[]
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
  }, [])

  const pushNotification = useCallback((message: string, tone: NotificationTone = 'info', options: NotificationOptions = {}) => {
    const id = options.id ?? (crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2) + Date.now().toString(16))
    const timestamp = Date.now()
    const persistent = Boolean(options.persistent)

    setNotifications((prev) => {
      const withoutCurrent = prev.filter((n) => n.id !== id)
      return [...withoutCurrent, { id, message, tone, timestamp, persistent, action: options.action }]
    })

    const existingTimer = timersRef.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      timersRef.current.delete(id)
    }

    // Auto-remove unless explicitly marked as persistent.
    if (!persistent && tone !== 'error') {
      const durationMs = options.durationMs ?? 5000
      const timer = setTimeout(() => dismissNotification(id), durationMs)
      timersRef.current.set(id, timer)
    }
  }, [dismissNotification])

  const clearNotifications = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer))
    timersRef.current.clear()
    setNotifications([])
  }, [])

  const value = useMemo(() => ({ 
    pushNotification, 
    dismissNotification,
    clearNotifications,
    notifications 
  }), [pushNotification, dismissNotification, clearNotifications, notifications])

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationPanel />
    </NotificationContext.Provider>
  )
}

function NotificationPanel() {
  const ctx = useContext(NotificationContext)
  if (!ctx) return null

  const { notifications, clearNotifications } = ctx

  if (notifications.length === 0) return null

  return (
    <div className="notification-panel" role="region" aria-live="polite" aria-label="Notifications">
      <div className="notification-panel-header">
        <h3>Notifications ({notifications.length})</h3>
        <Button onClick={clearNotifications} kind="ghost" size="sm" aria-label="Clear all notifications">
          Clear
        </Button>
      </div>
      <div className="notification-panel-content">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </div>
    </div>
  )
}

function NotificationItem({ notification }: { notification: Notification }) {
  const ctx = useContext(NotificationContext)
  if (!ctx) return null

  const titleByTone: Record<NotificationTone, string> = {
    success: 'Success',
    error: 'Error',
    warn: 'Warning',
    info: 'Info',
  }

  const kindByTone: Record<NotificationTone, 'error' | 'info' | 'success' | 'warning'> = {
    success: 'success',
    error: 'error',
    warn: 'warning',
    info: 'info',
  }

  const caption = new Date(notification.timestamp).toLocaleTimeString()
  const kind = kindByTone[notification.tone]

  if (notification.action) {
    return (
      <div className="notification-item">
        <ActionableNotification
          kind={kind}
          lowContrast
          role={notification.tone === 'error' ? 'alert' : 'status'}
          title={titleByTone[notification.tone]}
          subtitle={notification.message}
          actionButtonLabel={notification.action.label}
          onActionButtonClick={notification.action.onClick}
          onCloseButtonClick={() => ctx.dismissNotification(notification.id)}
        >
          {caption}
        </ActionableNotification>
      </div>
    )
  }

  return (
    <div className="notification-item">
      <ToastNotification
        kind={kind}
        lowContrast
        role={notification.tone === 'error' ? 'alert' : 'status'}
        title={titleByTone[notification.tone]}
        subtitle={notification.message}
        caption={caption}
        timeout={0}
        onCloseButtonClick={() => ctx.dismissNotification(notification.id)}
      />
    </div>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}

// Backward compatibility
export function useToasts() {
  const { pushNotification: pushToast, dismissNotification: dismissToast } = useNotifications()
  return { pushToast, dismissToast }
}

export { NotificationProvider as ToastProvider }
