/**
 * AVB Endpoint Type Definitions
 *
 * Represents AVB talker and listener endpoints discovered on the network.
 * Maps directly to backend AudioEndpoint schema from avb_router.py.
 */

/**
 * Stream direction enum
 */
export type StreamDirection = 'talker' | 'listener';

/**
 * Device type classification
 */
export type DeviceType = 'map2' | 'avdecc' | 'tesira' | 'unknown';

export const CANONICAL_ENDPOINT_FIELDS = [
  'endpoint_id',
  'entity_id',
  'unique_id',
  'direction',
  'device_type',
  'device_name',
  'channels',
  'sample_rate',
  'format',
  'mac_address',
  'node_address',
  'node_id',
  'host',
  'available',
  'last_seen',
] as const;

export type CanonicalEndpointField = typeof CANONICAL_ENDPOINT_FIELDS[number];

/**
 * AVB Audio Endpoint
 *
 * Represents a single audio stream endpoint (talker or listener) on the AVB network.
 * Combines backend data with UI-specific metadata stored in localStorage.
 */
export interface Endpoint {
  // Core backend fields (from AudioEndpoint)
  endpoint_id: string;           // Format: "entity_id:unique_id"
  entity_id: string;             // 16-char hex string (e.g., "001122fffe334455")
  unique_id: number;             // Stream index (0-65535)
  direction: StreamDirection;
  device_type: DeviceType;
  device_name: string;
  channels: number;
  sample_rate: number;           // Hz (e.g., 48000, 96000)
  format: string;                // e.g., "24-bit PCM"
  mac_address: string | null;
  node_address: string | null;   // e.g., "http://192.168.1.10:8080"
  host?: string;                 // Parsed host hint from node_address
  available: boolean;
  last_seen: string;             // ISO 8601 timestamp

  // Multi-node support
  node_id: string;               // Which node owns this endpoint (for multi-node routing)

  // UI metadata (stored in localStorage, overlaid on backend data)
  tags: string[];                // User-defined tags for search/filtering
  color: string;                 // Hex color for visual grouping (#RRGGBB)
  group: string;                 // Logical grouping name
  bank: number;                  // Banking for pagination (0-based)
  pinned: boolean;               // Pin to top of list
  locked: boolean;               // Prevent modifications
}

/**
 * Backend API response format for endpoints
 */
export type EndpointApiPayload = Omit<
  Endpoint,
  'tags' | 'color' | 'group' | 'bank' | 'pinned' | 'locked'
>;

export interface EndpointsResponse {
  endpoints: EndpointApiPayload[];
  count: number;
}

/**
 * Endpoint status information
 */
export interface EndpointStatus {
  endpoint_id: string;
  available: boolean;
  link_up: boolean;
  sync: boolean;            // Clock sync status (PTP)
  active: boolean;          // Currently streaming
}

/**
 * Engine-discovered AVB endpoint metadata cache entry.
 */
export interface AvbDiscoveredDevice {
  endpoint_id: string;
  device_name: string;
  direction: StreamDirection;
  device_type: DeviceType;
  node_address: string;
  host?: string;
  node_id?: string | null;
  source_node_id?: string | null;
  audio_format: string;
  channels: number;
  sample_rate: number;
  available: boolean;
}

export interface AvbReadinessContract {
  enabled: boolean;
  configured: boolean;
  operational: boolean;
  degraded: boolean;
  available: boolean;
  state: string;
  interface: string;
  interface_source: string;
  reason: string | null;
  checks: Record<string, unknown>;
}

/**
 * Backend API response for AVB device inventory.
 */
export interface AvbDevicesResponse {
  available: boolean;
  readiness?: AvbReadinessContract;
  count: number;
  device_names: string[];
  discovered_count: number;
  discovered_devices: AvbDiscoveredDevice[];
  error?: string;
}

export interface AvbChannelCapabilitiesResponse {
  available: boolean;
  readiness: AvbReadinessContract;
  device: string;
  local_inputs: Array<{ index: number; name: string; type: 'input'; source: string; available: boolean }>;
  local_outputs: Array<{ index: number; name: string; type: 'output'; source: string; available: boolean }>;
  avb_talkers: AvbDiscoveredDevice[];
  avb_listeners: AvbDiscoveredDevice[];
  sample_rates: number[];
  summary: {
    local_input_count: number;
    local_output_count: number;
    avb_talker_count: number;
    avb_listener_count: number;
  };
  error?: string;
}

/**
 * Runtime AVDECC entity discovery cache entry.
 */
