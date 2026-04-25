export type NodeRole = 'audio_node' | 'management_node' | 'all_in_one'

export type NodeStatus = 'ok' | 'warn' | 'critical' | 'offline'

export type NodeServices = {
  backend: boolean
  juce_engine: boolean
  pipewire: boolean
}

export type LatencyPressureStatus = 'waiting' | 'offline' | 'stable' | 'watch' | 'critical'

export type NodeHealth = {
  status: NodeStatus
  cpu_percent: number
  memory_percent: number
  xrun_count: number
  audio_latency_ms: number
  services: NodeServices
  /** First-class latency-pressure score (0..10). Null when no telemetry yet. */
  latency_pressure_score?: number | null
  /** Pressure as 0..100% (100 = critical / offline). Null when no telemetry yet. */
  latency_pressure_percent?: number | null
  /** Status band derived from the score. Defaults to 'waiting' when not present. */
  latency_pressure_status?: LatencyPressureStatus
}

export type NodeIdentity = {
  hostname: string
  display_label: string | null
  role: NodeRole
  node_id: string
}

export type NodeSummary = NodeIdentity & NodeHealth & {
  last_seen: string
  is_local: boolean
  is_viewed: boolean
}

export type NodeAudioEdge = {
  source_node_id: string
  dest_node_id: string
  stream_type: 'avb' | 'jack'
  active: boolean
}

export type NodeNetworkEdge = {
  source_node_id: string
  dest_node_id: string
  latency_ms: number | null
}

export type NodeTopology = {
  nodes: NodeSummary[]
  audio_edges: NodeAudioEdge[]
  network_edges: NodeNetworkEdge[]
}

