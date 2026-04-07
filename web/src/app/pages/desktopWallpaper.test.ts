import '@testing-library/jest-dom'

import {
  HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
  normalizeDesktopWallpaperState,
  readDesktopWallpaperState,
  writeDesktopWallpaperState,
} from './desktopWallpaper'

describe('desktopWallpaper', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('normalizeDesktopWallpaperState', () => {
    it('returns default-image for null input', () => {
      expect(normalizeDesktopWallpaperState(null)).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('returns default-image for non-object input', () => {
      expect(normalizeDesktopWallpaperState('string')).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('returns default-image for unknown mode', () => {
      expect(normalizeDesktopWallpaperState({ mode: 'unknown' })).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('normalizes default-image mode', () => {
      expect(normalizeDesktopWallpaperState({ mode: 'default-image' })).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('normalizes solid-theme mode', () => {
      expect(normalizeDesktopWallpaperState({ mode: 'solid-theme' })).toEqual({
        version: 1,
        mode: 'solid-theme',
      })
    })

    it('normalizes uploaded-image mode with valid data URL', () => {
      const result = normalizeDesktopWallpaperState({
        mode: 'uploaded-image',
        imageDataUrl: 'data:image/png;base64,abc',
      })
      expect(result).toEqual({
        version: 1,
        mode: 'uploaded-image',
        imageDataUrl: 'data:image/png;base64,abc',
      })
    })

    it('falls back to default-image when uploaded-image has empty data URL', () => {
      expect(normalizeDesktopWallpaperState({
        mode: 'uploaded-image',
        imageDataUrl: '',
      })).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('falls back to default-image when uploaded-image has no data URL', () => {
      expect(normalizeDesktopWallpaperState({
        mode: 'uploaded-image',
      })).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })
  })

  describe('readDesktopWallpaperState', () => {
    it('returns default-image when no state exists', () => {
      expect(readDesktopWallpaperState()).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('returns default-image for invalid JSON', () => {
      window.localStorage.setItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY, 'not json')
      expect(readDesktopWallpaperState()).toEqual({
        version: 1,
        mode: 'default-image',
      })
    })

    it('reads persisted solid-theme mode', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
        JSON.stringify({ version: 1, mode: 'solid-theme' }),
      )
      expect(readDesktopWallpaperState()).toEqual({
        version: 1,
        mode: 'solid-theme',
      })
    })

    it('reads persisted uploaded-image with data URL', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
        JSON.stringify({ version: 1, mode: 'uploaded-image', imageDataUrl: 'data:image/png;base64,abc' }),
      )
      expect(readDesktopWallpaperState()).toEqual({
        version: 1,
        mode: 'uploaded-image',
        imageDataUrl: 'data:image/png;base64,abc',
      })
    })
  })

  describe('writeDesktopWallpaperState', () => {
    it('persists and returns normalized state', () => {
      const result = writeDesktopWallpaperState({ version: 1, mode: 'solid-theme' })
      expect(result).toEqual({ version: 1, mode: 'solid-theme' })

      const raw = window.localStorage.getItem(HOME_DESKTOP_WALLPAPER_STORAGE_KEY)
      expect(JSON.parse(raw!)).toEqual({ version: 1, mode: 'solid-theme' })
    })

    it('normalizes invalid uploaded-image on write', () => {
      const result = writeDesktopWallpaperState({ version: 1, mode: 'uploaded-image' })
      expect(result.mode).toBe('default-image')
    })
  })
})
