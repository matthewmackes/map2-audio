import type { OpenApiCatalogEndpoint, OpenApiCatalogGroup } from '../../hooks/useOpenApiSchema'

export type ObservatoryTabId = 'catalog' | 'builder' | 'websocket' | 'traffic' | 'collections'

export interface EnvironmentVariableSet {
  id: string
  name: string
  values: Record<string, string>
}

export interface RequestHistoryItem {
  id: string
  timestamp: string
  method: string
  url: string
  status: number
  durationMs: number
  responseSize: number
  body: unknown
  headers: Record<string, string>
  timing: {
    dns_ms?: number | null
    connect_ms?: number | null
    tls_ms?: number | null
    ttfb_ms?: number | null
    download_ms?: number | null
    total_ms: number
  }
}

export interface RequestDraft {
  id: string
  name: string
  method: string
  url: string
  headers: Array<{ key: string; value: string; enabled: boolean }>
  queryParams: Array<{ key: string; value: string; enabled: boolean }>
  bodyMode: 'none' | 'json' | 'raw'
  bodyText: string
  authMode: 'none' | 'bearer' | 'basic' | 'api-key'
  authValue: string
  preRequestScript: string
  testScript: string
  nodeTarget: string
}

export interface RequestExecutionResult {
  request: RequestDraft
  history: RequestHistoryItem
  sandboxLogs: string[]
  sandboxTests: Array<{ name: string; pass: boolean; message?: string }>
  sandboxError?: { message: string; stack?: string }
  environmentAfterRun: Record<string, string>
}

export interface TrafficEventItem {
  id: string
  timestamp: string
  method: string
  path: string
  status: number
  duration_ms: number
  request_size: number
  response_size: number
  client_ip: string
  request_id: string
  node_id?: string
  meta?: Record<string, unknown>
}

export interface TrafficStats {
  total_requests: number
  avg_response_ms: number
  p95_ms: number
  p99_ms: number
  error_rate_percent: number
  requests_per_second: number
  top_slowest_endpoints: Array<{ path: string; method: string; duration_ms: number; status: number }>
  top_called_endpoints: Array<{ path: string; count: number }>
  response_size_by_endpoint: Array<{ path: string; size_bytes: number }>
}

export interface CatalogSelection {
  group: OpenApiCatalogGroup
  endpoint: OpenApiCatalogEndpoint
}

export interface WsInspectorMessage {
  id: string
  connectionId: string
  direction: 'sent' | 'received' | 'system'
  timestamp: string
  eventType: string
  payload: unknown
}

export interface WsConnectionState {
  id: string
  name: string
  url: string
  status: 'connecting' | 'open' | 'closed' | 'error'
  reconnectAttempts: number
  messageCount: number
  openedAt: string | null
  errorMessage?: string
}

export interface CollectionRequestItem {
  id: string
  name: string
  draft: RequestDraft
  dependencies: string[]
  notes?: string
}

export interface CollectionWorkspace {
  id: string
  name: string
  environments: EnvironmentVariableSet[]
  collections: Array<{
    id: string
    name: string
    requests: CollectionRequestItem[]
  }>
}
