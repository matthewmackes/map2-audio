const EXPLICIT_API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''

function isProdStaticFrontend(): boolean {
  return typeof window !== 'undefined' && window.location.port === '3000'
}

function getFallbackApiBase(): string {
  if (!isProdStaticFrontend()) return ''
  return `${window.location.protocol}//${window.location.hostname}:8080`
}

export function apiUrl(path: string): string {
  const base = EXPLICIT_API_BASE || getFallbackApiBase()
  return base ? `${base}${path}` : path
}

export function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (EXPLICIT_API_BASE) {
    const url = new URL(EXPLICIT_API_BASE)
    return `${protocol}//${url.host}${path}`
  }
  if (isProdStaticFrontend()) {
    return `${protocol}//${window.location.hostname}:8080${path}`
  }
  return `${protocol}//${window.location.host}${path}`
}
