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
    // Audit Fit-10 (cycle 31): SSR guard. Server-render contexts have
    // no `window`; reading localStorage there throws ReferenceError
    // and crashes the initial render. Returning the default keeps
    // SSR / SSG / Jest-Node environments safe.
    if (typeof window === 'undefined') {
      return defaultValue
    }
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
      setValue((prev) => {
        const valueToStore = newValue instanceof Function ? newValue(prev) : newValue
        // Audit Fit-10 (cycle 31): SSR guard on the write path too —
        // the setter can be invoked from an effect that fires on a
        // client-only re-render, but defensively guard for symmetry
        // with the read path.
        if (typeof window === 'undefined') {
          return valueToStore
        }
        try {
          window.localStorage.setItem(
            key,
            options?.serialize ? options.serialize(valueToStore) : JSON.stringify(valueToStore)
          )
        } catch (error) {
          console.error(`Error writing to localStorage (${key}):`, error)
        }
        return valueToStore
      })
    },
    [key, options]
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

/**
 * usePersistedThresholds - Load/save health thresholds
 * Enhanced version with HealthSettings type
 */
export function usePersistedThresholds(defaultThresholds: HealthSettings) {
  const [thresholds, setThresholds] = useState<HealthSettings>(defaultThresholds)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const loadThresholds = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.healthSettings)
        if (stored) {
          const parsed = JSON.parse(stored) as HealthSettings
          setThresholds(parsed)
        }
      } catch (error) {
        console.error('Failed to load thresholds from localStorage:', error)
      } finally {
        setIsLoaded(true)
      }
    }

    loadThresholds()
  }, [])

  const saveThresholds = useCallback(
    (newThresholds: HealthSettings) => {
      try {
        localStorage.setItem(STORAGE_KEYS.healthSettings, JSON.stringify(newThresholds))
        setThresholds(newThresholds)
      } catch (error) {
        console.error('Failed to save thresholds to localStorage:', error)
      }
    },
    []
  )

  const resetThresholds = useCallback(() => {
    saveThresholds(defaultThresholds)
  }, [defaultThresholds, saveThresholds])

  return {
    thresholds,
    saveThresholds,
    resetThresholds,
    isLoaded,
  }
}

/**
 * usePersistedAlertHistory - Load/save alert history
 */
export function usePersistedAlertHistory(maxAlerts: number = 100) {
  const [alerts, setAlerts] = useState<StoredAlert[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const loadAlerts = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.alertHistory)
        if (stored) {
          const parsed = JSON.parse(stored) as StoredAlert[]
          setAlerts(parsed)
        }
      } catch (error) {
        console.error('Failed to load alert history from localStorage:', error)
      } finally {
        setIsLoaded(true)
      }
    }

    loadAlerts()
  }, [])

  const addAlert = useCallback(
    (alert: StoredAlert) => {
      setAlerts((prev) => {
        const updated = [alert, ...prev].slice(0, maxAlerts)
        try {
          localStorage.setItem(STORAGE_KEYS.alertHistory, JSON.stringify(updated))
        } catch (error) {
          console.error('Failed to save alert to localStorage:', error)
        }
        return updated
      })
    },
    [maxAlerts]
  )

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEYS.alertHistory)
      setAlerts([])
    } catch (error) {
      console.error('Failed to clear alert history:', error)
    }
  }, [])

  const getAlertsByDateRange = useCallback(
    (startTime: number, endTime: number) => {
      return alerts.filter((a) => a.timestamp >= startTime && a.timestamp <= endTime)
    },
    [alerts]
  )

  return {
    alerts,
    addAlert,
    clearHistory,
    getAlertsByDateRange,
    isLoaded,
  }
}

/**
 * usePersistedPreferences - Load/save user preferences
 */
export interface UserPreferences {
  autoRefresh: boolean
  useWebSocket: boolean
  refreshInterval: number
  metricsHistorySize: number
  soundAlertsEnabled: boolean
  notificationsEnabled: boolean
  darkMode: boolean
  chartType: 'line' | 'area'
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoRefresh: true,
  useWebSocket: true,
  refreshInterval: 2,
  metricsHistorySize: 360,
  soundAlertsEnabled: true,
  notificationsEnabled: true,
  darkMode: false,
  chartType: 'line',
}

export function usePersistedPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const loadPreferences = () => {
      try {
        const stored = localStorage.getItem('hmp_preferences')
        if (stored) {
          const parsed = JSON.parse(stored) as UserPreferences
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed })
        }
      } catch (error) {
        console.error('Failed to load preferences from localStorage:', error)
      } finally {
        setIsLoaded(true)
      }
    }

    loadPreferences()
  }, [])

  const savePreferences = useCallback((newPrefs: Partial<UserPreferences>) => {
    try {
      const updated = { ...preferences, ...newPrefs }
      localStorage.setItem('hmp_preferences', JSON.stringify(updated))
      setPreferences(updated)
    } catch (error) {
      console.error('Failed to save preferences to localStorage:', error)
    }
  }, [preferences])

  const resetPreferences = useCallback(() => {
    try {
      localStorage.removeItem('hmp_preferences')
      setPreferences(DEFAULT_PREFERENCES)
    } catch (error) {
      console.error('Failed to reset preferences:', error)
    }
  }, [])

  return {
    preferences,
    savePreferences,
    resetPreferences,
    isLoaded,
  }
}

/**
 * Get storage size usage (for debugging)
 */
export function getStorageUsage() {
  let totalSize = 0

  try {
    Object.values(STORAGE_KEYS).forEach((key) => {
      const item = localStorage.getItem(key)
      if (item) {
        totalSize += item.length
      }
    })
  } catch (error) {
    console.error('Failed to calculate storage usage:', error)
  }

  return {
    bytes: totalSize,
    kb: (totalSize / 1024).toFixed(2),
  }
}
