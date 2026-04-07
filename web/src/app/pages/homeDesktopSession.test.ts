import '@testing-library/jest-dom'

import {
  HOME_DESKTOP_SESSION_STORAGE_KEY,
  completeHomeDesktopBoot,
  readHomeDesktopSession,
  updateHomeDesktopSession,
} from './homeDesktopSession'

describe('homeDesktopSession', () => {
  beforeEach(() => {
    window.localStorage.clear()
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
})
