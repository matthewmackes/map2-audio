// ============================================================================
// MAP2 Audio Platform - REST API Client
// Provides type-safe access to all MAP2 FastAPI endpoints
// ============================================================================

import type {
  AudioStatus,
  AudioLevels,
  AudioSourceTruthPayload,
  PluginLevels,
  Chain,
  EffectsLoop,
  LoopInsertion,
  ChainTemplate,
  Plugin,
  PluginOrderRef,
  Snapshot,
  SnapshotCategory,
  CreateSnapshotRequest,
  MIDIDevice,
  MIDIMapping,
  MIDIMappingV2,
  MIDIMappingTestResult,
  MIDIMappingGroup,
  MIDICommand,
  MIDIRoutingRule,
  MIDIDeviceConfig,
  MIDIPreset,
  MIDIStatus,
  MIDILearnTarget,
  MIDICurveType,
  MIDIActionType,
  MIDITriggerType,
  ChainMIDIConfig,
  MIDIDeviceProfile,
  ExpressionCalibration,
  DFUStatus,
  DFUInstructions,
  ProfileApplyResult,
  MIDIExpressionCurve,
  IRStatus,
  NAMStatus,
  AutomationLane,
  AutomationPoint,
  AutomationStatus,
  LFOConfig,
  HistoryStatus,
  HistoryEntry,
  Session,
  SessionListItem,
  SystemMetrics,
  MetricsSummary,
  MetricsHistory,
  JackMetrics,
  RealtimeStatus,
  BrandingStatus,
  ChainsResponse,
  PluginsResponse,
  SnapshotsResponse,
  IRsResponse,
  NAMModelsResponse,
  SessionsResponse,
  CurveType,
  NetworkStatus,
  WiFiNetwork,
  IPConfiguration,
  WWWStatus,
  APIEndpoint,
  AccessLog,
  WebSocketStats,
  HostMachineInfo,
  DiskHealthData,
  SystemHealthOverview,
  BrandingAssets,
  FlowSnapshot,
  FlowSnapshotDetail,
  FlowSnapshotData,
} from './types';
import type {
  TesiraCapabilityEnvelope,
  TesiraCrosspointMatrix,
  DiscoveryScanStatus,
  PresetInterlockRule,
  TesiraDspBlock,
  TesiraDspBlockListResponse,
  TesiraDspBulkOperation,
  TesiraDspBulkResult,
  TesiraDspParamsResponse,
  TesiraDspProbeResult,
  TesiraDeviceDetail,
  TesiraDeviceSummary,
  TesiraDesignGraph,
  TesiraDesignCompileBatchResponse,
  TesiraDesignCompileResponse,
  TesiraDesignDiagnosticsResponse,
  TesiraDesignLibraryResponse,
  TesiraDesignMutationResponse,
  TesiraDesignValidateResponse,
  TesiraDesignWorkspaceDetailResponse,
  TesiraDesignWorkspaceListResponse,
  TesiraFleetHealth,
  TesiraFirmwareStatus,
  TesiraGpioListResponse,
  TesiraLatestFirmware,
  TesiraMeterHistoryResponse,
  TesiraMeterPeakResponse,
  TesiraMutationResponse,
  TesiraRawCommandResponse,
  TesiraLayoutArtifact,
  TesiraLayoutListResponse,
  TesiraSageVueStatus,
  TesiraDeploymentJob,
  TesiraPtpTopologyResponse,
  TesiraPTPStatus,
  TesiraPresetInfo,
  TesiraSceneDetail,
  TesiraSceneListResponse,
  TesiraStreamInfo,
} from '../app/components/Tesira/types';
import type {
  AvbAvdeccEntitiesResponse,
  AvbAvdeccEntity,
  AvbAvdeccStats,
  AvbChannelCapabilitiesResponse,
  AvbDevicesResponse,
  AvbNode,
  AvbReadinessContract,
  AvbStreamDiagnostics,
  AvbStreamPayload,
  AvbStreamsResponse,
  ConnectionsResponse,
  EndpointsResponse,
  RoutingMatrixResponse,
  StreamDirection,
} from '../app/components/AvbRouting/types';
import type { ParameterDescriptor, ParameterRegistry } from '../app/data/parameterSchema';
import type { NodeHealth, NodeIdentity, NodeTopology } from '../app/types/node';
import { safeFetchJson } from '../app/components/AvbRouting/utils/safeJsonFetch';
import { sanitizeDisplayPayload } from './displayNames';
import {
  getChainReorderCompatibilityKey,
  getLegacyUriOnlyPluginOrder,
  isLegacyUriOnlyReorderValidationError,
  normalizeReorderPluginsResponse,
  type RawReorderPluginsResponse,
} from './reorderPluginsCompat';

const RAW_API_BASE = (() => {
  // Check for explicit environment variable
  const envBase = import.meta.env.VITE_API_BASE as string | undefined
  if (envBase) return envBase

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port

  // On localhost and on the supported production web port, /api is routed
  // through the same origin and proxied by the production web server on port 3000.
  if (isLocalhost || port === '3000') {
    return '/api'
  }

  // Port 80 is reverse-proxied to 8080, so relative /api works there too.
  // Port 8080 is the backend itself — relative /api also works.
  if (port === '' || port === '80' || port === '8080') {
    return '/api'
  }

  // For any other port on a remote host, call the backend on port 8080 directly.
  return `http://${window.location.hostname}:8080/api`
})()
export const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE

/**
 * Get the WebSocket base URL that correctly targets the backend.
 * Mirrors the API_BASE logic: on localhost, port 3000, port 80, or port 8080
 * use the same origin; on any other port target ws://hostname:8080 directly.
 */
export function getWsBaseUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const hostname = window.location.hostname
  const port = window.location.port
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (isLocalhost || port === '3000' || port === '' || port === '80' || port === '8080') {
    return `${protocol}//${window.location.host}`
  }
  // Any non-standard port connects directly to the backend.
  return `${protocol}//${hostname}:8080`
}

/** Get the main WebSocket endpoint URL (e.g. ws://host:8080/ws) */
export function getWsUrl(): string {
  return `${getWsBaseUrl()}/ws`
}

// Batching configuration
const BATCH_DELAY_MS = 50;
const MAX_BATCH_SIZE = 20;

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Parameter update batching queue
interface ParameterUpdate {
  plugin_uri: string;
  param_index: number;
  value: number;
  instance_id?: number;
  plugin_position?: number;
}

class ParameterBatcher {
  private queue: ParameterUpdate[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private pendingPromises: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Queue a parameter update for batched sending
   */
  private static updateIdentityKey(update: Pick<ParameterUpdate, 'plugin_uri' | 'param_index' | 'instance_id' | 'plugin_position'>): string {
    if (typeof update.instance_id === 'number' && Number.isFinite(update.instance_id) && update.instance_id > 0) {
      return `instance:${update.instance_id}:${update.param_index}`
    }
    if (typeof update.plugin_position === 'number' && Number.isFinite(update.plugin_position) && update.plugin_position >= 0) {
      return `position:${update.plugin_uri}:${update.plugin_position}:${update.param_index}`
    }
    return `uri:${update.plugin_uri}:${update.param_index}`
  }

  async queueUpdate(
    pluginUri: string,
    paramIndex: number,
    value: number,
    instanceId?: number,
    pluginPosition?: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const normalizedInstanceId = typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0
        ? Math.trunc(instanceId)
        : undefined
      const normalizedPluginPosition = typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0
        ? Math.trunc(pluginPosition)
        : undefined
      const nextUpdate: ParameterUpdate = {
        plugin_uri: pluginUri,
        param_index: paramIndex,
        value,
        ...(normalizedInstanceId !== undefined ? { instance_id: normalizedInstanceId } : {}),
        ...(normalizedPluginPosition !== undefined ? { plugin_position: normalizedPluginPosition } : {}),
      }

      // Replace any existing update for the same parameter
      const existingIndex = this.queue.findIndex(
        (u) => ParameterBatcher.updateIdentityKey(u) === ParameterBatcher.updateIdentityKey(nextUpdate)
      );
      if (existingIndex >= 0) {
        this.queue[existingIndex] = nextUpdate;
      } else {
        this.queue.push(nextUpdate);
      }

      this.pendingPromises.push({ resolve, reject });

      // Schedule batch send
      if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), BATCH_DELAY_MS);
      }

      // Force flush if batch is full
      if (this.queue.length >= MAX_BATCH_SIZE) {
        this.flush();
      }
    });
  }

  /**
   * Immediately send all queued updates
   */
  async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const updates = [...this.queue];
    const promises = [...this.pendingPromises];
    this.queue = [];
    this.pendingPromises = [];

    try {
      await fetchJson(`${API_BASE}/plugins/batch/parameters`, {
        method: 'POST',
        body: JSON.stringify({ updates }),
      });
      promises.forEach((p) => p.resolve());
    } catch (error) {
      promises.forEach((p) => p.reject(error as Error));
    }
  }

  /**
   * Get current queue size
   */
  get size(): number {
    return this.queue.length;
  }
}

// Global parameter batcher instance
const parameterBatcher = new ParameterBatcher();

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const bodyIsFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(bodyIsFormData ? {} : { 'Content-Type': 'application/json' }),
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      // Read as text first, then try to parse as JSON
      const text = await response.text();
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    } catch {
      body = response.statusText;
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  const data = await response.json();
  return sanitizeDisplayPayload(data) as T;
}

function appendNodeQuery(url: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}node_id=${encodeURIComponent(nodeId)}`
}

const legacyUriOnlyChainReorderNodes = new Set<string>()

async function postLegacyUriOnlyChainReorder(
  url: string,
  pluginOrder: PluginOrderRef[],
): Promise<{ status: string; chain_id: number; plugins: PluginOrderRef[] }> {
  const response = await fetchJson<RawReorderPluginsResponse>(url, {
    method: 'POST',
    body: JSON.stringify(getLegacyUriOnlyPluginOrder(pluginOrder)),
  })

  return normalizeReorderPluginsResponse(response, pluginOrder)
}

function appendQueryParams(
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

function scopedNodePath(path: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') {
    return `${API_BASE}${path}`
  }
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${API_BASE}/node/${encodeURIComponent(nodeId)}/proxy/${normalizedPath}`
}

const AVB_API_BASE = `${API_BASE}/avb`
const AVB_CLUSTER_NODE_ID = 'all'

export type AvbClusterFanoutNodeResult<T> = {
  status_code?: number
  body?: T
}

export type AvbClusterFanoutResponse<T> = {
  nodes?: Record<string, AvbClusterFanoutNodeResult<T>>
}

export interface AvbDiscoveryNodePayload {
  node_id: string
  name?: string
  hostname?: string
  type?: string
  status?: string
  address?: string
  addresses?: string[]
  port?: number
  api_url?: string | null
  entity_id?: string | null
  talker_count?: number
  listener_count?: number
  discovered_at?: string
  last_seen: string
  capabilities?: Partial<AvbNode['capabilities']>
  avb_capabilities?: {
    talker_streams?: number
    listener_streams?: number
    ptp_synced?: boolean
    ptp_offset_ns?: number
    sample_rate?: number
    channels?: number
  }
  ptp?: Partial<NonNullable<AvbNode['ptp']>>
  health?: Partial<NonNullable<AvbNode['health']>>
  version?: string | null
  manufacturer?: string | null
  model?: string | null
}

export interface AvbDiscoverySummaryResponse {
  enabled: boolean
  total_discovered: number
  talker_nodes: number
  listener_nodes: number
  nodes: AvbDiscoveryNodePayload[]
  error?: string
}

export interface AvbDiscoveryNodesResponse {
  enabled: boolean
  nodes: AvbDiscoveryNodePayload[]
  error?: string
}

export interface AvbPtpStatusResponse {
  available?: boolean
  enabled?: boolean
  state: string
  domain: number
  is_master: boolean
  master_clock_id: string | null
  grandmaster_id?: string | null
  offset_ns: number | null
  mean_path_delay_ns?: number | null
  last_sync: string | null
  gptp_supported: boolean
  readiness?: AvbReadinessContract
  error?: string
}

export interface AvbStatusResponse {
  enabled: boolean
  configured: boolean
  operational: boolean
  degraded: boolean
  available: boolean
  interface: string
  interface_source: string
  state: string
  ptp: AvbPtpStatusResponse
  reason?: string | null
  readiness?: AvbReadinessContract
  compatibility?: Record<string, unknown>
  config?: Record<string, unknown>
}

export interface AvbConnectionEndpointPayload {
  endpoint_id?: string
  node_id?: string | null
  node_address?: string | null
  device_name?: string
}

export type AvbRouterConnectionPayload = Omit<ConnectionsResponse['connections'][number], 'talker' | 'listener'> & {
  talker: ConnectionsResponse['connections'][number]['talker'] & AvbConnectionEndpointPayload
  listener: ConnectionsResponse['connections'][number]['listener'] & AvbConnectionEndpointPayload
  bandwidth_mbps?: number
  connection_role?: string
  loop_id?: string | null
}

export interface AvbRouterConnectionsResponse {
  connections: AvbRouterConnectionPayload[]
  count: number
  error?: string
  source_node_id?: string
}

export type AvbRouterStatsResponse = Record<string, unknown>

export interface AvbRouterPatchRequest {
  talker_id: string
  listener_id: string
  connection_role?: string
  loop_id?: string | null
}

export interface AvbRouterPatchResponse {
  success: boolean
  connection_id: string
  message: string
  connection_role?: string
  loop_id?: string | null
  trace_id?: string
  stages?: unknown
  srp_admission?: unknown
  srp_release?: unknown
  srp_release_warning?: unknown
}

function appendAvbNodeQuery(url: string, nodeId?: string | null): string {
  if (!nodeId) {
    return url
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}node_id=${encodeURIComponent(nodeId)}`
}

function extractAvbRemediationHint(detailObj: Record<string, unknown>): string | null {
  const remediation = detailObj.remediation

  if (typeof remediation === 'string' && remediation.trim()) {
    return remediation.trim()
  }

  if (Array.isArray(remediation)) {
    const firstHint = remediation.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    )
    if (firstHint) {
      return firstHint.trim()
    }
  }

  return null
}

function appendAvbRemediation(message: string, remediationHint: string | null): string {
  if (!remediationHint) {
    return message
  }

  const normalizedMessage = message.toLowerCase()
  const normalizedHint = remediationHint.toLowerCase()
  if (normalizedMessage.includes(normalizedHint)) {
    return message
  }

  const separator = message.endsWith('.') ? '' : '.'
  return `${message}${separator} Remediation: ${remediationHint}`
}

function extractAvbErrorMessage(errorData: unknown, fallback: string): string {
  if (typeof errorData === 'string' && errorData.trim()) {
    return errorData
  }

  if (errorData && typeof errorData === 'object') {
    const payload = errorData as Record<string, unknown>

    const directError = payload.error
    if (typeof directError === 'string' && directError.trim()) {
      return directError
    }

    const detail = payload.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    if (detail && typeof detail === 'object') {
      const detailObj = detail as Record<string, unknown>
      const code = typeof detailObj.code === 'string' ? detailObj.code : null
      const message = typeof detailObj.message === 'string' ? detailObj.message : null
      const reason = typeof detailObj.reason === 'string' ? detailObj.reason : null
      const remediationHint = extractAvbRemediationHint(detailObj)

      if (message && code) {
        return appendAvbRemediation(`${message} (${code})`, remediationHint)
      }
      if (message) {
        return appendAvbRemediation(message, remediationHint)
      }
      if (reason && code) {
        return appendAvbRemediation(`${reason} (${code})`, remediationHint)
      }
      if (reason) {
        return appendAvbRemediation(reason, remediationHint)
      }
      if (code) {
        return appendAvbRemediation(code, remediationHint)
      }
    }
  }

  return fallback
}

// ==================== Audio API ====================

export const audioApi = {
  getStatus: (nodeId?: string | null) => fetchJson<AudioStatus>(appendNodeQuery(`${API_BASE}/audio/status`, nodeId)),

  start: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/start`, nodeId), { method: 'POST' }),

  stop: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/stop`, nodeId), { method: 'POST' }),

  getLatency: (nodeId?: string | null) => fetchJson<{ latency_ms: number }>(appendNodeQuery(`${API_BASE}/audio/latency`, nodeId)),

  getLevels: () => fetchJson<AudioLevels>(`${API_BASE}/audio/levels`),

  getPluginLevels: () => fetchJson<{ plugins: PluginLevels[] }>(`${API_BASE}/audio/levels/plugins`),

  getPipedalMetrics: () => fetchJson<Record<string, unknown>>(`${API_BASE}/audio/pipedal`),

  getSourceOfTruth: (nodeId?: string | null) =>
    fetchJson<AudioSourceTruthPayload>(appendNodeQuery(`${API_BASE}/audio/source-of-truth`, nodeId)),

  configure: (config: { sampleRate?: number; bufferSize?: number }, nodeId?: string | null) => {
    const params = new URLSearchParams();
    if (config.sampleRate) params.append('sample_rate', config.sampleRate.toString());
    if (config.bufferSize) params.append('buffer_size', config.bufferSize.toString());
    return fetchJson<{
      success: boolean;
      message: string;
      updated_settings: Record<string, number>;
      current_config: { sample_rate: number; buffer_size: number; cpu_load: number };
    }>(appendNodeQuery(`${API_BASE}/audio/config?${params.toString()}`, nodeId), { method: 'POST' });
  },

  restart: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/restart`, nodeId), { method: 'POST' }),

  getHealth: (nodeId?: string | null) => fetchJson<AudioHealth>(appendNodeQuery(`${API_BASE}/audio/health`, nodeId)),

  getXruns: (nodeId?: string | null) => fetchJson<XrunStats>(appendNodeQuery(`${API_BASE}/audio/health/xruns`, nodeId)),

  getSignalStatus: () => fetchJson<SignalStatus>(`${API_BASE}/audio/health/signal`),

  getBufferPresets: (nodeId?: string | null) => fetchJson<BufferPreset[]>(appendNodeQuery(`${API_BASE}/audio/buffer-presets`, nodeId)),

  getJuceMetrics: (nodeId?: string | null) => fetchJson<JuceMetrics>(appendNodeQuery(`${API_BASE}/audio/juce`, nodeId)),

  unmute: (nodeId?: string | null) =>
    fetchJson<{ success: boolean }>(appendNodeQuery(`${API_BASE}/audio/health/unmute`, nodeId), { method: 'POST' }),

  // Port routing
  getPorts: () => fetchJson<AudioPortsResponse>(`${API_BASE}/audio/ports`),

  getRouting: () => fetchJson<AudioRoutingResponse>(`${API_BASE}/audio/routing`),

  setRouting: (config: {
    inputPorts?: number[];
    outputPorts?: number[];
    inputAvbEndpoints?: string[];
    outputAvbEndpoints?: string[];
  }) => {
    const params = new URLSearchParams();
    if (config.inputPorts) {
      config.inputPorts.forEach(p => params.append('input_ports', p.toString()));
    }
    if (config.outputPorts) {
      config.outputPorts.forEach(p => params.append('output_ports', p.toString()));
    }
    if (config.inputAvbEndpoints) {
      config.inputAvbEndpoints.forEach(endpointId => params.append('input_avb_endpoints', endpointId));
    }
    if (config.outputAvbEndpoints) {
      config.outputAvbEndpoints.forEach(endpointId => params.append('output_avb_endpoints', endpointId));
    }
    return fetchJson<AudioRoutingUpdateResponse>(`${API_BASE}/audio/routing?${params.toString()}`, {
      method: 'POST',
    });
  },

  getPortPresets: () => fetchJson<AudioPortPresetsResponse>(`${API_BASE}/audio/ports/presets`),

  // Per-chain port routing
  getChainRouting: (chainId: number) =>
    fetchJson<ChainRoutingResponse>(`${API_BASE}/audio/routing/chain/${chainId}`),

  setChainRouting: (chainId: number, config: {
    inputPorts?: number[];
    outputPorts?: number[];
    inputAvbEndpoints?: string[];
    outputAvbEndpoints?: string[];
  }) => {
    const params = new URLSearchParams();
    if (config.inputPorts) {
      config.inputPorts.forEach(p => params.append('input_ports', p.toString()));
    }
    if (config.outputPorts) {
      config.outputPorts.forEach(p => params.append('output_ports', p.toString()));
    }
    if (config.inputAvbEndpoints) {
      config.inputAvbEndpoints.forEach(endpointId => params.append('input_avb_endpoints', endpointId));
    }
    if (config.outputAvbEndpoints) {
      config.outputAvbEndpoints.forEach(endpointId => params.append('output_avb_endpoints', endpointId));
    }
    return fetchJson<ChainRoutingUpdateResponse>(`${API_BASE}/audio/routing/chain/${chainId}?${params.toString()}`, {
      method: 'POST',
    });
  },

  clearChainRouting: (chainId: number) =>
    fetchJson<{
      success: boolean;
      message: string;
      chain_id: number;
      input_ports: number[];
      output_ports: number[];
      input_avb_endpoints: string[];
      output_avb_endpoints: string[];
      input_bindings: AudioRoutingSelectionBinding[];
      output_bindings: AudioRoutingSelectionBinding[];
      is_override: boolean;
    }>(
      `${API_BASE}/audio/routing/chain/${chainId}`,
      { method: 'DELETE' }
    ),
};

// Audio health types
export interface AudioHealth {
  status: 'healthy' | 'warning' | 'critical';
  running: boolean;
  auto_muted: boolean;
  xruns_last_minute: number;
  signal_detected: boolean;
  cpu_load: number;
  latency_ms: number;
  alerts: string[];
}

export interface XrunStats {
  total: number;
  last_minute: number;
  last_hour: number;
  last_timestamp?: string;
}

export interface SignalStatus {
  input_detected: boolean;
  output_active: boolean;
  peak_input: number;
  peak_output: number;
}

export interface BufferPreset {
  size: number;
  latency_ms: number;
  label: string;
  recommended?: boolean;
}

export interface JuceMetrics {
  engine_version: string;
  audio_device: string;
  input_channels: number;
  output_channels: number;
  sample_rate: number;
  buffer_size: number;
  cpu_load: number;
  available_devices?: string[];
}

// Audio port routing types
export interface AudioPort {
  index: number;
  name: string;
  type: 'input' | 'output';
}

export interface AudioAvbEndpoint {
  endpoint_id: string;
  device_name: string;
  direction: 'talker' | 'listener';
  host?: string;
  channels: number;
  sample_rate: number;
  available: boolean;
  audio_format?: string;
  device_type?: string;
  node_address?: string;
}

export interface AudioRoutingSelectionBinding {
  selection_type: 'local_port' | 'avb_endpoint';
  available: boolean;
  missing?: boolean;
  index?: number;
  name?: string;
  source?: string;
  endpoint_id?: string;
  direction?: 'talker' | 'listener';
  device_name?: string;
  host?: string;
  channels?: number;
  sample_rate?: number;
}

export interface AudioPortsResponse {
  available: boolean;
  device?: string;
  inputs: AudioPort[];
  outputs: AudioPort[];
  input_count: number;
  output_count: number;
  avb_readiness?: Record<string, unknown>;
  avb_talkers?: AudioAvbEndpoint[];
  avb_listeners?: AudioAvbEndpoint[];
  capabilities?: Record<string, unknown>;
  error?: string;
}

