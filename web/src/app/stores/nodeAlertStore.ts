import { create } from 'zustand'

export type NodeAlert = {
  id: string
  node_id: string
  hostname: string
  severity: 'warn' | 'critical'
  message: string
  timestamp: string
  dismissed: boolean
}

type NodeAlertState = {
  alerts: NodeAlert[]
  toasts: NodeAlert[]
  collapsed: boolean
  upsertAlert: (alert: NodeAlert) => void
  dismissAlert: (nodeId: string) => void
  enqueueToast: (alert: NodeAlert) => void
  removeToast: (alertId: string) => void
  setCollapsed: (collapsed: boolean) => void
}

export const useNodeAlertStore = create<NodeAlertState>((set) => ({
  alerts: [],
  toasts: [],
  collapsed: false,
  upsertAlert: (alert) => {
    set((state) => {
      const nextAlerts = state.alerts.filter((entry) => entry.node_id !== alert.node_id)
      nextAlerts.unshift(alert)
      return { alerts: nextAlerts.slice(0, 20) }
    })
  },
  dismissAlert: (nodeId) => {
    set((state) => ({
      alerts: state.alerts.filter((alert) => alert.node_id !== nodeId),
      toasts: state.toasts.filter((alert) => alert.node_id !== nodeId),
    }))
  },
  enqueueToast: (alert) => {
    set((state) => {
      const nextToasts = [...state.toasts.filter((entry) => entry.node_id !== alert.node_id), alert]
      return { toasts: nextToasts.slice(-3) }
    })
  },
  removeToast: (alertId) => {
    set((state) => ({
      toasts: state.toasts.filter((alert) => alert.id !== alertId),
    }))
  },
  setCollapsed: (collapsed) => set({ collapsed }),
}))

