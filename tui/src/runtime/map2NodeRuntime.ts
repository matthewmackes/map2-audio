import { configureMap2Runtime } from '../../../web/src/map2/runtime'

function normalizeApiBase(rawValue?: string): string {
  const trimmed = rawValue?.trim()
  if (!trimmed) {
    return 'http://localhost:8080/api'
  }

  if (trimmed.endsWith('/api')) {
    return trimmed
  }

  return `${trimmed.replace(/\/$/, '')}/api`
}

function toWsBaseUrl(apiBase: string, explicitWsBase?: string): string {
  if (explicitWsBase?.trim()) {
    return explicitWsBase.trim().replace(/\/$/, '')
  }

  return apiBase
    .replace(/\/api$/, '')
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
}

export function configureNodeMap2Runtime(options?: { apiBase?: string; wsBaseUrl?: string }): {
  apiBase: string
  wsBaseUrl: string
} {
  const apiBase = normalizeApiBase(options?.apiBase ?? process.env.MAP2_API_URL)
  const wsBaseUrl = toWsBaseUrl(apiBase, options?.wsBaseUrl ?? process.env.MAP2_WS_URL)
  const runtimeUrl = new URL(apiBase)

  configureMap2Runtime({
    apiBase,
    wsBaseUrl,
    fetch: globalThis.fetch.bind(globalThis),
    webSocket: globalThis.WebSocket,
    storage: null,
    dispatchEvent: () => {},
    envApiBase: apiBase,
    location: {
      protocol: runtimeUrl.protocol,
      hostname: runtimeUrl.hostname,
      host: runtimeUrl.host,
      port: runtimeUrl.port,
    },
  })

  return { apiBase, wsBaseUrl }
}
