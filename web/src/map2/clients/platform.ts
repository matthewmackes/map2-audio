import type * as Api from '../api'
import type {
  BrandingAssets,
  BrandingStatus,
  DiskHealthData,
  HostMachineInfo,
  JackMetrics,
  MetricsHistory,
  MetricsSummary,
  NetworkStatus,
  RealtimeStatus,
  SystemHealthOverview,
  SystemMetrics,
  WiFiNetwork,
  IPConfiguration,
} from '../types'
import type { NodeHealth, NodeIdentity, NodeTopology } from '../../app/types/node'
import { appendNodeQuery, fetchJson, scopedNodePath } from '../http'
import { API_BASE } from '../transport'

export const metricsApi = {
  getCurrent: () => fetchJson<SystemMetrics>(`${API_BASE}/metrics/current`),

  getSummary: () => fetchJson<MetricsSummary>(`${API_BASE}/metrics/summary`),

  getCpuHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/cpu?limit=${limit}`),

  getMemoryHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/memory?limit=${limit}`),

  getLatencyHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/latency?limit=${limit}`),

  getPrometheus: () => fetchJson<{ metrics: string }>(`${API_BASE}/metrics/prometheus`),

  exportJson: () =>
    fetchJson<{ timestamp: string; current: SystemMetrics; summary: MetricsSummary }>(`${API_BASE}/metrics/export`),

  getJack: () => fetchJson<JackMetrics>(`${API_BASE}/metrics/jack`),

  getJackLatency: () =>
    fetchJson<{ frames: number; milliseconds: number; sample_rate: number; buffer_size: number }>(
      `${API_BASE}/metrics/jack/latency`,
    ),
}

export const systemApi = {
  restartBackend: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/system/restart-backend`, { method: 'POST' }),

  restartSystem: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/system/restart`, { method: 'POST' }),

  getRealtimeStatus: () => fetchJson<RealtimeStatus>(`${API_BASE}/system/realtime-status`),

  getBrandingStatus: () => fetchJson<BrandingStatus>(`${API_BASE}/system/branding-status`),

  reinstallBranding: () =>
    fetchJson<{ success: boolean; message?: string; results: string[]; errors: string[]; note?: string }>(
      `${API_BASE}/system/reinstall-branding`,
      { method: 'POST' },
    ),

  getHostMachineInfo: (nodeId?: string | null) =>
    fetchJson<HostMachineInfo>(appendNodeQuery(`${API_BASE}/system/host-machine-info`, nodeId)),

  getDiskHealth: (nodeId?: string | null) =>
    fetchJson<DiskHealthData>(appendNodeQuery(`${API_BASE}/system/disk-health`, nodeId)),

  getHealthOverview: (nodeId?: string | null) =>
    fetchJson<SystemHealthOverview>(appendNodeQuery(`${API_BASE}/system/health-overview`, nodeId)),

  getBrandingAssets: (nodeId?: string | null) =>
    fetchJson<BrandingAssets>(appendNodeQuery(`${API_BASE}/system/branding-assets`, nodeId)),
}

export const getNodeIdentity = (): Promise<NodeIdentity> => fetchJson<NodeIdentity>(`${API_BASE}/node/identity`)

export const getNodeHealth = (): Promise<NodeHealth> => fetchJson<NodeHealth>(`${API_BASE}/node/health`)

export const getNodeTopology = async (): Promise<NodeTopology> => {
  const payload = await fetchJson<Partial<NodeTopology> | null>(`${API_BASE}/node/topology`)
  return {
    nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
    audio_edges: Array.isArray(payload?.audio_edges) ? payload.audio_edges : [],
    network_edges: Array.isArray(payload?.network_edges) ? payload.network_edges : [],
  }
}

export const patchNodeLabel = (label: string, nodeId?: string | null): Promise<NodeIdentity> =>
  fetchJson<NodeIdentity>(scopedNodePath('/node/identity', nodeId), {
    method: 'PATCH',
    body: JSON.stringify({ display_label: label }),
  })

export const nodeApi = {
  getIdentity: getNodeIdentity,
  getHealth: getNodeHealth,
  getTopology: getNodeTopology,
  patchLabel: patchNodeLabel,
}

export const networkApi = {
  getStatus: () => fetchJson<NetworkStatus>(`${API_BASE}/network/status`),

  scanWifi: () => fetchJson<{ networks: WiFiNetwork[] }>(`${API_BASE}/network/wifi/scan`),

  connectWifi: (ssid: string, password?: string) =>
    fetchJson<{ status: string; ssid: string }>(`${API_BASE}/network/wifi/connect`, {
      method: 'POST',
      body: JSON.stringify({ ssid, password }),
    }),

  disconnectWifi: (iface: string) =>
    fetchJson<{ status: string; interface: string }>(`${API_BASE}/network/wifi/disconnect/${iface}`, {
      method: 'POST',
    }),

  toggleInterface: (iface: string, enabled: boolean) =>
    fetchJson<{ status: string; interface: string; enabled: boolean }>(
      `${API_BASE}/network/interface/${iface}/toggle?enabled=${enabled}`,
      { method: 'POST' },
    ),

  setDHCP: (iface: string, enabled: boolean) =>
    fetchJson<{ status: string; interface: string; dhcp: boolean }>(
      `${API_BASE}/network/interface/${iface}/dhcp?enabled=${enabled}`,
      { method: 'POST' },
    ),

  setStaticIP: (iface: string, config: IPConfiguration) =>
    fetchJson<{ status: string; interface: string; config: IPConfiguration }>(
      `${API_BASE}/network/interface/${iface}/static`,
      { method: 'POST', body: JSON.stringify(config) },
    ),

  setDNS: (servers: string[]) =>
    fetchJson<{ status: string; dns_servers: string[] }>(`${API_BASE}/network/dns`, {
      method: 'POST',
      body: JSON.stringify({ servers }),
    }),

  serviceAction: (service: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') =>
    fetchJson<{ status: string; service: string; action: string }>(`${API_BASE}/network/service`, {
      method: 'POST',
      body: JSON.stringify({ service, action }),
    }),

  getHostname: () => fetchJson<{ hostname: string }>(`${API_BASE}/network/hostname`),

  setHostname: (hostname: string) =>
    fetchJson<{ status: string; hostname: string }>(`${API_BASE}/network/hostname`, {
      method: 'POST',
      body: JSON.stringify({ hostname }),
    }),
}

export const servicesApi = {
  getStatus: () => fetchJson<Api.ServicesStatusResponse>(`${API_BASE}/services/status`),

  getServiceStatus: (serviceName: string) =>
    fetchJson<Api.ServiceStatus>(`${API_BASE}/services/status/${serviceName}`),

  getSummary: () => fetchJson<Api.ServicesSummaryResponse>(`${API_BASE}/services/summary`),

  getHealth: () =>
    fetchJson<{ healthy: boolean; orchestrator_running: boolean; uptime_seconds: number; unhealthy_services: unknown[] }>(
      `${API_BASE}/services/health`,
    ),

  startAll: () => fetchJson<Api.BulkActionResponse>(`${API_BASE}/services/start-all`, { method: 'POST' }),

  stopAll: () => fetchJson<Api.BulkActionResponse>(`${API_BASE}/services/stop-all`, { method: 'POST' }),

  startService: (serviceName: string) =>
    fetchJson<Api.ServiceActionResponse>(`${API_BASE}/services/start/${serviceName}`, { method: 'POST' }),

  stopService: (serviceName: string) =>
    fetchJson<Api.ServiceActionResponse>(`${API_BASE}/services/stop/${serviceName}`, { method: 'POST' }),

  restartService: (serviceName: string) =>
    fetchJson<Api.ServiceActionResponse>(`${API_BASE}/services/restart/${serviceName}`, { method: 'POST' }),

  listServices: (state?: string, priority?: number) => {
    const params = new URLSearchParams()
    if (state) params.set('state', state)
    if (priority) params.set('priority', priority.toString())
    const query = params.toString() ? `?${params.toString()}` : ''
    return fetchJson<Api.ServiceStatus[]>(`${API_BASE}/services/list${query}`)
  },

  getDependencies: (serviceName: string) =>
    fetchJson<{ service: string; dependencies: string[]; dependents: string[]; can_stop: boolean; can_start: boolean }>(
      `${API_BASE}/services/dependencies/${serviceName}`,
    ),

  getMetrics: () =>
    fetchJson<{ orchestrator: { uptime_seconds: number; running: boolean }; services: Record<string, Record<string, unknown>> }>(
      `${API_BASE}/services/metrics`,
    ),

  getStartupOrder: () =>
    fetchJson<{ startup_order: unknown[]; shutdown_order: string[] }>(`${API_BASE}/services/startup-order`),
}
