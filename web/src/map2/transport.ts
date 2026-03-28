import {
  getRuntimeApiBaseOverride,
  getRuntimeEnvApiBase,
  getRuntimeLocation,
} from './runtime'

export function resolveRawApiBase(): string {
  const runtimeBase = getRuntimeApiBaseOverride()
  if (runtimeBase) return runtimeBase

  const envBase = getRuntimeEnvApiBase()
  if (envBase) return envBase

  const location = getRuntimeLocation()
  const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const port = location.port

  // On localhost and on the supported production web port, /api is routed
  // through the same origin and proxied by the production web server on port 3000.
  if (isLocalhost || port === '3000') {
    return '/api'
  }

  // Port 80 is reverse-proxied to 8080, so relative /api works there too.
  // Port 8080 is the backend itself — relative /api also works.
  if (port === '' || port === '80' || port === '8080') {
    return '/api'
  }

  // For any other port on a remote host, call the backend on port 8080 directly.
  return `http://${location.hostname}:8080/api`
}

export function resolveApiBase(): string {
  const rawApiBase = resolveRawApiBase()
  return rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase
}

export const API_BASE = {
  toString: () => resolveApiBase(),
  valueOf: () => resolveApiBase(),
  [Symbol.toPrimitive]: () => resolveApiBase(),
} as unknown as string

/**
 * Get the WebSocket base URL that correctly targets the backend.
 * Mirrors the API_BASE logic: on localhost, port 3000, port 80, or port 8080
 * use the same origin; on any other port target ws://hostname:8080 directly.
 */
export function getWsBaseUrl(): string {
  const location = getRuntimeLocation()
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const hostname = location.hostname
  const port = location.port
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (isLocalhost || port === '3000' || port === '' || port === '80' || port === '8080') {
    return `${protocol}//${location.host}`
  }

  return `${protocol}//${hostname}:8080`
}

export function getWsUrl(): string {
  return `${getWsBaseUrl()}/ws`
}
