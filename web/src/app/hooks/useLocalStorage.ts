/**
 * useLocalStorage Hook - Persistent data storage for settings and metrics
 * Provides type-safe localStorage operations with automatic serialization
 */

import { useCallback, useEffect, useState } from 'react'

export interface StorageKeys {
  healthSettings: 'host_machine_health_settings'
  alertHistory: 'host_machine_alert_history'
  metricsHistory: 'host_machine_metrics_history'
  webSocketEnabled: 'host_machine_websocket_enabled'
  refreshInterval: 'host_machine_refresh_interval'
}

const STORAGE_KEYS: StorageKeys = {
  healthSettings: 'host_machine_health_settings',
  alertHistory: 'host_machine_alert_history',
  metricsHistory: 'host_machine_metrics_history',
  webSocketEnabled: 'host_machine_websocket_enabled',
  refreshInterval: 'host_machine_refresh_interval',
}

export interface HealthSettings {
  tempWarning: number
  tempCritical: number
  cpuWarning: number
  cpuCritical: number
  memWarning: number
  memCritical: number
  diskWarning: number
  diskCritical: number
}

export const defaultHealthSettings: HealthSettings = {
  tempWarning: 70,
  tempCritical: 85,
  cpuWarning: 75,
  cpuCritical: 90,
  memWarning: 75,
  memCritical: 90,
  diskWarning: 80,
  diskCritical: 95,
}

export interface StoredAlert {
  id: string
  timestamp: number
  type: 'temperature' | 'cpu' | 'memory' | 'disk'
  severity: 'warning' | 'critical'
  value: number
  threshold: number
  acknowledged: boolean
}

/**
 * Hook for managing localStorage with type safety
 * Automatically serializes/deserializes data
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: { serialize?: (v: T) => string; deserialize?: (v: string) => T }
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item !== null) {
        return options?.deserialize ? options.deserialize(item) : JSON.parse(item)
      }
      return defaultValue
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error)
      return defaultValue
    }
  })

  const setStoredValue = useCallback(
    (newValue: T | ((val: T) => T)) => {
      try {
        const valueToStore = newValue instanceof Function ? newValue(value) : newValue
        setValue(valueToStore)
        window.localStorage.setItem(
          key,
          options?.serialize ? options.serialize(valueToStore) : JSON.stringify(valueToStore)
        )
      } catch (error) {
        console.error(`Error writing to localStorage (${key}):`, error)
      }
    },
    [key, value, options]
  )

  return [value, setStoredValue] as const
}

/**
 * Hook for managing health settings with localStorage persistence
 */
export function useHealthSettings() {
  const [settings, setSettings] = useLocalStorage<HealthSettings>(
    STORAGE_KEYS.healthSettings,
    defaultHealthSettings
  )

  const updateSettings = useCallback(
    (updates: Partial<HealthSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }))
    },
    [setSettings]
  )

  const resetToDefaults = useCallback(() => {
    setSettings(defaultHealthSettings)
  }, [setSettings])

  return { settings, updateSettings, resetToDefaults }
}

/**
 * Hook for managing alert history with localStorage persistence
 * Keeps last 100 alerts, automatically removes old ones
 */
export function useAlertHistory(maxAlerts = 100) {
  const [alerts, setAlerts] = useLocalStorage<StoredAlert[]>(STORAGE_KEYS.alertHistory, [])

  const addAlert = useCallback(
    (alert: Omit<StoredAlert, 'id' | 'timestamp'>) => {
      const newAlert: StoredAlert = {
        ...alert,
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }

      setAlerts((prev) => {
        const updated = [newAlert, ...prev]
        return updated.slice(0, maxAlerts)
      })

      return newAlert.id
    },
    [setAlerts, maxAlerts]
  )

  const acknowledgeAlert = useCallback(
    (alertId: string) => {
      setAlerts((prev) =>
        prev.map((alert) => (alert.id === alertId ? { ...alert, acknowledged: true } : alert))
      )
    },
    [setAlerts]
  )

  const clearAcknowledged = useCallback(() => {
    setAlerts((prev) => prev.filter((alert) => !alert.acknowledged))
  }, [setAlerts])

  const clearAll = useCallback(() => {
    setAlerts([])
  }, [setAlerts])

  const getUnacknowledgedCount = useCallback(() => {
    return alerts.filter((a) => !a.acknowledged).length
  }, [alerts])

  const getCriticalCount = useCallback(() => {
    return alerts.filter((a) => a.severity === 'critical' && !a.acknowledged).length
  }, [alerts])

  return {
    alerts,
    addAlert,
    acknowledgeAlert,
    clearAcknowledged,
    clearAll,
    getUnacknowledgedCount,
    getCriticalCount,
  }
}

/**
 * Hook for managing WebSocket enabled state with persistence
 */
export function useWebSocketPreference(defaultEnabled = true) {
  const [enabled, setEnabled] = useLocalStorage(
    STORAGE_KEYS.webSocketEnabled,
    defaultEnabled
  )

  return { enabled, setEnabled }
}

/**
 * Hook for managing refresh interval with persistence
 */
export function useRefreshInterval(defaultInterval = 2000) {
  const [interval, setInterval] = useLocalStorage(
    STORAGE_KEYS.refreshInterval,
    defaultInterval
  )

  const updateInterval = useCallback(
    (newInterval: number) => {
      if (newInterval >= 1000 && newInterval <= 60000) {
        setInterval(newInterval)
        return true
      }
      return false
    },
    [setInterval]
  )

  return { interval, updateInterval }
}

/**
 * Utility to clear all host machine related storage
 */
export function clearAllHostMachineStorage() {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      window.localStorage.removeItem(key)
    })
  } catch (error) {
    console.error('Error clearing localStorage:', error)
  }
}

/**
 * Utility to export all settings as JSON
 */
export function exportHostMachineSettings() {
  try {
    const data: Record<string, any> = {}
    Object.entries(STORAGE_KEYS).forEach(([, key]) => {
      const value = window.localStorage.getItem(key)
      if (value) {
        data[key] = JSON.parse(value)
      }
    })
    return JSON.stringify(data, null, 2)
  } catch (error) {
    console.error('Error exporting settings:', error)
    return null
  }
}

/**
 * Utility to import settings from JSON
 */
export function importHostMachineSettings(jsonString: string): boolean {
  try {
    const data = JSON.parse(jsonString)
    Object.entries(STORAGE_KEYS).forEach(([, key]) => {
      if (key in data) {
        window.localStorage.setItem(key, JSON.stringify(data[key]))
      }
    })
    return true
  } catch (error) {
    console.error('Error importing settings:', error)
    return false
  }
}
