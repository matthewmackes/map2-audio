/**
 * useSpecialSettings - State management hook for special mode
 * 
 * Provides:
 * - Current special settings from API
 * - Update function that saves to backend
 * - Automatic reload on WebSocket events (for cluster sync)
 * - Loading state
 */

import { useState, useEffect, useCallback } from 'react'
import { apiUrl, wsUrl } from '../utils/apiTarget'

export interface SpecialSettings {
  enabled: boolean
  hiddenPlugins: string[]
  menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
  version?: number
  lastUpdated?: string
  updatedByNode?: string
}

interface UseSpecialSettingsReturn {
  settings: SpecialSettings | null
  isLoading: boolean
  error: string | null
  updateSettings: (newSettings: Partial<SpecialSettings>) => Promise<void>
  reload: () => Promise<void>
}

export function useSpecialSettings(): UseSpecialSettingsReturn {
  const [settings, setSettings] = useState<SpecialSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch(apiUrl('/api/settings/special'))
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      setSettings({
        enabled: data.enabled || false,
        hiddenPlugins: data.hidden_plugins || [],
        menuLocation: data.menu_location || 'top-nav',
        version: data.version,
        lastUpdated: data.last_updated,
        updatedByNode: data.updated_by_node,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings'
      setError(message)
      console.error('Failed to load special settings:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateSettings = useCallback(async (newSettings: Partial<SpecialSettings>) => {
    setError(null)
    
    try {
      const payload = {
        enabled: newSettings.enabled ?? settings?.enabled ?? false,
        hidden_plugins: newSettings.hiddenPlugins ?? settings?.hiddenPlugins ?? [],
        menu_location: newSettings.menuLocation ?? settings?.menuLocation ?? 'top-nav',
      }
      
      let response = await fetch(apiUrl('/api/settings/special'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      // Handle cluster mode leader redirect (HTTP 307)
      if (response.status === 307) {
        const location = response.headers.get('Location')
        if (location) {
          console.log('Cluster mode: redirecting settings update to leader:', location)
          
          // Retry on leader
          response = await fetch(location, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })
        }
      }

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('Cluster has no leader. Please try again.')
        } else if (response.status === 504) {
          throw new Error('Settings update timed out. May still succeed.')
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      setSettings({
        enabled: data.enabled,
        hiddenPlugins: data.hidden_plugins || [],
        menuLocation: data.menu_location,
        version: data.version,
        lastUpdated: data.last_updated,
        updatedByNode: data.updated_by_node,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings'
      setError(message)
      console.error('Failed to update special settings:', err)
      throw err
    }
  }, [settings, loadSettings])

  // Load initial settings on mount
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // WebSocket listener for cluster sync
  // When a node in the cluster updates special settings, all connected clients
  // are notified and reload settings automatically
  useEffect(() => {
    const eventsWsUrl = wsUrl('/ws/events')
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      try {
        ws = new WebSocket(eventsWsUrl)

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'special_settings_update') {
              // Another node updated settings — reload from backend
              loadSettings()
            }
          } catch {
            // Ignore non-JSON messages
          }
        }

        ws.onclose = () => {
          // Reconnect after a delay (cluster sync is non-critical)
          reconnectTimer = setTimeout(connect, 10000)
        }

        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        // WebSocket not available — silently degrade (single-node mode)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
    }
  }, [loadSettings])

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    reload: loadSettings,
  }
}
