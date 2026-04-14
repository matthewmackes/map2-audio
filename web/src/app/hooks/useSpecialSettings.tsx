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
import { defaultPinnedRoutes, normalizePinnedRoutes } from '../data/advancedMenuItems'
import {
  ensureRequiredHomeLauncher,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
  type LandingTilePlacement,
} from '../data/launcherCatalog'

const SPECIAL_SETTINGS_ENDPOINT = '/api/settings/special/'
const SPECIAL_SETTINGS_SYNC_EVENT = 'map2:special-settings-sync'

export interface SpecialSettings {
  enabled: boolean
  hiddenPlugins: string[]
  menuLocation: 'mobile-only' | 'hidden'
  pinnedRoutes: string[]
  landingTiles: LandingTilePlacement[]
  snapshotSetlistMode: boolean
  snapshotSetlistOrder: number[]
  lastActiveNode?: string | null
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

function resolvePinnedRoutes(data: Record<string, unknown>): string[] {
  const pinnedRoutes = data.pinned_routes
  if (Array.isArray(pinnedRoutes)) {
    return normalizePinnedRoutes(pinnedRoutes.filter((route): route is string => typeof route === 'string'))
  }

  const legacyRoutes = data.promoted_advanced_routes
  if (Array.isArray(legacyRoutes)) {
    return normalizePinnedRoutes(legacyRoutes.filter((route): route is string => typeof route === 'string'))
  }

  return normalizePinnedRoutes(defaultPinnedRoutes)
}

function resolveLandingTiles(data: Record<string, unknown>): LandingTilePlacement[] {
  const landingTiles = data.landing_tiles
  if (Array.isArray(landingTiles)) {
    const normalizedTiles = normalizeLandingTiles(landingTiles.filter((tile): tile is LandingTilePlacement | { route?: string | null; size?: string | null } => (
      typeof tile === 'object' && tile !== null
    )))
    return prioritizeRequiredHomeLauncher(ensureRequiredHomeLauncher(normalizedTiles))
  }

  return [{ route: '/workspace', size: 'medium' }]
}

function resolveSnapshotSetlistMode(data: Record<string, unknown>): boolean {
  return Boolean(data.snapshot_setlist_mode)
}

function resolveSnapshotSetlistOrder(data: Record<string, unknown>): number[] {
  const rawOrder = data.snapshot_setlist_order
  if (!Array.isArray(rawOrder)) {
    return []
  }

  const normalized: number[] = []
  const seen = new Set<number>()

  rawOrder.forEach((value) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || seen.has(value)) {
      return
    }

    seen.add(value)
    normalized.push(value)
  })

  return normalized
}

function toSpecialSettings(data: Record<string, unknown>): SpecialSettings {
  return {
    enabled: Boolean(data.enabled),
    hiddenPlugins: Array.isArray(data.hidden_plugins)
      ? data.hidden_plugins.filter((item): item is string => typeof item === 'string')
      : [],
    menuLocation: data.menu_location === 'mobile-only' ? 'mobile-only' : 'hidden',
    pinnedRoutes: resolvePinnedRoutes(data),
    landingTiles: resolveLandingTiles(data),
    snapshotSetlistMode: resolveSnapshotSetlistMode(data),
    snapshotSetlistOrder: resolveSnapshotSetlistOrder(data),
    lastActiveNode: typeof data.last_active_node === 'string' ? data.last_active_node : null,
    version: typeof data.version === 'number' ? data.version : undefined,
    lastUpdated: typeof data.last_updated === 'string' ? data.last_updated : undefined,
    updatedByNode: typeof data.updated_by_node === 'string' ? data.updated_by_node : undefined,
  }
}

function buildUpdatePayload(newSettings: Partial<SpecialSettings>, currentSettings: SpecialSettings | null) {
  const pinnedRoutes = normalizePinnedRoutes(newSettings.pinnedRoutes ?? currentSettings?.pinnedRoutes ?? defaultPinnedRoutes)
  const landingTiles = prioritizeRequiredHomeLauncher(
    ensureRequiredHomeLauncher(
      normalizeLandingTiles(newSettings.landingTiles ?? currentSettings?.landingTiles ?? []),
    ),
  )

  return {
    enabled: newSettings.enabled ?? currentSettings?.enabled ?? false,
    hidden_plugins: newSettings.hiddenPlugins ?? currentSettings?.hiddenPlugins ?? [],
    menu_location: newSettings.menuLocation ?? currentSettings?.menuLocation ?? 'hidden',
    pinned_routes: pinnedRoutes,
    landing_tiles: landingTiles,
    snapshot_setlist_mode: newSettings.snapshotSetlistMode ?? currentSettings?.snapshotSetlistMode ?? false,
    snapshot_setlist_order: newSettings.snapshotSetlistOrder ?? currentSettings?.snapshotSetlistOrder ?? [],
    promoted_advanced_routes: pinnedRoutes,
    last_active_node: newSettings.lastActiveNode ?? currentSettings?.lastActiveNode ?? null,
  }
}

export function useSpecialSettings(): UseSpecialSettingsReturn {
  const [settings, setSettings] = useState<SpecialSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(apiUrl(SPECIAL_SETTINGS_ENDPOINT))

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as Record<string, unknown>
      setSettings(toSpecialSettings(data))
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
      // Keep legacy writes until every deployed backend accepts pinned_routes.
      const payload = buildUpdatePayload(newSettings, settings)

      let response = await fetch(apiUrl(SPECIAL_SETTINGS_ENDPOINT), {
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

      const data = await response.json() as Record<string, unknown>
      const nextSettings = toSpecialSettings(data)
      setSettings(nextSettings)

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<SpecialSettings>(SPECIAL_SETTINGS_SYNC_EVENT, { detail: nextSettings }))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings'
      setError(message)
      console.error('Failed to update special settings:', err)
      throw err
    }
  }, [settings])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleSpecialSettingsSync = (event: Event) => {
      const customEvent = event as CustomEvent<SpecialSettings>
      if (customEvent.detail) {
        setSettings(customEvent.detail)
        setError(null)
        setIsLoading(false)
      }
    }

    window.addEventListener(SPECIAL_SETTINGS_SYNC_EVENT, handleSpecialSettingsSync as EventListener)
    return () => {
      window.removeEventListener(SPECIAL_SETTINGS_SYNC_EVENT, handleSpecialSettingsSync as EventListener)
    }
  }, [])

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
              loadSettings()
            }
          } catch {
            // Ignore non-JSON messages
          }
        }

        ws.onclose = () => {
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
