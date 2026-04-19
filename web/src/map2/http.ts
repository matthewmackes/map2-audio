import { sanitizeDisplayPayload } from './displayNames'
import { API_BASE } from './transport'

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`)
    this.name = 'ApiError'
  }
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const bodyIsFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(bodyIsFormData ? {} : { 'Content-Type': 'application/json' }),
    },
  })

  if (!response.ok) {
    let body: unknown
    try {
      const text = await response.text()
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    } catch {
      body = response.statusText
    }
    throw new ApiError(response.status, response.statusText, body)
  }

  const data = await response.json()
  return sanitizeDisplayPayload(data) as T
}

export async function fetchBlob(url: string, options?: RequestInit): Promise<Blob> {
  const response = await fetch(url, options)
  if (!response.ok) {
    let body: unknown
    try {
      body = await response.text()
    } catch {
      body = response.statusText
    }
    throw new ApiError(response.status, response.statusText, body)
  }
  return response.blob()
}

export function appendNodeQuery(url: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}node_id=${encodeURIComponent(nodeId)}`
}

export function appendQueryParams(
  url: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    query.set(key, String(value))
  }
  const serialized = query.toString()
  if (!serialized) {
    return url
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${serialized}`
}

export interface PluginRuntimeScopeOptions {
  instanceId?: number
  pluginPosition?: number
  nodeId?: string | null
}

export function appendPluginRuntimeQuery(url: string, options?: PluginRuntimeScopeOptions): string {
  return appendNodeQuery(
    appendQueryParams(url, {
      instance_id: options?.instanceId,
      plugin_position: options?.pluginPosition,
    }),
    options?.nodeId,
  )
}

export function scopedNodePath(path: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') {
    return `${API_BASE}${path}`
  }
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${API_BASE}/node/${encodeURIComponent(nodeId)}/proxy/${normalizedPath}`
}

export function appendAvbNodeQuery(url: string, nodeId?: string | null): string {
  if (!nodeId) {
    return url
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}node_id=${encodeURIComponent(nodeId)}`
}
