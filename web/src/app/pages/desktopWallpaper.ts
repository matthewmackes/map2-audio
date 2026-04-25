import { readPersisted, writePersisted, type PersistedKey } from '../utils/persistedState'

export const HOME_DESKTOP_WALLPAPER_STORAGE_KEY = 'map2:desktop-wallpaper'

export type DesktopWallpaperMode = 'default-image' | 'solid-theme' | 'uploaded-image'

export interface DesktopWallpaperState {
  version: 1
  mode: DesktopWallpaperMode
  imageDataUrl?: string
}

const DEFAULT_STATE: DesktopWallpaperState = {
  version: 1,
  mode: 'default-image',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeDesktopWallpaperState(value: unknown): DesktopWallpaperState {
  if (isObject(value)) {
    const mode = value.mode
    if (mode === 'solid-theme') {
      return { version: 1, mode }
    }
    if (mode === 'uploaded-image') {
      if (typeof value.imageDataUrl === 'string' && value.imageDataUrl.length > 0) {
        return { version: 1, mode, imageDataUrl: value.imageDataUrl }
      }
      return { version: 1, mode }
    }
    if (mode === 'default-image') {
      return { version: 1, mode }
    }
  }

  return { ...DEFAULT_STATE }
}

const DESKTOP_WALLPAPER_KEY: PersistedKey<DesktopWallpaperState> = {
  storageKey: HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
  fallback: { ...DEFAULT_STATE },
  parse: (raw) => {
    try {
      return normalizeDesktopWallpaperState(JSON.parse(raw) as unknown)
    } catch {
      return undefined
    }
  },
  serialize: (value) => JSON.stringify(value),
}

export function readDesktopWallpaperState(): DesktopWallpaperState {
  return readPersisted(DESKTOP_WALLPAPER_KEY)
}

export function writeDesktopWallpaperState(state: DesktopWallpaperState): DesktopWallpaperState {
  const normalized = normalizeDesktopWallpaperState(state)
  writePersisted(DESKTOP_WALLPAPER_KEY, normalized)
  return normalized
}