export interface AudioRoutingResponse {
  available: boolean;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override?: boolean;
  error?: string;
}

export interface AudioRoutingUpdateResponse {
  success: boolean;
  message: string;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override?: boolean;
}

export interface ChainRoutingResponse {
  available: boolean;
  chain_id: number;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override: boolean;
  chain_exists?: boolean;
}

export interface ChainRoutingUpdateResponse {
  success: boolean;
  message: string;
  chain_id: number;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override: boolean;
}

export interface AudioPortPreset {
  id: string;
  name: string;
  description: string;
  input_ports: number[];
  output_ports: number[];
}

export interface AudioPortPresetsResponse {
  presets: AudioPortPreset[];
  current: {
    input_ports: number[];
    output_ports: number[];
    input_avb_endpoints: string[];
    output_avb_endpoints: string[];
  };
}

// Diagnostics API
export const diagnosticsApi = {
  // Run audio loopback test
  runLoopbackTest: (nodeId?: string | null) =>
    fetchJson<DiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/test`, nodeId), { method: 'POST' }),

  // Get ALSA device info
  getAlsaInfo: (nodeId?: string | null) => fetchJson<AlsaDeviceInfo>(appendNodeQuery(`${API_BASE}/audio/alsa/info`, nodeId)),

  // Reset ALSA state
  resetAlsaState: (nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/audio/alsa/reset`, nodeId), { method: 'POST' }),

  // Enumerate USB devices
  getUsbDevices: (nodeId?: string | null) => fetchJson<UsbDevice[]>(appendNodeQuery(`${API_BASE}/usb/devices/list`, nodeId)),

  // Reset USB device
  resetUsbDevice: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ success: boolean; message: string }>(appendNodeQuery(`${API_BASE}/usb/reset/${deviceId}`, nodeId), { method: 'POST' }),

  // Run full diagnostic suite
  runFullDiagnostic: (nodeId?: string | null) =>
    fetchJson<FullDiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/diagnostics/full`, nodeId), { method: 'POST' }),

  // Clear XRun counter
  clearXruns: (nodeId?: string | null) =>
    fetchJson<{ success: boolean }>(appendNodeQuery(`${API_BASE}/audio/health/xruns/clear`, nodeId), { method: 'POST' }),

  // Test specific sample rate
  testSampleRate: (rate: number, nodeId?: string | null) =>
    fetchJson<DiagnosticResult>(appendNodeQuery(`${API_BASE}/audio/test/sample-rate?rate=${rate}`, nodeId), { method: 'POST' }),

  // Test buffer stability
  testBufferStability: (bufferSize: number, duration: number, nodeId?: string | null) =>
    fetchJson<BufferStabilityResult>(
      appendNodeQuery(`${API_BASE}/audio/test/buffer-stability?buffer_size=${bufferSize}&duration=${duration}`, nodeId),
      { method: 'POST' }
    ),
};

export interface DiagnosticResult {
  success: boolean;
  test_name: string;
  duration_ms: number;
  latency_ms?: number;
  quality_score?: number;
  xruns_detected: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface AlsaDeviceInfo {
  cards: AlsaCard[];
  current_device: string;
  driver: string;
  state: 'running' | 'stopped' | 'error';
}

export interface AlsaCard {
  id: number;
  name: string;
  driver: string;
  devices: AlsaSubDevice[];
}

export interface AlsaSubDevice {
  id: number;
  name: string;
  type: 'playback' | 'capture';
  channels: number;
  sample_rates: number[];
  formats: string[];
}

export interface UsbDevice {
  bus: number;
  device: number;
  vendor_id: string;
  product_id: string;
  manufacturer: string;
  product: string;
  serial?: string;
  is_audio: boolean;
}

export interface FullDiagnosticResult {
  timestamp: string;
  overall_status: 'pass' | 'warning' | 'fail';
  tests: DiagnosticResult[];
  recommendations: string[];
}

export interface BufferStabilityResult {
  success: boolean;
  buffer_size: number;
  duration_seconds: number;
  xruns: number;
  avg_cpu_load: number;
  peak_cpu_load: number;
  stability_score: number;
  recommendation: string;
}

// ==================== USB / Device API ====================

export const usbApi = {
  getPrimaryHotoneDevice: () =>
    fetchJson<{
      name: string;
      model?: string;
      alsa_card?: string;
      alsa_device?: string;
      channels_in?: number;
      channels_out?: number;
    }>(`${API_BASE}/usb/hotone/primary`),
};

// ==================== Chains API ====================

export const chainsApi = {
  list: (nodeId?: string | null) => fetchJson<ChainsResponse>(appendNodeQuery(`${API_BASE}/chains/`, nodeId), { cache: 'no-store' }),

  get: (chainId: number, nodeId?: string | null) => fetchJson<Chain>(appendNodeQuery(`${API_BASE}/chains/${chainId}`, nodeId), { cache: 'no-store' }),

  create: (name: string, nodeId?: string | null) =>
    fetchJson<Chain>(appendNodeQuery(`${API_BASE}/chains/`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  delete: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/${chainId}`, nodeId), {
      method: 'DELETE',
    }),

  rename: (chainId: number, newName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; name: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/rename?new_name=${encodeURIComponent(newName)}`, nodeId),
      { method: 'PUT' }
    ),

  activate: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/${chainId}/activate`, nodeId), {
      method: 'POST',
    }),

  deactivate: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/${chainId}/deactivate`, nodeId), {
      method: 'POST',
    }),

  addPlugin: (chainId: number, pluginUri: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; plugins_count: number; plugin_position?: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`, nodeId),
      { method: 'POST' }
    ),

  removePlugin: (chainId: number, pluginUri: string, pluginPosition?: number, nodeId?: string | null) => {
    const params = new URLSearchParams({ plugin_uri: pluginUri })
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition)) {
      params.set('plugin_position', String(pluginPosition))
    }
    return fetchJson<{ status: string; chain_id: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/plugins?${params.toString()}`, nodeId),
      { method: 'DELETE' }
    )
  },

  reorderPlugins: async (chainId: number, pluginOrder: PluginOrderRef[], nodeId?: string | null) => {
    const url = appendNodeQuery(`${API_BASE}/chains/${chainId}/reorder`, nodeId)
    const compatibilityKey = getChainReorderCompatibilityKey(nodeId)

    if (legacyUriOnlyChainReorderNodes.has(compatibilityKey)) {
      return postLegacyUriOnlyChainReorder(url, pluginOrder)
    }

    try {
      const response = await fetchJson<RawReorderPluginsResponse>(url, {
        method: 'POST',
        body: JSON.stringify(pluginOrder),
      })
      return normalizeReorderPluginsResponse(response, pluginOrder)
    } catch (error) {
      if (!isLegacyUriOnlyReorderValidationError(error)) {
        throw error
      }

      legacyUriOnlyChainReorderNodes.add(compatibilityKey)
      return postLegacyUriOnlyChainReorder(url, pluginOrder)
    }
  },

  togglePluginBypass: (chainId: number, pluginUri: string, bypass: boolean, pluginPosition?: number, nodeId?: string | null) => {
    const params = new URLSearchParams({ bypass: String(bypass) })
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition)) {
      params.set('plugin_position', String(pluginPosition))
    }
    return fetchJson<{ status: string; chain_id: number; plugin: string; bypass: boolean }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/plugins/${encodeURIComponent(pluginUri)}/bypass?${params.toString()}`, nodeId),
      { method: 'POST' }
    )
  },

  savePreset: (chainId: number, presetName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; preset_id: number; name: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/preset/save?preset_name=${encodeURIComponent(presetName)}`, nodeId),
      { method: 'POST' }
    ),

  listPresets: (nodeId?: string | null) => fetchJson<{ presets: Snapshot[]; count: number }>(appendNodeQuery(`${API_BASE}/chains/presets`, nodeId)),

  loadPreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number }>(appendNodeQuery(`${API_BASE}/chains/preset/${presetId}/load`, nodeId), {
      method: 'POST',
    }),

  deletePreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; preset_id: number }>(appendNodeQuery(`${API_BASE}/chains/preset/${presetId}`, nodeId), {
      method: 'DELETE',
    }),

  listTemplates: (nodeId?: string | null) => fetchJson<{ templates: ChainTemplate[]; count: number }>(appendNodeQuery(`${API_BASE}/chains/templates/list`, nodeId)),

  loadTemplate: (templateName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain: Chain }>(
      appendNodeQuery(`${API_BASE}/chains/templates/load?template_name=${encodeURIComponent(templateName)}`, nodeId),
      { method: 'POST' }
    ),
};

// ==================== Effects Loops API ====================

export interface TesiraLoopTemplate {
  template_id: string;
  tesira_device_id: string;
  stream_in_tags: string[];
  stream_out_tags: string[];
  crosspoint_tags: string[];
  input_router_tag?: string | null;
  output_router_tag?: string | null;
  meter_tags: string[];
  bypass_tags: string[];
  channel_map_policy: string;
  validation_status: string;
  validation_error?: string | null;
  runtime_status?: TesiraTemplateRuntimeStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TesiraTemplateRuntimeAlarm {
  code: string;
  severity: 'error' | 'warning' | 'info' | string;
  message: string;
  tag?: string;
  tag_type?: string;
  detail?: string;
}

export interface TesiraTemplateRuntimeStatus {
  drift_status: 'ok' | 'warning' | 'error' | 'unknown' | string;
  alarm_count: number;
  alarms: TesiraTemplateRuntimeAlarm[];
  checked_at: string;
  probed_tag_count?: number;
  failed_tag_count?: number;
}

export interface LoopMetrics {
  loop_id: string;
  state_actual?: string;
  target_added_latency_ms: number;
  measured_added_latency_ms?: number | null;
  compensation_samples: number;
  channels?: number;
  health_status?: string;
  health_reason?: string | null;
  updated_at?: string | null;
}

export const effectsLoopsApi = {
  list: (nodeId?: string | null) =>
    fetchJson<{ loops: EffectsLoop[]; count: number }>(appendNodeQuery(`${API_BASE}/effects-loops`, nodeId)),

  create: (payload: Partial<EffectsLoop> & { name: string; channels: number; topology: string }, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (loopId: string, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId)),

  patch: (loopId: string, payload: Partial<EffectsLoop>, nodeId?: string | null) =>
    fetchJson<EffectsLoop>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (loopId: string, nodeId?: string | null) =>
    fetchJson<{ status: string; loop_id: string }>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, nodeId), {
      method: 'DELETE',
    }),

  activate: (loopId: string, payload: { audition_mode?: boolean } = {}, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/activate`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bypass: (loopId: string, bypass: boolean, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/bypass`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ bypass }),
    }),

  calibrate: (loopId: string, options: Record<string, unknown> = {}, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/calibrate`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ options }),
    }),

  getMetrics: (loopId: string, nodeId?: string | null) =>
    fetchJson<LoopMetrics>(appendNodeQuery(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/metrics`, nodeId)),

  listTemplates: (nodeId?: string | null) =>
    fetchJson<{ templates: TesiraLoopTemplate[]; count: number }>(appendNodeQuery(`${API_BASE}/tesira/loop-templates`, nodeId)),

  upsertTemplate: (templateId: string, payload: Omit<TesiraLoopTemplate, 'template_id' | 'validation_status' | 'validation_error' | 'created_at' | 'updated_at'>, nodeId?: string | null) =>
    fetchJson<TesiraLoopTemplate>(appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  validateTemplate: (templateId: string, nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/validate`, nodeId), {
      method: 'POST',
    }),

  getTemplateRuntimeStatus: (templateId: string, nodeId?: string | null) =>
    fetchJson<{ template_id: string; tesira_device_id: string; runtime_status: TesiraTemplateRuntimeStatus }>(
      appendNodeQuery(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/runtime-status`, nodeId)
    ),

  listChainInsertions: (chainId: number, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; loop_insertions: LoopInsertion[]; effects_loops: EffectsLoop[]; count: number }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops`, nodeId)
    ),

  insertChainLoop: (chainId: number, payload: Partial<LoopInsertion> & { loop_id: string; slot_index: number }, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion; effects_loop: EffectsLoop }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/insert`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  patchChainLoop: (chainId: number, insertionId: string, payload: Partial<LoopInsertion>, nodeId?: string | null) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`, nodeId),
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  deleteChainLoop: (chainId: number, insertionId: string, nodeId?: string | null) =>
    fetchJson<{ status: string; chain_id: number; insertion_id: string }>(
      appendNodeQuery(`${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`, nodeId),
      { method: 'DELETE' }
    ),
};

// ==================== Plugins API ====================

export interface PluginDiscoverResponse extends PluginsResponse {
  cached?: boolean;
  warning?: string;
  error?: string;
}

export interface PluginParameterSchemaEntry {
  pluginId: string;
  paramKey: string;
  index: number;
  name: string;
  symbol: string;
  descriptor: ParameterDescriptor;
  isLog: boolean;
  isToggled: boolean;
  source: 'native' | 'lv2' | 'hardware' | 'plugin';
  format?: string;
}

export interface PluginParameterSchemaPlugin {
  pluginId: string;
  name: string;
  format?: string;
  source: 'native' | 'lv2' | 'hardware' | 'plugin';
  parameterCount: number;
  parameters: PluginParameterSchemaEntry[];
}

export interface PluginParameterSchemaResponse {
  schema: ParameterRegistry;
  plugins: PluginParameterSchemaPlugin[];
  count: number;
  cached?: boolean;
  warning?: string;
  error?: string;
}

export const PLUGIN_INVENTORY_CHANGED_EVENT = 'map2:plugins-changed';

function notifyPluginInventoryChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PLUGIN_INVENTORY_CHANGED_EVENT));
  }
}

export const pluginsApi = {
  discover: (refresh = false, nodeId?: string | null) =>
    fetchJson<PluginDiscoverResponse>(
      appendNodeQuery(`${API_BASE}/plugins/discover${refresh ? '?refresh=true' : ''}`, nodeId)
    ),

  refresh: async () => {
    const response = await fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/refresh`, { method: 'POST' });
    notifyPluginInventoryChanged();
    return response;
  },

  clearCache: async () => {
    const response = await fetchJson<{ status: string; plugins_cleared: number }>(`${API_BASE}/plugins/cache`, { method: 'DELETE' });
    notifyPluginInventoryChanged();
    return response;
  },

  list: () => fetchJson<{ loaded: Plugin[]; count: number; parked?: Plugin[]; parked_count?: number }>(`${API_BASE}/plugins/list`),

  load: async (uri: string) => {
    const response = await fetchJson<{ status: string; plugin: Plugin }>(`${API_BASE}/plugins/load?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    });
    notifyPluginInventoryChanged();
    return response;
  },

  unload: async (uri: string, instanceId?: number) => {
    const params = new URLSearchParams({ uri })
    if (typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0) {
      params.set('instance_id', String(Math.trunc(instanceId)))
    }
    const response = await fetchJson<{ status: string; uri: string; instance_id?: number }>(`${API_BASE}/plugins/unload?${params.toString()}`, {
      method: 'POST',
    });
    notifyPluginInventoryChanged();
    return response;
  },

  getParameterSchema: (refresh = false) =>
    fetchJson<PluginParameterSchemaResponse>(`${API_BASE}/plugins/parameter-schema${refresh ? '?refresh=true' : ''}`),

  delete: (uri: string, nodeId?: string | null) =>
    fetchJson<{ status: string; uri: string; path: string; removed: number }>(
      appendNodeQuery(`${API_BASE}/plugins/${encodeURIComponent(uri)}`, nodeId),
      { method: 'DELETE' }
    ),

  getParameters: (uri: string) =>
    fetchJson<{ uri: string; parameters: unknown[] }>(`${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters`),

  setParameter: (uri: string, paramIndex: number, value: number, instanceId?: number, pluginPosition?: number) => {
    const params = new URLSearchParams({ value: String(value) })
    if (typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0) {
      params.set('instance_id', String(Math.trunc(instanceId)))
    }
    if (typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0) {
      params.set('plugin_position', String(Math.trunc(pluginPosition)))
    }
    return fetchJson<{ uri: string; param: number; value: number }>(
      `${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters/${paramIndex}?${params.toString()}`,
      { method: 'POST' }
    )
  },

  /**
   * Queue a parameter update for batched sending.
   * Multiple rapid parameter updates are combined into a single API call.
   * Ideal for real-time knob/slider adjustments.
   */
  setParameterBatched: (uri: string, paramIndex: number, value: number, instanceId?: number, pluginPosition?: number) =>
    parameterBatcher.queueUpdate(uri, paramIndex, value, instanceId, pluginPosition),

  /**
   * Immediately flush any pending batched parameter updates.
   * Call this when user finishes adjusting a parameter (e.g., on mouse up).
   */
  flushParameterBatch: () => parameterBatcher.flush(),

  /**
   * Get the number of pending batched updates.
   */
  getPendingBatchSize: () => parameterBatcher.size,

  /**
   * Send multiple parameter updates in a single request.
   * Use this for programmatic bulk updates (e.g., loading a preset).
   */
  batchSetParameters: (updates: Array<{ uri: string; paramIndex: number; value: number; instanceId?: number; pluginPosition?: number }>) =>
    fetchJson<{
      status: string;
      applied: number;
      errors: number;
      results: Array<{ plugin_uri: string; param_index: number; value: number }>;
      error_details?: Array<{ plugin_uri: string; param_index: number; error: string }>;
    }>(`${API_BASE}/plugins/batch/parameters`, {
      method: 'POST',
      body: JSON.stringify({
        updates: updates.map((u) => ({
          plugin_uri: u.uri,
          param_index: u.paramIndex,
          value: u.value,
          ...(typeof u.instanceId === 'number' && Number.isFinite(u.instanceId) && u.instanceId > 0
            ? { instance_id: Math.trunc(u.instanceId) }
            : {}),
          ...(typeof u.pluginPosition === 'number' && Number.isFinite(u.pluginPosition) && u.pluginPosition >= 0
            ? { plugin_position: Math.trunc(u.pluginPosition) }
            : {}),
        })),
      }),
    }),
};

// ==================== Snapshots API ====================

export const snapshotsApi = {
  list: (options?: { category?: string; tags?: string; favorites_only?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.tags) params.set('tags', options.tags);
    if (options?.favorites_only) params.set('favorites_only', 'true');
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson<SnapshotsResponse>(`${API_BASE}/snapshots/${query ? `?${query}` : ''}`);
  },

  create: (request: CreateSnapshotRequest) =>
    fetchJson<{ status: string; snapshot_id: number; message: string }>(`${API_BASE}/snapshots/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (
    snapshotId: number,
    updates: { name?: string; tags?: string[]; category?: string; description?: string; is_favorite?: boolean }
  ) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (snapshotId: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/snapshots/${snapshotId}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (snapshotId: number) =>
    fetchJson<{ status: string; is_favorite: boolean; message: string }>(
      `${API_BASE}/snapshots/${snapshotId}/favorite`,
      { method: 'POST' }
    ),

  getCategories: () => fetchJson<{ categories: SnapshotCategory[]; count: number }>(`${API_BASE}/snapshots/categories`),

  getTags: () => fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/snapshots/tags`),
};

// ==================== MIDI API ====================

export const midiApi = {
  getDevices: () => fetchJson<{ inputs: MIDIDevice[]; outputs: MIDIDevice[] }>(`${API_BASE}/midi/devices`),

  start: () => fetchJson<{ message: string }>(`${API_BASE}/midi/start`, { method: 'POST' }),

  stop: () => fetchJson<{ message: string }>(`${API_BASE}/midi/stop`, { method: 'POST' }),

  getMappings: () => fetchJson<{ mappings: MIDIMapping[]; count: number }>(`${API_BASE}/midi/mappings`),

  addMapping: (channel: number, cc: number, targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; channel: number; cc: number; target: string; param: number }>(
      `${API_BASE}/midi/mappings?channel=${channel}&cc=${cc}&target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' }
    ),

  startLearn: (targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; target: string; param: number }>(
      `${API_BASE}/midi/learn?target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' }
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ status: string; mapping_id: number }>(
      `${API_BASE}/midi/mappings/${mappingId}`,
      { method: 'DELETE' }
    ),
};

// ==================== MIDI API V2 (Enhanced) ====================

