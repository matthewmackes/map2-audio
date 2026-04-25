import { clearPersisted, readPersisted, writePersisted, type PersistedKey } from '../utils/persistedState'

export const HOME_DESKTOP_SESSION_STORAGE_KEY = 'map2:desktop-session'

export interface HomeDesktopSessionState {
  version: 2
  bootCompletedAt: string
  runningRoutes: string[]
  currentRoute: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseStoredSession(raw: string): HomeDesktopSessionState | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isObject(parsed) || typeof parsed.bootCompletedAt !== 'string') {
      return undefined
    }
    const runningRoutes = Array.isArray(parsed.runningRoutes)
      ? parsed.runningRoutes.filter((route): route is string => typeof route === 'string' && route.startsWith('/'))
      : []
    const currentRoute = typeof parsed.currentRoute === 'string' && parsed.currentRoute.startsWith('/')
      ? parsed.currentRoute
      : '/'
    return {
      version: 2,
      bootCompletedAt: parsed.bootCompletedAt,
      runningRoutes,
      currentRoute,
    }
  } catch {
    return undefined
  }
}

// Session uses null-as-fallback (callers depend on null to detect "no session
// recorded yet" — see shouldShowHomeBootSplash). PersistedKey<T | null> keeps
// that contract while routing through the typed helper.
const HOME_DESKTOP_SESSION_KEY: PersistedKey<HomeDesktopSessionState | null> = {
  storageKey: HOME_DESKTOP_SESSION_STORAGE_KEY,
  fallback: null,
  parse: (raw) => parseStoredSession(raw) ?? null,
  serialize: (value) => (value === null ? '' : JSON.stringify(value)),
}

export function readHomeDesktopSession(): HomeDesktopSessionState | null {
  return readPersisted(HOME_DESKTOP_SESSION_KEY)
}

export function writeHomeDesktopSession(state: HomeDesktopSessionState): void {
  writePersisted(HOME_DESKTOP_SESSION_KEY, state)
}

export function completeHomeDesktopBoot(now = new Date()): HomeDesktopSessionState {
  const existingState = readHomeDesktopSession()
  const nextState: HomeDesktopSessionState = {
    version: 2,
    bootCompletedAt: now.toISOString(),
    runningRoutes: existingState?.runningRoutes ?? [],
    currentRoute: existingState?.currentRoute ?? '/',
  }
  writeHomeDesktopSession(nextState)
  return nextState
}

export function updateHomeDesktopSession(
  patch: Partial<Pick<HomeDesktopSessionState, 'runningRoutes' | 'currentRoute'>>,
): HomeDesktopSessionState | null {
  const existingState = readHomeDesktopSession()
  if (!existingState) {
    return null
  }

  const nextState: HomeDesktopSessionState = {
    version: 2,
    bootCompletedAt: existingState.bootCompletedAt,
    runningRoutes: Array.isArray(patch.runningRoutes) ? patch.runningRoutes : existingState.runningRoutes,
    currentRoute: typeof patch.currentRoute === 'string' ? patch.currentRoute : existingState.currentRoute,
  }
  writeHomeDesktopSession(nextState)
  return nextState
}

export function clearHomeDesktopSession(): void {
  clearPersisted(HOME_DESKTOP_SESSION_KEY)
}

export function reloadHomeDesktopShell(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.location.reload()
}

export function returnHomeDesktopToBoot(): void {
  if (typeof window === 'undefined') {
    return
  }

  clearHomeDesktopSession()
  window.location.assign('/')
}

export function shouldShowHomeBootSplash(): boolean {
  return readHomeDesktopSession() === null
}
