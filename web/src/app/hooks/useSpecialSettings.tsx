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

export const SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS = [
  { id: 'cascade', label: 'LED cascade' },
  { id: 'dashmarch', label: 'Dash march' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'packet', label: 'Packet' },
  { id: 'morse', label: 'Morse' },
  { id: 'reverse', label: 'Reverse' },
  { id: 'scan', label: 'Scan' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'heartbeat', label: 'Heartbeat' },
  { id: 'ants', label: 'Marching ants' },
  { id: 'slow', label: 'Slow' },
  { id: 'off', label: 'Off' },
] as const

export type SnapshotEditorFlowAnimation = typeof SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS[number]['id']
export type SnapshotEditorNodeShape = 'square' | 'rounded' | 'hex'

export interface SnapshotEditorSignalCanvasSettings {
  flowAnimation: SnapshotEditorFlowAnimation
  gridBackdrop: boolean
  nodeShape: SnapshotEditorNodeShape
}

export const DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS: SnapshotEditorSignalCanvasSettings = {
  flowAnimation: 'cascade',
  gridBackdrop: true,
  nodeShape: 'square',
}

export const SNAPSHOT_PRELOAD_PIN_CAP = 5

export interface SpecialSettings {
  enabled: boolean
  hiddenPlugins: string[]
  menuLocation: 'mobile-only' | 'hidden'
  pinnedRoutes: string[]
  landingTiles: LandingTilePlacement[]
  snapshotSetlistMode: boolean
  snapshotSetlistOrder: number[]
  'snapshot_editor.flow_animation': SnapshotEditorFlowAnimation
  'snapshot_editor.grid_backdrop': boolean
  'snapshot_editor.node_shape': SnapshotEditorNodeShape
  /** T2454: ordered snapshot ids the operator has explicitly pinned for preload (max 5). */
  snapshotPreloadPins: number[]
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

  // Nav reorg 2026-05-03 (second pass) — canonical Node Ops base.
  return [{ route: '/node-ops', size: 'medium' }]
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

/** T2454: dedupe + cap-at-5 for snapshot_preload_pins. Mirrors the backend
 * `normalize_snapshot_preload_pins` exactly. */
export function normalizeSnapshotPreloadPins(values: ReadonlyArray<unknown>): number[] {
  const normalized: number[] = []
  const seen = new Set<number>()

  for (const raw of values) {
    let candidate: number | null = null
    if (typeof raw === 'number' && Number.isInteger(raw)) {
      candidate = raw
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed.length === 0) continue
      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isInteger(parsed)) candidate = parsed
    }
    if (candidate === null || candidate < 1 || seen.has(candidate)) continue

    seen.add(candidate)
    normalized.push(candidate)
    if (normalized.length >= SNAPSHOT_PRELOAD_PIN_CAP) break
  }

  return normalized
}

function resolveSnapshotPreloadPins(data: Record<string, unknown>): number[] {
  const raw = data.snapshot_preload_pins
  if (!Array.isArray(raw)) return []
  return normalizeSnapshotPreloadPins(raw)
}

function isSnapshotEditorFlowAnimation(value: unknown): value is SnapshotEditorFlowAnimation {
  return typeof value === 'string' && SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS.some((option) => option.id === value)
}

function resolveSnapshotEditorFlowAnimation(data: Record<string, unknown>): SnapshotEditorFlowAnimation {
  const value = data['snapshot_editor.flow_animation'] ?? data.snapshot_editor_flow_animation
  return isSnapshotEditorFlowAnimation(value) ? value : DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.flowAnimation
}

function resolveSnapshotEditorGridBackdrop(data: Record<string, unknown>): boolean {
  const value = data['snapshot_editor.grid_backdrop'] ?? data.snapshot_editor_grid_backdrop
  return typeof value === 'boolean' ? value : DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.gridBackdrop
}

function isSnapshotEditorNodeShape(value: unknown): value is SnapshotEditorNodeShape {
  return value === 'square' || value === 'rounded' || value === 'hex'
}

function resolveSnapshotEditorNodeShape(data: Record<string, unknown>): SnapshotEditorNodeShape {
  const value = data['snapshot_editor.node_shape'] ?? data.snapshot_editor_node_shape
  return isSnapshotEditorNodeShape(value) ? value : DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.nodeShape
}

export function resolveSnapshotEditorSignalCanvasSettings(
  settings: SpecialSettings | null | undefined,
): SnapshotEditorSignalCanvasSettings {
  return {
    flowAnimation: settings?.['snapshot_editor.flow_animation'] ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.flowAnimation,
    gridBackdrop: settings?.['snapshot_editor.grid_backdrop'] ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.gridBackdrop,
    nodeShape: settings?.['snapshot_editor.node_shape'] ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.nodeShape,
  }
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
    'snapshot_editor.flow_animation': resolveSnapshotEditorFlowAnimation(data),
    'snapshot_editor.grid_backdrop': resolveSnapshotEditorGridBackdrop(data),
    'snapshot_editor.node_shape': resolveSnapshotEditorNodeShape(data),
    snapshotPreloadPins: resolveSnapshotPreloadPins(data),
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
    'snapshot_editor.flow_animation': newSettings['snapshot_editor.flow_animation']
      ?? currentSettings?.['snapshot_editor.flow_animation']
      ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.flowAnimation,
    'snapshot_editor.grid_backdrop': newSettings['snapshot_editor.grid_backdrop']
      ?? currentSettings?.['snapshot_editor.grid_backdrop']
      ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.gridBackdrop,
    'snapshot_editor.node_shape': newSettings['snapshot_editor.node_shape']
      ?? currentSettings?.['snapshot_editor.node_shape']
      ?? DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.nodeShape,
    snapshot_preload_pins: normalizeSnapshotPreloadPins(
      newSettings.snapshotPreloadPins ?? currentSettings?.snapshotPreloadPins ?? [],
    ),
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
