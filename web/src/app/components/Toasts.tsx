import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react'

export type NotificationTone = 'info' | 'success' | 'warn' | 'error'

interface Notification {
  id: string
  message: string
  tone: NotificationTone
  timestamp: number
}

interface NotificationContextValue {
  pushNotification: (message: string, tone?: NotificationTone) => void
  clearNotifications: () => void
  notifications: Notification[]
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
  }, [])

  const pushNotification = useCallback((message: string, tone: NotificationTone = 'info') => {
    const id = crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2) + Date.now().toString(16)
    const timestamp = Date.now()
    setNotifications((prev) => [...prev, { id, message, tone, timestamp }])

    // Auto-remove after 5 seconds for non-error notifications
    if (tone !== 'error') {
      const timer = setTimeout(() => removeNotification(id), 5000)
      timersRef.current.set(id, timer)
    }
  }, [removeNotification])

  const clearNotifications = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer))
    timersRef.current.clear()
    setNotifications([])
  }, [])

  const value = useMemo(() => ({ 
    pushNotification, 
    clearNotifications,
    notifications 
  }), [pushNotification, clearNotifications, notifications])

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
        <button 
          onClick={clearNotifications} 
          className="btn btn-sm"
          aria-label="Clear all notifications"
        >
          Clear
        </button>
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

  const icons: Record<NotificationTone, string> = {
    success: '✓',
    error: '⚠',
    warn: '!',
    info: 'ℹ'
  }

  return (
    <div className={`notification-item notification-${notification.tone}`}>
      <span className="notification-icon">{icons[notification.tone]}</span>
      <div className="notification-content">
        <p>{notification.message}</p>
        <span className="notification-time">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <button
        onClick={() => ctx.pushNotification}
        className="notification-dismiss"
        aria-label="Dismiss"
      >
        ✕
      </button>
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
  const { pushNotification: pushToast } = useNotifications()
  return { pushToast }
}

export { NotificationProvider as ToastProvider }

