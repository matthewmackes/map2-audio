import { useQuery } from '@tanstack/react-query'

export interface PeerDiscoveryPeer {
  node_id: string
  node_mode: string
  hostname?: string | null
  host: string
  port: number
  api_url: string
  ws_url: string
  ssh_url: string
  discovered_at: string
  last_seen: string
  latency_ms?: number | null
  ssh_trusted: boolean
  is_online: boolean
  discovery_sources: string[]
  registered: boolean
  registry_status?: string | null
  heartbeat_online?: boolean | null
  visible: boolean
  visibility_state?: string | null
  registration_required: boolean
  routing_ready: boolean
  visibility_reason?: string | null
  avb_enabled: boolean
  discovered_via_mdns: boolean
  discovered_via_peer_mdns: boolean
  discovered_via_cluster_mdns: boolean
  trust_state?: string | null
  adoption_state?: string | null
  activation_state?: string | null
  readiness_status?: string | null
  adoption_candidate_id?: string | null
}

export interface PeerDiscoveryStatusResponse {
  local_node_id: string
  discovery_enabled: boolean
  discovery_uptime: string
  peers_discovered: number
  peers_connected: number
  peers: PeerDiscoveryPeer[]
}

export interface PeerLatencyMeasurement {
  timestamp: string
  latency_ms: number
  success: boolean
}

export interface PeerLatencyHistoryResponse {
  peer_id: string
  measurements: PeerLatencyMeasurement[]
  average_latency_ms?: number | null
  min_latency_ms?: number | null
  max_latency_ms?: number | null
  packet_loss_percent: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function usePeerDiscoveryStatus(refetchInterval = 10_000) {
  return useQuery<PeerDiscoveryStatusResponse>({
    queryKey: ['platform', 'peer-discovery', 'status'],
    queryFn: () => fetchJson<PeerDiscoveryStatusResponse>('/api/peers'),
    staleTime: 5_000,
    refetchInterval,
  })
}

export function usePeerLatencyHistory(peerId: string | null, refetchInterval = 15_000) {
  return useQuery<PeerLatencyHistoryResponse>({
    queryKey: ['platform', 'peer-discovery', 'latency', peerId ?? 'none'],
    queryFn: () => fetchJson<PeerLatencyHistoryResponse>(`/api/peers/${encodeURIComponent(peerId ?? '')}/latency`),
    enabled: Boolean(peerId),
    staleTime: 5_000,
    refetchInterval,
  })
}
