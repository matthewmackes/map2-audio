// ============================================================================
// MAP2 Audio Platform - REST API Client
// Provides type-safe access to all MAP2 FastAPI endpoints
// ============================================================================

import type {
  AudioStatus,
  AudioLevels,
  PluginLevels,
  Chain,
  EffectsLoop,
  LoopInsertion,
  ChainTemplate,
  Plugin,
  Preset,
  PresetCategory,
  CreatePresetRequest,
  MIDIDevice,
  MIDIMapping,
  MIDIMappingV2,
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
  PresetsResponse,
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
  DiscoveryScanStatus,
  PresetInterlockRule,
  TesiraDeviceDetail,
  TesiraDeviceSummary,
  TesiraPTPStatus,
  TesiraPresetInfo,
  TesiraStreamInfo,
} from '../app/components/Tesira/types';

const RAW_API_BASE = (() => {
  // Check for explicit environment variable
  const envBase = import.meta.env.VITE_API_BASE as string | undefined
  if (envBase) return envBase

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port

  // On localhost, /api works via the Vite dev server proxy (3001), the
  // port-80 reverse proxy, or direct 8080 access.
  if (isLocalhost) {
    return '/api'
  }

  // Port 80 is reverse-proxied to 8080, so relative /api works there too.
  // Port 8080 is the backend itself — relative /api also works.
  if (port === '' || port === '80' || port === '8080') {
    return '/api'
  }

  // For any other port on a remote host (e.g., the static "serve" on 3000,
  // or the Vite dev server on 3001), call the backend on port 8080 directly.
  return `http://${window.location.hostname}:8080/api`
})()
export const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE

/**
 * Get the WebSocket base URL that correctly targets the backend.
 * Mirrors the API_BASE logic: on port 80/8080/localhost use relative ws,
 * on any other port (3000, 3001) target ws://hostname:8080 directly.
 */