export const midiApiV2 = {
  // ========== Status ==========
  getStatus: () => fetchJson<MIDIStatus>(`${API_BASE}/v2/midi/status`),

  // ========== Devices ==========
  getDevices: () => fetchJson<{
    input_devices: string[];
    output_devices: string[];
    current_input: string | null;
    current_output: string | null;
  }>(`${API_BASE}/v2/midi/devices`),

  openInputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/input`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) }
    ),

  openOutputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/output`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) }
    ),

  closeInputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/input`, { method: 'DELETE' }),

  closeOutputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/output`, { method: 'DELETE' }),

  // ========== CC Mappings ==========
  getMappings: (options?: { chain_id?: number; plugin_uri?: string }) => {
    const params = new URLSearchParams();
    if (options?.chain_id !== undefined) params.append('chain_id', options.chain_id.toString());
    if (options?.plugin_uri) params.append('plugin_uri', options.plugin_uri);
    const query = params.toString();
    return fetchJson<{ mappings: MIDIMappingV2[]; count: number }>(
      `${API_BASE}/v2/midi/mappings${query ? `?${query}` : ''}`
    );
  },

  createMapping: (mapping: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings`,
      { method: 'POST', body: JSON.stringify(mapping) }
    ),

  updateMapping: (mappingId: number, updates: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'DELETE' }
    ),

  testMappingFeedback: (
    mappingId: number,
    options?: { normalized_value?: number; use_current_value?: boolean },
  ) =>
    fetchJson<MIDIMappingTestResult>(
      `${API_BASE}/v2/midi/mappings/${mappingId}/test`,
      { method: 'POST', body: JSON.stringify(options ?? {}) }
    ),

  // ========== Commands ==========
  getCommands: () =>
    fetchJson<{ commands: MIDICommand[]; count: number }>(`${API_BASE}/v2/midi/commands`),

  createCommand: (command: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands`,
      { method: 'POST', body: JSON.stringify(command) }
    ),

  updateCommand: (commandId: number, updates: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteCommand: (commandId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'DELETE' }
    ),

  // ========== Routing Rules ==========
  getRoutingRules: (chainId?: number) => {
    const query = chainId !== undefined ? `?chain_id=${chainId}` : '';
    return fetchJson<{ routing_rules: MIDIRoutingRule[]; count: number }>(
      `${API_BASE}/v2/midi/routing-rules${query}`
    );
  },

  createRoutingRule: (rule: Partial<MIDIRoutingRule>) =>
    fetchJson<{ routing_rule: MIDIRoutingRule; message: string }>(
      `${API_BASE}/v2/midi/routing-rules`,
      { method: 'POST', body: JSON.stringify(rule) }
    ),

  deleteRoutingRule: (ruleId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/routing-rules/${ruleId}`,
      { method: 'DELETE' }
    ),

  // ========== MIDI Learn ==========
  startLearn: (params: {
    chain_id: number;
    plugin_uri: string;
    param_symbol: string;
    param_index: number;
    min_val?: number;
    max_val?: number;
    curve_type?: MIDICurveType;
  }) =>
    fetchJson<{ success: boolean; target: MIDILearnTarget }>(
      `${API_BASE}/v2/midi/learn/start`,
      { method: 'POST', body: JSON.stringify(params) }
    ),

  stopLearn: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/learn/stop`, { method: 'POST' }),

  getLearnStatus: () =>
    fetchJson<{ learning: boolean; target: MIDILearnTarget | null }>(`${API_BASE}/v2/midi/learn/status`),

  // ========== Presets ==========
  getPresets: () =>
    fetchJson<{ presets: MIDIPreset[]; count: number }>(`${API_BASE}/v2/midi/presets`),

  savePreset: (name: string, description?: string) =>
    fetchJson<{ preset: MIDIPreset; message: string }>(
      `${API_BASE}/v2/midi/presets`,
      { method: 'POST', body: JSON.stringify({ name, description }) }
    ),

  loadPreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}/load`,
      { method: 'POST' }
    ),

  deletePreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}`,
      { method: 'DELETE' }
    ),

  // ========== Mapping Groups ==========
  getGroups: () =>
    fetchJson<{ groups: MIDIMappingGroup[]; count: number }>(`${API_BASE}/v2/midi/groups`),

  createGroup: (name: string, color?: string) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups`,
      { method: 'POST', body: JSON.stringify({ name, color }) }
    ),

  updateGroup: (groupId: number, updates: { name?: string; color?: string; sort_order?: number }) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteGroup: (groupId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'DELETE' }
    ),

  // ========== Chain MIDI Config ==========
  getChainConfigs: () =>
    fetchJson<{ configs: ChainMIDIConfig[]; count: number }>(`${API_BASE}/v2/midi/chain-configs`),

  setChainConfig: (chainId: number, programNumber: number, options?: {
    bank_msb?: number;
    bank_lsb?: number;
    send_pc_on_activate?: boolean;
  }) =>
    fetchJson<{ config: ChainMIDIConfig; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'PUT', body: JSON.stringify({ program_number: programNumber, ...options }) }
    ),

  deleteChainConfig: (chainId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'DELETE' }
    ),

  // ========== Device Configs ==========
  getDeviceConfigs: () =>
    fetchJson<{ configs: MIDIDeviceConfig[]; count: number }>(`${API_BASE}/v2/midi/device-configs`),

  saveDeviceConfig: (config: Partial<MIDIDeviceConfig>) =>
    fetchJson<{ config: MIDIDeviceConfig; message: string }>(
      `${API_BASE}/v2/midi/device-configs`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  // ========== MIDI Output ==========
  sendCC: (channel: number, cc: number, value: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/cc`,
      { method: 'POST', body: JSON.stringify({ channel, cc, value }) }
    ),

  sendProgramChange: (channel: number, program: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/program-change`,
      { method: 'POST', body: JSON.stringify({ channel, program }) }
    ),

  sendNote: (channel: number, note: number, velocity: number, on: boolean) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/note`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity, on }) }
    ),

  syncToController: () =>
    fetchJson<{ success: boolean; mappings_synced: number }>(
      `${API_BASE}/v2/midi/sync`,
      { method: 'POST' }
    ),

  // ========== Device Profiles ==========
  getDeviceProfiles: () =>
    fetchJson<{ profiles: MIDIDeviceProfile[]; count: number; active_profile_id: string | null }>(
      `${API_BASE}/v2/midi/device-profiles`
    ),

  getDeviceProfile: (profileId: string) =>
    fetchJson<MIDIDeviceProfile>(`${API_BASE}/v2/midi/device-profiles/${profileId}`),

  applyDeviceProfile: (profileId: string, clearExisting = true) =>
    fetchJson<ProfileApplyResult>(
      `${API_BASE}/v2/midi/device-profiles/apply`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, clear_existing: clearExisting }) }
    ),

  detectDeviceProfile: (deviceName: string) =>
    fetchJson<{ detected: boolean; profile_id: string | null; profile?: MIDIDeviceProfile; suggestion?: string }>(
      `${API_BASE}/v2/midi/device-profiles/detect?device_name=${encodeURIComponent(deviceName)}`
    ),

  getActiveProfile: () =>
    fetchJson<{ active: boolean; profile: MIDIDeviceProfile | null }>(
      `${API_BASE}/v2/midi/device-profiles/active`
    ),

  // ========== Bank Management ==========
  getCurrentBank: () =>
    fetchJson<{ current_bank: number; max_banks: number; items_per_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/current`
    ),

  bankUp: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/up`,
      { method: 'POST' }
    ),

  bankDown: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/down`,
      { method: 'POST' }
    ),

  setBank: (bank: number) =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/set?bank=${bank}`,
      { method: 'POST' }
    ),

  // ========== Expression Pedal Calibration ==========
  getExpressionCalibrations: () =>
    fetchJson<{ calibrations: Record<string, ExpressionCalibration> }>(
      `${API_BASE}/v2/midi/expression/calibration`
    ),

  getExpressionCalibration: (pedalId: string) =>
    fetchJson<ExpressionCalibration>(
      `${API_BASE}/v2/midi/expression/calibration/${pedalId}`
    ),

  updateExpressionCalibration: (params: {
    pedal_id: string;
    min_raw?: number;
    max_raw?: number;
    deadzone_low?: number;
    deadzone_high?: number;
    curve?: MIDIExpressionCurve;
    invert?: boolean;
  }) =>
    fetchJson<{ status: string; calibration: ExpressionCalibration }>(
      `${API_BASE}/v2/midi/expression/calibration`,
      { method: 'POST', body: JSON.stringify(params) }
    ),

  // ========== Firmware Update ==========
  getDFUStatus: () =>
    fetchJson<DFUStatus>(`${API_BASE}/v2/midi/firmware/dfu-status`),

  getDFUInstructions: (profileId: string) =>
    fetchJson<DFUInstructions>(`${API_BASE}/v2/midi/firmware/dfu-instructions/${profileId}`),

  flashFirmware: (profileId: string, firmwarePath: string) =>
    fetchJson<{ success: boolean; message?: string; error?: string; output?: string }>(
      `${API_BASE}/v2/midi/firmware/flash`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, firmware_path: firmwarePath }) }
    ),
};

export interface MidiHubTrafficRow {
  timestamp_ns: number;
  source_port: string;
  destination_port: string;
  direction: string;
  raw_hex: string;
  route_id?: string | null;
   origin_node_id?: string;
   source_node_id?: string;
   destination_node_id?: string;
  decoded?: {
    message_type?: string;
    channel?: number | null;
    data1?: number | null;
    data2?: number | null;
  };
}

export interface MidiHubTrafficSnapshot {
  count: number;
  captured_total: number;
  capacity: number;
  records: MidiHubTrafficRow[];
}

export interface MidiHubRouteFilter {
  message_types: string[];
  channels: number[];
  cc_range?: [number, number] | null;
  note_range?: [number, number] | null;
  velocity_range?: [number, number] | null;
}

export interface MidiHubRoute {
  route_id: string;
  source_port: string;
  destination_ports: string[];
  enabled: boolean;
  priority: number;
  route_type: string;
  filter: MidiHubRouteFilter;
  transform_chain: Array<Record<string, unknown>>;
  latency_compensation_enabled?: boolean;
  destination_latency_ms?: Record<string, number>;
}

export interface MidiHubRouteRequest {
  route_id?: string;
  source_port: string;
  destination_ports: string[];
  enabled?: boolean;
  priority?: number;
  route_type?: string;
  filter?: Partial<MidiHubRouteFilter>;
  transform_chain?: Array<Record<string, unknown>>;
  latency_compensation_enabled?: boolean;
  destination_latency_ms?: Record<string, number>;
}

export interface MidiHubPresetSummary {
  preset_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  conditions: Record<string, unknown>;
}

export interface MidiHubPresetPayload {
  preset_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  snapshot: Record<string, unknown>;
  conditions: Record<string, unknown>;
}

export interface MidiHubProgramSlotMap {
  slots: Record<string, string>;
}

export interface MidiHubEventList {
  event_list_id: string;
  name: string;
  list_type: 'mtc' | 'rtc' | string;
  source_id: string;
  internal_clock_enabled: boolean;
  first_time: string;
  last_time: string;
  fps: number;
  timezone: string;
  enabled: boolean;
  running: boolean;
  current_timecode: string;
  current_frame: number;
  current_datetime?: string | null;
  clock_source: string;
  learn_mode_enabled: boolean;
  learn_action_type: string;
  learn_label: string;
  learn_payload: Record<string, unknown>;
  fired_event_ids: string[];
  event_count: number;
}

export interface MidiHubEventListEvent {
  event_id: string;
  order: number;
  time_address: string;
  action_type: string;
  label: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  last_fired_at?: number | null;
}

export interface MidiHubMscMessage {
  device_id: number;
  command_format: number;
  command: string;
  cue_number: string;
  list_number?: string | null;
  message_hex: string;
  message: number[];
}

export interface MidiHubScriptSummary {
  script_id: string;
  name: string;
  code: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface MidiHubClockStatus {
  bpm: number;
  running: boolean;
  source_mode: string;
  output_ports: string[];
  divider: number;
  multiplier: number;
  offset_ms: number;
  detected_bpm?: number | null;
  song_position: number;
  tap_note?: number | null;
  tap_cc?: number | null;
}

export interface MidiHubNetworkSession {
  session_id: string;
  host: string;
  port: number;
  mode: string;
  active: boolean;
  created_at: number;
  latency_ms?: number | null;
  jitter_ms?: number | null;
}

export interface Midi2TransportBindingState {
  transport: string;
  target_id?: string | null;
  response_port?: string | null;
  bound_at?: number | null;
}

export interface Midi2TransportResult {
  ok: boolean;
  transport?: string | null;
  target_id?: string | null;
  response_port?: string | null;
  request_kind?: string | null;
  request_id?: number | null;
  awaiting_reply?: boolean;
  payload_hex?: string | null;
  reason?: string | null;
}

export interface Midi2ProfileDetailState {
  profile_id: string;
  inquiry_target: number;
  data_hex: string;
  data_text?: string | null;
  data?: unknown;
}

export interface Midi2SubscriptionState {
  resource?: string | null;
  res_id?: string | null;
  active: boolean;
  last_command?: string | null;
  last_request_id?: number | null;
  last_update_at?: number | null;
  pending_refresh?: boolean;
}

export interface Midi2UmpInspectionMessage {
  type: string;
  group: number;
  [key: string]: unknown;
}

export interface Midi2DeviceState {
  device_id: string;
  protocol: string;
  remote_muid?: string | null;
  manufacturer_id?: string | null;
  family_id?: string | null;
  model_id?: string | null;
  software_revision?: string | null;
  supports_profiles?: boolean;
  supports_property_exchange?: boolean;
  max_sysex_size?: number | null;
  discovery_state?: string | null;
  profile_state?: string | null;
  property_state?: string | null;
  profiles: Record<string, boolean>;
  profile_details?: Record<string, Midi2ProfileDetailState>;
  properties: Record<string, unknown>;
  resources?: string[];
  subscriptions?: Record<string, Midi2SubscriptionState>;
  property_exchange_capabilities?: Record<string, unknown>;
  last_discovery_at?: number | null;
  last_request_at?: number | null;
  last_request_kind?: string | null;
  last_request_id?: number | null;
  pending_request_kind?: string | null;
  pending_request_id?: number | null;
  pending_request_deadline?: number | null;
  last_request_hex?: string | null;
  last_response_at?: number | null;
  last_response_hex?: string | null;
  last_response_source?: string | null;
  last_response_summary?: string | null;
}

export interface Midi2Status {
  enabled: boolean;
  default_protocol: string;
  local_muid?: string | null;
  device_count: number;
  devices: Midi2DeviceState[];
  binding: Midi2TransportBindingState;
  last_error?: string | null;
  last_tx_at?: number | null;
  last_tx_hex?: string | null;
  last_tx_kind?: string | null;
  last_tx_device_id?: string | null;
  last_rx_at?: number | null;
  last_rx_hex?: string | null;
  last_rx_source?: string | null;
  last_rx_device_id?: string | null;
  discovery_pending_until?: number | null;
}

export interface TesiraAliasState {
  instance_tag: string;
  block_type: string;
  label?: string;
  level?: number;
  mute?: boolean;
  selection?: number;
  peak_db?: number;
}

export interface TesiraSubscriptionState {
  token: string;
  instance_tag: string;
  attribute: string;
  created_at: number;
  last_value?: unknown;
}

export interface TesiraStatus {
  connected: boolean;
  host: string;
  port: number;
  secured: boolean;
  username: string;
  auto_reconnect: boolean;
  connected_at?: number | null;
  last_error?: string | null;
  aliases: TesiraAliasState[];
  subscriptions: TesiraSubscriptionState[];
  history: Array<{ command: string; response: string; timestamp: number }>;
  device_info: Record<string, unknown>;
  presets: Array<{ preset_id: number; name: string; active: boolean }>;
  matrix: Array<{ input: number; output: number; level: number; mute: boolean }>;
}

export interface VirtualGpioChannel {
  channel_id: string;
  channel_type: 'input' | 'output' | string;
  index: number;
  label: string;
  state: boolean;
  last_changed_at: number;
}

export interface VirtualGpioSnapshot {
  input_count: number;
  output_count: number;
  inputs: VirtualGpioChannel[];
  outputs: VirtualGpioChannel[];
  events: Array<Record<string, unknown>>;
}

export interface StringInterfaceLog {
  direction: string;
  raw: string;
  parsed: Record<string, unknown>;
  timestamp: number;
}

export interface StringInterfaceStatus {
  enabled: boolean;
  listen_host: string;
  listen_port: number;
  target_host: string;
  target_port: number;
  log_count: number;
  logs: StringInterfaceLog[];
}

export interface OscNamespaceEntry {
  address: string;
  description: string;
  direction: string;
  current_value: unknown;
}

export interface OscNamespaceEvent {
  address: string;
  value: unknown;
  source: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface MidiHubLearnSuggestion {
  cc_number: number;
  channel: number;
  confidence: number;
  reason: string;
  chain_context?: Record<string, unknown>;
}

export interface MidiHubMessageMapperSlot {
  slot_id: string;
  enabled: boolean;
  source_port: string;
  message_type: string;
  channel_min: number;
  channel_max: number;
  value_min: number;
  value_max: number;
  target: string;
  curve: string;
  created_at: number;
  updated_at: number;
  match_count: number;
  last_matched_at?: number | null;
  last_source_port?: string | null;
  last_event_hex?: string | null;
  last_output_hex?: string | null;
  last_error?: string | null;
}

export interface MidiHubMacro {
  macro_id: string;
  name: string;
  trigger: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface MidiHubRecordingSession {
  session_id: string;
  name: string;
  created_at: number;
  started_at?: number | null;
  stopped_at?: number | null;
  loop_enabled: boolean;
  event_count: number;
}

export interface MidiHubScheduledEntry {
  schedule_id: string;
  destination_port: string;
  message_hex: string;
  run_at_ns: number;
  created_at: number;
  metadata: Record<string, unknown>;
  status: string;
  sent_at?: number | null;
  error?: string | null;
}

export interface MidiHubDeviceProfile {
  profile_id: string;
  name: string;
  match_patterns: string[];
  default_channel: number;
  supports_sysex: boolean;
  usb_vid_pid: string[];
  metadata: Record<string, unknown>;
  is_custom: boolean;
}

export interface MidiHubDeviceState {
  device_id: string;
  profile_id: string;
  profile_name: string;
  port_ids: string[];
  port_names: string[];
  connected: boolean;
  responding: boolean;
  health: string;
  latency_ms?: number | null;
  last_seen: string;
  vendor_id?: string | null;
  product_id?: string | null;
  manual_assignment?: string | null;
  source: string;
  node_id: string;
  remote: boolean;
}

export interface MidiHubDeviceInventory {
  count: number;
  devices: MidiHubDeviceState[];
  remote_device_count: number;
  remote_devices: MidiHubDeviceState[];
  global_device_count: number;
  profiles: MidiHubDeviceProfile[];
  assignments: Record<string, string>;
  shadow_state: Record<string, unknown>;
  online_events?: string[];
  offline_events?: string[];
}

// =============================
// Cluster MIDI (T103)
// =============================
export interface MidiClusterCapabilities {
  input_ports: string[];
  output_ports: string[];
  virtual_ports: string[];
  hub_running: boolean;
  clock_source: string;
  clock_bpm: number;
  protocol_version: string;
  supports_midi2: boolean;
  sysex_enabled: boolean;
}

export interface MidiClusterEndpoint {
  endpoint_id: string;
  node_id: string;
  port_name: string;
  direction: 'input' | 'output' | string;
  device_name: string;
  node_address: string;
  available: boolean;
  last_seen?: string | null;
  port_ref?: string;
}

export interface MidiClusterNode {
  node_id: string;
  hostname: string;
  addresses: string[];
  port: number;
  online: boolean;
  last_seen?: string | null;
  capabilities?: MidiClusterCapabilities;
  ports: MidiClusterEndpoint[];
  devices: Array<Record<string, unknown>>;
}

export interface MidiClusterConnection {
  connection_id: string;
  state: string;
  transport: string;
  session_id?: string | null;
  established_at?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  messages_forwarded: number;
  source: MidiClusterEndpoint;
  destination: MidiClusterEndpoint;
}

export interface MidiClusterClock {
  master_node_id?: string | null;
  master_bpm: number;
  strategy: string;
  is_master: boolean;
  sync_offset_ms: number;
  drift_ms: number;
  last_sync?: string | null;
  followers: string[];
}

export interface MidiClusterSummary {
  enabled: boolean;
  node_count: number;
  endpoint_count: number;
  connection_count: number;
  device_count: number;
  clock: MidiClusterClock;
  auto_connect: {
    reason: string;
    last_run_at?: string | null;
    pair_count: number;
    created_count: number;
    failed_count: number;
    created_connections: string[];
    failed_connections: Array<Record<string, unknown>>;
    transport: string;
  };
}

export interface MidiClusterHealth {
  enabled: boolean;
  status: string;
  node_count: number;
  connection_count: number;
  healthy_connection_count: number;
  degraded_connections: number;
  clock_status: string;
  clock_drift_ms: number;
  per_node: Array<{
    node_id: string;
    hostname: string;
    online: boolean;
    latency_ms?: number | null;
    input_port_count: number;
    output_port_count: number;
    device_count: number;
  }>;
  recent_events: Array<Record<string, unknown>>;
}

export const midiClusterApi = {
  listNodes: () => fetchJson<MidiClusterNode[]>(`${API_BASE}/midi/cluster/nodes`),

  getNode: (nodeId: string) =>
    fetchJson<MidiClusterNode>(`${API_BASE}/midi/cluster/nodes/${encodeURIComponent(nodeId)}`),

  listEndpoints: () => fetchJson<MidiClusterEndpoint[]>(`${API_BASE}/midi/cluster/endpoints`),

  getSummary: () => fetchJson<MidiClusterSummary>(`${API_BASE}/midi/cluster/summary`),

  listConnections: () =>
    fetchJson<MidiClusterConnection[]>(`${API_BASE}/midi/cluster/connections`),

  createConnection: (payload: { source_endpoint_id: string; destination_endpoint_id: string; transport?: string }) =>
    fetchJson<MidiClusterConnection>(`${API_BASE}/midi/cluster/connections`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteConnection: (connectionId: string) =>
    fetchJson<{ ok: boolean; message: string }>(
      `${API_BASE}/midi/cluster/connections/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE' }
    ),

  triggerAutoConnect: () =>
    fetchJson(`${API_BASE}/midi/cluster/connections/auto-connect`, { method: 'POST' }),

  getAutoConnectStatus: () =>
    fetchJson(`${API_BASE}/midi/cluster/connections/auto-connect/status`),

  getClock: () => fetchJson<MidiClusterClock>(`${API_BASE}/midi/cluster/clock`),

  setClockStrategy: (strategy: string, manualNodeId?: string) =>
    fetchJson<MidiClusterClock>(`${API_BASE}/midi/cluster/clock/strategy`, {
      method: 'PUT',
      body: JSON.stringify({ strategy, manual_node_id: manualNodeId ?? null }),
    }),

  forceClockSync: () => fetchJson(`${API_BASE}/midi/cluster/clock/sync`, { method: 'POST' }),

  getHealth: () => fetchJson<MidiClusterHealth>(`${API_BASE}/midi/cluster/health`),
}

export const midiHubApi = {
  getStatus: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/status`, nodeId)),
  getStatusForNode: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/status`, nodeId)),

  getRoutes: (nodeId?: string | null) =>
    fetchJson<{ routes: MidiHubRoute[]; match_mode: string }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId)),
  getRoutesForNode: (nodeId?: string | null) =>
    fetchJson<{ routes: MidiHubRoute[]; match_mode: string }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId)),

  createRoute: (payload: MidiHubRouteRequest, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route: MidiHubRoute }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRoute: (routeId: string, payload: MidiHubRouteRequest, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  deleteRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}`, nodeId), {
      method: 'DELETE',
    }),

  enableRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}/enable`, nodeId),
      { method: 'POST' }
    ),

  disableRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}/disable`, nodeId),
      { method: 'POST' }
    ),

  getTopology: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/topology`, nodeId)),
  getTransformTypes: (nodeId?: string | null) =>
    fetchJson<{ types: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/transforms/types`, nodeId)),

  listPresets: (nodeId?: string | null) =>
    fetchJson<{ presets: MidiHubPresetSummary[]; default: Record<string, unknown> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId)
    ),
  listPresetsForNode: (nodeId?: string | null) =>
    fetchJson<{ presets: MidiHubPresetSummary[]; default: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId)),

  getPreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}`, nodeId)
    ),

  savePreset: (payload: {
    preset_id: string;
    name: string;
    description?: string;
    conditions?: Record<string, unknown>;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: MidiHubPresetPayload }>(appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recallPreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/recall`, nodeId),
      { method: 'POST' }
    ),
  recallPresetForNode: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/recall`, nodeId),
      { method: 'POST' }
    ),

  deletePreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}`, nodeId), {
      method: 'DELETE',
    }),

  comparePresets: (leftPresetId: string, rightPresetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; diff: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/compare`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ left_preset_id: leftPresetId, right_preset_id: rightPresetId }),
    }),

  exportPreset: (presetId: string, exportPath?: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; path: string; preset_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/export`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ export_path: exportPath ?? null }),
      }
    ),

  importPreset: (filePath: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: MidiHubPresetPayload }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/import`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    }),

  getDefaultPreset: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default`, nodeId)),
  setDefaultPreset: (presetId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; default_preset_id?: string | null }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId ?? null }),
    }),
  recallDefaultPreset: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default/recall`, nodeId), {
      method: 'POST',
    }),

  getPresetChains: (nodeId?: string | null) =>
    fetchJson<{ count: number; chains: Record<string, string[]> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/chains`, nodeId)),
  setPresetChain: (chainId: string, presetIds: string[], nodeId?: string | null) =>
    fetchJson<{ ok: boolean; chain_id: string; preset_ids: string[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ preset_ids: presetIds }),
      }
    ),
  recallPresetChainStep: (chainId: string, stepIndex: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/recall/${stepIndex}`, nodeId),
      { method: 'POST' }
    ),
  runPresetChain: (
    chainId: string,
    payload: { interval_ms: number; cycles?: number | null; start_immediately?: boolean },
    nodeId?: string | null
  ) =>
    fetchJson<{ chain_id: string; running: boolean; interval_ms: number; cycles?: number | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/run`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  stopPresetChain: (chainId: string, nodeId?: string | null) =>
    fetchJson<{ chain_id: string; running: boolean }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/stop`, nodeId),
      {
        method: 'POST',
      }
    ),

  getProgramSlots: (nodeId?: string | null) =>
    fetchJson<MidiHubProgramSlotMap>(appendNodeQuery(`${API_BASE}/midi/hub/presets/slots`, nodeId)),
  setProgramSlot: (programNumber: number, targetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; program_number: number; target_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/slots/${programNumber}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ target_id: targetId }),
      }
    ),
  deleteProgramSlot: (programNumber: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/slots/${programNumber}`, nodeId), {
      method: 'DELETE',
    }),

  evaluatePresetContext: (context: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ count: number; recalled_preset_ids: string[] }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/context/evaluate`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ context }),
    }),

  listEventLists: (nodeId?: string | null) =>
    fetchJson<{ count: number; event_lists: MidiHubEventList[] }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists`, nodeId)),
  getEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list?: MidiHubEventList | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}`, nodeId),
    ),
  upsertEventList: (
    payload: {
      event_list_id: string;
      name: string;
      list_type: 'mtc' | 'rtc';
      source_id: string;
      internal_clock_enabled: boolean;
      first_time: string;
      last_time: string;
      fps: number;
      timezone: string;
      enabled?: boolean;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}`, nodeId), {
      method: 'DELETE',
    }),
  startEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/start`, nodeId),
      { method: 'POST' },
    ),
  stopEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/stop`, nodeId),
      { method: 'POST' },
    ),
  getEventListStatus: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; status: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/status`, nodeId),
    ),
  listEventListEvents: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ count: number; events: MidiHubEventListEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events`, nodeId),
    ),
  upsertEventListEvent: (
    eventListId: string,
    payload: {
      event_id: string;
      order: number;
      time_address: string;
      action_type: string;
      label: string;
      payload?: Record<string, unknown>;
      enabled?: boolean;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event: MidiHubEventListEvent }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteEventListEvent: (eventListId: string, eventId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events/${encodeURIComponent(eventId)}`, nodeId),
      { method: 'DELETE' },
    ),
  setEventListLearnMode: (
    eventListId: string,
    payload: { enabled: boolean; action_type?: string; label?: string; payload?: Record<string, unknown> },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/learn`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  captureEventListLearnMode: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event: MidiHubEventListEvent }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/learn/capture`, nodeId),
      { method: 'POST' },
    ),
  sendMscMessage: (
    payload: {
      destination_port: string;
      device_id: number;
      command_format: number;
      command: string;
      cue_number: string;
      list_number?: string | null;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean } & MidiHubMscMessage>(appendNodeQuery(`${API_BASE}/midi/hub/events/msc/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getScriptExamples: (nodeId?: string | null) =>
    fetchJson<{ count: number; examples: Array<{ script_id: string; name: string; code: string }> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/examples`, nodeId)
    ),
  listScripts: (nodeId?: string | null) =>
    fetchJson<{ count: number; scripts: MidiHubScriptSummary[] }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts`, nodeId)),
  getScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}`, nodeId)
    ),
  upsertScript: (payload: { script_id: string; name: string; code: string; enabled?: boolean }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script: MidiHubScriptSummary }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}`, nodeId), {
      method: 'DELETE',
    }),
  enableScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/enable`, nodeId),
      { method: 'POST' }
    ),
  disableScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/disable`, nodeId),
      { method: 'POST' }
    ),
  runScript: (scriptId: string, event: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script_id: string; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/run`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ event }),
      }
    ),
  triggerScript: (scriptId: string, event: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script_id: string; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/trigger`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ event }),
      }
    ),
  stopScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/stop`, nodeId), {
      method: 'POST',
    }),
  getScriptConsole: (scriptId: string, limit = 200, nodeId?: string | null) =>
    fetchJson<{ script_id: string; count: number; lines: string[] }>(
      appendNodeQuery(
        `${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/console?limit=${Math.max(1, Math.min(2000, limit))}`,
        nodeId
      )
    ),

  getClockStatus: (nodeId?: string | null) => fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId)),
  getClockStatusForNode: (nodeId?: string | null) => fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId)),
  updateClockConfig: (payload: Partial<MidiHubClockStatus>, nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  tapClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/tap`, nodeId), {
      method: 'POST',
    }),
  startClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/start`, nodeId), {
      method: 'POST',
    }),
  stopClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/stop`, nodeId), {
      method: 'POST',
    }),
  continueClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/continue`, nodeId), {
      method: 'POST',
    }),

  listNetworkSessions: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubNetworkSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId)),
  listNetworkSessionsForNode: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubNetworkSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId)),
  createNetworkSession: (payload: { session_id: string; host: string; port: number; mode?: 'send' | 'listen' }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session: MidiHubNetworkSession }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteNetworkSession: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions/${encodeURIComponent(sessionId)}`, nodeId), {
      method: 'DELETE',
    }),
  sendNetworkMidi: (sessionId: string, message: number[], nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions/${encodeURIComponent(sessionId)}/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  listOscMappings: (nodeId?: string | null) =>
    fetchJson<{ count: number; mappings: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/mappings`, nodeId)),
  setOscMappings: (mappings: Array<Record<string, unknown>>, nodeId?: string | null) =>
    fetchJson<{ count: number; mappings: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/mappings`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    }),
  startOscServer: (listenPort: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; listen_port: number }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/server`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ listen_port: listenPort }),
    }),
  stopOscServer: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; listen_port?: number | null }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/server`, nodeId), {
      method: 'DELETE',
    }),
  sendOsc: (payload: { host: string; port: number; address: string; value: number }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOscNamespace: (nodeId?: string | null) =>
    fetchJson<{ count: number; entries: OscNamespaceEntry[]; recent_events: OscNamespaceEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/network/osc/namespace`, nodeId)
    ),
  dispatchOscNamespace: (payload: { address: string; value?: unknown }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; address: string; value?: unknown; events?: OscNamespaceEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/network/osc/namespace/dispatch`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getMidi2Status: (nodeId?: string | null) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId)
    ),
  getMidi2StatusForNode: (nodeId?: string | null) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId)
    ),
  updateMidi2Config: (
    payload: {
      enabled?: boolean;
      default_protocol?: 'midi1' | 'midi2';
      binding_transport?: 'none' | 'port' | 'network_session';
      binding_target_id?: string;
      binding_response_port?: string;
    },
    nodeId?: string | null
  ) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  discoverMidi2Device: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; probe_id: string; discovery_sysex: number[]; transport: Midi2TransportResult }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/discover`, nodeId), {
      method: 'POST',
      body: JSON.stringify(deviceId ? { device_id: deviceId } : {}),
    }),
  inquireMidi2Profiles: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles/inquiry`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    ),
  inquireMidi2ProfileDetails: (deviceId: string, profileId: string, inquiryTarget = 0, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles/details`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileId, inquiry_target: inquiryTarget }),
      }
    ),
  setMidi2Profile: (deviceId: string, profileId: string, enabled = true, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ profile_id: profileId, enabled }),
      }
    ),
  inquireMidi2PropertyExchangeCapabilities: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/property-exchange/capabilities`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    ),
  invalidateMidi2Device: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device_id: string; target_muid: string; removed_device_ids: string[]; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/invalidate`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    ),
  subscribeMidi2Property: (deviceId: string, resource: string, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/subscriptions`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ resource, res_id: resId ?? undefined }),
      }
    ),
  endMidi2Subscription: (deviceId: string, subscribeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/subscriptions/${encodeURIComponent(subscribeId)}/end`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    ),
  readMidi2Property: (deviceId: string, resource: string, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties/read`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ resource, res_id: resId ?? undefined }),
      }
    ),
  setMidi2Property: (deviceId: string, resource: string, value: unknown, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ resource, res_id: resId ?? undefined, value }),
      }
    ),
  getMidi2Property: (deviceId: string, key: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device_id: string; key: string; value: unknown }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties/${encodeURIComponent(key)}`, nodeId)
    ),
  translateMidi1ToUmp: (message: number[], nodeId?: string | null) =>
    fetchJson<{ words: number[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/midi1-to-ump`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  translateUmpToMidi1: (words: number[], nodeId?: string | null) =>
    fetchJson<{ message: number[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/ump-to-midi1`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ words }),
    }),
  inspectMidi2Ump: (words: number[], nodeId?: string | null) =>
    fetchJson<{ messages: Midi2UmpInspectionMessage[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/inspect-ump`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ words }),
    }),

  getTesiraStatus: (nodeId?: string | null) => fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira`, nodeId)),
  connectTesira: (payload: {
    host: string
    port?: number
    username?: string
    password?: string
    secured?: boolean
    auto_reconnect?: boolean
  }, nodeId?: string | null) =>
    fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/connect`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  disconnectTesira: (nodeId?: string | null) =>
    fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/disconnect`, nodeId), {
      method: 'POST',
    }),
  sendTesiraCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; response: string; aliases?: TesiraAliasState[] }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/command`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  listTesiraAliases: (nodeId?: string | null) =>
    fetchJson<{ count: number; aliases: TesiraAliasState[] }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/aliases`, nodeId)),
  setTesiraLevel: (instanceTag: string, level: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; value: number }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/controls/level`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ instance_tag: instanceTag, level }),
    }),
  setTesiraMute: (instanceTag: string, muted: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; value: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/controls/mute`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ instance_tag: instanceTag, muted }),
    }),
  listTesiraSubscriptions: (nodeId?: string | null) =>
    fetchJson<{ count: number; subscriptions: TesiraSubscriptionState[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions`, nodeId)
    ),
  subscribeTesira: (instanceTag: string, attribute: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; subscription: TesiraSubscriptionState }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ instance_tag: instanceTag, attribute }),
    }),
  unsubscribeTesira: (token: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions/${encodeURIComponent(token)}`, nodeId), {
      method: 'DELETE',
    }),
  recallTesiraPreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: { preset_id: number; name: string; active: boolean } }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/presets/recall`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ preset_id: presetId }),
      }
    ),
  saveTesiraPreset: (presetId: number, name?: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: { preset_id: number; name: string; active: boolean } }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/presets/save`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ preset_id: presetId, name }),
      }
    ),
  getTesiraMatrix: (nodeId?: string | null) =>
    fetchJson<{ count: number; crosspoints: Array<{ input: number; output: number; level: number; mute: boolean }> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/matrix`, nodeId)
    ),

  getVirtualGpio: (nodeId?: string | null) => fetchJson<VirtualGpioSnapshot>(appendNodeQuery(`${API_BASE}/midi/hub/gpio`, nodeId)),
  setVirtualGpioLabel: (channelId: string, label: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/label`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ label }),
      }
    ),
  setVirtualGpioState: (channelId: string, state: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/state`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ state }),
      }
    ),
  toggleVirtualGpio: (channelId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/toggle`, nodeId),
      {
        method: 'POST',
      }
    ),

  getStringInterfaceStatus: (nodeId?: string | null) =>
    fetchJson<StringInterfaceStatus>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface`, nodeId)),
  updateStringInterfaceConfig: (payload: {
    enabled?: boolean
    listen_host?: string
    listen_port?: number
    target_host?: string
    target_port?: number
  }, nodeId?: string | null) =>
    fetchJson<StringInterfaceStatus>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  sendStringInterfaceCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: StringInterfaceLog }>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  receiveStringInterfaceCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: StringInterfaceLog }>(
      appendNodeQuery(`${API_BASE}/midi/hub/string-interface/receive`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ command }),
      }
    ),
  clearStringInterfaceLogs: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; cleared: number }>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface/clear`, nodeId), {
      method: 'POST',
    }),

  getLearnSuggestions: (payload: { parameter_id: string; chain_context?: Record<string, unknown> }, nodeId?: string | null) =>
    fetchJson<{
      ok: boolean;
      parameter_id: string;
      suggestions: MidiHubLearnSuggestion[];
      plugin_context: Record<string, unknown>;
      split_suggestions: Array<Record<string, unknown>>;
    }>(appendNodeQuery(`${API_BASE}/midi/hub/learn/suggestions`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listMessageMapperSlots: (nodeId?: string | null) =>
    fetchJson<{ count: number; slots: MidiHubMessageMapperSlot[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers`, nodeId),
    ),
  updateMessageMapperSlot: (
    slotId: string,
    payload: {
      enabled?: boolean;
      source_port?: string;
      message_type?: string;
      channel_min?: number;
      channel_max?: number;
      value_min?: number;
      value_max?: number;
      target?: string;
      curve?: string;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; slot: MidiHubMessageMapperSlot }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/${encodeURIComponent(slotId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  clearMessageMapperSlot: (slotId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; slot: MidiHubMessageMapperSlot }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/${encodeURIComponent(slotId)}/clear`, nodeId),
      {
        method: 'POST',
      },
    ),
  resetMessageMapperSlots: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; count: number; slots: MidiHubMessageMapperSlot[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/reset`, nodeId),
      {
        method: 'POST',
      },
    ),

  listMacros: (nodeId?: string | null) =>
    fetchJson<{ count: number; macros: MidiHubMacro[] }>(appendNodeQuery(`${API_BASE}/midi/hub/macros`, nodeId)),
  getMacro: (macroId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro?: MidiHubMacro | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}`, nodeId)
    ),
  upsertMacro: (payload: {
    macro_id: string;
    name: string;
    trigger?: Record<string, unknown>;
    actions?: Array<Record<string, unknown>>;
    enabled?: boolean;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro: MidiHubMacro }>(appendNodeQuery(`${API_BASE}/midi/hub/macros`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteMacro: (macroId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}`, nodeId), {
      method: 'DELETE',
    }),
  triggerMacro: (macroId: string, payload?: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro_id: string }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}/trigger`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ payload: payload ?? {} }),
    }),
  matchMacros: (payload: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; count: number; triggered_macro_ids: string[] }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/match`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ payload }),
    }),

  listRecordingSessions: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubRecordingSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions`, nodeId)),
  getRecordingSession: (sessionId: string, includeEvents = false, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session?: MidiHubRecordingSession | Record<string, unknown> | null }>(
      appendNodeQuery(
        `${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}?include_events=${includeEvents ? 'true' : 'false'}`,
        nodeId
      )
    ),
  startRecording: (payload: { session_id: string; name?: string }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session: MidiHubRecordingSession }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/start`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  stopRecording: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session?: MidiHubRecordingSession | null }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/stop`, nodeId), {
      method: 'POST',
    }),
  playbackRecording: (
    sessionId: string,
    payload?: { destination_override?: string; loop?: boolean; speed?: number },
    nodeId?: string | null
  ) =>
    fetchJson<{ ok: boolean; session_id: string; loop: boolean; speed: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/playback`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      }
    ),
  stopRecordingPlayback: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/stop`, nodeId), {
      method: 'POST',
    }),
  exportRecording: (
    sessionId: string,
    payload?: { export_path?: string; bpm?: number; ticks_per_quarter?: number },
    nodeId?: string | null
  ) =>
    fetchJson<{ ok: boolean; path: string; session_id: string; event_count: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/export`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      }
    ),
  deleteRecording: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}`, nodeId), {
      method: 'DELETE',
    }),

  listSchedulerEntries: (includeFinished = true, nodeId?: string | null) =>
    fetchJson<{ count: number; entries: MidiHubScheduledEntry[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler?include_finished=${includeFinished ? 'true' : 'false'}`, nodeId)
    ),
  getSchedulerEntry: (scheduleId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry?: MidiHubScheduledEntry | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId)
    ),
  createSchedulerEntry: (payload: {
    schedule_id: string;
    destination_port: string;
    message: number[];
    delay_ms?: number;
    run_at_ns?: number;
    metadata?: Record<string, unknown>;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: MidiHubScheduledEntry }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSchedulerEntry: (
    scheduleId: string,
    payload: {
      destination_port?: string;
      message?: number[];
      delay_ms?: number;
      run_at_ns?: number;
      metadata?: Record<string, unknown>;
    },
    nodeId?: string | null
  ) =>
    fetchJson<{ ok: boolean; entry: MidiHubScheduledEntry }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  cancelSchedulerEntry: (scheduleId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId), {
      method: 'DELETE',
    }),
  clearFinishedSchedulerEntries: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; removed: number }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler/clear-finished`, nodeId), {
      method: 'POST',
    }),

  getMeshStatus: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh`, nodeId)),
  upsertMeshPeer: (payload: { peer_id: string; base_url: string; active?: boolean }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; peer: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/peers`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteMeshPeer: (peerId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/peers/${encodeURIComponent(peerId)}`, nodeId), {
      method: 'DELETE',
    }),
  setMeshForwarding: (forwardingEnabled: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; forwarding_enabled: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/forwarding`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ forwarding_enabled: forwardingEnabled }),
    }),
  publishMeshRoutes: (
    payload: { source_instance?: string; routes: Array<Record<string, unknown>>; fanout?: boolean },
    nodeId?: string | null
  ) =>
    fetchJson<{ ok: boolean; route_count: number }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/routes`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDevices: (refresh = true, nodeId?: string | null) =>
    fetchJson<MidiHubDeviceInventory>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices?refresh=${refresh ? 'true' : 'false'}`, nodeId)
    ),
  getDeviceProfiles: (nodeId?: string | null) =>
    fetchJson<{ count: number; profiles: MidiHubDeviceProfile[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles`, nodeId)
    ),
  getDeviceProfile: (profileId: string, nodeId?: string | null) =>
    fetchJson<MidiHubDeviceProfile>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles/${encodeURIComponent(profileId)}`, nodeId)
    ),
  upsertDeviceProfile: (
    payload: {
      profile_id: string;
      name: string;
      match_patterns?: string[];
      default_channel?: number;
      supports_sysex?: boolean;
      usb_vid_pid?: string[];
      metadata?: Record<string, unknown>;
    },
    nodeId?: string | null
  ) =>
    fetchJson<{ ok: boolean; profile: MidiHubDeviceProfile }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  deleteDeviceProfile: (profileId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; profile_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles/${encodeURIComponent(profileId)}`, nodeId),
      {
        method: 'DELETE',
      }
    ),
  assignDevicePort: (payload: { port_name: string; device_id: string }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; port_name: string; device_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/assignments`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  clearDeviceAssignment: (portName: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; port_name: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/assignments/${encodeURIComponent(portName)}`, nodeId),
      {
        method: 'DELETE',
      }
    ),

  getDeviceShadow: (limit = 200, nodeId?: string | null) =>
    fetchJson<{ count: number; events: Array<Record<string, unknown>>; shadow_state: Record<string, unknown> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/shadow?limit=${Math.max(1, Math.min(5000, limit))}`, nodeId)
    ),
  upsertDeviceShadow: (
    deviceId: string,
    payload: { expected_state: Record<string, unknown>; source?: string },
    nodeId?: string | null
  ) =>
    fetchJson<{ device_id: string; drift_detected: boolean; drift: Record<string, unknown> | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/${encodeURIComponent(deviceId)}/shadow`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),
  clearDeviceShadowEvents: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; cleared: number }>(appendNodeQuery(`${API_BASE}/midi/hub/devices/shadow/clear`, nodeId), {
      method: 'POST',
    }),

  getTrafficSnapshot: (params?: {
    limit?: number;
    source_port?: string;
    destination_port?: string;
    message_type?: string;
    direction?: string;
  }, nodeId?: string | null) => {
    const search = new URLSearchParams()
    if (params?.limit !== undefined) search.set('limit', String(params.limit))
    if (params?.source_port) search.set('source_port', params.source_port)
    if (params?.destination_port) search.set('destination_port', params.destination_port)
    if (params?.message_type) search.set('message_type', params.message_type)
    if (params?.direction) search.set('direction', params.direction)
    const query = search.toString()
    return fetchJson<MidiHubTrafficSnapshot>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/snapshot${query ? `?${query}` : ''}`, nodeId))
  },

  getTrafficStats: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/stats`, nodeId)),

  exportTraffic: (format: 'json' | 'csv' = 'json', limit = 5000, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; format: string; path: string; count: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/traffic/export`, nodeId),
      { method: 'POST', body: JSON.stringify({ format, limit }) }
    ),

  clearTraffic: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/clear`, nodeId), { method: 'POST' }),
};

// ==================== IR API ====================

