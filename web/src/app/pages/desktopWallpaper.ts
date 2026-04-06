export const HOME_DESKTOP_WALLPAPER_STORAGE_KEY = 'map2:desktop-wallpaper'

export type DesktopWallpaperMode = 'default-image' | 'solid-theme' | 'uploaded-image'

export interface DesktopWallpaperState {
  version: 1
  mode: DesktopWallpaperMode
  imageDataUrl?: string
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
    if (mode === 'uploaded-image' && typeof value.imageDataUrl === 'string' && value.imageDataUrl.length > 0) {
      return { version: 1, mode, imageDataUrl: value.imageDataUrl }
    }
    if (mode === 'default-image') {
      return { version: 1, mode }
    }
  }

  return {
    version: 1,
    mode: 'default-image',
  }
}

export function readDesktopWallpaperState(): DesktopWallpaperState {
  if (typeof window === 'undefined') {
    return normalizeDesktopWallpaperState(null)
  }

  try {
    const raw = window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)
    if (!raw) {
      return normalizeDesktopWallpaperState(null)
    }

    return normalizeDesktopWallpaperState(JSON.parse(raw) as unknown)
  } catch {
    return normalizeDesktopWallpaperState(null)
  }
}

export function writeDesktopWallpaperState(state: DesktopWallpaperState): DesktopWallpaperState {
  const normalized = normalizeDesktopWallpaperState(state)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY, JSON.stringify(normalized))
  }
  return normalized
}