export function getWsBaseUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const hostname = window.location.hostname
  const port = window.location.port
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  if (isLocalhost || port === '' || port === '80' || port === '8080') {
    return `${protocol}//${window.location.host}`
  }
  // Port 3000/3001 or other dev ports — connect directly to backend
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
  async queueUpdate(pluginUri: string, paramIndex: number, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Replace any existing update for the same parameter
      const existingIndex = this.queue.findIndex(
        (u) => u.plugin_uri === pluginUri && u.param_index === paramIndex
      );
      if (existingIndex >= 0) {
        this.queue[existingIndex].value = value;
      } else {
        this.queue.push({
          plugin_uri: pluginUri,
          param_index: paramIndex,
          value,
        });
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
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
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

  return response.json();
}

// ==================== Audio API ====================

export const audioApi = {
  getStatus: () => fetchJson<AudioStatus>(`${API_BASE}/audio/status`),

  start: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/start`, { method: 'POST' }),

  stop: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/stop`, { method: 'POST' }),

  getLatency: () => fetchJson<{ latency_ms: number }>(`${API_BASE}/audio/latency`),

  getLevels: () => fetchJson<AudioLevels>(`${API_BASE}/audio/levels`),

  getPluginLevels: () => fetchJson<{ plugins: PluginLevels[] }>(`${API_BASE}/audio/levels/plugins`),

  getPipedalMetrics: () => fetchJson<Record<string, unknown>>(`${API_BASE}/audio/pipedal`),

  configure: (config: { sampleRate?: number; bufferSize?: number }) => {
    const params = new URLSearchParams();
    if (config.sampleRate) params.append('sample_rate', config.sampleRate.toString());
    if (config.bufferSize) params.append('buffer_size', config.bufferSize.toString());
    return fetchJson<{
      success: boolean;
      message: string;
      updated_settings: Record<string, number>;
      current_config: { sample_rate: number; buffer_size: number; cpu_load: number };
    }>(`${API_BASE}/audio/config?${params.toString()}`, { method: 'POST' });
  },

  restart: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/restart`, { method: 'POST' }),

  getHealth: () => fetchJson<AudioHealth>(`${API_BASE}/audio/health`),

  getXruns: () => fetchJson<XrunStats>(`${API_BASE}/audio/health/xruns`),

  getSignalStatus: () => fetchJson<SignalStatus>(`${API_BASE}/audio/health/signal`),

  getBufferPresets: () => fetchJson<BufferPreset[]>(`${API_BASE}/audio/buffer-presets`),

  getJuceMetrics: () => fetchJson<JuceMetrics>(`${API_BASE}/audio/juce`),

  unmute: () => fetchJson<{ success: boolean }>(`${API_BASE}/audio/health/unmute`, { method: 'POST' }),

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
  runLoopbackTest: () =>
    fetchJson<DiagnosticResult>(`${API_BASE}/audio/test`, { method: 'POST' }),

  // Get ALSA device info
  getAlsaInfo: () => fetchJson<AlsaDeviceInfo>(`${API_BASE}/audio/alsa/info`),

  // Reset ALSA state
  resetAlsaState: () =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/alsa/reset`, { method: 'POST' }),

  // Enumerate USB devices
  getUsbDevices: () => fetchJson<UsbDevice[]>(`${API_BASE}/usb/devices/list`),

  // Reset USB device
  resetUsbDevice: (deviceId: string) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/usb/reset/${deviceId}`, { method: 'POST' }),

  // Run full diagnostic suite
  runFullDiagnostic: () =>
    fetchJson<FullDiagnosticResult>(`${API_BASE}/audio/diagnostics/full`, { method: 'POST' }),

  // Clear XRun counter
  clearXruns: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/audio/health/xruns/clear`, { method: 'POST' }),

  // Test specific sample rate
  testSampleRate: (rate: number) =>
    fetchJson<DiagnosticResult>(`${API_BASE}/audio/test/sample-rate?rate=${rate}`, { method: 'POST' }),

  // Test buffer stability
  testBufferStability: (bufferSize: number, duration: number) =>
    fetchJson<BufferStabilityResult>(
      `${API_BASE}/audio/test/buffer-stability?buffer_size=${bufferSize}&duration=${duration}`,
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
  list: () => fetchJson<ChainsResponse>(`${API_BASE}/chains/`),

  get: (chainId: number) => fetchJson<Chain>(`${API_BASE}/chains/${chainId}`),

  create: (name: string) =>
    fetchJson<Chain>(`${API_BASE}/chains/`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  delete: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}`, {
      method: 'DELETE',
    }),

  rename: (chainId: number, newName: string) =>
    fetchJson<{ status: string; chain_id: number; name: string }>(
      `${API_BASE}/chains/${chainId}/rename?new_name=${encodeURIComponent(newName)}`,
      { method: 'PUT' }
    ),

  activate: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}/activate`, {
      method: 'POST',
    }),

  deactivate: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}/deactivate`, {
      method: 'POST',
    }),

  addPlugin: (chainId: number, pluginUri: string) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; plugins_count: number }>(
      `${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`,
      { method: 'POST' }
    ),

  removePlugin: (chainId: number, pluginUri: string) =>
    fetchJson<{ status: string; chain_id: number }>(
      `${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`,
      { method: 'DELETE' }
    ),

  reorderPlugins: (chainId: number, pluginUris: string[]) =>
    fetchJson<{ status: string; chain_id: number; plugins: string[] }>(
      `${API_BASE}/chains/${chainId}/reorder`,
      {
        method: 'POST',
        body: JSON.stringify(pluginUris),
      }
    ),

  togglePluginBypass: (chainId: number, pluginUri: string, bypass: boolean) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; bypass: boolean }>(
      `${API_BASE}/chains/${chainId}/plugins/${encodeURIComponent(pluginUri)}/bypass?bypass=${bypass}`,
      { method: 'POST' }
    ),

  savePreset: (chainId: number, presetName: string) =>
    fetchJson<{ status: string; preset_id: number; name: string }>(
      `${API_BASE}/chains/${chainId}/preset/save?preset_name=${encodeURIComponent(presetName)}`,
      { method: 'POST' }
    ),

  listPresets: () => fetchJson<{ presets: Preset[]; count: number }>(`${API_BASE}/chains/presets`),

  loadPreset: (presetId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/preset/${presetId}/load`, {
      method: 'POST',
    }),

  deletePreset: (presetId: number) =>
    fetchJson<{ status: string; preset_id: number }>(`${API_BASE}/chains/preset/${presetId}`, {
      method: 'DELETE',
    }),

  listTemplates: () => fetchJson<{ templates: ChainTemplate[]; count: number }>(`${API_BASE}/chains/templates/list`),

  loadTemplate: (templateName: string) =>
    fetchJson<{ status: string; chain: Chain }>(
      `${API_BASE}/chains/templates/load?template_name=${encodeURIComponent(templateName)}`,
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
  list: () =>
    fetchJson<{ loops: EffectsLoop[]; count: number }>(`${API_BASE}/effects-loops`),

  create: (payload: Partial<EffectsLoop> & { name: string; channels: number; topology: string }) =>
    fetchJson<EffectsLoop>(`${API_BASE}/effects-loops`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  get: (loopId: string) =>
    fetchJson<EffectsLoop>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`),

  patch: (loopId: string, payload: Partial<EffectsLoop>) =>
    fetchJson<EffectsLoop>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (loopId: string) =>
    fetchJson<{ status: string; loop_id: string }>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}`, {
      method: 'DELETE',
    }),

  activate: (loopId: string, payload: { audition_mode?: boolean } = {}) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/activate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bypass: (loopId: string, bypass: boolean) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/bypass`, {
      method: 'POST',
      body: JSON.stringify({ bypass }),
    }),

  calibrate: (loopId: string, options: Record<string, unknown> = {}) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/calibrate`, {
      method: 'POST',
      body: JSON.stringify({ options }),
    }),

  getMetrics: (loopId: string) =>
    fetchJson<LoopMetrics>(`${API_BASE}/effects-loops/${encodeURIComponent(loopId)}/metrics`),

  listTemplates: () =>
    fetchJson<{ templates: TesiraLoopTemplate[]; count: number }>(`${API_BASE}/tesira/loop-templates`),

  upsertTemplate: (templateId: string, payload: Omit<TesiraLoopTemplate, 'template_id' | 'validation_status' | 'validation_error' | 'created_at' | 'updated_at'>) =>
    fetchJson<TesiraLoopTemplate>(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  validateTemplate: (templateId: string) =>
    fetchJson<Record<string, unknown>>(`${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/validate`, {
      method: 'POST',
    }),

  getTemplateRuntimeStatus: (templateId: string) =>
    fetchJson<{ template_id: string; tesira_device_id: string; runtime_status: TesiraTemplateRuntimeStatus }>(
      `${API_BASE}/tesira/loop-templates/${encodeURIComponent(templateId)}/runtime-status`
    ),

  listChainInsertions: (chainId: number) =>
    fetchJson<{ chain_id: number; loop_insertions: LoopInsertion[]; effects_loops: EffectsLoop[]; count: number }>(
      `${API_BASE}/chains/${chainId}/loops`
    ),

  insertChainLoop: (chainId: number, payload: Partial<LoopInsertion> & { loop_id: string; slot_index: number }) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion; effects_loop: EffectsLoop }>(
      `${API_BASE}/chains/${chainId}/loops/insert`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  patchChainLoop: (chainId: number, insertionId: string, payload: Partial<LoopInsertion>) =>
    fetchJson<{ chain_id: number; insertion: LoopInsertion }>(
      `${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  deleteChainLoop: (chainId: number, insertionId: string) =>
    fetchJson<{ status: string; chain_id: number; insertion_id: string }>(
      `${API_BASE}/chains/${chainId}/loops/${encodeURIComponent(insertionId)}`,
      { method: 'DELETE' }
    ),
};

// ==================== Plugins API ====================

export interface PluginDiscoverResponse extends PluginsResponse {
  cached?: boolean;
  warning?: string;
  error?: string;
}

export const pluginsApi = {
  discover: (refresh = false) =>
    fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/discover${refresh ? '?refresh=true' : ''}`),

  refresh: () =>
    fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/refresh`, { method: 'POST' }),

  clearCache: () =>
    fetchJson<{ status: string; plugins_cleared: number }>(`${API_BASE}/plugins/cache`, { method: 'DELETE' }),

  list: () => fetchJson<{ loaded: Plugin[]; count: number }>(`${API_BASE}/plugins/list`),

  load: (uri: string) =>
    fetchJson<{ status: string; plugin: Plugin }>(`${API_BASE}/plugins/load?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    }),

  unload: (uri: string) =>
    fetchJson<{ status: string; uri: string }>(`${API_BASE}/plugins/unload?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    }),

  delete: (uri: string) =>
    fetchJson<{ status: string; uri: string; path: string; removed: number }>(
      `${API_BASE}/plugins/${encodeURIComponent(uri)}`,
      { method: 'DELETE' }
    ),

  getParameters: (uri: string) =>
    fetchJson<{ uri: string; parameters: unknown[] }>(`${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters`),

  setParameter: (uri: string, paramIndex: number, value: number) =>
    fetchJson<{ uri: string; param: number; value: number }>(
      `${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters/${paramIndex}?value=${value}`,
      { method: 'POST' }
    ),

  /**
   * Queue a parameter update for batched sending.
   * Multiple rapid parameter updates are combined into a single API call.
   * Ideal for real-time knob/slider adjustments.
   */
  setParameterBatched: (uri: string, paramIndex: number, value: number) =>
    parameterBatcher.queueUpdate(uri, paramIndex, value),

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
  batchSetParameters: (updates: Array<{ uri: string; paramIndex: number; value: number }>) =>
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
        })),
      }),
    }),
};

// ==================== Presets API ====================

export const presetsApi = {
  list: (options?: { category?: string; tags?: string; favorites_only?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.tags) params.set('tags', options.tags);
    if (options?.favorites_only) params.set('favorites_only', 'true');
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson<PresetsResponse>(`${API_BASE}/presets/${query ? `?${query}` : ''}`);
  },

  create: (request: CreatePresetRequest) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(`${API_BASE}/presets/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (
    presetId: number,
    updates: { name?: string; tags?: string[]; category?: string; description?: string; is_favorite?: boolean }
  ) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/presets/${presetId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (presetId: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/presets/${presetId}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (presetId: number) =>
    fetchJson<{ status: string; is_favorite: boolean; message: string }>(
      `${API_BASE}/presets/${presetId}/favorite`,
      { method: 'POST' }
    ),

  getCategories: () => fetchJson<{ categories: PresetCategory[]; count: number }>(`${API_BASE}/presets/categories`),

  getTags: () => fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/presets/tags`),
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

// ==================== IR API ====================

export const irApi = {
  getStatus: () => fetchJson<IRStatus>(`${API_BASE}/ir/`),

  listCabinets: () => fetchJson<IRsResponse>(`${API_BASE}/ir/cabinets`),

  listReverbs: () => fetchJson<IRsResponse>(`${API_BASE}/ir/reverbs`),

  loadCabinet: (irName: string) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      `${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`,
      { method: 'POST' }
    ),

  loadReverb: (irName: string) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      `${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`,
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
  getStatus: () => fetchJson<NAMStatus>(`${API_BASE}/nam/status`),

  getCategories: () => fetchJson<NAMCategoriesResponse>(`${API_BASE}/nam/categories`),

  listModels: (params?: NAMListParams) => {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    if (params?.category) searchParams.set('category', params.category)
    if (params?.amp_type) searchParams.set('amp_type', params.amp_type)
    if (params?.favorites_only) searchParams.set('favorites_only', 'true')
    const query = searchParams.toString()
    return fetchJson<NAMModelsResponse>(`${API_BASE}/nam/models${query ? `?${query}` : ''}`)
  },

  getModel: (modelId: number) =>
    fetchJson<NAMModelDetail>(`${API_BASE}/nam/models/${modelId}`),

  search: (request: NAMSearchRequest) =>
    fetchJson<{ results: NAMModelDetail[]; count: number }>(`${API_BASE}/nam/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  loadModel: (modelName: string) =>
    fetchJson<{ status: string; model: string }>(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, {
      method: 'POST',
    }),

  activateModel: (modelName: string) =>
    fetchJson<{ status: string; model: string }>(
      `${API_BASE}/nam/models/${encodeURIComponent(modelName)}/activate`,
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
  deleteModel: (modelName: string) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/nam/models/${encodeURIComponent(modelName)}`,
      { method: 'DELETE' }
    ),
};

// ==================== SoundFont API ====================

import type {
  SoundFontListResponse,
  SoundFontLibrariesResponse,
  SoundFontCategoriesResponse,
  FileDownloadTask,
} from '../app/types/library'

export const soundfontApi = {
  listSoundfonts: (params?: { limit?: number; offset?: number; category?: string; format?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.format) query.set('format', params.format)
    const queryString = query.toString()
    return fetchJson<SoundFontListResponse>(`${API_BASE}/soundfonts/${queryString ? `?${queryString}` : ''}`)
  },

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
  last_error: string
  warnings: string[]
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

  loadSfz: (partIndex: number, sfzPath: string) =>
    fetchJson<{ status: string; part_index: number; sample_status: SynthForgeSampleStatus }>(
      `${API_BASE}/synthforge/sfz/load`,
      { method: 'POST', body: JSON.stringify({ part_index: partIndex, sfz_path: sfzPath }) }
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
  getHostMachineInfo: () => fetchJson<HostMachineInfo>(`${API_BASE}/system/host-machine-info`),

  getDiskHealth: () => fetchJson<DiskHealthData>(`${API_BASE}/system/disk-health`),

  getHealthOverview: () => fetchJson<SystemHealthOverview>(`${API_BASE}/system/health-overview`),

  getBrandingAssets: () => fetchJson<BrandingAssets>(`${API_BASE}/system/branding-assets`),
};

// ==================== Health API ====================

export const healthApi = {
  check: () => fetchJson<{ status: string }>(`${API_BASE}/health`),
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
  }) => {
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
    }>(`${API_BASE}/plugin-presets/${query ? `?${query}` : ''}`);
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
  getDisplayPaths: () => fetchJson<DisplayPaths>(`${API_BASE}/folders/display-paths`),

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

  scanAll: () =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(`${API_BASE}/folders/scan/all`, {
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
  list: () =>
    fetchJson<{
      snapshots: FlowSnapshot[];
      count: number;
      active_id: number | null;
    }>(`${API_BASE}/flow-snapshots`),

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
    }
  ) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/flow-snapshots/${snapshotId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  /**
   * Delete a flow snapshot
   */
  delete: (snapshotId: number) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/flow-snapshots/${snapshotId}`,
      { method: 'DELETE' }
    ),

  /**
   * Load/activate a snapshot
   */
  load: (snapshotId: number) =>
    fetchJson<{
      status: string;
      snapshot_id: number;
      name: string;
      snapshot_data: FlowSnapshotData;
    }>(`${API_BASE}/flow-snapshots/${snapshotId}/load`, { method: 'POST' }),

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
  getStatus: () =>
    fetchJson<import('./types').PipeWireMetrics>(`${API_BASE}/pipewire/status`),

  /** PipeWire daemon info */
  getDaemon: () =>
    fetchJson<import('./types').PipeWireDaemonInfo>(`${API_BASE}/pipewire/daemon`),

  /** List audio devices */
  getDevices: () =>
    fetchJson<{ devices: import('./types').PipeWireDeviceInfo[] }>(`${API_BASE}/pipewire/devices`),

  /** List sink/source nodes */
  getNodes: () =>
    fetchJson<{ nodes: import('./types').PipeWireNodeInfo[] }>(`${API_BASE}/pipewire/nodes`),

  /** List active streams */
  getStreams: () =>
    fetchJson<{ streams: import('./types').PipeWireStreamInfo[] }>(`${API_BASE}/pipewire/streams`),

  /** List graph links */
  getLinks: () =>
    fetchJson<{ links: import('./types').PipeWireLinkInfo[] }>(`${API_BASE}/pipewire/links`),

  /** List connected clients */
  getClients: () =>
    fetchJson<{ clients: { id: number; name: string; info: string }[] }>(`${API_BASE}/pipewire/clients`),

  /** Get clock settings */
  getSettings: () =>
    fetchJson<import('./types').PipeWireSettings>(`${API_BASE}/pipewire/settings`),

  /** Get latency breakdown */
  getLatency: () =>
    fetchJson<{ graph_latency_ms: number; driver_latency_ms: number; total_latency_ms: number; settings: import('./types').PipeWireSettings }>(`${API_BASE}/pipewire/latency`),

  /** Set DSP quantum (buffer period). 0 = automatic. */
  setQuantum: (quantum: number) =>
    fetchJson<{ success: boolean; quantum: number; settings: import('./types').PipeWireSettings }>(
      `${API_BASE}/pipewire/quantum`, { method: 'POST', body: JSON.stringify({ quantum }) }
    ),

  /** Set forced sample rate. 0 = automatic. */
  setRate: (rate: number) =>
    fetchJson<{ success: boolean; rate: number; settings: import('./types').PipeWireSettings }>(
      `${API_BASE}/pipewire/rate`, { method: 'POST', body: JSON.stringify({ rate }) }
    ),

  /** Get volume/mute for a node */
  getVolume: (nodeId: number) =>
    fetchJson<{ node_id: number; volume: number; muted: boolean }>(`${API_BASE}/pipewire/volume/${nodeId}`),

  /** Set volume for a node */
  setVolume: (nodeId: number, volume: number) =>
    fetchJson<{ success: boolean; node_id: number; volume: number }>(
      `${API_BASE}/pipewire/volume`, { method: 'POST', body: JSON.stringify({ node_id: nodeId, volume }) }
    ),

  /** Set mute state for a node */
  setMute: (nodeId: number, mute: boolean) =>
    fetchJson<{ success: boolean; node_id: number; mute: boolean }>(
      `${API_BASE}/pipewire/mute`, { method: 'POST', body: JSON.stringify({ node_id: nodeId, mute }) }
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
  updateState: (state: Partial<import('./types').DrumMachineState>) =>
    fetchJson<{ status: string; state: import('./types').DrumMachineState }>(`${API_BASE}/engine/drums/state`, {
      method: 'POST', body: JSON.stringify(state),
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
  chains: chainsApi,
  plugins: pluginsApi,
  presets: presetsApi,
  pluginPresets: pluginPresetsApi,
  midi: midiApi,
  midiV2: midiApiV2,
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
  if (!res.ok) throw new Error(`Tesira API ${res.status}: ${res.statusText}`)
  return res.json()
}

type TesiraMutationResponse = {
  success?: boolean;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

export const tesiraApi = {
  // Device management
  listDevices: (): Promise<TesiraDeviceSummary[]> =>
    fetch(`${BASE}/devices`).then((r) => _json<TesiraDeviceSummary[]>(r)),

  getDevice: (deviceId: string): Promise<TesiraDeviceDetail> =>
    fetch(`${BASE}/devices/${deviceId}`).then((r) => _json<TesiraDeviceDetail>(r)),

  connectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/connect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  disconnectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/disconnect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

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

  startMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/start`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  stopMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/stop`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

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
}