export const irApi = {
  getStatus: (nodeId?: string | null) => fetchJson<IRStatus>(appendNodeQuery(`${API_BASE}/ir/`, nodeId)),

  getTypeStatus: (
    type: 'cabinet' | 'reverb',
    options?: { instanceId?: number; nodeId?: string | null },
  ) => fetchJson<IRStatus>(
    appendNodeQuery(
      appendQueryParams(`${API_BASE}/ir/status`, { type, instance_id: options?.instanceId }),
      options?.nodeId,
    ),
  ),

  listCabinets: (nodeId?: string | null) => fetchJson<IRsResponse>(appendNodeQuery(`${API_BASE}/ir/cabinets`, nodeId)),

  listReverbs: (nodeId?: string | null) => fetchJson<IRsResponse>(appendNodeQuery(`${API_BASE}/ir/reverbs`, nodeId)),

  loadCabinet: (irName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(`${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`, nodeId),
      { method: 'POST' }
    ),

  loadReverb: (irName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(`${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`, nodeId),
      { method: 'POST' }
    ),

  loadCabinetToInstance: (irName: string, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  loadReverbToInstance: (irName: string, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  setCabinetMixForInstance: (mix: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/set-cabinet-mix/${mix}`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  setReverbMixForInstance: (mix: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; mix: number; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/set-reverb-mix/${mix}`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  setCabinetBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/set-cabinet-bypass/${bypass}`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  setReverbBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/set-reverb-bypass/${bypass}`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  navigateCabinetToInstance: (direction: 'prev' | 'next', instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/ir/navigate-cabinet/${direction}`, { instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  uploadCabinet: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/ir/cabinets/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>;
  },

  uploadReverb: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/ir/reverbs/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>;
  },
};

export interface LatencyJitterStats {
  p50_ms: number
  p95_ms: number
  p99_ms: number
  max_ms: number
  rtl_p95_ms?: number
  xrun_count: number
  window_seconds: number
  sample_count: number
  running?: boolean
}

export const latencyV2Api = {
  getJitterStats: (nodeId?: string | null) =>
    fetchJson<LatencyJitterStats>(appendNodeQuery(`${API_BASE}/v2/latency/jitter-stats`, nodeId)),
  resetXruns: (nodeId?: string | null) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/v2/latency/xruns/reset`, nodeId),
      { method: 'POST' }
    ),
}

// ==================== IR Library Download API ====================

import type {
  DownloadProgress,
  DownloadRequest,
  IRCategoriesResponse,
  IRDatabaseItem,
  IRDetailedItem,
  IRLibrariesResponse,
  IRListResponse,
  IRSearchRequest,
  IRSearchResponse,
} from '../app/types/library'

export const irLibraryApi = {
  getLibraries: () =>
    fetchJson<IRLibrariesResponse>(`${API_BASE}/irs/libraries/`),

  getCategories: () =>
    fetchJson<IRCategoriesResponse>(`${API_BASE}/irs/categories/`),

  listIRs: (params?: { limit?: number; offset?: number; category?: string; library?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.library) query.set('library', params.library)
    const queryString = query.toString()
    return fetchJson<IRListResponse>(`${API_BASE}/irs/${queryString ? `?${queryString}` : ''}`)
  },

  getIR: (id: number) =>
    fetchJson<IRDetailedItem>(`${API_BASE}/irs/${id}`),

  search: (request: IRSearchRequest) =>
    fetchJson<IRSearchResponse>(`${API_BASE}/irs/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  startDownload: (request: { sources?: string[]; parallel?: number; skip_existing?: boolean; limit?: number }) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/irs/download`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/irs/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(`${API_BASE}/irs/download/retry/${source}`, { method: 'POST' }),

  pauseDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/pause`, { method: 'POST' }),

  resumeDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/resume`, { method: 'POST' }),

  getFileTasks: () =>
    fetchJson<FileDownloadTask[]>(`${API_BASE}/irs/download/files`),

  getFileProgress: (filename: string) =>
    fetchJson<FileDownloadTask>(`${API_BASE}/irs/download/file/${filename}`),

  toggleFavorite: (id: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/irs/${id}/favorite`,
      { method: 'POST' }
    ),

  setRating: (id: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/irs/${id}/rating`,
      { method: 'PUT', body: JSON.stringify({ rating }) }
    ),

  // TONE3000 API Key Management
  getTone3000Status: () =>
    fetchJson<{ configured: boolean; authenticated: boolean; auth_url: string; token_expires: string | null }>(
      `${API_BASE}/irs/tone3000/status`
    ),

  setTone3000ApiKey: (apiKey: string) =>
    fetchJson<{ status: string; configured: boolean }>(
      `${API_BASE}/irs/tone3000/api-key`,
      { method: 'POST', body: JSON.stringify({ api_key: apiKey }) }
    ),

  testTone3000Auth: () =>
    fetchJson<{ status: string; authenticated: boolean; message?: string; sample_models?: Array<{ name: string; author: string; category: string }> }>(
      `${API_BASE}/irs/tone3000/test`,
      { method: 'POST' }
    ),
}

// ==================== NAM API ====================

export interface NAMListParams {
  limit?: number
  offset?: number
  category?: string
  amp_type?: string
  favorites_only?: boolean
}

export interface NAMSearchRequest {
  query?: string
  category?: string
  amp_type?: string
  favorites_only?: boolean
}

export interface NAMModelDetail {
  id: number
  name: string
  file_path: string
  file_hash?: string
  file_size?: number
  model_type: string
  sample_rate?: number
  input_gain?: number
  output_gain?: number
  category: string
  amp_type?: string
  amp_name?: string
  author?: string
  description?: string
  tags: string[]
  license?: string
  source_url?: string
  is_favorite: boolean
  rating?: number
  created_at?: string
}

export interface NAMCategoriesResponse {
  categories: string[]
  amp_types: string[]
}

export const namApi = {
  getStatus: (nodeId?: string | null) => fetchJson<NAMStatus>(appendNodeQuery(`${API_BASE}/nam/status`, nodeId)),

  getInstanceStatus: (instanceId: number, nodeId?: string | null) =>
    fetchJson<NAMStatus>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/status`, { instance_id: instanceId }),
        nodeId,
      )
    ),

  getCategories: () => fetchJson<NAMCategoriesResponse>(`${API_BASE}/nam/categories`),

  listModels: (params?: NAMListParams, nodeId?: string | null) => {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    if (params?.category) searchParams.set('category', params.category)
    if (params?.amp_type) searchParams.set('amp_type', params.amp_type)
    if (params?.favorites_only) searchParams.set('favorites_only', 'true')
    const query = searchParams.toString()
    return fetchJson<NAMModelsResponse>(appendNodeQuery(`${API_BASE}/nam/models${query ? `?${query}` : ''}`, nodeId))
  },

  getModel: (modelId: number) =>
    fetchJson<NAMModelDetail>(`${API_BASE}/nam/models/${modelId}`),

  search: (request: NAMSearchRequest) =>
    fetchJson<{ results: NAMModelDetail[]; count: number }>(`${API_BASE}/nam/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  loadModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; model: string }>(appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, nodeId), {
      method: 'POST',
    }),

  loadModelToInstance: (modelName: string, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; model: string }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, { instance_id: instanceId }),
        nodeId,
      ),
      {
        method: 'POST',
      }
    ),

  activateModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; model: string }>(
      appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/activate`, nodeId),
      { method: 'POST' }
    ),

  setInputGainForInstance: (gainDb: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; input_gain: number }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/input-gain`, { instance_id: instanceId }),
        nodeId,
      ),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      }
    ),

  setOutputGainForInstance: (gainDb: number, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; output_gain: number }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/output-gain`, { instance_id: instanceId }),
        nodeId,
      ),
      {
        method: 'POST',
        body: JSON.stringify({ gain_db: gainDb }),
      }
    ),

  setBypassForInstance: (bypass: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; bypass: boolean }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/bypass`, { bypass, instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  setNormalizeForInstance: (normalize: boolean, instanceId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; normalize: boolean }>(
      appendNodeQuery(
        appendQueryParams(`${API_BASE}/nam/normalize`, { normalize, instance_id: instanceId }),
        nodeId,
      ),
      { method: 'POST' }
    ),

  toggleFavorite: (modelId: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/nam/models/${modelId}/favorite`,
      { method: 'POST' }
    ),

  setRating: (modelId: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/nam/models/${modelId}/rating`,
      {
        method: 'PUT',
        body: JSON.stringify({ rating }),
      }
    ),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/nam/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; model: { id: number; name: string; file_path: string } }>
  },

  /** Delete a NAM model by name */
  deleteModel: (modelName: string, nodeId?: string | null) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}`, nodeId),
      { method: 'DELETE' }
    ),
};

// ==================== SoundFont API ====================

import type {
  SoundFontListResponse,
  SoundFontLibrariesResponse,
  SoundFontCategoriesResponse,
  SoundFontPresetResponse,
  FileDownloadTask,
} from '../app/types/library'

export const soundfontApi = {
  listSoundfonts: (params?: { limit?: number; offset?: number; category?: string; format?: string; include_presets?: boolean }, nodeId?: string | null) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.format) query.set('format', params.format)
    if (params?.include_presets) query.set('include_presets', 'true')
    const queryString = query.toString()
    return fetchJson<SoundFontListResponse>(appendNodeQuery(`${API_BASE}/soundfonts/${queryString ? `?${queryString}` : ''}`, nodeId))
  },

  getPresets: (path: string) =>
    fetchJson<SoundFontPresetResponse>(`${API_BASE}/soundfonts/presets/?path=${encodeURIComponent(path)}`),

  getLibraries: () =>
    fetchJson<SoundFontLibrariesResponse>(`${API_BASE}/soundfonts/libraries/`),

  getCategories: () =>
    fetchJson<SoundFontCategoriesResponse>(`${API_BASE}/soundfonts/categories/`),

  startDownload: (request: DownloadRequest) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/soundfonts/download`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/soundfonts/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(
      `${API_BASE}/soundfonts/download/retry/${encodeURIComponent(source)}`,
      { method: 'POST' }
    ),

  pauseDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/pause`, { method: 'POST' }),

  resumeDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/resume`, { method: 'POST' }),

  getFileTasks: () =>
    fetchJson<FileDownloadTask[]>(`${API_BASE}/soundfonts/download/files`),

  getFileProgress: (filename: string) =>
    fetchJson<FileDownloadTask>(`${API_BASE}/soundfonts/download/file/${filename}`),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/soundfonts/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; filename: string; format: string; path: string }>
  },
};

// ==================== SynthForge API ====================

export interface SynthForgePartConfig {
  part_index: number
  midi_channel: number
  output_bus: string
  level: number
  pan: number
  mute: boolean
  solo: boolean
}

export interface SynthForgePatchInfo {
  bank: number
  program: number
  name: string
  category: string
  author: string
  description?: string
}

export interface SynthForgeVoiceMetrics {
  active_voices: number
  peak_voices: number
  voices_per_part: number[]
  cpu_percent: number
}

export interface SynthForgeSampleStatus {
  loaded: boolean
  sampler_mode: boolean
  part_index: number
  region_count: number
  loaded_sample_count: number
  sfz_path: string
  soundfont_path: string
  soundfont_format: string
  active_bank: number
  active_program: number
  active_preset_name: string
  engine: string
  engine_available: boolean
  last_error: string
  warnings: string[]
}

export interface SynthForgePerformanceConfig {
  master_transpose: number
  velocity_curve: number
  pitch_bend_range: number
  mono_mode: boolean
  legato: boolean
}

export interface SynthForgeStreamingConfig {
  enabled: boolean
  preload_size: number
  max_voices: number
  interpolation: 'linear' | 'hermite' | 'sinc'
  quality_live: number
  quality_freewheeling: number
  memory_limit_mb: number
}

export interface SynthForgeHotReloadStatus {
  enabled: boolean
  interval_ms: number
  pending_reload: boolean
  reloaded: boolean
  generation: number
  last_reload_iso: string
  last_error: string
}

export interface SynthForgeScalaTuning {
  enabled: boolean
  scala_path: string
  root_key: number
  reference_hz: number
}

export interface SynthForgeMpeConfig {
  enabled: boolean
  lower_zone_channels: number
  upper_zone_channels: number
  pitch_bend_range_semitones: number
}

export interface SynthForgeModMatrixRoute {
  source: string
  destination: string
  amount: number
  bipolar: boolean
  enabled: boolean
}

export interface SynthForgeFreezeStatus {
  freeze_enabled: boolean
  frozen_signal_ready: boolean
  freeze_samples: number
  render_path: string
  last_error: string
}

export interface SynthForgeAnalyzerFrame {
  peak_left: number
  peak_right: number
  rms_left: number
  rms_right: number
  midi_events: number
  active_voices: number
}

export interface SynthForgeBackendStatus {
  backend: string
  sfizz_available: boolean
  sfizz_loaded: boolean
  region_count: number
  group_count: number
  preloaded_samples: number
  unknown_opcodes: string[]
  unsupported_opcodes: string[]
}

export const synthforgeApi = {
  getParts: () =>
    fetchJson<SynthForgePartConfig[]>(`${API_BASE}/synthforge/parts`),

  setPartConfig: (partIndex: number, config: SynthForgePartConfig) =>
    fetchJson<{ status: string; part_index: number }>(
      `${API_BASE}/synthforge/parts/${partIndex}/config`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getPatches: (category?: string) =>
    fetchJson<SynthForgePatchInfo[]>(
      `${API_BASE}/synthforge/patches${category ? `?category=${encodeURIComponent(category)}` : ''}`
    ),

  loadPatch: (partIndex: number, bank: number, program: number) =>
    fetchJson<{ status: string; part_index: number; bank: number; program: number }>(
      `${API_BASE}/synthforge/patches/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, bank, program }) }
    ),

  savePatch: (partIndex: number, bank: number, program: number, name: string) =>
    fetchJson<{ status: string; part_index: number; bank: number; program: number; name: string }>(
      `${API_BASE}/synthforge/patches/save`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, bank, program, name }) }
    ),

  getVoices: () =>
    fetchJson<SynthForgeVoiceMetrics>(`${API_BASE}/synthforge/voices`),

  getPartParameters: (partIndex: number) =>
    fetchJson<Record<string, number>>(`${API_BASE}/synthforge/parameters/${partIndex}`),

  setPartParameter: (partIndex: number, param: string, value: number) =>
    fetchJson<{ status: string; part_index: number; param: string; value: number }>(
      `${API_BASE}/synthforge/parameters/${partIndex}`,
      { method: 'POST', body: JSON.stringify({ param, value }) }
    ),

  getPerformance: (partIndex: number) =>
    fetchJson<SynthForgePerformanceConfig>(`${API_BASE}/synthforge/parts/${partIndex}/performance`),

  setPerformance: (partIndex: number, config: SynthForgePerformanceConfig) =>
    fetchJson<{ status: string; part_index: number; performance: SynthForgePerformanceConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/performance`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  loadSfz: (partIndex: number, sfzPath: string) =>
    fetchJson<{ status: string; part_index: number; sample_status: SynthForgeSampleStatus }>(
      `${API_BASE}/synthforge/sfz/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, sfz_path: sfzPath }) }
    ),

  loadSoundFont: (partIndex: number, soundfontPath: string, bank: number = 0, program: number = 0, presetName: string = '') =>
    fetchJson<{ status: string; part_index: number; sample_status: SynthForgeSampleStatus }>(
      `${API_BASE}/synthforge/soundfont/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, soundfont_path: soundfontPath, bank, program, preset_name: presetName }) }
    ),

  getSfzStatus: (partIndex: number) =>
    fetchJson<SynthForgeSampleStatus>(`${API_BASE}/synthforge/sfz/status/${partIndex}`),

  reloadSfzIfChanged: (partIndex: number) =>
    fetchJson<{ status: string; part_index: number; reloaded: boolean; sample_status: SynthForgeSampleStatus; hot_reload: SynthForgeHotReloadStatus }>(
      `${API_BASE}/synthforge/sfz/reload-if-changed/${partIndex}`,
      { method: 'POST' }
    ),

  setSamplerBackend: (partIndex: number, backend: 'native' | 'sfizz') =>
    fetchJson<{ status: string; part_index: number; backend: string }>(
      `${API_BASE}/synthforge/parts/${partIndex}/sampler-backend`,
      { method: 'POST', body: JSON.stringify({ backend }) }
    ),

  getSamplerBackend: (partIndex: number) =>
    fetchJson<{ part_index: number; backend: string }>(`${API_BASE}/synthforge/parts/${partIndex}/sampler-backend`),

  setStreamingConfig: (partIndex: number, config: SynthForgeStreamingConfig) =>
    fetchJson<{ status: string; part_index: number; config: SynthForgeStreamingConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/streaming`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getStreamingConfig: (partIndex: number) =>
    fetchJson<SynthForgeStreamingConfig>(`${API_BASE}/synthforge/parts/${partIndex}/streaming`),

  setHotReload: (partIndex: number, enabled: boolean, intervalMs: number = 1000) =>
    fetchJson<{ status: string; part_index: number; hot_reload: SynthForgeHotReloadStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/hot-reload`,
      { method: 'POST', body: JSON.stringify({ enabled, interval_ms: intervalMs }) }
    ),

  getHotReload: (partIndex: number) =>
    fetchJson<SynthForgeHotReloadStatus>(`${API_BASE}/synthforge/parts/${partIndex}/hot-reload`),

  loadScalaTuning: (partIndex: number, scalaPath: string, rootKey: number = 60, referenceHz: number = 440) =>
    fetchJson<{ status: string; part_index: number; tuning: SynthForgeScalaTuning }>(
      `${API_BASE}/synthforge/parts/${partIndex}/scala`,
      { method: 'POST', body: JSON.stringify({ scala_path: scalaPath, root_key: rootKey, reference_hz: referenceHz }) }
    ),

  getScalaTuning: (partIndex: number) =>
    fetchJson<SynthForgeScalaTuning>(`${API_BASE}/synthforge/parts/${partIndex}/scala`),

  setMpeConfig: (partIndex: number, config: SynthForgeMpeConfig) =>
    fetchJson<{ status: string; part_index: number; mpe: SynthForgeMpeConfig }>(
      `${API_BASE}/synthforge/parts/${partIndex}/mpe`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  getMpeConfig: (partIndex: number) =>
    fetchJson<SynthForgeMpeConfig>(`${API_BASE}/synthforge/parts/${partIndex}/mpe`),

  setModMatrixRoutes: (partIndex: number, routes: SynthForgeModMatrixRoute[]) =>
    fetchJson<{ status: string; part_index: number; routes: SynthForgeModMatrixRoute[] }>(
      `${API_BASE}/synthforge/parts/${partIndex}/mod-matrix`,
      { method: 'POST', body: JSON.stringify({ routes }) }
    ),

  getModMatrixRoutes: (partIndex: number) =>
    fetchJson<SynthForgeModMatrixRoute[]>(`${API_BASE}/synthforge/parts/${partIndex}/mod-matrix`),

  setFreeze: (partIndex: number, enabled: boolean) =>
    fetchJson<{ status: string; part_index: number; freeze: SynthForgeFreezeStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/freeze`,
      { method: 'POST', body: JSON.stringify({ enabled }) }
    ),

  getFreezeStatus: (partIndex: number) =>
    fetchJson<SynthForgeFreezeStatus>(`${API_BASE}/synthforge/parts/${partIndex}/freeze`),

  renderPartToFile: (partIndex: number, outputPath: string, durationMs: number = 2000) =>
    fetchJson<{ status: string; part_index: number; freeze: SynthForgeFreezeStatus }>(
      `${API_BASE}/synthforge/parts/${partIndex}/render`,
      { method: 'POST', body: JSON.stringify({ output_path: outputPath, duration_ms: durationMs }) }
    ),

  getPartAnalyzerFrame: (partIndex: number) =>
    fetchJson<SynthForgeAnalyzerFrame>(`${API_BASE}/synthforge/parts/${partIndex}/analyzer`),

  getAnalyzerFrames: () =>
    fetchJson<SynthForgeAnalyzerFrame[]>(`${API_BASE}/synthforge/analyzer`),

  getPartBackendStatus: (partIndex: number) =>
    fetchJson<SynthForgeBackendStatus>(`${API_BASE}/synthforge/backend-status/${partIndex}`),

  getBackendStatus: () =>
    fetchJson<SynthForgeBackendStatus[]>(`${API_BASE}/synthforge/backend-status`),

  noteOn: (channel: number, note: number, velocity: number = 100) =>
    fetchJson<{ status: string; channel: number; note: number; velocity: number }>(
      `${API_BASE}/synthforge/midi/note-on`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity }) }
    ),

  noteOff: (channel: number, note: number, velocity: number = 0) =>
    fetchJson<{ status: string; channel: number; note: number; velocity: number }>(
      `${API_BASE}/synthforge/midi/note-off`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity }) }
    ),
}

// ==================== Automation API ====================

export const automationApi = {
  getStatus: () => fetchJson<AutomationStatus>(`${API_BASE}/automation/status`),

  listLanes: () => fetchJson<{ parameters: string[]; count: number }>(`${API_BASE}/automation/lanes`),

  getLane: (parameterId: string) =>
    fetchJson<AutomationLane>(`${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`),

  createLane: (lane: {
    parameter_id: string;
    points?: AutomationPoint[];
    enabled?: boolean;
    modulation_source?: string;
    loop_start?: number;
    loop_end?: number;
  }) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lanes`, {
      method: 'POST',
      body: JSON.stringify(lane),
    }),

  deleteLane: (parameterId: string) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`,
      { method: 'DELETE' }
    ),

  addPoint: (parameterId: string, time: number, value: number, curve: CurveType = 'linear') =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'POST',
      body: JSON.stringify({ parameter_id: parameterId, time, value, curve }),
    }),

  removePoint: (parameterId: string, time: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'DELETE',
      body: JSON.stringify({ parameter_id: parameterId, time }),
    }),

  configureLFO: (config: LFOConfig) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lfo`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getValue: (parameterId: string, time?: number) => {
    const query = time !== undefined ? `?time=${time}` : '';
    return fetchJson<{ parameter_id: string; value: number; time: number }>(
      `${API_BASE}/automation/value/${encodeURIComponent(parameterId)}${query}`
    );
  },

  controlPlayback: (action: 'start' | 'stop' | 'seek', time?: number) =>
    fetchJson<{ status: string; action: string; is_playing: boolean; current_time: number }>(
      `${API_BASE}/automation/playback`,
      {
        method: 'POST',
        body: JSON.stringify({ action, time }),
      }
    ),

  importAutomation: (data: Record<string, unknown>) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  clearAll: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/clear`, { method: 'POST' }),
};

// ==================== History API ====================

export const historyApi = {
  getStatus: () => fetchJson<HistoryStatus>(`${API_BASE}/history/status`),

  getList: () => fetchJson<{ history: HistoryEntry[]; count: number }>(`${API_BASE}/history/list`),

  undo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_undo?: string }>(
      `${API_BASE}/history/undo`,
      { method: 'POST' }
    ),

  redo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_redo?: string }>(
      `${API_BASE}/history/redo`,
      { method: 'POST' }
    ),

  clear: () => fetchJson<{ status: string; message: string }>(`${API_BASE}/history/clear`, { method: 'POST' }),

  getSnapshots: () => fetchJson<{ snapshots: unknown[]; count: number }>(`${API_BASE}/history/snapshots`),

  restoreSnapshot: (index: number) =>
    fetchJson<{ status: string; message: string; state: unknown }>(
      `${API_BASE}/history/snapshots/${index}/restore`,
      { method: 'POST' }
    ),
};

// ==================== Sessions API ====================

export const sessionsApi = {
  list: () => fetchJson<SessionsResponse>(`${API_BASE}/sessions/list`),

  getCurrent: () => fetchJson<Session>(`${API_BASE}/sessions/current`),

  create: (name: string, description?: string, author?: string, tags?: string[]) =>
    fetchJson<{ status: string; message: string; session: Session }>(`${API_BASE}/sessions/create`, {
      method: 'POST',
      body: JSON.stringify({ name, description, author, tags }),
    }),

  save: (sessionData: Record<string, unknown>, createBackup = true) =>
    fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/save`, {
      method: 'POST',
      body: JSON.stringify({ session_data: sessionData, create_backup: createBackup }),
    }),

  load: (path: string) =>
    fetchJson<{ status: string; message: string; session: Session }>(
      `${API_BASE}/sessions/load?path=${encodeURIComponent(path)}`
    ),

  delete: (path: string, createBackup = true) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/sessions/delete?path=${encodeURIComponent(path)}&create_backup=${createBackup}`,
      { method: 'DELETE' }
    ),

  export: (exportPath?: string) => {
    const query = exportPath ? `?export_path=${encodeURIComponent(exportPath)}` : '';
    return fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/export${query}`, {
      method: 'POST',
    });
  },

  search: (query?: string, tags?: string[], author?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (tags && tags.length > 0) params.set('tags', tags.join(','));
    if (author) params.set('author', author);
    const queryString = params.toString();
    return fetchJson<{ results: SessionListItem[]; count: number }>(
      `${API_BASE}/sessions/search${queryString ? `?${queryString}` : ''}`
    );
  },
};

// ==================== Metrics API ====================

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
      `${API_BASE}/metrics/jack/latency`
    ),
};

