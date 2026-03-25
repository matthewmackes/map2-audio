export interface RuntimeLocationLike {
  protocol: string
  hostname: string
  host: string
  port: string
}

export interface RuntimeStorageLike {
  getItem(key: string): string | null
  setItem?(key: string, value: string): void
  removeItem?(key: string): void
}

export interface RuntimeWebSocketLike {
  readyState: number
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface RuntimeWebSocketConstructor {
  new (url: string): RuntimeWebSocketLike
  readonly CONNECTING: number
  readonly OPEN: number
}

export interface Map2RuntimeOverrides {
  apiBase?: string
  wsBaseUrl?: string
  location?: RuntimeLocationLike
  storage?: RuntimeStorageLike | null
  fetch?: typeof fetch
  webSocket?: RuntimeWebSocketConstructor
  dispatchEvent?: (event: Event) => void
  envApiBase?: string
}

const FALLBACK_LOCATION: RuntimeLocationLike = {
  protocol: 'http:',
  hostname: 'localhost',
  host: 'localhost:8080',
  port: '8080',
}

let runtimeOverrides: Map2RuntimeOverrides = {}

function readImportMetaEnvApiBase(): string | undefined {
  try {
    const meta = (0, eval)('import.meta') as { env?: Record<string, unknown> }
    const envBase = meta?.env?.VITE_API_BASE
    return typeof envBase === 'string' && envBase.trim() ? envBase : undefined
  } catch {
    return undefined
  }
}

export function configureMap2Runtime(overrides: Map2RuntimeOverrides): void {
  runtimeOverrides = { ...runtimeOverrides, ...overrides }
}

export function resetMap2Runtime(): void {
  runtimeOverrides = {}
}

export function getRuntimeLocation(): RuntimeLocationLike {
  if (runtimeOverrides.location) {
    return runtimeOverrides.location
  }
  if (typeof window !== 'undefined' && window.location) {
    return window.location
  }
  return FALLBACK_LOCATION
}

export function getRuntimeEnvApiBase(): string | undefined {
  return runtimeOverrides.envApiBase ?? readImportMetaEnvApiBase()
}

export function getRuntimeApiBaseOverride(): string | undefined {
  return runtimeOverrides.apiBase
}

export function getRuntimeWsBaseOverride(): string | undefined {
  return runtimeOverrides.wsBaseUrl
}

export function getRuntimeFetch(): typeof fetch {
  if (runtimeOverrides.fetch) {
    return runtimeOverrides.fetch
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('MAP2 runtime fetch is unavailable')
  }
  return globalThis.fetch.bind(globalThis)
}

export function getRuntimeStorage(): RuntimeStorageLike | null {
  if (runtimeOverrides.storage !== undefined) {
    return runtimeOverrides.storage
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

export function dispatchRuntimeEvent(event: Event): void {
  if (runtimeOverrides.dispatchEvent) {
    runtimeOverrides.dispatchEvent(event)
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(event)
  }
}

export function getRuntimeWebSocket(): RuntimeWebSocketConstructor {
  if (runtimeOverrides.webSocket) {
    return runtimeOverrides.webSocket
  }
  const ctor = globalThis.WebSocket as RuntimeWebSocketConstructor | undefined
  if (!ctor) {
    throw new Error('MAP2 runtime WebSocket is unavailable')
  }
  return ctor
}
