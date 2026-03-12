import { apiUrl } from '../../utils/apiTarget'
import type { TrafficEventItem, TrafficStats } from './types'

export interface ProxyPayload {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
  timeout_ms?: number
  node_id?: string
}

export interface ProxyResult {
  status: number
  timing: {
    dns_ms?: number | null
    connect_ms?: number | null
    tls_ms?: number | null
    ttfb_ms?: number | null
    download_ms?: number | null
    total_ms: number
  }
  headers: Record<string, string>
  body: unknown
  size_bytes: number
  nodes?: Array<{
    node_id: string
    status: number
    timing: {
      dns_ms?: number | null
      connect_ms?: number | null
      tls_ms?: number | null
      ttfb_ms?: number | null
      download_ms?: number | null
      total_ms: number
    }
    headers: Record<string, string>
    body: unknown
    size_bytes: number
  }>
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(text || `${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function sendProxyRequest(payload: ProxyPayload): Promise<ProxyResult> {
  return fetchJson<ProxyResult>('/api/dev/proxy', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getTrafficEvents(filters?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    params.set(key, String(value))
  })
  const query = params.toString()
  return fetchJson<{ count: number; recording_session_id: string | null; events: TrafficEventItem[] }>(
    `/api/observatory/traffic${query ? `?${query}` : ''}`,
  )
}

export async function getTrafficStats(filters?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }
    params.set(key, String(value))
  })
  const query = params.toString()
  return fetchJson<TrafficStats>(`/api/observatory/traffic/stats${query ? `?${query}` : ''}`)
}

export async function startTrafficRecording(name?: string) {
  return fetchJson<{ session_id: string; name: string; started_at: string; stopped_at: string | null }>(
    '/api/observatory/traffic/recording/start',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
  )
}

export async function stopTrafficRecording() {
  return fetchJson<{ session_id: string; name: string; started_at: string; stopped_at: string; event_count: number }>(
    '/api/observatory/traffic/recording/stop',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )
}

export async function listTrafficSessions() {
  return fetchJson<{
    sessions: Array<{ session_id: string; name: string; started_at: string; stopped_at: string | null; event_count: number }>
  }>('/api/observatory/traffic/sessions')
}

export async function getTrafficSession(sessionId: string) {
  return fetchJson<{
    session_id: string
    name: string
    started_at: string
    stopped_at: string | null
    events: TrafficEventItem[]
    stats: TrafficStats
  }>(`/api/observatory/traffic/sessions/${encodeURIComponent(sessionId)}`)
}

export async function exportTrafficSession(sessionId: string, format: 'json' | 'har' = 'json') {
  return fetchJson<Record<string, unknown>>(
    `/api/observatory/traffic/sessions/${encodeURIComponent(sessionId)}/export?format=${format}`,
  )
}

export async function importTrafficSession(session: Record<string, unknown>) {
  return fetchJson<Record<string, unknown>>('/api/observatory/traffic/sessions/import', {
    method: 'POST',
    body: JSON.stringify({ session }),
  })
}

export async function getPeerTopology() {
  return fetchJson<{
    local_node_id: string
    peers_discovered: number
    peers_connected: number
    peers: Array<{
      node_id: string
      host: string
      port: number
      node_mode: string
      latency_ms?: number | null
      last_seen: string
      ssh_trusted: boolean
    }>
  }>('/api/peers')
}