// ==================== System API ====================

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
      { method: 'POST' }
    ),

  // Host Machine Page APIs
  getHostMachineInfo: (nodeId?: string | null) =>
    fetchJson<HostMachineInfo>(appendNodeQuery(`${API_BASE}/system/host-machine-info`, nodeId)),

  getDiskHealth: (nodeId?: string | null) =>
    fetchJson<DiskHealthData>(appendNodeQuery(`${API_BASE}/system/disk-health`, nodeId)),

  getHealthOverview: (nodeId?: string | null) =>
    fetchJson<SystemHealthOverview>(appendNodeQuery(`${API_BASE}/system/health-overview`, nodeId)),

  getBrandingAssets: (nodeId?: string | null) =>
    fetchJson<BrandingAssets>(appendNodeQuery(`${API_BASE}/system/branding-assets`, nodeId)),
};

// ==================== Health API ====================

export const healthApi = {
  check: () => fetchJson<{ status: string }>(`${API_BASE}/health`),
};

// ==================== Node API ====================

export const getNodeIdentity = (): Promise<NodeIdentity> => fetchJson<NodeIdentity>(`${API_BASE}/node/identity`);

export const getNodeHealth = (): Promise<NodeHealth> => fetchJson<NodeHealth>(`${API_BASE}/node/health`);

export const getNodeTopology = async (): Promise<NodeTopology> => {
  const payload = await fetchJson<Partial<NodeTopology> | null>(`${API_BASE}/node/topology`)
  return {
    nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
    audio_edges: Array.isArray(payload?.audio_edges) ? payload.audio_edges : [],
    network_edges: Array.isArray(payload?.network_edges) ? payload.network_edges : [],
  }
};

export const patchNodeLabel = (label: string, nodeId?: string | null): Promise<NodeIdentity> =>
  fetchJson<NodeIdentity>(scopedNodePath('/node/identity', nodeId), {
    method: 'PATCH',
    body: JSON.stringify({ display_label: label }),
  });

export const nodeApi = {
  getIdentity: getNodeIdentity,
  getHealth: getNodeHealth,
  getTopology: getNodeTopology,
  patchLabel: patchNodeLabel,
};

// ==================== AVB API ====================

export const avbApi = {
  getStatus: (nodeId?: string | null) =>
    safeFetchJson<AvbStatusResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/status`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB status',
    }),

  getPtpStatus: (nodeId?: string | null) =>
    safeFetchJson<AvbPtpStatusResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/ptp/status`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB PTP status',
    }),

  getDiscovery: (nodeId?: string | null) =>
    safeFetchJson<AvbDiscoverySummaryResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/discovery`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB discovery summary',
    }),

  getDiscoveredNodes: (nodeId?: string | null) =>
    safeFetchJson<AvbDiscoveryNodesResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/discovery/nodes`, nodeId), undefined, {
      fallbackError: 'Failed to fetch discovered AVB nodes',
    }),

  getDiscoveredNode: (discoveredNodeId: string, nodeId?: string | null) =>
    safeFetchJson<AvbDiscoveryNodePayload>(
      appendAvbNodeQuery(`${AVB_API_BASE}/discovery/nodes/${encodeURIComponent(discoveredNodeId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch node ${discoveredNodeId}` }
    ),

  getEndpoints: (direction?: StreamDirection, nodeId?: string | null) =>
    safeFetchJson<EndpointsResponse>(
      appendAvbNodeQuery(appendQueryParams(`${AVB_API_BASE}/router/endpoints`, { direction }), nodeId),
      undefined,
      { fallbackError: 'Failed to fetch endpoints' }
    ),

  getClusterEndpoints: (direction?: StreamDirection) =>
    safeFetchJson<AvbClusterFanoutResponse<EndpointsResponse>>(
      appendAvbNodeQuery(appendQueryParams(`${AVB_API_BASE}/router/endpoints`, { direction }), AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch endpoints' }
    ),

  getConnections: (nodeId?: string | null) =>
    safeFetchJson<AvbRouterConnectionsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/connections`, nodeId), undefined, {
      fallbackError: 'Failed to fetch connections',
    }),

  getClusterConnections: () =>
    safeFetchJson<AvbClusterFanoutResponse<AvbRouterConnectionsResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/connections`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch connections' }
    ),

  getRoutingMatrix: (nodeId?: string | null) =>
    safeFetchJson<RoutingMatrixResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/matrix`, nodeId), undefined, {
      fallbackError: 'Failed to fetch routing matrix',
    }),

  getRouterStats: (nodeId?: string | null) =>
    safeFetchJson<AvbRouterStatsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/stats`, nodeId), undefined, {
      fallbackError: 'Failed to fetch router stats',
    }),

  connect: (payload: AvbRouterPatchRequest, nodeId?: string | null) =>
    safeFetchJson<AvbRouterPatchResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/connect`, nodeId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        fallbackError: 'Connection failed',
        errorMessageExtractor: extractAvbErrorMessage,
      }
    ),

  disconnect: (payload: AvbRouterPatchRequest, nodeId?: string | null) =>
    safeFetchJson<AvbRouterPatchResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/disconnect`, nodeId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        fallbackError: 'Disconnection failed',
        errorMessageExtractor: extractAvbErrorMessage,
      }
    ),

  getStreams: (nodeId?: string | null) =>
    safeFetchJson<AvbStreamsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/streams`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB streams',
    }),

  getClusterStreams: () =>
    safeFetchJson<AvbClusterFanoutResponse<AvbStreamsResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVB streams' }
    ),

  getStream: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<AvbStreamPayload>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream ${streamId}` }
    ),

  getStreamDiagnostics: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<AvbStreamDiagnostics>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}/diagnostics`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream diagnostics for ${streamId}` }
    ),

  getStreamStats: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<Record<string, unknown>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}/stats`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream stats for ${streamId}` }
    ),

  getDevices: (nodeId?: string | null) =>
    safeFetchJson<AvbDevicesResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/devices`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB devices',
    }),

  getClusterDevices: () =>
    safeFetchJson<AvbClusterFanoutResponse<AvbDevicesResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/devices`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVB devices' }
    ),

  getChannelCapabilities: (nodeId?: string | null) =>
    safeFetchJson<AvbChannelCapabilitiesResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/capabilities/channels`, nodeId),
      undefined,
      { fallbackError: 'Failed to fetch AVB channel capabilities' }
    ),

  getAvdeccEntities: (nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccEntitiesResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities`, nodeId),
      undefined,
      { fallbackError: 'Failed to fetch AVDECC entities' }
    ),

  getClusterAvdeccEntities: () =>
    safeFetchJson<AvbClusterFanoutResponse<AvbAvdeccEntitiesResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVDECC entities' }
    ),

  getAvdeccEntity: (entityId: string, nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccEntity>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities/${encodeURIComponent(entityId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVDECC entity ${entityId}` }
    ),

  getAvdeccStats: (nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccStats>(appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/stats`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVDECC stats',
    }),
};

// ==================== Network API ====================

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
      { method: 'POST' }
    ),

  setDHCP: (iface: string, enabled: boolean) =>
    fetchJson<{ status: string; interface: string; dhcp: boolean }>(
      `${API_BASE}/network/interface/${iface}/dhcp?enabled=${enabled}`,
      { method: 'POST' }
    ),

  setStaticIP: (iface: string, config: IPConfiguration) =>
    fetchJson<{ status: string; interface: string; config: IPConfiguration }>(
      `${API_BASE}/network/interface/${iface}/static`,
      { method: 'POST', body: JSON.stringify(config) }
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
};

// ==================== WWW API ====================

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

  generateApiKey: () => fetchJson<{ status: string; api_key: string }>(`${API_BASE}/www/api-key/generate`, { method: 'POST' }),

  healthCheck: () => fetchJson<{ status: string; backend: boolean; frontend: boolean; timestamp: string }>(`${API_BASE}/www/health`),
};

// ==================== Services API ====================

export interface ServiceHealth {
  healthy: boolean;
  message: string;
  last_check: string | null;
  response_time_ms: number;
  metrics: Record<string, unknown>;
}

export interface ServiceStatus {
  name: string;
  display_name: string;
  description: string;
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed' | 'degraded';
  priority: number;
  dependencies: string[];
  is_optional: boolean;
  auto_restart: boolean;
  health: ServiceHealth;
  started_at: string | null;
  stopped_at: string | null;
  restart_count: number;
  last_error: string | null;
  pid: number | null;
}

export interface OrchestratorStatus {
  running: boolean;
  startup_time: string | null;
  uptime_seconds: number;
}

export interface ServicesStatusResponse {
  orchestrator: OrchestratorStatus;
  services: Record<string, ServiceStatus>;
  startup_order: string[];
}

export interface ServicesSummaryResponse {
  total_services: number;
  healthy_services: number;
  health_percentage: number;
  by_state: Record<string, number>;
}

export interface ServiceActionResponse {
  success: boolean;
  service: string;
  state: string;
  message?: string;
}

export interface BulkActionResponse {
  success: boolean;
  results: Record<string, boolean>;
  message?: string;
}

export const servicesApi = {
  getStatus: () => fetchJson<ServicesStatusResponse>(`${API_BASE}/services/status`),

  getServiceStatus: (serviceName: string) =>
    fetchJson<ServiceStatus>(`${API_BASE}/services/status/${serviceName}`),

  getSummary: () => fetchJson<ServicesSummaryResponse>(`${API_BASE}/services/summary`),

  getHealth: () =>
    fetchJson<{ healthy: boolean; orchestrator_running: boolean; uptime_seconds: number; unhealthy_services: unknown[] }>(
      `${API_BASE}/services/health`
    ),

  startAll: () => fetchJson<BulkActionResponse>(`${API_BASE}/services/start-all`, { method: 'POST' }),

  stopAll: () => fetchJson<BulkActionResponse>(`${API_BASE}/services/stop-all`, { method: 'POST' }),

  startService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/start/${serviceName}`, { method: 'POST' }),

  stopService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/stop/${serviceName}`, { method: 'POST' }),

  restartService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/restart/${serviceName}`, { method: 'POST' }),

  listServices: (state?: string, priority?: number) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (priority) params.set('priority', priority.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<ServiceStatus[]>(`${API_BASE}/services/list${query}`);
  },

  getDependencies: (serviceName: string) =>
    fetchJson<{ service: string; dependencies: string[]; dependents: string[]; can_stop: boolean; can_start: boolean }>(
      `${API_BASE}/services/dependencies/${serviceName}`
    ),

  getMetrics: () =>
    fetchJson<{ orchestrator: { uptime_seconds: number; running: boolean }; services: Record<string, Record<string, unknown>> }>(
      `${API_BASE}/services/metrics`
    ),

  getStartupOrder: () =>
    fetchJson<{ startup_order: unknown[]; shutdown_order: string[] }>(`${API_BASE}/services/startup-order`),
};

// ==================== PLUGIN PRESETS API ====================

export const pluginPresetsApi = {
  list: (options?: {
    plugin_uri?: string;
    category?: string;
    tags?: string;
    favorites_only?: boolean;
    search?: string;
  }, nodeId?: string | null) => {
    const params = new URLSearchParams();
    if (options?.plugin_uri) params.set('plugin_uri', options.plugin_uri);
    if (options?.category) params.set('category', options.category);
    if (options?.tags) params.set('tags', options.tags);
    if (options?.favorites_only) params.set('favorites_only', 'true');
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson<{
      presets: Array<{
        id: number;
        name: string;
        plugin_uri: string;
        plugin_name: string;
        parameters: Record<string, any>;
        tags: string[];
        category: string;
        description: string;
        is_favorite: boolean;
        is_default: boolean;
        usage_count: number;
        created_at: string;
        updated_at: string;
      }>;
      count: number;
    }>(appendNodeQuery(`${API_BASE}/plugin-presets/${query ? `?${query}` : ''}`, nodeId));
  },

  get: (presetId: number) =>
    fetchJson<{
      id: number;
      name: string;
      plugin_uri: string;
      plugin_name: string;
      parameters: Record<string, any>;
      tags: string[];
      category: string;
      description: string;
      is_favorite: boolean;
      is_default: boolean;
      usage_count: number;
      created_at: string;
      updated_at: string;
    }>(`${API_BASE}/plugin-presets/${presetId}`),

  create: (request: {
    name: string;
    plugin_uri: string;
    plugin_name: string;
    parameters: Record<string, any>;
    tags?: string[];
    category?: string;
    description?: string;
    is_favorite?: boolean;
    is_default?: boolean;
  }) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(`${API_BASE}/plugin-presets/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (presetId: number, updates: {
    name?: string;
    parameters?: Record<string, any>;
    tags?: string[];
    category?: string;
    description?: string;
    is_favorite?: boolean;
    is_default?: boolean;
  }) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    ),

  delete: (presetId: number) =>
    fetchJson<{ status: string; deleted_id: number; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}`,
      { method: 'DELETE' }
    ),

  toggleFavorite: (presetId: number) =>
    fetchJson<{ status: string; preset_id: number; is_favorite: boolean; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}/favorite`,
      { method: 'POST' }
    ),

  load: (presetId: number) =>
    fetchJson<{
      id: number;
      name: string;
      plugin_uri: string;
      plugin_name: string;
      parameters: Record<string, any>;
      usage_count: number;
    }>(`${API_BASE}/plugin-presets/${presetId}/load`, { method: 'POST' }),

  getByPluginUri: (pluginUri: string) =>
    fetchJson<{
      plugin_uri: string;
      presets: Array<{
        id: number;
        name: string;
        parameters: Record<string, any>;
        is_favorite: boolean;
        is_default: boolean;
        usage_count: number;
        description: string;
      }>;
      count: number;
      default_preset_id: number | null;
    }>(`${API_BASE}/plugin-presets/plugin/${encodeURIComponent(pluginUri)}`),

  getCategories: () =>
    fetchJson<{ categories: Array<{ name: string; count: number }>; count: number }>(
      `${API_BASE}/plugin-presets/categories/all`
    ),

  getTags: () =>
    fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/plugin-presets/tags/all`),

  getPluginsWithFavorites: () =>
    fetchJson<{
      plugins: Array<{
        plugin_uri: string;
        plugin_name: string;
        favorite_preset_count: number;
      }>;
      count: number;
    }>(`${API_BASE}/plugin-presets/favorites/plugins`),
};

// ==================== Folders API ====================

export interface DisplayPaths {
  nam_models: string;
  ir_cabinets: string;
  ir_reverbs: string;
  ir_user_uploads: string;
  nam_models_display: string;
  ir_cabinets_display: string;
  ir_reverbs_display: string;
}

export interface StorageInfo {
  nam_user_dir: { path: string; exists: boolean };
  ir_user_dir: { path: string; exists: boolean };
  ir_cabinet_dir: { path: string; exists: boolean };
  ir_reverb_dir: { path: string; exists: boolean };
  ir_user_upload_dir: { path: string; exists: boolean };
  nam_system_dir: { path: string; exists: boolean };
  ir_system_dir: { path: string; exists: boolean };
  ir_download_dir: { path: string; exists: boolean };
  all_nam_paths: string[];
  all_ir_paths: string[];
}

export const foldersApi = {
  getDisplayPaths: (nodeId?: string | null) => fetchJson<DisplayPaths>(appendNodeQuery(`${API_BASE}/folders/display-paths`, nodeId)),

  getStorageInfo: () => fetchJson<StorageInfo>(`${API_BASE}/folders/storage-info`),

  getPaths: () =>
    fetchJson<{ nams: string; irs: string; lv2: string }>(`${API_BASE}/folders/paths`),

  getStats: () =>
    fetchJson<{ nams: Record<string, unknown>; irs: Record<string, unknown>; lv2: Record<string, unknown> }>(
      `${API_BASE}/folders/stats`
    ),

  getCounts: () =>
    fetchJson<{
      nams: number;
      irs: { total: number; cabinets: number; reverbs: number; other: number };
      lv2: { system: number; user: number; total: number };
    }>(`${API_BASE}/folders/counts`),

  scan: (scanNams = true, scanIrs = true, scanLv2 = true) =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(`${API_BASE}/folders/scan`, {
      method: 'POST',
      body: JSON.stringify({ scan_nams: scanNams, scan_irs: scanIrs, scan_lv2: scanLv2 }),
    }),

  scanAll: (nodeId?: string | null) =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(appendNodeQuery(`${API_BASE}/folders/scan/all`, nodeId), {
      method: 'POST',
    }),

  getScanStatus: () =>
    fetchJson<{ scanning: boolean; message: string }>(`${API_BASE}/folders/scan/status`),

  getNetworkShares: () =>
    fetchJson<{
      smb_enabled: boolean;
      smb_port_445: boolean;
      smb_port_139: boolean;
      local_ip: string;
      shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>;
      access_urls: { windows: string; linux: string; mac: string };
    }>(`${API_BASE}/folders/network-shares`),
};

// ==================== Unified Upload API ====================

export interface UploadResult {
  success: boolean
  asset_type: string
  filename: string
  file_path: string
  file_size: number
  file_hash: string
  message: string
  error?: string
  already_exists: boolean
}

export interface BatchUploadResult {
  total: number
  successful: number
  failed: number
  results: UploadResult[]
}

export interface UploadTypeInfo {
  type: string
  name: string
  extensions: string[]
  max_size_mb: number
  description: string
}

export const uploadApi = {
  /**
   * Upload a single file with optional progress callback
   */
  upload: async (
    file: File,
    assetType?: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(errorData.detail?.message || errorData.detail || 'Upload failed'))
          } catch {
            reject(new Error(xhr.statusText || 'Upload failed'))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

      xhr.open('POST', `${API_BASE}/upload/`)
      xhr.send(formData)
    })
  },

  /**
   * Upload multiple files as a batch
   */
  uploadBatch: async (files: File[], assetType?: string): Promise<BatchUploadResult> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/batch`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  /**
   * Validate a file before upload
   */
  validate: async (
    file: File,
    assetType?: string
  ): Promise<{
    valid: boolean
    asset_type: string | null
    message: string
    details: Record<string, unknown>
    requires_type: boolean
  }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/validate`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  /**
   * Get supported upload types
   */
  getTypes: () =>
    fetchJson<{ types: UploadTypeInfo[] }>(`${API_BASE}/upload/types`),
}

// ==================== Flow Snapshots API ====================

export const flowSnapshotsApi = {
  /**
   * List all flow snapshots (metadata only)
   */
  list: (nodeId?: string | null) =>
    fetchJson<{
      snapshots: FlowSnapshot[];
      count: number;
      active_id: number | null;
    }>(appendNodeQuery(`${API_BASE}/flow-snapshots`, nodeId)),

  /**
   * Get snapshot with full data
   */
  get: (snapshotId: number) =>
    fetchJson<FlowSnapshotDetail>(`${API_BASE}/flow-snapshots/${snapshotId}`),

  /**
   * Create a new flow snapshot
   */
  create: (request: {
    name: string;
    description?: string;
    tags?: string[];
    program_number?: number | null;
    snapshot_data: FlowSnapshotData;
  }) =>
    fetchJson<{ status: string; snapshot_id: number; message: string }>(
      `${API_BASE}/flow-snapshots`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  /**
   * Update snapshot metadata
   */
  update: (
    snapshotId: number,
    updates: {
      name?: string;
      description?: string;
      tags?: string[];
      display_order?: number;
      is_favorite?: boolean;
      snapshot_data?: FlowSnapshotData;
    },
    nodeId?: string | null
  ) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/flow-snapshots/${snapshotId}`, nodeId),
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  /**
   * Delete a flow snapshot
   */
  delete: (snapshotId: number, nodeId?: string | null) =>
    fetchJson<{ status: string; message: string }>(
      appendNodeQuery(`${API_BASE}/flow-snapshots/${snapshotId}`, nodeId),
      { method: 'DELETE' }
    ),

  /**
   * Load/activate a snapshot
   */
  load: (snapshotId: number, nodeId?: string | null) =>
    fetchJson<{
      status: string;
      snapshot_id: number;
      name: string;
      snapshot_data: FlowSnapshotData;
    }>(appendNodeQuery(`${API_BASE}/flow-snapshots/${snapshotId}/load`, nodeId), { method: 'POST' }),

  /**
   * Preview snapshot data without changing the active snapshot record
   */
  preview: (request: { snapshot_data: FlowSnapshotData }) =>
    fetchJson<{
      status: string;
      snapshot_data: FlowSnapshotData;
      chains_created: number;
      params_applied: number;
      bypass_applied: number;
    }>(`${API_BASE}/flow-snapshots/preview`, { method: 'POST', body: JSON.stringify(request) }),

  /**
   * Set or clear MIDI program number
   */
  setProgram: (snapshotId: number, programNumber: number | null) =>
    fetchJson<{
      status: string;
      snapshot_id: number;
      program_number: number | null;
    }>(
      `${API_BASE}/flow-snapshots/${snapshotId}/program`,
      { method: 'POST', body: JSON.stringify({ program_number: programNumber }) }
    ),

  /**
   * Duplicate a snapshot
   */
  duplicate: (snapshotId: number) =>
    fetchJson<{ status: string; snapshot_id: number; message: string }>(
      `${API_BASE}/flow-snapshots/${snapshotId}/duplicate`,
      { method: 'POST' }
    ),

  /**
   * Reorder snapshots
   */
  reorder: (snapshotIds: number[]) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/flow-snapshots/reorder`,
      { method: 'POST', body: JSON.stringify(snapshotIds) }
    ),

  /**
   * Get snapshot by MIDI program number
   */
  getByProgram: (programNumber: number) =>
    fetchJson<{ id: number; name: string; program_number: number }>(
      `${API_BASE}/flow-snapshots/by-program/${programNumber}`
    ),
};

// ==================== PipeWire Audio Server ====================

export const pipewireApi = {
  /** Full PipeWire graph snapshot — daemon, devices, nodes, streams, links, latency, alerts */
  getStatus: (nodeId?: string | null) =>
    fetchJson<import('./types').PipeWireMetrics>(appendNodeQuery(`${API_BASE}/pipewire/status`, nodeId)),

  /** PipeWire daemon info */
  getDaemon: (nodeId?: string | null) =>
    fetchJson<import('./types').PipeWireDaemonInfo>(appendNodeQuery(`${API_BASE}/pipewire/daemon`, nodeId)),

  /** List audio devices */
  getDevices: (nodeId?: string | null) =>
    fetchJson<{ devices: import('./types').PipeWireDeviceInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/devices`, nodeId)),

  /** List sink/source nodes */
  getNodes: (nodeId?: string | null) =>
    fetchJson<{ nodes: import('./types').PipeWireNodeInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/nodes`, nodeId)),

  /** List active streams */
  getStreams: (nodeId?: string | null) =>
    fetchJson<{ streams: import('./types').PipeWireStreamInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/streams`, nodeId)),

  /** List graph links */
  getLinks: (nodeId?: string | null) =>
    fetchJson<{ links: import('./types').PipeWireLinkInfo[] }>(appendNodeQuery(`${API_BASE}/pipewire/links`, nodeId)),

  /** List connected clients */
  getClients: (nodeId?: string | null) =>
    fetchJson<{ clients: { id: number; name: string; info: string }[] }>(appendNodeQuery(`${API_BASE}/pipewire/clients`, nodeId)),

  /** Get clock settings */
  getSettings: (nodeId?: string | null) =>
    fetchJson<import('./types').PipeWireSettings>(appendNodeQuery(`${API_BASE}/pipewire/settings`, nodeId)),

  /** Get latency breakdown */
  getLatency: (nodeId?: string | null) =>
    fetchJson<{ graph_latency_ms: number; driver_latency_ms: number; total_latency_ms: number; settings: import('./types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/latency`, nodeId)
    ),

  /** Set DSP quantum (buffer period). 0 = automatic. */
  setQuantum: (quantum: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; quantum: number; settings: import('./types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/quantum`, nodeId),
      { method: 'POST', body: JSON.stringify({ quantum }) }
    ),

  /** Set forced sample rate. 0 = automatic. */
  setRate: (rate: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; rate: number; settings: import('./types').PipeWireSettings }>(
      appendNodeQuery(`${API_BASE}/pipewire/rate`, nodeId),
      { method: 'POST', body: JSON.stringify({ rate }) }
    ),

  /** Get volume/mute for a node */
  getVolume: (pipewireNodeId: number, nodeId?: string | null) =>
    fetchJson<{ node_id: number; volume: number; muted: boolean }>(
      appendNodeQuery(`${API_BASE}/pipewire/volume/${pipewireNodeId}`, nodeId)
    ),

  /** Set volume for a node */
  setVolume: (pipewireNodeId: number, volume: number, nodeId?: string | null) =>
    fetchJson<{ success: boolean; node_id: number; volume: number }>(
      appendNodeQuery(`${API_BASE}/pipewire/volume`, nodeId),
      { method: 'POST', body: JSON.stringify({ node_id: pipewireNodeId, volume }) }
    ),

  /** Set mute state for a node */
  setMute: (pipewireNodeId: number, mute: boolean, nodeId?: string | null) =>
    fetchJson<{ success: boolean; node_id: number; mute: boolean }>(
      appendNodeQuery(`${API_BASE}/pipewire/mute`, nodeId),
      { method: 'POST', body: JSON.stringify({ node_id: pipewireNodeId, mute }) }
    ),
};

// ==================== JUCE Audio Engine ====================

export const engineApi = {
  /** Get comprehensive engine status */
  getStatus: () =>
    fetchJson<import('./types').EngineStatus>(`${API_BASE}/engine/status`),

  /** Get engine version */
  getVersion: () =>
    fetchJson<import('./types').EngineVersion>(`${API_BASE}/engine/version`),

  /** Initialize audio engine */
  initialize: (config: { sample_rate?: number; buffer_size?: number; audio_device?: string; enable_midi?: boolean }) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/engine/initialize`, {
      method: 'POST', body: JSON.stringify(config),
    }),

  /** Shutdown audio engine */
  shutdown: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shutdown`, { method: 'POST' }),

  /** Start audio processing */
  startAudio: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/audio/start`, { method: 'POST' }),

  /** Stop audio processing */
  stopAudio: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/audio/stop`, { method: 'POST' }),

  /** List loaded plugins */
  getPlugins: () =>
    fetchJson<{ plugins: unknown[] }>(`${API_BASE}/engine/plugins`),

  /** Load a plugin */
  loadPlugin: (uri: string) =>
    fetchJson<{ success: boolean; instance_id: number }>(`${API_BASE}/engine/plugins`, {
      method: 'POST', body: JSON.stringify({ uri }),
    }),

  /** Remove a plugin */
  removePlugin: (instanceId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/plugins/${instanceId}`, { method: 'DELETE' }),

  /** Set plugin parameter */
  setParameter: (instanceId: number, paramName: string, value: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/parameter`, {
      method: 'POST', body: JSON.stringify({ instance_id: instanceId, param_name: paramName, value }),
    }),

  /** Set plugin bypass */
  setBypass: (instanceId: number, bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/bypass`, {
      method: 'POST', body: JSON.stringify({ instance_id: instanceId, bypass }),
    }),

  /** Get VU meter levels */
  getVU: () =>
    fetchJson<{ input: number[]; output: number[] }>(`${API_BASE}/engine/vu`),
};

// ==================== Dynamics Processors ====================

export const dynamicsApi = {
  /** Get compressor state */
  getCompressor: () =>
    fetchJson<{ parameters: import('./types').CompressorState; bypass: boolean }>(`${API_BASE}/engine/dynamics/compressor`),

  /** Update compressor parameters */
  updateCompressor: (params: Partial<import('./types').CompressorState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/compressor`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get compressor metering */
  getCompressorMetering: () =>
    fetchJson<import('./types').DynamicsMetering>(`${API_BASE}/engine/dynamics/compressor/metering`),

  /** Get limiter state */
  getLimiter: () =>
    fetchJson<{ parameters: import('./types').LimiterState; bypass: boolean }>(`${API_BASE}/engine/dynamics/limiter`),

  /** Update limiter parameters */
  updateLimiter: (params: Partial<import('./types').LimiterState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/limiter`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get gate state */
  getGate: () =>
    fetchJson<{ parameters: import('./types').GateState; bypass: boolean }>(`${API_BASE}/engine/dynamics/gate`),

  /** Update gate parameters */
  updateGate: (params: Partial<import('./types').GateState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/gate`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),
};

