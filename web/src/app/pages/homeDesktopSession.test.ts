import '@testing-library/jest-dom'

import {
  HOME_DESKTOP_SESSION_STORAGE_KEY,
  clearHomeDesktopSession,
  completeHomeDesktopBoot,
  readHomeDesktopSession,
  shouldShowHomeBootSplash,
  updateHomeDesktopSession,
  writeHomeDesktopSession,
} from './homeDesktopSession'

describe('homeDesktopSession', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('readHomeDesktopSession', () => {
    it('returns null when no session exists', () => {
      expect(readHomeDesktopSession()).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      window.localStorage.setItem(HOME_DESKTOP_SESSION_STORAGE_KEY, 'not json')
      expect(readHomeDesktopSession()).toBeNull()
    })

    it('returns null for non-object values', () => {
      window.localStorage.setItem(HOME_DESKTOP_SESSION_STORAGE_KEY, '"string"')
      expect(readHomeDesktopSession()).toBeNull()
    })

    it('returns null when bootCompletedAt is missing', () => {
      window.localStorage.setItem(HOME_DESKTOP_SESSION_STORAGE_KEY, JSON.stringify({ version: 2 }))
      expect(readHomeDesktopSession()).toBeNull()
    })

    it('reads legacy v1 session state and upgrades it in memory', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_SESSION_STORAGE_KEY,
        JSON.stringify({ version: 1, bootCompletedAt: '2026-04-06T13:00:00.000Z' }),
      )

      expect(readHomeDesktopSession()).toEqual({
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: [],
        currentRoute: '/',
      })
    })

    it('filters out non-string and non-path running routes', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_SESSION_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          bootCompletedAt: '2026-04-06T13:00:00.000Z',
          runningRoutes: ['/valid', 42, 'no-slash', null, '/also-valid'],
          currentRoute: '/',
        }),
      )

      const session = readHomeDesktopSession()
      expect(session?.runningRoutes).toEqual(['/valid', '/also-valid'])
    })

    it('defaults currentRoute to / when not a valid path', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_SESSION_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          bootCompletedAt: '2026-04-06T13:00:00.000Z',
          runningRoutes: [],
          currentRoute: 'no-slash',
        }),
      )

      const session = readHomeDesktopSession()
      expect(session?.currentRoute).toBe('/')
    })

    it('reads a full v2 session correctly', () => {
      const state = {
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: ['/artifacts', '/mpx1'],
        currentRoute: '/mpx1',
      }
      window.localStorage.setItem(HOME_DESKTOP_SESSION_STORAGE_KEY, JSON.stringify(state))

      expect(readHomeDesktopSession()).toEqual(state)
    })
  })

  describe('writeHomeDesktopSession', () => {
    it('persists session state to localStorage', () => {
      const state = {
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: ['/artifacts'],
        currentRoute: '/artifacts',
      }
      writeHomeDesktopSession(state)

      const raw = window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)
      expect(JSON.parse(raw)).toEqual(state)
    })
  })

  describe('completeHomeDesktopBoot', () => {
    it('creates a new session on first boot', () => {
      const result = completeHomeDesktopBoot(new Date('2026-04-06T13:00:00.000Z'))

      expect(result).toEqual({
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: [],
        currentRoute: '/',
      })

      // Verify it was persisted
      expect(readHomeDesktopSession()).toEqual(result)
    })

    it('preserves running routes when boot completion upgrades session state', () => {
      window.localStorage.setItem(
        HOME_DESKTOP_SESSION_STORAGE_KEY,
        JSON.stringify({
          version: 2,
          bootCompletedAt: '2026-04-06T13:00:00.000Z',
          runningRoutes: ['/intelfx'],
          currentRoute: '/intelfx',
        }),
      )

      expect(completeHomeDesktopBoot(new Date('2026-04-06T14:00:00.000Z'))).toEqual({
        version: 2,
        bootCompletedAt: '2026-04-06T14:00:00.000Z',
        runningRoutes: ['/intelfx'],
        currentRoute: '/intelfx',
      })
    })
  })

  describe('updateHomeDesktopSession', () => {
    it('returns null when no session exists', () => {
      expect(updateHomeDesktopSession({ runningRoutes: ['/artifacts'] })).toBeNull()
    })

    it('updates persisted running routes and current route after boot', () => {
      completeHomeDesktopBoot(new Date('2026-04-06T13:00:00.000Z'))

      expect(updateHomeDesktopSession({
        runningRoutes: ['/intelfx', '/artifacts'],
        currentRoute: '/artifacts',
      })).toEqual({
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: ['/intelfx', '/artifacts'],
        currentRoute: '/artifacts',
      })
    })

    it('preserves existing values when patch is partial', () => {
      completeHomeDesktopBoot(new Date('2026-04-06T13:00:00.000Z'))
      updateHomeDesktopSession({ runningRoutes: ['/artifacts'], currentRoute: '/artifacts' })

      // Only update currentRoute
      const result = updateHomeDesktopSession({ currentRoute: '/mpx1' })
      expect(result?.runningRoutes).toEqual(['/artifacts'])
      expect(result?.currentRoute).toBe('/mpx1')
    })
  })

  describe('clearHomeDesktopSession', () => {
    it('removes session from localStorage', () => {
      completeHomeDesktopBoot()
      expect(readHomeDesktopSession()).not.toBeNull()

      clearHomeDesktopSession()
      expect(readHomeDesktopSession()).toBeNull()
    })
  })

  describe('shouldShowHomeBootSplash', () => {
    it('returns true when no session exists (first visit)', () => {
      expect(shouldShowHomeBootSplash()).toBe(true)
    })

    it('returns false after boot has completed', () => {
      completeHomeDesktopBoot()
      expect(shouldShowHomeBootSplash()).toBe(false)
    })

    it('returns true after session is cleared (logout)', () => {
      completeHomeDesktopBoot()
      clearHomeDesktopSession()
      expect(shouldShowHomeBootSplash()).toBe(true)
    })
  })
})
