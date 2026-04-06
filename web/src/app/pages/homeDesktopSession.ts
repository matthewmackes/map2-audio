export const HOME_DESKTOP_SESSION_STORAGE_KEY = 'map2:desktop-session'

export interface HomeDesktopSessionState {
  version: 1
  bootCompletedAt: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readHomeDesktopSession(): HomeDesktopSessionState | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isObject(parsed) || parsed.version !== 1 || typeof parsed.bootCompletedAt !== 'string') {
      return null
    }

    return {
      version: 1,
      bootCompletedAt: parsed.bootCompletedAt,
    }
  } catch {
    return null
  }
}

export function writeHomeDesktopSession(state: HomeDesktopSessionState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(HOME_DESKTOP_SESSION_STORAGE_KEY, JSON.stringify(state))
}

export function completeHomeDesktopBoot(now = new Date()): HomeDesktopSessionState {
  const nextState: HomeDesktopSessionState = {
    version: 1,
    bootCompletedAt: now.toISOString(),
  }
  writeHomeDesktopSession(nextState)
  return nextState
}

export function clearHomeDesktopSession(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(HOME_DESKTOP_SESSION_STORAGE_KEY)
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