// ==================== EQ Processors ====================

export const filtersApi = {
  /** Get EQ state (all bands) */
  getEQ: () =>
    fetchJson<import('./types').EQState>(`${API_BASE}/engine/eq`),

  /** Get EQ bands */
  getBands: () =>
    fetchJson<{ bands: import('./types').EQBand[] }>(`${API_BASE}/engine/eq/bands`),

  /** Update an EQ band */
  updateBand: (index: number, band: Partial<import('./types').EQBand>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/eq/bands/${index}`, {
      method: 'PATCH', body: JSON.stringify(band),
    }),

  /** Get frequency response curve */
  getFrequencyResponse: () =>
    fetchJson<import('./types').FrequencyResponse>(`${API_BASE}/engine/eq/frequency-response`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/eq/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Delay Processor ====================

export const delayApi = {
  /** Get delay state */
  getDelay: () =>
    fetchJson<import('./types').DelayState>(`${API_BASE}/engine/delay`),

  /** Update delay parameters */
  updateParameters: (params: Partial<import('./types').DelayState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/delay/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Tap tempo */
  tapTempo: () =>
    fetchJson<{ bpm: number; delay_ms: number }>(`${API_BASE}/engine/delay/tap-tempo`, { method: 'POST' }),

  /** Get tempo divisions */
  getTempoDivisions: () =>
    fetchJson<{ divisions: import('./types').TempoDivision[] }>(`${API_BASE}/engine/delay/tempo-divisions`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/delay/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Modulation Processors ====================

export const modulationApi = {
  /** Get chorus state */
  getChorus: () =>
    fetchJson<import('./types').ChorusState>(`${API_BASE}/engine/modulation/chorus`),

  /** Update chorus parameters */
  updateChorus: (params: Partial<import('./types').ChorusState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/chorus/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get phaser state */
  getPhaser: () =>
    fetchJson<import('./types').PhaserState>(`${API_BASE}/engine/modulation/phaser`),

  /** Update phaser parameters */
  updatePhaser: (params: Partial<import('./types').PhaserState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/phaser/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get pitch shifter state */
  getPitchShifter: () =>
    fetchJson<import('./types').PitchShifterState>(`${API_BASE}/engine/modulation/pitch-shifter`),

  /** Update pitch shifter parameters */
  updatePitchShifter: (params: Partial<import('./types').PitchShifterState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/pitch-shifter/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),
};

// ==================== Boss XS-1 Pitch ====================

export const pitchApi = {
  /** Get Boss XS-1 state */
  getBossXS1: () =>
    fetchJson<import('./types').BossXS1State>(`${API_BASE}/engine/pitch/boss-xs1`),

  /** Update Boss XS-1 parameters */
  updateBossXS1: (params: Partial<import('./types').BossXS1State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/pitch/boss-xs1/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get Boss XS-1 presets */
  getBossXS1Presets: () =>
    fetchJson<{ presets: import('./types').BossXS1Preset[] }>(`${API_BASE}/engine/pitch/boss-xs1/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/pitch/boss-xs1/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Shoegaze Multi-Effect ====================

export const shoegazeApi = {
  /** Get shoegaze state */
  getState: () =>
    fetchJson<import('./types').ShoegazeState>(`${API_BASE}/engine/shoegaze`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').ShoegazeState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shoegaze/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').ShoegazePreset[] }>(`${API_BASE}/engine/shoegaze/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shoegaze/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Lexi Love Reverb ====================

export const lexiLoveApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').LexiLoveState>(`${API_BASE}/engine/lexilove`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').LexiLoveState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get available algorithms */
  getAlgorithms: () =>
    fetchJson<{ algorithms: import('./types').LexiLoveAlgorithm[] }>(`${API_BASE}/engine/lexilove/algorithms`),

  /** Set algorithm */
  setAlgorithm: (algorithmId: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/algorithm`, {
      method: 'POST', body: JSON.stringify({ algorithm: algorithmId }),
    }),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Ultra-Harmonizer ====================

export const h3000Api = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').H3000State>(`${API_BASE}/engine/h3000`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').H3000State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/h3000/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get available algorithms */
  getAlgorithms: () =>
    fetchJson<{ algorithms: import('./types').H3000Algorithm[] }>(`${API_BASE}/engine/h3000/algorithms`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/h3000/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Amp Models ====================

export const peavey5150Api = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').Peavey5150State>(`${API_BASE}/engine/amp/peavey5150`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').Peavey5150State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/peavey5150/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/amp/peavey5150/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/peavey5150/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

export const tweedBassmanApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').TweedBassmanState>(`${API_BASE}/engine/amp/tweedbassman`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').TweedBassmanState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/tweedbassman/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/amp/tweedbassman/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/tweedbassman/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

export const passionfxApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').PassionFXState>(`${API_BASE}/engine/multieffect/passionfx`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').PassionFXState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/multieffect/passionfx/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/multieffect/passionfx/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/multieffect/passionfx/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Drum Machine ====================

export const drumsApi = {
  /** Get drum machine state */
  getState: () =>
    fetchJson<import('./types').DrumMachineState>(`${API_BASE}/engine/drums/state`),

  /** Update drum machine state */
  updateState: (state: import('./types').DrumMachineStateUpdate) =>
    fetchJson<{ status: string; state: import('./types').DrumMachineState }>(`${API_BASE}/engine/drums/state`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Get transport state */
  getTransport: () =>
    fetchJson<import('./types').DrumTransportState>(`${API_BASE}/engine/drums/transport`),

  /** Update transport state */
  setTransport: (state: import('./types').DrumTransportUpdate) =>
    fetchJson<import('./types').DrumTransportState>(`${API_BASE}/engine/drums/transport`, {
      method: 'POST', body: JSON.stringify(state),
    }),

  /** Get per-track swing state */
  getTrackSwing: (instrument: number) =>
    fetchJson<{ instrument: number; swing: number; track_swing: number[] }>(`${API_BASE}/engine/drums/track/${instrument}/swing`),

  /** Set per-track swing */
  setTrackSwing: (instrument: number, swing: number) =>
    fetchJson<{ instrument: number; swing: number; track_swing: number[] }>(`${API_BASE}/engine/drums/track/${instrument}/swing`, {
      method: 'POST',
      body: JSON.stringify({ swing }),
    }),

  /** Set per-track loop length */
  setTrackLength: (patternId: number, instrument: number, length: number) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/track/${instrument}/length`, {
      method: 'POST',
      body: JSON.stringify({ length }),
    }),

  /** Record a tap-tempo event */
  tapTempo: (timestamp?: number) =>
    fetchJson<{ tempo: number | null; taps: number }>(`${API_BASE}/engine/drums/transport/tap-tempo`, {
      method: 'POST',
      body: JSON.stringify(timestamp == null ? {} : { timestamp }),
    }),

  /** Get a pattern by id */
  getPattern: (patternId: number) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}`),

  /** Get the current sequencer position */
  getPosition: () =>
    fetchJson<import('./types').DrumSequencerPosition>(`${API_BASE}/engine/drums/position`),

  /** Trigger a sequencer fill */
  triggerFill: () =>
    fetchJson<{ status: string; pattern: number; variation: number }>(`${API_BASE}/engine/drums/fill/trigger`, {
      method: 'POST',
    }),

  /** Replace a pattern */
  setPattern: (patternId: number, pattern: import('./types').DrumPattern) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}`, {
      method: 'POST',
      body: JSON.stringify(pattern),
    }),

  /** Update a single step in a pattern */
  setStep: (
    patternId: number,
    instrument: number,
    step: number,
    velocity: number,
    accent = false,
    details?: Partial<Pick<import('./types').DrumPatternStep, 'micro_timing' | 'lock_pitch' | 'lock_filter_cutoff' | 'lock_decay' | 'lock_pan' | 'lock_volume'>>,
  ) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/step`, {
      method: 'POST',
      body: JSON.stringify({ instrument, step, velocity, accent, ...(details ?? {}) }),
    }),

  /** Clear a pattern */
  clearPattern: (patternId: number) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/${patternId}/clear`, {
      method: 'POST',
    }),

  /** Copy a pattern */
  copyPattern: (sourcePatternId: number, destinationPatternId: number) =>
    fetchJson<import('./types').DrumPattern>(`${API_BASE}/engine/drums/pattern/copy`, {
      method: 'POST',
      body: JSON.stringify({ source_pattern_id: sourcePatternId, destination_pattern_id: destinationPatternId }),
    }),

  /** Get the drum song arrangement */
  getSong: async () => {
    const response = await fetchJson<{ song?: import('./types').DrumSongEntry[]; song_loop?: boolean; entries?: import('./types').DrumSongEntry[]; loop?: boolean }>(
      `${API_BASE}/engine/drums/song`,
    )
    return {
      entries: (response.entries ?? response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.loop ?? response.song_loop ?? false,
    } satisfies import('./types').DrumSong
  },

  /** Replace the drum song arrangement */
  setSong: async (song: import('./types').DrumSong) => {
    const response = await fetchJson<{ song?: import('./types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song`, {
      method: 'POST',
      body: JSON.stringify({ song: song.entries, song_loop: song.loop }),
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('./types').DrumSong
  },

  /** Append a song entry */
  addSongEntry: async (entry: import('./types').DrumSongEntry) => {
    const response = await fetchJson<{ song?: import('./types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song/entries`, {
      method: 'POST',
      body: JSON.stringify({ pattern: entry.pattern_id, repeat_count: entry.repeat_count }),
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('./types').DrumSong
  },

  /** Remove a song entry by position */
  removeSongEntry: async (position: number) => {
    const response = await fetchJson<{ song?: import('./types').DrumSongEntry[]; song_loop?: boolean }>(`${API_BASE}/engine/drums/song/entries/${position}`, {
      method: 'DELETE',
    })
    return {
      entries: (response.song ?? []).map((item) => ({
        pattern_id: item.pattern_id ?? (item as unknown as { pattern: number }).pattern,
        repeat_count: item.repeat_count,
      })),
      loop: response.song_loop ?? false,
    } satisfies import('./types').DrumSong
  },

  /** Get drum song transport state */
  getSongTransport: () =>
    fetchJson<import('./types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport`),

  /** Start drum song playback */
  playSongTransport: () =>
    fetchJson<import('./types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport/play`, {
      method: 'POST',
    }),

  /** Stop drum song playback */
  stopSongTransport: () =>
    fetchJson<import('./types').DrumSongTransportState>(`${API_BASE}/engine/drums/song/transport/stop`, {
      method: 'POST',
    }),

  /** List available drum kits */
  getKits: () =>
    fetchJson<import('./types').DrumKit[]>(`${API_BASE}/engine/drums/kits`),

  /** Get a drum kit by id */
  getKit: (kitId: string) =>
    fetchJson<import('./types').DrumKit>(`${API_BASE}/engine/drums/kits/${encodeURIComponent(kitId)}`),

  /** Load a drum kit */
  loadKit: (kitId: string) =>
    fetchJson<{ status: string; active_kit: import('./types').DrumKit }>(`${API_BASE}/engine/drums/kits/load`, {
      method: 'POST',
      body: JSON.stringify({ kit_id: kitId }),
    }),

  /** Get the active drum kit */
  getActiveKit: () =>
    fetchJson<import('./types').DrumKit | null>(`${API_BASE}/engine/drums/kits/active`),

  /** Import a user drum kit archive */
  importKit: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchJson<{ status: string; kit: import('./types').DrumKit }>(`${API_BASE}/engine/drums/kits/import`, {
      method: 'POST',
      body: formData,
    })
  },

  /** Create a user drum kit from a template */
  createKit: (template: Record<string, unknown>) =>
    fetchJson<import('./types').DrumKit>(`${API_BASE}/engine/drums/kits/create`, {
      method: 'POST',
      body: JSON.stringify(template),
    }),

  /** Patch a single instrument inside a drum kit */
  patchKitInstrument: (kitId: string, padId: number, patch: import('./types').DrumKitInstrumentPatch) =>
    fetchJson<import('./types').DrumKit>(
      `${API_BASE}/engine/drums/kits/${encodeURIComponent(kitId)}/instruments/${padId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    ),

  /** Get per-pad mixer controls */
  getPadControls: () =>
    fetchJson<import('./types').DrumPadControl[]>(`${API_BASE}/engine/drums/mixer/pads`),

  /** Update a per-pad mixer control block */
  setPadControl: (padId: number, params: import('./types').DrumPadControlUpdate) =>
    fetchJson<import('./types').DrumPadControl>(`${API_BASE}/engine/drums/mixer/pads/${padId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    }),

  /** Get bus mixer state */
  getBusMixer: () =>
    fetchJson<import('./types').DrumBusMixer[]>(`${API_BASE}/engine/drums/mixer/buses`),

  /** Update a single drum bus */
  setBusMixer: (busId: number, params: import('./types').DrumBusMixerUpdate) =>
    fetchJson<import('./types').DrumBusMixer>(`${API_BASE}/engine/drums/mixer/buses/${busId}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    }),

  /** Get master volume */
  getMasterVolume: () =>
    fetchJson<import('./types').DrumMasterVolumeState>(`${API_BASE}/engine/drums/mixer/master`),

  /** Set master volume */
  setMasterVolume: (volume: number) =>
    fetchJson<import('./types').DrumMasterVolumeState>(`${API_BASE}/engine/drums/mixer/master`, {
      method: 'POST',
      body: JSON.stringify({ volume }),
    }),

  /** Get MIDI note mapping */
  getMidiMapping: () =>
    fetchJson<import('./types').DrumMidiMapping>(`${API_BASE}/engine/drums/midi/mapping`),

  /** Replace MIDI note mapping */
  setMidiMapping: (mapping: import('./types').DrumMidiMapping) =>
    fetchJson<import('./types').DrumMidiMapping>(`${API_BASE}/engine/drums/midi/mapping`, {
      method: 'POST',
      body: JSON.stringify(mapping),
    }),

  /** Get all velocity curves */
  getVelocityCurves: () =>
    fetchJson<import('./types').DrumMidiVelocityCurves>(`${API_BASE}/engine/drums/midi/velocity-curves`),

  /** Update a single velocity curve */
  setVelocityCurve: (padId: number, curve: import('./types').DrumVelocityCurve) =>
    fetchJson<import('./types').DrumMidiVelocityCurves>(`${API_BASE}/engine/drums/midi/velocity-curves`, {
      method: 'POST',
      body: JSON.stringify({
        pads: [{ ...curve, pad: padId }],
      }),
    }),

  /** Get per-pad MIDI zones */
  getMidiZones: () =>
    fetchJson<import('./types').DrumMidiZones>(`${API_BASE}/engine/drums/midi/zones`),

  /** Replace per-pad MIDI zones */
  setMidiZones: (zones: import('./types').DrumMidiZones) =>
    fetchJson<import('./types').DrumMidiZones>(`${API_BASE}/engine/drums/midi/zones`, {
      method: 'POST',
      body: JSON.stringify(zones),
    }),

  /** Start MIDI learn mode */
  startMidiLearn: (padId?: number) =>
    fetchJson<import('./types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/start`, {
      method: 'POST',
      body: JSON.stringify(padId == null ? { pad: 0, learn_all: true } : { pad: padId }),
    }),

  /** Stop MIDI learn mode */
  stopMidiLearn: () =>
    fetchJson<import('./types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/stop`, {
      method: 'POST',
    }),

  /** Get MIDI learn status */
  getMidiLearnStatus: () =>
    fetchJson<import('./types').DrumMidiLearnStatus>(`${API_BASE}/engine/drums/midi/learn/status`),

  /** List bundled hardware MIDI presets */
  getMidiPresets: () =>
    fetchJson<import('./types').DrumMidiPresetList>(`${API_BASE}/engine/drums/midi/presets`),

  /** Load a hardware MIDI preset */
  loadMidiPreset: (presetName: string) =>
    fetchJson<{ status: string; preset_name: string; mapping: import('./types').DrumMidiMapping; zones: import('./types').DrumMidiZones }>(`${API_BASE}/engine/drums/midi/presets/load`, {
      method: 'POST',
      body: JSON.stringify({ preset_name: presetName }),
    }),

  /** Get factory drum packs */
  getFactoryPacks: () =>
    fetchJson<import('./types').DrumPack[]>(`${API_BASE}/engine/drums/packs/factory`),

  /** Get generated drum packs */
  getGeneratedPacks: () =>
    fetchJson<import('./types').DrumPack[]>(`${API_BASE}/engine/drums/packs/generated`),

  /** Get factory pack details */
  getFactoryPackDetails: (packId: string) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/engine/drums/packs/factory/${packId}`),

  /** Get generated pack details */
  getGeneratedPackDetails: (packId: string) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/engine/drums/packs/generated/${packId}`),

  /** Get a metering snapshot */
  getMetering: () =>
    fetchJson<import('./types').DrumMetering>(`${API_BASE}/engine/drums/metering`),
};

// ==================== Sidechain Routing ====================

