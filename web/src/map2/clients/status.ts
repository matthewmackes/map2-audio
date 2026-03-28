import type {
  AccessLog,
  APIEndpoint,
  WWWStatus,
  WebSocketStats,
} from '../types'
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export const healthApi = {
  check: () => fetchJson<{ status: string }>(`${API_BASE}/health`),
}

export const wwwApi = {
  getStatus: () => fetchJson<WWWStatus>(`${API_BASE}/www/status`),

  getEndpoints: () => fetchJson<{ endpoints: APIEndpoint[] }>(`${API_BASE}/www/endpoints`),

  getAccessLogs: (limit = 50) => fetchJson<{ logs: AccessLog[] }>(`${API_BASE}/www/logs?limit=${limit}`),

  clearLogs: () => fetchJson<{ status: string }>(`${API_BASE}/www/logs`, { method: 'DELETE' }),

  getWebSocketStats: () => fetchJson<WebSocketStats>(`${API_BASE}/www/websocket/stats`),

  restartService: (service: 'backend' | 'frontend') =>
    fetchJson<{ status: string; service: string }>(`${API_BASE}/www/restart/${service}`, { method: 'POST' }),

  updateConfig: (type: string, config: Record<string, unknown>) =>
    fetchJson<{ status: string; type: string }>(`${API_BASE}/www/config`, {
      method: 'POST',
      body: JSON.stringify({ type, config }),
    }),

  generateApiKey: () =>
    fetchJson<{ status: string; api_key: string }>(`${API_BASE}/www/api-key/generate`, { method: 'POST' }),

  healthCheck: () =>
    fetchJson<{ status: string; backend: boolean; frontend: boolean; timestamp: string }>(`${API_BASE}/www/health`),
}