export interface AvbAvdeccEntity {
  entity_id: string;
  entity_model_id: string;
  entity_name: string;
  firmware_version: string;
  mac_address: string;
  source_node_id?: string | null;
  capabilities: {
    talker_streams: number;
    listener_streams: number;
    is_audio_talker: boolean;
    is_audio_listener: boolean;
    gptp_supported: boolean;
  };
  ptp: {
    grandmaster_id: string;
    domain: number;
  };
  available: boolean;
  last_seen: string;
}

/**
 * AVDECC entity inventory response.
 */
export interface AvbAvdeccEntitiesResponse {
  enabled: boolean;
  entities: AvbAvdeccEntity[];
  error?: string;
}

export interface AvbAvdeccProtocolStats {
  messages_sent: number;
  messages_received: number;
}

/**
 * AVDECC protocol statistics.
 */
export interface AvbAvdeccStats {
  enabled: boolean;
  adp: AvbAvdeccProtocolStats;
  acmp: AvbAvdeccProtocolStats;
  aecp: AvbAvdeccProtocolStats;
  entities_discovered: number;
  connections_active: number;
  error?: string;
}

/**
 * Stream transport health details derived from PTP + TSN snapshots.
 */
export interface AvbStreamHealth {
  ready: boolean;
  issues: string[];
  interface: string;
  ptp: {
    available: boolean;
    state: string | null;
    offset_ns: number | null;
    mean_path_delay_ns: number | null;
    last_update: string | null;
    error: string | null;
  };
  tsn: {
    available: boolean;
    interface: string | null;
    mqprio_configured: boolean;
    cbs_configured: boolean;
    etf_configured: boolean;
    vlan_configured: boolean;
    error: string | null;
  };
}

/**
 * Effective runtime config for an AVB stream after backend fallback resolution.
 */
export interface AvbStreamEffectiveConfig {
  stream_id: string;
  direction: StreamDirection;
  interface: string;
  channels: number;
  sample_rate: number;
  buffer_size: number;
  presentation_offset_us: number;
  priority: number;
  dest_mac: string | null;
  failover_policy: string;
  interface_candidates: string[];
}

/**
 * PTP lock diagnostics snapshot for one stream.
 */
export interface AvbStreamPtpLockDiagnostics {
  locked: boolean;
  state: string | null;
  reason: string | null;
  offset_ns: number | null;
  mean_path_delay_ns: number | null;
  last_update: string | null;
}

/**
 * TSN/qdisc diagnostics snapshot for one stream.
 */
export interface AvbStreamTsnDiagnostics {
  available: boolean;
  interface: string | null;
  mqprio_configured: boolean;
  cbs_configured: boolean;
  etf_configured: boolean;
  vlan_configured: boolean;
  error: string | null;
}

/**
 * SRP diagnostics for one stream binding.
 */
export interface AvbStreamSrpDiagnostics {
  enabled: boolean;
  required: boolean;
  bound: boolean;
  reservation_id: string | null;
  admission_id: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Stream diagnostics payload returned by backend routes.
 */
export interface AvbStreamDiagnostics {
  effective_config: AvbStreamEffectiveConfig;
  ptp_lock: AvbStreamPtpLockDiagnostics;
  tsn_qdisc: AvbStreamTsnDiagnostics;
  srp: AvbStreamSrpDiagnostics;
  transport?: {
    frames_sent: number;
    frames_received: number;
    send_errors: number;
    receive_errors: number;
    underruns: number;
    overruns: number;
    timestamp_errors: number;
    sequence_errors: number;
    sequence_gap_events: number;
    timestamp_skew_events: number;
    decode_errors: number;
    max_timestamp_skew_ns: number;
    bytes_transferred: number;
    max_latency_ns: number;
    min_latency_ns: number;
  };
}

/**
 * Deterministic stream ownership metadata returned by backend stream APIs.
 */
export interface AvbStreamOwnership {
  owner_node_id: string | null;
  peer_node_id: string | null;
  owner_endpoint_id: string | null;
  peer_endpoint_id: string | null;
  talker_node_id: string | null;
  listener_node_id: string | null;
  talker_endpoint_id: string | null;
  listener_endpoint_id: string | null;
  node_ids: string[];
  endpoint_ids: string[];
}

/**
 * AVB stream payload returned by /api/avb/streams.
 */
export interface AvbStreamPayload {
  stream_id: string;
  direction: StreamDirection;
  state: string;
  config?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  error?: string | null;
  ownership?: AvbStreamOwnership;
  health?: AvbStreamHealth;
  diagnostics?: AvbStreamDiagnostics;
}

/**
 * Backend API response for AVB stream inventory.
 */
export interface AvbStreamsResponse {
  available: boolean;
  streams: AvbStreamPayload[];
  error?: string;
}