export const sidechainApi = {
  /** Get sidechain connections */
  getConnections: () =>
    fetchJson<{ connections: import('./types').SidechainConnection[] }>(`${API_BASE}/sidechain`),

  /** Create sidechain connection */
  create: (source: string, target: string, bus?: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain`, {
      method: 'POST', body: JSON.stringify({ source_plugin: source, target_plugin: target, bus: bus ?? 0 }),
    }),

  /** Delete sidechain connection */
  delete: (connectionId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain/${connectionId}`, { method: 'DELETE' }),

  /** Toggle sidechain */
  toggle: (connectionId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain/${connectionId}/toggle`, { method: 'POST' }),

  /** Get sidechain-capable plugins */
  getCapablePlugins: () =>
    fetchJson<{ plugins: unknown[] }>(`${API_BASE}/sidechain/plugins`),
};

// ==================== Core Plugins ====================

export const corePluginsApi = {
  /** Get core plugins installation status */
  getStatus: () =>
    fetchJson<import('./types').CorePluginsStatus>(`${API_BASE}/core-plugins/status`),

  /** Verify core plugins */
  verify: () =>
    fetchJson<import('./types').CorePluginsStatus>(`${API_BASE}/core-plugins/verify`),

  /** Get categories */
  getCategories: () =>
    fetchJson<{ categories: string[] }>(`${API_BASE}/core-plugins/categories`),

  /** Install core plugins */
  install: () =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/core-plugins/install`, { method: 'POST' }),

  /** Refresh LV2 cache */
  refreshCache: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/core-plugins/refresh-cache`, { method: 'POST' }),
};

// ==================== Parallel Routing ====================

export const parallelApi = {
  /** Get parallel groups */
  getGroups: () =>
    fetchJson<{ groups: import('./types').ParallelGroup[] }>(`${API_BASE}/parallel/groups`),

  /** Create parallel group */
  createGroup: (name: string) =>
    fetchJson<{ success: boolean; group: import('./types').ParallelGroup }>(`${API_BASE}/parallel/groups`, {
      method: 'POST', body: JSON.stringify({ name }),
    }),

  /** Delete parallel group */
  deleteGroup: (groupId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/parallel/groups/${groupId}`, { method: 'DELETE' }),

  /** Set blend */
  setBlend: (groupId: number, blend: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/parallel/groups/${groupId}/blend`, {
      method: 'POST', body: JSON.stringify({ blend }),
    }),
};

// ==================== Loudness Metering ====================

export const loudnessApi = {
  /** Get LUFS measurements */
  getLUFS: () =>
    fetchJson<import('./types').LoudnessLUFS>(`${API_BASE}/engine/loudness/lufs`),

  /** Get momentary loudness */
  getMomentary: () =>
    fetchJson<{ momentary: number }>(`${API_BASE}/engine/loudness/momentary`),

  /** Get short-term loudness */
  getShortTerm: () =>
    fetchJson<{ short_term: number }>(`${API_BASE}/engine/loudness/short-term`),

  /** Get integrated loudness */
  getIntegrated: () =>
    fetchJson<{ integrated: number }>(`${API_BASE}/engine/loudness/integrated`),

  /** Reset integrated loudness */
  reset: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/loudness/reset`, { method: 'POST' }),

  /** Get true peak */
  getTruePeak: () =>
    fetchJson<{ true_peak: number }>(`${API_BASE}/engine/loudness/true-peak`),
};

// ==================== Spectrum Analysis ====================

export const spectrumApi = {
  /** Get spectrum data */
  getSpectrum: () =>
    fetchJson<import('./types').SpectrumAnalysis>(`${API_BASE}/engine/spectrum`),

  /** Get magnitude data */
  getMagnitudes: () =>
    fetchJson<{ magnitudes: number[] }>(`${API_BASE}/engine/spectrum/magnitudes`),

  /** Get frequency bins */
  getFrequencies: () =>
    fetchJson<{ frequencies: number[] }>(`${API_BASE}/engine/spectrum/frequencies`),

  /** Get peak frequency */
  getPeak: () =>
    fetchJson<{ frequency: number; magnitude: number }>(`${API_BASE}/engine/spectrum/peak`),
};

// ==================== CPU Metrics ====================

export const cpuMetricsApi = {
  /** Get CPU metrics */
  getMetrics: () =>
    fetchJson<import('./types').CPUMetricsData>(`${API_BASE}/cpu`),

  /** Get total CPU usage */
  getTotal: () =>
    fetchJson<{ total: number }>(`${API_BASE}/cpu/total`),

  /** Get per-plugin CPU */
  getPluginCPU: (pluginId: string) =>
    fetchJson<{ plugin_id: string; cpu_percent: number }>(`${API_BASE}/cpu/plugin/${pluginId}`),

  /** Get all plugin CPU stats */
  getAllPluginCPU: () =>
    fetchJson<{ plugins: Record<string, number> }>(`${API_BASE}/cpu/plugins`),

  /** Get xrun count */
  getXruns: () =>
    fetchJson<{ xruns: number }>(`${API_BASE}/cpu/xruns`),

  /** Get headroom */
  getHeadroom: () =>
    fetchJson<{ headroom_percent: number }>(`${API_BASE}/cpu/headroom`),
};

// ==================== Backup ====================

export const backupApi = {
  /** List all backups */
  list: () =>
    fetchJson<{ backups: import('./types').BackupInfo[] }>(`${API_BASE}/backup`),

  /** Create a backup */
  create: (description?: string) =>
    fetchJson<{ success: boolean; backup_id: string }>(`${API_BASE}/backup`, {
      method: 'POST', body: JSON.stringify({ description: description ?? '' }),
    }),

  /** Restore from backup */
  restore: (backupId: string, options?: { restore_database?: boolean; restore_user_data?: boolean; restore_config?: boolean }) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/backup/${backupId}/restore`, {
      method: 'POST', body: JSON.stringify(options ?? {}),
    }),

  /** Delete a backup */
  delete: (backupId: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/backup/${backupId}`, { method: 'DELETE' }),

  /** Get backup settings */
  getSettings: () =>
    fetchJson<import('./types').BackupSettings>(`${API_BASE}/backup/settings`),

  /** Update backup settings */
  updateSettings: (settings: Partial<import('./types').BackupSettings>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/backup/settings`, {
      method: 'PATCH', body: JSON.stringify(settings),
    }),
};

// ==================== Shopping ====================

export const shoppingApi = {
  /** Search audio interfaces across marketplaces */
  search: (maxPrice: number = 150) =>
    fetchJson<{
      results: Array<{
        title: string;
        price: number;
        url: string;
        source: string;
        condition: string;
        shipping: number | null;
        matched_device: {
          model: string;
          io_count: string;
          latency_ms: number;
          tier: string;
          score: number;
          linux_support: string;
          notes: string;
        } | null;
        score: number;
      }>;
      total_count: number;
      max_price: number;
      search_time_seconds: number;
      recommendations?: Record<string, any>;
    }>(`${API_BASE}/shopping/search?max_price=${maxPrice}`),

  /** Get quick recommendations */
  getRecommendations: () =>
    fetchJson<{
      top_picks: Array<{
        rank: number;
        model: string;
        typical_price: string;
        tier: string;
        reason: string;
        search_url: string;
      }>;
    }>(`${API_BASE}/shopping/recommendations`),
};

// ==================== Export all APIs ====================

export const map2Api = {
  audio: audioApi,
  avb: avbApi,
  chains: chainsApi,
  plugins: pluginsApi,
  snapshots: snapshotsApi,
  pluginPresets: pluginPresetsApi,
  midi: midiApi,
  midiV2: midiApiV2,
  midiHub: midiHubApi,
  ir: irApi,
  irLibrary: irLibraryApi,
  nam: namApi,
  soundfont: soundfontApi,
  synthforge: synthforgeApi,
  automation: automationApi,
  history: historyApi,
  sessions: sessionsApi,
  metrics: metricsApi,
  system: systemApi,
  health: healthApi,
  node: nodeApi,
  network: networkApi,
  www: wwwApi,
  services: servicesApi,
  folders: foldersApi,
  upload: uploadApi,
  flowSnapshots: flowSnapshotsApi,
  pipewire: pipewireApi,
  // Native JUCE Engine APIs
  engine: engineApi,
  dynamics: dynamicsApi,
  filters: filtersApi,
  delay: delayApi,
  modulation: modulationApi,
  pitch: pitchApi,
  shoegaze: shoegazeApi,
  lexiLove: lexiLoveApi,
  h3000: h3000Api,
  peavey5150: peavey5150Api,
  tweedBassman: tweedBassmanApi,
  passionfx: passionfxApi,
  drums: drumsApi,
  sidechain: sidechainApi,
  corePlugins: corePluginsApi,
  parallel: parallelApi,
  loudness: loudnessApi,
  spectrum: spectrumApi,
  cpuMetrics: cpuMetricsApi,
  backup: backupApi,
  shopping: shoppingApi,
};

export default map2Api;

// ============================================================================
// Tesira Forte AVB API
// All calls target /api/tesira (registered in app/routes/tesira.py)
// ============================================================================

const BASE = '/api/tesira'

async function _json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (typeof body?.error === 'string') detail = body.error
      else if (typeof body?.message === 'string') detail = body.message
    } catch { /* ignore parse errors, use statusText */ }
    throw new Error(`${detail}`)
  }
  return res.json()
}

function readActiveClusterNodeId(): string | null {
  try {
    const stored = window.localStorage.getItem('map2_active_node')
    if (!stored || stored === 'null' || stored === 'all') {
      return null
    }
    return stored
  } catch {
    return null
  }
}

function tesiraFetch(input: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(appendNodeQuery(input, readActiveClusterNodeId()), init)
}

// The Tesira surface follows the shell node selector, so default every request
// in this section through the cluster proxy when a peer is active.
const fetch = tesiraFetch

export const tesiraApi = {
  // Device management
  listDevices: (): Promise<TesiraDeviceSummary[]> =>
    fetch(`${BASE}/devices`).then((r) => _json<TesiraDeviceSummary[]>(r)),

  listDesigns: (deviceId: string, params?: { includeInactive?: boolean; includeTemplates?: boolean }): Promise<TesiraDesignWorkspaceListResponse> => {
    const search = new URLSearchParams()
    if (params?.includeInactive) search.set('include_inactive', 'true')
    if (params?.includeTemplates === false) search.set('include_templates', 'false')
    const query = search.toString()
    return fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs${query ? `?${query}` : ''}`)
      .then((r) => _json<TesiraDesignWorkspaceListResponse>(r))
  },

  getDesignLibrary: (deviceId: string, profile?: string): Promise<TesiraDesignLibraryResponse> => {
    const search = new URLSearchParams()
    if (profile) search.set('profile', profile)
    const query = search.toString()
    return fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/library${query ? `?${query}` : ''}`)
      .then((r) => _json<TesiraDesignLibraryResponse>(r))
  },

  createDesign: (deviceId: string, body: {
    design_id?: string
    name: string
    description?: string | null
    graph?: TesiraDesignGraph
    is_template?: boolean
    is_active?: boolean
  }): Promise<TesiraDesignMutationResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDesignMutationResponse>(r)),

  getDesign: (deviceId: string, designId: string): Promise<TesiraDesignWorkspaceDetailResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`)
      .then((r) => _json<TesiraDesignWorkspaceDetailResponse>(r)),

  updateDesign: (deviceId: string, designId: string, body: {
    name?: string
    description?: string | null
    graph?: TesiraDesignGraph
    is_template?: boolean
    is_active?: boolean
  }): Promise<TesiraDesignMutationResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDesignMutationResponse>(r)),

  deleteDesign: (deviceId: string, designId: string): Promise<{ ok: boolean; device_id: string; design_id: string }> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`, {
      method: 'DELETE',
    }).then((r) => _json<{ ok: boolean; device_id: string; design_id: string }>(r)),

  validateDesign: (deviceId: string, designId: string, graph?: TesiraDesignGraph): Promise<TesiraDesignValidateResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph ? { graph } : {}),
    }).then((r) => _json<TesiraDesignValidateResponse>(r)),

  compileDesign: (
    deviceId: string,
    designId: string,
    body?: { optimize?: boolean; recompile?: boolean }
  ): Promise<TesiraDesignCompileResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileResponse>(r)),

  recompileDesign: (
    deviceId: string,
    designId: string,
    body?: { optimize?: boolean }
  ): Promise<TesiraDesignCompileResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/recompile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileResponse>(r)),

  compileActiveDesign: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  compileAllDesigns: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean; include_templates?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  compileUncompiledDesigns: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean; include_templates?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-uncompiled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  getDesignDiagnostics: (deviceId: string, designId: string): Promise<TesiraDesignDiagnosticsResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/diagnostics`)
      .then((r) => _json<TesiraDesignDiagnosticsResponse>(r)),

  listLayouts: (params?: { deviceFamily?: string; includeInactive?: boolean }): Promise<TesiraLayoutListResponse> => {
    const search = new URLSearchParams()
    if (params?.deviceFamily) search.set('device_family', params.deviceFamily)
    if (params?.includeInactive) search.set('include_inactive', 'true')
    const query = search.toString()
    return fetch(`${BASE}/layouts${query ? `?${query}` : ''}`).then((r) => _json<TesiraLayoutListResponse>(r))
  },

  getLayout: (layoutId: string, version?: string): Promise<TesiraLayoutArtifact> => {
    const query = version ? `?version=${encodeURIComponent(version)}` : ''
    return fetch(`${BASE}/layouts/${encodeURIComponent(layoutId)}${query}`)
      .then((r) => _json<TesiraLayoutArtifact>(r))
  },

  importLayout: (body: {
    layout_id: string
    version?: string
    name: string
    device_family: string
    channel_profile?: string | null
    required_firmware?: string | null
    checksum: string
    artifact_uri?: string | null
    instance_tag_map?: Record<string, unknown>
    feature_flags?: string[]
    notes?: string | null
    is_active?: boolean
  }): Promise<{ status: string; layout: TesiraLayoutArtifact }> =>
    fetch(`${BASE}/layouts/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<{ status: string; layout: TesiraLayoutArtifact }>(r)),

  getSageVueStatus: (): Promise<TesiraSageVueStatus> =>
    fetch(`${BASE}/sagevue/status`).then((r) => _json<TesiraSageVueStatus>(r)),

  getLayoutManualPackageDownloadUrl: (layoutId: string, version?: string, deviceId?: string): string => {
    const query = new URLSearchParams()
    if (version) query.set('version', version)
    if (deviceId) query.set('device_id', deviceId)
    const suffix = query.toString()
    return `${BASE}/layouts/${encodeURIComponent(layoutId)}/manual-package${suffix ? `?${suffix}` : ''}`
  },

  startDeployment: (deviceId: string, body: {
    layout_id: string
    layout_version?: string
    dry_run?: boolean
    requested_by?: string | null
    rollback_layout_id?: string | null
    rollback_layout_version?: string | null
  }): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDeploymentJob>(r)),

  getDeployment: (jobId: string): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/deployments/${encodeURIComponent(jobId)}`)
      .then((r) => _json<TesiraDeploymentJob>(r)),

  rollbackDeployment: (jobId: string, body?: {
    requested_by?: string | null
    layout_id?: string | null
    layout_version?: string | null
  }): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/deployments/${encodeURIComponent(jobId)}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDeploymentJob>(r)),

  getFleetHealth: (): Promise<TesiraFleetHealth> =>
    fetch(`${BASE}/fleet/health`).then((r) => _json<TesiraFleetHealth>(r)),

  getPtpTopology: (): Promise<TesiraPtpTopologyResponse> =>
    fetch(`${BASE}/fleet/ptp-topology`).then((r) => _json<TesiraPtpTopologyResponse>(r)),

  getDevice: (deviceId: string): Promise<TesiraDeviceDetail> =>
    fetch(`${BASE}/devices/${deviceId}`).then((r) => _json<TesiraDeviceDetail>(r)),

  getCapabilities: (deviceId: string): Promise<TesiraCapabilityEnvelope> =>
    fetch(`${BASE}/devices/${deviceId}/capabilities`).then((r) => _json<TesiraCapabilityEnvelope>(r)),

  connectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/connect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  disconnectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/disconnect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  sendCommand: (deviceId: string, command: string): Promise<TesiraRawCommandResponse> =>
    fetch(`${BASE}/devices/${deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    }).then((r) => _json<TesiraRawCommandResponse>(r)),

  getFaults: (deviceId: string): Promise<{ device_id: string; faults: string[] }> =>
    fetch(`${BASE}/devices/${deviceId}/faults`).then((r) => _json<{ device_id: string; faults: string[] }>(r)),

  // Level / mute
  getLevel: (deviceId: string, tag: string, channel: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/level/${tag}/${channel}`).then((r) => _json<TesiraMutationResponse>(r)),

  setLevel: (deviceId: string, tag: string, channel: number, levelDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/level/${tag}/${channel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level_db: levelDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getMute: (deviceId: string, tag: string, channel: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/mute/${tag}/${channel}`).then((r) => _json<TesiraMutationResponse>(r)),

  setMute: (deviceId: string, tag: string, channel: number, muted: boolean): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/mute/${tag}/${channel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Crosspoint
  setCrosspoint: (deviceId: string, tag: string, row: number, col: number, gainDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, gain_db: gainDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getCrosspointMatrix: (deviceId: string, tag: string, rows: number, cols: number): Promise<TesiraCrosspointMatrix> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}?rows=${rows}&cols=${cols}`)
      .then((r) => _json<TesiraCrosspointMatrix>(r)),

  setCrosspointMute: (deviceId: string, tag: string, row: number, col: number, muted: boolean): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, muted }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // DSP model
  probeDspBlocks: (deviceId: string, maxInstances: number = 32): Promise<TesiraDspProbeResult> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/probe?max_instances=${maxInstances}`, { method: 'POST' })
      .then((r) => _json<TesiraDspProbeResult>(r)),

  listDspBlocks: (deviceId: string): Promise<TesiraDspBlockListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/blocks`).then((r) => _json<TesiraDspBlockListResponse>(r)),

  getDspBlock: (deviceId: string, instanceTag: string): Promise<{ device_id: string } & TesiraDspBlock> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/blocks/${encodeURIComponent(instanceTag)}`)
      .then((r) => _json<{ device_id: string } & TesiraDspBlock>(r)),

  getDspParams: (deviceId: string, instanceTag: string): Promise<TesiraDspParamsResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/${encodeURIComponent(instanceTag)}/params`)
      .then((r) => _json<TesiraDspParamsResponse>(r)),

  setDspParam: (
    deviceId: string,
    instanceTag: string,
    attribute: string,
    value: unknown,
    args: unknown[] = [],
  ): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/${encodeURIComponent(instanceTag)}/params`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribute, value, args }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  dspBulkGet: (deviceId: string, operations: TesiraDspBulkOperation[]): Promise<{ device_id: string; count: number; results: TesiraDspBulkResult[] }> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/bulk-get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    }).then((r) => _json<{ device_id: string; count: number; results: TesiraDspBulkResult[] }>(r)),

  dspBulkSet: (deviceId: string, operations: TesiraDspBulkOperation[]): Promise<{ device_id: string; count: number; results: TesiraDspBulkResult[] }> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/bulk-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    }).then((r) => _json<{ device_id: string; count: number; results: TesiraDspBulkResult[] }>(r)),

  // EQ
  setEQBandFreq: (deviceId: string, tag: string, band: number, freqHz: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/freq`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freq_hz: freqHz }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  setEQBandGain: (deviceId: string, tag: string, band: number, gainDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/gain`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gain_db: gainDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  setEQBandQ: (deviceId: string, tag: string, band: number, q: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/q`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Presets
  listPresets: (deviceId: string): Promise<TesiraPresetInfo[]> =>
    fetch(`${BASE}/devices/${deviceId}/presets`).then((r) => _json<TesiraPresetInfo[]>(r)),

  recallPreset: (deviceId: string, presetIndex: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/presets/${presetIndex}/recall`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),

  // AVB
  getAvbStreams: (deviceId: string): Promise<TesiraStreamInfo[]> =>
    fetch(`${BASE}/devices/${deviceId}/avb/streams`).then((r) => _json<TesiraStreamInfo[]>(r)),

  getPtp: (deviceId: string): Promise<TesiraPTPStatus> =>
    fetch(`${BASE}/devices/${deviceId}/avb/ptp`).then((r) => _json<TesiraPTPStatus>(r)),

  // Metering
  getMeters: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}`).then((r) => _json<TesiraMutationResponse>(r)),

  getMeterHistory: (deviceId: string, tag: string, limit: number = 300): Promise<TesiraMeterHistoryResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${encodeURIComponent(tag)}/history?limit=${limit}`)
      .then((r) => _json<TesiraMeterHistoryResponse>(r)),

  getMeterPeak: (deviceId: string, tag: string): Promise<TesiraMeterPeakResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${encodeURIComponent(tag)}/peak`)
      .then((r) => _json<TesiraMeterPeakResponse>(r)),

  startMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/start`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  stopMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/stop`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  // GPIO
  listGpio: (deviceId: string): Promise<TesiraGpioListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/gpio`).then((r) => _json<TesiraGpioListResponse>(r)),

  getGpioPin: (deviceId: string, pin: number): Promise<{ device_id: string; pin: number; state: boolean }> =>
    fetch(`${BASE}/devices/${deviceId}/gpio/${pin}`).then((r) => _json<{ device_id: string; pin: number; state: boolean }>(r)),

  setGpioPin: (deviceId: string, pin: number, state: boolean): Promise<{ ok: boolean; device_id: string; pin: number; state: boolean }> =>
    fetch(`${BASE}/devices/${deviceId}/gpio/${pin}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).then((r) => _json<{ ok: boolean; device_id: string; pin: number; state: boolean }>(r)),

  // Scene snapshots
  captureScene: (deviceId: string, name: string): Promise<{ ok: boolean; device_id: string; scene_id: string; name: string; block_count: number }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => _json<{ ok: boolean; device_id: string; scene_id: string; name: string; block_count: number }>(r)),

  listScenes: (deviceId: string): Promise<TesiraSceneListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/scenes`).then((r) => _json<TesiraSceneListResponse>(r)),

  getScene: (deviceId: string, sceneId: string): Promise<TesiraSceneDetail> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}`).then((r) => _json<TesiraSceneDetail>(r)),

  recallScene: (deviceId: string, sceneId: string): Promise<{ ok: boolean; device_id: string; scene_id: string; applied: number; failed: string[] }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}/recall`, { method: 'POST' })
      .then((r) => _json<{ ok: boolean; device_id: string; scene_id: string; applied: number; failed: string[] }>(r)),

  deleteScene: (deviceId: string, sceneId: string): Promise<{ ok: boolean; device_id: string; scene_id: string }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}`, { method: 'DELETE' })
      .then((r) => _json<{ ok: boolean; device_id: string; scene_id: string }>(r)),

  // Preset interlock
  listInterlockRules: (): Promise<PresetInterlockRule[]> =>
    fetch(`${BASE}/preset_interlock`).then((r) => _json<PresetInterlockRule[]>(r)),

  addInterlockRule: (body: { map2_preset_id: number; tesira_device_id: string; tesira_preset_index: number }): Promise<PresetInterlockRule> =>
    fetch(`${BASE}/preset_interlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<PresetInterlockRule>(r)),

  deleteInterlockRule: (ruleId: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/preset_interlock/${ruleId}`, { method: 'DELETE' }).then((r) => _json<TesiraMutationResponse>(r)),

  // Auto-discovery
  startDiscovery: (timeoutS: number = 8): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/discovery/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout_s: timeoutS }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getDiscoveryStatus: (): Promise<DiscoveryScanStatus> =>
    fetch(`${BASE}/discovery/status`).then((r) => _json<DiscoveryScanStatus>(r)),

  adoptDevice: (host: string, name?: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/discovery/adopt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, name }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  /**
   * Manually add a device by IP — no TTP probe required.
   * Device appears Offline until TTP is enabled in Tesira Software.
   */
  addDevice: (host: string, port: number = 23, name?: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, name }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Firmware management
  getLatestFirmware: (): Promise<TesiraLatestFirmware> =>
    fetch(`${BASE}/firmware/latest`).then((r) => _json<TesiraLatestFirmware>(r)),

  getDeviceFirmware: (deviceId: string): Promise<TesiraFirmwareStatus> =>
    fetch(`${BASE}/devices/${deviceId}/firmware`).then((r) => _json<TesiraFirmwareStatus>(r)),

  rebootDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/reboot`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),

  reconnectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/reconnect`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),
}
