import type { PluginAppearanceOverride } from '@/map2/types'

export const PLUGIN_APPEARANCE_STORAGE_KEY = 'map2.plugin-appearance-overrides.v1'
export const PLUGIN_APPEARANCE_SYNC_EVENT = 'map2:plugin-appearance-overrides'

export type PluginAppearanceMap = Record<string, PluginAppearanceOverride>

export function normalizePluginAppearanceRecord(value: unknown): PluginAppearanceMap {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([uri, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }

      return [[uri, { ...(entry as Record<string, unknown>), uri } as PluginAppearanceOverride]]
    }),
  )
}

export function readStoredPluginAppearances(): PluginAppearanceMap {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(PLUGIN_APPEARANCE_STORAGE_KEY)
    return raw ? normalizePluginAppearanceRecord(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function writeStoredPluginAppearances(overrides: PluginAppearanceMap): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(PLUGIN_APPEARANCE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(PLUGIN_APPEARANCE_STORAGE_KEY, JSON.stringify(overrides))
    }
  } catch {
    // Ignore storage failures and continue with in-memory state.
  }

  window.dispatchEvent(new CustomEvent(PLUGIN_APPEARANCE_SYNC_EVENT, { detail: overrides }))
}

export function getStoredPluginAppearance(uri: string): PluginAppearanceOverride | null {
  return readStoredPluginAppearances()[uri] ?? null
}

export function subscribeStoredPluginAppearances(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handler = () => callback()
  window.addEventListener(PLUGIN_APPEARANCE_SYNC_EVENT, handler)
  window.addEventListener('storage', handler)

  return () => {
    window.removeEventListener(PLUGIN_APPEARANCE_SYNC_EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

export function mergeStoredPluginAppearance(
  current: PluginAppearanceOverride | undefined,
  update: Partial<PluginAppearanceOverride>,
  uri: string,
): PluginAppearanceOverride {
  return {
    ...(current ?? { uri }),
    ...update,
    uri,
  }
}
